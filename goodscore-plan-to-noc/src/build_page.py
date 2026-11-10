"""Builds ../index.html from template.html + results.json. Every number on the page comes from here."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
R = json.loads((ROOT / "results.json").read_text())
r = R["results"]
f = r["funnel"][0]
acc_share = f["accepted"] / f["detected"]
fin = lambda k: f[k] / f["could_finish"] * acc_share * 100
tc = {x["invisible_45d"]: x for x in r["tickets_and_churn"]}
lag = {x["lender_type"]: x for x in r["lag_by_lender_type"]}
sv = {(x["dpd_bucket"], x["bureau_status"]): x for x in r["settled_vs_closed"]}
pg = {x["first_due_lands"][:4]: x for x in r["completion_by_payday_gap"]}
emi = r["emi_completion_by_affordability"]
emi_plans = sum(x["plans"] for x in emi)
over35 = [x for x in emi if x["emi_band"].startswith("d")]
under35 = [x for x in emi if not x["emi_band"].startswith("d")]
wavg = lambda xs: sum(x["completion"] * x["plans"] for x in xs) / sum(x["plans"] for x in xs)
s = r["sizing"]; m = r["risk_model"]; dq = r["dq_bureau_duplicates"][0]
paid45 = tc[True]["paid_off_accounts"] + tc[False]["paid_off_accounts"]

K = {
  "detected": f"{f['detected']:,}", "plans": f"{f['accepted']:,}",
  "p_offered": f"{f['offered']/f['detected']*100:.0f}", "p_accepted": f"{acc_share*100:.0f}",
  "p_first": f"{f['first_paid']/f['detected']*100:.0f}", "p_paid": f"{fin('paid_off'):.0f}",
  "p_noc": f"{fin('noc'):.0f}", "p_ref": f"{fin('reflected'):.0f}", "p_ref45": f"{fin('reflected_45d'):.0f}",
  "invisible45": f"{tc[True]['paid_off_accounts']/paid45*100:.0f}",
  "tix_inv": f"{tc[True]['tickets_per_100']:.0f}", "tix_vis": f"{tc[False]['tickets_per_100']:.0f}",
  "can_inv": f"{tc[True]['user_cancelled_within_60d']*100:.0f}", "can_vis": f"{tc[False]['user_cancelled_within_60d']*100:.0f}",
  "aligned_share": f"{pg['0-5 ']['plans']/f['could_finish']*100:.0f}",
  "comp_aligned": f"{pg['0-5 ']['completion']*100:.0f}", "comp_pre": f"{pg['16-2']['completion']*100:.0f}",
  "first_aligned": f"{pg['0-5 ']['first_instalment_paid']*100:.0f}", "first_pre": f"{pg['16-2']['first_instalment_paid']*100:.0f}",
  "over35_share": f"{sum(x['plans'] for x in over35)/emi_plans*100:.0f}",
  "comp_over35": f"{wavg(over35)*100:.0f}", "comp_under35": f"{wavg(under35)*100:.0f}",
  "waiver3089": f"{sv[('30-89','SETTLED')]['median_waiver_rupees']:,.0f}",
  "sc_settled": f"{sv[('30-89','SETTLED')]['avg_score_change_90d']:.0f}", "sc_closed": f"{sv[('30-89','CLOSED')]['avg_score_change_90d']:.0f}",
  "sc_gap": f"{sv[('30-89','CLOSED')]['avg_score_change_90d']-sv[('30-89','SETTLED')]['avg_score_change_90d']:.0f}",
  "settled3089": f"{sv[('30-89','SETTLED')]['accounts']/(sv[('30-89','SETTLED')]['accounts']+sv[('30-89','CLOSED')]['accounts'])*100:.0f}",
  "lag_bank": f"{lag['bank']['median_days_to_bureau']:.0f}", "lag_nbfc": f"{lag['nbfc']['median_days_to_bureau']:.0f}",
  "lag_dig": f"{lag['digital']['median_days_to_bureau']:.0f}",
  "inv_bank": f"{lag['bank']['not_visible_by_day_45']*100:.0f}", "inv_nbfc": f"{lag['nbfc']['not_visible_by_day_45']*100:.0f}",
  "inv_dig": f"{lag['digital']['not_visible_by_day_45']*100:.0f}",
  "nonoc_dig": f"{lag['digital']['no_noc_yet']*100:.0f}", "nonoc_bank": f"{lag['bank']['no_noc_yet']*100:.0f}",
  "auc": f"{m['auc']:.2f}", "dec1": f"{m['break_rate_by_decile'][0]*100:.0f}", "dec10": f"{m['break_rate_by_decile'][-1]*100:.0f}",
  "top20": f"{m['top20_capture']*100:.0f}", "break_rate": f"{m['break_rate']*100:.0f}",
  "n_train": f"{m['n_train']:,}", "n_test": f"{m['n_test']:,}",
  "s_base": f"{s['baseline']*100:.0f}", "s_pay": f"{s['payday_due_date']*100:.0f}", "s_fit": f"{s['fit_check_longer_tenure']*100:.0f}",
  "s_both": f"{s['both']*100:.0f}", "s_all": f"{s['both_plus_autopay_default']*100:.0f}",
  "s_pay_d": f"{(s['payday_due_date']-s['baseline'])*100:.0f}", "s_both_d": f"{(s['both']-s['baseline'])*100:.0f}",
  "fit_n": f"{s['plans_needing_fit']:,}",
  "s_plans": f"{s['plans']:,}",
  "e1n": f"{r['experiments']['e1']['n_per_arm']:,}", "e2n": f"{r['experiments']['e2']['n_per_arm']:,}",
  "e3n": f"{r['experiments']['e3']['n_per_arm']:,}",
  "dq_raw": f"{dq['raw_rows']:,}", "dq_exact": f"{dq['exact_distinct']:,}", "dq_norm": f"{dq['normalised_distinct']:,}",
  "dq_true": f"{dq['true_accounts']:,}", "dq_infl": f"{dq['raw_rows']/dq['true_accounts']:.2f}",
  "dq_exact_infl": f"{dq['exact_distinct']/dq['true_accounts']:.2f}",
  "dq_err": f"{abs(dq['normalised_distinct']-dq['true_accounts'])/dq['true_accounts']*100:.1f}",
}
page_data = {"K": K, "results": r, "sql": R["sql"]}
tpl = (ROOT / "src" / "template.html").read_text()
html = tpl.replace("/*__DATA__*/null", json.dumps(page_data, separators=(",", ":")))
import re
missing = set(re.findall(r'data-k="(\w+)"', html)) - set(K)
assert not missing, missing
(ROOT / "index.html").write_text(html)
print("ok", len(html) // 1024, "KB"); print(K)
