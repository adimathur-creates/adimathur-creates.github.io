-- 03_tuesday_rca.sql
-- "Why did success rate drop on Tuesday?"  (Tue 10 Nov 2026, fictional)
-- Baseline = the four most recent NORMAL Tuesdays, pooled: 22 and 29 Sep, 27 Oct, 3 Nov.
-- 13 and 20 Oct are excluded on purpose: they fall inside the October dip
-- (merchant-level failure shocks, see 05_churn_early_warning.sql). A first version
-- used them, and the depressed baseline made "everything else" look +0.18 pts
-- better on Tuesday than it really was.
-- Order of work: 1) is the drop real or a counting artefact?  2) where is it?
-- 3) how much does each cause explain?  4) what did we rule out?

-- name: headline_three_numbers
-- The same day measured three ways. Only the last one is the real number.
WITH days AS (
  SELECT '2026-11-10' AS day, 'Tuesday' AS grp
  UNION ALL SELECT '2026-09-22','baseline' UNION ALL SELECT '2026-09-29','baseline'
  UNION ALL SELECT '2026-10-27','baseline' UNION ALL SELECT '2026-11-03','baseline'
),
att AS (
  SELECT d.grp, a.*,
         -- status as the dashboard saw it at 23:59 that same day
         CASE WHEN a.resolved_at > a.day || ' 23:59:59' THEN 'PENDING'
              WHEN a.reversed_at IS NOT NULL AND a.reversed_at <= a.day || ' 23:59:59' THEN 'REVERSED'
              WHEN a.outcome = 'REVERSED' THEN 'SUCCESS'
              ELSE a.outcome END AS status_same_day
  FROM v_attempts a JOIN days d ON d.day = a.day
),
same_day AS (
  SELECT grp,
         100.0 * SUM(status_same_day = 'SUCCESS') / SUM(status_same_day <> 'PENDING') AS sr
  FROM att GROUP BY grp
),
attempt_final AS (
  SELECT grp, 100.0 * SUM(outcome = 'SUCCESS') / COUNT(*) AS sr FROM att GROUP BY grp
),
intent_final AS (
  SELECT d.grp, 100.0 * SUM(i.is_success) / SUM(i.sent_to_bank) AS sr
  FROM v_intents i JOIN days d ON d.day = i.day GROUP BY d.grp
)
SELECT 'Attempt SR, as the dashboard showed it on the night' AS measure,
       ROUND((SELECT sr FROM same_day WHERE grp='baseline'),2) AS baseline,
       ROUND((SELECT sr FROM same_day WHERE grp='Tuesday'),2)  AS tuesday
UNION ALL
SELECT 'Attempt SR, final (after late reversals)',
       ROUND((SELECT sr FROM attempt_final WHERE grp='baseline'),2),
       ROUND((SELECT sr FROM attempt_final WHERE grp='Tuesday'),2)
UNION ALL
SELECT 'Payout success rate (per intent, final) - the real number',
       ROUND((SELECT sr FROM intent_final WHERE grp='baseline'),2),
       ROUND((SELECT sr FROM intent_final WHERE grp='Tuesday'),2);

-- name: retry_inflation
-- How much of the attempt-level drop is one merchant retrying the same payout?
SELECT CASE WHEN merchant_id = 'M0077' THEN 'M0077' ELSE 'all other merchants' END AS who,
       COUNT(*) AS attempts,
       COUNT(DISTINCT intent_id) AS intents,
       SUM(outcome = 'FAILED') AS failed_attempts,
       SUM(intent_failed) AS failed_intents
FROM (
  SELECT a.*, CASE WHEN a.attempt_no = MAX(a.attempt_no) OVER (PARTITION BY a.intent_id)
                    AND a.outcome NOT IN ('SUCCESS') AND a.failure_cause <> 'merchant'
              THEN 1 ELSE 0 END AS intent_failed
  FROM v_attempts a WHERE a.day = '2026-11-10'
)
GROUP BY 1;

-- name: attempt_sr_without_retry_loop
-- Tuesday attempt-level SR (final) with and without M0077.
SELECT ROUND(100.0*SUM(outcome='SUCCESS')/COUNT(*),2) AS attempt_sr_all,
       ROUND(100.0*SUM(CASE WHEN merchant_id<>'M0077' THEN outcome='SUCCESS' END)
             / SUM(merchant_id<>'M0077'),2) AS attempt_sr_without_m0077
FROM v_attempts WHERE day = '2026-11-10';

