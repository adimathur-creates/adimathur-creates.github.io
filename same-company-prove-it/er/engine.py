"""Governed entity resolution on fictional data.

Pipeline: normalise -> block -> features -> deterministic rules and vetoes ->
scored model with a human-review band -> constrained clustering ->
golden-profile arbitration with lineage -> overrides that survive a refresh.
"""
import math
import random
from collections import Counter, defaultdict

from .textsim import split_legal_form, jaro_winkler, token_jaccard, soundish, HOLDING_WORDS

FEATURES = ["name_jw", "token_jaccard", "lei_match", "lei_conflict", "reg_match", "reg_conflict",
            "form_match", "form_conflict", "country_match", "city_match", "postcode_match", "holding_diff",
            "distinct_token_diff"]
NUMERALS = {"i", "ii", "iii", "iv", "v", "vi"}

# Source priority for "trusted source" arbitration (invented, configurable).
PRIORITY = ["VENDOR_A", "KYC_ONBOARDING", "VENDOR_B", "CREDIT", "MARKETS", "PAYMENTS"]


# ---------------------------------------------------------------- prep
def prepare(records):
    for r in records:
        core, form = split_legal_form(r["name"])
        r["_core"], r["_form"] = core, form
        toks = core.split()
        r["_tok0"] = toks[0] if toks else ""
        r["_lei_ok"] = bool(r["lei"]) and len(r["lei"]) == 20 and r["lei"].startswith("FXL")
    return records


def block(records):
    """Candidate pairs from four blocking keys. Returns set of (i, j) index pairs."""
    keys = defaultdict(list)
    for i, r in enumerate(records):
        keys[("ph", r["country"], soundish(r["_tok0"]))].append(i)
        keys[("p3", r["country"], r["_core"][:3])].append(i)
        if r["lei"]:
            keys[("lei", r["lei"])].append(i)
        if r["reg_no"]:
            keys[("reg", r["reg_no"])].append(i)
    pairs = set()
    for ids in keys.values():
        if len(ids) > 400:  # guard against a giant block
            continue
        for a in range(len(ids)):
            for b in range(a + 1, len(ids)):
                i, j = ids[a], ids[b]
                pairs.add((i, j) if i < j else (j, i))
    return pairs


def _tri(a, b):
    """1 match, -1 conflict, 0 unknown."""
    if not a or not b:
        return 0
    return 1 if a == b else -1


def features(r, s):
    lei = _tri(r["lei"], s["lei"])
    reg = _tri(r["reg_no"], s["reg_no"])
    ta, tb = set(r["_core"].split()), set(s["_core"].split())
    hold = int(bool(ta & HOLDING_WORDS) != bool(tb & HOLDING_WORDS))
    diff = (ta ^ tb)
    distinct = int(bool(diff & NUMERALS) or (len(ta) >= 3 and len(tb) >= 3 and ta.issuperset(tb) is False
                                              and tb.issuperset(ta) is False and len(diff) >= 2
                                              and r["_tok0"] == s["_tok0"]))
    return {
        "name_jw": jaro_winkler(r["_core"], s["_core"]),
        "token_jaccard": token_jaccard(r["_core"], s["_core"]),
        "lei_match": int(lei == 1), "lei_conflict": int(lei == -1),
        "reg_match": int(reg == 1), "reg_conflict": int(reg == -1),
        "form_match": int(bool(r["_form"]) and r["_form"] == s["_form"]),
        "form_conflict": int(bool(r["_form"]) and bool(s["_form"]) and r["_form"] != s["_form"]),
        "country_match": int(r["country"] == s["country"]),
        "city_match": int(r["city"] == s["city"]),
        "postcode_match": int(bool(r["postcode"]) and r["postcode"] == s["postcode"]),
        "holding_diff": hold, "distinct_token_diff": distinct,
    }


