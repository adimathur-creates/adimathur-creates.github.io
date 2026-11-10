# The Slow Scam — catching investment scams on Google Pay before the big transfer

Live: https://adimathur-creates.github.io/google-pay-slow-scam/

Google's 2025 India scam protections act when a scam is live on a call (unknown caller + screen sharing + a payment app). About three-quarters of the ₹19,813 crore Indians reported losing to cyber fraud in 2025 went to fake investment schemes, which run for days with no call at the moment of payment, and pay a different mule UPI ID each time. This project scores each payment on the **payer's own pattern** (new people, a stranger paid you first, rising amounts, money to new people vs your usual month), adds fraud lists as one signal, and responds with a ladder: a one-tap question, a warning that names the scam, a short hold.

**Simulated data.** Every rate is an assumption, written down in `src/simulate.js`. The engine, the metrics and the trade-off method are what carry over to real data; the numbers are not a forecast. Not affiliated with Google.

```
node src/simulate.js 2026 80000   # population, policies, sweep, ablation -> results.json, data/sample_payments.csv.gz
python3 src/check_sql.py          # sql/metrics.sql in DuckDB; checks the engine's velocity signal against SQL
node --test test/*.test.js        # engine tests (look-alike cases, fatigue rules)
node src/build_page.js            # index.html from src/template.html + results.json + sql/output.json
```

Needs Node 18+ and `pip install duckdb pandas`. Thresholds were chosen on seed 7; reported numbers are from seed 2026.

| File | What it is |
|---|---|
| `src/engine.js` | Journey score + fatigue rules. Runs in Node and in the page's prototype. |
| `src/stories.js` | Five scripted payers used by the prototype and the timeline. |
| `src/simulate.js` | Synthetic payers (8 genuine personas, 3 scam types), four policies, threshold sweep, ablation, experiment sizing. |
| `sql/metrics.sql` | Journey shape, bait rate, score bands, persona friction; recomputes a signal in SQL as a check. |
| `test/engine.test.js` | 15 tests. |

By Aditya Mathur.
