// Run: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../src/core.js');

const sum = (t) => t.onTime + t.late + t.lost + t.unusable + t.dlq;

test('random numbers are repeatable for the same seed', () => {
  const a = W.rng(7), b = W.rng(7);
  for (let i = 0; i < 5; i++) assert.equal(a(), b());
});

test('same options give the same result', () => {
  assert.deepEqual(W.simulate({ seed: 3 }).today, W.simulate({ seed: 3 }).today);
});

test('merchant mix is 18 modal, 14 native, 8 headless', () => {
  const m = W.makeMerchants(42);
  assert.equal(m.length, 40);
  for (const env of W.ENVS) assert.equal(m.filter((x) => x.env === env).length, W.MERCHANT_MIX[env]);
});

test('every subscribed event ends in exactly one outcome (today and contract)', () => {
  for (const opts of [{}, { retries: false }, { dedupe: false }, { failMult: 5 }, { adoption: 0.5 }]) {
    const r = W.simulate(opts);
    for (const k of ['today', 'contract', 'mixed']) assert.equal(sum(r[k]), r[k].subscribed, k + ' ' + JSON.stringify(opts));
  }
});

test('adoption 0 means the mixed world equals today', () => {
  const r = W.simulate({ adoption: 0 });
  assert.deepEqual(r.mixed, r.today);
});

test('adoption 1 means the mixed world equals the contract', () => {
  const r = W.simulate({ adoption: 1 });
  assert.deepEqual(r.mixed, r.contract);
});

test('today, the provider-only COD event never reaches partners on the platform-native setup', () => {
  const r = W.simulate({});
  const cell = r.cells.find((c) => c.partner === 'Route' && c.env === 'native');
  assert.ok(cell.today.lost > 0);
  assert.equal(cell.contract.lost + cell.contract.dlq, 0);
});

test('a partner without a store-platform connector gets nothing from the native setup today', () => {
  const r = W.simulate({});
  const cell = r.cells.find((c) => c.partner === 'Mailo' && c.env === 'native');
  if (!cell) return; // no subscriber in this seed
  assert.equal(cell.today.lost, cell.today.subscribed);
});

test('today, a partner built for one shape cannot use another shape', () => {
  const r = W.simulate({});
  const trailModal = r.cells.find((c) => c.partner === 'Trail' && c.env === 'modal');
  assert.ok(trailModal.today.unusable > 0);
  assert.equal(trailModal.contract.unusable, 0);
});

test('retries recover outage losses: contract with retries has fewer failures than without', () => {
  const on = W.simulate({ retries: true }).contract;
  const off = W.simulate({ retries: false }).contract;
  assert.ok(on.lost + on.dlq < off.lost + off.dlq);
  assert.equal(on.lost, 0, 'with retries nothing is silently lost: it is delivered or parked in the DLQ');
});

test('with stable ids and dedupe, no partner takes the same action twice', () => {
  assert.equal(W.simulate({ dedupe: true, failMult: 5 }).contract.doubleActions, 0);
});

test('without dedupe, retries plus non-idempotent partners cause double actions', () => {
  assert.ok(W.simulate({ dedupe: false, failMult: 3 }).contract.doubleActions > 0);
});

test('worse partner endpoints never improve today\'s delivery', () => {
  const a = W.simulate({ failMult: 1 }).today, b = W.simulate({ failMult: 4 }).today;
  assert.ok(b.lost >= a.lost);
});

test('IST timestamp converts to UTC', () => {
  assert.equal(W.istToUtcIso('18/11/2026 19:45:10'), '2026-11-18T14:15:10Z');
  assert.equal(W.istToUtcIso('01/01/2026 03:00:00'), '2025-12-31T21:30:00Z');
});

test('phone numbers normalise to E.164 or null', () => {
  assert.equal(W.toE164('9876543210'), '+919876543210');
  assert.equal(W.toE164('09876543210'), '+919876543210');
  assert.equal(W.toE164('+91 98765 43210'), '+919876543210');
  assert.equal(W.toE164('919876543210'), '+919876543210');
  assert.equal(W.toE164('12345'), null);
});

const modal = { event: 'abandoned_cart', cart_id: 'c_88231XQ', phone: '9876543210', total: 129900, created_at: '18/11/2026 19:45:10' };
const headless = { type: 'checkout_abandoned', checkoutId: 'chk_88231XQ', customer: { mobile: '+919876543210' }, amount: 1299.0, ts: Date.UTC(2026, 10, 18, 14, 15, 10), utm: { source: 'instagram', medium: 'paid', campaign: 'diwali' } };

test('both legacy shapes normalise to the same amount, phone and time', () => {
  const a = W.normalize(modal, 'modal', 'm_001');
  const b = W.normalize(headless, 'headless', 'm_002');
  assert.equal(a.data.amount_paise, 129900);
  assert.equal(b.data.amount_paise, 129900);
  assert.equal(a.data.customer.phone_e164, b.data.customer.phone_e164);
  assert.equal(a.created_at, b.created_at);
  assert.equal(b.data.attribution.utm_campaign, 'diwali');
});

test('normalised events pass the validator', () => {
  assert.deepEqual(W.validate(W.normalize(modal, 'modal', 'm_001')), []);
  assert.deepEqual(W.validate(W.normalize(headless, 'headless', 'm_002')), []);
});

test('the native setup has no legacy webhook to normalise', () => {
  assert.throws(() => W.normalize(modal, 'native', 'm_003'));
});

test('validator catches rupees sent as a decimal instead of paise', () => {
  const e = W.normalize(modal, 'modal', 'm_001');
  e.data.amount_paise = 1299.0 + 0.5;
  assert.ok(W.validate(e).some((x) => x.path === 'data.amount_paise'));
});

test('validator catches a 10-digit phone without country code', () => {
  const e = W.normalize(modal, 'modal', 'm_001');
  e.data.customer.phone_e164 = '9876543210';
  assert.ok(W.validate(e).some((x) => x.path === 'data.customer.phone_e164'));
});

test('validator catches an IST string timestamp', () => {
  const e = W.normalize(modal, 'modal', 'm_001');
  e.created_at = '18/11/2026 19:45:10';
  assert.ok(W.validate(e).some((x) => x.path === 'created_at'));
});

test('validator requires order_id on order events and payment_method on payments', () => {
  const e = { id: 'evt_abcdefghijkl', type: 'payment.captured', version: '2026-11-01', created_at: '2026-11-18T14:15:10Z', merchant_id: 'm_001', environment: 'headless', data: { amount_paise: 100, currency: 'INR' } };
  const paths = W.validate(e).map((x) => x.path);
  assert.ok(paths.includes('data.order_id'));
  assert.ok(paths.includes('data.payment_method'));
});

test('validator rejects non-objects and unknown types', () => {
  assert.equal(W.validate(null)[0].path, '$');
  assert.equal(W.validate([])[0].path, '$');
  const e = W.normalize(modal, 'modal', 'm_001'); e.type = 'cart.abandoned';
  assert.ok(W.validate(e).some((x) => x.path === 'type'));
});
