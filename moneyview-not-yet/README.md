# Not yet, not no: what happens after a declined loan application

Live: https://adimathur-creates.github.io/moneyview-not-yet/

A product proposal written for the Moneyview APM role (consumer lending, growth). Turns a declined application into a specific path back: the reason in plain words (English and Hindi), the one change that would help, a check date, a soft pre-check that doesn't affect the credit score, a smaller-amount offer for affordability declines, and honest alternatives when nothing will change.

Independent work. Not affiliated with Moneyview; no Moneyview data. Reason mix and behaviour rates are labelled assumptions.

## Findings (60,000 declined users, 26 weeks, 5 runs)
- Even if a plan changes no behaviour: re-approvals 177 → 425 per 1,000 declines; hard enquiries per user down 42%; users stuck in 3+ declines 34% → 4%.
- The cost: re-approvals default at 4.08% vs 3.50%; the extra approvals default at ~4.5%, under a 9.1% break-even on stated assumptions.
- A/B test: ~2,250 declined users per arm; primary metric approvals within 180 days per 1,000 declines; delinquency guardrail with a stop rule.

## Run
```
node test/all.test.js     # 9 tests
node src/build_page.js
```
