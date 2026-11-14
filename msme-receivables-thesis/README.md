# Who gets India's small suppliers paid?

A seed thesis on MSME late payments after the 2026 reforms, written for an early-stage fintech fund (8i Ventures).
Live page: https://adimathur-creates.github.io/msme-receivables-thesis/

**Question.** Should a seed fund back a company in MSME late payments in 2027, and what shape must it have to matter to a $50M fund?

**Answer in brief.**
- Money and urgency moved to the buyer (Section 43B(h), the MSMED Amendment Act 2026). Supplier-side tools have the pain but no budget.
- The best shape is a buyer-led working-capital platform: compliance for the buyer first, then early payment on the same approved invoices.
- In the base case no shape returns the fund alone. The platform gets 0.58x at 10% exit ownership; it needs about Rs 68,000 crore financed a year to reach 1x.
- Claim-to-cash is the most underbuilt shape and the biggest winner from the 2026 amendment, but needs a balance sheet.

## Files
- `src/model.js` – six company shapes, eight criteria, a units-times-price revenue model, fund-return maths, break-even solver. Runs in Node and the browser.
- `src/facts.js` – every sourced figure with its URL.
- `src/build_page.js` – builds `index.html`.
- `test/model.test.js` – 16 tests (maths, ranking robustness, every input has a reason, every fact has a source).

```
node --test test/*.test.js
node src/build_page.js
```

Independent work from public sources. Not affiliated with or reviewed by 8i Ventures or any company named. Assumptions are labelled and editable on the page.
