/* The program-increment backlog: single source for the page, the Rally CSV and the GitHub issues. */
'use strict';

const okrs = [
  { o: 'Prior auth for lumbar MRI is decided at the speed of care', krs: [
    'First-pass complete rate up 20 points from the week-1 baseline by 31 Mar 2027',
    'At least 80% of complete electronic requests that meet the rules are approved in real time (the industry pledge definition)',
    'Median days lost to "send more information" loops down 50% for the pilot service'
  ] },
  { o: 'Compliant and auditable from 1 Jan 2027', krs: [
    'Prior Authorization API live for the pilot service on 1 Jan 2027',
    '100% of pended or denied requests carry a specific reason and what to send',
    'Zero decisions past 72 hours (urgent) or 7 calendar days (standard)'
  ] }
];
const guardrails = [
  'No automated denials: anything that does not clearly meet the rules goes to a clinician',
  'Clinician audit of a 5% sample of auto-approvals agrees at least 98% of the time',
  'Questions asked per request do not go up (pre-fill must remove work, not add it)'
];

const personas = [
  { name: 'Maria Lopez, 41', role: 'Prior-auth coordinator, 12-doctor orthopedics practice, Ohio', goal: 'Get the scan scheduled this week without chasing anyone.', pains: ['Checks a different portal or fax number for each health plan', 'Learns something was missing only when a pend letter arrives days later', 'Re-types what is already in the chart'], quote: '"Just tell me what you need before I hit submit."' },
  { name: 'Dr. Arun Patel, 52', role: 'Orthopedic surgeon (the ordering clinician)', goal: 'Order the right test and move on to the next patient.', pains: ['Gets pulled back days later to answer one question', 'Free-text notes that a reviewer cannot find'], quote: '"If you need me to confirm something, ask me while I am in the order."' },
  { name: 'Karen Brooks, RN, 38', role: 'Utilization management nurse reviewer at a health plan', goal: 'Decide quickly and consistently, on a complete packet.', pains: ['Half her queue is waiting on missing documents', 'Has to hunt through PDFs for one answer', 'Decision clock keeps running while she waits'], quote: '"A complete request is a fast request."' },
  { name: 'Dana R., 47', role: 'Member (the patient)', goal: 'Know if and when the MRI is approved.', pains: ['Cannot see status; calls the clinic and the plan', 'Pain continues while paperwork moves'], quote: '"Is it approved or not?"' }
];

const journey = {
  stages: ['Order placed', 'Is prior auth needed?', 'Gather documents', 'Submit', 'Wait', 'Decision', 'Schedule'],
  today: ['Clinician orders in the EHR', 'Coordinator checks the plan\'s list or portal', 'Copies notes, hunts for PT dates', 'Portal upload or fax', 'Pend letter if anything is missing; 3 business days to hear', 'Approval, or denial with a vague reason', 'Calls the patient, sometimes a week later'],
  pain: ['None yet', 'Different rules per plan', 'Re-typing; unsure what counts', 'No check before sending', 'Biggest delay: the "send more info" loop', 'Hard to know what to fix', 'Patient waited in pain'],
  target: ['Same', 'Answer inside the order in seconds (coverage check)', 'Questionnaire pre-filled from the chart', 'Checklist: only the missing items, then submit', 'Status and due date visible to all three', 'Real-time approval when complete and clear; specific reason otherwise', 'Scheduled in the same visit'],
  metric: ['', 'Coverage check response time', 'Share of answers pre-filled', 'First-pass complete rate', 'Days in pend', 'Real-time decision rate', 'Order-to-scan days']
};

