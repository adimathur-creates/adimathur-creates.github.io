const test = require("node:test"), assert = require("node:assert");
const S = require("../src/sim.js"), L = require("../src/ledger.js");
const R = S.seeds(10), RR = S.seeds(10, { alloc: "risk" });
const m = (rs, p, k) => rs.reduce((s, r) => s + r[p][k], 0) / rs.length;
const all = (rs, p, k) => rs.flatMap((r) => r[p][k]);

test("simulation is reproducible", () => { assert.deepStrictEqual(S.run({ seed: 3 }).stratified, S.run({ seed: 3 }).stratified); });
test("confidence monitoring catches loud drift fast but misses every silent drift", () => {
  assert.ok(all(R, "confidence", "loud").length === 30); assert.strictEqual(all(R, "confidence", "silent").length, 0);
});
test("stratified audits catch every drift, loud and silent, on every seed", () => { R.forEach((r) => assert.strictEqual(r.stratified.missed, 0)); RR.forEach((r) => assert.strictEqual(r.stratified.missed, 0)); });
test("on the same audit count, stratified beats random on speed and cost", () => {
  assert.ok(m(R, "stratified", "meanSilent") < m(R, "random", "meanSilent")); assert.ok(m(R, "stratified", "cost") < 0.6 * m(R, "random", "cost"));
});
test("stratified audits cost less than waiting for complaints, with far fewer false alarms", () => {
  assert.ok(m(RR, "stratified", "cost") < 0.6 * m(R, "client", "cost")); assert.ok(m(R, "stratified", "falseAlarms") < 0.25 * m(R, "client", "falseAlarms"));
});
test("allocating audits by money at risk cuts drift cost further", () => { assert.ok(m(RR, "stratified", "cost") < 0.85 * m(R, "stratified", "cost")); });
test("risk allocation keeps the same number of audits per day", () => {
  const a = S.auditPlan(S.ASSUME), b = S.auditPlan(Object.assign({}, S.ASSUME, { alloc: "risk" })), sum = (o) => Object.values(o).reduce((s, v) => s + v, 0);
  assert.ok(Math.abs(sum(a) - sum(b)) <= 2);
});
test("drift costs are only counted while a drift is live", () => { const r = S.run({ seed: 9, events: [] }); S.POLICIES.forEach((p) => assert.strictEqual(r[p].cost, 0)); });
test("crediting every returning lead overstates value more than 2x; before/after overstates it too", () => {
  const x = L.run(); assert.ok(x.creditAll > 2 * x.truth); assert.ok(x.beforeAfter > 1.15 * x.truth);
});
test("a 5% holdout's 95% interval covers the true value about 95% of the time", () => {
  const t = L.holdoutTable([0.05], 200)[0]; assert.ok(t.cover > 0.9 && t.cover <= 1);
});
test("bigger holdouts give tighter intervals and cost more", () => {
  const t = L.holdoutTable([0.02, 0.1], 60); assert.ok(t[1].ci < t[0].ci); assert.ok(t[1].cost > t[0].cost);
});
