// Turns scored pairs into entity clusters under different policies, and measures the result against truth.
(function (root, f) { if (typeof module === "object" && module.exports) module.exports = f(require("./data.js"), require("./match.js")); else root.ERResolve = f(root.ERData, root.ERMatch); })(this, function (D, M) {
  const ASSUME = { naiveThreshold: 8, autoMatch: 10, reviewFloor: 3, reviewerAccuracy: 0.95, reviewMinutes: 4 };
  const POLICIES = ["deterministic", "naive", "scored", "guarded", "governed"];
  const NAMES = { deterministic: "IDs only (LEI / registration number)", naive: "Fuzzy name + address", scored: "Evidence scoring", guarded: "Evidence scoring + hard rules", governed: "Hard rules + human review band" };

  function build(records) { const P = M.prepare(records), C = M.candidates(P); const pairs = C.map(([i, j]) => { const f = M.compare(P[i], P[j]); return { i, j, f, naive: M.scoreNaive(f), score: M.scoreGoverned(f), hard: M.hardRules(f) }; }); return { P, pairs }; }

  // Cluster with cannot-link constraints: merge highest-evidence edges first; refuse a merge that would put two
  // records with a cannot-link in one cluster. Plain union-find (no constraints) when cannot is empty and guard=false.
  function cluster(n, edges, cannot, guard) {
    const parent = Array.from({ length: n }, (_, i) => i), members = Array.from({ length: n }, (_, i) => [i]), blocked = Array.from({ length: n }, () => new Set());
    const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
    if (guard) cannot.forEach(([i, j]) => { blocked[i].add(j); blocked[j].add(i); });
    let refused = 0;
    edges.slice().sort((a, b) => b.w - a.w).forEach((e) => {
      let a = find(e.i), b = find(e.j); if (a === b) return;
      if (guard) { const [s, l] = members[a].length < members[b].length ? [a, b] : [b, a]; const lset = new Set(members[l]); for (const x of members[s]) for (const y of blocked[x]) if (lset.has(y)) { refused++; return; } }
      if (members[a].length < members[b].length) [a, b] = [b, a];
      parent[b] = a; members[a] = members[a].concat(members[b]); members[b] = null;
    });
    const label = new Array(n); for (let i = 0; i < n; i++) label[i] = find(i);
    return { label, refused };
  }

  function evaluate(P, label, pairsReviewed) {
    const pred = {}, truth = {}; P.forEach((r, i) => { (pred[label[i]] = pred[label[i]] || []).push(i); (truth[r.truth] = truth[r.truth] || []).push(i); });
    let tp = 0, pp = 0, tpairs = 0; const fmBy = { family: 0, homonym: 0, other: 0 };
    const ent = (i) => P[i].truth;
    for (const k in truth) { const a = truth[k].length; tpairs += (a * (a - 1)) / 2; }
    let overMerged = 0, entitiesInBadMerges = 0, biggest = 0;
    for (const k in pred) {
      const a = pred[k]; biggest = Math.max(biggest, a.length); pp += (a.length * (a.length - 1)) / 2;
      const cnt = {}; a.forEach((i) => (cnt[ent(i)] = (cnt[ent(i)] || 0) + 1)); const ks = Object.keys(cnt);
      ks.forEach((e) => (tp += (cnt[e] * (cnt[e] - 1)) / 2));
      if (ks.length > 1) { overMerged++; entitiesInBadMerges += ks.length; }
    }
    // classify false-merge pairs by relationship
    const fam = (i) => P.__ent[ent(i)];
    for (const k in pred) { const a = pred[k]; if (a.length < 2) continue; const es = [...new Set(a.map(ent))]; if (es.length < 2) continue;
      for (let x = 0; x < es.length; x++) for (let y = x + 1; y < es.length; y++) { const A = P.__ent[es[x]], B = P.__ent[es[y]]; const w = a.filter((i) => ent(i) === es[x]).length * a.filter((i) => ent(i) === es[y]).length;
        if (A.family === B.family) fmBy.family += w; else if (A.brand.split(" ")[0] === B.brand.split(" ")[0]) fmBy.homonym += w; else fmBy.other += w; } }
    let duplicates = 0; for (const k in truth) duplicates += new Set(truth[k].map((i) => label[i])).size - 1;
    const precision = pp ? tp / pp : 1, recall = tpairs ? tp / tpairs : 1;
    const lab = {}; P.forEach((r2, i) => { (lab[r2.truth] = lab[r2.truth] || new Set()).add(label[i]); });
    const together = (a, b) => lab[a] && lab[b] && [...lab[a]].some((x) => lab[b].has(x));
    const traps = { twin: [0, 0], homonym: [0, 0], parentChild: [0, 0] };
    Object.values(P.__ent).forEach((e) => { if (!lab[e.id]) return;
      if (e.twinOf && lab[e.twinOf]) { traps.twin[1]++; if (together(e.id, e.twinOf)) traps.twin[0]++; }
      if (e.homonymOf && lab[e.homonymOf]) { traps.homonym[1]++; if (together(e.id, e.homonymOf)) traps.homonym[0]++; }
      if (e.parent && lab[e.parent]) { traps.parentChild[1]++; if (together(e.id, e.parent)) traps.parentChild[0]++; } });
    return { traps, precision, recall, f1: (2 * precision * recall) / (precision + recall || 1), overMerged, entitiesInBadMerges, duplicates, biggest, falseMergePairs: pp - tp, fmBy, clusters: Object.keys(pred).length, entities: Object.keys(truth).length, reviewPairs: pairsReviewed || 0, reviewHours: ((pairsReviewed || 0) * ASSUME.reviewMinutes) / 60 };
  }

  function run(opts) {
    const o = Object.assign({ seed: 7 }, ASSUME, opts || {});
    const data = o.data || D.generate({ seed: o.seed, ...(o.gen || {}) });
    const records = o.dropSource ? data.records.filter((r) => r.src !== o.dropSource) : data.records;
    const { P, pairs } = o.built || build(records); P.__ent = data.byId;
    const r = D.rng(o.seed * 31 + 5), n = P.length, out = {};
    const truthSame = (p) => P[p.i].truth === P[p.j].truth;
    // 1. deterministic
    out.deterministic = evaluate(P, cluster(n, pairs.filter((p) => p.f.leiEq || p.f.regEq || p.f.vendorEq).map((p) => ({ i: p.i, j: p.j, w: 1 })), [], false).label);
    // 2. naive fuzzy
    out.naive = evaluate(P, cluster(n, pairs.filter((p) => p.naive >= o.naiveThreshold).map((p) => ({ i: p.i, j: p.j, w: p.naive })), [], false).label);
    // 3. scored, single threshold, no constraints
    out.scored = evaluate(P, cluster(n, pairs.filter((p) => p.score >= o.autoMatch).map((p) => ({ i: p.i, j: p.j, w: p.score })), [], false).label);
    // 4. guarded: hard rules become cannot-links; clustering refuses merges that would break one
    const cannot = pairs.filter((p) => p.hard.length).map((p) => [p.i, p.j]);
    const autoEdges = pairs.filter((p) => !p.hard.length && p.score >= o.autoMatch).map((p) => ({ i: p.i, j: p.j, w: p.score }));
    const s1g = cluster(n, autoEdges, cannot, true);
    out.guarded = evaluate(P, s1g.label); out.guarded.refused = s1g.refused;
    const G = governedResolve(P, pairs, o, null, r);
    out.governed = evaluate(P, G.label, G.review.length); Object.assign(out.governed, { refused: G.refused, pairLevelQueue: G.pairLevel, reviewerErrors: G.reviewerErrors, ambiguous: G.ambiguous });
    out.hardRuleBlocks = pairs.filter((p) => p.hard.length && p.score >= o.autoMatch).length;
    // trap outcomes: how many twin, homonym and parent-child pairs each policy wrongly merged
    out.meta = { records: n, candidates: pairs.length, entities: data.entities.length, seed: o.seed };
    out._ = { P, pairs, label: G.label, data, review: G.review, decisions: G.decisions, G };
    return out;
  }

  // Governed resolution. mem (optional) carries reviewer decisions and analyst splits across rebuilds, keyed by
  // source-record IDs and record versions, so a human fix survives the next run unless the record changes.
  function governedResolve(P, pairs, o, mem, r) {
    const n = P.length, idx = {}; P.forEach((x, i) => (idx[x.rid] = i));
    const truthSame = (p) => P[p.i].truth === P[p.j].truth, key = (i, j) => (P[i].rid < P[j].rid ? P[i].rid + "|" + P[j].rid : P[j].rid + "|" + P[i].rid);
    const ver = (i) => P[i].v || 0;
    const cannot = pairs.filter((p) => p.hard.length).map((p) => [p.i, p.j]);
    let reverify = 0;
    if (mem) mem.splits.forEach((sp, k) => { const i = idx[sp.a], j = idx[sp.b]; if (i === undefined || j === undefined) return; if (ver(i) !== sp.va || ver(j) !== sp.vb) { reverify++; mem.splits.delete(k); return; } cannot.push([i, j]); });
    const autoEdges = pairs.filter((p) => !p.hard.length && p.score >= o.autoMatch).map((p) => ({ i: p.i, j: p.j, w: p.score }));
    const cset = new Set(cannot.map(([i, j]) => Math.min(i, j) + "|" + Math.max(i, j))), conflict = (x, y) => cset.has(Math.min(x, y) + "|" + Math.max(x, y));
    const nb = Array.from({ length: n }, () => []); autoEdges.forEach((e) => { nb[e.i].push(e.j); nb[e.j].push(e.i); });
    const ambiguous = new Set();
    for (let v = 0; v < n; v++) { const ns = nb[v]; outer: for (let a = 0; a < ns.length; a++) for (let b = a + 1; b < ns.length; b++) if (conflict(ns[a], ns[b])) { ambiguous.add(v); break outer; } }
    const idLinked = new Set(pairs.filter((p) => p.f.leiEq || p.f.regEq || p.f.vendorEq).map((p) => p.i + "|" + p.j));
    const held = new Set(), autoEdgesG = autoEdges.filter((e) => { const h = (ambiguous.has(e.i) || ambiguous.has(e.j)) && !idLinked.has(e.i + "|" + e.j); if (h) held.add(e.i + "|" + e.j); return !h; });
    const s1 = cluster(n, autoEdgesG, cannot, true);
    const blockedPair = new Set(); cannot.forEach(([i, j]) => { blockedPair.add(s1.label[i] + "|" + s1.label[j]); blockedPair.add(s1.label[j] + "|" + s1.label[i]); });
    const tasks = {}; let pairLevel = 0;
    pairs.forEach((p) => { if (p.hard.length || p.score < o.reviewFloor || (p.score >= o.autoMatch && !held.has(p.i + "|" + p.j))) return; const a = s1.label[p.i], b = s1.label[p.j]; if (a === b) return; pairLevel++;
      if (blockedPair.has(a + "|" + b)) return; const k = a < b ? a + "|" + b : b + "|" + a; if (!tasks[k] || tasks[k].score < p.score) tasks[k] = p; });
    const review = [], decisions = []; let reused = 0;
    Object.values(tasks).forEach((p) => {
      const k = key(p.i, p.j), m = mem && mem.decisions.get(k);
      if (m && m.vi === ver(p.i) && m.vj === ver(p.j)) { reused++; decisions.push({ p, yes: m.yes, right: m.yes === truthSame(p), reused: true }); return; }
      review.push(p); const right = r() < o.reviewerAccuracy, yes = right ? truthSame(p) : !truthSame(p); decisions.push({ p, yes, right });
      if (mem) mem.decisions.set(k, { yes, vi: ver(p.i), vj: ver(p.j) });
    });
    const cannot2 = cannot.concat(decisions.filter((d) => !d.yes).map((d) => [d.p.i, d.p.j]));
    const edges = autoEdgesG.concat(decisions.filter((d) => d.yes).map((d) => ({ i: d.p.i, j: d.p.j, w: o.autoMatch })));
    const g = cluster(n, edges, cannot2, true);
    return { label: g.label, refused: g.refused, review, decisions, pairLevel, reused, reverify, ambiguous: ambiguous.size, ambiguousSet: ambiguous, held, reviewerErrors: decisions.filter((d) => !d.right && !d.reused).length, edges, cannot: cannot2 };
  }
  // precision/recall/workload of the governed policy across auto and review thresholds (for the page's sliders)
  function grid(opts, autos, floors) {
    const data = D.generate({ seed: (opts && opts.seed) || 7 }), built = build(data.records), res = [];
    for (const a of autos) for (const fl of floors) { if (fl >= a) continue; const x = run(Object.assign({}, opts, { data, built, autoMatch: a, reviewFloor: fl })).governed; res.push({ a, fl, p: x.precision, r: x.recall, om: x.overMerged, dup: x.duplicates, rv: x.reviewPairs }); }
    return res;
  }
  return { ASSUME, POLICIES, NAMES, build, cluster, evaluate, run, grid, governedResolve };
});
