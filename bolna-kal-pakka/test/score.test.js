const test = require("node:test"), assert = require("node:assert"), S = require("../src/score.js");
const calls = require("../data/calls.js"), real = require("../data/real.js"), all = calls.concat(real);
test("code parser: none, lists, spaces and junk", () => {
  assert.deepStrictEqual(S.codes("none"), []); assert.deepStrictEqual(S.codes("C1,C4"), ["C1", "C4"]); assert.deepStrictEqual(S.codes(" q4, Q6 "), ["Q4", "Q6"]); assert.deepStrictEqual(S.codes("C9,foo"), []);
});
test("labels use only known codes and outcomes", () => {
  const ok = new Set([...S.CRIT, ...S.QUAL]), outs = new Set(["ptp_confirmed", "no_firm_commitment", "already_paid", "dispute", "wrong_party", "callback", "refused", "hardship"]);
  for (const c of all) { c.fail.forEach((f) => assert.ok(ok.has(f), c.id + " " + f)); if (c.out) assert.ok(outs.has(c.out.outcome), c.id); }
});
test("every confirmed promise has a date and amount; no other outcome does", () => {
  for (const c of calls.filter((x) => x.out)) { const p = c.out.outcome === "ptp_confirmed"; assert.strictEqual(!!c.out.date, p, c.id); assert.strictEqual(!!c.out.amount, p, c.id); }
});
test("transcripts are well formed: only assistant/user lines, starting with the assistant", () => {
  for (const c of all) { const lines = c.t.split("\n").filter((l) => l.trim()); assert.ok(lines[0].startsWith("assistant:"), c.id); lines.forEach((l) => assert.ok(/^(assistant|user):/.test(l), c.id + ": " + l)); }
});
test("ids are unique and test set has both clean and failing calls", () => {
  assert.strictEqual(new Set(all.map((c) => c.id)).size, all.length);
  const t = calls.filter((c) => c.split === "test"); assert.ok(t.filter((c) => !c.fail.length).length >= 8); assert.ok(t.filter((c) => c.fail.length).length >= 8);
});
test("scoring: a perfect run scores 100%, the latest re-run wins", () => {
  const runs = calls.filter((c) => c.split === "test").map((c) => ({ v: "e", id: c.id, crit: c.fail.filter((f) => f[0] === "C").join(",") || "none", qual: c.fail.filter((f) => f[0] === "Q").join(",") || "none", outcome: c.out ? c.out.outcome : "not_collections", date: c.out && c.out.date, amount: c.out && c.out.amount }));
  const s = S.scoreVersion(S.latest([{ v: "e", id: "t01", crit: "C1", qual: "none" }].concat(runs)), calls, "e", ["test"]);
  assert.strictEqual(s.critical.recall, 1); assert.strictEqual(s.critical.precision, 1); assert.strictEqual(s.anyFailure.fp, 0); assert.strictEqual(s.outcomeRight, s.ptp.n); assert.strictEqual(s.dateRight, s.ptpTrue);
});
