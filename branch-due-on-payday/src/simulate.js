/* Simulates repayment of 3-instalment loans under three schedules.
   All rates are labelled assumptions; change them and the page recomputes. */
(function (root, f) { if (typeof module === "object" && module.exports) module.exports = f(); else root.Sim = f(); })(this, function () {
  "use strict";
  function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  const ASSUME = {
    borrowers: 50000,
    mix: { monthly: 0.55, weekly: 0.25, irregular: 0.20 },            // income patterns
    monthlyDays: { 1: 0.35, last: 0.35, 7: 0.20, 15: 0.10 },           // salary dates among monthly earners
    wontPay: 0.035,            // would not repay under any schedule (credit risk, not timing)
    bufferMeanDays: 7,         // money "on hand" lasts this long after an inflow, on average
    payIfFunded: 0.96,         // pays on the due date when money is on hand
    payIfShort: 0.55,          // pays on the due date anyway when short (borrows, skips another bill)
    curePerInflow: 0.80,       // a late borrower pays at the next inflow with this chance
    weeklyScrape: 0.15,        // a late borrower finds the money from elsewhere in any given week
    irregularGapDays: [6, 22], // irregular earners get money every 6-22 days
    detect: { monthly: 0.92, weekly: 0.70 }, // share whose pattern is read correctly (Account Aggregator or stated payday)
    autopayFunded: 0.99,       // with AutoPay on payday, a funded borrower almost never "forgets"
    autopayRetry: 0.90,        // AutoPay re-presented on the next inflow succeeds this often (vs manual cure)
    splitScrape: 0.35,         // weekly cure when a missed borrower is offered a pre-agreed half payment
    instalments: 3, tenureDays: 30, window: 15
  };

  const POLICIES = ["fixed", "aligned", "autopay", "split"];
  function draw(r, w) { let x = r() * Object.values(w).reduce((a, b) => a + b, 0); for (const k of Object.keys(w)) { x -= w[k]; if (x < 0) return k; } return Object.keys(w).pop(); }
  // income timeline as day offsets from disbursal (day 0), out to day 250
  function incomeDays(r, a) {
    const type = draw(r, a.mix), days = [];
    if (type === "monthly") {
      const d = draw(r, a.monthlyDays), start = Math.floor(r() * 30); // disbursal lands at a random point in the pay month
      const phase = d === "last" ? 29 : (+d - 1);
      let first = (phase - start + 30) % 30; for (let t = first; t < 250; t += 30) days.push(t);
      return { type, days, label: d === "last" ? "last working day" : "day " + d };
    }
    if (type === "weekly") { const first = Math.floor(r() * 7); for (let t = first; t < 250; t += 7) days.push(t); return { type, days, label: "weekly" }; }
    let t = Math.floor(r() * 10); while (t < 250) { days.push(t); t += a.irregularGapDays[0] + Math.floor(r() * (a.irregularGapDays[1] - a.irregularGapDays[0] + 1)); }
    return { type, days, label: "irregular" };
  }
  const lastInflowOnOrBefore = (days, t) => { let best = -Infinity; for (const d of days) { if (d <= t) best = d; else break; } return best; };
  const nextInflowAfter = (days, t) => { for (const d of days) if (d > t) return d; return Infinity; };

  function dueDays(inc, policy, a, detected) {
    const out = []; let prev = 0;
    for (let k = 1; k <= a.instalments; k++) {
      const std = a.tenureDays * k; let due = std;
      if (policy !== "fixed" && detected && inc.type !== "irregular") {
        const c = inc.days.filter((d) => d + 1 >= std - a.window && d + 1 <= std + a.window && d + 1 > prev + 14);
        if (c.length) due = c.reduce((x, y) => Math.abs(x + 1 - std) <= Math.abs(y + 1 - std) ? x : y) + 1;
      }
      out.push(due); prev = due;
    }
    return out;
  }

  function borrower(r, a) {
    const inc = incomeDays(r, a);
    return { inc, wontPay: r() < a.wontPay, buffer: -a.bufferMeanDays * Math.log(1 - r()), detected: r() < (a.detect[inc.type] || 0), draws: Array.from({ length: 80 }, () => r()) };
  }

  function repay(b, policy, a) {
    const dues = dueDays(b.inc, policy, a, b.detected); let di = 0; const u = () => b.draws[di++ % b.draws.length];
    let firstOnTime = null, maxDpd = 0, writeOff = false, lateInstalments = 0, contacts = 0, shift = 0;
    for (let k = 0; k < dues.length; k++) {
      const due = dues[k]; shift += Math.abs(due - a.tenureDays * (k + 1));
      if (b.wontPay) { maxDpd = 999; writeOff = true; if (k === 0) firstOnTime = false; break; }
      const funded = due - lastInflowOnOrBefore(b.inc.days, due) <= b.buffer;
      const auto = policy === "autopay" || policy === "split";
      let paid = u() < (funded ? (auto ? a.autopayFunded : a.payIfFunded) : a.payIfShort), dpd = 0;
      const cure = auto ? a.autopayRetry : a.curePerInflow, scrape = policy === "split" ? a.splitScrape : a.weeklyScrape;
      if (!paid) {
        let t = due; contacts += 1;
        while (!paid) {
          const nIn = nextInflowAfter(b.inc.days, t), nWk = t + 7;
          if (nWk < nIn) { t = nWk; if (t - due > 90) { dpd = 91; break; } contacts += 1; if (u() < scrape) { paid = true; dpd = t - due; } continue; }
          t = nIn; if (t === Infinity || t - due > 90) { dpd = 91; break; } contacts += 1; if (u() < cure) { paid = true; dpd = t + 1 - due; }
        }
      }
      if (k === 0) firstOnTime = dpd === 0;
      if (dpd > 0) lateInstalments++;
      maxDpd = Math.max(maxDpd, dpd);
      if (dpd > 90) { writeOff = true; break; }
    }
    return { firstOnTime, maxDpd, writeOff, lateInstalments, contacts, shift: shift / a.instalments };
  }

  function run(opts) {
    const a = Object.assign({}, ASSUME, opts || {});
    ["mix", "monthlyDays", "detect"].forEach((k) => { a[k] = Object.assign({}, ASSUME[k], (opts && opts[k]) || {}); });
    const r = rng(a.seed || 2026), bs = []; for (let i = 0; i < a.borrowers; i++) bs.push(borrower(r, a));
    const out = { meta: { assume: a } };
    for (const policy of POLICIES) {
      const seg = { all: [], monthly: [], weekly: [], irregular: [] };
      for (const b of bs) { const x = repay(b, policy, a); seg.all.push(x); seg[b.inc.type].push(x); }
      out[policy] = {};
      for (const [k, xs] of Object.entries(seg)) {
        const n = xs.length || 1, m = (f) => xs.filter(f).length / n;
        out[policy][k] = { n: xs.length, firstOnTime: m((x) => x.firstOnTime), dpd1: m((x) => x.maxDpd >= 1), dpd30: m((x) => x.maxDpd >= 30), writeOff: m((x) => x.writeOff), contacts: xs.reduce((s, x) => s + x.contacts, 0) / n, shift: xs.reduce((s, x) => s + x.shift, 0) / n };
      }
    }
    return out;
  }
  function seeds(n, opts) { const res = []; for (let s = 1; s <= n; s++) res.push(run(Object.assign({}, opts || {}, { seed: s, borrowers: (opts && opts.borrowers) || 20000 }))); return res; }

  /* Two-proportion sample size per arm (normal approximation). */
  function sampleSize(p0, p1, alpha, power) {
    const z = (p) => { // inverse normal, Acklam-style rational approximation
      const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239],
        b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572],
        c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783],
        d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
      const pl = 0.02425; let q, rr;
      if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
      if (p > 1 - pl) { q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
      q = p - 0.5; rr = q * q; return (((((a[0] * rr + a[1]) * rr + a[2]) * rr + a[3]) * rr + a[4]) * rr + a[5]) * q / (((((b[0] * rr + b[1]) * rr + b[2]) * rr + b[3]) * rr + b[4]) * rr + 1);
    };
    const za = z(1 - (alpha || 0.05) / 2), zb = z(power || 0.8), pb = (p0 + p1) / 2;
    return Math.ceil(Math.pow(za * Math.sqrt(2 * pb * (1 - pb)) + zb * Math.sqrt(p0 * (1 - p0) + p1 * (1 - p1)), 2) / Math.pow(p0 - p1, 2));
  }

  return { ASSUME, POLICIES, run, seeds, sampleSize, dueDays, incomeDays, rng };
});
