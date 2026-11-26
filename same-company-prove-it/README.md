# Same company? Prove it.

Governed entity resolution for corporate client data. **A simulation on fictional data, built with Claude by Aditya Mathur (Nov 2026).**

Every company, identifier, source system, vendor and error rate here is invented. Identifiers use a made-up format starting with `FX`. This is not J.P. Morgan data and does not describe J.P. Morgan's systems or processes.

## The problem it works on

When a vendor refresh lands, resolve every record to the right legal entity without false merges; keep every steward correction that is still true; re-open (not silently apply or drop) any correction that newer evidence contradicts; and explain any match or attribute value.

## What is in it

| File | What it does |
|---|---|
| `er/generate.py` | Fictional universe: ~1,200 legal entities (groups, subsidiaries, sponsor funds), renames and moves, four internal sources and two vendors with different error profiles, plus traps (namesakes, siblings, wrong IDs, legal forms, non-client vendor rows) |
| `er/textsim.py` | Normalisation, legal-form mapping, Jaro-Winkler, token overlap, phonetic key |
| `er/engine.py` | Blocking, 13 features, deterministic rules and vetoes, logistic regression, review band, constrained clustering, golden-profile arbitration with lineage, hierarchy checks |
| `er/refresh.py` | Day-30 vendor refresh after steward overrides: stateless vs sticky vs governed |
| `run.py` | Runs everything, writes `results.json` (add `--fast` to skip the 5-seed robustness run) |
| `build_page.py` + `template.html` | Builds `index.html` from `results.json` |
| `tests/test_er.py` | 14 checks |

## Run

```
python3 run.py          # about 3.5 minutes with robustness seeds
python3 build_page.py
python3 -m pytest -q    # 14 checks, about 40 seconds
```

Plain Python 3 for the simulation; the checks use pytest.

## Key results (seed 7/11, fictional)

- 11.4M possible pairs cut to 66k candidates, keeping 99.9% of true pairs
- Auto-merge threshold 0.7 (lowest meeting 99.5% precision on held-out pairs), review band 0.5–0.7: 1,012 pairs to stewards
- 0 false-merge clusters, 17 entities still split (1.4%); across 5 seeds false merges ranged 0–1
- Exact-name baseline: 32 false merges, 443 splits; fuzzy-name baseline: 215 false merges
- Day 30: stateless re-run undid 14 fixes and re-asked 1,075 pairs; sticky replay applied 6 outdated parents silently; governed kept all still-true fixes and re-opened exactly those 6

## Limits

Error rates, steward accuracy (98%) and minutes per pair (3) are assumptions. Labels come from ground truth. The logistic regression is a stand-in. The author has not worked on entity resolution in production.
