// Six monthly rebuilds. Compares override memory keyed to the golden-record ID (lost when clusters are rebuilt)
// with memory keyed to source-record IDs and versions (kept until a record materially changes).
(function (root, f) { if (typeof module === "object" && module.exports) module.exports = f(require("./data.js"), require("./match.js"), require("./resolve.js")); else root.ERGovern = f(root.ERData, root.ERMatch, root.ERResolve); })(this, function (D, M, R) {
  const ASSUME = { months: 6, changeShare: 0.05, challengeCatch: 0.5 };
  function mutate(records, r, share) { // a share of records change each month (renames, re-keyed names, address updates)
    return records.map((x) => { if (r() >= share) return x; const y = Object.assign({}, x, { addr: Object.assign({}, x.addr), v: (x.v || 0) + 1 });
      const k = r(); if (k < 0.4) y.name = y.name === y.name.toUpperCase() ? y.name.replace(/\B\w+/g, (w) => w.toLowerCase()) : y.name.toUpperCase(); else if (k < 0.7) y.addr.postcode = y.addr.postcode ? null : y.addr.postcode; else y.asOf += 30; return y; });
  }
  function simulate(opts) {
    const o = Object.assign({ seed: 7 }, ASSUME, R.ASSUME, opts || {}), data = D.generate({ seed: o.seed }), r = D.rng(o.seed * 97 + 1);
    const modes = { amnesia: null, persistent: { decisions: new Map(), splits: new Map() } }, out = { amnesia: [], persistent: [] };
    let records = data.records; const everSplit = { amnesia: new Set(), persistent: new Set() };
    for (let m = 1; m <= o.months; m++) {
      if (m > 1) records = mutate(records, r, o.changeShare);
      const built = R.build(records); built.P.__ent = data.byId;
      const seedR = D.rng(o.seed * 1000 + m); // same reviewer randomness for both modes within a month
      for (const mode of ["amnesia", "persistent"]) {
        const mem = modes[mode], rr = D.rng(o.seed * 1000 + m);
        let G = R.governedResolve(built.P, built.pairs, o, mem, rr);
        // downstream users (bankers, KYC) catch some wrongly merged profiles each month; analysts split them
        const groups = {}; built.P.forEach((x, i) => (groups[G.label[i]] = groups[G.label[i]] || []).push(i));
        let caught = 0, reverted = 0; const splits = [];
        const cr = D.rng(o.seed * 7919 + m);
        Object.values(groups).forEach((g) => { const ents = [...new Set(g.map((i) => built.P[i].truth))]; if (ents.length < 2) return;
          const sig = ents.slice().sort().join("+"); if (everSplit[mode].has(sig)) reverted++;
          if (cr() < o.challengeCatch) { caught++; everSplit[mode].add(sig); for (const i of g) for (const j of g) if (i < j && built.P[i].truth !== built.P[j].truth) splits.push([i, j]); } });
        if (mem) splits.forEach(([i, j]) => { const a = built.P[i], b = built.P[j]; mem.splits.set(a.rid + "|" + b.rid, { a: a.rid, b: b.rid, va: a.v || 0, vb: b.v || 0 }); });
        // apply this month's fixes to this month's view
        const label = R.cluster(built.P.length, G.edges, G.cannot.concat(splits), true).label;
        const ev = R.evaluate(built.P, label, G.review.length);
        out[mode].push({ month: m, reviewTasks: G.review.length, reused: G.reused, reverify: G.reverify, challenges: caught, reverted, overMergedEnd: ev.overMerged, overMergedStart: R.evaluate(built.P, G.label).overMerged, precision: ev.precision, recall: ev.recall });
      }
    }
    const tot = (mode, k) => out[mode].reduce((s, x) => s + x[k], 0);
    out.totals = {}; for (const mode of ["amnesia", "persistent"]) out.totals[mode] = { reviewTasks: tot(mode, "reviewTasks"), challenges: tot(mode, "challenges"), reverted: tot(mode, "reverted"), reviewHours: (tot(mode, "reviewTasks") * o.reviewMinutes) / 60 };
    return out;
  }
  return { ASSUME, simulate, mutate };
});
