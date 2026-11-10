'use strict';
// Run: node --test test/
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/engine');

const DAY = 1440, H = 60;
const cfg = E.DEFAULT_CONFIG;

// helper: a payer with 30 days of ordinary history (merchant spend + two known contacts)
function seasoned() {
  const st = E.createState(0);
  for (let d = 0; d < 30; d++) {
    E.observe(st, { t: d * DAY + 10 * H, dir: 'out', amt: 300, cp: 'm' + d, cpType: 'merchant' });
    if (d % 5 === 0) E.observe(st, { t: d * DAY + 12 * H, dir: 'out', amt: 1000, cp: 'mom', cpType: 'individual' });
    if (d % 7 === 0) E.observe(st, { t: d * DAY + 13 * H, dir: 'in', amt: 800, cp: 'mom', cpType: 'individual' });
    if (d % 6 === 0) E.observe(st, { t: d * DAY + 14 * H, dir: 'in', amt: 500, cp: 'friend', cpType: 'individual' });
  }
  return st;
}
const out = (t, amt, cp, extra = {}) => Object.assign({ t, dir: 'out', amt, cp, cpType: 'individual', fanIn: 0, flagged: false }, extra);
const inc = (t, amt, cp) => ({ t, dir: 'in', amt, cp, cpType: 'individual', fanIn: 0, flagged: false });
const T0 = 31 * DAY;

test('merchants and SEBI @valid IDs are never scored', () => {
  const st = seasoned();
  assert.equal(E.scorePayment(st, out(T0, 90000, 'brk@valid', { cpType: 'valid' })).score, 0);
  assert.equal(E.scorePayment(st, out(T0, 90000, 'shop', { cpType: 'merchant' })).score, 0);
});

test('no friction under Rs 500, unless the ID is on a fraud list', () => {
  const st = seasoned();
  assert.equal(E.scorePayment(st, out(T0, 499, 'tea', { fanIn: 40 })).tier, 0);
  assert.equal(E.scorePayment(st, out(T0, 499, 'tea', { flagged: true })).score, cfg.weights.listed);
});

test('a known two-way contact is not scored, even for a large amount', () => {
  const st = seasoned();
  const r = E.scorePayment(st, out(T0, 80000, 'mom'));
  assert.equal(r.score, 0);
  assert.equal(r.newish, false);
});

test('a flagged ID adds list points even for a known contact; useLists=false removes them', () => {
  const st = seasoned();
  assert.equal(E.scorePayment(st, out(T0, 2000, 'friend', { flagged: true })).score, 3);
  const noLists = Object.assign({}, cfg, { useLists: false });
  assert.equal(E.scorePayment(st, out(T0, 2000, 'friend', { flagged: true }), noLists).score, 0);
});

test('task scam: bait credit, then rising payments to rotating strangers: question by payment 2, full warning by 3, hold by 5', () => {
  const st = seasoned();
  let t = T0;
  E.observe(st, inc(t, 300, 'bait1')); t += 3 * H;
  const amts = [1500, 3500, 9000, 24000, 60000];
  const tiers = [];
  amts.forEach((a, i) => {
    const e = out(t, a, 'mule' + i, { fanIn: 3 });
    const r = E.scorePayment(st, e);
    tiers.push(r.tier);
    E.observe(st, e);
    t += 4 * H;
  });
  assert.ok(tiers[1] >= 1, 'second payment should get the purpose question, got ' + tiers.join(','));
  assert.ok(tiers[2] >= 2, 'third payment should be a full warning, got ' + tiers.join(','));
  assert.equal(Math.max(...tiers), 3, 'should reach a hold, got ' + tiers.join(','));
  assert.ok(tiers.every((x, i) => i === 0 || x >= tiers[i - 1]), 'risk should not fall as the scam deepens');
});

test('bait needs the payment to be 1.5x the credit, and a credit above Rs 5,000 is never bait', () => {
  const st = seasoned();
  E.observe(st, inc(T0, 1000, 'stranger'));
  const small = E.scorePayment(st, out(T0 + H, 1200, 'other'));
  assert.ok(!small.signals.some(s => s.id === 'bait'));
  const big = E.scorePayment(st, out(T0 + H, 1600, 'other'));
  assert.ok(big.signals.some(s => s.id === 'bait'));
  const st2 = seasoned();
  E.observe(st2, inc(T0, 6000, 'client'));
  assert.ok(!E.scorePayment(st2, out(T0 + H, 20000, 'other')).signals.some(s => s.id === 'bait'));
});

