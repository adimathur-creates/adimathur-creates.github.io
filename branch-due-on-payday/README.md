# Due on payday

A repayment proposal for Branch India: set instalment due dates for the day after the borrower is paid, collect with AutoPay on that day, and offer a pre-agreed half payment when even that fails.
Live page: https://adimathur-creates.github.io/branch-due-on-payday/

- **Why.** Branch India's FY25 credit cost was Rs 398 Cr against Rs 770 Cr net income (Acuité). Many first-instalment misses on small loans are timing, not intent.
- **Evidence.** A randomised fintech trial in Indonesia found aligning the due date with payday raised repayment likelihood by 27%.
- **Simulated result (20 runs x 20,000 borrowers, 3 instalments).** First-instalment misses 31% -> 15%; collection contacts -65%; 30+ days past due 10.7% -> 5.4% with the full package. Payday dates alone do not cut 30+ (a miss after payday waits a month for the next salary). Write-offs unchanged: credit risk is not a calendar problem.
- **Experiment.** Four arms, randomised by borrower; ~3,400 borrowers per arm detect a 10% drop in first-instalment misses.

## Files
- `src/dates.js` – due-date engine (weekends, last working day, 15-day window, per-day interest).
- `src/simulate.js` – repayment simulation, four policies, labelled assumptions, sample-size calculator.
- `src/build_page.js` – builds `index.html` (planner, results, sensitivity, experiment plan).
- `test/all.test.js` – 16 tests.

```
node test/all.test.js
node src/build_page.js
```

Independent work; not affiliated with or reviewed by Branch International. The simulation uses assumptions, not Branch data.
