const test = require("node:test"); const assert = require("node:assert");
const M = require("../src/model.js"); const F = require("../src/facts.js");
const A = (id) => M.ARCHETYPES.find((a) => a.id === id);

test("required exit = fund / ownership, in Rs crore", () => {
  assert.strictEqual(Math.round(M.requiredExitCr()), 4400); // $50M / 10% = $500M at Rs 88
  assert.strictEqual(Math.round(M.requiredExitCr({ exitOwnership: 0.15 })), 2933);
});
test("supplier copilot revenue matches Recourse pricing maths", () => {
  assert.strictEqual(M.revenueCr(A("supplier")), 60); // 10 lakh x 5% x Rs 12,000
});
test("claim-to-cash revenue is stock x pursued x share x take", () => {
  assert.ok(Math.abs(M.revenueCr(A("claim")) - 810000 * 0.04 * 0.10 * 0.032) < 1e-9);
});
test("platform revenue is the sum of the two shapes it combines", () => {
  const sum = M.revenueCr(A("buyer")) + M.revenueCr(A("finance"));
  assert.ok(Math.abs(M.revenueCr(A("platform")) - sum) < 1e-9);
});
test("fund multiple is linear in exit ownership", () => {
  const a = A("buyer");
  const m10 = M.fundMultiple(a, { exitOwnership: 0.10 }), m20 = M.fundMultiple(a, { exitOwnership: 0.20 });
  assert.ok(Math.abs(m20 / m10 - 2) < 1e-9);
});
test("fund score clamps between 1 and 5", () => {
  assert.strictEqual(M.fundScore(0), 1); assert.strictEqual(M.fundScore(1), 5); assert.strictEqual(M.fundScore(3), 5);
  assert.strictEqual(M.fundScore(0.5), 3);
});
test("overrides change only the archetype they target", () => {
  const before = M.revenueCr(A("bureau"));
  M.revenueCr(A("supplier"), { supplier: { share: 0.5 } });
  assert.strictEqual(M.revenueCr(A("bureau"), { supplier: { share: 0.5 } }), before);
});
test("base case: no single shape returns the fund on its own", () => {
  M.rank().forEach((r) => assert.ok(r.fundMultiple < 1, r.short));
});
test("base case ranking puts the buyer-led platform first and the supplier copilot last", () => {
  const r = M.rank(); assert.strictEqual(r[0].id, "platform"); assert.strictEqual(r[r.length - 1].id, "supplier");
});
test("bull case: the buyer-led platform clears 1x", () => {
  const s = M.SCENARIOS.bull; const r = M.rank(null, s.fund, s.overrides);
  assert.ok(r.find((x) => x.id === "platform").fundMultiple > 1);
});
test("ranking is robust: platform stays top when the fund criterion weight is zero", () => {
  const w = Object.fromEntries(M.CRITERIA.map((c) => [c.id, c.weight])); w.fund = 0;
  assert.strictEqual(M.rank(w)[0].id, "platform");
});
test("supplier copilot is last under every single-criterion weighting except capital", () => {
  M.CRITERIA.forEach((c) => {
    if (c.id === "capital") return;
    const w = Object.fromEntries(M.CRITERIA.map((x) => [x.id, x.id === c.id ? 1 : 0]));
    const r = M.rank(w); const last = r[r.length - 1].score;
    assert.ok(Math.abs(r.find((x) => x.id === "supplier").score - last) < 1e-9, c.id);
  });
});
test("break-even solves to 1x", () => {
  const a = A("platform"); const v = M.breakEven(a, "volume");
  const m = M.fundMultiple(a, null, { platform: Object.assign(M.inputsOf(a), { volume: v }) });
  assert.ok(Math.abs(m - 1) < 1e-6);
});
test("every score is an integer from 1 to 5 and every criterion is scored", () => {
  M.ARCHETYPES.forEach((a) => M.CRITERIA.filter((c) => c.id !== "fund").forEach((c) => {
    const v = a.scores[c.id]; assert.ok(Number.isInteger(v) && v >= 1 && v <= 5, a.id + c.id);
  }));
});
test("every input has a reason and every fact has a source URL", () => {
  M.ARCHETYPES.forEach((a) => a.inputs.forEach((i) => assert.ok(i.why && i.why.length > 5, a.id + i.k)));
  Object.values(F.facts).forEach((f) => assert.ok(/^https:\/\//.test(f.url), f.v));
});
test("filing rate implied by Samadhaan is under 1% of the stock a year", () => {
  const perYear = 55244 / 8.7; assert.ok(perYear / 810000 < 0.01);
});
