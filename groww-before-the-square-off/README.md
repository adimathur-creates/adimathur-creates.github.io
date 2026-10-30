# Before the Square-off

A product case for Groww's margin trading facility (MTF), built as independent work for Groww's Associate Product Manager role. Live page: https://adimathur-creates.github.io/groww-before-the-square-off/

**Synthetic data.** Margin rules come from Groww's public MTF terms and risk policy; business numbers from press coverage of Groww's results. No Groww internal data. The cover formula is the standard reading of a ratio the public policy doesn't define.

## What's here

| File | What it is |
|---|---|
| `engine.js` | Margin health (cover, call price, square-off price, break-even, exact fix), interest accrual, synthetic book simulation, outcome model |
| `index.html` | Problem, calculator, five failure modes, product, alert-threshold trade-off, test plan with SQL, requirements |
| `test.mjs` | `node test.mjs`: 17 checks on the margin maths and simulation |

## Key numbers (from the rules, not assumptions)

- At 4x leverage a 4.8% fall triggers a margin call; a 20% fall triggers instant square-off.
- A haircut rise from 25% to 35% triggers a call with no price move.
- With interest unpaid, a flat max-leverage position reaches a call in 122 days.

Aditya Mathur · adityamathur2004@gmail.com
