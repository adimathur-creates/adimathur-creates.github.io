# Payouts pod metric dictionary (draft)

Simulation on fictional data. These are proposed definitions for a payouts team, written so every dashboard and every "why did X move" question starts from the same numbers. The SQL versions live in `sql/01_metric_layer.sql`.

## Units

| Term | Meaning |
|---|---|
| Attempt | One `transfer_id` sent to Cashfree. A retry is a new attempt. |
| Payout (intent) | One payment the merchant wanted to make, however many attempts it took. The final outcome is the last attempt's. |
| Mature | A payout at least 72 hours old. Cashfree polls pending transfers for up to 72 hours, and reversals can land up to about a day after a success. Final metrics use mature payouts only. |

## Core metrics

| Metric | Definition | Why this way |
|---|---|---|
| **Payout success rate** (headline) | Mature payouts whose final status is success and not reversed ÷ mature payouts sent to a bank | Counts what the merchant cares about: did the money arrive and stay. Excludes merchant-side insufficient-balance errors, which are reported separately. |
| Attempt success rate (infra) | Successful attempts ÷ all attempts | Useful for bank and route health. Misleading as a headline: retries count as extra failures. |
| Reversal rate | Mature payouts reversed by the beneficiary bank ÷ payouts sent | Hidden failure: looks like success for hours. |
| Failure cause mix | Share of failures by bucket: beneficiary (invalid / blocked account), bank (declined, gateway error), platform (connection, timeout), merchant (balance) | Tells you who has to act. |
| Time to final status | p50 / p95 / p99 seconds from first attempt to final status, instant modes only | p99 shows the long-pending tail that drives support tickets. |
| Retry overhead | Attempts ÷ payouts | Rising value = a bank problem or a merchant retry loop. |

## Merchant metrics

| Metric | Definition |
|---|---|
| Active merchant | At least one payout sent in the period |
| Activated merchant | First successful payout within 7 days of onboarding |
| Retained merchant | Weeks 7-8 volume at least 30% of weeks 1-2 (in this sample); in production, a rolling 4-week vs prior 4-week rule |
| Failure shock | A week with 20+ payouts where the merchant's own success rate falls 10+ points below its normal |
| At-risk flag | Weekly volume down 40%+ vs trailing 4-week average, plus a sub-92% success week in the prior four |

## Revenue (assumptions, fictional)

Fee charged per successful attempt: IMPS Rs 5, UPI Rs 4, NEFT Rs 3, RTGS Rs 20. Bank account verification Rs 2 per check. Replace with real price cards.
