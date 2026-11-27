// Portfolio maths for Indian mutual fund reports: XIRR, absolute return, CAGR, FIFO lots, capital gains (FY 2026-27 rules),
// family-level returns and unused equity LTCG exemption. Dates are ISO strings (YYYY-MM-DD).
(function (root, f) { if (typeof module === "object" && module.exports) module.exports = f(); else root.WCalc = f(); })(this, function () {
  const DAY = 864e5, days = (a, b) => (Date.parse(b) - Date.parse(a)) / DAY;
  const RULES = { equityLTDays: 365, debtOldLTDays: 730, ltcgRate: 0.125, stcgRate: 0.20, exemption: 125000, grandfatherDate: "2018-01-31", grandfatherBefore: "2018-02-01", debtSlabFrom: "2023-04-01", fyStart: "2026-04-01", fyEnd: "2027-03-31" };

  // XIRR: cash flows [{date, amount}] (investments negative, value/redemptions positive). Returns annual rate or null.
  function xirr(cfs) {
    const f = cfs.filter((c) => Math.abs(c.amount) > 1e-9); if (f.length < 2) return null;
    if (!f.some((c) => c.amount < 0) || !f.some((c) => c.amount > 0)) return null;
    const d0 = f.reduce((m, c) => (c.date < m ? c.date : m), f[0].date), t = f.map((c) => days(d0, c.date) / 365);
    const npv = (r) => f.reduce((s, c, i) => s + c.amount / Math.pow(1 + r, t[i]), 0);
    let lo = -0.9999, hi = 10; let flo = npv(lo), fhi = npv(hi);
    if (flo * fhi > 0) { hi = 100; fhi = npv(hi); if (flo * fhi > 0) return null; }
    for (let k = 0; k < 200; k++) { const mid = (lo + hi) / 2, fm = npv(mid); if (Math.abs(fm) < 1e-7) return mid; if (flo * fm < 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; } }
    return (lo + hi) / 2;
  }
  const absReturn = (invested, value) => (invested > 0 ? value / invested - 1 : null);
  const cagr = (start, end, yrs) => (start > 0 && yrs > 0 ? Math.pow(end / start, 1 / yrs) - 1 : null);

  // FIFO lots from transactions [{date, type: buy|sell, units, nav}] -> open lots and realised matches
  function fifo(txs) {
    const lots = [], realised = [];
    for (const t of txs.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.type === "buy" ? -1 : 1))) {
      if (t.type === "buy") { lots.push({ date: t.date, units: t.units, nav: t.nav }); continue; }
      let left = t.units;
      while (left > 1e-9 && lots.length) { const l = lots[0], u = Math.min(left, l.units); realised.push({ buyDate: l.date, buyNav: l.nav, sellDate: t.date, sellNav: t.nav, units: u }); l.units -= u; left -= u; if (l.units <= 1e-9) lots.shift(); }
      if (left > 1e-6) realised.push({ buyDate: null, buyNav: null, sellDate: t.date, sellNav: t.nav, units: left, unmatched: true });
    }
    return { lots, realised };
  }
  // classify one realised match. kind: "equity" | "debt". fmv2018: NAV on 31 Jan 2018 (for grandfathering)
  function classify(m, kind, fmv2018) {
    const sale = m.units * m.sellNav; let cost = m.units * m.buyNav; const held = days(m.buyDate, m.sellDate);
    if (kind === "equity") {
      if (m.buyDate < RULES.grandfatherBefore && fmv2018 != null) cost = Math.max(cost, Math.min(m.units * fmv2018, sale));
      return { gain: sale - cost, bucket: held > RULES.equityLTDays ? "equityLT" : "equityST", held };
    }
    if (m.buyDate >= RULES.debtSlabFrom) return { gain: sale - cost, bucket: "slab", held };
    return { gain: sale - cost, bucket: held > RULES.debtOldLTDays ? "debtLT" : "slab", held };
  }
  // realised gains in a financial year for one holding
  function realisedInFY(txs, kind, fmv2018, fyStart = RULES.fyStart, fyEnd = RULES.fyEnd) {
    const { realised } = fifo(txs), out = { equityLT: 0, equityST: 0, debtLT: 0, slab: 0, unmatchedUnits: 0 };
    for (const m of realised) { if (m.sellDate < fyStart || m.sellDate > fyEnd) continue; if (m.unmatched) { out.unmatchedUnits += m.units; continue; } const c = classify(m, kind, fmv2018); out[c.bucket] += c.gain; }
    return out;
  }
  // unrealised long-term equity gain available today (for harvesting within the exemption)
  // lockDays: ELSS units are locked for 3 years and cannot be redeemed to book a gain
  function unrealisedEquityLT(txs, navNow, today, fmv2018, lockDays = 0) {
    const { lots } = fifo(txs); let g = 0;
    for (const l of lots) { const age = days(l.date, today); if (age <= RULES.equityLTDays || age < lockDays) continue; let cost = l.units * l.nav; const val = l.units * navNow; if (l.date < RULES.grandfatherBefore && fmv2018 != null) cost = Math.max(cost, Math.min(l.units * fmv2018, val)); g += val - cost; }
    return g;
  }
  // per member: unused exemption this FY, and how much of it could be used by booking existing long-term equity gains
  function exemptionRoom(realisedEquityLT, unrealisedLT) {
    const unused = Math.max(0, RULES.exemption - Math.max(0, realisedEquityLT)), harvestable = Math.max(0, Math.min(unused, unrealisedLT));
    return { unused, harvestable, futureTaxAvoided: harvestable * RULES.ltcgRate };
  }
  return { RULES, days, xirr, absReturn, cagr, fifo, classify, realisedInFY, unrealisedEquityLT, exemptionRoom };
});
