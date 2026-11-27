const test = require("node:test"), assert = require("node:assert");
const S = require("../src/sim.js");
const X = S.run(), X0 = S.run({ planLift: 0 });
test("reason shares add up to 100%", () => { const t = Object.values(S.REASONS).reduce((s, r) => s + r.share, 0); assert.ok(Math.abs(t - 1) < 1e-9); });
test("simulation is reproducible", () => { assert.deepStrictEqual(S.run({ users: 2000, seed: 3 }).not_yet.approved, S.run({ users: 2000, seed: 3 }).not_yet.approved); });
test("'not yet' at least doubles re-approvals even if plans change no behaviour", () => { assert.ok(X0.not_yet.approvalRate > 2 * X0.status_quo.approvalRate); });
test("'not yet' cuts hard enquiries per user and the rejection spiral", () => {
  assert.ok(X.not_yet.enqPerUser < 0.75 * X.status_quo.enqPerUser); assert.ok(X.not_yet.spiralRate < 0.25 * X.status_quo.spiralRate);
});
test("users declined for policy reasons are never approved by any arm", () => { S.POLICIES.forEach((p) => assert.strictEqual(X[p].byReason.policy.approved, 0)); });
test("too-many-enquiries users recover only by staying quiet", () => { assert.ok(X.not_yet.byReason.enquiries.approved / X.not_yet.byReason.enquiries.n > X.status_quo.byReason.enquiries.approved / X.status_quo.byReason.enquiries.n); });
test("the trade-off is visible: default rate on approvals rises, but stays under 1.3x the approved base", () => {
  assert.ok(X.not_yet.pd > X.status_quo.pd); assert.ok(X.not_yet.pd < 1.3 * S.ASSUME.basePD);
});
test("incremental approvals clear a break-even default rate of C/(C+L) with C=4k, L=40k", () => {
  const incA = X0.not_yet.per1000 - X0.status_quo.per1000, incB = X0.not_yet.badPer1000 - X0.status_quo.badPer1000; assert.ok(incB / incA < 4000 / 44000);
});
test("an A/B test needs a sensible sample size", () => { const n = S.sampleSize(0.177, 0.21); assert.ok(n > 1000 && n < 10000); });
