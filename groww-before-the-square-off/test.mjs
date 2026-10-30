// node test.mjs — pins the margin maths and the simulation's headline behaviour.
import assert from "node:assert/strict";
import * as E from "./engine.js";
const near = (a, b, tol = 1e-3) => assert.ok(Math.abs(a - b) < tol, `${a} vs ${b}`);

// at max leverage (25% haircut) a 4.8% fall triggers a call, a 20% fall an instant square-off
near(E.dropToCallAtEntry(0.25), 0.0476); near(E.dropToSquareAtEntry(0.25), 0.2);
// health() agrees with the closed form, on both sides of the line
const p = E.openPosition({ qty: 100, price: 1000, haircut: 0.25 });
near(E.health(p, 1000).callPrice, 952.38, 0.01);
assert.equal(E.health(p, 1000).status, "HEALTHY"); assert.equal(E.health(p, 953).status, "THIN"); // at max leverage any fall is below 100%
assert.equal(E.health(p, 952).status, "MARGIN_CALL");
assert.equal(E.health(p, 799).status, "SQUARE_OFF"); assert.equal(E.health(p, 801).status, "MARGIN_CALL");
// a haircut rise alone, with no price move, triggers a call
assert.equal(E.health(p, 1000, 0.35).status, "MARGIN_CALL");
// the suggested fixes actually restore cover to 100%
const h = E.health(p, 940);
const afterCash = { ...p, loan: p.loan - h.addCash };
near(E.health(afterCash, 940).cover, 1, 1e-6);
const s = h.sellQty, afterSell = { ...p, qty: p.qty - s, loan: p.loan - s * 940 };
assert.ok(E.health(afterSell, 940).cover >= 1);
const s1 = s - 1, notEnough = { ...p, qty: p.qty - s1, loan: p.loan - s1 * 940 };
assert.ok(E.health(notEnough, 940).cover < 1, "sellQty is the minimum");
// paying more margin moves the call line further away
assert.ok(E.health(E.openPosition({ qty: 100, price: 1000, haircut: 0.25, marginShare: 0.4 }), 1000).dropToCall > 0.15);
// unpaid interest drags a flat max-leverage position into a call in about four months
assert.equal(E.daysToCallIfFlat(0.25), 122);
const q = E.openPosition({ qty: 100, price: 1000, haircut: 0.25 }); E.accrue(q, 121); assert.notEqual(E.health(q, 1000).status, "MARGIN_CALL");
E.accrue(q, 2); assert.equal(E.health(q, 1000).status, "MARGIN_CALL");
// simulation: deterministic, leverage dominates, wider alert line warns more often but alerts more
const a = E.simulate({ alertAt: 0.02 }), b = E.simulate({ alertAt: 0.03 });
assert.deepEqual(E.simulate({ alertAt: 0.02 }).calls, a.calls);
assert.ok(a.lev.max.calls / a.lev.max.n > 5 * (a.lev.lower.calls / a.lev.lower.n));
assert.ok(b.lead > a.lead && b.alertsPer100PerWeek > a.alertsPer100PerWeek);
console.log("ok – 17 margin and simulation checks passed");
