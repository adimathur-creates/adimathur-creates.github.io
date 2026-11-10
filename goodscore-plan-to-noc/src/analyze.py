"""
Runs sql/analysis.sql on the simulated book, fits the plan-risk model, sizes the fixes,
and writes results.json for the page.   python3 analyze.py
"""
import json, re
from pathlib import Path
import duckdb
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
con = duckdb.connect()
for f in DATA.glob("*.csv"):
    if not f.name.startswith("_"):
        con.execute(f"CREATE TABLE {f.stem} AS SELECT * FROM read_csv_auto('{f}', header=true)")

sql = (ROOT / "sql" / "analysis.sql").read_text()
blocks = re.split(r"^-- name: (\w+)\s*$", sql, flags=re.M)[1:]
queries = dict(zip(blocks[::2], [b.strip() for b in blocks[1::2]]))
out = {"sql": queries, "results": {}}

def rows(df):
    return json.loads(df.to_json(orient="records", date_format="iso"))

for name, q in queries.items():
    if name == "base":
        con.execute(q)
        continue
    df = con.execute(q).df()
    for c in df.columns:
        if pd.api.types.is_timedelta64_dtype(df[c]):
            df[c] = df[c].dt.days
    out["results"][name] = rows(df)

# ------------------------------------------------------------ plan-risk model (at acceptance time only)
d = con.execute("""
  SELECT paid_off::int AS done, emi_to_income, (income_source='declared')::int AS declared,
         (days_after_payday<=5)::int AS aligned, autopay_mandate::int AS mandate,
         (dpd_bucket='180+')::int AS dpd180, (dpd_bucket='90-179')::int AS dpd90,
         (lender_type='digital')::int AS digital, (lender_type='nbfc')::int AS nbfc,
         (city_tier=3)::int AS tier3, tenure_months,
         (SELECT count(*) FROM overdue_accounts o WHERE o.user_id = acct.user_id) AS n_overdue
  FROM acct WHERE plan_type='emi' AND could_finish
""").df()
d["broke"] = 1 - d.done
feats = ["emi_to_income", "declared", "aligned", "mandate", "dpd180", "dpd90", "digital", "nbfc", "tier3",
         "tenure_months", "n_overdue"]
X = d[feats].astype(float).values
mu, sd = X.mean(0), X.std(0)
Xs = np.c_[np.ones(len(X)), (X - mu) / sd]
y = d.broke.values.astype(float)
rng = np.random.default_rng(7)
test = rng.random(len(y)) < 0.3
w = np.zeros(Xs.shape[1])
for _ in range(25):                                   # IRLS logistic regression
    p = 1 / (1 + np.exp(-Xs[~test] @ w))
    W = p * (1 - p)
    H = Xs[~test].T @ (Xs[~test] * W[:, None]) + 1e-6 * np.eye(len(w))
    w += np.linalg.solve(H, Xs[~test].T @ (y[~test] - p))
pt = 1 / (1 + np.exp(-Xs[test] @ w))
yt = y[test]
order = np.argsort(-pt)
ranks = np.empty(len(pt)); ranks[np.argsort(pt)] = np.arange(1, len(pt) + 1)
pos = yt == 1
auc = (ranks[pos].sum() - pos.sum() * (pos.sum() + 1) / 2) / (pos.sum() * (~pos).sum())
dec = pd.DataFrame({"p": pt, "y": yt}).sort_values("p", ascending=False).reset_index(drop=True)
dec["decile"] = dec.index * 10 // len(dec) + 1
lift = dec.groupby("decile").y.mean().round(3).tolist()
top20 = dec[dec.decile <= 2].y.sum() / dec.y.sum()
coef = sorted([{"feature": f, "odds_per_sd": round(float(np.exp(c)), 2)} for f, c in zip(feats, w[1:])],
              key=lambda r: -abs(np.log(r["odds_per_sd"])))
out["results"]["risk_model"] = {"n_train": int((~test).sum()), "n_test": int(test.sum()), "auc": round(float(auc), 3),
                                "break_rate": round(float(y.mean()), 3), "break_rate_by_decile": lift,
                                "top20_capture": round(float(top20), 3), "coefficients": coef}

