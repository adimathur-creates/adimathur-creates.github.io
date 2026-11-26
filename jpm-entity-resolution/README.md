# Same name, different company: governed entity resolution for Client 360

Live: https://adimathur-creates.github.io/jpm-entity-resolution/

A corporate bank holds one client under many IDs, and different clients under almost the same name. This project designs and simulates the product layer around entity resolution: explainable match decisions, hard rules no score can override, a hold for ambiguous records, cluster-level human review, overrides that survive rebuilds, and attribute arbitration with lineage.

Independent work. Not affiliated with J.P. Morgan; no J.P. Morgan data. Records are synthetic and imitate five source types (KYC, credit, CRM, GLEIF LEI registry, a commercial vendor). Every rate, weight and threshold is a labelled assumption.

## Findings (5 runs, ~3,900 records each)
- Fuzzy name + address matching: 92% recall, ~86 wrongly merged profiles per run, 149 of 199 same-name twin companies merged.
- Governed design: 99.6% precision, 96.7% recall, ~4 wrongly merged profiles (−95%), 60% fewer duplicates; 17 of 199 twins merged.
- One review question per pair of clusters instead of per record pair: 71% fewer review tasks.
- Overrides stored on source-record IDs + versions instead of golden-record IDs: 74% fewer review tasks over six rebuilds, 0 reverted fixes instead of 10.
- Vendor value shows in profile accuracy, not match recall: removing the commercial vendor cut profile accuracy 92.3% → 81.7%.
- Parked: logistic regression trained on existing process labels needed 39% more review than hand-set weights at 99% precision.

## Run
```
node test/all.test.js     # 16 tests
node src/build_page.js    # rebuilds index.html (~20s)
```
`src/data.js` synthetic sources · `src/match.js` normalisation, blocking, evidence, hard rules · `src/resolve.js` policies, constrained clustering, evaluation · `src/govern.js` monthly rebuilds and override memory · `src/arbitrate.js` profiles and lineage · `src/learn.js` learned-weights test
