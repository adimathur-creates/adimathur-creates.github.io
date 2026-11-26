const test = require("node:test"); const assert = require("node:assert");
const P = require("../src/policy.js"); const S = require("../src/simulate.js");
const act = (type, o) => Object.assign({ type, confidence: 0.95, evidence: 1 }, o || {});

test("vendor renewals are never done by the agent", () => {
  assert.strictEqual(P.tier(act("vendor_renewal", { money: 50 })).tier, "BLOCK");
  assert.strictEqual(P.tier(act("vendor_renewal"), { approved: 500, accepted: 500, reversals: 0 }).tier, "BLOCK");
});
test("a small confident rate change with full facts runs automatically", () => {
  assert.strictEqual(P.tier(act("rate_change", { money: 40 })).tier, "AUTO");
});
test("missing facts always means asking, whatever the track record", () => {
  const h = { approved: 999, accepted: 999, reversals: 0 };
  assert.strictEqual(P.tier(act("rate_change", { money: 40, evidence: 0.7 }), h).tier, "APPROVE");
});
test("low confidence means asking", () => {
  assert.strictEqual(P.tier(act("review_reply", { confidence: 0.6 })).tier, "APPROVE");
});
test("$1,000 or more always needs a yes", () => {
  assert.strictEqual(P.tier(act("recon_adjust", { money: 1500 }), { approved: 999, accepted: 999, reversals: 0 }).tier, "APPROVE");
});
test("guest-facing and irreversible needs a yes by default", () => {
  assert.strictEqual(P.tier(act("guest_refund", { money: 80 })).tier, "APPROVE");
  assert.strictEqual(P.tier(act("overbook_walk")).tier, "APPROVE");
});
test("guest-facing but reversible gets an undo window", () => {
  assert.strictEqual(P.tier(act("review_reply")).tier, "UNDO");
});
test("earned autonomy: small refunds go hands-free after 20 clean approvals at that hotel", () => {
  const d = P.tier(act("guest_refund", { money: 80 }), { approved: 20, accepted: 20, reversals: 0 });
  assert.strictEqual(d.tier, "AUTO"); assert.ok(d.earned);
});
test("earned autonomy is lost after a reversal", () => {
  assert.strictEqual(P.tier(act("guest_refund", { money: 80 }), { approved: 40, accepted: 39, reversals: 1 }).tier, "APPROVE");
});
test("earned autonomy never unlocks big irreversible actions", () => {
  assert.strictEqual(P.tier(act("vendor_payment", { money: 600 }), { approved: 99, accepted: 99, reversals: 0 }).tier, "APPROVE");
});
test("every decision has at least one reason and a full audit record", () => {
  for (const t of Object.keys(P.ACTIONS)) {
    const a = act(t), d = P.tier(a); assert.ok(d.reasons.length >= 1, t);
    const rec = P.auditRecord(a, d, "H1", "2026-11-26T10:00Z");
    for (const k of ["hotel", "at", "action", "money", "tier", "reasons", "decidedBy", "reversibleUntil"]) assert.ok(k in rec, t + k);
  }
});
test("simulation is reproducible", () => {
  assert.deepStrictEqual(S.run({ seed: 4, hotels: 30 }).tiers, S.run({ seed: 4, hotels: 30 }).tiers);
});
test("tiers cut harm by more than half vs full autonomy and keep most actions hands-free, every seed", () => {
  S.seeds(5, { hotels: 60 }).forEach((r) => { assert.ok(r.tiers.harmPerHotelMonth < 0.5 * r.autonomous.harmPerHotelMonth); assert.ok(r.tiers.auto + r.tiers.undo > 0.6); });
});
test("tiers use far less owner time than approving every step", () => {
  const r = S.run({ hotels: 80 }); assert.ok(r.tiers.minutesPerHotelDay < 0.5 * r.every_step.minutesPerHotelDay);
});
test("fixing the agent's inputs raises hands-free share and lowers owner time", () => {
  const a = S.run({ hotels: 80 }), b = S.run(Object.assign({ hotels: 80 }, S.COMPLETE));
  assert.ok(b.tiers.auto + b.tiers.undo > a.tiers.auto + a.tiers.undo + 0.05); assert.ok(b.tiers.minutesPerHotelDay < a.tiers.minutesPerHotelDay);
});
test("earned autonomy saves little owner time and does not reduce harm (why it is parked)", () => {
  const r = S.run({ hotels: 120 });
  assert.ok(r.tiers.minutesPerHotelDay - r.earned.minutesPerHotelDay < 2); assert.ok(r.earned.harmPerHotelMonth >= r.tiers.harmPerHotelMonth * 0.98);
});
test("result holds when owners are careless", () => {
  const r = S.run({ hotels: 80, approveCatch: 0.6, undoCatch: 0.25 }); assert.ok(r.tiers.totalPerHotelMonth < r.autonomous.totalPerHotelMonth);
});
