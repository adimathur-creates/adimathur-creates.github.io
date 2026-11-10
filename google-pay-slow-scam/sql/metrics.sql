-- The Slow Scam: analysis SQL (DuckDB; the same logic ports to BigQuery).
-- Input: data/sample_payments.csv.gz  (1,000 genuine payers + every planted victim, all 90 days)
-- Run:   python3 src/check_sql.py      (runs each block, writes sql/output.txt, fails if the check fails)

-- name: base
CREATE OR REPLACE TABLE p AS
SELECT * FROM read_csv_auto('data/sample_payments.csv.gz', header = true);

-- name: newish
-- A payment is to a "new-ish" person if they have never paid you, and your first payment
-- to them was within the last 14 days. This is the population the engine scores.
CREATE OR REPLACE TABLE outs AS
WITH firsts AS (
  SELECT user_id, counterparty,
         min(ts_min) FILTER (WHERE dir = 'out') AS first_out,
         min(ts_min) FILTER (WHERE dir = 'in')  AS first_in
  FROM p GROUP BY 1, 2
)
SELECT p.*,
       (f.first_in IS NULL OR f.first_in > p.ts_min) AND (p.ts_min - f.first_out <= 14 * 1440) AS is_newish
FROM p JOIN firsts f USING (user_id, counterparty)
WHERE p.dir = 'out' AND p.cp_type = 'individual';

-- name: check_velocity
-- CHECK: recompute "distinct new people paid in the last 7 days" in SQL and compare with the engine.
-- Expect mismatches = 0.
SELECT count(*) AS payments_checked,
       count(*) FILTER (WHERE sql_n7 <> engine_n7) AS mismatches
FROM (
  SELECT r.new_payees_7d AS engine_n7,
         (SELECT count(DISTINCT cp) FROM (
             SELECT q.counterparty AS cp FROM outs q
             WHERE q.user_id = r.user_id AND q.is_newish AND q.amount >= 500
               AND q.ts_min >= r.ts_min - 7 * 1440 AND q.ts_min < r.ts_min
             UNION SELECT r.counterparty)) AS sql_n7
  FROM outs r
  WHERE r.is_newish AND r.amount >= 500
);

-- name: journey_shape
-- What a scam journey looks like from the payer's side, by type.
WITH s AS (
  SELECT user_id, archetype, ts_min, amount, counterparty,
         row_number() OVER (PARTITION BY user_id ORDER BY ts_min) AS k,
         count(*)     OVER (PARTITION BY user_id)                AS n,
         lag(amount)  OVER (PARTITION BY user_id ORDER BY ts_min) AS prev_amt,
         (max(ts_min) OVER (PARTITION BY user_id) - min(ts_min) OVER (PARTITION BY user_id)) / 1440.0 AS span_days
  FROM p WHERE is_scam = 1 AND dir = 'out'
)
SELECT archetype,
       count(DISTINCT user_id)                                          AS victims,
       round(count(*) / count(DISTINCT user_id), 1)                     AS payments_per_victim,
       round(count(DISTINCT counterparty) / count(DISTINCT user_id), 1) AS receiving_ids_per_victim,
       median(amount) FILTER (WHERE k = 1)                              AS median_first_payment,
       round(median(amount / prev_amt) FILTER (WHERE k > 1), 2)         AS median_step_up,
       median(amount) FILTER (WHERE k = n)                              AS median_last_payment,
       round(median(span_days) FILTER (WHERE k = 1), 1)                 AS median_days_on_app
FROM s GROUP BY 1 ORDER BY 1;

-- name: bait_rate
-- Share of payments to new-ish people that came within 10 days after a small credit from a
-- different stranger (the "bait" pattern), scam vs genuine.
WITH strangers AS (
  SELECT p.user_id, p.counterparty, p.ts_min, p.amount
  FROM p
  JOIN (SELECT user_id, counterparty, min(ts_min) AS first_seen FROM p GROUP BY 1, 2) f
    ON f.user_id = p.user_id AND f.counterparty = p.counterparty AND f.first_seen = p.ts_min
  WHERE p.dir = 'in' AND p.cp_type = 'individual' AND p.amount <= 5000
)
SELECT CASE WHEN o.is_scam = 1 THEN 'scam payment' ELSE 'genuine payment' END AS kind,
       count(*) AS payments,
       round(100.0 * avg(CASE WHEN EXISTS (
          SELECT 1 FROM strangers b
          WHERE b.user_id = o.user_id AND b.counterparty <> o.counterparty
            AND b.ts_min < o.ts_min AND b.ts_min >= o.ts_min - 10 * 1440
            AND o.amount >= 1.5 * b.amount) THEN 1 ELSE 0 END), 1) AS pct_after_stranger_credit
FROM outs o
WHERE o.is_newish AND o.amount >= 500 AND o.ts_min >= 30 * 1440
GROUP BY 1 ORDER BY 1;

-- name: score_bands
-- Raw score (before fatigue rules) for every payment to a new-ish person, measured window only.
SELECT CASE WHEN is_scam = 1 THEN 'scam' ELSE 'genuine' END AS kind,
       count(*) AS payments,
       round(100.0 * avg(CASE WHEN score >= 3.2 THEN 1 ELSE 0 END), 2) AS pct_question_or_above,
       round(100.0 * avg(CASE WHEN score >= 4.6 THEN 1 ELSE 0 END), 2) AS pct_warning_or_above,
       round(100.0 * avg(CASE WHEN score >= 6.6 THEN 1 ELSE 0 END), 2) AS pct_hold
FROM outs
WHERE is_newish AND amount >= 500 AND ts_min >= 30 * 1440
GROUP BY 1 ORDER BY 1;

-- name: persona_friction
-- Which genuine payers would see a full warning most (raw, before fatigue rules), per 1,000 payers a month.
WITH payers AS (SELECT persona, count(DISTINCT user_id) AS n FROM p WHERE is_victim = 0 GROUP BY 1)
SELECT o.persona, payers.n AS payers,
       round(1000.0 * count(*) FILTER (WHERE o.score >= 4.6) / payers.n / 2, 1) AS raw_warnings_per_1k_month
FROM outs o JOIN payers USING (persona)
WHERE o.is_victim = 0 AND o.ts_min >= 30 * 1440
GROUP BY 1, 2 ORDER BY 3 DESC;