# ---------------------------------------------------------------- model
class Logistic:
    """Plain L2 logistic regression, batch gradient descent. Small and inspectable."""

    def __init__(self, l2=0.01, lr=0.5, epochs=1500):
        self.l2, self.lr, self.epochs = l2, lr, epochs
        self.w = [0.0] * len(FEATURES)
        self.b = 0.0

    def fit(self, X, y):
        n = len(X)
        pos = sum(y)
        wpos = n / (2 * pos) if pos else 1.0
        wneg = n / (2 * (n - pos)) if n - pos else 1.0
        for _ in range(self.epochs):
            gw = [0.0] * len(self.w)
            gb = 0.0
            for x, t in zip(X, y):
                p = self._p(x)
                wt = wpos if t else wneg
                e = (p - t) * wt
                for k, v in enumerate(x):
                    gw[k] += e * v
                gb += e
            for k in range(len(self.w)):
                self.w[k] -= self.lr * (gw[k] / n + self.l2 * self.w[k])
            self.b -= self.lr * gb / n
        return self

    def _p(self, x):
        z = self.b + sum(w * v for w, v in zip(self.w, x))
        return 1 / (1 + math.exp(-max(-35, min(35, z))))

    def predict(self, x):
        return self._p(x)

    def contributions(self, x):
        return {f: round(w * v, 3) for f, w, v in zip(FEATURES, self.w, x) if abs(w * v) >= 0.05}


def vec(f):
    return [float(f[k]) for k in FEATURES]


# ---------------------------------------------------------------- decision layer
def decide(f, p, t_auto, t_review):
    """Returns (decision, rule, reasons). decision in match / review / no_match / cannot_link."""
    if f["lei_conflict"] and f["reg_conflict"]:
        return "cannot_link", "V1", ["Both identifiers present and different"]
    if (f["lei_match"] and f["reg_conflict"]) or (f["reg_match"] and f["lei_conflict"]):
        return "review", "C1", ["Identifiers disagree: one matches, the other conflicts"]
    if (f["lei_match"] or f["reg_match"]) and not f["country_match"]:
        return "review", "C4", ["Same identifier recorded in two different countries: one of them is wrong"]
    if f["lei_match"] and f["country_match"] and (f["distinct_token_diff"] or f["holding_diff"] or f["form_conflict"]):
        return "review", "C3", ["Same entity ID, but the names point to different businesses or legal forms"]
    if f["lei_match"] and f["country_match"]:
        if f["name_jw"] >= 0.80:
            return "match", "R1", ["Same entity ID, same country, name agrees"]
        return "review", "C2", ["Same entity ID but the name differs: possible rename or a wrong ID"]
    if f["reg_match"] and f["country_match"] and not f["form_conflict"]:
        return "match", "R2", ["Same registration number and country"]
    if not f["country_match"] and not (f["lei_match"] or f["reg_match"]):
        return "no_match", "V2", ["Different country and no shared identifier"]
    if p >= t_auto:
        return "match", "M1", [f"Model score {p:.3f} at or above auto-match threshold {t_auto}"]
    if p >= t_review:
        return "review", "M2", [f"Model score {p:.3f} in the review band [{t_review}, {t_auto})"]
    return "no_match", "M3", [f"Model score {p:.3f} below review threshold {t_review}"]


# ---------------------------------------------------------------- clustering
class DSU:
    def __init__(self, n):
        self.p = list(range(n))
        self.members = {i: {i} for i in range(n)}

    def find(self, x):
        while self.p[x] != x:
            self.p[x] = self.p[self.p[x]]
            x = self.p[x]
        return x

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra == rb:
            return False
        if len(self.members[ra]) < len(self.members[rb]):
            ra, rb = rb, ra
        self.p[rb] = ra
        self.members[ra] |= self.members.pop(rb)
        return True


def cluster(n, links, cannot):
    """links: list of (conf, i, j). cannot: dict i -> set(j). Highest confidence first;
    a union is skipped if it would put a cannot-link pair in one cluster."""
    d = DSU(n)
    blocked = 0
    for conf, i, j in sorted(links, key=lambda t: -t[0]):
        ri, rj = d.find(i), d.find(j)
        if ri == rj:
            continue
        a, b = d.members[ri], d.members[rj]
        small, big = (a, b) if len(a) < len(b) else (b, a)
        if any(cannot.get(x, set()) & big for x in small):
            blocked += 1
            continue
        d.union(i, j)
    labels = [d.find(i) for i in range(n)]
    return labels, blocked


