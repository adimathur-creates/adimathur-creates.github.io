-- 05_churn_early_warning.sql
-- Do merchants leave after a bad stretch of failures? If yes, a failure spike
-- on one merchant is a retention alert, not just an ops ticket.
-- "Shock" and "churn" are computed from the data only (ground truth is never read).

-- name: churn_vs_shock
WITH wk AS (
  SELECT merchant_id,
         (CAST(julianday(day) - julianday('2026-09-21') AS INTEGER) / 7) + 1 AS week,
         COUNT(*) AS intents,
         SUM(sent_to_bank) AS sent, SUM(is_success) AS ok
  FROM v_intents GROUP BY 1, 2
),
-- fill in zero weeks so window functions see a gap as zero, not as missing
grid AS (
  SELECT m.merchant_id, w.week
  FROM merchants m
  CROSS JOIN (SELECT DISTINCT week FROM wk) w
  WHERE m.onboarded_on < '2026-09-21'
),
filled AS (
  SELECT g.merchant_id, g.week, COALESCE(wk.intents,0) AS intents,
         COALESCE(wk.sent,0) AS sent, COALESCE(wk.ok,0) AS ok
  FROM grid g LEFT JOIN wk USING (merchant_id, week)
),
w AS (
  SELECT f.*,
         -- merchant's own success rate in weeks 1-2, as their "normal"
         SUM(CASE WHEN week <= 2 THEN ok END)   OVER (PARTITION BY merchant_id) * 1.0 /
         NULLIF(SUM(CASE WHEN week <= 2 THEN sent END) OVER (PARTITION BY merchant_id), 0) AS sr_normal,
         AVG(intents) OVER (PARTITION BY merchant_id ORDER BY week
                            ROWS BETWEEN 4 PRECEDING AND 1 PRECEDING) AS trailing_4w_avg
  FROM filled f
),
per_merchant AS (
  SELECT merchant_id,
         -- shock: any week in 3-5 with 20+ payouts where SR fell 10+ points below
         -- the merchant's normal. Below 20 a week, two failures look like a shock.
         MAX(CASE WHEN week BETWEEN 3 AND 5 AND sent >= 20
                   AND 1.0*ok/sent < sr_normal - 0.10 THEN 1 ELSE 0 END) AS had_shock,
         SUM(CASE WHEN week <= 2 THEN intents END) AS early,
         SUM(CASE WHEN week >= 7 THEN intents END) AS late
  FROM w GROUP BY merchant_id
)
SELECT CASE had_shock WHEN 1 THEN 'had a failure shock in weeks 3-5' ELSE 'no shock' END AS grp,
       COUNT(*) AS merchants,
       SUM(late < 0.3 * early) AS churned,
       ROUND(100.0 * SUM(late < 0.3 * early) / COUNT(*), 1) AS churn_pct
FROM per_merchant
WHERE early >= 20            -- enough volume to judge
GROUP BY had_shock;

-- name: early_warning_backtest
-- Back-test: if an alert had run at the end of week 6, whom would it flag, and
-- how many of them were actually gone by weeks 7-8?
-- Rule: week-6 volume down 40%+ vs the merchant's trailing 4-week average
--       AND the merchant had a week in the prior 4 with success rate under 92%.
WITH wk AS (
  SELECT merchant_id,
         (CAST(julianday(day) - julianday('2026-09-21') AS INTEGER) / 7) + 1 AS week,
         COUNT(*) AS intents, SUM(sent_to_bank) AS sent, SUM(is_success) AS ok
  FROM v_intents GROUP BY 1, 2
),
grid AS (
  SELECT m.merchant_id, w.week FROM merchants m
  CROSS JOIN (SELECT DISTINCT week FROM wk) w
  WHERE m.onboarded_on < '2026-09-21'
),
filled AS (
  SELECT g.merchant_id, g.week, COALESCE(wk.intents,0) AS intents,
         COALESCE(wk.sent,0) AS sent, COALESCE(wk.ok,0) AS ok
  FROM grid g LEFT JOIN wk USING (merchant_id, week)
),
w AS (
  SELECT f.*,
         AVG(intents) OVER (PARTITION BY merchant_id ORDER BY week
                            ROWS BETWEEN 4 PRECEDING AND 1 PRECEDING) AS trailing_4w_avg,
         MIN(CASE WHEN sent >= 20 THEN 1.0*ok/sent END)
             OVER (PARTITION BY merchant_id ORDER BY week
                   ROWS BETWEEN 4 PRECEDING AND 1 PRECEDING) AS worst_sr_prev_4w
  FROM filled f
),
outcome AS (
  SELECT merchant_id,
         SUM(CASE WHEN week <= 2 THEN intents END) AS early,
         SUM(CASE WHEN week >= 7 THEN intents END) AS late
  FROM filled GROUP BY 1
),
flags AS (
  SELECT w.merchant_id,
         CASE WHEN w.trailing_4w_avg >= 5 AND w.intents < 0.6 * w.trailing_4w_avg
               AND w.worst_sr_prev_4w < 0.92 THEN 1 ELSE 0 END AS flagged,
         CASE WHEN o.late < 0.3 * o.early THEN 1 ELSE 0 END AS churned
  FROM w JOIN outcome o USING (merchant_id)
  WHERE w.week = 6 AND o.early >= 20
)
SELECT SUM(flagged)                      AS flagged_at_week_6,
       SUM(flagged * churned)            AS flagged_and_churned,
       ROUND(100.0 * SUM(flagged*churned) / NULLIF(SUM(flagged),0), 0) AS precision_pct,
       SUM(churned)                      AS all_churners,
       ROUND(100.0 * SUM(flagged*churned) / NULLIF(SUM(churned),0), 0) AS share_of_churners_caught
FROM flags;
