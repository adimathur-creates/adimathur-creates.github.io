/*
 * Webhook Contract Check - core logic (shared by the page and the Node tests).
 * Everything here runs on FICTIONAL merchants, partners and events.
 * Built with Claude by Aditya Mathur.
 */
(function (root) {
  'use strict';

  // ---------- deterministic random numbers ----------
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash01(str) { // stable 0..1 from a string
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) / 4294967296;
  }

  // ---------- the fictional world ----------
  const ENVS = ['modal', 'native', 'headless'];
  const ENV_LABEL = {
    modal: 'One-click modal checkout',
    native: 'Blocks inside the store platform\'s own checkout',
    headless: 'Custom storefront calling checkout APIs'
  };
  const EVENTS = ['checkout.abandoned', 'order.placed', 'payment.captured', 'order.cod_confirmed', 'order.cancelled'];
  // events that only the checkout provider knows about (the store platform never sees them)
  const PROVIDER_ONLY = ['order.cod_confirmed'];

  // Five fictional partner apps. Rates are assumptions, not measurements.
  const PARTNERS = [
    { id: 'ping',  name: 'Ping',  kind: 'WhatsApp cart recovery', events: ['checkout.abandoned', 'order.placed'], handles: ['modal'], platformConnector: true, idempotent: false, baseFail: 0.02, share: 0.70, outage: { day: 12, from: 18, to: 21 }, sideEffect: 'customer gets two recovery messages' },
    { id: 'stamp', name: 'Stamp', kind: 'Loyalty points', events: ['order.placed', 'order.cancelled'], handles: ['modal', 'headless'], platformConnector: true, idempotent: true, baseFail: 0.01, share: 0.40, outage: null, sideEffect: 'points credited twice' },
    { id: 'trail', name: 'Trail', kind: 'Attribution analytics', events: ['checkout.abandoned', 'order.placed', 'payment.captured'], handles: ['headless'], platformConnector: true, idempotent: true, baseFail: 0.03, share: 0.50, outage: { day: 20, from: 2, to: 4 }, sideEffect: 'order counted twice' },
    { id: 'route', name: 'Route', kind: 'Shipping and RTO', events: ['order.placed', 'order.cod_confirmed', 'order.cancelled'], handles: ['modal'], platformConnector: true, idempotent: false, baseFail: 0.015, share: 0.60, outage: { day: 27, from: 11, to: 15 }, sideEffect: 'two shipments booked' },
    { id: 'mailo', name: 'Mailo', kind: 'Email CRM', events: ['checkout.abandoned'], handles: ['modal'], platformConnector: false, idempotent: true, baseFail: 0.05, share: 0.25, outage: null, sideEffect: 'two emails sent' }
  ];

  const MERCHANT_MIX = { modal: 18, native: 14, headless: 8 };
  const CONTACT_CAPTURE = { modal: 0.9, native: 0.6, headless: 0.8 }; // share of abandoned checkouts with a phone
  const SOURCE_REFIRE = { modal: 0.06, native: 0.01, headless: 0.01 }; // abandoned event re-sent with a new id
  const RETRY_SCHEDULE_MIN = [0, 1, 5, 30, 120, 360, 720, 1440]; // minutes after the event
  const TIMEOUT_PROCESSED = 0.4; // share of failed attempts that were timeouts the partner actually processed
  const ON_TIME_MIN = 5;

  function makeMerchants(seed) {
    const r = rng(seed);
    const list = [];
    let n = 1;
    ENVS.forEach(function (env) {
      for (let i = 0; i < MERCHANT_MIX[env]; i++) {
        const id = 'm_' + String(n).padStart(3, '0');
        const subs = PARTNERS.filter(function (p) { return r() < p.share; }).map(function (p) { return p.id; });
        list.push({ id: id, env: env, dailyCheckouts: 10 + Math.floor(r() * 70), partners: subs });
        n++;
      }
    });
    return list;
  }

  // Generate 30 days of events for one merchant.
  function makeEvents(m, r, days) {
    const out = [];
    for (let d = 1; d <= days; d++) {
      for (let c = 0; c < m.dailyCheckouts; c++) {
        const minute = (d - 1) * 1440 + Math.floor(r() * 1440);
        if (r() < 0.7) {
          if (r() < CONTACT_CAPTURE[m.env]) {
            out.push({ type: 'checkout.abandoned', t: minute });
            if (r() < SOURCE_REFIRE[m.env]) out.push({ type: 'checkout.abandoned', t: minute + 20, refire: true });
          }
        } else {
          out.push({ type: 'order.placed', t: minute });
          if (r() < 0.55) out.push({ type: 'payment.captured', t: minute });
          else if (r() < 0.8) out.push({ type: 'order.cod_confirmed', t: minute + 30 });
          if (r() < 0.08) out.push({ type: 'order.cancelled', t: minute + 600 });
        }
      }
    }
    return out;
  }

  function inOutage(p, minute) {
    if (!p.outage) return false;
    const start = (p.outage.day - 1) * 1440 + p.outage.from * 60;
    const end = (p.outage.day - 1) * 1440 + p.outage.to * 60;
    return minute >= start && minute < end;
  }

  function emptyTally() {
    return { subscribed: 0, onTime: 0, late: 0, viaPlatform: 0, lost: 0, unusable: 0, dlq: 0, doubleActions: 0, attempts: 0 };
  }

  // Current way: no retries, shapes differ by checkout setup, the platform-native setup only reaches
  // partners through the store platform (a second integration), provider-only events never arrive there.
  // A re-fired duplicate (ev.refire) never changes the outcome counts; it can only cause a double action.
  function deliverToday(ev, env, p, r, tally) {
    if (env === 'native') {
      if (ev.refire) return 'dup_ignored';
      if (PROVIDER_ONLY.indexOf(ev.type) >= 0 || !p.platformConnector) { tally.lost++; return 'not_available'; }
      tally.viaPlatform++; tally.onTime++;
      return 'via_platform';
    }
    tally.attempts++;
    const failed = inOutage(p, ev.t) || r() < p.baseFail;
    if (ev.refire) {
      if (!failed && p.handles.indexOf(env) >= 0 && !p.idempotent) tally.doubleActions++;
      return 'dup';
    }
    if (failed) { tally.lost++; return 'lost'; }
    if (p.handles.indexOf(env) < 0) { tally.unusable++; return 'unusable'; }
    tally.onTime++;
    return 'ok';
  }

  // Contract way: one shape, every setup publishes every event, retries with backoff, stable ids.
  function deliverContract(ev, env, p, r, tally, opts) {
    if (ev.refire && opts.dedupe) return 'suppressed'; // source dedupe: same checkout + state = same event id
    const schedule = opts.retries ? RETRY_SCHEDULE_MIN : [0];
    let processedCount = 0;
    let firstProcessedAt = null;
    let acked = false;
    for (let i = 0; i < schedule.length; i++) {
      const t = ev.t + schedule[i];
      tally.attempts++;
      const down = inOutage(p, t);
      const failed = down || r() < p.baseFail;
      if (!failed) { processedCount++; acked = true; if (firstProcessedAt === null) firstProcessedAt = schedule[i]; break; }
      if (!down && r() < TIMEOUT_PROCESSED) { processedCount++; if (firstProcessedAt === null) firstProcessedAt = schedule[i]; }
    }
    if (ev.refire) { // dedupe is off here: a second event with a new id reaches the partner
      if (processedCount > 0 && !p.idempotent) tally.doubleActions++;
      return 'dup';
    }
    if (processedCount === 0) {
      if (opts.retries) { tally.dlq++; return 'dlq'; }
      tally.lost++; return 'lost';
    }
    if (firstProcessedAt <= ON_TIME_MIN) tally.onTime++; else tally.late++;
    // retries after a lost ack hand the partner the same event id again
    if (processedCount > 1 && !(opts.dedupe || p.idempotent)) tally.doubleActions++;
    return acked ? 'ok' : 'ok_ack_lost';
  }

  /**
   * Run the 30-day simulation.
   * opts: { seed, days, adoption (0..1 share of subscriptions moved to the contract), retries, dedupe, failMult }
   */
  function simulate(opts) {
    const o = Object.assign({ seed: 42, days: 30, adoption: 1, retries: true, dedupe: true, failMult: 1 }, opts || {});
    const merchants = makeMerchants(o.seed);
    const r = rng(o.seed * 7 + 1);
    const total = { today: emptyTally(), contract: emptyTally(), mixed: emptyTally() };
    const cells = {}; // partner|env -> tallies for the "where events die" table
    let events = 0;
    merchants.forEach(function (m) {
      const evs = makeEvents(m, r, o.days);
      events += evs.length;
      m.partners.forEach(function (pid) {
        const base = PARTNERS.filter(function (p) { return p.id === pid; })[0];
        const p = Object.assign({}, base, { baseFail: Math.min(0.95, base.baseFail * o.failMult) });
        const onContract = hash01(m.id + '|' + pid + '|' + o.seed) < o.adoption;
        const key = pid + '|' + m.env;
        if (!cells[key]) cells[key] = { partner: base.name, env: m.env, today: emptyTally(), contract: emptyTally() };
        evs.forEach(function (ev) {
          if (p.events.indexOf(ev.type) < 0) return;
          // each delivery path gets its own random stream so paths are comparable but independent
          const seedBase = Math.floor(hash01(m.id + pid + ev.t + ev.type + (ev.refire ? 'r' : '')) * 1e9);
          if (!ev.refire) { total.today.subscribed++; total.contract.subscribed++; total.mixed.subscribed++; cells[key].today.subscribed++; cells[key].contract.subscribed++; }
          deliverToday(ev, m.env, p, rng(seedBase), total.today);
          deliverToday(ev, m.env, p, rng(seedBase), cells[key].today);
          deliverContract(ev, m.env, p, rng(seedBase + 1), total.contract, o);
          deliverContract(ev, m.env, p, rng(seedBase + 1), cells[key].contract, o);
          if (onContract) deliverContract(ev, m.env, p, rng(seedBase + 1), total.mixed, o);
          else deliverToday(ev, m.env, p, rng(seedBase), total.mixed);
        });
      });
    });
    const rows = Object.keys(cells).map(function (k) { return cells[k]; });
    return { events: events, merchants: merchants.length, today: total.today, contract: total.contract, mixed: total.mixed, cells: rows, opts: o };
  }

  function pct(n, d) { return d ? (100 * n) / d : 0; }

  // ---------- legacy shapes and the normaliser ----------
  // Illustrative legacy shapes for a fictional provider (not any real company's payloads).
  function istToUtcIso(s) { // "18/11/2026 19:45:10" in IST -> ISO UTC
    const m = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(s || '');
    if (!m) throw new Error('bad IST timestamp: ' + s);
    const ms = Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +m[6]) - 330 * 60000;
    return new Date(ms).toISOString().replace('.000Z', 'Z');
  }
  function toE164(phone) {
    const digits = String(phone || '').replace(/[^\d+]/g, '');
    if (/^\+[1-9]\d{7,14}$/.test(digits)) return digits;
    const bare = digits.replace(/^\+/, '').replace(/^0/, '');
    if (/^[6-9]\d{9}$/.test(bare)) return '+91' + bare;
    if (/^91[6-9]\d{9}$/.test(bare)) return '+' + bare;
    return null;
  }
  const LEGACY_TYPE = { abandoned_cart: 'checkout.abandoned', checkout_abandoned: 'checkout.abandoned', order_created: 'order.placed', order_placed: 'order.placed' };

  function normalize(legacy, env, merchantId) {
    if (env === 'modal') {
      return {
        id: 'evt_' + legacy.cart_id.replace(/[^A-Za-z0-9]/g, '') + 'ab00',
        type: LEGACY_TYPE[legacy.event],
        version: '2026-11-01',
        created_at: istToUtcIso(legacy.created_at),
        merchant_id: merchantId,
        environment: 'modal',
        data: { checkout_id: legacy.cart_id, amount_paise: Math.round(legacy.total), currency: 'INR', customer: { phone_e164: toE164(legacy.phone) }, attribution: {} }
      };
    }
    if (env === 'headless') {
      const u = legacy.utm || {};
      return {
        id: 'evt_' + legacy.checkoutId.replace(/[^A-Za-z0-9]/g, '') + 'ab00',
        type: LEGACY_TYPE[legacy.type],
        version: '2026-11-01',
        created_at: new Date(legacy.ts).toISOString().replace('.000Z', 'Z'),
        merchant_id: merchantId,
        environment: 'headless',
        data: { checkout_id: legacy.checkoutId, amount_paise: Math.round(Number(legacy.amount) * 100), currency: 'INR', customer: { phone_e164: toE164(legacy.customer && legacy.customer.mobile) }, attribution: { utm_source: u.source, utm_medium: u.medium, utm_campaign: u.campaign } }
      };
    }
    throw new Error('no legacy webhook for environment: ' + env);
  }

  // ---------- the contract validator ----------
  const PAYMENT_METHODS = ['upi', 'card', 'netbanking', 'wallet', 'cod'];
  function validate(evt) {
    const errors = [];
    function err(path, msg) { errors.push({ path: path, msg: msg }); }
    if (!evt || typeof evt !== 'object' || Array.isArray(evt)) return [{ path: '$', msg: 'must be a JSON object' }];
    if (typeof evt.id !== 'string' || !/^evt_[A-Za-z0-9]{12,}$/.test(evt.id)) err('id', 'must look like evt_ followed by 12+ letters or digits, and stay the same on every retry');
    if (EVENTS.indexOf(evt.type) < 0) err('type', 'must be one of ' + EVENTS.join(', '));
    if (evt.version !== '2026-11-01') err('version', 'must be "2026-11-01" (the contract version this validator knows)');
    if (typeof evt.created_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(evt.created_at)) err('created_at', 'must be ISO-8601 in UTC, ending in Z');
    if (typeof evt.merchant_id !== 'string' || !/^m_[A-Za-z0-9]+$/.test(evt.merchant_id)) err('merchant_id', 'must start with m_');
    if (ENVS.indexOf(evt.environment) < 0) err('environment', 'must be one of ' + ENVS.join(', '));
    const d = evt.data;
    if (!d || typeof d !== 'object') { err('data', 'is required'); return errors; }
    const isCheckout = evt.type === 'checkout.abandoned';
    if (isCheckout && typeof d.checkout_id !== 'string') err('data.checkout_id', 'is required for checkout events');
    if (!isCheckout && EVENTS.indexOf(evt.type) >= 0 && typeof d.order_id !== 'string') err('data.order_id', 'is required for order and payment events');
    if (!Number.isInteger(d.amount_paise) || d.amount_paise < 0) err('data.amount_paise', 'must be a whole number of paise (Rs 1,299.00 = 129900)');
    if (d.currency !== 'INR') err('data.currency', 'must be "INR" in this version');
    const phone = d.customer && d.customer.phone_e164;
    if (isCheckout && !phone) err('data.customer.phone_e164', 'is required for checkout.abandoned (no phone, no recovery)');
    if (phone && !/^\+[1-9]\d{7,14}$/.test(phone)) err('data.customer.phone_e164', 'must be E.164, e.g. +919876543210');
    if (evt.type === 'payment.captured' && PAYMENT_METHODS.indexOf(d.payment_method) < 0) err('data.payment_method', 'must be one of ' + PAYMENT_METHODS.join(', '));
    if (d.attribution && typeof d.attribution !== 'object') err('data.attribution', 'must be an object');
    return errors;
  }

  const api = { rng: rng, hash01: hash01, ENVS: ENVS, ENV_LABEL: ENV_LABEL, EVENTS: EVENTS, PARTNERS: PARTNERS, MERCHANT_MIX: MERCHANT_MIX,
    RETRY_SCHEDULE_MIN: RETRY_SCHEDULE_MIN, ON_TIME_MIN: ON_TIME_MIN, makeMerchants: makeMerchants, simulate: simulate, pct: pct,
    istToUtcIso: istToUtcIso, toE164: toE164, normalize: normalize, validate: validate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.WC = api;
})(typeof window !== 'undefined' ? window : this);
