"""Checks for the entity-resolution simulation (fictional data). Run: python3 -m pytest -q"""
import copy
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import run  # noqa: E402
from er import engine as E  # noqa: E402
from er.textsim import split_legal_form, jaro_winkler  # noqa: E402


@pytest.fixture(scope="module")
def day0():
    return run.run_day0()


def f_base(**kw):
    f = {k: 0 for k in E.FEATURES}
    f.update(name_jw=0.95, token_jaccard=0.8, country_match=1)
    f.update(kw)
    return f


def test_legal_forms_normalise_but_stay_distinct():
    assert split_legal_form("Lumora Meridian Logistics Pvt. Ltd.")[1] == "pvt_ltd"
    assert split_legal_form("LUMORA MERIDIAN LOGISTICS PRIVATE LIMITED")[1] == "pvt_ltd"
    # In India a private limited and a public limited company are different legal forms.
    assert split_legal_form("Lumora Meridian Logistics Limited")[1] == "ltd"
    assert split_legal_form("The Lumora-Meridian Logistics Ltd")[0] == "lumora meridian logistics"


def test_jaro_winkler_reference_value():
    assert abs(jaro_winkler("martha", "marhta") - 0.9611) < 0.001


def test_both_ids_conflict_is_a_hard_no():
    d, rule, _ = E.decide(f_base(lei_conflict=1, reg_conflict=1), 0.99, 0.7, 0.5)
    assert (d, rule) == ("cannot_link", "V1")


def test_same_id_two_countries_goes_to_a_person():
    d, rule, _ = E.decide(f_base(lei_match=1, country_match=0), 0.99, 0.7, 0.5)
    assert (d, rule) == ("review", "C4")


def test_same_id_but_sibling_names_goes_to_a_person():
    d, rule, _ = E.decide(f_base(lei_match=1, distinct_token_diff=1), 0.99, 0.7, 0.5)
    assert (d, rule) == ("review", "C3")


def test_cannot_link_survives_transitive_chain():
    links = [(0.9, 0, 1), (0.8, 1, 2)]
    labels, blocked = E.cluster(3, links, {0: {2}, 2: {0}})
    assert labels[0] != labels[2] and blocked == 1


def test_blocking_keeps_nearly_all_true_pairs(day0):
    b = day0["blocking"]
    assert b["blocking_recall"] >= 0.99
    assert b["candidate_pairs"] < b["all_pairs"] * 0.01


def test_auto_tier_meets_precision_target(day0):
    row = [g for g in day0["grid"] if g["t_auto"] == day0["t_auto"]][0]
    assert row["auto_precision"] >= run.T_AUTO_TARGET_PRECISION
    assert day0["ev"]["false_merge_clusters"] <= 1


def test_beats_naive_baselines(day0):
    base = run.baselines(day0["recs"], day0["pairs"], day0["feats"])
    ev = day0["ev"]
    b0, b1 = base["B0 exact name + country"], base["B1 fuzzy name >= 0.92 + country"]
    assert ev["pair_recall"] > b0["pair_recall"] + 0.15
    assert ev["false_merge_clusters"] < b0["false_merge_clusters"]
    assert b1["false_merge_clusters"] > 100  # fuzzy names alone merge siblings and namesakes


def test_decisions_do_not_read_ground_truth(day0):
    recs = copy.deepcopy(day0["recs"][:400])
    pairs = sorted(E.block(recs))
    a = [s["decision"] for s in E.score_pairs(recs, pairs, day0["model"], day0["t_auto"], run.REVIEW_FLOOR)]
    for r in recs:
        r["_truth"] = "X"
    b = [s["decision"] for s in E.score_pairs(recs, pairs, day0["model"], day0["t_auto"], run.REVIEW_FLOOR)]
    assert a == b


def test_no_single_arbitration_rule_wins_everywhere(day0):
    acc = E.arbitration_accuracy(day0["recs"], day0["labels"], day0["ents"])
    best = {a: max(acc[p][a]["accuracy_when_filled"] for p in ["priority", "recency", "consensus"]) for a in E.ATTRS}
    winners = {a: [p for p in ["priority", "recency", "consensus"]
                   if acc[p][a]["accuracy_when_filled"] == best[a]] for a in E.ATTRS}
    assert len({w[0] for w in winners.values()}) >= 2
    for a in E.ATTRS:
        assert acc["configured"][a]["accuracy_when_filled"] >= best[a] - 1e-9


def test_every_golden_value_traces_to_a_member_record(day0):
    prof = E.golden_profiles(day0["recs"], day0["labels"], E.CONFIGURED)
    by_rec = {r["rec_id"]: r for r in day0["recs"]}
    for p in list(prof.values())[:500]:
        for a, v in p["attrs"].items():
            if v["value"] is None:
                continue
            assert v["rec_id"] in p["members"]
            assert E._val(by_rec[v["rec_id"]], a) == v["value"]


def test_refresh_governed_vs_naive(day0):
    res = run.refresh_scenario(day0)
    m = {x["mode"]: x for x in res["modes"]}
    assert m["stateless"]["merge_fixes_undone"] + m["stateless"]["parent_fixes_undone"] > 0
    assert m["stateless"]["review_pairs_for_stewards"] > 2 * m["governed"]["review_pairs_for_stewards"]
    assert m["sticky"]["stale_overrides_applied_silently"] > 0
    assert m["governed"]["stale_overrides_applied_silently"] == 0
    assert m["governed"]["merge_fixes_undone"] == 0 and m["governed"]["parent_fixes_undone"] == 0
    assert m["governed"]["overrides_reopened_for_review"] == res["acquired_among_overridden"]


def test_results_file_carries_the_simulation_label():
    p = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "results.json")
    r = json.load(open(p))
    assert "fictional" in r["note"] and "Not J.P. Morgan" in r["note"]
