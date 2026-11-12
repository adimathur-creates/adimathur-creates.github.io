/*
 * Synthetic sample: 1,000 lumbar MRI requests, two ways of submitting them.
 *   node src/sample.js [seed]
 * A. "Send what's in the chart": whatever is structured goes out; anything missing gets pended.
 * B. "Pre-fill, then ask before submit": the same pre-fill, plus a prompt for each missing answer.
 *
 * Every probability below is an ASSUMPTION (written next to it). The point is the method:
 * find which missing items cause most pends, and let that order the backlog.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const PA = require('./pa');
const SEED = parseInt(process.argv[2] || '2026', 10);
const N = 1000;
const TODAY = new Date('2026-11-12T00:00:00Z').getTime(), DAY = 86400000;

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const r = mulberry32(SEED);
const U = (a, b) => a + (b - a) * r();
const iso = t => new Date(t).toISOString().slice(0, 10);

const P = {
  dxCoded: 0.97,            // diagnosis coded on the order
  onsetStructured: 0.60,    // onset date recorded as data, not only in the note
  longPain: 0.65,           // pain has lasted 6+ weeks
  careIfLong: 0.75,         // of those, 6+ weeks of conservative care actually happened
  careStructured: 0.55,     // that care shows up as coded PT visits or an NSAID prescription
  redFlag: 0.07,            // a true red flag is present
  redFlagCoded: 0.75,       // ...and it is coded
  neuroStructured: 0.45,    // neuro exam result stored as data
  noteInWindow: 0.80,       // a note from the last 30 days exists
  noteAttached: 0.80,       // ...and is attached / discoverable
  // B only: chance the coordinator or clinician can answer a missing item in the same session
  canAnswer: { dx: 0.98, symptomWeeks: 0.92, conservativeWeeks: 0.85, redFlags: 0.97, neuroExam: 0.75, recentNote: 0.70 }
};

const rows = [];
for (let i = 0; i < N; i++) {
  const truth = {};
  truth.weeks = r() < P.longPain ? Math.round(U(6, 30)) : Math.round(U(1, 5));
  truth.careWeeks = truth.weeks >= 6 ? (r() < P.careIfLong ? Math.min(truth.weeks, Math.round(U(6, 16))) : Math.round(U(0, 5))) : Math.round(U(0, truth.weeks));
  truth.redFlag = r() < P.redFlag;
  truth.progressive = r() < 0.02;
  truth.note = r() < P.noteInWindow;
  const onset = TODAY - truth.weeks * 7 * DAY;
  const e = [];
  if (r() < P.dxCoded) e.push({ resourceType: 'Condition', code: r() < 0.45 ? 'M54.16' : 'M54.50', onset: r() < P.onsetStructured ? iso(onset) : undefined });
  if (truth.careWeeks > 0 && r() < P.careStructured) {
    const start = TODAY - (truth.careWeeks + 1) * 7 * DAY;
    if (r() < 0.6) { e.push({ resourceType: 'Procedure', code: '97161', date: iso(start) }); e.push({ resourceType: 'Procedure', code: '97110', date: iso(start + truth.careWeeks * 7 * DAY) }); }
    else e.push({ resourceType: 'MedicationRequest', class: 'NSAID', start: iso(start), end: iso(start + truth.careWeeks * 7 * DAY) });
  }
  if (truth.redFlag && r() < P.redFlagCoded) e.push({ resourceType: 'Condition', code: ['Z85.3', 'R50.9', 'M81.0', 'S32.0'][Math.floor(r() * 4)] });
  if (r() < P.neuroStructured) e.push({ resourceType: 'Observation', code: 'neuro-exam', value: truth.progressive ? 'Progressive deficit' : 'Normal', date: iso(TODAY - 5 * DAY) });
  if (truth.note && r() < P.noteAttached) e.push({ resourceType: 'DocumentReference', type: 'office-note', date: iso(TODAY - Math.round(U(1, 28)) * DAY) });

  const pre = PA.prepopulate({ entry: e }, '2026-11-12');
  const A = PA.evaluate(pre);
  // B: answer what you can, in the same session
  const manual = {};
  const truthAnswer = {
    dx: 'Low back pain', symptomWeeks: truth.weeks, conservativeWeeks: truth.careWeeks,
    redFlags: truth.redFlag ? 'Documented red flag' : 'None', neuroExam: truth.progressive ? 'Progressive deficit' : 'Normal',
    recentNote: truth.note ? true : undefined
  };
  for (const m of A.missing) if (r() < P.canAnswer[m.linkId] && truthAnswer[m.linkId] !== undefined) manual[m.linkId] = truthAnswer[m.linkId];
  const B = PA.evaluate(PA.merge(pre, manual));
  const truthMeets = truth.redFlag || truth.progressive || (truth.weeks >= 6 && truth.careWeeks >= 6);
  rows.push({ A, B, truthMeets, autoFilled: Object.keys(pre).filter(k => k !== 'priorImaging').length });
}

const pct = (n, d = N) => +(100 * n / d).toFixed(1);
const missCount = {};
rows.forEach(x => x.A.missing.forEach(m => { missCount[m.linkId] = (missCount[m.linkId] || 0) + 1; }));
const incompleteA = rows.filter(x => !x.A.complete).length;
const pareto = Object.entries(missCount).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ linkId: k, text: PA.QUESTIONNAIRE.item.find(q => q.linkId === k).text, requests: v, pctOfIncomplete: pct(v, incompleteA) }));
const missB = {}; const incompleteB = rows.filter(x => !x.B.complete).length;
rows.forEach(x => x.B.missing.forEach(m => { missB[m.linkId] = (missB[m.linkId] || 0) + 1; }));
const paretoB = Object.entries(missB).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ linkId: k, requests: v, pctOfIncomplete: pct(v, incompleteB) }));
const route = f => ({ autoApprove: pct(rows.filter(x => x[f].route === 'auto-approve').length), clinicalReview: pct(rows.filter(x => x[f].route === 'clinical-review').length), incomplete: pct(rows.filter(x => x[f].route === 'incomplete').length) });
const out = {
  meta: { seed: SEED, n: N, assumptions: P, generated: new Date().toISOString().slice(0, 10) },
  completeA: pct(rows.filter(x => x.A.complete).length), completeB: pct(rows.filter(x => x.B.complete).length),
  routesA: route('A'), routesB: route('B'),
  fullyFromChart: pct(rows.filter(x => x.autoFilled >= 6).length),
  pareto, paretoB,
  // safety check: the rules never auto-approve a request whose true story does not meet them
  falseAutoApprovals: rows.filter(x => x.B.route === 'auto-approve' && !x.truthMeets).length,
  meetsButReview: rows.filter(x => x.B.route === 'clinical-review' && x.truthMeets).length
};
fs.writeFileSync(path.join(__dirname, '..', 'data', 'sample-results.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
