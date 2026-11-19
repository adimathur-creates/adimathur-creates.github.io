/* Simulates a year of inbound deals for one mid-market fund and compares three screening policies.
   Every rate below is an assumption, labelled, and changeable. */
(function (root, f) { if (typeof module === "object" && module.exports) module.exports = f(require("./engine.js")); else root.Sim = f(root.Screen); })(this, function (S) {
  "use strict";
  function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const pick = (r, arr, w) => { let x = r() * w.reduce((s, v) => s + v, 0); for (let i = 0; i < arr.length; i++) { x -= w[i]; if (x < 0) return arr[i]; } return arr[arr.length - 1]; };

  const ASSUME = {
    deals: 800,            // inbound deals a year. Mid-market funds review 500-1,000 (source on page).
    // Chance a teaser states each field. Assumption: teasers lead with sector/geo, often hold back the rest.
    disclose: { sector: 0.98, geo: 0.95, ebitda: 0.70, control: 0.55, margin: 0.60, growth: 0.65, topCustomer: 0.30 },
    bankerReplies: 0.75,   // share of banker questions answered within the window
    hours: { fullScreen: 5, ask: 0.15, review: 0.5, autoCheck: 0.05 }, // 4-6 h per CIM (source); rest assumed
    maxQuestions: 2
  };

  function makeDeal(r) {
    const sector = pick(r, ["Industrials", "Business services", "Healthcare services", "Consumer", "Software", "Financial services", "Energy"], [20, 18, 14, 16, 16, 8, 8]);
    const geo = pick(r, ["US", "Canada", "UK", "Europe", "India"], [70, 8, 8, 8, 6]);
    const ebitda = Math.exp(Math.log(1.5) + r() * (Math.log(60) - Math.log(1.5)));
    const margin = Math.max(0.01, Math.min(0.45, 0.04 + r() * 0.28));
    const growth = -0.08 + r() * 0.40;
    const control = r() < 0.75;
    const topCustomer = Math.min(0.7, 0.04 + Math.pow(r(), 2) * 0.55);
    return { sector, geo, ebitda, margin, growth, control, topCustomer };
  }
  function trulyFits(d, m) {
    return S.GATES.every(g => g.test(d[g.k], Object.assign({}, S.DEFAULT_MANDATE, m || {})));
  }
  function teaserOf(d, r, a) {
    const t = {}; for (const g of S.GATES) t[g.k] = r() < a.disclose[g.k] ? d[g.k] : null; return t;
  }

  function run(opts) {
    const a = Object.assign({}, ASSUME, opts || {}); a.disclose = Object.assign({}, ASSUME.disclose, (opts && opts.disclose) || {}); a.hours = Object.assign({}, ASSUME.hours, (opts && opts.hours) || {});
    const r = rng(a.seed || 2026);
    const deals = []; for (let i = 0; i < a.deals; i++) { const d = makeDeal(r); deals.push({ d, t: teaserOf(d, r, a), fit: trulyFits(d, a.mandate), replyDraws: [r(), r()] }); }
    const out = {};
    for (const policy of ["strict", "lenient", "ask"]) {
      let fitFound = 0, fitLost = 0, hours = 0, fullScreens = 0, wasted = 0, questions = 0, asked = 0, reviews = 0, unanswered = 0;
      for (const x of deals) {
        let res = S.screen(x.t, a.mandate, policy, { maxQuestions: a.maxQuestions });
        hours += a.hours.autoCheck;
        if (res.verdict === "ASK") {
          asked++; const t2 = Object.assign({}, x.t);
          res.questions.forEach((q, i) => { questions++; hours += a.hours.ask; if (x.replyDraws[i] < a.bankerReplies) t2[q.k] = x.d[q.k]; });
          let res2 = S.screen(t2, a.mandate, "ask", { maxQuestions: a.maxQuestions });
          if (res2.verdict === "ASK") { // still unknown after the questions: a person decides with what they have
            unanswered++; hours += a.hours.review; res2 = S.screen(t2, a.mandate, "lenient");
          }
          res = res2;
        }
        if (res.verdict === "REVIEW") { reviews++; hours += a.hours.review; res = { verdict: x.fit ? "PASS" : "REJECT" }; }
        if (res.verdict === "PASS") { fullScreens++; hours += a.hours.fullScreen; if (x.fit) fitFound++; else wasted++; }
        else if (x.fit) fitLost++;
      }
      const fitTotal = fitFound + fitLost;
      out[policy] = { fitTotal, fitFound, fitLost, recall: fitTotal ? fitFound / fitTotal : 1, fullScreens, wasted, precision: fullScreens ? fitFound / fullScreens : 0, hours, questions, asked, reviews, unanswered, hoursPerFit: fitFound ? hours / fitFound : Infinity };
    }
    out.meta = { deals: a.deals, fitShare: deals.filter(x => x.fit).length / a.deals, assume: a };
    return out;
  }

  function sweep(field, values, opts) {
    return values.map(v => { const o = Object.assign({}, opts || {}); if (field === "bankerReplies") o.bankerReplies = v; else o.disclose = Object.assign({}, (opts && opts.disclose) || {}, { [field]: v }); const r = run(o); return { v, strict: r.strict.recall, lenient: r.lenient.recall, ask: r.ask.recall, askHours: r.ask.hours, lenHours: r.lenient.hours }; });
  }
  function seeds(n, opts) { const res = []; for (let s = 1; s <= n; s++) res.push(run(Object.assign({}, opts || {}, { seed: s }))); return res; }

  return { ASSUME, run, sweep, seeds, makeDeal, trulyFits, rng };
});
