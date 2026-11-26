const test = require("node:test"), assert = require("node:assert");
const D = require("../src/data.js"), M = require("../src/match.js"), R = require("../src/resolve.js"), G = require("../src/govern.js"), A = require("../src/arbitrate.js"), L = require("../src/learn.js");
const runs = {}; const run = (seed) => (runs[seed] = runs[seed] || R.run({ seed }));

test("LEI check digits follow ISO 17442 (MOD 97-10)", () => {
  const r = D.rng(1); for (let i = 0; i < 50; i++) assert.ok(D.leiValid(D.makeLei(r)));
  assert.ok(D.leiValid("5493001KJTIIGC8Y1R12")); // a published LEI
  assert.ok(!D.leiValid("5493001KJTIIGC8Y1R13"));
});
test("names normalise across legal-form spellings and abbreviations", () => {
  const a = M.normName("The Asterion Cap. Pvt. Ltd."), b = M.normName("ASTERION CAPITAL PRIVATE LIMITED");
  assert.strictEqual(a.core, b.core); assert.strictEqual(a.form, b.form);
  assert.strictEqual(M.normName("Kestrel G.m.b.H.").form, "GMBH");
});
test("constrained clustering never merges a cannot-link pair, even through a third record", () => {
  const c = R.cluster(3, [{ i: 0, j: 2, w: 9 }, { i: 1, j: 2, w: 8 }], [[0, 1]], true);
  assert.notStrictEqual(c.label[0], c.label[1]); assert.strictEqual(c.refused, 1);
  const u = R.cluster(3, [{ i: 0, j: 2, w: 9 }, { i: 1, j: 2, w: 8 }], [[0, 1]], false); assert.strictEqual(u.label[0], u.label[1]);
});
test("an invalid LEI is ignored, never treated as a conflict", () => {
  const P = M.prepare([{ rid: "a", name: "Kestrel Capital Ltd", country: "GB", lei: "5493001KJTIIGC8Y1R13", addr: { city: "London" } }, { rid: "b", name: "Kestrel Capital Ltd", country: "GB", lei: "5493001KJTIIGC8Y1R12", addr: { city: "London" } }]);
  const f = M.compare(P[0], P[1]); assert.ok(!f.leiConflict && !f.leiEq && f.leiInvalid);
});
test("every governed score is the sum of its explained terms", () => {
  const { pairs } = run(7)._; pairs.slice(0, 500).forEach((p) => assert.ok(Math.abs(M.explain(p.f).reduce((s, t) => s + t.w, 0) - p.score) < 1e-9));
});
test("governed output never puts two different valid LEIs in one profile", () => {
  const { P, label } = run(7)._, seen = {};
  P.forEach((x, i) => { if (!x.leiOk) return; const k = label[i]; seen[k] = seen[k] || new Set(); seen[k].add(x.lei); });
  Object.values(seen).forEach((s) => assert.ok(s.size <= 1));
});
test("results are reproducible", () => { assert.deepStrictEqual(R.run({ seed: 3 }).governed, R.run({ seed: 3 }).governed); });
test("governed keeps precision above 99% and beats fuzzy matching on recall, on every seed", () => {
  [7, 11, 19].forEach((s) => { const x = run(s); assert.ok(x.governed.precision > 0.99, s); assert.ok(x.governed.recall > x.naive.recall, s); });
});
test("governed leaves under a fifth of the wrongly merged profiles that fuzzy matching creates", () => {
  [7, 11, 19].forEach((s) => { const x = run(s); assert.ok(x.governed.overMerged * 5 < x.naive.overMerged, s); });
});
test("fuzzy matching merges most same-name twins; governed merges few", () => {
  [7, 11].forEach((s) => { const t = run(s); assert.ok(t.naive.traps.twin[0] / t.naive.traps.twin[1] > 0.5); assert.ok(t.governed.traps.twin[0] / t.governed.traps.twin[1] < 0.15); });
});
test("asking one question per pair of clusters cuts review tasks by more than 60%", () => {
  const g = run(7).governed; assert.ok(g.reviewPairs < 0.4 * g.pairLevelQueue);
});
test("overrides kept against source records: no reverted fixes and far less review over six months", () => {
  const s = G.simulate({ months: 4 }); assert.strictEqual(s.totals.persistent.reverted, 0); assert.ok(s.totals.amnesia.reverted > 0);
  assert.ok(s.totals.persistent.reviewTasks < 0.5 * s.totals.amnesia.reviewTasks);
});
test("an analyst's split is re-verified when one of its records changes", () => {
  const data = D.generate({ seed: 5 }), recs = data.records.slice(0, 300), b = R.build(recs); b.P.__ent = data.byId;
  const mem = { decisions: new Map(), splits: new Map([["k", { a: recs[0].rid, b: recs[1].rid, va: 0, vb: 0 }]]) };
  b.P[0].v = 1; const g = R.governedResolve(b.P, b.pairs, R.ASSUME, mem, D.rng(1));
  assert.strictEqual(g.reverify, 1); assert.strictEqual(mem.splits.size, 0);
});
test("attribute-level rules beat a single trusted source, and every value carries lineage", () => {
  const { P, label, data } = run(7)._, a = A.assess(P, label, data.byId, ["one_source", "rules"]);
  assert.ok(a.res.rules.overall > a.res.one_source.overall);
  const grp = P.filter((x, i) => label[i] === label[0]), prof = A.profile(grp, "rules", a.ctx);
  Object.values(prof).filter(Boolean).forEach((v) => ["value", "source", "record", "asOf", "rule"].forEach((k) => assert.ok(k in v)));
});
test("vendor value shows up in profile accuracy: dropping the commercial vendor costs over 5 points", () => {
  const data = D.generate({ seed: 7 }), acc = (drop) => { const x = R.run({ data, dropSource: drop }); return A.assess(x._.P, x._.label, data.byId, ["rules"]).res.rules.overall; };
  assert.ok(acc(undefined) - acc("VENDOR_B") > 0.05);
});
test("parked finding: a model trained on today's process labels needs more review than the hand weights", () => {
  const c = L.compare({ targetP: 0.99 }); assert.ok(c.ml.review > c.hand.review);
});
