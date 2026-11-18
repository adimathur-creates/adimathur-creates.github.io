# From signup to first payment (simulation on fictional data)

A program pack for a product leadership office: one defined problem (merchants who sign up for a payment gateway but never take a first successful payment, or take weeks to), structured, sized, planned across functions, measured, and reported in a weekly leadership note generated from the tracker.

**Every merchant, rate, rupee amount, owner and date is invented. Nothing here is PayU data.** Public facts on the page are sourced.

Independent work by Aditya Mathur for an application to PayU's Associate, Product Strategy & Operations role. Built with Claude.

## Files
- `index.html` — the page, self-contained (engine and tracker data are inlined; open it on its own)
- `index.src.html` + `build_page.py` — source of the page; run `python3 build_page.py` after editing engine.js or program.js
- `engine.js` — the simulation (4,800 fictional merchants, four levers, business case, experiment sizing, tracker rules)
- `program.js` — two weekly snapshots of a fictional program tracker
- `tests/run.js` — 23 checks: `node tests/run.js`

## What the tests check
Determinism, funnel order, each lever never lowering the rates, no high-risk merchant on the simplified route, rejections only where they should be, the sample-size formula against the textbook value, payback, and every RAG rule (late, dependency, overdue decision), plus the root-cause tracing in the weekly note.
