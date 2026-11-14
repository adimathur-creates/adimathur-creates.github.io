/* MSME receivables thesis model. Plain JS, runs in Node and the browser.
   Every input is either sourced (see facts.js) or a labelled assumption the reader can change. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ThesisModel = factory();
})(this, function () {
  "use strict";

  // Fund lens. Fund II size and target ownership are public statements (facts.js: fund2, ownership).
  const FUND = { sizeUsdM: 50, exitOwnership: 0.10, fxInrPerUsd: 88 };

  // Scoring criteria. Weights are my judgement; the page lets the reader change them.
  const CRITERIA = [
    { id: "payer", label: "Payer has budget and urgency", weight: 20 },
    { id: "distribution", label: "Cheap, repeatable distribution", weight: 15 },
    { id: "tailwind", label: "2026 regulatory tailwind", weight: 10 },
    { id: "moat", label: "Gets harder to copy over time", weight: 15 },
    { id: "capital", label: "Capital-light", weight: 10 },
    { id: "whitespace", label: "Room vs. funded incumbents", weight: 10 },
    { id: "fund", label: "Fund-return math (computed)", weight: 15 },
    { id: "portfolio", label: "Fits 8i portfolio, no conflict", weight: 5 }
  ];

  // Revenue at maturity = units x price, in Rs crore per year. All defaults are assumptions.
  const ARCHETYPES = [
    { id: "supplier", name: "Supplier collections copilot", short: "Supplier copilot",
      what: "Helps a small supplier chase, document and escalate its own unpaid invoices. This is what Recourse is.",
      payer: "The supplier (micro or small business)",
      inputs: [
        { k: "reach", label: "Reachable suppliers (B2B, GST, sell on credit)", v: 1000000, unit: "businesses", why: "Assumption. Udyam has 7+ crore registrations but most are tiny or sell for cash. 10 lakh is about 1.4% of that." },
        { k: "share", label: "Share won at maturity", v: 0.05, unit: "share", why: "Assumption. 5% of the reachable pool is a strong SMB SaaS outcome in India." },
        { k: "price", label: "Price per year (Rs)", v: 12000, unit: "Rs", why: "Recourse's own planned price: Rs 999 a month." }
      ],
      revenue: (i) => i.reach * i.share * i.price / 1e7,
      multiple: 6,
      scores: { payer: 2, distribution: 2, tailwind: 3, moat: 2, capital: 5, whitespace: 2, portfolio: 2 },
      notes: { payer: "Micro suppliers have the pain but little budget.", distribution: "CA partners help, but support time per customer is the real cost.", whitespace: "Accounting tools and payment links already send reminders.", portfolio: "Overlaps with Easebuzz EasyCollect reminders. A conflict for 8i." } },
    { id: "buyer", name: "Buyer-side MSME payables compliance", short: "Buyer compliance",
      what: "Tells a large buyer which vendors are micro or small, when each invoice must be paid, what it costs to be late, and routes the payment on time or through TReDS.",
      payer: "The buyer's finance team (CFO, controller)",
      inputs: [
        { k: "reach", label: "Buyers with formal MSME procurement", v: 25000, unit: "companies", why: "Assumption. Companies above Rs 250 crore turnover must be on TReDS, plus mid-market buyers. I found no public count. Change it." },
        { k: "share", label: "Share won at maturity", v: 0.15, unit: "share", why: "Assumption. Compliance software can win high share when a penalty is at stake." },
        { k: "price", label: "Price per year (Rs)", v: 500000, unit: "Rs", why: "Assumption. About Rs 42,000 a month, small next to the tax deduction at risk." }
      ],
      revenue: (i) => i.reach * i.share * i.price / 1e7,
      multiple: 8,
      scores: { payer: 4, distribution: 3, tailwind: 5, moat: 3, capital: 4, whitespace: 3, portfolio: 4 },
      notes: { payer: "Late payment now costs the buyer a tax deduction (43B(h)) and disclosure penalties up to Rs 1 lakh (2026 amendment).", distribution: "Enterprise sales, but auditors and CAs already check these dues.", whitespace: "AP automation and ERPs cover parts of it.", portfolio: "Can run on TransBnk-style bank rails." } },
    { id: "claim", name: "Claim-to-cash", short: "Claim-to-cash",
      what: "Turns an unpaid invoice into a filing-ready claim, runs it through the ODR portal, and pays the supplier early against a strong claim.",
      payer: "Success fee from recovered money, plus a finance margin",
      inputs: [
        { k: "stock", label: "Delayed dues outstanding (Rs crore)", v: 810000, unit: "Rs cr", why: "Economic Survey 2025-26: about Rs 8.1 lakh crore." },
        { k: "pursued", label: "Share of that pursued as formal claims each year", v: 0.04, unit: "share", why: "Assumption. Today it is about 0.8% a year (Rs 55,244 crore filed over about 8.7 years). 4% assumes a 5x lift." },
        { k: "share", label: "Share of formal claims this company handles", v: 0.10, unit: "share", why: "Assumption." },
        { k: "take", label: "Revenue per Rs of claim (fee + finance margin)", v: 0.032, unit: "share", why: "Assumption. 2% service fee, plus a 4% net spread on the 30% of claims financed." }
      ],
      revenue: (i) => i.stock * i.pursued * i.share * i.take,
      multiple: 5,
      scores: { payer: 3, distribution: 3, tailwind: 5, moat: 3, capital: 2, whitespace: 4, portfolio: 4 },
      notes: { payer: "Pays on success, so the supplier risks nothing up front.", tailwind: "90-day mediation, 75% pre-deposit to appeal, awards enforceable under IBC, ODR portal mandatory.", capital: "Financing claims needs a balance sheet or lending partners.", whitespace: "General ODR platforms exist; nobody owns the supplier's evidence-to-award flow.", portfolio: "Jurisphere (legal AI) and TransBnk (escrow) are natural partners." } },
    { id: "finance", name: "Receivables finance beyond TReDS", short: "Finance beyond TReDS",
      what: "Early payment on invoices TReDS does not reach: buyers below Rs 250 crore, small-to-small trade, invoices not yet accepted.",
      payer: "Financiers pay a share of the spread",
      inputs: [
        { k: "volume", label: "Invoices financed per year at maturity (Rs crore)", v: 30000, unit: "Rs cr", why: "Assumption. About 9% of TReDS volume in FY26 (Rs 3.47 lakh crore)." },
        { k: "take", label: "Platform take rate", v: 0.008, unit: "share", why: "Assumption. 0.8% of financed value." }
      ],
      revenue: (i) => i.volume * i.take,
      multiple: 4,
      scores: { payer: 4, distribution: 3, tailwind: 4, moat: 3, capital: 2, whitespace: 2, portfolio: 3 },
      notes: { whitespace: "KredX, Vayana, CashFlo, M1xchange's small-to-small product and banks are already here.", tailwind: "The new credit guarantee cover helps TReDS itself, which is a competitor." } },
    { id: "bureau", name: "B2B payment-behaviour bureau", short: "Payment bureau",
      what: "A shared record of which buyers pay late, sold to suppliers before they extend credit and to lenders.",
      payer: "Suppliers (reports) and lenders (data)",
      inputs: [
        { k: "subs", label: "Paying businesses", v: 50000, unit: "businesses", why: "Assumption." },
        { k: "price", label: "Price per year (Rs)", v: 12000, unit: "Rs", why: "Assumption." },
        { k: "lender", label: "Lender data revenue (Rs crore a year)", v: 30, unit: "Rs cr", why: "Assumption." }
      ],
      revenue: (i) => i.subs * i.price / 1e7 + i.lender,
      multiple: 7,
      scores: { payer: 3, distribution: 2, tailwind: 3, moat: 5, capital: 4, whitespace: 3, portfolio: 3 },
      notes: { distribution: "Classic cold start: no data, no buyers; no buyers, no data.", moat: "If it works, the data network is very hard to copy." } },
    { id: "platform", name: "Buyer-led working-capital platform", short: "Buyer-led platform",
      what: "Starts as buyer compliance (shape 2), then finances the same invoices early (shape 4) because it already sees them, approved, inside the buyer.",
      payer: "Buyer subscription plus financing spread",
      inputs: [
        { k: "reach", label: "Buyers with formal MSME procurement", v: 25000, unit: "companies", why: "Same assumption as shape 2." },
        { k: "share", label: "Share won at maturity", v: 0.15, unit: "share", why: "Same as shape 2." },
        { k: "price", label: "Price per year (Rs)", v: 500000, unit: "Rs", why: "Same as shape 2." },
        { k: "volume", label: "Invoices financed per year (Rs crore)", v: 30000, unit: "Rs cr", why: "Same as shape 4, reached through its own buyers." },
        { k: "take", label: "Take rate on financed value", v: 0.008, unit: "share", why: "Same as shape 4." }
      ],
      revenue: (i) => i.reach * i.share * i.price / 1e7 + i.volume * i.take,
      multiple: 6,
      scores: { payer: 4, distribution: 3, tailwind: 5, moat: 4, capital: 3, whitespace: 3, portfolio: 4 },
      notes: { moat: "Sees approved invoices before anyone else, which is the best data a lender can have.", capital: "Can start with lending partners and add a balance sheet later." } }
  ];

  function inputsOf(a, overrides) {
    const o = {}; a.inputs.forEach((x) => { o[x.k] = x.v; });
    return Object.assign(o, (overrides && overrides[a.id]) || {});
  }
  function revenueCr(a, overrides) { return a.revenue(inputsOf(a, overrides)); }
  function exitValueCr(a, overrides, multiples) {
    const m = (multiples && multiples[a.id]) || a.multiple;
    return revenueCr(a, overrides) * m;
  }
  // Share of the whole fund returned by this one company: exit value x ownership / fund.
  function fundMultiple(a, fund, overrides, multiples) {
    const f = Object.assign({}, FUND, fund || {});
    const exitUsdM = exitValueCr(a, overrides, multiples) * 1e7 / f.fxInrPerUsd / 1e6;
    return exitUsdM * f.exitOwnership / f.sizeUsdM;
  }
  function requiredExitCr(fund) {
    const f = Object.assign({}, FUND, fund || {});
    return f.sizeUsdM / f.exitOwnership * 1e6 * f.fxInrPerUsd / 1e7;
  }
  // 0x -> 1, 1x or more -> 5, linear between.
  function fundScore(mult) { return Math.max(1, Math.min(5, 1 + 4 * mult)); }
  function weightedScore(a, weights, fund, overrides, multiples) {
    const w = weights || Object.fromEntries(CRITERIA.map((c) => [c.id, c.weight]));
    const total = Object.values(w).reduce((s, x) => s + x, 0) || 1;
    let s = 0;
    CRITERIA.forEach((c) => {
      const v = c.id === "fund" ? fundScore(fundMultiple(a, fund, overrides, multiples)) : a.scores[c.id];
      s += v * (w[c.id] || 0);
    });
    return s / total; // 1..5
  }
  function rank(weights, fund, overrides, multiples) {
    return ARCHETYPES.map((a) => ({
      id: a.id, name: a.name, short: a.short,
      revenueCr: revenueCr(a, overrides),
      exitCr: exitValueCr(a, overrides, multiples),
      fundMultiple: fundMultiple(a, fund, overrides, multiples),
      score: weightedScore(a, weights, fund, overrides, multiples)
    })).sort((x, y) => y.score - x.score);
  }

  const SCENARIOS = {
    bear: { label: "Bear", overrides: { supplier: { share: 0.02 }, buyer: { share: 0.08, price: 300000 }, claim: { pursued: 0.015 }, finance: { volume: 12000, take: 0.006 }, bureau: { subs: 20000, lender: 10 }, platform: { share: 0.08, price: 300000, volume: 12000, take: 0.006 } }, fund: { exitOwnership: 0.08 } },
    base: { label: "Base", overrides: {}, fund: {} },
    bull: { label: "Bull", overrides: { supplier: { share: 0.08 }, buyer: { share: 0.25, price: 700000 }, claim: { pursued: 0.08, share: 0.15 }, finance: { volume: 60000, take: 0.01 }, bureau: { subs: 100000, lender: 60 }, platform: { share: 0.25, price: 700000, volume: 60000, take: 0.01 } }, fund: { exitOwnership: 0.15 } }
  };

  // Value one input must reach (others fixed) for this company alone to return the fund.
  function breakEven(a, key, fund, overrides, multiples) {
    const base = inputsOf(a, overrides);
    const f = (x) => fundMultiple(a, fund, Object.assign({}, overrides, { [a.id]: Object.assign({}, base, { [key]: x }) }), multiples) - 1;
    let lo = 0, hi = Math.max(base[key], 1e-9);
    let n = 0; while (f(hi) < 0 && n++ < 80) hi *= 2;
    if (f(hi) < 0) return null;
    for (let i = 0; i < 100; i++) { const mid = (lo + hi) / 2; if (f(mid) < 0) lo = mid; else hi = mid; }
    return hi;
  }

  return { FUND, CRITERIA, breakEven, ARCHETYPES, SCENARIOS, inputsOf, revenueCr, exitValueCr, fundMultiple, requiredExitCr, fundScore, weightedScore, rank };
});