-- name: where_bank_mode
-- Which bank x mode cells moved? Ranked by extra failed intents vs baseline.
WITH base AS (
  SELECT bene_bank, mode,
         SUM(sent_to_bank) / 4.0 AS sent, (SUM(sent_to_bank) - SUM(is_success)) / 4.0 AS failed
  FROM v_intents WHERE day IN ('2026-09-22','2026-09-29','2026-10-27','2026-11-03')
  GROUP BY 1,2
),
tue AS (
  SELECT bene_bank, mode, SUM(sent_to_bank) AS sent, SUM(sent_to_bank) - SUM(is_success) AS failed
  FROM v_intents WHERE day = '2026-11-10' GROUP BY 1,2
)
SELECT t.bene_bank, t.mode,
       t.sent AS tue_sent, ROUND(b.sent,0) AS base_sent,
       ROUND(100.0*(t.sent - t.failed)/t.sent, 2) AS tue_sr,
       ROUND(100.0*(b.sent - b.failed)/b.sent, 2) AS base_sr,
       ROUND(t.failed - b.failed * (1.0 * t.sent / b.sent), 0) AS extra_failed_vs_expected
FROM tue t JOIN base b USING (bene_bank, mode)
ORDER BY extra_failed_vs_expected DESC
LIMIT 8;

-- name: bank_f_15min
-- Bank F, IMPS, Tuesday, in 15-minute buckets. When did it break, when did it
-- recover, and how long would a 90% alert on a 3-bucket rolling window have taken?
WITH b AS (
  SELECT substr(created_at, 12, 2) || ':' ||
         printf('%02d', (CAST(substr(created_at, 15, 2) AS INTEGER) / 15) * 15) AS slot,
         COUNT(*) AS attempts,
         SUM(outcome IN ('SUCCESS','REVERSED')) AS ok
  FROM v_attempts
  WHERE day = '2026-11-10' AND bene_bank = 'F' AND mode = 'IMPS'
  GROUP BY 1
),
w AS (
  SELECT slot, attempts, ok,
         ROUND(100.0 * ok / attempts, 1) AS sr,
         ROUND(100.0 * SUM(ok) OVER win / SUM(attempts) OVER win, 1) AS sr_rolling_45m
  FROM b
  WINDOW win AS (ORDER BY slot ROWS BETWEEN 2 PRECEDING AND CURRENT ROW)
)
SELECT slot, attempts, sr, sr_rolling_45m,
       CASE WHEN sr_rolling_45m < 90 AND
                 LAG(sr_rolling_45m) OVER (ORDER BY slot) >= 90 THEN 'ALERT FIRES' END AS alert
FROM w
WHERE slot BETWEEN '09:00' AND '16:45'
ORDER BY slot;

-- name: merchant_contribution
-- Which merchants added the most failed intents vs their own normal Tuesday?
WITH base AS (
  SELECT merchant_id, SUM(sent_to_bank)/4.0 AS sent, (SUM(sent_to_bank)-SUM(is_success))/4.0 AS failed,
         SUM(attempts)/4.0 AS attempts
  FROM v_intents WHERE day IN ('2026-09-22','2026-09-29','2026-10-27','2026-11-03')
  GROUP BY 1
),
tue AS (
  SELECT merchant_id, SUM(sent_to_bank) AS sent, SUM(sent_to_bank)-SUM(is_success) AS failed,
         SUM(attempts) AS attempts,
         SUM(is_new_bene) AS new_benes,
         SUM(CASE WHEN final_failure_cause = 'beneficiary' THEN 1 ELSE 0 END) AS bene_failures
  FROM v_intents WHERE day = '2026-11-10' GROUP BY 1
)
SELECT t.merchant_id, m.segment, m.uses_bav,
       t.sent AS tue_intents, ROUND(COALESCE(b.sent,0),0) AS base_intents,
       t.failed AS tue_failed, ROUND(COALESCE(b.failed,0),1) AS base_failed,
       t.attempts AS tue_attempts, ROUND(COALESCE(b.attempts,0),0) AS base_attempts,
       t.new_benes, t.bene_failures,
       RANK() OVER (ORDER BY t.failed - COALESCE(b.failed,0) DESC) AS rnk
FROM tue t LEFT JOIN base b USING (merchant_id) JOIN merchants m USING (merchant_id)
ORDER BY rnk LIMIT 6;

