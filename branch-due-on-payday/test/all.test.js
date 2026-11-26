const test = require("node:test"); const assert = require("node:assert");
const D = require("../src/dates.js"); const S = require("../src/simulate.js");

test("last working day skips weekends", () => {
  assert.strictEqual(D.iso(D.lastWorkingDay(2027, 1)), "2027-02-26"); // 28 Feb 2027 is a Sunday
});
test("salary dated on a weekend arrives the working day before", () => {
  const xs = D.inflowsBetween({ type: "monthly", day: 1 }, D.d0(2027, 3, 25), D.d0(2027, 4, 5)); // 1 May 2027 = Saturday
  assert.strictEqual(D.iso(xs[0]), "2027-04-30");
});
test("aligned due date is the day after an inflow and inside the window", () => {
  D.schedule(D.d0(2026, 10, 26), { type: "monthly", day: "last" }, 3, { window: 15 }).forEach((r) => {
    assert.ok(r.aligned); assert.ok(Math.abs(r.shiftDays) <= 15);
    assert.strictEqual(D.diff(new Date(r.inflow), new Date(r.due)), 1);
  });
});
test("irregular income falls back to the standard date", () => {
  D.schedule(D.d0(2026, 10, 26), { type: "irregular" }, 3).forEach((r) => { assert.ok(!r.aligned); assert.strictEqual(r.shiftDays, 0); });
});
test("instalments are never closer than 15 days apart", () => {
  for (const day of [1, 7, 15, "last"]) {
    const s = D.schedule(D.d0(2026, 10, 3), { type: "monthly", day }, 3, { window: 15 });
    for (let i = 1; i < s.length; i++) assert.ok(D.diff(new Date(s[i - 1].due), new Date(s[i].due)) >= 15, String(day));
  }
});
test("interest is charged per day held, so shifting the date stays fair", () => {
  assert.strictEqual(D.interest(20000, 0.03, 30), 600); assert.strictEqual(D.interest(20000, 0.03, 34), 680);
});
test("simulation is reproducible for a seed", () => {
  assert.deepStrictEqual(S.run({ seed: 3, borrowers: 3000 }).split, S.run({ seed: 3, borrowers: 3000 }).split);
});
test("aligning the due date raises first-payment on-time rate in every seed", () => {
  S.seeds(8, { borrowers: 6000 }).forEach((r) => assert.ok(r.aligned.all.firstOnTime > r.fixed.all.firstOnTime + 0.08));
});
test("collection contacts fall at each step", () => {
  const r = S.run({ borrowers: 15000 });
  assert.ok(r.aligned.all.contacts < r.fixed.all.contacts); assert.ok(r.autopay.all.contacts < r.aligned.all.contacts); assert.ok(r.split.all.contacts < r.autopay.all.contacts);
});
test("the full package cuts 30+ days past due; the split option does the most", () => {
  S.seeds(8, { borrowers: 6000 }).forEach((r) => { assert.ok(r.split.all.dpd30 < r.autopay.all.dpd30); assert.ok(r.autopay.all.dpd30 < r.fixed.all.dpd30); });
});
test("trap: with thin cash buffers, moving the date alone does not cut 30+", () => {
  const r = S.run({ borrowers: 15000, bufferMeanDays: 3 });
  assert.ok(r.aligned.all.dpd30 >= r.fixed.all.dpd30);
});
test("timing fixes do not touch write-offs from borrowers who would never pay", () => {
  const r = S.run({ borrowers: 15000 }); assert.ok(Math.abs(r.split.all.writeOff - r.fixed.all.writeOff) < 0.004);
});
test("irregular earners get no alignment benefit on first payment", () => {
  const r = S.run({ borrowers: 15000 }); assert.ok(Math.abs(r.aligned.irregular.firstOnTime - r.fixed.irregular.firstOnTime) < 0.01);
});
test("sample size matches the textbook two-proportion formula", () => {
  assert.strictEqual(S.sampleSize(0.5, 0.6), 388);
});
test("result holds across a range of payment-when-short assumptions", () => {
  for (const v of [0.4, 0.7]) { const r = S.run({ borrowers: 8000, payIfShort: v }); assert.ok(r.split.all.dpd30 < r.fixed.all.dpd30 && r.aligned.all.firstOnTime > r.fixed.all.firstOnTime); }
});
test("every assumption has a numeric default", () => {
  for (const [k, v] of Object.entries(S.ASSUME)) if (typeof v !== "object") assert.ok(typeof v === "number", k);
});
