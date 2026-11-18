-- 02_daily_kpis.sql
-- The pod's daily scorecard. One row per day.
-- Fee per successful transfer is a FICTIONAL assumption for the revenue line:
-- IMPS Rs 5, UPI Rs 4, NEFT Rs 3, RTGS Rs 20.

-- name: daily_kpis
WITH intents AS (
  SELECT day,
         COUNT(*)                                        AS intents,
         SUM(sent_to_bank)                               AS sent,
         SUM(is_success)                                 AS succeeded,
         SUM(CASE WHEN final_outcome = 'REVERSED' THEN 1 ELSE 0 END) AS reversed,
         SUM(CASE WHEN is_success = 1 THEN amount ELSE 0 END)        AS value_paid,
         COUNT(DISTINCT merchant_id)                     AS active_merchants,
         MIN(is_mature)                                  AS mature
  FROM v_intents
  GROUP BY day
),
attempts AS (
  SELECT day,
         COUNT(*) AS attempts,
         SUM(CASE WHEN outcome IN ('SUCCESS','REVERSED') THEN 1 ELSE 0 END) AS attempt_ok_first_status,
         SUM(CASE WHEN outcome = 'SUCCESS' THEN
               CASE mode WHEN 'IMPS' THEN 5 WHEN 'UPI' THEN 4 WHEN 'NEFT' THEN 3 ELSE 20 END
             ELSE 0 END) AS fee_revenue
  FROM v_attempts
  GROUP BY day
)
SELECT i.day,
       i.intents, a.attempts,
       ROUND(100.0 * i.succeeded / i.sent, 2)                 AS payout_success_rate,
       ROUND(100.0 * a.attempt_ok_first_status / a.attempts, 2) AS attempt_success_rate_naive,
       ROUND(1.0 * a.attempts / i.intents, 3)                 AS attempts_per_intent,
       ROUND(100.0 * i.reversed / i.sent, 3)                  AS reversal_rate,
       ROUND(i.value_paid / 1e7, 2)                           AS value_paid_cr,
       i.active_merchants,
       a.fee_revenue,
       i.mature
FROM intents i JOIN attempts a USING (day)
ORDER BY i.day;

-- name: resolve_time_p95
-- p50 / p95 time-to-final-status for instant modes, per week, without a
-- PERCENTILE function: rank each intent, then pick the row at the percentile.
WITH x AS (
  SELECT strftime('%W', created_at) AS wk,
         (julianday(resolved_at) - julianday(created_at)) * 86400.0 AS secs
  FROM v_intents
  WHERE mode IN ('IMPS','UPI') AND sent_to_bank = 1
),
r AS (
  SELECT wk, secs,
         ROW_NUMBER() OVER (PARTITION BY wk ORDER BY secs) AS rn,
         COUNT(*)     OVER (PARTITION BY wk)               AS n
  FROM x
)
SELECT wk,
       MAX(CASE WHEN rn = CAST(0.50 * n AS INTEGER) THEN ROUND(secs, 0) END) AS p50_secs,
       MAX(CASE WHEN rn = CAST(0.95 * n AS INTEGER) THEN ROUND(secs, 0) END) AS p95_secs,
       MAX(CASE WHEN rn = CAST(0.99 * n AS INTEGER) THEN ROUND(secs/3600.0, 1) END) AS p99_hours
FROM r GROUP BY wk ORDER BY wk;