# ------------------------------------------------------------ sizing the fixes (under the simulation's own rules)
truth = pd.read_csv(DATA / "_sim_truth_income.csv")
e = con.execute("""SELECT account_id, user_id, plan_type, tenure_months, instalment, settlement_amount, income_known,
                          income_source, payday_dom, autopay_mandate, dpd_bucket, days_after_payday,
                          (SELECT count(*) FROM overdue_accounts o WHERE o.user_id = acct.user_id) AS n_overdue
                   FROM acct WHERE accepted AND could_finish""").df().merge(truth, on="user_id")
sig = lambda x: 1 / (1 + np.exp(-x))

def p_complete(df, aligned, mandate, inst):
    a = np.maximum(0, inst / df.income_true - 0.25)
    ots = df.plan_type == "one_time"
    r = df.settlement_amount / df.income_true
    p1 = np.where(ots, sig(1.9 - 0.8 * r + 0.6 * aligned + 0.5 * mandate),
                  sig(1.7 + 0.9 * aligned + 0.8 * mandate - 4.0 * a - 0.35 * (df.dpd_bucket == "180+")))
    h = sig(-3.3 - 0.8 * aligned - 0.9 * mandate + 5.0 * a + 0.3 * (df.n_overdue > 2))
    n = np.where(ots, 1, df.tenure_months)
    surv = (1 - h * 0.65) ** (n - 1)
    return float(np.mean(p1 * surv))

al = (e.days_after_payday <= 5).values
mand = e.autopay_mandate.values.astype(int)
base = p_complete(e, al, mand, e.instalment)
fix_payday = p_complete(e, np.ones(len(e)), mand, e.instalment)
# Lever 2 ("fit check"): when the EMI is above 35% of known income (typed income discounted by 25%),
# ask the lender for a longer tenure (up to 12 months). Assume 60% of lenders agree.
inc_cap = np.where(e.income_source == "declared", 0.75 * e.income_known, e.income_known)
need = np.ceil(e.settlement_amount / (0.35 * inc_cap))
agree = np.random.default_rng(11).random(len(e)) < 0.60
ten2 = np.where((e.plan_type == "emi") & agree, np.clip(need, e.tenure_months, 12), e.tenure_months)
e2 = e.assign(tenure_months=ten2)
inst2 = np.where(e.plan_type == "emi", e.settlement_amount / ten2, e.instalment)
fix_sizing = p_complete(e2, al, mand, inst2)
fix_both = p_complete(e2, np.ones(len(e)), mand, inst2)
fix_all = p_complete(e2, np.ones(len(e)), np.ones(len(e)), inst2)
out["results"]["sizing"] = {"plans": int(len(e)), "baseline": round(base, 3), "payday_due_date": round(fix_payday, 3),
                            "fit_check_longer_tenure": round(fix_sizing, 3), "plans_needing_fit": int(((e.plan_type=="emi") & (need > e.tenure_months)).sum()), "both": round(fix_both, 3),
                            "both_plus_autopay_default": round(fix_all, 3)}

# ------------------------------------------------------------ experiment sample sizes (two proportions, a=.05, power=.8)
def n_per_arm(p0, p1):
    za, zb = 1.959964, 0.841621
    pb = (p0 + p1) / 2
    return int(np.ceil((za * np.sqrt(2 * pb * (1 - pb)) + zb * np.sqrt(p0 * (1 - p0) + p1 * (1 - p1))) ** 2 / (p1 - p0) ** 2))

f = out["results"]["funnel"][0]
tc = {r["invisible_45d"]: r for r in out["results"]["tickets_and_churn"]}
out["results"]["experiments"] = {
    "e1": {"metric": "first instalment paid on time", "n_per_arm": n_per_arm(f["first_paid"] / f["accepted"], f["first_paid"] / f["accepted"] + 0.04)},
    "e2": {"metric": "EMI plan completion", "n_per_arm": n_per_arm(base, base + 0.04)},
    "e3": {"metric": "tickets per 100 paid-off accounts (binary: any ticket)",
           "n_per_arm": n_per_arm(tc[True]["tickets_per_100"] / 100, tc[True]["tickets_per_100"] / 100 * 0.7)},
}
(ROOT / "results.json").write_text(json.dumps(out, indent=1, default=str))
print(json.dumps(out["results"], indent=1, default=str)[:9000])
