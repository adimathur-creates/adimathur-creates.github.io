// ML-assisted matching: a logistic regression trained only on labels the process already produces
// (reviewer decisions, ID-confirmed pairs, hard-rule conflicts). Linear, so every score is explainable term by term.
(function (root, f) { if (typeof module === "object" && module.exports) module.exports = f(require("./data.js"), require("./resolve.js")); else root.ERLearn = f(root.ERData, root.ERResolve); })(this, function (D, R) {
  const FEATS = ["nameExact", "jw", "extraTokens", "formEq", "formConflict", "noForm", "pcEq", "pcDiff", "cityEq", "streetEq", "indEq", "indDiff", "crossCountry", "crm"];
  const LABELS = { nameExact: "Same normalised name", jw: "Name similarity", extraTokens: "Distinguishing words", formEq: "Same legal form", formConflict: "Different legal forms", noForm: "A name has no legal form", pcEq: "Same postcode", pcDiff: "Different postcodes", cityEq: "Same city", streetEq: "Same street", indEq: "Same industry", indDiff: "Different industry", crossCountry: "Different countries", crm: "A CRM record is involved" };
  function vec(p, P) { const f = p.f, a = P[p.i], b = P[p.j]; return [f.nameExact ? 1 : 0, f.jw, Math.min(3, new Set(f.extraTokens).size), f.formEq ? 1 : 0, f.formConflict ? 1 : 0, !a.n.form || !b.n.form ? 1 : 0, f.pcEq ? 1 : 0, f.pcDiff ? 1 : 0, f.cityEq ? 1 : 0, f.streetEq ? 1 : 0, f.indEq ? 1 : 0, f.indDiff ? 1 : 0, f.sameCountry ? 0 : 1, a.src === "CRM" || b.src === "CRM" ? 1 : 0]; }
  const sig = (z) => 1 / (1 + Math.exp(-z));
  function train(X, y, o) { const k = X[0].length, w = new Array(k + 1).fill(0), lr = o.lr || 0.3, l2 = o.l2 || 0.001;
    for (let ep = 0; ep < (o.epochs || 400); ep++) { const g = new Array(k + 1).fill(0); for (let n = 0; n < X.length; n++) { const z = w[k] + X[n].reduce((s, v, i) => s + v * w[i], 0), e = sig(z) - y[n]; for (let i = 0; i < k; i++) g[i] += e * X[n][i]; g[k] += e; }
      for (let i = 0; i <= k; i++) w[i] -= lr * (g[i] / X.length + (i < k ? l2 * w[i] : 0)); } return w; }
  const predict = (w, x) => sig(w[x.length] + x.reduce((s, v, i) => s + v * w[i], 0));
  // labels come from the process: reviewer yes/no (with reviewer error), ID-confirmed matches, hard-rule conflicts. Never ground truth.
  // mode "existing": labels the process already has. mode "audit": reviewer decisions + a random audit sample of
  // candidate pairs labelled by the same reviewers (same error rate). mode "reviewOnly": reviewer decisions alone.
  function trainingSet(seed, mode, auditN) { const x = R.run({ seed }), { P, pairs, decisions } = x._, X = [], y = [], r = D.rng(seed * 13 + 3);
    decisions.forEach((d) => { X.push(vec(d.p, P)); y.push(d.yes ? 1 : 0); });
    if (mode === "existing") pairs.forEach((p) => { if ((p.f.leiEq || p.f.regEq) && !p.hard.length) { X.push(vec(p, P)); y.push(1); } else if (p.hard.length) { X.push(vec(p, P)); y.push(0); } });
    if (mode === "audit") { const pool = pairs.filter((p) => !p.hard.length && !p.f.leiEq && !p.f.regEq && !p.f.vendorEq); for (let k = 0; k < auditN; k++) { const p = pool[Math.floor(r() * pool.length)], same = P[p.i].truth === P[p.j].truth; X.push(vec(p, P)); y.push((r() < 0.95 ? same : !same) ? 1 : 0); } }
    return { X, y, n: decisions.length };
  }
  // Workload needed to reach a precision target: auto-match pairs above the line, review the grey zone, drop below.
  function workload(scores, truth, targetP, maxMissShare) {
    const idx = scores.map((s, i) => i).sort((a, b) => scores[b] - scores[a]); let tp = 0, auto = 0;
    for (let k = 0; k < idx.length; k++) { tp += truth[idx[k]] ? 1 : 0; if (tp / (k + 1) >= targetP) auto = k + 1; }
    const totalTrue = truth.filter(Boolean).length; let missed = 0, floor = idx.length;
    for (let k = idx.length - 1; k >= auto; k--) { missed += truth[idx[k]] ? 1 : 0; if (missed / totalTrue > maxMissShare) { floor = k + 1; break; } }
    let autoTP = 0; for (let k = 0; k < auto; k++) autoTP += truth[idx[k]] ? 1 : 0;
    return { auto, review: Math.max(0, floor - auto), autoRecall: autoTP / totalTrue };
  }
  function compare(opts) {
    const o = Object.assign({ trainSeed: 7, testSeed: 11, targetP: 0.995, maxMiss: 0.01 }, opts || {});
    const T = trainingSet(o.trainSeed, o.mode || "existing", o.auditN || 400), w = train(T.X, T.y, {});
    const t = R.run({ seed: o.testSeed }), { P, pairs } = t._;
    const pool = pairs.filter((p) => !p.hard.length && !p.f.leiEq && !p.f.regEq && !p.f.vendorEq); // the hard part: no shared ID
    const truth = pool.map((p) => P[p.i].truth === P[p.j].truth);
    const hand = workload(pool.map((p) => p.score), truth, o.targetP, o.maxMiss), ml = workload(pool.map((p) => predict(w, vec(p, P))), truth, o.targetP, o.maxMiss);
    const weights = FEATS.map((k, i) => ({ k, label: LABELS[k], w: w[i] })).sort((a, b) => Math.abs(b.w) - Math.abs(a.w));
    return { trainLabels: T.X.length, reviewerLabels: T.n, poolPairs: pool.length, truePairs: truth.filter(Boolean).length, hand, ml, weights, bias: w[FEATS.length] };
  }
  return { FEATS, LABELS, vec, train, predict, compare, workload };
});
