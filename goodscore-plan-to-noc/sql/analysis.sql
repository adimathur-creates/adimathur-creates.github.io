-- Plan to NOC: where GoodScore's overdue-resolution funnel leaks
-- Engine: DuckDB. Each block starts with "-- name:" so analyze.py can run it and the page can show it.
-- Cohort: overdue accounts detected 1 Jan - 30 Apr 2026. As-of date: 10 Nov 2026.

-- name: base
CREATE OR REPLACE VIEW acct AS
WITH p AS (
  SELECT *, first_due_date + to_months(tenure_months - 1) AS final_due_date FROM plans
),
first_inst AS (
  SELECT account_id, status <> 'missed' AS first_paid FROM instalments WHERE inst_no = 1
)
SELECT a.*, u.city_tier, u.income_known, u.income_source, u.payday_dom,
       o.account_id IS NOT NULL                       AS offered,
       o.waiver_pct, o.settlement_amount,
       p.account_id IS NOT NULL                       AS accepted,
       p.plan_type, p.tenure_months, p.instalment, p.first_due_date, p.final_due_date, p.autopay_mandate,
       p.instalment / u.income_known                  AS emi_to_income,
       ((day(p.first_due_date) - u.payday_dom + 30) % 30) AS days_after_payday,
       COALESCE(f.first_paid, false)                  AS first_paid,
       c.account_id IS NOT NULL                       AS paid_off,
       c.payment_completed_at, c.noc_issued_at, c.bureau_reflected_at, c.bureau_status, c.score_delta_90d,
       p.final_due_date <= DATE '2026-11-10' - INTERVAL 30 DAY AS could_finish   -- plan's last due date has passed
FROM overdue_accounts a
JOIN users u USING (user_id)
LEFT JOIN offers o USING (account_id)
LEFT JOIN p USING (account_id)
LEFT JOIN first_inst f USING (account_id)
LEFT JOIN closures c USING (account_id);

-- name: funnel
-- One row per stage, per 100 detected accounts. Plans that could not have finished yet are excluded
-- from the denominator from "paid off" onwards, so long plans don't look like failures.
WITH s AS (
  SELECT count(*)                                                     AS detected,
         count(*) FILTER (offered)                                    AS offered,
         count(*) FILTER (accepted)                                   AS accepted,
         count(*) FILTER (accepted AND first_paid)                    AS first_paid,
         count(*) FILTER (accepted AND could_finish)                  AS could_finish,
         count(*) FILTER (paid_off AND could_finish)                  AS paid_off,
         count(*) FILTER (noc_issued_at IS NOT NULL AND could_finish) AS noc,
         count(*) FILTER (bureau_reflected_at IS NOT NULL AND could_finish) AS reflected,
         count(*) FILTER (bureau_reflected_at <= payment_completed_at + INTERVAL 45 DAY AND could_finish) AS reflected_45d
  FROM acct
)
SELECT * FROM s;

-- name: emi_completion_by_affordability
-- EMI plans whose last instalment is due: completion by EMI-to-income band and by where the first due date fell.
SELECT CASE WHEN emi_to_income < 0.15 THEN 'a <15%'  WHEN emi_to_income < 0.25 THEN 'b 15-25%'
            WHEN emi_to_income < 0.35 THEN 'c 25-35%' ELSE 'd 35%+' END        AS emi_band,
       days_after_payday <= 5                                                  AS due_soon_after_payday,
       count(*)                                                                AS plans,
       round(avg(paid_off::int), 3)                                            AS completion
FROM acct WHERE plan_type = 'emi' AND could_finish
GROUP BY ALL ORDER BY ALL;

-- name: completion_by_income_source
-- The current sizing rule (EMI <= 35% of known income) trusts typed income as much as salary SMS.
SELECT income_source, count(*) AS plans,
       round(avg(emi_to_income), 3)  AS emi_to_income_as_seen,
       round(avg(first_paid::int), 3) AS first_instalment_paid,
       round(avg(paid_off::int), 3)  AS completion
FROM acct WHERE plan_type = 'emi' AND could_finish
GROUP BY ALL ORDER BY ALL;

-- name: completion_by_payday_gap
SELECT CASE WHEN days_after_payday <= 5 THEN '0-5 days after payday'
            WHEN days_after_payday <= 15 THEN '6-15 days after'
            ELSE '16-29 days after (pre-payday)' END AS first_due_lands,
       count(*) AS plans,
       round(avg(first_paid::int), 3) AS first_instalment_paid,
       round(avg(paid_off::int), 3)  AS completion
FROM acct WHERE accepted AND could_finish
GROUP BY ALL ORDER BY ALL;

-- name: completion_by_mandate
SELECT plan_type, autopay_mandate, count(*) AS plans, round(avg(paid_off::int), 3) AS completion
FROM acct WHERE accepted AND could_finish GROUP BY ALL ORDER BY ALL;

-- name: emi_survival
-- Share of EMI plans still alive after each instalment (plans that broke are out; plans still running are censored).
WITH e AS (
  SELECT i.account_id, i.inst_no, i.status, a.income_source, a.tenure_months
  FROM instalments i JOIN acct a USING (account_id) WHERE a.plan_type = 'emi'
),
broke AS (SELECT account_id, min(inst_no) AS broke_at FROM e WHERE status = 'missed' GROUP BY 1),
last_seen AS (SELECT account_id, income_source, max(inst_no) AS last_inst FROM e GROUP BY 1, 2),
k AS (SELECT unnest(range(1, 7)) AS inst_no),
risk AS (
  SELECT k.inst_no, l.income_source,
         count(*) FILTER (l.last_inst >= k.inst_no)                                   AS at_risk,
         count(*) FILTER (b.broke_at = k.inst_no)                                     AS broke
  FROM k CROSS JOIN last_seen l LEFT JOIN broke b USING (account_id)
  GROUP BY 1, 2
)
SELECT inst_no, income_source, at_risk, broke,
       round(exp(sum(ln(1 - broke / at_risk)) OVER (PARTITION BY income_source ORDER BY inst_no)), 3) AS still_alive
