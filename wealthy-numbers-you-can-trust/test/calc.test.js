const test = require("node:test"), assert = require("node:assert"), C = require("../src/calc.js");
const near = (a, b, tol = 1e-4) => assert.ok(Math.abs(a - b) < tol, a + " vs " + b);
test("XIRR: 1,000 in, 1,100 out a year later is 10%", () => { near(C.xirr([{ date: "2025-01-01", amount: -1000 }, { date: "2026-01-01", amount: 1100 }]), 0.10); });
test("XIRR matches Excel on an irregular series", () => {
  // Excel XIRR({-10000,2750,4250,3250,2750},{2008-01-01,2008-03-01,2008-10-30,2009-02-15,2009-04-01}) = 37.34%
  near(C.xirr([{ date: "2008-01-01", amount: -10000 }, { date: "2008-03-01", amount: 2750 }, { date: "2008-10-30", amount: 4250 }, { date: "2009-02-15", amount: 3250 }, { date: "2009-04-01", amount: 2750 }]), 0.373363, 1e-4);
});
test("XIRR returns null without both inflows and outflows", () => { assert.strictEqual(C.xirr([{ date: "2025-01-01", amount: -1000 }]), null); });
test("annualising a short gain explodes: 5% in 2 months is ~34% XIRR", () => { const r = C.xirr([{ date: "2026-09-01", amount: -100000 }, { date: "2026-11-01", amount: 105000 }]); assert.ok(r > 0.3 && r < 0.4); });
test("FIFO sells the oldest units first", () => {
  const { realised, lots } = C.fifo([{ date: "2024-01-01", type: "buy", units: 10, nav: 100 }, { date: "2025-01-01", type: "buy", units: 10, nav: 120 }, { date: "2026-06-01", type: "sell", units: 15, nav: 150 }]);
  assert.strictEqual(realised.length, 2); assert.strictEqual(realised[0].units, 10); assert.strictEqual(realised[1].units, 5); near(lots[0].units, 5);
});
test("equity held 12 months or less is short term; more is long term", () => {
  assert.strictEqual(C.classify({ buyDate: "2025-09-01", sellDate: "2026-08-31", buyNav: 10, sellNav: 12, units: 1 }, "equity").bucket, "equityST");
  assert.strictEqual(C.classify({ buyDate: "2025-06-01", sellDate: "2026-08-31", buyNav: 10, sellNav: 12, units: 1 }, "equity").bucket, "equityLT");
});
test("grandfathering: cost is the higher of actual cost and the lower of 31-Jan-2018 value and sale value", () => {
  const c = C.classify({ buyDate: "2016-05-01", sellDate: "2026-06-01", buyNav: 20, sellNav: 60, units: 100 }, "equity", 35); near(c.gain, 100 * (60 - 35));
  const d = C.classify({ buyDate: "2016-05-01", sellDate: "2026-06-01", buyNav: 20, sellNav: 30, units: 100 }, "equity", 35); near(d.gain, 100 * (30 - 30)); // sale below FMV: cost capped at sale
});
test("debt fund bought on or after 1 April 2023 is taxed at slab whatever the holding period", () => {
  assert.strictEqual(C.classify({ buyDate: "2023-05-01", sellDate: "2026-06-01", buyNav: 10, sellNav: 12, units: 1 }, "debt").bucket, "slab");
  assert.strictEqual(C.classify({ buyDate: "2022-05-01", sellDate: "2026-06-01", buyNav: 10, sellNav: 12, units: 1 }, "debt").bucket, "debtLT");
});
test("exemption room: Rs 1.25 lakh minus realised LTCG, capped by what can be booked", () => {
  const e = C.exemptionRoom(40000, 200000); near(e.unused, 85000); near(e.harvestable, 85000); near(e.futureTaxAvoided, 85000 * 0.125);
  near(C.exemptionRoom(200000, 50000).unused, 0);
});
test("ELSS units under 3 years old cannot be booked for the exemption", () => {
  const txs = [{ date: "2024-06-01", type: "buy", units: 100, nav: 10 }];
  assert.ok(C.unrealisedEquityLT(txs, 15, "2026-11-01", null) > 0);
  assert.strictEqual(C.unrealisedEquityLT(txs, 15, "2026-11-01", null, 1095), 0);
});
test("Rs 1.8 lakh of equity LTCG costs Rs 6,875 (worked example in public guides)", () => {
  const R = require("../src/report.js"); assert.strictEqual(Math.round(R.equityTax({ equityLT: 180000, equityST: 0 })), 6875);
});
