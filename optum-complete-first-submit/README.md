# Complete on first submit: real-time prior authorization starts with a complete request

Live: https://adimathur-creates.github.io/optum-complete-first-submit/

From 1 January 2027, impacted US payers must run a FHIR Prior Authorization API (CMS-0057-F). Insurers including UnitedHealthcare have pledged that 80% of electronic prior-auth approvals will be real-time by 2027, but only for requests sent electronically with all needed documentation. This project is the program increment an Associate Technical Product Manager would run for one service (lumbar spine MRI): personas, journey map, today-vs-target process flows, a working prototype, 17 user stories with Given/When/Then criteria, WSJF priorities, a sprint plan with a cut line for 1 January, OKRs, dependencies and ROAM risks.

Independent work; not affiliated with Optum or UnitedHealthcare. Clinical rules are illustrative (public ACR Appropriateness Criteria), not any plan's policy. Patients and the 1,000-request sample are synthetic.

```
node src/sample.js        # synthetic sample -> data/sample-results.json
node src/build_page.js    # index.html + downloads/ (Rally CSV, GitHub issues, questionnaire JSON)
node --test test/*.test.js
```

| File | What it is |
|---|---|
| `src/pa.js` | Pre-fill from FHIR-shaped chart data, completeness check, routing (never auto-deny), CMS decision clocks. The prototype runs this file. |
| `src/backlog.js` | OKRs, personas, journey, features (WSJF), stories, capacity, DoR/DoD, NFRs, dependencies, risks. One source for the page and the downloads. |
| `src/sample.js` | 1,000 synthetic requests; what goes missing with pre-fill only vs asking before submit. |
| `test/pa.test.js` | 15 tests: clinical rules and backlog hygiene (criteria present, sprints fit capacity). |

By Aditya Mathur.
