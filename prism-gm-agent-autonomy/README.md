# Who signs off? An autonomy policy for an AI hotel GM

Live: https://adimathur-creates.github.io/prism-gm-agent-autonomy/

An AI agent that runs a hotel's daily operations needs a rule for which actions it may take alone, which it may take with an undo window, and which wait for the owner. This project proposes a tiered autonomy policy (AUTO / UNDO / APPROVE / BLOCK), an audit record for every action, and a simulation of 150 hotels × 30 days comparing four policies.

Independent work from public sources. Not affiliated with PRISM. All action types, amounts and error rates are labelled assumptions.

## Findings (simulated)
- Tiers keep ~70% of actions hands-free and cut money lost to agent mistakes by ~72% vs full autonomy, using ~15 owner-minutes a day instead of 43.
- Fixing the agent's inputs (missing facts, low confidence) is the biggest lever: hands-free rises to ~81%, owner time falls to ~10 min.
- "Earned autonomy" (graduating an action after 20 clean approvals) was tested and parked: ~1 minute a day saved, slightly more harm.
- Caveat: if owners answer within 2 hours, approving every step loses the least money, at a large cost in owner time.

## Run
```
node test/all.test.js     # 17 tests
node src/build_page.js    # rebuilds index.html
```
`src/policy.js` — the tier rules and audit record. `src/simulate.js` — the simulation and every assumption.
