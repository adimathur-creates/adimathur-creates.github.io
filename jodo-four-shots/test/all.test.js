const test = require("node:test"), assert = require("node:assert");
const S = require("../src/sim.js");
const X = S.run(), T = S.run({ noReminder: true, noLink: true });
test("segment shares add up to 100%", () => { assert.ok(Math.abs(Object.values(S.SEGMENTS).reduce((s, x) => s + x.share, 0) - 1) < 1e-9); });
test("reproducible", () => { assert.deepStrictEqual(S.run({ payers: 2000, seed: 3 }).inflow.collected, S.run({ payers: 2000, seed: 3 }).inflow.collected); });
test("no policy ever uses more than one attempt + three retries per cycle", () => { S.POLICIES.forEach((p) => assert.ok(X[p].failPer <= 4)); });
test("spreading retries beats retrying every morning", () => { assert.ok(X.spread.rate > X.daily.rate); });
test("inflow-aware timing alone recovers most of the gap", () => { assert.ok(T.inflow.rate - X.daily.rate > 0.15); assert.ok(T.inflow.rate > X.spread.rate); });
test("reminders and pay links add something, but much less than timing", () => {
  const extra = X.inflow.rate - T.inflow.rate, timing = T.inflow.rate - X.daily.rate; assert.ok(extra > 0); assert.ok(extra < 0.25 * timing);
});
test("fewer failed attempts means fewer revoked mandates", () => { assert.ok(X.inflow.failPer < X.daily.failPer); assert.ok(X.inflow.revokeRate < 0.7 * X.daily.revokeRate); });
test("merchants chase far fewer payers by hand", () => { assert.ok(X.inflow.chasePer100 < 0.25 * X.daily.chasePer100); });
test("holds on another seed", () => { const Y = S.run({ seed: 23 }); assert.ok(Y.inflow.rate > Y.spread.rate && Y.spread.rate > Y.daily.rate); });
