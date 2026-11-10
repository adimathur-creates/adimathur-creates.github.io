# Plan to NOC — GoodScore overdue-resolution analytics

Live: https://adimathur-creates.github.io/goodscore-plan-to-noc/

Where GoodScore's Detect → Reduce → Plan → Close → Rebuild path leaks between a detected overdue and a closure the member can see on their credit report.

**Simulated data.** The rates are assumptions drawn from public evidence (GoodScore's site and app listings, public reviews). They are written down in `src/simulate.py`. The event model, SQL, risk score and test designs are what carry over to real data.

```
python3 src/simulate.py    # writes data/*.csv
python3 src/analyze.py     # runs sql/analysis.sql in DuckDB, fits the risk score, sizes fixes -> results.json
python3 src/build_page.py  # builds index.html from src/template.html + results.json
```

Needs: `pip install duckdb pandas numpy`. `data/_sim_truth_income.csv` is the simulation's hidden "true income", used only for sizing; the product never sees it.

By Aditya Mathur. Not affiliated with GoodScore.