FROM risk WHERE at_risk > 0 ORDER BY income_source, inst_no;

-- name: lag_by_lender_type
-- After the user has paid everything: how long until the lender's NOC, and until the bureau shows it.
SELECT lender_type, count(*) AS paid_off,
       round(avg((noc_issued_at IS NULL)::int), 3)                                       AS no_noc_yet,
       median(noc_issued_at - payment_completed_at)                                      AS median_days_to_noc,
       median(bureau_reflected_at - payment_completed_at)                                AS median_days_to_bureau,
       round(avg((bureau_reflected_at IS NULL
                  OR bureau_reflected_at > payment_completed_at + INTERVAL 45 DAY)::int), 3) AS not_visible_by_day_45
FROM acct WHERE paid_off AND payment_completed_at <= DATE '2026-11-10' - INTERVAL 45 DAY
GROUP BY ALL ORDER BY not_visible_by_day_45 DESC;

-- name: visibility_curve
-- Of accounts paid off at least 120 days ago: share already showing on the bureau report, by days since the last payment.
WITH p AS (
  SELECT lender_type, date_diff('day', payment_completed_at, bureau_reflected_at) AS d
  FROM acct WHERE paid_off AND payment_completed_at <= DATE '2026-11-10' - INTERVAL 120 DAY
),
days AS (SELECT unnest(range(0, 121, 15)) AS day)
SELECT lender_type, day, round(avg((d IS NOT NULL AND d <= day)::int), 3) AS visible
FROM p CROSS JOIN days GROUP BY ALL ORDER BY lender_type, day;

-- name: tickets_and_churn
-- Users who paid off an account and still saw it as unresolved at day 45, vs users who saw it move.
WITH t AS (SELECT account_id, count(*) AS n FROM support_tickets GROUP BY 1),
x AS (
  SELECT a.account_id, a.user_id,
         (a.bureau_reflected_at IS NULL OR a.bureau_reflected_at > a.payment_completed_at + INTERVAL 45 DAY) AS invisible_45d,
         COALESCE(t.n, 0) AS tickets
  FROM acct a LEFT JOIN t USING (account_id)
  WHERE a.paid_off AND a.payment_completed_at <= DATE '2026-11-10' - INTERVAL 45 DAY
)
SELECT x.invisible_45d, count(*) AS paid_off_accounts,
       round(100.0 * sum(tickets) / count(*), 1) AS tickets_per_100,
       round(avg(s.cancelled_within_60d::int), 3) AS user_cancelled_within_60d
FROM x JOIN subscription_outcomes s USING (user_id)
GROUP BY 1 ORDER BY 1;

-- name: settled_vs_closed
SELECT dpd_bucket, bureau_status, count(*) AS accounts,
       round(median(waiver_pct * outstanding), -2) AS median_waiver_rupees,
       round(avg(score_delta_90d), 1) AS avg_score_change_90d
FROM acct WHERE bureau_status IS NOT NULL GROUP BY ALL ORDER BY ALL;

-- name: dq_bureau_duplicates
-- The same loan arrives once per bureau, with different lender spellings and account masks.
-- Counting rows overstates overdue accounts; exact-match de-duplication barely helps.
WITH raw AS (SELECT * FROM bureau_tradelines_raw),
norm AS (
  SELECT *,
    regexp_replace(upper(lender_name_raw), '\s*(LTD|LIMITED|BANK|CARDS & PAYMENT|CARD|FINANCE|FINSERV)\.?\s*', '', 'g') AS lender_key0,
    right(regexp_replace(account_no_masked, '[^0-9]', '', 'g'), 4) AS last4
  FROM raw
),
alias AS (  -- a small alias table maintained by the data team
  SELECT * FROM (VALUES ('WHIZDM', 'MONEYVIEW'), ('BAJAJ', 'BAJAJ')) t(k, canon)
),
keyed AS (
  SELECT n.*, COALESCE(a.canon, n.lender_key0) AS lender_key FROM norm n LEFT JOIN alias a ON n.lender_key0 = a.k
)
SELECT
  (SELECT count(*) FROM raw)                                                                     AS raw_rows,
  (SELECT count(*) FROM (SELECT DISTINCT user_id, lender_name_raw, account_no_masked, opened_month FROM raw)) AS exact_distinct,
  (SELECT count(*) FROM (SELECT DISTINCT user_id, lender_key, last4, opened_month FROM keyed))   AS normalised_distinct,
  (SELECT count(*) FROM overdue_accounts)                                                       AS true_accounts;

-- name: cube
-- Feeds the page's explorer: stage counts by the four cuts a PM would ask for first.
SELECT lender_type, dpd_bucket, income_source, COALESCE(plan_type, 'none') AS plan_type,
       count(*) AS detected, count(*) FILTER (offered) AS offered, count(*) FILTER (accepted) AS accepted,
       count(*) FILTER (accepted AND first_paid) AS first_paid,
       count(*) FILTER (accepted AND could_finish) AS could_finish,
       count(*) FILTER (paid_off AND could_finish) AS paid_off,
       count(*) FILTER (bureau_reflected_at IS NOT NULL AND could_finish) AS reflected,
       count(*) FILTER (bureau_reflected_at <= payment_completed_at + INTERVAL 45 DAY AND could_finish) AS reflected_45d
FROM acct GROUP BY ALL;