test('bait points are cut to a quarter for people paid by many strangers (shops, freelancers)', () => {
  const st = seasoned();
  for (let i = 0; i < 10; i++) E.observe(st, inc(T0 + i, 200, 'cust' + i));
  const r = E.scorePayment(st, out(T0 + H, 2000, 'supplier'));
  const b = r.signals.find(s => s.id === 'bait');
  assert.ok(b);
  assert.equal(b.pts, cfg.weights.bait * cfg.busyDamp);
});

test('escalation only counts across different people, not a token then the balance to the same landlord', () => {
  const st = seasoned();
  E.observe(st, out(T0, 5000, 'landlord'));
  const r = E.scorePayment(st, out(T0 + DAY, 60000, 'landlord'));
  assert.ok(!r.signals.some(s => s.id === 'esc'));
  const st2 = seasoned();
  E.observe(st2, out(T0, 5000, 'personA'));
  const r2 = E.scorePayment(st2, out(T0 + DAY, 60000, 'personB'));
  assert.ok(r2.signals.some(s => s.id === 'esc'));
});

test('velocity ignores tiny new payees like an auto driver or tea stall', () => {
  const st = seasoned();
  for (let i = 0; i < 6; i++) E.observe(st, out(T0 + i * H, 80, 'auto' + i));
  const r = E.scorePayment(st, out(T0 + 7 * H, 2000, 'seller'));
  assert.ok(!r.signals.some(s => s.id === 'vel'));
});

test('a single first payment to a new person never goes past the purpose question on its own', () => {
  const st = seasoned();
  const r = E.scorePayment(st, out(T0, 45000, 'olxSeller', { fanIn: 1 }));
  assert.ok(r.tier <= 1, 'got tier ' + r.tier + ' score ' + r.score);
});

test('decide: purpose question once per payee; full warning has a 72h cooldown unless risk rises by 1+', () => {
  const st = E.createState(0);
  assert.equal(E.decide(st, { t: 0, cp: 'a' }, 3.5, 1), 1);
  assert.equal(E.decide(st, { t: 10, cp: 'a' }, 3.5, 1), 0);
  assert.equal(E.decide(st, { t: 20, cp: 'b' }, 5.0, 2), 2);
  assert.equal(E.decide(st, { t: 30, cp: 'c' }, 5.5, 2), 1, 'within 72h and score up only 0.5');
  assert.equal(E.decide(st, { t: 40, cp: 'd' }, 6.1, 2), 2, 'score up by 1.1');
  assert.equal(E.decide(st, { t: 50 + 72 * H, cp: 'e' }, 4.7, 2), 2, 'cooldown over');
});

test('decide: at most one hold per 24h', () => {
  const st = E.createState(0);
  assert.equal(E.decide(st, { t: 0, cp: 'a' }, 7, 3), 3);
  assert.equal(E.decide(st, { t: 60, cp: 'b' }, 9, 3), 2);
  assert.equal(E.decide(st, { t: 25 * H, cp: 'c' }, 11, 3), 3);
});

test('state keeps only 30 days of rolling history', () => {
  const st = E.createState(0);
  E.observe(st, out(0, 2000, 'old'));
  E.observe(st, out(31 * DAY, 2000, 'new'));
  assert.equal(st.newIndOut.length, 1);
  assert.equal(st.newIndOut[0].cp, 'new');
  assert.ok(st.seen.has('old'), 'relationship memory is kept');
});

test('usual-month baseline has a floor of Rs 5,000 and scales short histories', () => {
  const st = E.createState(0);
  assert.equal(E.baselineMonthly(st, 0), 5000);
  E.observe(st, { t: 0, dir: 'out', amt: 7000, cp: 'm', cpType: 'merchant' });
  assert.equal(E.baselineMonthly(st, 7 * DAY), 30000);
});

test('every signal shown to the user has a plain-language label', () => {
  const st = seasoned();
  E.observe(st, inc(T0, 300, 'b'));
  E.observe(st, out(T0 + H, 2000, 'x1'));
  E.observe(st, out(T0 + 2 * H, 4000, 'x2'));
  const r = E.scorePayment(st, out(T0 + 3 * H, 25000, 'x3', { fanIn: 20, flagged: true }));
  for (const s of r.signals) assert.ok(typeof s.label === 'string' && s.label.length > 5 && !/undefined/.test(s.label), s.id);
  assert.equal(r.tier, 3);
});
