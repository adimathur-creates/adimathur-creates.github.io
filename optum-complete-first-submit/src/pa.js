/*
 * Complete on first submit: documentation rules for one prior-authorization service.
 *
 * A small, readable stand-in for what Da Vinci DTR does: take the payer's questionnaire,
 * pre-fill it from the patient's chart (FHIR-shaped data), list what is still missing,
 * and route the request. Illustrative criteria only, based on the public ACR
 * Appropriateness Criteria for low back pain. NOT any payer's real medical policy.
 *
 * Works in the browser (window.PA) and in Node (module.exports).
 */
(function (root) {
  'use strict';
  var DAY = 86400000;

  var SERVICE = { cpt: '72148', display: 'MRI lumbar spine without contrast' };

  // Value sets (small, illustrative)
  var LBP = /^M54\.(5|50|59)/, RADIC = /^M54\.1[67]/;
  var RED_FLAG_CODES = {
    'Z85': 'History of cancer', 'C79.51': 'Cancer spread to bone', 'R50.9': 'Fever (possible infection)',
    'G83.4': 'Cauda equina syndrome', 'S32.0': 'Lumbar fracture', 'M81.0': 'Osteoporosis (fracture risk)'
  };
  var PT_CODES = ['97110', '97112', '97140', '97161', '97162', '97163'];

  var QUESTIONNAIRE = {
    resourceType: 'Questionnaire', id: 'lumbar-mri-illustrative', status: 'draft',
    title: 'Lumbar spine MRI (CPT 72148): documentation (illustrative)',
    item: [
      { linkId: 'dx', text: 'Primary diagnosis', type: 'choice', required: true, fromChart: 'Condition (ICD-10 M54.5x / M54.16-17)' },
      { linkId: 'symptomWeeks', text: 'How many weeks has the back pain lasted?', type: 'integer', required: true, onlyIfNoRedFlag: true, fromChart: 'Condition.onsetDateTime' },
      { linkId: 'conservativeWeeks', text: 'Weeks of conservative care tried (physical therapy, anti-inflammatories, home exercise)', type: 'integer', required: true, onlyIfNoRedFlag: true, fromChart: 'Procedure (PT CPT 97110 etc.), MedicationRequest (NSAID)' },
      { linkId: 'redFlags', text: 'Any red flags? (cancer history, fever, fracture risk, cauda equina, progressive weakness)', type: 'choice', required: true, fromChart: 'Condition codes; "none" must be confirmed by a clinician' },
      { linkId: 'neuroExam', text: 'Neurological exam result', type: 'choice', required: true, fromChart: 'Observation (neuro exam)' },
      { linkId: 'recentNote', text: 'Office visit note from the last 30 days attached', type: 'boolean', required: true, fromChart: 'DocumentReference (date within 30 days)' },
      { linkId: 'priorImaging', text: 'Lumbar imaging in the last 12 months', type: 'boolean', required: false, fromChart: 'ImagingStudy' }
    ]
  };

  var WHY = {
    dx: 'Payers check the order matches a covered diagnosis.',
    symptomWeeks: 'Most uncomplicated back pain gets better within 6 weeks, so imaging is usually considered after that.',
    conservativeWeeks: 'Imaging is usually considered after about 6 weeks of treatment that did not help.',
    redFlags: 'A red flag can justify imaging right away. A blank chart is not the same as "no red flags", so a clinician confirms it.',
    neuroExam: 'Severe or progressive weakness changes the urgency.',
    recentNote: 'The reviewer needs the latest clinical note.',
    priorImaging: 'Helps avoid repeat scans. Optional.'
  };

  function weeksBetween(a, b) { return Math.floor((b - a) / (7 * DAY)); }

  /* Pre-fill answers from a FHIR-shaped bundle: {entry:[{resourceType,...}]}. */
  function prepopulate(bundle, today) {
    today = today ? new Date(today).getTime() : Date.now();
    var res = bundle.entry || [];
    var by = function (t) { return res.filter(function (r) { return r.resourceType === t; }); };
    var A = {};
    function set(id, value, evidence) { A[id] = { value: value, source: 'chart', evidence: evidence }; }

    var conds = by('Condition');
    var back = conds.filter(function (c) { return LBP.test(c.code) || RADIC.test(c.code); });
    if (back.length) {
      var radic = back.some(function (c) { return RADIC.test(c.code); });
      set('dx', radic ? 'Low back pain with radiculopathy' : 'Low back pain', back.map(function (c) { return c.code; }).join(', '));
      var onsets = back.map(function (c) { return c.onset ? new Date(c.onset).getTime() : null; }).filter(Boolean);
      if (onsets.length) set('symptomWeeks', weeksBetween(Math.min.apply(null, onsets), today), 'Onset recorded ' + new Date(Math.min.apply(null, onsets)).toISOString().slice(0, 10));
    }

    var care = [];
    by('Procedure').forEach(function (p) { if (PT_CODES.indexOf(p.code) > -1 && p.date) care.push({ t: new Date(p.date).getTime(), what: 'PT' }); });
    by('MedicationRequest').forEach(function (m) {
      if (m.class === 'NSAID' && m.start) { care.push({ t: new Date(m.start).getTime(), what: 'NSAID' }); care.push({ t: new Date(m.end || today).getTime(), what: 'NSAID' }); }
    });
    if (care.length) {
      var ts = care.map(function (c) { return c.t; });
      var kinds = care.map(function (c) { return c.what; }).filter(function (v, i, a) { return a.indexOf(v) === i; });
      set('conservativeWeeks', weeksBetween(Math.min.apply(null, ts), Math.max.apply(null, ts)), kinds.join(' + ') + ' documented');
    }

    var flags = [];
    conds.forEach(function (c) { Object.keys(RED_FLAG_CODES).forEach(function (k) { if (c.code.indexOf(k) === 0) flags.push(RED_FLAG_CODES[k]); }); });
    var neuro = by('Observation').filter(function (o) { return o.code === 'neuro-exam'; }).sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); })[0];
    if (neuro) {
      set('neuroExam', neuro.value, 'Exam on ' + neuro.date);
      if (neuro.value === 'Progressive deficit') flags.push('Progressive neurological deficit');
    }
    if (flags.length) set('redFlags', flags.join('; '), 'Coded in chart');
    // No red flag in the chart is NOT recorded as "none": a clinician must confirm (left missing on purpose).

    var notes = by('DocumentReference').filter(function (d) { return d.type === 'office-note' && (today - new Date(d.date).getTime()) <= 30 * DAY; });
    if (notes.length) set('recentNote', true, 'Note dated ' + notes[0].date);

    var img = by('ImagingStudy').filter(function (s) { return s.bodySite === 'lumbar' && (today - new Date(s.date).getTime()) <= 365 * DAY; });
    set('priorImaging', img.length > 0, img.length ? 'Imaging on ' + img[0].date : 'None found in chart');
    return A;
  }

  /* Merge manual answers (coordinator / clinician entries) over pre-filled ones. */
  function merge(prefilled, manual) {
    var out = {};
    Object.keys(prefilled || {}).forEach(function (k) { out[k] = prefilled[k]; });
    Object.keys(manual || {}).forEach(function (k) {
      if (manual[k] !== undefined && manual[k] !== null && manual[k] !== '') out[k] = { value: manual[k], source: 'entered', evidence: 'Entered before submit' };
    });
    return out;
  }

  /*
   * Evaluate a set of answers.
   * route: 'auto-approve' | 'clinical-review' | 'incomplete'
   * We never auto-deny: anything complete that does not clearly meet the rules goes to a clinician.
   */
  function hasRedFlag(answers) {
    var rf = answers.redFlags && answers.redFlags.value, ne = answers.neuroExam && answers.neuroExam.value;
    return (rf !== undefined && rf !== '' && rf !== 'None') || ne === 'Progressive deficit';
  }

  /* Which questions must be answered, given what is known so far (like FHIR enableWhen). */
  function requiredItems(answers) {
    var rf = hasRedFlag(answers || {});
    return QUESTIONNAIRE.item.filter(function (q) { return q.required && !(q.onlyIfNoRedFlag && rf); });
  }

  function evaluate(answers) {
    var missing = requiredItems(answers).filter(function (q) { return !(answers[q.linkId] && answers[q.linkId].value !== undefined && answers[q.linkId].value !== ''); })
      .map(function (q) { return { linkId: q.linkId, text: q.text, why: WHY[q.linkId] }; });
    if (missing.length) return { complete: false, missing: missing, meets: null, route: 'incomplete', reasons: [] };
    var v = function (k) { return answers[k].value; };
    var reasons = [];
    var redFlag = hasRedFlag(answers);
    if (redFlag) reasons.push('Red flag documented: ' + (v('redFlags') !== 'None' ? v('redFlags') : 'progressive neurological deficit'));
    var sixSix = !redFlag && Number(v('symptomWeeks')) >= 6 && Number(v('conservativeWeeks')) >= 6;
    if (sixSix) reasons.push('Pain for ' + v('symptomWeeks') + ' weeks after ' + v('conservativeWeeks') + ' weeks of conservative care');
    var meets = redFlag || sixSix;
    if (!meets) {
      if (Number(v('symptomWeeks')) < 6) reasons.push('Pain for ' + v('symptomWeeks') + ' weeks, under the usual 6');
      if (Number(v('conservativeWeeks')) < 6) reasons.push(v('conservativeWeeks') + ' weeks of conservative care, under the usual 6');
    }
    return { complete: true, missing: [], meets: meets, route: meets ? 'auto-approve' : 'clinical-review', reasons: reasons };
  }

  /* CMS-0057-F decision windows for Medicare Advantage / Medicaid / CHIP (from 2026): 72 hours urgent, 7 calendar days standard. */
  function decisionDue(submittedISO, urgency) {
    var t = new Date(submittedISO).getTime();
    return new Date(t + (urgency === 'urgent' ? 72 * 3600000 : 7 * DAY)).toISOString();
  }

  /* The "specific reason" text a provider gets when a request is pended for missing documentation. */
  function pendNotice(missing) {
    return 'More information needed for ' + SERVICE.display + ' (CPT ' + SERVICE.cpt + '). Please send: ' +
      missing.map(function (m) { return m.text.replace(/\?$/, ''); }).join('; ') + '.';
  }

  var api = { SERVICE: SERVICE, QUESTIONNAIRE: QUESTIONNAIRE, WHY: WHY, RED_FLAG_CODES: RED_FLAG_CODES, PT_CODES: PT_CODES,
    prepopulate: prepopulate, merge: merge, evaluate: evaluate, requiredItems: requiredItems, hasRedFlag: hasRedFlag, decisionDue: decisionDue, pendNotice: pendNotice };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PA = api;
})(typeof window !== 'undefined' ? window : this);
