const assert = require('assert');
const M = require('../model.js');
const D = () => M.clone(M.DEFAULTS);
let passed = 0;
function t(name, fn) { fn(); passed++; console.log('ok', passed, '-', name); }
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, a + ' vs ' + b);

t('calling no one is worth exactly zero', () => close(M.evaluate(D(), [false, false, false]).value, 0));
t('low-risk band loses money at defaults (hand check: -3.076 per order)', () => close(M.perOrder(D(), D().bands[0]).value, -3.076));
t('medium-risk band hand check: +17.8925 per order', () => close(M.perOrder(D(), D().bands[1]).value, 17.8925));
t('high-risk band hand check: +56.7075 per order', () => close(M.perOrder(D(), D().bands[2]).value, 56.7075));
t('"call only where it pays" is never worse than calling everyone', () => {
  const ps = M.policies(D()); const v = k => ps.find(x => x.key === k).result.value;
  assert.ok(v('pays') >= v('all') && v('pays') >= v('none'));
});
t('the pays policy skips the low band at defaults', () => assert.deepStrictEqual(M.policies(D()).find(x => x.key === 'pays').policy, [false, true, true]));
t('more genuine cancellations always lower the value of a call', () => {
  const p = D(); const a = M.perOrder(p, p.bands[1]).value; p.bands[1].genuineCancel = 0.05;
  assert.ok(M.perOrder(p, p.bands[1]).value < a);
});
t('if nobody answers, a call only costs money', () => {
  const p = D(); p.connect = 0; close(M.perOrder(p, p.bands[2]).value, -p.attempts * p.costPerAttempt);
});
t('break-even risk sits between the low and medium band at defaults', () => {
  const r = M.breakEvenRisk(D(), D().bands[1]); assert.ok(r > 0.08 && r < 0.28, String(r));
});
t('value is zero exactly at the break-even risk', () => {
  const p = D(), b = p.bands[1]; close(M.valueAtRisk(p, b, M.breakEvenRisk(p, b)), 0, 1e-9);
});
t('a pricier call raises the break-even risk', () => {
  const p = D(), b = p.bands[1]; const r1 = M.breakEvenRisk(p, b); p.costPerAttempt = 15;
  assert.ok(M.breakEvenRisk(p, b) > r1);
});
t('calls never increase RTOs', () => {
  const r = M.evaluate(D(), [true, true, true]); assert.ok(r.rtoAfter <= r.rtoBase);
});
t('band shares add up to 100 orders', () => close(M.evaluate(D(), [true, true, true]).bands.reduce((s, b) => s + b.orders, 0), 100));
t('confirmation rate stays high even where the call loses money', () => {
  const p = D(); assert.ok(M.confirmationRate(p, p.bands[0]) > 0.95 && M.perOrder(p, p.bands[0]).value < 0);
});
t('sample size matches the textbook value for 28% vs 19% (~359 per arm)', () => {
  const n = M.sampleSize(0.28, 0.19); assert.ok(n > 340 && n < 380, String(n));
});
t('no difference needs infinite sample', () => assert.strictEqual(M.sampleSize(0.2, 0.2), Infinity));
console.log(passed + ' tests passed');
