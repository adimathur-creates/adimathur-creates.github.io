// node tests/run.js — checks the engine and the tracker rules. Fictional data only.
const E = require('../engine.js');
const P = require('../program.js');
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('ok   ' + name); } catch (e) { fail++; console.log('FAIL ' + name + ' :: ' + e.message); } }
function eq(a, b, m) { if (a !== b) throw new Error((m || '') + ' expected ' + b + ' got ' + a); }
function ok(c, m) { if (!c) throw new Error(m || 'assertion failed'); }

const base = E.evaluate({});
const all = E.evaluate({ L1: true, L2: true, L3: true, L4: true });

t('same seed gives the same cohort', () => {
  const a = E.evaluate({}).summary, b = E.evaluate({}).summary;
  eq(JSON.stringify(a.counts), JSON.stringify(b.counts));
});
t('cohort size is weeks x signups', () => eq(base.summary.n, E.A.weeks * E.A.signupsPerWeek));
t('funnel never increases stage to stage (no-lever run)', () => {
  const c = base.summary.counts; for (let i = 1; i < c.length; i++) ok(c[i] <= c[i - 1], 'stage ' + i);
});
t('14-day rate is between 7-day rate and ever rate', () => {
  const s = base.summary; ok(s.rate7 <= s.rate14 && s.rate14 <= s.rateEver);
});
['L1', 'L2', 'L3', 'L4'].forEach(L => t(L + ' alone does not lower the 14-day rate or the ever rate', () => {
  const s = E.evaluate({ [L]: true }).summary;
  ok(s.rate14 >= base.summary.rate14 - 1e-9, '14d'); ok(s.rateEver >= base.summary.rateEver - 1e-9, 'ever');
}));
t('levers never turn an approved merchant into a rejection; extra rejections are only merchants who never reached review before', () => {
  base.rows.forEach((b, i) => {
    const a = all.rows[i];
    if (b.rejected) ok(a.rejected, b.id + ' rejected before, not after');
    if (a.rejected && !b.rejected) ok(b.reached === 'signed', b.id + ' newly rejected but had reached ' + b.reached);
  });
});
t('only high-risk merchants are rejected on policy', () => ok(all.rows.filter(r => r.rejected).every(r => r.risk === 'high')));
t('no high-risk merchant ever takes the simplified route', () => eq(all.summary.fastLaneHighRisk, 0));
t('simplified route only for micro merchants', () => ok(all.rows.filter(r => r.fastLane).every(r => r.segment === 'micro')));
t('link-first never used by no-code or high-risk merchants', () => ok(all.rows.filter(r => r.viaLink).every(r => r.path !== 'nocode' && r.risk !== 'high')));
t('every non-converting, non-rejected merchant has a stall reason', () => ok(base.rows.filter(r => r.firstDay === null && !r.rejected).every(r => !!r.stuck)));
t('nudges only reach self-serve merchants', () => ok(all.rows.filter(r => r.nudged).every(r => r.source === 'self')));
t('sample size matches the textbook value (30% vs 35%, 5% two-sided, 80% power)', () => {
  const n = E.sampleSizePerArm(0.30, 0.35, 0.05, 0.8); ok(n >= 1370 && n <= 1380, 'got ' + n);
});
t('business case: combined levers add active merchants and pay back within 12 months', () => {
  const bc = E.businessCase({ L1: true, L2: true, L3: true, L4: true });
  ok(bc.incActivePerMonth > 0); ok(bc.paybackMonths !== null && bc.paybackMonths <= 12);
});
t('RAG: forecast more than 7 days late is Red', () => {
  const r = E.assess([{ id: 'X', title: 'x', owner: 'o', due: '2026-11-10', forecast: '2026-11-20', pct: 10 }], '2026-11-01');
  eq(r[0].rag, 'Red');
});
t('RAG: due within 7 days under 70% is Amber', () => {
  const r = E.assess([{ id: 'X', title: 'x', owner: 'o', due: '2026-11-05', forecast: '2026-11-05', pct: 50 }], '2026-11-01');
  eq(r[0].rag, 'Amber');
});
t('RAG: dependency on a red item turns an on-time item Red', () => {
  const r = E.assess([
    { id: 'A', title: 'a', owner: 'o', due: '2026-11-01', forecast: '2026-11-20', pct: 10 },
    { id: 'B', title: 'b', owner: 'o', due: '2026-12-20', forecast: '2026-12-20', pct: 0, dependsOn: ['A'] }], '2026-11-02');
  eq(r[1].rag, 'Red');
});
t('RAG: overdue decision turns an item Red; making the decision clears it', () => {
  const item = { id: 'D', title: 'd', owner: 'o', due: '2026-12-20', forecast: '2026-12-20', pct: 40, decision: 'x', decisionOwner: 'y', decisionBy: '2026-11-10', decisionMade: false };
  eq(E.assess([Object.assign({}, item)], '2026-11-12')[0].rag, 'Red');
  eq(E.assess([Object.assign({}, item, { decisionMade: true })], '2026-11-12')[0].rag, 'Green');
});
t('weekly note traces 4 reds to 2 root causes in the sample program', () => {
  const n = E.weeklyNote(P.prev, P.cur, P.asOf, { prev: P.metric.prev, cur: P.metric.cur, prevAsOf: P.prevAsOf });
  eq(n.counts.Red, 4); eq(n.roots.length, 2);
  ok(n.roots.map(r => r.item.id).sort().join() === 'L2a,L3b');
});
t('weekly note lists the open decision as an ask', () => {
  const n = E.weeklyNote(P.prev, P.cur, P.asOf, { prev: P.metric.prev, cur: P.metric.cur, prevAsOf: P.prevAsOf });
  ok(n.asks.some(a => /Decision needed/.test(a)));
});
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
