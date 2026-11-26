"""Runs the whole simulation and writes results.json and page_data.json.

All data is fictional. Run: python3 run.py
"""
import json
import random
import time
import zlib
from collections import Counter, defaultdict

from er.generate import make_universe, make_records, SOURCE_PROFILES
from er import engine as E
from er.textsim import jaro_winkler

T_AUTO_TARGET_PRECISION = 0.995   # auto-merges must be at least this precise on held-out pairs
REVIEW_FLOOR = 0.5                # below this model score, no human sees the pair
MIN_PER_REVIEW = 3.0              # assumed steward minutes per pair (assumption)
STEWARD_ACC = 0.98                # assumed steward accuracy (assumption)


def is_train(truth):
    return zlib.crc32(truth.encode()) % 10 < 4


def split_sets(records, pairs, feats):
    tr, te = [], []
    for (i, j), f in zip(pairs, feats):
        a, b = records[i]["_truth"], records[j]["_truth"]
        if is_train(a) and is_train(b):
            tr.append((i, j, f))
        elif not is_train(a) and not is_train(b):
            te.append((i, j, f))
    return tr, te


def sweep(model, records, test, t_review):
    """End-to-end pair decisions on held-out pairs for a grid of auto thresholds."""
    rows = []
    for t in [0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.93, 0.95, 0.97, 0.98, 0.99, 0.995]:
        tp = fp = fn = rev = rev_true = 0
        for i, j, f in test:
            p = model.predict(E.vec(f))
            d, _, _ = E.decide(f, p, t, min(t_review, t))
            truth = records[i]["_truth"] == records[j]["_truth"]
            if d == "match":
                tp += truth
                fp += (not truth)
            elif d == "review":
                rev += 1
                rev_true += truth
            else:
                fn += truth
        auto_prec = tp / (tp + fp) if tp + fp else 1.0
        total_true = tp + fn + rev_true
        rows.append({"t_auto": t, "auto_precision": round(auto_prec, 4),
                     "auto_recall": round(tp / total_true, 4) if total_true else 0,
                     "false_auto_merges": fp, "review_pairs": rev,
                     "missed_without_review": fn})
    return rows


