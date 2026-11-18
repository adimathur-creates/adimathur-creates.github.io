-- 01_metric_layer.sql
-- One definition of each payouts metric, so every dashboard and every
-- "why did X move" question starts from the same numbers.
-- SQLite dialect. Fictional data. See METRICS.md for the plain-English version.

DROP VIEW IF EXISTS v_attempts;
DROP VIEW IF EXISTS v_intents;
DROP VIEW IF EXISTS v_params;

-- Snapshot: data is "as of" Mon 16 Nov 2026 00:00.
-- Maturity: an intent counts in final success rate only once it is 72h old,
-- because Cashfree polls pending transfers for up to 72h and reversals can land
-- up to ~24h after a success.
CREATE VIEW v_params AS
SELECT '2026-11-16 00:00:00' AS snapshot_at,
       '2026-11-13 00:00:00' AS mature_before;

-- Attempt level: one row per transfer_id, with a failure-cause bucket.
CREATE VIEW v_attempts AS
SELECT t.*,
       substr(t.created_at, 1, 10)                       AS day,
       CAST(strftime('%H', t.created_at) AS INTEGER)     AS hour,
       CASE
         WHEN t.outcome = 'SUCCESS' THEN 'none'
         WHEN t.reason = 'INSUFFICIENT_BALANCE' THEN 'merchant'
         WHEN t.reason IN ('INVALID_ACCOUNT_FAIL','INVALID_ACCOUNT_REVERSAL','ACCOUNT_BLOCKED')
              THEN 'beneficiary'
         WHEN t.reason IN ('BENE_BANK_DECLINED','BANK_GATEWAY_ERROR') THEN 'bank'
         WHEN t.reason IN ('BAD_CONNECTION','WAIT_TIME_EXCEEDED') THEN 'platform'
         ELSE 'other'
       END AS failure_cause
FROM transfers t;

-- Intent level: one row per payout the merchant wanted to make, however many
-- transfer_ids (retries) it took. The final outcome is the LAST attempt's.
CREATE VIEW v_intents AS
WITH ranked AS (
  SELECT a.*,
         ROW_NUMBER() OVER (PARTITION BY intent_id ORDER BY attempt_no DESC) AS rn_last,
         MIN(created_at) OVER (PARTITION BY intent_id)                       AS intent_created_at,
         COUNT(*)        OVER (PARTITION BY intent_id)                       AS attempts
  FROM v_attempts a
)
SELECT intent_id, merchant_id, bene_id, is_new_bene, bene_bav_verified, mode, bene_bank,
       amount, intent_created_at AS created_at,
       substr(intent_created_at, 1, 10) AS day,
       CAST(strftime('%H', intent_created_at) AS INTEGER) AS hour,
       attempts,
       outcome  AS final_outcome,
       reason   AS final_reason,
       failure_cause AS final_failure_cause,
       resolved_at, reversed_at,
       -- sent to bank = not stopped by a merchant-side error on the last try
       CASE WHEN failure_cause = 'merchant' THEN 0 ELSE 1 END AS sent_to_bank,
       CASE WHEN outcome = 'SUCCESS' THEN 1 ELSE 0 END        AS is_success,
       CASE WHEN intent_created_at < (SELECT mature_before FROM v_params) THEN 1 ELSE 0 END AS is_mature
FROM ranked
WHERE rn_last = 1;

-- Headline definition used everywhere on the page:
--   Payout success rate = intents that reached the beneficiary and stayed there
--                         (final SUCCESS, not reversed)
--                         / intents sent to a bank
--   over mature intents only.
