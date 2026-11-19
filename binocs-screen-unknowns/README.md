# The deal you never saw

A product proposal for Binocs Deal Screening: how to handle missing data in teasers without quietly rejecting deals that fit.
Live page: https://adimathur-creates.github.io/binocs-screen-unknowns/

- **Problem.** Teasers often leave out EBITDA, the stake for sale or customer concentration. A forced yes/no has to guess, and its wrong "no"s are invisible.
- **Proposal.** A third verdict, *Ask*: up to two banker questions, ranked by how likely the answer settles the deal, drafted as one email. Plus a *Review* route for near misses.
- **Result (simulated, 30 years x 800 deals).** A forced yes/no kept ~34% of truly fitting deals; Ask kept all of them, with 67% fewer wasted full screens and 32% fewer analyst hours than passing everything not ruled out.

## Files
- `src/engine.js` – deterministic screening decision layer (pass / reject / ask / review), every verdict traceable to a field and quote.
- `src/simulate.js` – a year of inbound deals for a mid-market fund; three policies compared; all assumptions labelled.
- `src/teasers.js` – four fictional teasers for the prototype.
- `src/build_page.js` – builds `index.html` (prototype, results, feature spec).
- `test/engine.test.js` – 16 tests.

```
node --test test/*.test.js
node src/build_page.js
```

Independent work; not affiliated with or reviewed by Binocs. Companies, teasers and mandate are fictional.
