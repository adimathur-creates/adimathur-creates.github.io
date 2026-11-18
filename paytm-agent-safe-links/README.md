# Agent-safe Payment Links

Independent product concept for Paytm Payment Links / Payment Pages. Not affiliated with Paytm.

**Problem:** Paytm's MCP server lets a merchant's AI agent create payment links and start refunds from a plain prompt. A link created with a contact is sent to the customer automatically, and the connector's sign-in has no read vs write permission. An agent mistake becomes an SMS with a payment request to a real person, or money leaving the account.

**What this is:** a policy gate between the agent and the tools. Every write is AUTO (run), CONFIRM (merchant taps approve) or BLOCK (refused with a reason the agent can act on).

- `source/src/amount.js`: Indian-English / Hinglish amount parser that surfaces ambiguity ("1.5", "15,00") instead of guessing
- `source/src/engine.js`: the rules (scope, instruction source, amount match, recipient, duplicates, expiry, part payments, scam wording, refunds, velocity)
- `source/src/cases.js`: 41 scripted agent proposals with expected decisions (no model was run)
- `source/src/sim.js`: 30-day simulation of 3 fictional merchants; every rate is an assumption
- `source/test/engine.test.js`: 12 tests (`node --test source/test/*.test.js`); the page runs the same 12 checks on load
- `source/build.js`: builds `index.html`

Built by Aditya Mathur with Claude, Nov 2026.
