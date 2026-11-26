"""Builds index.html from results.json. Run after run.py."""
import json
import html

R = json.load(open("results.json"))


def pct(x, d=1):
    return f"{x*100:.{d}f}%"


def n(x):
    return f"{x:,}"


# display legal name from the winning record, not the normalised key
for ex in R["lineage_examples"]:
    by = {r["rec_id"]: r for r in ex["records"]}
    g = ex["golden"]["legal_name"]
    if g["rec_id"] in by:
        g["display"] = by[g["rec_id"]]["name"]

modes = {m["mode"]: m for m in R["refresh"]["modes"]}
rob = R.get("robustness", [])
fm = [x["false_merge_clusters"] for x in rob] or [R["resolution"]["false_merge_clusters"]]
sp = [x["split_entities"] for x in rob] or [R["resolution"]["split_entities"]]
b = R["blocking"]
res = R["resolution"]
base = R["baselines"]
arb = R["arbitration"]
ren = R["arbitration_renamed_only"]
hyb = arb["consensus + registry check"]["legal_name"]
va, vb = R["vendors"]["VENDOR_A"], R["vendors"]["VENDOR_B"]

T = {
    "ENTITIES": n(R["universe"]["entities"]),
    "RECORDS": n(b["records"]),
    "ALL_PAIRS": n(b["all_pairs"]),
    "CAND_PAIRS": n(b["candidate_pairs"]),
    "CAND_SHARE": pct(b["candidate_pairs"] / b["all_pairs"], 2),
    "BLOCK_RECALL": pct(b["blocking_recall"], 2),
    "TRUE_IN": n(b["true_pairs_in_blocks"]), "TRUE_ALL": n(b["true_pairs_total"]),
    "T_AUTO": str(R["thresholds"]["auto_match"]), "T_REVIEW": str(R["thresholds"]["review_floor"]),
    "REVIEW_PAIRS": n(R["review_pairs"]),
    "REVIEW_HOURS": f'{R["review_pairs"]*3/60:.0f}',
    "FM": str(res["false_merge_clusters"]), "SPLITS": str(res["split_entities"]),
    "DUP_RATE": pct(res["duplicate_rate"]), "PREC": pct(res["pair_precision"], 2), "REC": pct(res["pair_recall"], 2),
    "B0_REC": pct(base["B0 exact name + country"]["pair_recall"]), "B0_SPLITS": n(base["B0 exact name + country"]["split_entities"]),
    "B0_FM": str(base["B0 exact name + country"]["false_merge_clusters"]),
    "B1_FM": str(base["B1 fuzzy name >= 0.92 + country"]["false_merge_clusters"]),
    "B2_FM": str(base["B2 shared ID only"]["false_merge_clusters"]),
    "FM_RANGE": f"{min(fm)} to {max(fm)}", "SP_RANGE": f"{min(sp)} to {max(sp)}", "N_SEEDS": str(len(rob) or 1),
    "S_REV": n(modes["stateless"]["review_pairs_for_stewards"]), "S_HRS": str(modes["stateless"]["steward_hours"]),
    "S_UNDONE": str(modes["stateless"]["merge_fixes_undone"] + modes["stateless"]["parent_fixes_undone"]),
    "G_REV": n(modes["governed"]["review_pairs_for_stewards"]), "G_HRS": str(modes["governed"]["steward_hours"]),
    "K_STALE": str(modes["sticky"]["stale_overrides_applied_silently"]),
    "G_REOPEN": str(modes["governed"]["overrides_reopened_for_review"]),
    "N_MERGE_OV": str(R["refresh"]["merge_overrides"]), "N_PARENT_OV": str(R["refresh"]["parent_overrides"]),
    "N_ACQ": str(R["refresh"]["acquisitions_after_override"]), "N_ACQ_OV": str(R["refresh"]["acquired_among_overridden"]),
    "REN_N": str(ren["consensus"]["n"]), "REN_PRI": str(ren["priority"]["right"]), "REN_CON": str(ren["consensus"]["right"]),
    "NAME_CON": pct(arb["consensus"]["legal_name"]["accuracy_when_filled"]),
    "NAME_PRI": pct(arb["priority"]["legal_name"]["accuracy_when_filled"]),
    "HYB": pct(hyb["accuracy_when_filled"]), "HYB_FLAG": str(hyb["flagged_for_review"]),
    "ORPHANS": str(R["dq"]["hierarchy"]["orphan_parent_refs"]),
    "VA_COV": pct(va["client_coverage"], 0), "VB_COV": pct(vb["client_coverage"], 0),
    "VA_PAR": pct(va["parent_correct_when_filled"]), "VB_PAR": pct(vb["parent_correct_when_filled"]),
    "VA_DATE": va["median_value_date"], "VB_DATE": vb["median_value_date"],
    "DATA": json.dumps(R, default=str).replace("</", "<\\/"),
}

page = open("template.html").read()
for k, v in T.items():
    page = page.replace("{{" + k + "}}", v)
assert "{{" not in page, page[page.index("{{"): page.index("{{") + 40]
open("index.html", "w").write(page)
print("index.html", len(page) // 1024, "KB")
