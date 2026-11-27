// Synthetic family book: monthly NAVs, SIPs, lump sums, redemptions, switches, and the data problems real reporting meets.
// Every rate is a labelled assumption.
(function (root, f) { if (typeof module === "object" && module.exports) module.exports = f(require("./calc.js")); else root.WBook = f(root.WCalc); })(this, function (C) {
  function rng(seed) { let a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const TODAY = "2026-11-01";
  const months = []; for (let y = 2016, m = 1; y < 2026 || (y === 2026 && m <= 11); m++) { if (m > 12) { m = 1; y++; } months.push(`${y}-${String(m).padStart(2, "0")}-01`); }
  const FUNDS = [
    ["Flexi Cap Fund", "equity", 0.011, 0.05], ["Large Cap Index Fund", "equity", 0.010, 0.045], ["Mid Cap Fund", "equity", 0.013, 0.065], ["Small Cap Fund", "equity", 0.014, 0.08],
    ["ELSS Tax Saver", "equity", 0.011, 0.055], ["Aggressive Hybrid", "equity", 0.009, 0.035], ["Short Duration Debt", "debt", 0.0055, 0.004], ["Liquid Fund", "debt", 0.0052, 0.001]];
  const ASSUME = { // calibrated so the average member holds about Rs 5 lakh, near Wealthy's ~Rs 5,000 Cr across 1 lakh+ clients
  families: 2000, externalShare: 0.15, switchShare: 0.12, switchLinkLost: 0.7, syncLagShare: 0.05, redeemFY: 0.12, recency: 2 };
  function navs(r) { const out = {}; FUNDS.forEach(([name, kind, mu, sd], i) => { let v = 10 + i * 5; const s = {}; for (const d of months) { s[d] = v; const z = Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r()); v = Math.max(1, v * (1 + mu + sd * z)); } out[name] = { kind, nav: s }; }); return out; }
  function generate(opts) {
    const o = Object.assign({ seed: 7 }, ASSUME, opts || {}), r = rng(o.seed), N = navs(r), fams = [];
    const pick = (a) => a[Math.floor(r() * a.length)], idx = (d) => months.indexOf(d);
    for (let f = 0; f < o.families; f++) {
      const nm = 1 + (r() < 0.45 ? 0 : r() < 0.6 ? 1 : r() < 0.7 ? 2 : 3), members = [];
      for (let k = 0; k < nm; k++) {
        const holdings = [], nh = 1 + Math.floor(r() * 3);
        for (let h = 0; h < nh; h++) {
          const fund = r() < 0.8 ? pick(FUNDS.slice(0, 6))[0] : pick(FUNDS.slice(6))[0], F = N[fund];
          const start = Math.min(months.length - 2, Math.floor((months.length - 1) * (1 - Math.pow(r(), o.recency)))), sip = r() < 0.8 ? 500 * (2 + Math.floor(r() * 19)) : 0, stop = r() < 0.3 ? start + Math.floor(r() * (months.length - start)) : months.length;
          const txs = [];
          if (sip === 0 || r() < 0.3) { const amt = 5000 * (5 + Math.floor(r() * 56)); txs.push({ date: months[start], type: "buy", units: amt / F.nav[months[start]], nav: F.nav[months[start]], amount: amt }); }
          if (sip) for (let i = start; i < Math.max(start + 1, Math.min(stop, months.length)); i++) txs.push({ date: months[i], type: "buy", units: sip / F.nav[months[i]], nav: F.nav[months[i]], amount: sip });
          // redemptions: some in this FY (Apr–Oct 2026), some earlier
          const held = () => txs.reduce((s, t) => s + (t.type === "buy" ? t.units : -t.units), 0);
          if (r() < 0.15 && start < months.length - 30) { const d = months[start + 12 + Math.floor(r() * (months.length - start - 20))]; const u = held() * (0.2 + 0.3 * r()); if (u > 0) txs.push({ date: d, type: "sell", units: u, nav: F.nav[d], amount: u * F.nav[d] }); }
          if (r() < o.redeemFY && idx("2026-04-01") > start) { const d = months[idx("2026-04-01") + Math.floor(r() * 7)]; const u = txs.filter((t) => t.date < d).reduce((s, t) => s + (t.type === "buy" ? t.units : -t.units), 0) * (0.2 + 0.4 * r()); if (u > 0) txs.push({ date: d, type: "sell", units: u, nav: F.nav[d], amount: u * F.nav[d] }); }
          holdings.push({ id: `F${f}M${k}H${h}`, fund, kind: F.kind, txs, external: false, syncLag: false });
        }
        members.push({ name: ["Self", "Spouse", "Parent", "Child"][k], holdings });
      }
      // switch: move one equity holding fully into another fund on a date (sell + buy same day)
      if (r() < o.switchShare) { const m = pick(members), h = m.holdings.find((x) => x.kind === "equity" && x.txs.length && x.txs[0].date < "2024-01-01");
        if (h) { const d = pick(months.slice(idx("2024-06-01"), idx("2026-10-01"))), u = h.txs.filter((t) => t.date <= d).reduce((s, t) => s + (t.type === "buy" ? t.units : -t.units), 0);
          if (u > 0) { const amt = u * N[h.fund].nav[d]; h.txs = h.txs.filter((t) => t.date <= d); h.txs.push({ date: d, type: "sell", units: u, nav: N[h.fund].nav[d], amount: amt, switchOut: true });
            const to = pick(FUNDS.slice(0, 6).filter((x) => x[0] !== h.fund))[0]; m.holdings.push({ id: h.id + "S", fund: to, kind: "equity", txs: [{ date: d, type: "buy", units: amt / N[to].nav[d], nav: N[to].nav[d], amount: amt, switchIn: true }], external: false, syncLag: false, linkLost: r() < o.switchLinkLost }); } } }
      // data problems
      for (const m of members) for (const h of m.holdings) { if (!h.txs.some((t) => t.switchIn) && r() < o.externalShare) h.external = true; else if (r() < o.syncLagShare && h.txs.length > 2 && h.txs[h.txs.length - 1].type === "buy") h.syncLag = true; }
      fams.push({ id: "FAM" + String(f + 1).padStart(4, "0"), members });
    }
    return { families: fams, navs: N, months, TODAY };
  }
  return { rng, FUNDS, ASSUME, TODAY, months, generate };
});
