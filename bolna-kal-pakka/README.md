# Kal pakka?

Which voice-agent calls to listen to first. A call-QA setup built only on Bolna's own extractions (dispositions), tested with Bolna's test-dispositions endpoint.

**Live page:** https://adimathur-creates.github.io/bolna-kal-pakka/

- `src/dispositions.js` — the final questions (13 failure codes in two passes, plus collections outcome, promise date and amount), exactly as configured in Bolna.
- `src/rules.js` — plain string checks for gender slips, leaked text and filler overuse, which the extraction missed on long calls.
- `src/playbook.js` — for each failure: what it costs, the prompt line that fixes it, the Bolna setting, and where I hit it in my own agents.
- `data/calls.js` — 36 hand-written, labelled Hinglish calls (12 dev, 24 held out). `data/real.js` — 3 of my own Bolna calls.
- `results/runs.jsonl` — every Bolna result I recorded. `results/notes.md` — what changed between versions and why.
- `src/score.js`, `src/report.js`, `src/build_page.js` — scoring and the page.

```
node test/score.test.js        # 6 tests
node src/report.js && node src/build_page.js
```

Independent work, not affiliated with Bolna. Brands and people in the test calls are invented.
