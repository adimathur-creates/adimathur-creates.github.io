# Why did payout success drop on Tuesday?

**Simulation on fictional data.** This is not Cashfree data and not a real incident. Merchants, banks, volumes, prices and the Tuesday incident are invented, and the causes were planted on purpose so the SQL could be checked against a known answer. Status and reason names follow Cashfree's public Payouts docs.

A work sample for a Product Analyst role on a Payouts + SecureID team. It covers:

1. **One metric definition** for payout success rate, and why attempt-level success rate misleads (`METRICS.md`, `sql/01_metric_layer.sql`).
2. **A root-cause analysis** of a success-rate drop: is it real, where is it, when did it start, how much does each cause explain (mix/rate split), what was ruled out (`sql/03_tuesday_rca.sql`).
3. **A growth lever:** Payouts merchants that don't verify beneficiary accounts before the first payout, with sizing, a call list and a test design (`sql/04_bav_cross_sell.sql`).
4. **A retention signal:** failure spikes precede churn, with a back-tested early-warning rule (`sql/05_churn_early_warning.sql`).
5. **An AI runbook** for drafting incident summaries where every number must come from a query result (`ai/sr_drop_runbook.md`).

## Run it

Needs Python 3.10+ and numpy. Takes about a minute.

```
./run.sh
```

That runs: `generate_data.py` (fictional SQLite DB, ~450k transfers) → `run_sql.py` (every query in `sql/`, output to `results.json`) → `tests.py` (16 checks: the SQL recovers each planted cause, the decomposition adds up, the shock rule matches the answer key) → `build_page.py` (writes `index.html` from `results.json`, so no number on the page is typed by hand).

## Two corrections made while building, kept on purpose

- The first shock rule (any week 8+ points below normal) was right only 45 times out of 64 against the answer key: small merchants with two failures looked like shocks. The test caught it; the rule now needs 20+ payouts in the week and a 10-point fall (26 of 28 correct, but it misses small merchants).
- The first Tuesday baseline used the four previous Tuesdays. Two of them fall inside a separate October dip, which made the rest of Tuesday look 0.18 points better than it was. The baseline now uses the four most recent normal Tuesdays.

Built by Aditya Mathur with Claude.
