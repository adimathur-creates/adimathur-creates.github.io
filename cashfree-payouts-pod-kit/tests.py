"""Checks that the SQL finds what the generator planted, and that the maths holds.
Usage: python3 tests.py payouts.db results.json
"""
import sqlite3, json, sys

db, res = sys.argv[1], sys.argv[2]
r = json.load(open(res))
con = sqlite3.connect(db)
fails = 0

def check(name, cond, detail=""):
    global fails
    print(("PASS " if cond else "FAIL ") + name + (f"  [{detail}]" if detail else ""))
    fails += 0 if cond else 1

h = r["headline_three_numbers"]["rows"]
change = h[2][2] - h[2][1]
dec = r["decomposition"]["rows"]
s = sum(d[7] for d in dec)
check("decomposition adds up to the headline change", abs(s - change) < 0.01, f"{s:.3f} vs {change:.3f}")
check("real drop is smaller than the dashboard drop", (h[2][1] - h[2][2]) < (h[0][1] - h[0][2]))
check("top bank x mode cell is Bank F", r["where_bank_mode"]["rows"][0][0] == "F")
check("top merchant contributor is M0412", r["merchant_contribution"]["rows"][0][0] == "M0412")
alert = [x[0] for x in r["bank_f_15min"]["rows"] if x[4]]
check("Bank F alert fires once, between 11:00 and 11:30", len(alert) == 1 and "11:00" <= alert[0] <= "11:30", str(alert))
m0412 = next(d for d in dec if d[0].startswith("1")); bf = next(d for d in dec if d[0].startswith("3"))
rest = next(d for d in dec if d[0].startswith("4"))
check("the two planted causes explain more than the whole drop", m0412[7] + bf[7] <= change, f"{m0412[7]+bf[7]:.3f}")
check("'everything else' is within +/-0.10 pts (noise)", abs(rest[7]) < 0.10, f"{rest[7]:.3f}")
ro = {x[0]: x for x in r["ruled_out"]["rows"]}
pdr = r["platform_daily_range"]["rows"][0]
check("Tuesday platform-side failure rate inside the normal daily range", pdr[0] <= ro["Tuesday"][1] <= pdr[2], f"{ro['Tuesday'][1]} in [{pdr[0]}, {pdr[2]}]")
check("API p95 flat (within 10 ms)", abs(ro["Tuesday"][4] - ro["baseline"][4]) <= 10)
d = r["daily_kpis"]; c = d["columns"]
check("payout SR >= naive attempt SR every day",
      all(row[c.index("payout_success_rate")] >= row[c.index("attempt_success_rate_naive")] for row in d["rows"]))
fpq = {x[0]: x for x in r["first_payout_quality"]["rows"]}
check("unverified first payouts fail on invalid accounts 3x+ as often",
      fpq["not verified"][3] > 3 * fpq["verified with BAV first"][3])
cs = {x[0]: x for x in r["churn_vs_shock"]["rows"]}
check("shocked merchants churn 3x+ as often", cs["had a failure shock in weeks 3-5"][3] > 3 * cs["no shock"][3])

# shock detection vs ground truth (the SQL never reads _ground_truth; only this test does)
q = r["churn_vs_shock"]["sql"].rsplit("SELECT CASE had_shock", 1)[0] + \
    "SELECT p.merchant_id, p.had_shock, g.shock FROM per_merchant p JOIN _ground_truth g USING (merchant_id) WHERE p.early >= 20"
rows = con.execute(q).fetchall()
tp = sum(1 for _, a, b in rows if a and b); fp = sum(1 for _, a, b in rows if a and not b)
check("detected shocks are real shocks (precision >= 90%)", tp / max(tp + fp, 1) >= 0.9, f"tp={tp} fp={fp}")
open("shock_precision.txt", "w").write(f"{tp} times out of {tp+fp}")
bt = r["early_warning_backtest"]["rows"][0]
check("early-warning back-test precision >= 60%", (bt[2] or 0) >= 60, f"{bt[2]}%")

# sanity on the raw table
n_dupe = con.execute("SELECT COUNT(*) - COUNT(DISTINCT transfer_id) FROM transfers").fetchone()[0]
check("transfer ids unique", n_dupe == 0)
bad_rev = con.execute("SELECT COUNT(*) FROM transfers WHERE outcome='REVERSED' AND (reversed_at IS NULL OR reversed_at <= resolved_at)").fetchone()[0]
check("every reversal happens after the success it reverses", bad_rev == 0)

print(f"\n{'ALL PASS' if fails == 0 else str(fails) + ' FAILED'}")
sys.exit(1 if fails else 0)
