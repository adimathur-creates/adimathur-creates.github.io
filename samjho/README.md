# Samjho: voice problem intake for small shop owners

Built by Aditya Mathur at the AI Garage × Paytm Voice AI Buildathon, Bengaluru, 18 Oct 2026.

**Problem:** A small shop owner who takes Paytm payments can describe a daily problem in messy Hinglish, but a builder cannot act on that. Samjho interviews the owner by voice and turns the conversation into a problem brief the owner confirms.

## Links
- How it works (step-by-step replay): https://adimathur-creates.github.io/samjho/flow.html
- Owner console: https://adimathur-creates.github.io/samjho/ (`?u=demo` shows the voice session)
- History log: https://adimathur-creates.github.io/samjho/history.html
- Workflow source: [`source/`](source/)

## Design rule: the voice is only the mouth, the database decides
1. **Ears and voice:** Bolna, with Sarvam saaras:v4 (Hindi speech to text) and Bulbul v3 (female voice).
2. **Voice brain:** a custom OpenAI-compatible endpoint replaces Bolna's own LLM, so every turn goes through the rules. It joins partial transcripts and lets the latest version win.
3. **Understand the answer:** each answer is split into statements and tagged as observation, claim, assumption or gap. Each statement keeps the exact quote, is filed under the question it really answers, and is checked against earlier numbers for contradictions.
4. **Rules in Postgres (Supabase):**
   - No quote, no line.
   - Max 2 follow-ups per question.
   - Covered questions are skipped.
   - Duplicate guard.
   - Undo for a superseded partial answer.
   - Pause and resume.
5. **Owner review:** the owner confirms, edits, removes, or chooses share/redact on each line. Approval is blocked until everything is reviewed. Cancel shares nothing. The public copy is redacted.
6. **History log:** "seen before" detection across interviews, plus a list of fixes already tried. This was added after feedback from Paytm team members.

## Hosting note
The buildathon version ran its orchestration and AI step on n8n Cloud. This hosted copy runs with no paid services: the browser talks to the same Supabase functions, and the AI tagging step is replaced by a transparent rules engine (keyword rules for assumption, observation and sensitive data, plus a follow-up when a number is missing). The database rules are identical.

## Failure log (real failures during the build)
| # | What broke | Root cause | Fix |
|---|---|---|---|
| 1 | AI step returned "Bad request" | Model not allowed on the AI credits | Switched model. The fallback asked the owner to repeat, so the answer was not lost. |
| 2 | 10 s delay, cut-off output | Default "thinking" used up the output budget | Thinking off; turns now take about 5 s |
| 3 | "30 minutes" then "2 hours" was not challenged | No contradiction check | Contradiction is checked first |
| 4 | Re-asked a question the owner had already answered | Statements were filed only under the current question | Statements filed under the question they answer; covered questions skipped |
| 5 | Retries could double-count | n/a | Duplicate guard (same text within 30 s) |
| 6 | Voice agent invented questions, said "samajh gaya" in a female voice, said "ek second" | Bolna's LLM skipped the backend on about half the turns | Replaced it with the Samjho engine; feminine voice rule; no filler |
| 7 | One spoken answer jumped 5 questions | Bolna streams growing partial transcripts (10 sends in 22 s) | Latest-wins tickets plus rollback of the shorter version |
