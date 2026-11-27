# Four shots: spending a UPI AutoPay cycle's attempts wisely

Live: https://adimathur-creates.github.io/jodo-four-shots/

Written for Jodo Collect (Founder's Office, Product & Analytics). Under NPCI rules each UPI AutoPay mandate gets one attempt and three retries per cycle, off-peak only. This proposal schedules the four attempts for when payers actually have money, and measures what reminders and pay links add on top.

Independent work. Not affiliated with Jodo; no Jodo data. Payer behaviour is simulated and every rate is a labelled assumption.

## Findings (30,000 payers, 3 months, 5 runs)
- Retry every morning for 3 days: 73.5% of cycles collected. Spread (day 0, 2, 5, 9): 83.5%. Inflow-aware timing: 94.1%. With reminder and pay link: 95.6%.
- Timing does 93% of the work; reminders and pay links add ~1.5 points.
- Revoked mandates over 3 months: 8.8% → 4.6%. Manual merchant chases per 100 cycles: 34 → 4.

## Run
```
node test/all.test.js     # 9 tests
node src/build_page.js
```