// WSJF = (business value + time criticality + risk reduction/opportunity) / job size  (Fibonacci scores)
const features = [
  { id: 'F1', name: 'Coverage check at order', what: 'When an order is placed, say in seconds whether prior auth is needed and what documentation is required (Da Vinci CRD).', bv: 8, tc: 13, rr: 8, size: 8 },
  { id: 'F2', name: 'Pre-filled documentation questionnaire', what: 'Fetch the plan\'s questions and fill them from the chart (Da Vinci DTR).', bv: 13, tc: 13, rr: 8, size: 13 },
  { id: 'F3', name: 'Ask only what is missing, before submit', what: 'Checklist of unanswered items, one-tap clinician confirmation for red flags, skip questions that do not apply.', bv: 13, tc: 8, rr: 13, size: 5 },
  { id: 'F4', name: 'Submit and track through the Prior Authorization API', what: 'Send the request (Da Vinci PAS), show status and the 72-hour / 7-day due date, approve in real time when complete and clear.', bv: 8, tc: 13, rr: 5, size: 8 },
  { id: 'F5', name: 'Specific reasons and what to send', what: 'Every pend or denial lists the exact missing items or reason, plus next steps.', bv: 8, tc: 13, rr: 5, size: 3 },
  { id: 'F6', name: 'Completeness and real-time dashboard', what: 'First-pass complete rate, real-time decision rate, top missing items. Feeds public reporting.', bv: 5, tc: 3, rr: 8, size: 5 },
  { id: 'F7', name: 'Challenge the 30-day note rule', what: 'With clinical policy, test whether structured answers can replace a recent note for low-risk requests.', bv: 8, tc: 2, rr: 8, size: 2 }
].map(f => Object.assign(f, { wsjf: +((f.bv + f.tc + f.rr) / f.size).toFixed(1) }));

