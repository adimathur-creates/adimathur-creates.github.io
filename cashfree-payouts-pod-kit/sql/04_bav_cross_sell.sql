-- 04_bav_cross_sell.sql
-- Growth lever: Payouts merchants that pay new beneficiaries without verifying
-- the account first (SecureID Bank Account Verification, BAV).
-- Cashfree's docs say BAV is enabled automatically for Payouts merchants, so
-- the lever is USAGE, not access.
-- All prices and catch rates below are FICTIONAL assumptions, stated in the query.

-- name: first_payout_quality
-- First payout to a new beneficiary: verified vs not verified.
SELECT CASE WHEN bene_bav_verified = 1 THEN 'verified with BAV first' ELSE 'not verified' END AS bene,
       COUNT(*) AS first_payouts,
       SUM(final_failure_cause = 'beneficiary' AND final_reason LIKE 'INVALID%') AS invalid_account,
       ROUND(100.0 * SUM(final_failure_cause = 'beneficiary' AND final_reason LIKE 'INVALID%') / COUNT(*), 2)
             AS invalid_pct,
       SUM(final_outcome = 'REVERSED') AS reversed,
       ROUND(SUM(CASE WHEN final_outcome = 'REVERSED' THEN amount ELSE 0 END) / 1e5, 1) AS reversed_lakh
FROM v_intents
WHERE is_new_bene = 1 AND sent_to_bank = 1
GROUP BY 1;

-- name: sizing
-- Monthly opportunity from merchants that do not use BAV.
-- Assumptions (fictional): BAV check Rs 2; BAV catches 80% of invalid accounts;
-- each failed/reversed payout costs the merchant ~Rs 150 in support and re-collection
-- of correct details.
WITH nonbav AS (
  SELECT i.merchant_id, m.segment,
         COUNT(*) AS first_payouts_8w,
         SUM(i.final_reason LIKE 'INVALID%') AS invalid_8w,
         SUM(CASE WHEN i.final_outcome = 'REVERSED' THEN i.amount ELSE 0 END) AS reversed_amt_8w
  FROM v_intents i JOIN merchants m USING (merchant_id)
  WHERE i.is_new_bene = 1 AND i.sent_to_bank = 1 AND m.uses_bav = 0
  GROUP BY 1, 2
)
SELECT COUNT(*)                                            AS merchants_not_using_bav,
       ROUND(SUM(first_payouts_8w) * 30.0 / 56)            AS bav_checks_per_month,
       ROUND(SUM(first_payouts_8w) * 30.0 / 56 * 2 / 1e5, 2) AS bav_revenue_lakh_per_month,
       ROUND(SUM(invalid_8w) * 30.0 / 56 * 0.8)            AS bad_payouts_avoided_per_month,
       ROUND(SUM(invalid_8w) * 30.0 / 56 * 0.8 * 150 / 1e5, 2) AS merchant_cost_avoided_lakh_per_month,
       ROUND(SUM(reversed_amt_8w) * 30.0 / 56 / 1e5, 1)    AS reversed_value_lakh_per_month
FROM nonbav;

-- name: target_list
-- Who sales / account managers should call first: most bad payouts per month,
-- with a NTILE bucket so the list can be split into waves.
WITH nonbav AS (
  SELECT i.merchant_id, m.segment, m.size_tier,
         COUNT(*) AS first_payouts_8w,
         SUM(i.final_reason LIKE 'INVALID%') AS invalid_8w,
         SUM(CASE WHEN i.final_outcome = 'REVERSED' THEN i.amount ELSE 0 END) AS reversed_amt_8w
  FROM v_intents i JOIN merchants m USING (merchant_id)
  WHERE i.is_new_bene = 1 AND i.sent_to_bank = 1 AND m.uses_bav = 0
  GROUP BY 1, 2, 3
)
SELECT merchant_id, segment, size_tier,
       ROUND(first_payouts_8w * 30.0 / 56) AS new_bene_payouts_per_month,
       ROUND(invalid_8w * 30.0 / 56, 1)    AS bad_payouts_per_month,
       ROUND(100.0 * invalid_8w / first_payouts_8w, 2) AS invalid_pct,
       ROUND(reversed_amt_8w / 1e5, 2)      AS reversed_lakh_8w,
       NTILE(4) OVER (ORDER BY invalid_8w DESC) AS wave
FROM nonbav
WHERE first_payouts_8w >= 50
ORDER BY invalid_8w DESC
LIMIT 10;
