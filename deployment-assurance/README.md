# Still the agent you shipped? Deployment assurance for a forward-deployed AI firm

Live: https://adimathur-creates.github.io/deployment-assurance/

What I would own at Deployment Inc: after go-live, prove each deployment's value in rupees and catch quiet failures before the client does.

Independent work. Not affiliated with Deployment Inc or Cars24; no client data. Deployments are illustrative and every rate is a labelled assumption.

## Findings (10 runs, 3 deployments, 120 days, 60 drift events)
- Watching model confidence caught every loud drift within a day and none of the 30 silent drifts.
- Waiting for client complaints caught everything after ~6.5 days, with ~6 false alarms per run.
- Random audits at 1% of volume were slower than complaints (~9 days).
- Risk-stratified audits + confidence watch, with the same 100 audits/day allocated by money at risk: all 60 drifts caught, drift losses down 54% vs waiting for complaints. Silent drift on the two expensive workflows caught in ~3 days instead of ~7.
- Value: crediting every returning lead overstated a re-engagement agent's value 3.4x; before/after overstated it 36%; a 5% holdout read the true value within ±₹4.7L/month for ₹1.4L/month.

## Run
```
node test/all.test.js     # 11 tests
node src/build_page.js
```
`src/sim.js` drift and monitoring simulation · `src/ledger.js` value measurement and holdout sizing