# ---------------------------------------------------------------- evaluation
def evaluate_clusters(records, labels):
    by_cl = defaultdict(list)
    for r, l in zip(records, labels):
        by_cl[l].append(r["_truth"])
    by_truth = defaultdict(set)
    for r, l in zip(records, labels):
        by_truth[r["_truth"]].add(l)
    tp = fp = 0
    for truths in by_cl.values():
        c = Counter(truths)
        n = len(truths)
        same = sum(v * (v - 1) // 2 for v in c.values())
        tp += same
        fp += n * (n - 1) // 2 - same
    true_pairs = sum(v * (v - 1) // 2 for v in Counter(r["_truth"] for r in records).values())
    fn = true_pairs - tp
    false_merge_clusters = sum(1 for t in by_cl.values() if len(set(t)) > 1)
    split_entities = sum(1 for t, ls in by_truth.items() if len(ls) > 1 and not t.startswith("OUT"))
    in_scope = [t for t in by_truth if not t.startswith("OUT")]
    return {
        "records": len(records), "clusters": len(by_cl), "true_entities": len(by_truth),
        "pair_precision": tp / (tp + fp) if tp + fp else 1.0,
        "pair_recall": tp / (tp + fn) if tp + fn else 1.0,
        "false_merge_clusters": false_merge_clusters,
        "split_entities": split_entities,
        "duplicate_rate": split_entities / len(in_scope) if in_scope else 0.0,
    }


# ---------------------------------------------------------------- full resolve
def score_pairs(records, pairs, model, t_auto, t_review):
    out = []
    for i, j in pairs:
        f = features(records[i], records[j])
        p = model.predict(vec(f))
        dec, rule, why = decide(f, p, t_auto, t_review)
        out.append({"i": i, "j": j, "f": f, "p": p, "decision": dec, "rule": rule, "why": why,
                    "truth": records[i]["_truth"] == records[j]["_truth"]})
    return out


def resolve(records, scored, steward_accuracy=0.98, seed=3, must=None, cannot_extra=None,
            review_decisions=None):
    """Apply decisions. Review pairs are decided by a simulated steward (truth with
    `steward_accuracy`), unless review_decisions supplies them."""
    rng = random.Random(seed)
    links, cannot = [], defaultdict(set)
    review_log = []
    for s in scored:
        d = s["decision"]
        if d == "review":
            if review_decisions is not None and (s["i"], s["j"]) in review_decisions:
                ok = review_decisions[(s["i"], s["j"])]
            else:
                ok = s["truth"] if rng.random() < steward_accuracy else (not s["truth"])
            review_log.append((s["i"], s["j"], ok))
            d = "match" if ok else "cannot_link"
        if d == "match":
            links.append((1.0 if s["rule"] in ("R1", "R2") else s["p"], s["i"], s["j"]))
        elif d == "cannot_link":
            cannot[s["i"]].add(s["j"])
            cannot[s["j"]].add(s["i"])
    for i, j in (cannot_extra or []):
        cannot[i].add(j)
        cannot[j].add(i)
    for i, j in (must or []):
        links.append((2.0, i, j))  # steward must-links outrank everything
    labels, blocked = cluster(len(records), links, cannot)
    return labels, review_log, blocked


# ---------------------------------------------------------------- golden profile
ATTRS = ["legal_name", "city", "industry", "parent_lei", "lei"]


def _val(r, a):
    if a == "legal_name":
        return (r["_core"], r["_form"])
    return r[a] if a != "lei" else (r["lei"] if r["_lei_ok"] else "")


def arbitrate(members, attr, policy):
    """members: list of records in one cluster. Returns (value, winning record, alternatives)."""
    cands = [m for m in members if _val(m, attr) not in ("", ("", ""))]
    if not cands:
        return None, None, []
    alts = Counter(_val(m, attr) for m in cands)
    if policy == "priority":
        best = min(cands, key=lambda m: (PRIORITY.index(m["source"]), -int(m["as_of"].replace("-", ""))))
    elif policy == "recency":
        best = max(cands, key=lambda m: (m["as_of"], -PRIORITY.index(m["source"])))
    elif policy == "consensus":
        top = alts.most_common()
        hi = top[0][1]
        tied = {v for v, c in top if c == hi}
        pool = [m for m in cands if _val(m, attr) in tied]
        best = min(pool, key=lambda m: PRIORITY.index(m["source"]))
    else:
        raise ValueError(policy)
    return _val(best, attr), best, [(v if attr != "legal_name" else " ".join(v), c) for v, c in alts.most_common()]


CONFIGURED = {"legal_name": "consensus", "city": "recency", "industry": "consensus",
              "parent_lei": "priority", "lei": "consensus"}


def truth_value(entity, attr, by_id):
    if attr == "legal_name":
        core, form = split_legal_form(entity["name"])
        return (core, form)
    if attr == "parent_lei":
        return by_id[entity["parent"]]["lei"] if entity["parent"] else ""
    return entity[attr]


def golden_profiles(records, labels, policy_map):
    by_cl = defaultdict(list)
    for r, l in zip(records, labels):
        by_cl[l].append(r)
    profiles = {}
    for l, mem in by_cl.items():
        prof = {"cluster": l, "members": [m["rec_id"] for m in mem],
                "truth": Counter(m["_truth"] for m in mem).most_common(1)[0][0], "attrs": {}}
        for a in ATTRS:
            v, w, alts = arbitrate(mem, a, policy_map[a])
            prof["attrs"][a] = {"value": v, "source": w["source"] if w else None,
                                "rec_id": w["rec_id"] if w else None, "as_of": w["as_of"] if w else None,
                                "rule": policy_map[a], "alternatives": alts}
        profiles[l] = prof
    return profiles


def arbitration_accuracy(records, labels, entities):
    by_id = {e["entity_id"]: e for e in entities}
    out = {}
    for policy in ["priority", "recency", "consensus"]:
        pm = {a: policy for a in ATTRS}
        out[policy] = _acc(golden_profiles(records, labels, pm), by_id)
    out["configured"] = _acc(golden_profiles(records, labels, CONFIGURED), by_id)
    return out


def _acc(profiles, by_id):
    res = {}
    for a in ATTRS:
        right = filled = n = 0
        for p in profiles.values():
            t = p["truth"]
            if t not in by_id:
                continue
            tv = truth_value(by_id[t], a, by_id)
            if a == "parent_lei" and not tv:
                continue  # only score entities that have a parent
            n += 1
            v = p["attrs"][a]["value"]
            if v is None:
                continue
            filled += 1
            right += int(v == tv)
        res[a] = {"accuracy_when_filled": right / filled if filled else 0.0,
                  "fill": filled / n if n else 0.0, "n": n}
    return res


# ---------------------------------------------------------------- hierarchy checks
def hierarchy_defects(profiles):
    lei_to_cl = {}
    for l, p in profiles.items():
        v = p["attrs"]["lei"]["value"]
        if v:
            lei_to_cl.setdefault(v, l)
    orphan = self_parent = 0
    parent_of = {}
    for l, p in profiles.items():
        pl = p["attrs"]["parent_lei"]["value"]
        if not pl:
            continue
        if pl == p["attrs"]["lei"]["value"]:
            self_parent += 1
        elif pl not in lei_to_cl:
            orphan += 1
        else:
            parent_of[l] = lei_to_cl[pl]
    cycles = 0
    for start in parent_of:
        seen, x = set(), start
        while x in parent_of and x not in seen:
            seen.add(x)
            x = parent_of[x]
        if x == start:
            cycles += 1
    return {"orphan_parent_refs": orphan, "self_parent": self_parent, "nodes_in_cycles": cycles,
            "linked_to_parent": len(parent_of)}
