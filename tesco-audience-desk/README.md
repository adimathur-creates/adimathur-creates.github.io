# Audience Desk

One front door for customer segment requests. Built as independent work for Tesco's Data & AI customer data products team (APM role, Bengaluru). Live page: https://adimathur-creates.github.io/tesco-audience-desk/

**All data is synthetic.** The catalogue, filters and 40,000 households are generated from a fixed seed. No Tesco data was used. Thresholds are proposals, not Tesco policy.

## What it does

A marketer posts a request in plain English. The desk:

1. Reads it into a structured definition (categories, time window, filters, channel, exclusions) and asks questions where it had to assume.
2. Finds those households in the synthetic population.
3. Compares them, household by household, with every catalogue segment after applying the same reusable filters.
4. Runs six checks: channel permission, minimum size, sensitive categories, responsible alcohol, contact pressure, and whether a 10% holdout can measure the result.
5. Decides: **reuse** an existing segment, **extend** one (usually a time window), **build** a new one, **blocked**, or **needs info**.
6. Writes the Slack reply, a Jira story with acceptance criteria (only when work is needed), and a log row.

## Files

| File | What it is |
|---|---|
| `engine.js` | The whole desk. Used by the page and by the agent, so they can't drift apart. |
| `index.html` | The live page: try the desk, catalogue health, approach and metrics. |
| `agent/desk.mjs` | Run one request from the command line. Dry run by default. |
| `agent/listen.mjs` | Always-on mode: answers every new post in `#audience-requests` via a Composio Slack trigger. |
| `agent/actions.mjs` | Turns a decision into Composio calls: Jira first, then Slack (with the ticket key), then the sheet. |
| `agent/verify.mjs` | Checks every tool slug and argument name against Composio's live schema and pins versions. |
| `agent/test.mjs` | 8 request cases and 5 rule checks. |

## Run it

```bash
cd agent
npm install
npm test
node desk.mjs "Customers who haven't bought pet food for 6 weeks, email" --team "CRM Marketing"
```

Going live needs `COMPOSIO_API_KEY`, Slack, Jira and Google Sheets connected for the `DESK_USER_ID` user, then:

```bash
npm run verify          # fails loudly if any tool name or argument is wrong; writes composio.lock.json
node desk.mjs "..." --live --channel C123 --thread 1730000000.000100
npm run listen
```

## Known limits

- Not yet run against live Slack, Jira or Sheets workspaces. Tool slugs and argument names are my reading of Composio's toolkits; `verify` exists so a wrong guess fails before launch.
- Jira Cloud may need the description in Atlassian Document Format depending on the toolkit version.
- Overlap is computed on a 40,000-household sample. On real data it should run on the live segment tables.
- Request reading is rules over a fixed vocabulary. A model could read requests better; if added, the rules stay as the final check.

Aditya Mathur · adityamathur2004@gmail.com