const g = (given, when, then, and) => ({ given, when, then, and: and || [] });
const stories = [
  { id: 'S1.1', feature: 'F1', points: 5, sprint: 'Sprint 1', must: true, persona: 'coordinator', story: 'As a prior-auth coordinator, I want to see whether a lumbar MRI order needs prior auth, and what documentation is required, while the order is still open, so that I don\'t check a portal later.',
    ac: [g('a clinician signs an order for CPT 72148 for a member of a plan in scope', 'the order is signed', 'the order shows "Prior auth required: documentation needed" within 2 seconds at the 95th percentile', ['the card links to the questionnaire']), g('the coverage service is down', 'the order is signed', 'the order shows "Could not check: use the portal" and the order is never blocked')] },
  { id: 'S1.2', feature: 'F1', points: 3, sprint: 'Sprint 1', must: true, persona: 'coordinator', story: 'As a coordinator, I want a clear "No prior auth needed" result with a reference number, so that I can schedule straight away.',
    ac: [g('the service does not need prior auth for this member', 'the order is signed', 'the card says "No prior auth needed" with a reference number and date', ['the reference is saved on the order'])] },
  { id: 'S2.1', feature: 'F2', points: 8, sprint: 'Sprint 1', must: true, persona: 'coordinator', story: 'As a coordinator, I want the plan\'s questions pre-filled from the chart, so that I don\'t re-type what is already there.',
    ac: [g('the chart has a back-pain diagnosis with an onset date, coded PT visits or an NSAID prescription', 'the questionnaire opens', 'diagnosis, weeks of pain and weeks of conservative care are filled in', ['each filled answer is marked "from chart"']), g('a value is not in the chart as data', 'the questionnaire opens', 'that question is left blank, never guessed')] },
  { id: 'S2.2', feature: 'F2', points: 3, sprint: 'Sprint 3', must: false, persona: 'reviewer', story: 'As a nurse reviewer, I want each pre-filled answer to show where it came from, so that I can trust it without opening every document.',
    ac: [g('an answer was pre-filled', 'the reviewer opens the request', 'the answer shows its source, for example "PT visit 10 Sep 2026" or "Ibuprofen 3 Sep to 29 Oct"')] },
  { id: 'S2.3', feature: 'F2', points: 3, sprint: 'Sprint 1', must: true, persona: 'clinician', story: 'As an ordering clinician, I want "no red flags" to be something I confirm, not something the system assumes from a blank chart, so that the request is accurate.',
    ac: [g('no red-flag condition is coded in the chart', 'the questionnaire opens', 'the red-flag question is left for the clinician, not filled as "none"'), g('a red-flag condition is coded (for example history of cancer)', 'the questionnaire opens', 'the red-flag answer is filled with that condition and marked "from chart"')] },
  { id: 'S2.4', feature: 'F2', points: 3, sprint: 'Sprint 1', must: true, persona: 'member', story: 'As a member, I want the plan to read only the parts of my record it needs, so that my privacy is respected.',
    ac: [g('the questionnaire rules run', 'they query the chart', 'they request only the resource types the questions need (HIPAA minimum necessary)', ['every query is written to an audit log with user, time and purpose'])] },
  { id: 'S3.1', feature: 'F3', points: 5, sprint: 'Sprint 2', must: true, persona: 'coordinator', story: 'As a coordinator, I want a short list of only the unanswered required questions, so that I can finish the request in one sitting.',
    ac: [g('required questions are unanswered', 'I press Submit', 'submit is held and the missing items are listed with a one-line reason each', ['answering them enables Submit']), g('all required questions are answered', 'I press Submit', 'the request is sent with no extra screen')] },
  { id: 'S3.2', feature: 'F3', points: 3, sprint: 'Sprint 2', must: true, persona: 'clinician', story: 'As a clinician, I want to confirm red flags with one tap inside the order, so that I am not pulled back days later.',
    ac: [g('the red-flag question is unanswered', 'the clinician signs the order', 'a one-tap prompt offers "None" or the listed red flags', ['the answer records who confirmed it and when'])] },
  { id: 'S3.3', feature: 'F3', points: 2, sprint: 'Sprint 1', must: true, persona: 'coordinator', story: 'As a coordinator, I don\'t want to be asked about weeks of pain or treatment when a red flag already justifies the scan.',
    ac: [g('a red flag is answered', 'the questionnaire updates', 'the weeks-of-pain and weeks-of-treatment questions are hidden and not required')] },
  { id: 'S3.4', feature: 'F3', points: 3, sprint: 'After go-live', must: false, persona: 'coordinator', story: 'As a coordinator, I want to save a half-finished request and come back to it, so that I can wait for a missing note.',
    ac: [g('a request has unanswered items', 'I choose Save draft', 'the draft and its answers are kept for 14 days and listed in my queue')] },
  { id: 'S4.1', feature: 'F4', points: 8, sprint: 'Sprint 2', must: true, persona: 'coordinator', story: 'As a coordinator, I want to submit the completed request electronically and get a tracking ID, so that I never fax.',
    ac: [g('a complete request', 'I press Submit', 'it is sent through the Prior Authorization API and a tracking ID comes back within 5 seconds', ['a failed send is retried and shown clearly, never silently dropped'])] },
  { id: 'S4.2', feature: 'F4', points: 5, sprint: 'Sprint 2', must: true, persona: 'member', story: 'As a member, coordinator or clinician, I want to see the request status and the date a decision is due, so that nobody has to call to ask.',
    ac: [g('a request is submitted as urgent', 'anyone with access views it', 'it shows status and a decision due within 72 hours'), g('a request is submitted as standard', 'anyone with access views it', 'it shows a decision due within 7 calendar days', ['status is also available to the member through the patient access API'])] },
  { id: 'S4.3', feature: 'F4', points: 5, sprint: 'Sprint 3', must: true, persona: 'reviewer', story: 'As a health plan, I want complete requests that clearly meet the rules approved in real time, and everything else sent to a clinician, so that we are fast and never auto-deny.',
    ac: [g('a complete request meets the rules', 'it is received', 'it is approved within seconds with the rules that were met listed'), g('a complete request does not meet the rules', 'it is received', 'it goes to the clinician review queue and is never denied automatically')] },
  { id: 'S5.1', feature: 'F5', points: 3, sprint: 'Sprint 2', must: true, persona: 'coordinator', story: 'As a coordinator, I want a pend notice that lists exactly what is missing and how to send it, so that I fix it in one try.',
    ac: [g('a request is pended for missing information', 'the notice is sent', 'it names each missing item, for example "office note from the last 30 days", and links to upload it')] },
  { id: 'S5.2', feature: 'F5', points: 3, sprint: 'Sprint 3', must: true, persona: 'clinician', story: 'As a clinician, I want a denial to state the specific reason and the appeal steps, so that I know what to do next.',
    ac: [g('a clinician reviewer denies a request', 'the decision is sent', 'it includes the specific reason, the criteria used, and how to appeal or request a peer-to-peer review')] },
  { id: 'S6.1', feature: 'F6', points: 5, sprint: 'After go-live', must: false, persona: 'reviewer', story: 'As the product team, we want a weekly view of first-pass complete rate, real-time decision rate and top missing items, so that we know what to fix next.',
    ac: [g('a week of requests', 'the dashboard refreshes', 'it shows the three numbers by plan and service, with the top 5 missing items')] },
  { id: 'S7.1', feature: 'F7', points: 2, sprint: 'Sprint 2 (spike)', must: false, persona: 'reviewer', story: 'As the product team, we want to test with clinical policy whether structured answers can replace the 30-day note for low-risk requests, so that we remove the biggest remaining cause of pends.',
    ac: [g('a sample of 100 past pended requests', 'clinical policy reviews them with and without the note', 'we record how often the note changed the decision, and decide keep, relax or drop')] }
];

