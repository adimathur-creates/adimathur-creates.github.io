// Three reports from the same family book:
//  truth   - complete data, correct methods (the number the client should see)
//  shortcut- data as received + common shortcuts (what a quick report shows)
//  guarded - data as received + correct methods + checks that label or hold numbers it cannot stand behind
(function (root, f) { if (typeof module === "object" && module.exports) module.exports = f(require("./calc.js"), require("./book.js")); else root.WReport = f(root.WCalc, root.WBook); })(this, function (C, B) {
  const TOL = { pts: 0.01, value: 0.005, money: 0.01, taxRs: 500 };
  const BUCKETS = ["equityLT", "equityST", "debtLT", "slab"];
  const units = (txs) => txs.reduce((s, t) => s + (t.type === "buy" ? t.units : -t.units), 0);
  const cfOf = (t) => ({ date: t.date, amount: t.type === "buy" ? -t.amount : t.amount });
  const FMV = (book, fund) => book.navs[fund].nav["2018-02-01"];
  const median = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  // equity tax for one member: STCG 20%, LTCG 12.5% above the member's own Rs 1.25 lakh
  const equityTax = (g) => Math.max(0, g.equityST) * C.RULES.stcgRate + Math.max(0, g.equityLT - C.RULES.exemption) * C.RULES.ltcgRate;
  // shortcut capital gains: average cost, holding period counted from the first purchase, no grandfathering
  function shortcutGains(h) {
    const g = { equityLT: 0, equityST: 0, debtLT: 0, slab: 0 }; let u = 0, cost = 0; const first = h.txs[0].date;
    for (const t of h.txs.slice().sort((a, b) => (a.date < b.date ? -1 : 1))) {
      if (t.type === "buy") { u += t.units; cost += t.amount; continue; }
      const avg = u > 0 ? cost / u : 0, gain = t.units * (t.nav - avg); cost -= avg * t.units; u -= t.units;
      if (t.date < C.RULES.fyStart || t.date > C.RULES.fyEnd) continue;
      const held = C.days(first, t.date), b = h.kind === "equity" ? (held > 365 ? "equityLT" : "equityST") : first >= C.RULES.debtSlabFrom ? "slab" : held > 730 ? "debtLT" : "slab";
      g[b] += gain;
    }
    return g;
  }
  function holding(book, h, member) {
    const navNow = book.navs[h.fund].nav[book.TODAY], u = units(h.txs), value = u * navNow;
    const cfs = h.txs.map(cfOf).concat(value > 0.5 ? [{ date: book.TODAY, amount: value }] : []);
    const lots = C.fifo(h.txs).lots, cost = lots.reduce((s, l) => s + l.units * l.nav, 0);
    const age = lots.length ? C.days(lots[0].date, book.TODAY) : 0; // oldest money still invested
    const xr = C.xirr(cfs), ab = C.absReturn(cost, value);
    const truth = { value, cost, ret: age < 365 ? { kind: "Absolute", v: ab } : { kind: "XIRR", v: xr }, gains: C.realisedInFY(h.txs, h.kind, FMV(book, h.fund)), unrealLT: h.kind === "equity" ? C.unrealisedEquityLT(h.txs, navNow, book.TODAY, FMV(book, h.fund), /ELSS/.test(h.fund) ? 1095 : 0) : 0 };
    // shortcut: what arrives, simple methods
    let sc;
    if (h.external) sc = { value, cost: value, ret: { kind: "XIRR", v: 0 }, gains: { equityLT: 0, equityST: 0, debtLT: 0, slab: 0 }, cfs: [] };
    else { const tx = h.syncLag ? h.txs.slice(0, -1) : h.txs, v = units(tx) * navNow, c = tx.map(cfOf).concat(v > 0.5 ? [{ date: book.TODAY, amount: v }] : []);
      sc = { value: v, cost: C.fifo(tx).lots.reduce((s, l) => s + l.units * l.nav, 0), ret: { kind: "XIRR", v: C.xirr(c) }, gains: shortcutGains({ ...h, txs: tx }), cfs: c }; }
    // guarded: units reconciled with the registrar (value right), correct methods, hold what it cannot know
    let gd;
    if (h.external) gd = { value, cost: null, ret: null, gains: null, flag: "Bought outside Wealthy: cost unknown. Import a detailed CAS to show return and tax." };
    else if (h.syncLag) gd = { value, cost: null, ret: null, gains: null, flag: "Units match the registrar but one transaction is still syncing. Return and tax shown after sync." };
    else gd = { value, cost, ret: truth.ret, gains: truth.gains, flag: null };
    return { id: h.id, member, fund: h.fund, kind: h.kind, age, external: h.external, syncLag: h.syncLag, switchIn: h.txs.some((t) => t.switchIn), cfs, truth, sc, gd,
      moneyIn: h.txs.filter((t) => t.type === "buy" && !t.switchIn).reduce((s, t) => s + t.amount, 0), scMoneyIn: h.external ? value : (h.syncLag ? h.txs.slice(0, -1) : h.txs).filter((t) => t.type === "buy" && (!t.switchIn || h.linkLost)).reduce((s, t) => s + t.amount, 0), redeemed: h.txs.filter((t) => t.type === "sell" && !t.switchOut).reduce((s, t) => s + t.amount, 0) };
  }
  const internal = (cfs) => { // drop switch pairs: same date, equal and opposite
    const out = cfs.slice(); for (let i = 0; i < out.length; i++) { if (!out[i]) continue; const j = out.findIndex((c, k) => k !== i && c && c.date === out[i].date && Math.abs(c.amount + out[i].amount) < 1e-6 && c.amount !== 0 && c.date !== null && !c.isValue && !out[i].isValue); if (j >= 0) { out[i] = null; out[j] = null; } } return out.filter(Boolean); };
  function family(book, fam) {
    const rows = [], members = [];
    for (const m of fam.members) { const hs = m.holdings.map((h) => holding(book, h, m.name)); rows.push(...hs);
      const g = { equityLT: 0, equityST: 0, debtLT: 0, slab: 0 }, sg = { equityLT: 0, equityST: 0, debtLT: 0, slab: 0 }; let unreal = 0;
      hs.forEach((r) => { BUCKETS.forEach((k) => { g[k] += r.truth.gains[k]; sg[k] += r.sc.gains[k]; }); unreal += r.truth.unrealLT; });
      const scCfs = hs.flatMap((r) => r.sc.cfs), scX = C.xirr(scCfs);
      members.push({ name: m.name, gains: g, scGains: sg, tax: equityTax(g), scTax: equityTax(sg), room: C.exemptionRoom(g.equityLT, unreal), value: hs.reduce((s, r) => s + r.truth.value, 0), scValue: hs.reduce((s, r) => s + r.sc.value, 0), scX,
        unknownCost: hs.some((r) => r.external && Object.values(r.truth.gains).some((v) => Math.abs(v) > 1)) }); }
    const valueCf = (v) => ({ date: book.TODAY, amount: v, isValue: true });
    const tagged = rows.flatMap((r) => r.cfs.map((c, i) => (i === r.cfs.length - 1 && c.date === book.TODAY && r.truth.value > 0.5 ? { ...c, isValue: true } : c)));
    const truthX = C.xirr(internal(tagged));
    const W = members.reduce((s, m) => s + (m.scX != null ? m.scValue : 0), 0), scFamX = W ? members.reduce((s, m) => s + (m.scX != null ? m.scX * m.scValue : 0), 0) / W : null;
    const known = rows.filter((r) => !r.gd.flag), gdX = C.xirr(internal(known.flatMap((r) => r.cfs.map((c, i) => (i === r.cfs.length - 1 && c.date === book.TODAY && r.truth.value > 0.5 ? { ...c, isValue: true } : c)))));
    const value = rows.reduce((s, r) => s + r.truth.value, 0), scValue = rows.reduce((s, r) => s + r.sc.value, 0), coverage = value ? known.reduce((s, r) => s + r.truth.value, 0) / value : 1;
    const moneyIn = rows.reduce((s, r) => s + r.moneyIn, 0), scMoneyIn = rows.reduce((s, r) => s + r.scMoneyIn, 0);
    // what went wrong in the shortcut report, with the size of each error
    const err = {};
    const shortH = rows.filter((r) => !r.external && !r.syncLag && r.age < 365 && r.truth.value > 1000 && r.sc.ret.v != null && Math.abs(r.sc.ret.v - r.truth.ret.v) > 0.03);
    if (shortH.length) err.annualised = Math.max(...shortH.map((r) => Math.abs(r.sc.ret.v - r.truth.ret.v)));
    if (members.length > 1 && truthX != null && scFamX != null && !rows.some((r) => r.external || r.syncLag) && Math.abs(scFamX - truthX) > TOL.pts) err.familyAvg = Math.abs(scFamX - truthX);
    if (rows.some((r) => r.switchIn) && (scMoneyIn - moneyIn) / moneyIn > TOL.money && !rows.some((r) => r.external)) err.switchDouble = (scMoneyIn - moneyIn) / moneyIn;
    const ext = rows.filter((r) => r.external && r.truth.value > 0); if (ext.length && ext.some((r) => Math.abs(r.truth.ret.v || 0) > TOL.pts)) err.externalZero = ext.reduce((s, r) => s + r.truth.value, 0) / value;
    if (rows.some((r) => r.syncLag) && (value - scValue) / value > TOL.value) err.syncLag = (value - scValue) / value;
    const taxGap = members.filter((m) => !m.unknownCost).reduce((s, m) => s + Math.abs(m.scTax - m.tax), 0), bucketMiss = members.some((m) => !m.unknownCost && (Math.abs(m.scGains.equityLT - m.gains.equityLT) > 1000 || Math.abs(m.scGains.equityST - m.gains.equityST) > 1000));
    if (taxGap > TOL.taxRs || bucketMiss) err.taxMethod = taxGap;
    if (members.some((m) => m.unknownCost)) err.taxUnknownCost = true;
    return { id: fam.id, rows, members, value, scValue, moneyIn, scMoneyIn, truthX, scFamX, gdX, coverage, err, flags: rows.filter((r) => r.gd.flag).length };
  }
  const LABEL = { annualised: "Under-a-year money shown as an annualised XIRR", familyAvg: "Family return averaged across members instead of pooled", switchDouble: "Switch counted as fresh money in 'Total invested'", externalZero: "Holding bought elsewhere shows 0% return (value used as cost)", syncLag: "Value too low: latest purchase not synced", taxMethod: "Tax estimate wrong: average cost, holding period from first buy, no grandfathering", taxUnknownCost: "Tax on a holding bought elsewhere shown as zero" };
  function run(opts) {
    const book = B.generate(opts), fams = book.families.map((f) => family(book, f)), n = fams.length, s = {};
    for (const k of Object.keys(LABEL)) { const hit = fams.filter((f) => f.err[k] != null); s[k] = { share: hit.length / n, median: median(hit.map((f) => (typeof f.err[k] === "number" ? f.err[k] : 0))) }; }
    const anyErr = fams.filter((f) => Object.keys(f.err).length).length / n, clean = fams.filter((f) => !f.flags).length / n;
    const memRooms = fams.flatMap((f) => f.members.map((m) => m.room)), harvest = memRooms.filter((r) => r.harvestable > 1000);
    return { book, fams, n, s, anyErr, clean, gdLabelled: 1 - clean, avgCoverage: fams.reduce((a, f) => a + f.coverage, 0) / n,
      members: memRooms.length, harvestShare: harvest.length / memRooms.length, harvestMedian: median(harvest.map((r) => r.harvestable)), avoidedMedian: median(harvest.map((r) => r.futureTaxAvoided)), avoidedTotal: memRooms.reduce((a, r) => a + r.futureTaxAvoided, 0) };
  }
  return { TOL, LABEL, BUCKETS, run, family, holding, equityTax, shortcutGains, internal, median };
});
