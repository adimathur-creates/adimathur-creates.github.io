# Checkout events partners can trust

> **Simulation on fictional data.** Every merchant, partner app, failure rate and outage is made up.
> The legacy payload shapes are illustrative, not any company's real API. Not affiliated with GoKwik.

Independent product work by Aditya Mathur for the Assistant Product Manager, Platform role at GoKwik.
Built with Claude.

## What it is
A platform spec and working simulator for one webhook contract for checkout events that behaves the same on
every checkout setup (one-click modal, blocks inside the store platform's checkout, custom storefront):
one documented payload, signed requests, 8 delivery tries over 24 hours, a dead-letter queue with replay,
stable event IDs, self-serve subscriptions and a delivery log.

Default run (fictional): 93,254 subscribed deliveries, 40 merchants, 5 partner apps, 30 days.
Share arriving usable within 5 minutes: 73.1% today vs 99.7% on the contract. Silent losses 4,060 -> 0.
Double actions by partner apps 719 -> 0.

## Files
- `index.html`: the whole page, self-contained (no network calls). Open it in a browser.
- `src/core.js`: simulator, normaliser and contract checker (used by the page and the tests).
- `src/template.html`: page source; `node build.js` inlines core.js, the guide and the SQL into index.html.
- `docs/integration-guide.md`: draft partner integration guide (made-up endpoints).
- `docs/queries.sql`: PostgreSQL for adoption and reliability metrics (illustrative tables).
- `tests/core.test.js`: 23 checks. Run `node --test tests/core.test.js` (Node 18+).

## Limits
Direction, not size. Rates and the "which shapes each partner handles" settings are my assumptions.
Not checked against GoKwik's systems. If retries or signing already exist, the gap is smaller.
