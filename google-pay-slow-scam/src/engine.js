/*
 * The Slow Scam: journey scoring engine.
 *
 * Scores each outgoing UPI payment from ONE payer, using only:
 *   - that payer's own payment history inside the payment app, and
 *   - two payee-side facts the app already gets (how many first-time payers
 *     this receiving ID had in the last 24h, and whether it is on a fraud list).
 * It never reads messages, contacts or other apps.
 *
 * Works in the browser (window.SlowScam) and in Node (module.exports).
 */
(function (root) {
  'use strict';

  var DAY = 1440; // minutes

  var DEFAULT_CONFIG = {
    weights: {
      newPayee: 1.0,     // first ever payment to this person
      vel2: 0.6,         // 2 new people paid in 7 days
      vel3: 1.4,         // 3-4 new people paid in 7 days
      vel5: 2.0,         // 5+ new people paid in 7 days
      bait: 1.6,         // a stranger paid you a small amount, now you pay a different stranger
      esc: 0.9,          // this payment is 1.8x+ the biggest recent payment to a new person
      esc3: 1.3,         // 3x+
      cum1: 0.7,         // money to new people in 14 days >= 0.5x your usual month
      cum2: 1.4,         // >= 1.5x your usual month
      fan1: 0.8,         // receiving ID got first payments from 5+ different people in 24h
      fan2: 1.3,         // 15+
      listed: 3.0,       // receiving ID is on a fraud list (I4C Suspect Registry, DoT FRI)
      round: 0.2         // round amount of Rs 5,000 or more
    },
    thresholds: { t1: 3.2, t2: 4.6, t3: 6.6 },
    minAmount: 500,         // never add friction below Rs 500
    minCounted: 500,        // tiny new payees (tea stall, auto) don't count towards velocity or escalation
    baitMax: 5000,          // a "bait" credit is small...
    baitRatio: 1.5,         // ...and this payment is at least 1.5x that credit
    manyStrangers: 8,       // people paid by 8+ strangers a month (shops, freelancers)...
    busyDamp: 0.25,         // ...get only a quarter of the bait points
    t2CooldownMin: 72 * 60, // after a full warning, wait 72h unless risk clearly rises
    t3CooldownMin: 24 * 60,
    useLists: true
  };

  var LABELS = {
    newPayee: 'First payment to this person',
    vel: 'new people paid in the last 7 days',
    bait: 'A stranger sent you a small amount, and now you are paying a different stranger',
    esc: 'Much bigger than your last payment to a new person',
    cum: 'Money sent to new people in 14 days is large for you',
    fan: 'This UPI ID was paid for the first time by many different people today',
    listed: 'This UPI ID is on a government fraud list',
    round: 'Round amount',
    small: 'Under \u20b9500: no friction',
    valid: 'SEBI-verified @valid UPI ID',
    merchant: 'Verified merchant',
    known: 'You have paid or been paid by this person before'
  };

  function createState(t0) {
    return {
      t0: t0 || 0,
      seen: new Map(),      // cp -> {out, in, firstOutT}
      newIndOut: [],        // outflows to new-ish individuals {t, amt, cp}
      strangerIn: [],       // credits from individuals who were new at the time {t, amt, cp}
      outLog: [],           // ordinary outflows for the "usual month" baseline {t, amt}
      lastT2: -Infinity, lastT2Score: -Infinity, t2Count: 0,
      lastT3: -Infinity,
      asked: new Set()
    };
  }

  function prune(arr, minT) {
    var i = 0;
    while (i < arr.length && arr[i].t < minT) i++;
    if (i > 0) arr.splice(0, i);
  }

  function isNewish(st, e) {
    var rec = st.seen.get(e.cp);
    if (!rec) return true;
    if (rec.in > 0) return false; // two-way relationship
    return rec.firstOutT !== undefined && (e.t - rec.firstOutT) <= 14 * DAY;
  }

  function baselineMonthly(st, t) {
    var sum = 0;
    for (var i = 0; i < st.outLog.length; i++) if (st.outLog[i].t >= t - 30 * DAY) sum += st.outLog[i].amt;
    var days = Math.min(30, Math.max(7, (t - st.t0) / DAY));
    return Math.max(5000, sum * 30 / days);
  }

  function distinctStrangers30(st, t) {
    var s = new Set();
    for (var i = 0; i < st.strangerIn.length; i++) if (st.strangerIn[i].t >= t - 30 * DAY) s.add(st.strangerIn[i].cp);
    return s.size;
  }

  function fmt(n) { return '₹' + Math.round(n).toLocaleString('en-IN'); }

  /*
   * Score one outgoing payment BEFORE it is sent.
   * e = {t (minutes), dir:'out', amt, cp, cpType:'individual'|'merchant'|'valid', fanIn, flagged}
   * Returns {score, scoreNoLists, tier, signals:[{id,label,pts}], pts:{id:pts}, newish}
   */
  function scorePayment(st, e, cfg) {
    cfg = cfg || DEFAULT_CONFIG;
    var w = cfg.weights, th = cfg.thresholds;
    var signals = [], pts = {};
    function add(id, label, p) { signals.push({ id: id, label: label, pts: p }); pts[id] = (pts[id] || 0) + p; }

    if (e.dir !== 'out') return null;
    if (e.cpType === 'valid') return result(0, 0, [{ id: 'valid', label: LABELS.valid, pts: 0 }], {}, false);
    if (e.cpType === 'merchant') return result(0, 0, [{ id: 'merchant', label: LABELS.merchant, pts: 0 }], {}, false);

    var newish = isNewish(st, e);
    var listedPts = (e.flagged ? w.listed : 0);
    if (!newish) {
      var known = [{ id: 'known', label: LABELS.known, pts: 0 }];
      if (e.flagged) known.push({ id: 'listed', label: LABELS.listed, pts: w.listed });
      return result(cfg.useLists ? listedPts : 0, 0, known, e.flagged ? { listed: w.listed } : {}, false);
    }

    if (e.amt < cfg.minAmount) {
      var sm = [{ id: 'small', label: LABELS.small, pts: 0 }];
      if (e.flagged) sm.push({ id: 'listed', label: LABELS.listed, pts: w.listed });
      var r0 = result(cfg.useLists ? listedPts : 0, 0, sm, e.flagged ? { listed: w.listed } : {}, true);
      return r0;
    }

    var isNew = !st.seen.get(e.cp);
    if (isNew) add('new', LABELS.newPayee, w.newPayee);

    // velocity: distinct new people paid in 7 days, including this one
    var s7 = new Set([e.cp]);
    for (var i = 0; i < st.newIndOut.length; i++) {
      var q = st.newIndOut[i];
      if (q.t >= e.t - 7 * DAY && q.amt >= cfg.minCounted) s7.add(q.cp);
    }
    var n = s7.size;
    if (n >= 5) add('vel', n + ' ' + LABELS.vel, w.vel5);
    else if (n >= 3) add('vel', n + ' ' + LABELS.vel, w.vel3);
    else if (n >= 2) add('vel', n + ' ' + LABELS.vel, w.vel2);

    // bait: small credit from a stranger in 10 days, now paying a DIFFERENT stranger
    var bait = null;
    for (var j = st.strangerIn.length - 1; j >= 0; j--) {
      var c = st.strangerIn[j];
      if (c.t < e.t - 10 * DAY) break;
      var crec = st.seen.get(c.cp);
      if (c.amt <= cfg.baitMax && e.amt >= cfg.baitRatio * c.amt && c.cp !== e.cp && !(crec && crec.out > 0)) { bait = c; break; }
    }
    if (bait) {
      var bp = w.bait;
      if (distinctStrangers30(st, e.t) >= cfg.manyStrangers) bp *= cfg.busyDamp;
      add('bait', LABELS.bait + ' (' + fmt(bait.amt) + ' received)', bp);
    }

    // escalation (across DIFFERENT new people) and cumulative, over the last 14 days
    var maxPrior = 0, sumPrior = 0, nPrior = 0;
    for (var k = 0; k < st.newIndOut.length; k++) {
      var o = st.newIndOut[k];
      if (o.t >= e.t - 14 * DAY && o.amt >= cfg.minCounted) {
        sumPrior += o.amt; nPrior++;
        if (o.cp !== e.cp && o.amt > maxPrior) maxPrior = o.amt;
      }
    }
    if (maxPrior > 0) {
      var r = e.amt / maxPrior;
      if (r >= 3) add('esc', LABELS.esc + ' (' + r.toFixed(1) + 'x)', w.esc3);
      else if (r >= 1.8) add('esc', LABELS.esc + ' (' + r.toFixed(1) + 'x)', w.esc);
    }
    var base = baselineMonthly(st, e.t), cum = sumPrior + e.amt;
    if (nPrior === 0) { /* a single payment is judged by the other signals */ }
    else if (cum >= 1.5 * base) add('cum', LABELS.cum + ' (' + fmt(cum) + ' vs usual ' + fmt(base) + '/month)', w.cum2);
    else if (cum >= 0.5 * base) add('cum', LABELS.cum + ' (' + fmt(cum) + ' vs usual ' + fmt(base) + '/month)', w.cum1);

    // payee-side network facts
    if (e.fanIn >= 15) add('fan', LABELS.fan + ' (' + e.fanIn + ')', w.fan2);
    else if (e.fanIn >= 5) add('fan', LABELS.fan + ' (' + e.fanIn + ')', w.fan1);

    if (e.amt >= 5000 && e.amt % 1000 === 0) add('round', LABELS.round, w.round);

    var sNo = 0;
    for (var s = 0; s < signals.length; s++) sNo += signals[s].pts;
    if (e.flagged) { signals.push({ id: 'listed', label: LABELS.listed, pts: w.listed }); pts.listed = w.listed; }
    var total = sNo + (cfg.useLists ? listedPts : 0);
    var out = result(total, sNo, signals, pts, true);
    out.n7 = n;
    return out;

    function result(score, scoreNoLists, sig, p, nw) {
      var tier = score >= th.t3 ? 3 : score >= th.t2 ? 2 : score >= th.t1 ? 1 : 0;
      return { score: round2(score), scoreNoLists: round2(scoreNoLists), tier: tier, signals: sig, pts: p, newish: nw, n7: 0 };
    }
  }

  function round2(x) { return Math.round(x * 100) / 100; }

  function tierFor(score, th) { return score >= th.t3 ? 3 : score >= th.t2 ? 2 : score >= th.t1 ? 1 : 0; }

  /*
   * Apply fatigue rules to a raw tier. Mutates the payer's state.
   * Rules: ask the purpose question once per payee; one full warning per 72h
   * unless the score rises by 1+ point; one hold per 24h.
   */
  function decide(st, e, score, rawTier, cfg) {
    cfg = cfg || DEFAULT_CONFIG;
    var tier = rawTier;
    if (tier === 3 && e.t - st.lastT3 < cfg.t3CooldownMin) tier = 2;
    if (tier === 2 && e.t - st.lastT2 < cfg.t2CooldownMin && score < st.lastT2Score + 1) tier = 1;
    if (tier === 1 && st.asked.has(e.cp)) tier = 0;
    if (tier >= 2) { st.lastT2 = e.t; st.lastT2Score = score; st.t2Count++; }
    if (tier === 3) st.lastT3 = e.t;
    if (tier >= 1) st.asked.add(e.cp);
    return tier;
  }

  /* Update the payer's state after a payment or credit actually happens. */
  function observe(st, e) {
    var rec = st.seen.get(e.cp);
    var wasNew = !rec;
    if (e.dir === 'out') {
      var newish = e.cpType === 'individual' && isNewish(st, e);
      if (newish) st.newIndOut.push({ t: e.t, amt: e.amt, cp: e.cp });
      else st.outLog.push({ t: e.t, amt: e.amt });
      if (!rec) { rec = { out: 0, in: 0, firstOutT: e.t }; st.seen.set(e.cp, rec); }
      if (rec.firstOutT === undefined) rec.firstOutT = e.t;
      rec.out++;
    } else {
      if (e.cpType === 'individual' && wasNew) st.strangerIn.push({ t: e.t, amt: e.amt, cp: e.cp });
      if (!rec) { rec = { out: 0, in: 0 }; st.seen.set(e.cp, rec); }
      rec.in++;
    }
    var cut = e.t - 30 * DAY;
    prune(st.newIndOut, cut); prune(st.strangerIn, cut); prune(st.outLog, cut);
  }

  var api = {
    DAY: DAY, DEFAULT_CONFIG: DEFAULT_CONFIG, LABELS: LABELS,
    createState: createState, scorePayment: scorePayment, decide: decide, observe: observe,
    tierFor: tierFor, baselineMonthly: baselineMonthly
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SlowScam = api;
})(typeof window !== 'undefined' ? window : this);
