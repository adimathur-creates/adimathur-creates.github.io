# Numbers you can trust

A check of how mutual fund client reports go wrong without anything crashing, written for Wealthy's portfolio reporting team (Holdings, Family Holdings, MF Reports).

**Live page:** https://adimathur-creates.github.io/wealthy-numbers-you-can-trust/

Independent work. Not affiliated with Wealthy. Synthetic data; every rate is a labelled assumption.

## What it does
- `src/calc.js`: XIRR (bisection, matches Excel's documented example), absolute return, FIFO lots, capital gains under FY 2026-27 rules (equity 20% / 12.5% above ₹1.25 lakh per person, grandfathering for units bought before 1 Feb 2018, debt bought from 1 Apr 2023 at slab), unused exemption with ELSS lock-in.
- `src/book.js`: a synthetic book of 2,000 families (SIPs, lump sums, redemptions, switches) with data problems: holdings bought elsewhere without cost, unlinked switches, purchases still syncing. Calibrated to about ₹5 lakh per member.
- `src/report.js`: three reports from the same book: complete data, a shortcut report (common methods), and a checked report that holds back what it can't confirm and says why. Measures how often and how badly the shortcut report misleads.
- `src/experiments.js`: 3 seeds and one-at-a-time sensitivity; writes `results.json`.
- `src/build_page.js`: builds `index.html` with an interactive family report.

## Run
```
node test/calc.test.js && node test/report.test.js   # 17 tests
node src/experiments.js && node src/build_page.js
```