const capacity = [
  { sprint: 'Sprint 1', dates: '16–27 Nov 2026', points: 26, note: 'US stakeholders are off on 26 Nov (Thanksgiving): book reviews for 24–25 Nov.' },
  { sprint: 'Sprint 2', dates: '30 Nov – 11 Dec 2026', points: 26, note: 'Spike S7.1 runs with clinical policy; no engineering points.' },
  { sprint: 'Sprint 3', dates: '14–24 Dec 2026', points: 16, note: 'Holiday leave: about 60% capacity. Keep a buffer for fixes.' },
  { sprint: 'Go-live readiness', dates: '28–31 Dec 2026', points: 0, note: 'Code freeze, end-to-end test with a partner EHR, rollback plan.' }
];

const dor = ['Written as a user story with a named persona', 'Acceptance criteria in Given / When / Then', 'Estimated by the team', 'Dependencies named and either cleared or scheduled', 'Test data exists (synthetic patients)', 'Clinical or policy sign-off where a rule is involved'];
const dod = ['All acceptance criteria pass in a test environment', 'Automated tests added and green', 'Peer review done; no new security findings', 'Audit logging in place for any read of patient data', 'Accessibility checked (WCAG 2.1 AA) for any screen', 'Product owner accepted it in the sprint review', 'Help text and release note updated'];
const nfrs = ['Coverage check: under 2 seconds at the 95th percentile', 'Orders are never blocked if a service is down (fail open to the portal)', 'HIPAA minimum necessary: rules read only what the questions need', 'Every decision and every chart query is auditable', 'Decision clocks: 72 hours urgent, 7 calendar days standard', 'No automated denials'];
const dependencies = [
  { what: 'EHR partner supports launching the questionnaire app (SMART on FHIR)', owner: 'Partnerships / EHR vendor', needed: 'Sprint 1', status: 'At risk' },
  { what: 'Clinical policy signs off the lumbar MRI rules', owner: 'Clinical policy team', needed: 'Sprint 1', status: 'Scheduled' },
  { what: 'Clinician review queue accepts API requests', owner: 'Utilization management platform team', needed: 'Sprint 3', status: 'Scheduled' },
  { what: 'Synthetic test patients and a FHIR test server', owner: 'QA / platform', needed: 'Sprint 1', status: 'Ready' },
  { what: 'Security and privacy review', owner: 'Information security', needed: 'Sprint 2', status: 'Scheduled' }
];
const risks = [
  { risk: 'Provider EHRs are not ready to use the API by 1 Jan', roam: 'Owned', plan: 'Keep the portal and fax path working; track adoption by practice.' },
  { risk: 'Clinical policy sign-off slips', roam: 'Mitigated', plan: 'Pilot one service (lumbar MRI) with public, well-known criteria first.' },
  { risk: 'Questionnaire adds work instead of removing it', roam: 'Mitigated', plan: 'Pre-fill, skip questions that do not apply, guardrail on questions asked per request.' },
  { risk: 'A rules error auto-approves the wrong case', roam: 'Mitigated', plan: 'Rules test suite, clinician audit of a 5% sample, kill switch per rule.' },
  { risk: 'Holiday capacity in Sprint 3', roam: 'Accepted', plan: 'Cut line below: dashboard and drafts move after go-live.' }
];
const grooming = [
  'Review last sprint\'s top missing items from the dashboard (5 min)',
  'Walk the next 8–10 stories: does each meet the Definition of Ready? (25 min)',
  'Estimate together; split anything over 8 points (15 min)',
  'Re-rank against WSJF and dependencies; agree the cut line (10 min)',
  'Name impediments and owners (5 min)'
];

module.exports = { okrs, guardrails, personas, journey, features, stories, capacity, dor, dod, nfrs, dependencies, risks, grooming };