-- name: decomposition
-- Mix / rate split of the drop. Each intent goes into exactly one bucket, in
-- this priority order. For every bucket:
--   rate effect = Tuesday share x (Tuesday SR - baseline SR of that bucket)
--   mix effect  = (Tuesday share - baseline share) x (baseline SR of bucket - overall baseline SR)
-- The effects add up exactly to the headline change.
WITH tagged AS (
  SELECT CASE WHEN day = '2026-11-10' THEN 'tue' ELSE 'base' END AS grp,
         CASE
           WHEN merchant_id = 'M0412' THEN '1 M0412 promo (gaming, unverified new beneficiaries)'
           WHEN merchant_id = 'M0077' THEN '2 M0077 (lending, retry loop)'
           WHEN bene_bank = 'F' AND mode IN ('IMPS','UPI')
                AND substr(created_at,12,5) >= '11:00' AND substr(created_at,12,5) < '14:30'
                THEN '3 Bank F, IMPS/UPI, 11:00-14:30'
           ELSE '4 Everything else'
         END AS bucket,
         sent_to_bank, is_success
  FROM v_intents
  WHERE day IN ('2026-11-10','2026-09-22','2026-09-29','2026-10-27','2026-11-03')
    AND sent_to_bank = 1
),
seg AS (
  SELECT grp, bucket, COUNT(*) AS n, AVG(is_success) AS sr FROM tagged GROUP BY 1,2
),
tot AS (SELECT grp, SUM(n) AS n_tot, SUM(n*sr)/SUM(n) AS sr_tot FROM seg GROUP BY grp),
w AS (
  SELECT s.grp, s.bucket, 1.0*s.n/t.n_tot AS share, s.sr, t.sr_tot FROM seg s JOIN tot t USING (grp)
)
SELECT tu.bucket,
       ROUND(100*ba.share,2) AS base_share_pct, ROUND(100*tu.share,2) AS tue_share_pct,
       ROUND(100*ba.sr,2) AS base_sr, ROUND(100*tu.sr,2) AS tue_sr,
       ROUND(100*tu.share*(tu.sr - ba.sr), 3)                    AS rate_effect_pts,
       ROUND(100*(tu.share - ba.share)*(ba.sr - ba.sr_tot), 3)   AS mix_effect_pts,
       ROUND(100*(tu.share*(tu.sr - ba.sr) + (tu.share - ba.share)*(ba.sr - ba.sr_tot)), 3) AS total_pts
FROM w tu JOIN w ba ON ba.bucket = tu.bucket AND ba.grp = 'base'
WHERE tu.grp = 'tue'
ORDER BY tu.bucket;

-- name: ruled_out
-- Things that did NOT cause it. Cashfree-side errors and API latency were flat.
WITH a AS (
  SELECT CASE WHEN day='2026-11-10' THEN 'Tuesday' ELSE 'baseline' END AS grp, *
  FROM v_attempts
  WHERE day IN ('2026-11-10','2026-09-22','2026-09-29','2026-10-27','2026-11-03')
    AND merchant_id <> 'M0077'   -- remove the retry loop so it does not inflate counts
),
lat AS (
  SELECT grp, api_latency_ms,
         ROW_NUMBER() OVER (PARTITION BY grp ORDER BY api_latency_ms) AS rn,
         COUNT(*) OVER (PARTITION BY grp) AS n
  FROM a
)
SELECT grp,
       ROUND(100.0 * SUM(failure_cause = 'platform') / COUNT(*), 3) AS platform_fail_pct,
       ROUND(100.0 * SUM(failure_cause = 'bank' AND bene_bank <> 'F') / SUM(bene_bank <> 'F'), 3)
             AS bank_fail_pct_other_banks,
       ROUND(100.0 * SUM(failure_cause = 'merchant') / COUNT(*), 3) AS merchant_balance_error_pct,
       (SELECT api_latency_ms FROM lat l WHERE l.grp = a.grp AND l.rn = CAST(0.95*l.n AS INTEGER))
             AS api_p95_ms
FROM a GROUP BY grp;

-- name: platform_daily_range
-- Is Tuesday's Cashfree-side error rate unusual? Compare with every normal day
-- (October dip excluded, M0077 excluded).
WITH d AS (
  SELECT day, 100.0 * SUM(failure_cause = 'platform') / COUNT(*) AS pct
  FROM v_attempts
  WHERE merchant_id <> 'M0077' AND day NOT BETWEEN '2026-10-05' AND '2026-10-25'
    AND day <> '2026-11-10'
  GROUP BY day
)
SELECT ROUND(MIN(pct),3) AS min_pct, ROUND(AVG(pct),3) AS avg_pct, ROUND(MAX(pct),3) AS max_pct,
       COUNT(*) AS normal_days
FROM d;

-- name: reversal_lag
-- M0412's Tuesday reversals: how many landed after the day closed?
-- These are invisible to a same-day dashboard.
SELECT CASE WHEN reversed_at <= '2026-11-10 23:59:59' THEN 'landed on Tuesday'
            ELSE 'landed Wednesday or later' END AS when_landed,
       COUNT(*) AS reversals,
       ROUND(SUM(amount)/1e5, 2) AS amount_lakh
FROM v_attempts
WHERE merchant_id = 'M0412' AND day = '2026-11-10' AND outcome = 'REVERSED'
GROUP BY 1;
