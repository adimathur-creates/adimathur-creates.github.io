"""The defined problem: a vendor refresh arrives after stewards have corrected the master.

Three ways to re-run resolution on day 30:
  stateless  - re-run from scratch; steward decisions are not stored
  sticky     - every steward decision is replayed forever, no questions asked
  governed   - decisions are replayed as constraints, but a decision is re-opened
               (not silently applied, not silently dropped) when newer evidence
               contradicts it
"""
import copy
import random
from collections import defaultdict, Counter

from . import engine as E
from .generate import make_records

OVERRIDE_DATE = "2026-11-20"
REFRESH_DATE = "2026-12-05"


def assign_keys(records):
    seen = Counter()
    for r in records:
        base = r.get("key") or r["rec_id"]
        seen[base] += 1
        r["_key"] = base if seen[base] == 1 else f"{base}~{seen[base]}"
    return records


def clusters_of(records, labels):
    cl = defaultdict(list)
    for idx, l in enumerate(labels):
        cl[l].append(idx)
    return cl


def day0_overrides(records, labels, profiles, entities, rng):
    """What stewards fix after the first load (simulated from ground truth)."""
    by_id = {e["entity_id"]: e for e in entities}
    cl = clusters_of(records, labels)
    # 1) missed duplicates -> must-link (steward merges)
    by_truth = defaultdict(set)
    for idx, l in enumerate(labels):
        by_truth[records[idx]["_truth"]].add(l)
    merges = []
    for t, ls in by_truth.items():
        if t.startswith("OUT") or len(ls) < 2:
            continue
        ls = sorted(ls)
        anchor = cl[ls[0]][0]
        for other in ls[1:]:
            merges.append({"type": "merge", "a": records[anchor]["_key"], "b": records[cl[other][0]]["_key"],
                           "truth": t, "reason": "Same legal entity: registry extract attached",
                           "maker": "steward_01", "checker": "steward_07", "date": OVERRIDE_DATE})
    # 2) wrong parent on the golden profile -> attribute override
    parent_fixes = []
    for l, p in profiles.items():
        t = p["truth"]
        if t not in by_id or not by_id[t]["parent"]:
            continue
        right = by_id[by_id[t]["parent"]]["lei"]
        if p["attrs"]["parent_lei"]["value"] not in (None, right):
            anchor = min(cl[l], key=lambda i: records[i]["_key"])
            parent_fixes.append({"type": "attribute", "attr": "parent_lei", "anchor": records[anchor]["_key"],
                                 "value": right, "was": p["attrs"]["parent_lei"]["value"], "truth": t,
                                 "reason": "Parent confirmed from annual report", "maker": "steward_03",
                                 "checker": "steward_07", "date": OVERRIDE_DATE})
    return merges, parent_fixes


def corporate_events(entities, parent_fixes, rng, n_from_fixed=6, n_other=8):
    """Acquisitions after the override date: the true parent changes."""
    ents = copy.deepcopy(entities)
    by_id = {e["entity_id"]: e for e in ents}
    holdings = [e["entity_id"] for e in ents if e["kind"] == "holding"]
    fixed = [f["truth"] for f in parent_fixes]
    pick = rng.sample(fixed, min(n_from_fixed, len(fixed)))
    others = [e["entity_id"] for e in ents if e["parent"] and e["entity_id"] not in fixed]
    pick += rng.sample(others, n_other)
    for t in pick:
        e = by_id[t]
        e["parent"] = rng.choice([h for h in holdings if h != e["parent"] and h != t])
    return ents, set(pick)


def refresh_records(day0_records, ents_new, acquired, seed=99):
    keep = [copy.deepcopy(r) for r in day0_records if r["source"] != "VENDOR_B"]
    newb = make_records(ents_new, seed=11, vendor_b_seed=seed, sources=["VENDOR_B"], id_offset=50000)
    for r in newb:
        if r["_truth"] in acquired:
            r["as_of"] = REFRESH_DATE
    recs = keep + newb
    for r in recs:
        for k in [k for k in r if k.startswith("_") and k != "_truth"]:
            del r[k]
    E.prepare(recs)
    assign_keys(recs)
    return recs


