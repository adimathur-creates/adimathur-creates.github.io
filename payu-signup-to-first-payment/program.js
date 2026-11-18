/* Fictional program tracker: two weekly snapshots. Every owner, date and blocker is invented. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Program = factory();
})(this, function () {
  'use strict';
  var base = [
    { id: 'G1', ws: 'Governance', title: 'Agree one definition of "first successful payment" and its data source', owner: 'Analytics', due: '2026-11-06', forecast: '2026-11-06', pct: 100 },
    { id: 'G2', ws: 'Governance', title: 'Baseline dashboard live: funnel, stall reasons, weekly cohorts', owner: 'Analytics + Product Ops', due: '2026-11-13', forecast: '2026-11-13', pct: 80 },
    { id: 'L1a', ws: 'L1 Fix-it rework queue', title: 'Rework reason codes signed off', owner: 'Risk Ops', due: '2026-11-10', forecast: '2026-11-10', pct: 90 },
    { id: 'L1b', ws: 'L1 Fix-it rework queue', title: 'Spec for fix screens (bank name, PAN–GST, policy pages)', owner: 'Product (Onboarding)', due: '2026-11-20', forecast: '2026-11-20', pct: 50 },
    { id: 'L1c', ws: 'L1 Fix-it rework queue', title: 'Build and release fix screens', owner: 'Engineering (Onboarding)', due: '2026-12-11', forecast: '2026-12-11', pct: 0, dependsOn: ['L1b'] },
    { id: 'L2a', ws: 'L2 Simplified route', title: 'Compliance view on simplified due-diligence eligibility and evidence', owner: 'Risk & Compliance', due: '2026-11-14', forecast: '2026-11-14', pct: 60,
      decision: 'Approve the simplified due-diligence route for micro merchants (turnover up to ₹40L), excluding high-risk categories', decisionOwner: 'Head of Risk & Compliance [placeholder]', decisionBy: '2026-11-14', decisionMade: false },
    { id: 'L2b', ws: 'L2 Simplified route', title: 'Turnover declaration and routing logic in onboarding', owner: 'Engineering (Onboarding)', due: '2026-12-04', forecast: '2026-12-04', pct: 0, dependsOn: ['L2a'] },
    { id: 'L3a', ws: 'L3 First payment by link', title: 'Pilot: link-first payment for 200 plugin/API merchants', owner: 'Product (Payment Links) + Sales', due: '2026-11-27', forecast: '2026-11-27', pct: 30, dependsOn: ['L3b'] },
    { id: 'L3b', ws: 'L3 First payment by link', title: 'Finance check: link payments settle and reconcile to the same merchant ledger', owner: 'Finance (Reconciliation)', due: '2026-11-25', forecast: '2026-11-25', pct: 30 },
    { id: 'L4a', ws: 'L4 Stall nudges', title: 'Voice and WhatsApp scripts (Hindi/English) for two stall points, compliance-reviewed', owner: 'Product (Merchant Growth)', due: '2026-11-21', forecast: '2026-11-21', pct: 40 },
    { id: 'L4b', ws: 'L4 Stall nudges', title: '20% holdout set up and checked for balance', owner: 'Analytics', due: '2026-11-21', forecast: '2026-11-21', pct: 20, dependsOn: ['G2'] },
    { id: 'L4c', ws: 'L4 Stall nudges', title: 'Account-manager hand-off time agreed (call back within 1 working day)', owner: 'Sales Ops', due: '2026-11-19', forecast: '2026-11-19', pct: 20 },
    { id: 'R1', ws: 'Guardrails', title: '60-day fraud and chargeback watch on the simplified-route cohort', owner: 'Risk', due: '2026-12-01', forecast: '2026-12-01', pct: 20 }
  ];
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  var prev = clone(base);
  var cur = clone(base);
  function upd(list, id, patch) { list.forEach(function (i) { if (i.id === id) Object.assign(i, patch); }); }
  // what changed between the two fictional weeks
  upd(cur, 'G2', { pct: 85, forecast: '2026-11-18', blocker: 'KYC vendor callback events arrive without merchant ID for about 1 in 10 rows; join fix in progress' });
  upd(cur, 'L1a', { pct: 100 });
  upd(cur, 'L1b', { pct: 70 });
  upd(cur, 'L2a', { pct: 75 });
  upd(cur, 'L3a', { pct: 40 });
  upd(cur, 'L3b', { pct: 35, forecast: '2026-12-05', blocker: 'Settlement report books link payments under a separate product code; Finance needs a mapping before the pilot can count them' });
  upd(cur, 'L4a', { pct: 60 });
  upd(cur, 'L4b', { pct: 50 });
  upd(cur, 'L4c', { pct: 30 });
  return {
    prevAsOf: '2026-11-09', asOf: '2026-11-16',
    metric: { prev: 0.231, cur: 0.238 },
    prev: prev, cur: cur
  };
});
