const test = require("node:test"), assert = require("node:assert"), C = require("../src/calc.js"), R = require("../src/report.js");
const book = (holdings, extra) => ({ TODAY: "2026-11-01", navs: { A: { kind: "equity", nav: { "2018-02-01": 10, "2026-11-01": 20 } }, B: { kind: "equity", nav: { "2018-02-01": 10, "2026-11-01": 12 } } }, ...extra });
test("family XIRR pools cash flows; averaging member XIRRs gives a different number", () => {
  const b = book(), fam = { members: [
    { name: "Self", holdings: [{ id: "a", fund: "A", kind: "equity", txs: [{ date: "2020-11-01", type: "buy", units: 1000, nav: 10, amount: 10000 }] }] },
    { name: "Spouse", holdings: [{ id: "b", fund: "B", kind: "equity", txs: [{ date: "2025-11-01", type: "buy", units: 50000, nav: 10, amount: 500000 }] }] }] };
  const f = R.family(b, fam), pooled = C.xirr([{ date: "2020-11-01", amount: -10000 }, { date: "2025-11-01", amount: -500000 }, { date: "2026-11-01", amount: 20000 + 600000 }]);
  assert.ok(Math.abs(f.truthX - pooled) < 1e-6); assert.ok(f.err.familyAvg > 0.01);
});
test("under a year, the client sees absolute return, not an annualised XIRR", () => {
  const b = book(), fam = { members: [{ name: "Self", holdings: [{ id: "b", fund: "B", kind: "equity", txs: [{ date: "2026-07-01", type: "buy", units: 1000, nav: 10, amount: 10000 }] }] }] };
  const f = R.family(b, fam), row = f.rows[0]; assert.strictEqual(row.truth.ret.kind, "Absolute"); assert.ok(Math.abs(row.truth.ret.v - 0.2) < 1e-9); assert.ok(row.sc.ret.v > 0.6); assert.ok(f.err.annualised);
});
test("a switch is not new money; the shortcut double counts it when the pair is unlinked", () => {
  const b = book(), fam = { members: [{ name: "Self", holdings: [
    { id: "a", fund: "A", kind: "equity", txs: [{ date: "2022-01-01", type: "buy", units: 1000, nav: 10, amount: 10000 }, { date: "2025-01-01", type: "sell", units: 1000, nav: 15, amount: 15000, switchOut: true }] },
    { id: "b", fund: "B", kind: "equity", linkLost: true, txs: [{ date: "2025-01-01", type: "buy", units: 1500, nav: 10, amount: 15000, switchIn: true }] }] }] };
  const f = R.family(b, fam); assert.strictEqual(f.moneyIn, 10000); assert.strictEqual(f.scMoneyIn, 25000); assert.ok(f.err.switchDouble > 1);
  const direct = C.xirr([{ date: "2022-01-01", amount: -10000 }, { date: "2026-11-01", amount: 18000 }]); assert.ok(Math.abs(f.truthX - direct) < 1e-6);
});
test("a holding bought elsewhere is held back by the guarded report, not shown as 0%", () => {
  const b = book(), fam = { members: [{ name: "Self", holdings: [{ id: "a", fund: "A", kind: "equity", external: true, txs: [{ date: "2021-01-01", type: "buy", units: 1000, nav: 10, amount: 10000 }] }] }] };
  const f = R.family(b, fam), r = f.rows[0]; assert.strictEqual(r.sc.ret.v, 0); assert.strictEqual(r.gd.ret, null); assert.ok(r.gd.flag); assert.ok(f.err.externalZero);
});
test("SIP sold this year: the shortcut calls recent units long-term and understates tax", () => {
  const txs = []; for (let m = 1; m <= 12; m++) txs.push({ date: `2025-${String(m).padStart(2, "0")}-01`, type: "buy", units: 1000, nav: 100, amount: 100000 });
  txs.push({ date: "2026-10-01", type: "sell", units: 12000, nav: 130, amount: 1560000 });
  const truth = C.realisedInFY(txs, "equity", null), sc = R.shortcutGains({ kind: "equity", txs });
  assert.ok(truth.equityST > 0); assert.strictEqual(sc.equityST, 0); assert.ok(R.equityTax(truth) > R.equityTax(sc));
});
test("the simulation is deterministic for a seed", () => { const a = R.run({ families: 60, seed: 3 }), b = R.run({ families: 60, seed: 3 }); assert.strictEqual(a.anyErr, b.anyErr); assert.strictEqual(a.avoidedTotal, b.avoidedTotal); });
