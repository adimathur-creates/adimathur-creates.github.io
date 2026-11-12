/* Four invented patients for the prototype. Today = 12 Nov 2026. FHIR-shaped, simplified. */
(function (root) {
  'use strict';
  var TODAY = '2026-11-12';
  var PATIENTS = [
    {
      id: 'dana', name: 'Dana R., 47', story: 'Ten weeks of back pain down the left leg. Eight weeks of physical therapy and ibuprofen have not helped. Everything is in the chart except one thing.',
      urgency: 'standard',
      bundle: { entry: [
        { resourceType: 'Condition', code: 'M54.16', display: 'Radiculopathy, lumbar', onset: '2026-08-31' },
        { resourceType: 'Procedure', code: '97161', display: 'PT evaluation', date: '2026-09-10' },
        { resourceType: 'Procedure', code: '97110', display: 'Therapeutic exercise', date: '2026-11-05' },
        { resourceType: 'MedicationRequest', class: 'NSAID', display: 'Ibuprofen 600 mg', start: '2026-09-03', end: '2026-10-29' },
        { resourceType: 'Observation', code: 'neuro-exam', value: 'Normal', date: '2026-10-31' },
        { resourceType: 'DocumentReference', type: 'office-note', date: '2026-10-31' }
      ] }
    },
    {
      id: 'luis', name: 'Luis M., 52', story: 'Long-standing back pain, but the onset date was never coded, physical therapy is only mentioned in free text, and the last note is six weeks old. Today, this is the request that gets pended.',
      urgency: 'standard',
      bundle: { entry: [
        { resourceType: 'Condition', code: 'M54.50', display: 'Low back pain, unspecified' },
        { resourceType: 'MedicationRequest', class: 'NSAID', display: 'Naproxen 500 mg', start: '2026-09-20', end: '2026-10-20' },
        { resourceType: 'DocumentReference', type: 'office-note', date: '2026-09-30' }
      ] }
    },
    {
      id: 'grace', name: 'Grace T., 68', story: 'Three weeks of new back pain, with a history of breast cancer coded in the chart. A red flag, so imaging is appropriate now.',
      urgency: 'urgent',
      bundle: { entry: [
        { resourceType: 'Condition', code: 'M54.50', display: 'Low back pain, unspecified', onset: '2026-10-22' },
        { resourceType: 'Condition', code: 'Z85.3', display: 'Personal history of breast cancer' },
        { resourceType: 'Observation', code: 'neuro-exam', value: 'Normal', date: '2026-11-11' },
        { resourceType: 'DocumentReference', type: 'office-note', date: '2026-11-11' }
      ] }
    },
    {
      id: 'sam', name: 'Sam K., 35', story: 'Three weeks of back pain after moving house, no treatment tried yet. The request is complete but does not meet the usual rules. It goes to a clinician, not to an automatic denial.',
      urgency: 'standard',
      bundle: { entry: [
        { resourceType: 'Condition', code: 'M54.50', display: 'Low back pain, unspecified', onset: '2026-10-20' },
        { resourceType: 'Observation', code: 'neuro-exam', value: 'Normal', date: '2026-11-10' },
        { resourceType: 'DocumentReference', type: 'office-note', date: '2026-11-10' }
      ] }
    }
  ];
  var api = { TODAY: TODAY, PATIENTS: PATIENTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PATIENTS = api;
})(typeof window !== 'undefined' ? window : this);
