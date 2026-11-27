// Four shots per cycle: how should a recurring-payments platform spend one UPI AutoPay attempt + three retries?
// Daily balance simulation of payers. Every share, rate and behaviour is a labelled assumption.
(function (root, f) { if (typeof module === "object" && module.exports) module.exports = f(); else root.FSSim = f(); })(this, function () {
  function rng(seed) { let a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const SEGMENTS = {
    salaried: { label: "Salaried (monthly pay)", share: 0.45, spend: 0.10, emiShare: 0.18 },
    weekly:   { label: "Weekly earners (MFI borrowers, shopkeepers)", share: 0.35, spend: 0.28, emiShare: 0.16 },
    irregular:{ label: "Irregular income (gig, small business)", share: 0.20, spend: 0.16, emiShare: 0.16 },
  };
  const WINDOWS = { morning: "Before 10 am", afternoon: "1 pm – 5 pm", night: "After 9:30 pm" };
  const ASSUME = {
    payers: 30000, cycleDays: 15, months: 3, history: 3,
    technicalDecline: 0.02, revokePerFailure: 0.015, baseRevoke: 0.002,
    reminderSave: 0.15, // a reminder the evening before turns a near-miss (balance >= half the amount) into a success
    linkPay: 0.5, linkWindow: 3, // after a pay link, chance the payer pays once funds arrive within 3 days
    manualChase: 0.3, chaseCostMin: 6, paySlip: 0.35, weekMiss: 0.2, // merchant chases by phone/WhatsApp after attempts run out
  };
  const POLICIES = ["daily", "spread", "inflow"];
  const NAMES = { daily: "Retry every morning for 3 days", spread: "Spread: day 0, 2, 5, 9", inflow: "Inflow-aware: windows after money arrives + reminder + pay link" };

  function makePayer(r, o) {
    const x = r(); const seg = x < SEGMENTS.salaried.share ? "salaried" : x < SEGMENTS.salaried.share + SEGMENTS.weekly.share ? "weekly" : "irregular";
    const S = SEGMENTS[seg], monthly = 15000 + Math.floor(r() * 25000);
    const p = { seg, monthly, amount: Math.round(monthly * S.emiShare / 10) * 10, payday: [1, 1, 3, 5, 7, 10, 15, 25, 28][Math.floor(r() * 9)], weekday: Math.floor(r() * 7), due: [1, 5, 10][Math.floor(r() * 3)], spend: S.spend, irregP: 0.12 };
    return p;
  }
  // inflow on absolute day t (credited around noon)
  // inflow on absolute day t (credited around noon). Real income slips: paydays move by up to 3 days, weekly income sometimes doesn't come.
  function inflowSeries(p, days, r, o) { const v = new Array(days).fill(0);
    if (p.seg === "salaried") { for (let mo = 0; mo * 30 < days; mo++) { const slip = r() < o.paySlip ? 1 + Math.floor(r() * 3) : 0, t = mo * 30 + (p.payday % 30) + slip; if (t < days) v[t] += p.monthly; } }
    else if (p.seg === "weekly") { for (let t = 0; t < days; t++) if (t % 7 === p.weekday && r() > o.weekMiss) { const s = r() < 0.2 ? 1 : 0; if (t + s < days) v[t + s] += p.monthly / 4.3 / (1 - o.weekMiss); } }
    else { for (let t = 0; t < days; t++) if (r() < p.irregP) v[t] += p.monthly / (30 * p.irregP); }
    return v; }

  function run(opts) {
    const o = Object.assign({ seed: 7 }, ASSUME, opts || {}), out = {};
    for (const pol of POLICIES) {
      const r = rng(o.seed * 31 + 3), m = { cycles: 0, collected: 0, collectedDay0: 0, daysLate: 0, failedAttempts: 0, revoked: 0, reminders: 0, links: 0, chases: 0, viaLink: 0, bySeg: {} };
      for (const k of Object.keys(SEGMENTS)) m.bySeg[k] = { cycles: 0, collected: 0 };
      for (let u = 0; u < o.payers; u++) {
        const p = makePayer(r, o); let bal = p.monthly * 0.1 * r(), revoked = false;
        const totalDays = 30 * (o.history + o.months), inf = inflowSeries(p, totalDays + 20, r, o), ev = []; // same money for every policy
        for (let t = 0; t < totalDays + 20; t++) ev.push({ in: inf[t], noise: 0.7 + 0.6 * r() });
        // history months: learn the inflow day (what Collect would see as the day past debits succeeded / balance arrived)
        let learned = null; { const hits = []; for (let t = 0; t < 30 * o.history; t++) if (ev[t].in > 0) hits.push(t); const mode = (a) => { const c = {}; a.forEach((x) => (c[x] = (c[x] || 0) + 1)); return +Object.entries(c).sort((x, y) => y[1] - x[1])[0][0]; };
          if (p.seg === "salaried" && hits.length) learned = { type: "monthly", dom: Math.min(...hits.map((h) => h % 30)) }; else if (p.seg === "weekly" && hits.length) learned = { type: "weekly", dow: mode(hits.map((h) => h % 7)) }; else learned = { type: "irregular" }; }
        const balAt = [], b0 = []; let b = bal; for (let t = 0; t < totalDays + 20; t++) { b0.push(b); b += ev[t].in; balAt.push(b); b = Math.max(0, b * (1 - p.spend * ev[t].noise)); }
        // balance at a window on day t: morning sees pre-inflow balance, afternoon/night see post-inflow (night after a day of spending)
        const windowBal = (t, w) => (w === "morning" ? b0[t] : w === "afternoon" ? balAt[t] : balAt[t] * (1 - p.spend * ev[t].noise * 0.5));
        for (let mo = 0; mo < o.months && !revoked; mo++) {
          const dueDay = 30 * (o.history + mo) + p.due; m.cycles++; m.bySeg[p.seg].cycles++;
          let plan;
          if (pol === "daily") plan = [[0, "morning"], [1, "morning"], [2, "morning"], [3, "morning"]];
          if (pol === "spread") plan = [[0, "morning"], [2, "morning"], [5, "morning"], [9, "morning"]];
          if (pol === "inflow") { // next likely funded days inside the cycle, afternoon window right after money lands
            const cand = []; for (let d = 0; d < o.cycleDays; d++) { const t = dueDay + d, dom = t % 30, dow = t % 7;
              const funded = learned.type === "monthly" ? ((dom - learned.dom + 30) % 30) <= 3 : learned.type === "weekly" ? ((dow - learned.dow + 7) % 7) <= 1 : false; if (funded) cand.push(d); }
            const days = [0]; for (const d of cand) if (d > 0 && days.length < 4 && !days.includes(d)) days.push(d);
            for (const d of [3, 7, 11]) if (days.length < 4 && !days.includes(d)) days.push(d); days.sort((a, b) => a - b);
            plan = days.map((d) => [d, cand.includes(d) ? "afternoon" : "morning"]); }
          let paid = false, fails = 0, linkFrom = null;
          for (const [d, w] of plan) {
            if (paid || revoked) break; const t = dueDay + d;
            // payer-initiated link payment between attempts (inflow policy)
            if (linkFrom !== null) for (let k = linkFrom; k <= Math.min(t - 1, linkFrom + o.linkWindow); k++) if (!paid && balAt[k] >= p.amount && r() < o.linkPay / (o.linkWindow + 1)) { paid = true; m.viaLink++; m.daysLate += k - dueDay; }
            if (paid) break;
            let ok = windowBal(t, w) >= p.amount && r() > o.technicalDecline;
            if (!ok && pol === "inflow" && !o.noReminder) { m.reminders++; if (windowBal(t, w) >= 0.5 * p.amount && r() < o.reminderSave) ok = true; }
            if (ok) { paid = true; m.daysLate += d; if (d === 0) m.collectedDay0++; }
            else { fails++; m.failedAttempts++; if (r() < o.revokePerFailure) { revoked = true; m.revoked++; }
              if (pol === "inflow" && !o.noLink && fails === 2 && linkFrom === null) { linkFrom = t + 1; m.links++; } }
          }
          if (!paid && !revoked && linkFrom !== null) for (let k = linkFrom; k < dueDay + o.cycleDays; k++) if (!paid && balAt[k] >= p.amount && r() < o.linkPay / (o.linkWindow + 1)) { paid = true; m.viaLink++; m.daysLate += k - dueDay; }
          if (!paid && !revoked) { m.chases++; if (r() < o.manualChase) { paid = true; m.daysLate += o.cycleDays; } }
          if (paid) { m.collected++; m.bySeg[p.seg].collected++; }
          if (!revoked && r() < o.baseRevoke) { revoked = true; m.revoked++; }
        }
      }
      m.rate = m.collected / m.cycles; m.day0 = m.collectedDay0 / m.cycles; m.avgLate = m.collected ? m.daysLate / m.collected : 0; m.failPer = m.failedAttempts / m.cycles; m.revokeRate = m.revoked / o.payers; m.chasePer100 = (m.chases / m.cycles) * 100; m.chaseHoursPer1000 = (m.chases / m.cycles) * 1000 * o.chaseCostMin / 60;
      out[pol] = m;
    }
    return out;
  }
  return { rng, SEGMENTS, WINDOWS, ASSUME, POLICIES, NAMES, run, makePayer };
});
