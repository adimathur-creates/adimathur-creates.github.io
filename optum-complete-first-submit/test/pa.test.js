'use strict';
// Run: node --test test/
const test = require('node:test');
const assert = require('node:assert/strict');
const PA = require('../src/pa');
const P = require('../src/patients');
const B = require('../src/backlog');
const T = P.TODAY;
const pt = id => P.PATIENTS.find(p => p.id === id);

test('pre-fill reads diagnosis, weeks of pain and weeks of care from the chart', () => {
  const a = PA.prepopulate(pt('dana').bundle, T);
  assert.equal(a.dx.value, 'Low back pain with radiculopathy');
  assert.equal(a.symptomWeeks.value, 10);
  assert.equal(a.conservativeWeeks.value, 9);
  assert.equal(a.recentNote.value, true);
  for (const k of Object.keys(a)) assert.equal(a[k].source, 'chart');
});

test('a blank chart never becomes "no red flags": the clinician must confirm', () => {
  const a = PA.prepopulate(pt('dana').bundle, T);
  assert.equal(a.redFlags, undefined);
  const ev = PA.evaluate(a);
  assert.deepEqual(ev.missing.map(m => m.linkId), ['redFlags']);
});

test('a coded red flag is pre-filled and makes the weeks questions not required', () => {
  const a = PA.prepopulate(pt('grace').bundle, T);
  assert.match(a.redFlags.value, /cancer/);
  const ev = PA.evaluate(a);
  assert.equal(ev.complete, true);
  assert.equal(ev.route, 'auto-approve');
  assert.ok(!PA.requiredItems(a).some(q => q.linkId === 'conservativeWeeks'));
});

test('Dana: confirming "None" for red flags completes the request and it is approved in real time', () => {
  const ev = PA.evaluate(PA.merge(PA.prepopulate(pt('dana').bundle, T), { redFlags: 'None' }));
  assert.equal(ev.route, 'auto-approve');
  assert.ok(ev.reasons.some(r => /10 weeks/.test(r)));
});

test('Luis: an old note and uncoded dates leave four items missing; the pend notice names them', () => {
  const ev = PA.evaluate(PA.prepopulate(pt('luis').bundle, T));
  assert.equal(ev.route, 'incomplete');
  assert.deepEqual(ev.missing.map(m => m.linkId).sort(), ['neuroExam', 'recentNote', 'redFlags', 'symptomWeeks']);
  const notice = PA.pendNotice(ev.missing);
  assert.match(notice, /72148/);
  assert.match(notice, /Office visit note from the last 30 days attached/);
});

test('Sam: complete but not meeting the rules goes to a clinician, never an automatic denial', () => {
  const ev = PA.evaluate(PA.merge(PA.prepopulate(pt('sam').bundle, T), { redFlags: 'None', conservativeWeeks: 0 }));
  assert.equal(ev.complete, true);
  assert.equal(ev.route, 'clinical-review');
  assert.notEqual(ev.route, 'deny');
});

test('progressive neurological deficit counts as a red flag', () => {
  const a = PA.merge({}, { dx: 'Low back pain', redFlags: 'None', neuroExam: 'Progressive deficit', recentNote: true });
  assert.equal(PA.evaluate(a).route, 'auto-approve');
});

test('6 weeks is the line: 5 weeks of care is not enough without a red flag', () => {
  const base = { dx: 'Low back pain', redFlags: 'None', neuroExam: 'Normal', recentNote: true, symptomWeeks: 8 };
  assert.equal(PA.evaluate(PA.merge({}, Object.assign({}, base, { conservativeWeeks: 5 }))).route, 'clinical-review');
  assert.equal(PA.evaluate(PA.merge({}, Object.assign({}, base, { conservativeWeeks: 6 }))).route, 'auto-approve');
});

test('manual answers override pre-filled ones and are marked "entered"', () => {
  const m = PA.merge({ symptomWeeks: { value: 3, source: 'chart' } }, { symptomWeeks: 9 });
  assert.equal(m.symptomWeeks.value, 9);
  assert.equal(m.symptomWeeks.source, 'entered');
});

test('decision due dates follow CMS-0057-F: 72 hours urgent, 7 calendar days standard', () => {
  assert.equal(PA.decisionDue('2026-11-12T10:00:00Z', 'urgent'), '2026-11-15T10:00:00.000Z');
  assert.equal(PA.decisionDue('2026-11-12T10:00:00Z', 'standard'), '2026-11-19T10:00:00.000Z');
});

test('optional prior-imaging question never blocks submission', () => {
  const ev = PA.evaluate(PA.merge({}, { dx: 'Low back pain', redFlags: 'None', neuroExam: 'Normal', recentNote: true, symptomWeeks: 8, conservativeWeeks: 8 }));
  assert.equal(ev.complete, true);
});

test('backlog: every story has a known feature, points, and Given/When/Then criteria', () => {
  const ids = new Set(B.features.map(f => f.id));
  for (const s of B.stories) {
    assert.ok(ids.has(s.feature), s.id);
    assert.ok([1, 2, 3, 5, 8, 13].includes(s.points), s.id + ' points');
    assert.ok(s.ac.length > 0 && s.ac.every(c => c.given && c.when && c.then), s.id + ' AC');
    assert.match(s.story, /^As (an? |the )/, s.id);
  }
});

test('backlog: each sprint plan fits its capacity', () => {
  for (const c of B.capacity) {
    const pts = B.stories.filter(s => s.sprint === c.sprint).reduce((a, s) => a + s.points, 0);
    assert.ok(pts <= c.points, `${c.sprint}: ${pts} > ${c.points}`);
  }
});

test('backlog: every must-have story is planned before go-live', () => {
  for (const s of B.stories.filter(x => x.must)) assert.match(s.sprint, /^Sprint [123]$/, s.id);
});

test('WSJF is (value + time criticality + risk reduction) / size', () => {
  const f = B.features.find(x => x.id === 'F5');
  assert.equal(f.wsjf, +((8 + 13 + 5) / 3).toFixed(1));
});
