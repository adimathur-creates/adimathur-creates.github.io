/*
 * The Slow Scam: synthetic payer simulation.
 *
 *   node src/simulate.js [seed] [users]
 *
 * Builds a fictional population of UPI payers over 90 days (30 warm-up + 60 measured),
 * plants investment-scam journeys in a small share of them, runs the engine over every
 * payment, and compares four policies. Writes results.json and data/sample_payments.csv.
 *
 * Every rate below is an ASSUMPTION, chosen from public descriptions of how these scams
 * run (RBI/I4C advisories, bank fraud pages, police cases). The engine, the metrics and
 * the trade-off method are what carry over to real data; the numbers are not a forecast.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const E = require('./engine');

const SEED = parseInt(process.argv[2] || '2026', 10);
const N_USERS = parseInt(process.argv[3] || '80000', 10);
const VICTIM_RATE = 0.0045;          // oversampled so there are enough journeys to measure
const DAYS = 90, WARM = 30, DAY = 1440;
const EVAL_START = WARM * DAY;
const UPI_P2P_CAP = 100000;          // Rs 1 lakh per P2P payment

// ---------- seeded random ----------
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rng = mulberry32(SEED);
const U = (a, b) => a + (b - a) * rng();
const UI = (a, b) => Math.floor(U(a, b + 1));
const pick = arr => arr[Math.floor(rng() * arr.length)];
function poisson(l) { if (l <= 0) return 0; if (l > 30) return Math.max(0, Math.round(l + Math.sqrt(l) * gauss())); let L = Math.exp(-l), k = 0, p = 1; do { k++; p *= rng(); } while (p > L); return k - 1; }
function gauss() { let u = 0, v = 0; while (u === 0) u = rng(); while (v === 0) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
const logn = (median, sigma) => median * Math.exp(sigma * gauss());
const roundTo = (x, s) => Math.max(s, Math.round(x / s) * s);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
function minuteIn(dayIdx, h0, h1) { return dayIdx * DAY + Math.floor(U(h0 * 60, h1 * 60)); }

// ---------- personas ----------
const PERSONAS = [
  ['everyday', 0.50], ['student', 0.14], ['trader', 0.08], ['buyer', 0.07],
  ['investor', 0.07], ['mover', 0.06], ['freelancer', 0.05], ['emergency', 0.03]
];
function drawPersona() { let r = rng(), c = 0; for (const [p, w] of PERSONAS) { c += w; if (r < c) return p; } return 'everyday'; }

function genGenuine(uid, persona) {
  const ev = [];
  const out = (t, amt, cp, cpType, fanIn = 0, extra = {}) => ev.push(Object.assign({ t, dir: 'out', amt: Math.round(amt), cp, cpType, fanIn, flagged: false }, extra));
  const inc = (t, amt, cp, cpType = 'individual') => ev.push({ t, dir: 'in', amt: Math.round(amt), cp, cpType, fanIn: 0, flagged: false });

  const nC = UI(3, 8), contacts = [];
  for (let i = 0; i < nC; i++) contacts.push(`c${uid}_${i}`);
  // seed history with every contact in the first days of warm-up (both directions for family)
  contacts.forEach((c, i) => { const t = minuteIn(UI(0, 4), 9, 21); if (i === 0 || rng() < 0.5) inc(t, logn(500, 0.7), c); else out(t, logn(500, 0.7), c, 'individual'); });

  const lm = { everyday: 1.2, student: 1.0, trader: 0.8, buyer: 1.1, investor: 1.3, mover: 1.2, freelancer: 1.1, emergency: 1.0 }[persona];
  const lsmall = persona === 'student' ? 0.15 : 0.08;
  const suppliers = persona === 'trader' ? [0, 1, 2, 3].map(i => `sup${uid}_${i}`) : [];
  if (persona === 'trader') suppliers.forEach(s => out(minuteIn(UI(0, 6), 10, 19), logn(6000, 0.5), s, 'individual'));

  for (let d = 0; d < DAYS; d++) {
    for (let k = poisson(lm); k > 0; k--) out(minuteIn(d, 8, 22), clamp(logn(180, 1.0), 10, 40000), `m${UI(0, 5000)}`, 'merchant');
    for (let k = poisson(0.15); k > 0; k--) out(minuteIn(d, 8, 23), roundTo(logn(600, 0.9), 10), pick(contacts), 'individual');
    for (let k = poisson(0.10); k > 0; k--) inc(minuteIn(d, 8, 23), roundTo(logn(600, 0.9), 10), pick(contacts));
    // a new local shop / auto driver / vendor paid on their personal UPI ID
    for (let k = poisson(lsmall); k > 0; k--) out(minuteIn(d, 7, 22), clamp(logn(150, 0.8), 10, 3000), `s${uid}_${d}_${k}`, 'individual', rng() < 0.7 ? poisson(12) : poisson(1));

    if (persona === 'student') {
      for (let k = poisson(0.06); k > 0; k--) inc(minuteIn(d, 10, 24), roundTo(logn(250, 0.6), 10), `f${uid}_${d}_${k}`);
      for (let k = poisson(0.05); k > 0; k--) out(minuteIn(d, 10, 24), roundTo(logn(300, 0.7), 10), `g${uid}_${d}_${k}`, 'individual', poisson(1));
    }
    if (persona === 'trader') {
      for (let k = poisson(12); k > 0; k--) inc(minuteIn(d, 8, 22), clamp(logn(200, 0.9), 10, 5000), `k${uid}_${d}_${k}`);
      for (let k = poisson(0.4); k > 0; k--) out(minuteIn(d, 10, 19), roundTo(logn(6000, 0.6), 100), pick(suppliers), 'individual');
      for (let k = poisson(0.06); k > 0; k--) out(minuteIn(d, 10, 19), Math.min(UPI_P2P_CAP, roundTo(logn(9000, 0.7), 500)), `ns${uid}_${d}_${k}`, 'individual', poisson(2));
    }
    if (persona === 'freelancer') {
      for (let k = poisson(0.08); k > 0; k--) inc(minuteIn(d, 9, 22), roundTo(logn(6000, 0.7), 100), `cl${uid}_${d}_${k}`);
      for (let k = poisson(0.05); k > 0; k--) out(minuteIn(d, 9, 23), roundTo(logn(3000, 0.8), 100), `sub${uid}_${d}_${k}`, 'individual', poisson(1));
    }
    if (persona === 'investor') {
      if (d % 30 === 5) out(minuteIn(d, 9, 12), roundTo(U(2000, 10000), 500), `sip${uid}@valid`, 'valid');
      for (let k = poisson(0.03); k > 0; k--) out(minuteIn(d, 9, 22), Math.min(UPI_P2P_CAP, roundTo(logn(15000, 0.8), 1000)), `brk${UI(0, 40)}@valid`, 'valid');
    }
  }

  if (persona === 'mover') {
    const d = UI(35, 85), landlord = `ll${uid}`;
    if (rng() < 0.5) out(minuteIn(d - UI(1, 4), 10, 20), roundTo(U(5000, 10000), 1000), landlord, 'individual', poisson(0.5));
    let dep = roundTo(U(20000, 150000), 1000);
    while (dep > 0) { const p = Math.min(UPI_P2P_CAP, dep); out(minuteIn(d, 10, 21), p, landlord, 'individual', poisson(0.5)); dep -= p; }
    out(minuteIn(d + UI(0, 1), 10, 21), roundTo(U(5000, 25000), 500), `bk${uid}`, 'individual', poisson(1));
    for (let m = d + 30; m < DAYS; m += 30) out(minuteIn(m, 9, 12), roundTo(U(10000, 40000), 500), landlord, 'individual');
  }
  if (persona === 'buyer') {
    const n = rng() < 0.3 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const d = UI(32, 88), seller = `sl${uid}_${i}`, price = clamp(roundTo(logn(8000, 0.8), 100), 1500, 60000);
      if (rng() < 0.3) { const tok = roundTo(U(500, 2000), 100); out(minuteIn(d, 10, 21), tok, seller, 'individual', poisson(0.5)); out(minuteIn(d + UI(0, 2), 10, 21), price - tok, seller, 'individual', poisson(0.5)); }
      else out(minuteIn(d, 10, 21), price, seller, 'individual', poisson(0.5));
    }
  }
  if (persona === 'emergency') {
    const d = UI(35, 80), fam = contacts[0]; let a = roundTo(U(5000, 15000), 1000);
    for (let i = 0, n = UI(3, 5); i < n; i++) { out(minuteIn(d + i, 8, 23), Math.min(UPI_P2P_CAP, a), fam, 'individual'); a = roundTo(a * U(1.3, 2.2), 1000); }
  }
  return ev;
}

// ---------- scam journeys ----------
let muleSeq = 0;
function muleFacts() {
  const ageH = U(0, 24);                       // mule IDs are rotated about daily (RBI advisory)
  const fanIn = poisson(6 * ageH / 24 + 0.5);  // other victims paying the same ID today
  const flagged = rng() < 1 - Math.exp(-ageH / 72); // list entry lags victim reports
  return { fanIn, flagged };
}
function genScam(uid, archetype, startDay) {
  const ev = [];
  let mule = null;
  const nextMule = (force) => { if (force || !mule || rng() < 0.75) mule = `mule${++muleSeq}`; return mule; };
  const pay = (t, amt) => { const m = nextMule(false); const f = muleFacts(); ev.push({ t, dir: 'out', amt: Math.min(UPI_P2P_CAP, Math.round(amt)), cp: m, cpType: 'individual', fanIn: f.fanIn, flagged: f.flagged, scam: true }); };
  const bait = (t, amt) => ev.push({ t, dir: 'in', amt: Math.round(amt), cp: `bt${++muleSeq}`, cpType: 'individual', fanIn: 0, flagged: false, scam: true, bait: true });
  const eveningT = (day) => day * DAY + Math.floor(U(18 * 60, 25.5 * 60)); // 6pm to 1:30am
  let t = startDay * DAY + Math.floor(U(9 * 60, 22 * 60));
  let off = 0;

  if (archetype === 'task') {
    for (let i = 0, n = UI(1, 3); i < n; i++) { bait(t, roundTo(U(100, 800), 10)); t += Math.floor(U(60, 1200)); }
    t += Math.floor(U(120, 2160));
    let a = roundTo(U(800, 2500), 100);
    for (let i = 0, n = UI(4, 8); i < n; i++) {
      pay(t, a);
      a = a * U(1.6, 3.0); a = a > 20000 ? roundTo(a, 1000) : roundTo(a, 100);
      t += Math.floor(U(30, 1200));
    }
  } else if (archetype === 'stock') {
    let a = roundTo(U(5000, 25000), 1000);
    pay(t, a);
    t += Math.floor(U(1, 3) * DAY);
    bait(t, roundTo(U(1000, 5000), 100));      // the fake "profit withdrawal"
    t += Math.floor(U(60, 720));
    let onSum = a;
    for (let i = 0, n = UI(4, 11); i < n; i++) {
      a = Math.min(UPI_P2P_CAP, roundTo(a * U(1.2, 2.2), 1000));
      pay(t, a); onSum += a;
      t += Math.floor(U(0.25, 3) * DAY);
    }
    if (rng() < 0.5) off = Math.round(onSum * U(1, 4)); // later moves to bank transfer, outside the app
  } else { // quick "double your money"
    if (rng() < 0.3) { bait(t, roundTo(U(100, 500), 50)); t += Math.floor(U(10, 120)); }
    let a = roundTo(U(199, 2000), 1);
    for (let i = 0, n = UI(2, 5); i < n; i++) {
      pay(t, a); a = Math.min(20000, roundTo(a * U(1.5, 3), 1)); t += Math.floor(U(10, 90));
    }
  }
  // scam activity skews to evenings: shift payments into evening hours
  for (const e of ev) if (e.dir === 'out' && rng() < 0.6) { const d = Math.floor(e.t / DAY); e.t = Math.max(e.t, eveningT(d)); }
  return { ev, off };
}

// ---------- build and featurize ----------
const SIG = ['new', 'vel', 'bait', 'esc', 'cum', 'fan', 'listed', 'round'];
const cfg = E.DEFAULT_CONFIG;
const users = [];
const csvRows = [];
const CSV_GENUINE = 1000;
const GENUINE_LIST_FP = 0.0005; // innocent receiving IDs wrongly on a list (assumption)
let genuineInCsv = 0;

for (let uid = 0; uid < N_USERS; uid++) {
  const isVictim = rng() < VICTIM_RATE;
  let archetype = null, persona;
  if (isVictim) {
    const r = rng(); archetype = r < 0.45 ? 'task' : r < 0.85 ? 'stock' : 'quick';
    persona = archetype === 'quick' && rng() < 0.6 ? 'student' : 'everyday';
  } else persona = drawPersona();
  let ev = genGenuine(uid, persona), off = 0;
  if (isVictim) { const s = genScam(uid, archetype, UI(35, 80)); ev = ev.concat(s.ev); off = s.off; }
  for (const e of ev) if (!e.scam && e.dir === 'out' && e.cpType === 'individual' && rng() < GENUINE_LIST_FP) e.flagged = true;
  ev.sort((a, b) => a.t - b.t);
  for (let i = 1; i < ev.length; i++) if (ev[i].t <= ev[i - 1].t) ev[i].t = ev[i - 1].t + 1;

  const st = E.createState(0);
  const scored = [];
  const scamOuts = [];
  const inCsv = isVictim || genuineInCsv < CSV_GENUINE;
  if (!isVictim && inCsv) genuineInCsv++;
  for (const e of ev) {
    let res = null;
    if (e.dir === 'out') res = E.scorePayment(st, e, cfg);
    if (e.dir === 'out' && e.cpType === 'individual' && e.t >= EVAL_START) {
      const pv = new Float32Array(SIG.length);
      if (res && res.pts) SIG.forEach((s, i) => { pv[i] = res.pts[s] || 0; });
      const isNewPayee = !st.seen.get(e.cp);
      scored.push({ t: e.t, amt: e.amt, cp: e.cp, isNewPayee, newish: res.newish, score: res.score, scoreNo: res.scoreNoLists, flagged: e.flagged, pv, scam: !!e.scam });
      if (e.scam) scamOuts.push(scored.length - 1);
    }
    if (inCsv) csvRows.push([uid, persona, isVictim ? 1 : 0, archetype || '', e.t, e.dir, e.amt, e.cp, e.cpType, e.fanIn, e.flagged ? 1 : 0, e.scam ? 1 : 0, res ? res.score : '', res ? res.scoreNoLists : '', res && res.newish ? res.n7 : '']);
    E.observe(st, e);
  }
  const u = { uid, persona, isVictim, archetype, scored, off, honest: rng() < 0.6, saysInvest: rng() < 0.03 };
  if (isVictim) {
    const amts = scamOuts.map(i => scored[i].amt);
    const on = amts.reduce((a, b) => a + b, 0);
    u.scamIdx = scamOuts; u.onLoss = on; u.totalLoss = on + off;
    // money still ahead (on the app + later bank transfers) at each scam payment
    let rem = on + off; u.remaining = amts.map(a => { const r = rem; rem -= a; return r; });
  }
  users.push(u);
}

// ---------- policy evaluation ----------
const H = { h1: 0.03, h2: 0.35, decay: 0.7, h3: 0.60, g2: 0.08, g3: 0.15, gInvest: 0.03 };

function evaluate(policy, opts = {}) {
  const th = opts.th || cfg.thresholds;
  const drop = opts.drop; // signal index to remove (ablation)
  const R = { victims: 0, reached: 0, reachedBy2: 0, reachedBy3: 0, aheadAtFirst: [], lossTotal: 0, lossOn: 0, avoided: 0, avoidedOnPlatform: 0,
    genuine: 0, gT1: 0, gT2: 0, gT3: 0, gUsersT2: 0, gAbandon: 0, gUsersT2Month: [0, 0], vUsersT2: 0, byPersona: {}, traces: [] };
  for (const u of users) {
    const fat = { lastT2: -Infinity, lastT2Score: -Infinity, t2Count: 0, lastT3: -Infinity, asked: new Set() };
    const tiers = new Array(u.scored.length).fill(0);
    for (let i = 0; i < u.scored.length; i++) {
      const s = u.scored[i];
      let tier = 0;
      if (policy === 'amount') tier = (s.isNewPayee && s.amt >= 10000) ? 2 : 0;
      else if (policy === 'lists') tier = s.flagged ? 2 : 0;
      else {
        let score = policy === 'journey' ? s.scoreNo : s.score;
        if (drop !== undefined) score -= s.pv[drop];
        if (!s.newish && policy === 'journey') score = 0;
        tier = E.decide(fat, s, score, E.tierFor(score, th), cfg);
        // purpose question: honest victims and a few genuine "investment" answers escalate to the full warning
        if (tier === 1 && ((u.isVictim && s.scam && u.honest) || (!u.isVictim && u.saysInvest))) tier = 2;
      }
      tiers[i] = tier;
    }
    if (u.isVictim) {
      R.victims++; R.lossTotal += u.totalLoss; R.lossOn += u.onLoss;
      let P = 1, avoided = 0, avoidedOn = 0, k2 = 0, first = -1;
      const trace = [];
      u.scamIdx.forEach((idx, j) => {
        const tier = tiers[idx];
        if (tier >= 2 && first < 0) first = j;
        trace.push([tier, u.remaining[j], k2]);
        let h = 0;
        if (tier === 1) h = H.h1;
        if (tier === 2) { h = H.h2 * Math.pow(H.decay, k2); k2++; }
        if (tier === 3) { h = H.h3 * Math.pow(H.decay, k2); k2++; }
        avoided += P * h * u.remaining[j];
        avoidedOn += P * h * (u.remaining[j] - u.off);
        P *= (1 - h);
      });
      R.avoided += avoided; R.avoidedOnPlatform += avoidedOn;
      if (first >= 0) { R.reached++; if (first <= 1) R.reachedBy2++; if (first <= 2) R.reachedBy3++; R.aheadAtFirst.push(u.remaining[first] / u.totalLoss); }
      R.traces.push({ a: u.archetype, L: u.totalLoss, off: u.off, tr: trace });
    } else {
      R.genuine++;
      const bp = R.byPersona[u.persona] || (R.byPersona[u.persona] = { users: 0, t1: 0, t2: 0 });
      bp.users++;
      let had = false; const hadM = [false, false];
      u.scored.forEach((s, i) => {
        const tier = tiers[i];
        if (tier === 1) { R.gT1++; bp.t1++; }
        if (tier >= 2) { R.gT2++; bp.t2++; had = true; hadM[s.t < (WARM + 30) * DAY ? 0 : 1] = true; R.gAbandon += tier === 3 ? H.g3 : H.g2; }
        if (tier === 3) R.gT3++;
      });
      if (had) R.gUsersT2++;
      hadM.forEach((h, m) => { if (h) R.gUsersT2Month[m]++; });
    }
  }
  const months = (DAYS - WARM) / 30;
  const per1k = x => +(x / R.genuine * 1000 / months).toFixed(2);
  const med = arr => { if (!arr.length) return null; const a = arr.slice().sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
  const tpr = R.reached / R.victims, fprMonth = (R.gUsersT2Month[0] + R.gUsersT2Month[1]) / 2 / R.genuine;
  const precisionAt = b => +(tpr * b / (tpr * b + fprMonth * (1 - b))).toFixed(4);
  const out = {
    policy, victims: R.victims, genuine: R.genuine,
    reachedPct: +(100 * tpr).toFixed(1), reachedBy2Pct: +(100 * R.reachedBy2 / R.victims).toFixed(1), reachedBy3Pct: +(100 * R.reachedBy3 / R.victims).toFixed(1),
    medianAheadAtFirstPct: R.aheadAtFirst.length ? +(100 * med(R.aheadAtFirst)).toFixed(1) : null,
    protectedPct: +(100 * R.avoided / R.lossTotal).toFixed(1),
    protectedOnPlatformPct: +(100 * R.avoidedOnPlatform / R.lossOn).toFixed(1),
    lossTotal: R.lossTotal, avoided: Math.round(R.avoided),
    gT1per1kMonth: per1k(R.gT1), gT2per1kMonth: per1k(R.gT2), gT3per1kMonth: per1k(R.gT3),
    gUsersWithT2Pct: +(100 * R.gUsersT2 / R.genuine).toFixed(2), gUsersWithT2MonthPct: +(100 * fprMonth).toFixed(3),
    gAbandonPer1kMonth: per1k(R.gAbandon),
    precisionAt1in1000: precisionAt(1 / 1000), precisionAt1in10000: precisionAt(1 / 10000),
    byPersona: Object.fromEntries(Object.entries(R.byPersona).map(([p, v]) => [p, { users: v.users, t1per1kMonth: +(v.t1 / v.users * 1000 / months).toFixed(1), t2per1kMonth: +(v.t2 / v.users * 1000 / months).toFixed(1) }]))
  };
  if (opts.traces) out.traces = R.traces;
  return out;
}

const policies = ['amount', 'lists', 'journey', 'journey+lists'].map(p => evaluate(p));
const chosen = evaluate('journey+lists', { traces: true });
const amountTr = evaluate('amount', { traces: true }).traces;

// threshold sweep for the recommended policy
const sweep = [];
for (let t2 = 2.4; t2 <= 6.81; t2 += 0.2) {
  const th = { t1: +(t2 - 1.4).toFixed(2), t2: +t2.toFixed(2), t3: +(t2 + 2.0).toFixed(2) };
  const r = evaluate('journey+lists', { th });
  sweep.push({ t2: th.t2, gT1per1kMonth: r.gT1per1kMonth, gT2per1kMonth: r.gT2per1kMonth, protectedPct: r.protectedPct, reachedPct: r.reachedPct });
}

// ablation: remove one signal at a time
const ablation = SIG.map((s, i) => { const r = evaluate('journey+lists', { drop: i }); return { signal: s, protectedPct: r.protectedPct, gT2per1kMonth: r.gT2per1kMonth, reachedPct: r.reachedPct }; });

// by archetype for the chosen policy
const byArch = {};
for (const t of chosen.traces) { const b = byArch[t.a] || (byArch[t.a] = { n: 0, L: 0, reached: 0, firstIdx: [] }); b.n++; b.L += t.L; const f = t.tr.findIndex(x => x[0] >= 2); if (f >= 0) { b.reached++; b.firstIdx.push(f + 1); } }
for (const k in byArch) { const b = byArch[k]; b.medianLoss = Math.round(chosen.traces.filter(t => t.a === k).map(t => t.L).sort((x, y) => x - y)[Math.floor(b.n / 2)]); b.reachedPct = +(100 * b.reached / b.n).toFixed(1); b.medianFirstPayment = b.firstIdx.length ? b.firstIdx.sort((x, y) => x - y)[Math.floor(b.firstIdx.length / 2)] : null; delete b.firstIdx; delete b.L; }

// experiment sizing (two-proportion, alpha 0.05 two-sided, power 0.8)
function nPerArm(p1, rel) { const p2 = p1 * (1 - rel), z = 1.96 + 0.8416; return Math.ceil(z * z * (p1 * (1 - p1) + p2 * (1 - p2)) / Math.pow(p1 - p2, 2)); }
const sizing = [1 / 1000, 1 / 3000, 1 / 10000].map(p => ({ monthlyVictimRate: p, rel: 0.2, usersPerArm: nPerArm(p, 0.2) }));

const totalEvents = users.reduce((a, u) => a + u.scored.length, 0);
const results = {
  meta: { seed: SEED, users: N_USERS, victims: chosen.victims, days: DAYS - WARM, warmupDays: WARM, scoredPayments: totalEvents, generated: new Date().toISOString().slice(0, 10), heed: H, thresholds: cfg.thresholds, weights: cfg.weights },
  policies, chosen: Object.assign({}, chosen, { traces: undefined }),
  traces: chosen.traces.map((t, i) => ({ a: t.a, L: t.L, off: t.off, j: t.tr.map(x => x[0]).join(''), m: amountTr[i].tr.map(x => x[0]).join(''), r: t.tr.map(x => x[1]) })), sweep, ablation, byArch, sizing
};
const outDir = path.join(__dirname, '..');
fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(results));
const header = 'user_id,persona,is_victim,archetype,ts_min,dir,amount,counterparty,cp_type,fan_in_24h,flagged,is_scam,score,score_no_lists,new_payees_7d';
fs.writeFileSync(path.join(outDir, 'data', 'sample_payments.csv.gz'), require('zlib').gzipSync(header + '\n' + csvRows.map(r => r.join(',')).join('\n') + '\n', { level: 9 }));

console.log(`seed ${SEED}: ${N_USERS} users, ${chosen.victims} victims, ${totalEvents} scored P2P payments`);
console.table(policies.map(p => ({ policy: p.policy, reached: p.reachedPct, by3rd: p.reachedBy3Pct, aheadAtFirst: p.medianAheadAtFirstPct, protected: p.protectedPct, gT1: p.gT1per1kMonth, gT2: p.gT2per1kMonth, gUsersT2m: p.gUsersWithT2MonthPct, prec1k: p.precisionAt1in1000 })));
console.table(Object.entries(chosen.byPersona).map(([k, v]) => Object.assign({ persona: k }, v)));
console.table(ablation);
console.log(byArch);

if (process.env.DEBUG) {
  const combos = {};
  for (const u of users) if (!u.isVictim) for (const s of u.scored) if (s.score >= cfg.thresholds.t2) {
    const k = u.persona + ': ' + SIG.filter((x, i) => s.pv[i] > 0).join('+');
    combos[k] = (combos[k] || 0) + 1;
  }
  console.log(Object.entries(combos).sort((a, b) => b[1] - a[1]).slice(0, 25));
  console.table(sweep);
}
