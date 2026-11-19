const test = require("node:test"); const assert = require("node:assert");
const S = require("../src/engine.js"); const Sim = require("../src/simulate.js"); const T = require("../src/teasers.js");
const t = (id) => T.find((x) => x.id === id);
const run = (id, p) => S.screen(Object.assign({}, t(id).d, { src: t(id).src }), null, p);

test("fully stated, in-mandate deal passes under every policy", () => {
  for (const p of ["strict", "lenient", "ask"]) assert.strictEqual(run("maple", p).verdict, "PASS");
});
test("out-of-sector deal is rejected under every policy, with the reason", () => {
  for (const p of ["strict", "lenient", "ask"]) { const r = run("cobalt", p); assert.strictEqual(r.verdict, "REJECT"); assert.match(r.reason, /Sector/); }
});
test("missing stake: forced verdict rejects, ask policy asks", () => {
  assert.strictEqual(run("harbor", "strict").verdict, "REJECT");
  const r = run("harbor", "ask"); assert.strictEqual(r.verdict, "ASK");
  assert.ok(r.questions.length >= 1 && r.questions.length <= 2);
});
test("questions are ordered by how likely the answer settles the deal", () => {
  const r = run("harbor", "ask"); // missing: control (0.25), growth (0.25), topCustomer (0.15)
  assert.ok(!r.questions.map((q) => q.k).includes("topCustomer"));
  assert.deepStrictEqual(r.unasked, ["topCustomer"]);
});
test("never more than the question cap", () => {
  const r = S.screen({ sector: "Industrials", geo: "US" }, null, "ask", { maxQuestions: 2 });
  assert.strictEqual(r.questions.length, 2); assert.strictEqual(r.questions[0].k, "ebitda");
});
test("near miss goes to a human under ask, is rejected otherwise", () => {
  assert.strictEqual(run("northline", "ask").verdict, "REVIEW");
  assert.strictEqual(run("northline", "strict").verdict, "REJECT");
});
test("near miss needs both: small gap and fast growth", () => {
  const base = { sector: "Industrials", geo: "US", control: true, margin: 0.2, topCustomer: 0.1 };
  assert.strictEqual(S.screen(Object.assign({ ebitda: 4.6, growth: 0.08 }, base), null, "ask").verdict, "REJECT");
  assert.strictEqual(S.screen(Object.assign({ ebitda: 3.0, growth: 0.30 }, base), null, "ask").verdict, "REJECT");
});
test("a stated failure beats a missing field: reject, do not ask", () => {
  assert.strictEqual(S.screen({ sector: "Software", geo: null }, null, "ask").verdict, "REJECT");
});
test("every verdict row cites its field status", () => {
  run("harbor", "ask").rows.forEach((r) => assert.ok(["pass", "fail", "missing"].includes(r.status)));
});
test("mandate changes the verdict (no hidden defaults)", () => {
  assert.strictEqual(S.screen(t("maple").d, { geos: ["US"] }, "ask").verdict, "REJECT");
});
test("simulation is reproducible for a seed", () => {
  assert.deepStrictEqual(Sim.run({ seed: 7 }).ask, Sim.run({ seed: 7 }).ask);
});
test("ask keeps every fit deal the forced verdict loses, in every seed", () => {
  Sim.seeds(10).forEach((r) => { assert.ok(r.ask.fitFound >= r.strict.fitFound); assert.strictEqual(r.ask.fitLost, 0); });
});
test("ask wastes fewer full screens and hours than passing everything", () => {
  Sim.seeds(10).forEach((r) => { assert.ok(r.ask.wasted < r.lenient.wasted); assert.ok(r.ask.hours < r.lenient.hours); });
});
test("forced verdict gets better as teasers disclose more", () => {
  const s = Sim.sweep("ebitda", [0.4, 1.0]); assert.ok(s[1].strict > s[0].strict);
});
test("fewer banker replies cost more human hours, not lost deals", () => {
  const lo = Sim.run({ bankerReplies: 0.3 }), hi = Sim.run({ bankerReplies: 0.9 });
  assert.ok(lo.ask.hours > hi.ask.hours); assert.strictEqual(lo.ask.fitLost, 0);
});
test("fit share stays near 5% of inbound, in line with a fund advancing a small fraction", () => {
  const f = Sim.run().meta.fitShare; assert.ok(f > 0.02 && f < 0.12);
});
