// What happens to a declined loan applicant over the next 26 weeks? Weekly agent simulation.
// Every share, probability and lift is a labelled assumption, not Moneyview data.
(function (root, f) { if (typeof module === "object" && module.exports) module.exports = f(); else root.NYSim = f(); })(this, function () {
  function rng(seed) { let a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  // decline reasons: share of declines, how it gets fixed, weekly fix chance unguided vs with a clear plan
  const REASONS = {
    overdue:     { label: "An overdue payment on another loan or card", share: 0.18, kind: "action", fixNaive: 0.012, fixPlan: 0.035, plan: "Clear the overdue amount; we re-check 30 days after it shows as paid on your report." },
    affordability:{ label: "Requested amount too high for income (EMIs vs income)", share: 0.22, kind: "amount", fixNaive: 0.006, fixPlan: 0.012, plan: "You may be eligible for a smaller amount today. Or close a small existing loan and re-check." },
    enquiries:   { label: "Too many recent loan applications elsewhere", share: 0.12, kind: "quiet", weeks: 12, plan: "Don't apply anywhere for 12 weeks; each application lowers your score. We'll check for you, without a hard enquiry." },
    thin:        { label: "Too little salary or credit history yet", share: 0.15, kind: "time", weeks: 13, plan: "Three more months of salary in one bank account usually changes this. We'll re-check then." },
    income:      { label: "Income couldn't be verified", share: 0.08, kind: "action", fixNaive: 0.03, fixPlan: 0.12, plan: "Verify income by sharing bank data through an account aggregator; takes two minutes." },
    policy:      { label: "Outside current lending policy (age, location, employer type)", share: 0.15, kind: "none", plan: "We can't lend to you right now. Here is what we can offer instead." },
    risk:        { label: "Overall credit profile, no single fix", share: 0.10, kind: "none", plan: "No single change will fix this soon. Keep payments on time; we'll re-check in 6 months." },
  };
  const ASSUME = {
    users: 60000, weeks: 26,
    blindReapply: 0.06, // weekly chance a user re-applies on hope once the 30-day block lifts (status quo)
    blindAfterPlan: 0.03, // same, once they have a clear plan and a check date
    approveIfFixed: 0.85, // a fixed applicant is approved by the model
    spiralAt: 3, churnAfterSpiral: 0.6, // after 3 declines, most users go to another (often costlier) lender
    counterOfferAccept: 0.45, counterEligible: 0.6, // affordability declines: 60% qualify for a smaller amount; 45% of those take it
    altUptake: 0.08, // policy declines who take an alternative product (e.g. a secured card)
    cosmeticShare: 0.2, // share of guided fixes that are temporary (e.g. utilisation drops then rises again)
    basePD: 0.035, pdFixed: 1.1, pdCosmetic: 2.0, pdCounter: 1.25, pdBlind: 1.0, // 12-month default rate of approvals, multiple of the approved base
    enquiryBlocksWeeks: 12,
  };
  const POLICIES = ["status_quo", "plan", "not_yet"];
  const NAMES = { status_quo: "Reason + \"reapply after 30 days\"", plan: "Reason + a specific plan", not_yet: "\"Not yet\": plan + soft pre-check + smaller-amount offer + alternatives" };

  function run(opts) {
    const o = Object.assign({ seed: 7, planLift: 1 }, ASSUME, opts || {}), out = {};
    const keys = Object.keys(REASONS), cum = []; let c = 0; for (const k of keys) { c += REASONS[k].share; cum.push([c, k]); }
    for (const pol of POLICIES) {
      const r = rng(o.seed * 101 + 7); // same users and same luck for every policy
      const m = { approved: 0, counter: 0, alt: 0, hardEnq: 0, declines: 0, spiral: 0, churned: 0, pdSum: 0, weeksToApprove: [], byReason: {} };
      for (const k of keys) m.byReason[k] = { n: 0, approved: 0 };
      for (let u = 0; u < o.users; u++) {
        const x = r(), reason = cum.find(([p]) => x <= p)[1], R = REASONS[reason]; m.byReason[reason].n++;
        let fixed = false, cosmetic = false, lastEnq = 0, declines = 1, done = false, churned = false;
        const guided = pol !== "status_quo";
        // smaller-amount offer at decline time
        if (pol === "not_yet" && R.kind === "amount" && r() < o.counterEligible && r() < o.counterOfferAccept) { m.approved++; m.counter++; m.pdSum += o.basePD * o.pdCounter; m.weeksToApprove.push(0); m.byReason[reason].approved++; continue; }
        if (pol === "not_yet" && R.kind === "none" && reason === "policy" && r() < o.altUptake) m.alt++;
        for (let w = 1; w <= o.weeks && !done && !churned; w++) {
          // fixing
          if (!fixed) {
            if (R.kind === "action" || R.kind === "amount") { const h = guided ? R.fixNaive + (R.fixPlan - R.fixNaive) * o.planLift : R.fixNaive; if (r() < h) { fixed = true; cosmetic = guided && r() < o.cosmeticShare; } }
            if (R.kind === "time" && w >= R.weeks) fixed = true;
            if (R.kind === "quiet" && w - lastEnq >= R.weeks) fixed = true;
          }
          // applying
          let apply = false;
          if (w >= 5) {
            if (pol === "status_quo") apply = r() < o.blindReapply;
            if (pol === "plan") apply = fixed ? r() < 0.5 : r() < o.blindAfterPlan;
            if (pol === "not_yet") apply = fixed && R.kind !== "none" ? r() < 0.6 : r() < o.blindAfterPlan * 0.5; // soft pre-check tells them when it's worth it
          }
          if (!apply) continue;
          m.hardEnq++; lastEnq = w;
          if (fixed && R.kind !== "none" && r() < o.approveIfFixed) { done = true; m.approved++; m.byReason[reason].approved++; m.weeksToApprove.push(w); m.pdSum += o.basePD * (cosmetic ? o.pdCosmetic : guided ? o.pdFixed : o.pdBlind); }
          else { if (R.kind === "quiet") fixed = false; declines++; m.declines++; if (declines >= o.spiralAt) { m.spiral++; if (r() < o.churnAfterSpiral) { churned = true; m.churned++; } } }
        }
      }
      m.users = o.users; m.approvalRate = m.approved / o.users; m.enqPerUser = m.hardEnq / o.users; m.spiralRate = m.spiral / o.users; m.churnRate = m.churned / o.users;
      m.pd = m.approved ? m.pdSum / m.approved : 0; m.medianWeeks = m.weeksToApprove.length ? m.weeksToApprove.slice().sort((a, b) => a - b)[Math.floor(m.weeksToApprove.length / 2)] : null;
      m.per1000 = m.approvalRate * 1000; m.badPer1000 = m.per1000 * m.pd;
      out[pol] = m;
    }
    return out;
  }
  // users per arm for an A/B test detecting a lift in 26-week approval rate (two-sided 5%, 80% power)
  function sampleSize(p1, p2) { const z = 1.96 + 0.84, pb = (p1 + p2) / 2; return Math.ceil((z * z * 2 * pb * (1 - pb)) / ((p2 - p1) ** 2)); }
  return { rng, REASONS, ASSUME, POLICIES, NAMES, run, sampleSize };
});