def run_day0(seed_u=7, seed_r=11):
    t0 = time.time()
    ents = make_universe(seed_u)
    recs = E.prepare(make_records(ents, seed_r))
    pairs = sorted(E.block(recs))
    feats = [E.features(recs[i], recs[j]) for i, j in pairs]
    # blocking recall
    true_pairs_total = sum(v * (v - 1) // 2 for v in Counter(r["_truth"] for r in recs).values())
    true_in_blocks = sum(1 for (i, j) in pairs if recs[i]["_truth"] == recs[j]["_truth"])
    tr, te = split_sets(recs, pairs, feats)
    model = E.Logistic().fit([E.vec(f) for _, _, f in tr],
                             [int(recs[i]["_truth"] == recs[j]["_truth"]) for i, j, _ in tr])
    grid = sweep(model, recs, te, REVIEW_FLOOR)
    ok = [g for g in grid if g["auto_precision"] >= T_AUTO_TARGET_PRECISION]
    t_auto = min(g["t_auto"] for g in ok) if ok else 0.995
    scored = E.score_pairs(recs, pairs, model, t_auto, REVIEW_FLOOR)
    labels, review_log, blocked = E.resolve(recs, scored, STEWARD_ACC)
    ev = E.evaluate_clusters(recs, labels)
    return dict(ents=ents, recs=recs, pairs=pairs, feats=feats, tr=tr, te=te, model=model, grid=grid,
                t_auto=t_auto, scored=scored, labels=labels, review_log=review_log, blocked=blocked, ev=ev,
                blocking={"records": len(recs), "all_pairs": len(recs) * (len(recs) - 1) // 2,
                          "candidate_pairs": len(pairs), "true_pairs_total": true_pairs_total,
                          "true_pairs_in_blocks": true_in_blocks,
                          "blocking_recall": true_in_blocks / true_pairs_total},
                secs=time.time() - t0)


def baselines(recs, pairs, feats):
    out = {}
    # B0: exact normalised name + country
    links = []
    for (i, j), f in zip(pairs, feats):
        if recs[i]["_core"] == recs[j]["_core"] and recs[i]["country"] == recs[j]["country"]:
            links.append((1.0, i, j))
    lab, _ = E.cluster(len(recs), links, {})
    out["B0 exact name + country"] = E.evaluate_clusters(recs, lab)
    # B1: fuzzy name only
    links = [(f["name_jw"], i, j) for (i, j), f in zip(pairs, feats)
             if f["name_jw"] >= 0.92 and f["country_match"]]
    lab, _ = E.cluster(len(recs), links, {})
    out["B1 fuzzy name >= 0.92 + country"] = E.evaluate_clusters(recs, lab)
    # B2: identifiers only
    links = [(1.0, i, j) for (i, j), f in zip(pairs, feats) if f["lei_match"] or f["reg_match"]]
    lab, _ = E.cluster(len(recs), links, {})
    out["B2 shared ID only"] = E.evaluate_clusters(recs, lab)
    return out



def arbitration_detail(d):
    recs, labels, ents = d["recs"], d["labels"], d["ents"]
    by_id = {e["entity_id"]: e for e in ents}
    acc = E.arbitration_accuracy(recs, labels, ents)
    # renamed entities: which policy gets the current legal name right?
    renamed = {e["entity_id"] for e in ents if e["old_name"]}
    seg = {}
    for pol in ["priority", "recency", "consensus"]:
        prof = E.golden_profiles(recs, labels, {a: pol for a in E.ATTRS})
        r = n = 0
        for p in prof.values():
            if p["truth"] in renamed:
                n += 1
                r += int(p["attrs"]["legal_name"]["value"] == E.truth_value(by_id[p["truth"]], "legal_name", by_id))
        seg[pol] = {"right": r, "n": n}
    # hybrid: consensus, but when the registry-style source (VENDOR_A) disagrees, ask a steward
    prof = E.golden_profiles(recs, labels, E.CONFIGURED)
    cl = defaultdict(list)
    for r, l in zip(recs, labels):
        cl[l].append(r)
    rng = random.Random(21)
    flagged = right = n = 0
    for l, p in prof.items():
        t = p["truth"]
        if t not in by_id:
            continue
        n += 1
        tv = E.truth_value(by_id[t], "legal_name", by_id)
        cons, _, _ = E.arbitrate(cl[l], "legal_name", "consensus")
        va = [m for m in cl[l] if m["source"] == "VENDOR_A"]
        if va and E._val(va[0], "legal_name") != cons:
            flagged += 1
            right += int(rng.random() < STEWARD_ACC)
        else:
            right += int(cons == tv)
    acc["consensus + registry check"] = {"legal_name": {"accuracy_when_filled": right / n, "fill": 1.0, "n": n,
                                                        "flagged_for_review": flagged}}
    return acc, seg


def lineage_examples(d, k=4):
    recs, labels, ents = d["recs"], d["labels"], d["ents"]
    by_id = {e["entity_id"]: e for e in ents}
    prof = E.golden_profiles(recs, labels, E.CONFIGURED)
    cl = defaultdict(list)
    for r, l in zip(recs, labels):
        cl[l].append(r)
    picks = []
    want = [lambda e: e["old_name"] is not None, lambda e: e["old_city"] is not None and e["parent"],
            lambda e: e["kind"] == "sponsor", lambda e: e["parent"] is not None]
    used = set()
    for w in want:
        for l, p in sorted(prof.items(), key=lambda kv: -len(kv[1]["members"])):
            t = p["truth"]
            if t in by_id and t not in used and w(by_id[t]) and len(p["members"]) >= 4:
                used.add(t)
                rows = [{k2: m[k2] for k2 in ["rec_id", "source", "name", "country", "city", "lei", "reg_no",
                                                "industry", "parent_lei", "as_of"]} for m in cl[l]]
                attrs = {}
                for a, v in p["attrs"].items():
                    val = v["value"]
                    if a == "legal_name" and val:
                        val = " ".join(x for x in val if x)
                    attrs[a] = {"value": val, "source": v["source"], "rec_id": v["rec_id"], "as_of": v["as_of"],
                                "rule": v["rule"], "alternatives": v["alternatives"][:4]}
                picks.append({"truth_name": by_id[t]["name"], "renamed_from": by_id[t]["old_name"],
                              "records": rows, "golden": attrs})
                break
    return picks


def explained_pairs(d, per_rule=2):
    recs, model = d["recs"], d["model"]
    out, cnt = [], Counter()
    order = ["R1", "R2", "M1", "M2", "C1", "C2", "C3", "C4", "V1", "M3"]
    rng = random.Random(4)
    pool = defaultdict(list)
    for s in d["scored"]:
        pool[s["rule"]].append(s)
    for rule in order:
        cands = pool.get(rule, [])
        if rule == "M3":
            cands = [s for s in cands if s["p"] > 0.3]
        if rule == "M2":
            cands = sorted(cands, key=lambda s: -s["p"])[:60]
        for s in rng.sample(cands, min(per_rule, len(cands))):
            a, b = recs[s["i"]], recs[s["j"]]
            out.append({"rule": rule, "decision": s["decision"], "score": round(s["p"], 3),
                        "why": s["why"], "same_entity_in_truth": s["truth"],
                        "a": {k: a[k] for k in ["rec_id", "source", "name", "country", "city", "lei", "reg_no"]},
                        "b": {k: b[k] for k in ["rec_id", "source", "name", "country", "city", "lei", "reg_no"]},
                        "contributions": model.contributions(E.vec(s["f"])),
                        "features": {k: (round(v, 3) if isinstance(v, float) else v) for k, v in s["f"].items()}})
    return out


def vendor_scorecard(d):
    recs, ents = d["recs"], d["ents"]
    by_id = {e["entity_id"]: e for e in ents}
    client_universe = {r["_truth"] for r in recs if not r["source"].startswith("VENDOR")}
    lab = d["labels"]
    internal_clusters = {lab[i] for i, r in enumerate(recs) if not r["source"].startswith("VENDOR")}
    out = {}
    for v in ["VENDOR_A", "VENDOR_B"]:
        rows = [(i, r) for i, r in enumerate(recs) if r["source"] == v]
        inscope = [r for _, r in rows if r["_truth"] in client_universe]
        covered = {r["_truth"] for r in inscope}
        name_ok = sum(1 for r in inscope if (r["_core"], r["_form"]) == E.truth_value(by_id[r["_truth"]], "legal_name", by_id))
        with_parent_truth = [r for r in inscope if by_id[r["_truth"]]["parent"]]
        par_filled = [r for r in with_parent_truth if r["parent_lei"]]
        par_ok = sum(1 for r in par_filled if r["parent_lei"] == by_id[by_id[r["_truth"]]["parent"]]["lei"])
        city_ok = sum(1 for r in inscope if r["city"] == by_id[r["_truth"]]["city"])
        attached = sum(1 for i, r in rows if lab[i] in internal_clusters)
        ages = sorted(r["as_of"] for _, r in rows)
        out[v] = {
            "rows": len(rows), "client_coverage": round(len(covered) / len(client_universe), 3),
            "rows_outside_client_universe": round(1 - len(inscope) / len(rows), 3),
            "attached_to_a_client_record": round(attached / len(rows), 3),
            "lei_fill": round(sum(1 for r in inscope if r["lei"]) / len(inscope), 3),
            "lei_correct_when_filled": round(sum(1 for r in inscope if r["lei"] == by_id[r["_truth"]]["lei"]) /
                                             max(1, sum(1 for r in inscope if r["lei"])), 3),
            "reg_fill": round(sum(1 for r in inscope if r["reg_no"]) / len(inscope), 3),
            "current_legal_name": round(name_ok / len(inscope), 3),
            "parent_fill": round(len(par_filled) / max(1, len(with_parent_truth)), 3),
            "parent_correct_when_filled": round(par_ok / max(1, len(par_filled)), 3),
            "city_current": round(city_ok / len(inscope), 3),
            "median_value_date": ages[len(ages) // 2],
        }
    return out


def dq_metrics(d, profiles):
    recs = d["recs"]
    ev = d["ev"]
    inscope = [p for p in profiles.values() if not p["truth"].startswith("OUT")]
    complete = sum(1 for p in inscope if all(p["attrs"][a]["value"] for a in ["legal_name", "city", "industry", "lei"]))
    lei_present = [r for r in recs if r["lei"]]
    valid = sum(1 for r in lei_present if r["_lei_ok"])
    hd = E.hierarchy_defects(profiles)
    return {
        "completeness_core_attributes": round(complete / len(inscope), 3),
        "id_format_validity": round(valid / len(lei_present), 4),
        "uniqueness_duplicate_rate": round(ev["duplicate_rate"], 4),
        "false_merge_clusters": ev["false_merge_clusters"],
        "hierarchy": hd,
    }


def review_budget(d):
    rows = []
    for fl in [0.3, 0.4, 0.5, 0.6, 0.7]:
        sc = E.score_pairs(d["recs"], d["pairs"], d["model"], d["t_auto"], fl)
        lab, rl, _ = E.resolve(d["recs"], sc, STEWARD_ACC)
        ev = E.evaluate_clusters(d["recs"], lab)
        rows.append({"review_floor": fl, "review_pairs": len(rl), "steward_hours": round(len(rl) * MIN_PER_REVIEW / 60, 1),
                     "false_merge_clusters": ev["false_merge_clusters"], "split_entities": ev["split_entities"],
                     "pair_precision": round(ev["pair_precision"], 4), "pair_recall": round(ev["pair_recall"], 4)})
    return rows


def refresh_scenario(d):
    from er import refresh as F
    rng = random.Random(8)
    recs = d["recs"]
    F.assign_keys(recs)
    profiles = E.golden_profiles(recs, d["labels"], E.CONFIGURED)
    merges, parent_fixes = F.day0_overrides(recs, d["labels"], profiles, d["ents"], rng)
    memory = {tuple(sorted((recs[i]["_key"], recs[j]["_key"]))): ok for i, j, ok in d["review_log"]}
    ents_new, acquired = F.corporate_events(d["ents"], parent_fixes, rng)
    recs30 = F.refresh_records(recs, ents_new, acquired)
    res = [F.run_mode(m, recs30, ents_new, d["model"], d["t_auto"], REVIEW_FLOOR, memory, merges, parent_fixes)
           for m in ["stateless", "sticky", "governed"]]
    examples = {"merge": merges[:2], "parent": parent_fixes[:2]}
    return {"day0_review_decisions_stored": len(memory), "merge_overrides": len(merges),
            "parent_overrides": len(parent_fixes), "acquisitions_after_override": len(acquired),
            "acquired_among_overridden": len(acquired & {f["truth"] for f in parent_fixes}),
            "records_day30": len(recs30), "modes": res, "override_examples": examples}


def robustness(seeds=((7, 11), (17, 23), (29, 31), (41, 43), (53, 59))):
    out = []
    for su, sr in seeds:
        d = run_day0(su, sr)
        out.append({"seeds": [su, sr], "t_auto": d["t_auto"], "review_pairs": len(d["review_log"]),
                    **{k: (round(v, 4) if isinstance(v, float) else v) for k, v in d["ev"].items()}})
    return out


if __name__ == "__main__":
    import sys
    d = run_day0()
    profiles = E.golden_profiles(d["recs"], d["labels"], E.CONFIGURED)
    acc, seg = arbitration_detail(d)
    results = {
        "note": "Simulation on fictional data. Not J.P. Morgan data, systems or process. Built with Claude.",
        "thresholds": {"auto_match": d["t_auto"], "review_floor": REVIEW_FLOOR,
                       "auto_precision_target": T_AUTO_TARGET_PRECISION,
                       "assumptions": {"steward_minutes_per_pair": MIN_PER_REVIEW, "steward_accuracy": STEWARD_ACC}},
        "universe": {"entities": len(d["ents"]), "kinds": Counter(e["kind"] for e in d["ents"]),
                     "renamed": sum(1 for e in d["ents"] if e["old_name"]),
                     "moved": sum(1 for e in d["ents"] if e["old_city"]),
                     "records_by_source": Counter(r["source"] for r in d["recs"])},
        "blocking": d["blocking"],
        "model": {"weights": {f: round(w, 3) for f, w in zip(E.FEATURES, d["model"].w)}, "bias": round(d["model"].b, 3),
                  "train_pairs": len(d["tr"]), "test_pairs": len(d["te"])},
        "threshold_sweep_test": d["grid"],
        "decision_rules": Counter(s["rule"] for s in d["scored"]),
        "resolution": {k: (round(v, 4) if isinstance(v, float) else v) for k, v in d["ev"].items()},
        "review_pairs": len(d["review_log"]),
        "baselines": {k: {a: (round(b, 4) if isinstance(b, float) else b) for a, b in v.items()}
                      for k, v in baselines(d["recs"], d["pairs"], d["feats"]).items()},
        "review_budget": review_budget(d),
        "arbitration": acc, "arbitration_renamed_only": seg,
        "dq": dq_metrics(d, profiles),
        "vendors": vendor_scorecard(d),
        "explained_pairs": explained_pairs(d),
        "lineage_examples": lineage_examples(d),
        "refresh": refresh_scenario(d),
    }
    if "--fast" not in sys.argv:
        results["robustness"] = robustness()
    json.dump(results, open("results.json", "w"), indent=1, default=str)
    print(json.dumps({k: results[k] for k in ["resolution", "review_pairs", "dq", "refresh"]}, indent=1, default=str)[:6000])
