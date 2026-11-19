/* Deal screening decision layer. Takes fields already extracted from a teaser/CIM
   (each value may be missing) and a fund mandate, and returns a verdict:
   PASS, REJECT, or ASK (one or two specific questions to the banker before deciding).
   Deterministic: same inputs, same verdict, every reason traceable to a field. */
(function (root, f) { if (typeof module === "object" && module.exports) module.exports = f(); else root.Screen = f(); })(this, function () {
  "use strict";

  const DEFAULT_MANDATE = {
    name: "Example US mid-market buyout fund",
    sectors: ["Industrials", "Business services", "Healthcare services"],
    geos: ["US", "Canada"],
    ebitdaMin: 5, ebitdaMax: 25,          // $M
    marginMin: 0.10,                      // EBITDA margin
    growthMin: 0.05,                      // revenue growth, last year
    controlOnly: true,                    // needs a majority stake
    topCustomerMax: 0.25,                 // largest customer share of revenue
    nearMiss: { ebitdaBelow: 0.15, growthAtLeast: 0.15 } // a small-but-fast-growing deal gets a human look
  };

  // Gates decide the verdict. Order = order checked.
  const GATES = [
    { k: "sector", label: "Sector", q: "Which sector is the company in?" ,
      test: (v, m) => m.sectors.includes(v), show: (v) => v },
    { k: "geo", label: "Geography", q: "Where are the company's main operations?",
      test: (v, m) => m.geos.includes(v), show: (v) => v },
    { k: "ebitda", label: "EBITDA ($M)", q: "What was adjusted EBITDA for the last full year?",
      test: (v, m) => v >= m.ebitdaMin && v <= m.ebitdaMax, show: (v) => "$" + v.toFixed(1) + "M" },
    { k: "control", label: "Stake offered", q: "Is a majority (control) stake available?",
      test: (v, m) => !m.controlOnly || v === true, show: (v) => v ? "Majority" : "Minority" },
    { k: "margin", label: "EBITDA margin", q: "What is the EBITDA margin?",
      test: (v, m) => v >= m.marginMin, show: (v) => (v * 100).toFixed(0) + "%" },
    { k: "growth", label: "Revenue growth", q: "What was revenue growth last year?",
      test: (v, m) => v >= m.growthMin, show: (v) => (v * 100).toFixed(0) + "%" },
    { k: "topCustomer", label: "Largest customer", q: "What share of revenue comes from the largest customer?",
      test: (v, m) => v <= m.topCustomerMax, show: (v) => (v * 100).toFixed(0) + "% of revenue" }
  ];

  const HARD = ["sector", "geo", "ebitda", "control"]; // deal-breakers; the rest are quality screens

  // How often each gate fails across a typical inbound pipeline (from the simulation's priors).
  // Used to order questions: ask first what is most likely to settle the deal fast.
  const FAIL_PRIOR = { sector: 0.45, geo: 0.2, ebitda: 0.55, control: 0.25, margin: 0.2, growth: 0.25, topCustomer: 0.15 };

  const has = (v) => v !== null && v !== undefined && !(typeof v === "number" && isNaN(v));

  function nearMiss(d, m) {
    return has(d.ebitda) && has(d.growth) && d.ebitda < m.ebitdaMin && d.ebitda >= m.ebitdaMin * (1 - m.nearMiss.ebitdaBelow) && d.growth >= m.nearMiss.growthAtLeast;
  }

  /* policy: "strict"  forced yes/no: a missing deal-breaker = reject, a missing quality screen = ignored
             "lenient" missing = pass
             "ask"     missing = ask the banker, ranked by how likely the answer settles it  */
  function screen(d, mandate, policy, opts) {
    const m = Object.assign({}, DEFAULT_MANDATE, mandate || {});
    const maxQ = (opts && opts.maxQuestions) || 2;
    const rows = [], missing = [];
    let failed = null;
    for (const g of GATES) {
      const v = d[g.k];
      if (!has(v)) { rows.push({ k: g.k, label: g.label, status: "missing", text: "Not in the teaser" }); missing.push(g); continue; }
      const ok = g.test(v, m);
      const src = d.src && d.src[g.k];
      rows.push({ k: g.k, label: g.label, status: ok ? "pass" : "fail", text: g.show(v), src });
      if (!ok && !failed) failed = g;
    }
    if (failed) {
      if (policy === "ask" && failed.k === "ebitda" && nearMiss(d, m))
        return { verdict: "REVIEW", reason: "Near miss: EBITDA just under the floor, but growing " + (d.growth * 100).toFixed(0) + "% a year. Worth a 30-minute human look.", rows, questions: [] };
      return { verdict: "REJECT", reason: failed.label + " is outside the mandate (" + rows.find(r => r.k === failed.k).text + ").", rows, questions: [] };
    }
    if (!missing.length) return { verdict: "PASS", reason: "Every criterion is stated and inside the mandate.", rows, questions: [] };
    if (policy === "strict") { // forced yes/no: a missing deal-breaker counts against the deal, a missing nice-to-have is ignored
      const hardMissing = missing.filter(g => HARD.includes(g.k));
      if (hardMissing.length) return { verdict: "REJECT", reason: "Cannot confirm " + hardMissing.map(g => g.label).join(", ") + ", so the forced verdict is no.", rows, questions: [] };
      return { verdict: "PASS", reason: "All deal-breakers fit; " + missing.length + " other criteria unknown.", rows, questions: [] };
    }
    if (policy === "lenient") return { verdict: "PASS", reason: "Nothing stated is outside the mandate; " + missing.length + " criteria unknown.", rows, questions: [] };
    const ranked = missing.slice().sort((a, b) => FAIL_PRIOR[b.k] - FAIL_PRIOR[a.k]);
    const questions = ranked.slice(0, maxQ).map(g => ({ k: g.k, q: g.q }));
    return { verdict: "ASK", reason: "Everything stated fits. " + missing.length + " criteria are not in the teaser.", rows, questions, unasked: ranked.slice(maxQ).map(g => g.k) };
  }

  return { DEFAULT_MANDATE, GATES, HARD, FAIL_PRIOR, screen, nearMiss, has };
});
