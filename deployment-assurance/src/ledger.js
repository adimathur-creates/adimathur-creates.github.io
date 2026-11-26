// Is the value real? A lead re-engagement agent, measured three ways. Illustrative numbers, labelled assumptions.
(function (root, f) { if (typeof module === "object" && module.exports) module.exports = f(require("./sim.js")); else root.DALedger = f(root.DASim); })(this, function (S) {
  const ASSUME = { days: 120, launch: 30, leadsPerDay: 3000, baseReturn: 0.04, festive: [55, 85], festiveLift: 0.4, priceChangeDay: 70, priceLift: 0.006, agentLift: 0.02, valuePerLead: 1500, holdout: 0.05 };
  function rate(o, t) { let b = o.baseReturn; if (t >= o.festive[0] && t < o.festive[1]) b *= 1 + o.festiveLift; if (t >= o.priceChangeDay) b += o.priceLift; return b; }
  function run(opts) {
    const o = Object.assign({ seed: 7 }, ASSUME, opts || {}), r = S.rng(o.seed);
    let pre = [0, 0], postT = [0, 0], postH = [0, 0], trueInc = 0;
    for (let t = 0; t < o.days; t++) {
      const n = o.leadsPerDay, b = rate(o, t);
      if (t < o.launch) { pre[0] += S.binom(r, n, b); pre[1] += n; continue; }
      const nh = Math.round(n * o.holdout), nt = n - nh;
      postT[0] += S.binom(r, nt, Math.min(1, b + o.agentLift)); postT[1] += nt; postH[0] += S.binom(r, nh, b); postH[1] += nh; trueInc += nt * o.agentLift;
    }
    const postDays = o.days - o.launch, perMonth = (x) => (x / postDays) * 30 * o.valuePerLead;
    const pT = postT[0] / postT[1], pH = postH[0] / postH[1], pPre = pre[0] / pre[1];
    const se = Math.sqrt((pT * (1 - pT)) / postT[1] + (pH * (1 - pH)) / Math.max(1, postH[1]));
    return {
      truth: perMonth(trueInc),
      creditAll: perMonth(postT[0]), // every lead that came back is credited to the agent
      beforeAfter: perMonth((pT - pPre) * postT[1]), // post-launch return rate minus pre-launch rate
      holdout: perMonth((pT - pH) * postT[1]), holdoutCI: perMonth(1.96 * se * postT[1]),
      holdoutCost: perMonth(Math.round(o.leadsPerDay * o.holdout) * postDays * o.agentLift), // leads the holdout did not get help for
      rates: { pre: pPre, treated: pT, holdout: pH },
    };
  }
  function holdoutTable(shares, reps) {
    return shares.map((h) => { const rs = Array.from({ length: reps }, (_, i) => run({ holdout: h, seed: 500 + i })); const m = (k) => rs.reduce((s, x) => s + x[k], 0) / rs.length;
      const cover = rs.filter((x) => Math.abs(x.holdout - x.truth) <= x.holdoutCI).length / rs.length; return { h, truth: m("truth"), est: m("holdout"), ci: m("holdoutCI"), cost: m("holdoutCost"), cover }; });
  }
  return { ASSUME, run, holdoutTable, rate };
});
