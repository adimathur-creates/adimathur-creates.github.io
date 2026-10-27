# Within the Rules

A 0-to-1 bet for Sarvam: check every collections voice call against India's recovery rules, before dialling and after hanging up, and name who has to fix each failure. Built as independent work for Sarvam's Founder's Office (Strategy & Operations Associate). Live page: https://adimathur-creates.github.io/sarvam-within-the-rules/

**All calls are synthetic.** 19 transcripts written by hand for a made-up lender. RBI rules follow press reports of the RBI (Commercial Banks – Responsible Business Conduct) Amendment Directions, 2026; check the final text before relying on them.

## What it does

- **Pre-dial gate:** calling hours (8 am to 7 pm), bereavement, wedding and grievance flags, daily attempt cap.
- **Call audit:** 10 rules. Every finding quotes its evidence.
- **One owner per failure:** pre-dial, agent said it, missed signal, or possibly misheard. A low-confidence customer turn that is close to a trigger word ("gujar" vs "guzar", meaning died) goes to a person instead of being called clean.

## Files

| File | What it is |
|---|---|
| `engine.js` | Rules, pre-dial gate, audit, evaluation, scale model, transcript parser |
| `calls.js` | 19 labelled test calls, including two deliberately hard ones |
| `index.html` | The bet, the live auditor, honest results, the 2-week test plan |
| `test.mjs` | `node test.mjs`: 19 calls and 9 behaviour checks |

## Results on the test calls

12 of 13 labelled violations found, 1 false alarm, 1 of 1 possible mishearings sent to a person. Both errors are hard cases written on purpose. These are my own calls, so this is a check that the rules work as described, not a measure of real-world accuracy.

Aditya Mathur · adityamathur2004@gmail.com