def run_mode(mode, recs, ents_new, model, t_auto, t_review, review_memory, merges, parent_fixes, seed=5):
    """Returns metrics for one way of handling the refresh."""
    rng = random.Random(seed)
    by_id = {e["entity_id"]: e for e in ents_new}
    key_idx = {r["_key"]: i for i, r in enumerate(recs)}
    pairs = sorted(E.block(recs))
    scored = E.score_pairs(recs, pairs, model, t_auto, t_review)
    reviews_needed = 0
    review_decisions = {}
    for s in scored:
        if s["decision"] != "review":
            continue
        k = tuple(sorted((recs[s["i"]]["_key"], recs[s["j"]]["_key"])))
        if mode != "stateless" and k in review_memory:
            review_decisions[(s["i"], s["j"])] = review_memory[k]
        else:
            reviews_needed += 1
    must = []
    if mode != "stateless":
        for m in merges:
            if m["a"] in key_idx and m["b"] in key_idx:
                must.append((key_idx[m["a"]], key_idx[m["b"]]))
    labels, rlog, _ = E.resolve(recs, scored, 0.98, seed=seed, must=must, review_decisions=review_decisions)
    ev = E.evaluate_clusters(recs, labels)
    profiles = E.golden_profiles(recs, labels, E.CONFIGURED)
    lab_of = {i: l for i, l in enumerate(labels)}

    # merges undone?
    merges_undone = 0
    for m in merges:
        if m["a"] in key_idx and m["b"] in key_idx and lab_of[key_idx[m["a"]]] != lab_of[key_idx[m["b"]]]:
            merges_undone += 1

    # parent overrides
    parent_undone = stale_silent = reopened = reopened_right = 0
    for f in parent_fixes:
        if f["anchor"] not in key_idx:
            continue
        l = lab_of[key_idx[f["anchor"]]]
        prof = profiles[l]
        truth_now = by_id[by_id[f["truth"]]["parent"]]["lei"]
        if mode == "stateless":
            parent_undone += int(prof["attrs"]["parent_lei"]["value"] != f["value"] and
                                 prof["attrs"]["parent_lei"]["value"] != truth_now)
            continue
        members = [r for r in recs if lab_of[key_idx[r["_key"]]] == l]
        newer = [r for r in members if r["parent_lei"] and r["parent_lei"] != f["value"] and r["as_of"] > f["date"]]
        if mode == "sticky" or not newer:
            prof["attrs"]["parent_lei"]["value"] = f["value"]
            stale_silent += int(f["value"] != truth_now)
        else:  # governed: re-open
            reopened += 1
            ok = rng.random() < 0.98
            prof["attrs"]["parent_lei"]["value"] = truth_now if ok else f["value"]
            reopened_right += int(ok)
    # overall parent accuracy on all profiles with a parent
    right = n = 0
    for p in profiles.values():
        t = p["truth"]
        if t in by_id and by_id[t]["parent"]:
            n += 1
            right += int(p["attrs"]["parent_lei"]["value"] == by_id[by_id[t]["parent"]]["lei"])
    return {
        "mode": mode, "review_pairs_for_stewards": reviews_needed + (0 if mode == "stateless" else 0),
        "steward_hours": round((reviews_needed + reopened) * 3 / 60, 1),
        "merge_fixes_undone": merges_undone if mode != "governed" else 0,
        "merge_conflicts_flagged": merges_undone if mode == "governed" else 0,
        "merge_fixes_total": len(merges),
        "parent_fixes_undone": parent_undone, "parent_fixes_total": len(parent_fixes),
        "stale_overrides_applied_silently": stale_silent,
        "overrides_reopened_for_review": reopened,
        "pair_precision": round(ev["pair_precision"], 4), "pair_recall": round(ev["pair_recall"], 4),
        "false_merge_clusters": ev["false_merge_clusters"], "split_entities": ev["split_entities"],
        "parent_accuracy": round(right / n, 4) if n else 0,
    }
