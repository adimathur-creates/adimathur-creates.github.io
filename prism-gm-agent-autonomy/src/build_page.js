// Builds ../index.html. Run: node src/build_page.js
const fs = require("fs"), path = require("path");
const P = require("./policy.js"), S = require("./simulate.js");
const read = (f) => fs.readFileSync(path.join(__dirname, f), "utf8");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const N = 10, base = S.seeds(N, { hotels: 150 }), comp = S.seeds(N, Object.assign({ hotels: 150 }, S.COMPLETE));
const avg = (runs, p, k) => runs.reduce((s, r) => s + r[p][k], 0) / runs.length;
const pick = (runs, p) => { const o = {}; for (const k of ["auto", "undo", "approve", "minutesPerHotelDay", "harmPerHotelMonth", "delayPerHotelMonth", "totalPerHotelMonth", "caughtShare"]) o[k] = avg(runs, p, k); o.free = o.auto + o.undo; return o; };
const M = { autonomous: pick(base, "autonomous"), every_step: pick(base, "every_step"), tiers: pick(base, "tiers"), inputs: pick(comp, "tiers"), earned: pick(base, "earned") };
const ARMS = ["autonomous", "every_step", "tiers", "inputs"];
const NAME = { autonomous: "Fully autonomous", every_step: "Owner approves every step", tiers: "Autonomy tiers", inputs: "Tiers + complete inputs" };
const pct = (x, d = 0) => (x * 100).toFixed(d) + "%", usd = (x) => "$" + Math.round(x).toLocaleString("en-US");
const HOURLY = 30, ownerCost = (m) => m * 30 / 60 * HOURLY; // owner minutes/day -> $ per month
const harmCut = 1 - M.tiers.harmPerHotelMonth / M.autonomous.harmPerHotelMonth;

// per-action tier mix under fixed tiers, typical inputs
const mix = Object.keys(P.ACTIONS).map((t) => {
  const A = P.ACTIONS[t], d = P.tier({ type: t, confidence: 0.92, evidence: 1, money: A.money });
  return `<tr><td>${esc(A.label)}</td><td class="num">$${A.money.toLocaleString("en-US")}</td><td class="num">${A.undoHours ? A.undoHours + "h" : "no"}</td><td><span class="pill t-${d.tier}">${d.tier}</span></td><td class="note">${esc(d.reasons.join("; "))}</td></tr>`;
}).join("");

const sens = [["Agent error rate 2% (base 4%)", { baseError: 0.02 }], ["Agent error rate 8%", { baseError: 0.08 }], ["Careless owners: catch 60% when asked, 25% in undo window", { approveCatch: 0.6, undoCatch: 0.25 }], ["Owner answers in 2 hours (base 6)", { waitHours: 2 }], ["Hotel data quality varies twice as much", { hotelSpread: 1.8 }]]
  .map(([l, o]) => { const r = S.run(Object.assign({ hotels: 120 }, o)); return `<tr><td>${esc(l)}</td>${["autonomous", "every_step", "tiers"].map((p) => `<td class="num">${usd(r[p].totalPerHotelMonth)} · ${r[p].minutesPerHotelDay.toFixed(0)} min</td>`).join("")}</tr>`; }).join("");

const chart = ARMS.map((k) => ({ k, name: NAME[k], free: M[k].free, minutes: M[k].minutesPerHotelDay, cost: M[k].totalPerHotelMonth }));

const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Who signs off? An autonomy policy for an AI hotel GM · Aditya Mathur</title>
<meta name="description" content="An AI agent that runs a hotel's daily operations needs a rule for which actions it may take alone. A tiered autonomy policy, an audit record for every action, a simulation of a month across 150 hotels, and a rollout plan.">
<style>
:root{--bg:#fafaf8;--surface:#fff;--ink:#15151f;--ink-soft:#3b414b;--muted:#5b6170;--line:#e4e3de;--accent:#2b4fd8;--accent-soft:#eaeefc;--tag:#f0efea;--good:#1f6b45;--good-soft:#e5f3eb;--bad:#a5332a;--bad-soft:#fbeae8;--warn:#8a5a10;--warn-soft:#fbf1df;--s1:#c9ccd3;--s2:#7d828d;--s3:#4d6be0;--s4:#182c86;--grid:#ebeae6}
@media (prefers-color-scheme:dark){:root{--bg:#101215;--surface:#171a1f;--ink:#e9ebee;--ink-soft:#c3c8d0;--muted:#9aa1ad;--line:#2a2e36;--accent:#8ea6ff;--accent-soft:#1a2140;--tag:#1f232a;--good:#6fd09c;--good-soft:#142a1e;--bad:#f09186;--bad-soft:#2d1816;--warn:#f0b86e;--warn-soft:#2a2214;--s1:#3a3f48;--s2:#6b717d;--s3:#7d96f5;--s4:#c4cfff;--grid:#24272d}}
*{box-sizing:border-box}html,body{margin:0}body{background:var(--bg);color:var(--ink);font:16px/1.62 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,sans-serif}
a{color:var(--accent);text-underline-offset:3px}a.src{font-size:12px;white-space:nowrap}.wrap{max-width:980px;margin:0 auto;padding:44px 18px 80px}
.kicker{font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:0 0 10px}h1{font-size:clamp(30px,5vw,44px);line-height:1.08;margin:0 0 12px;letter-spacing:-.02em}
.lede{font-size:19px;color:var(--muted);margin:0 0 14px;max-width:820px}.byline{font-size:14px;color:var(--muted);display:flex;flex-wrap:wrap;gap:4px 16px}
.disclaimer{font-size:13px;color:var(--muted);border-left:3px solid var(--line);padding:4px 0 4px 12px;margin:18px 0 0}
h2{font-size:24px;line-height:1.2;margin:56px 0 10px;letter-spacing:-.01em}h2 .n{color:var(--muted);font-weight:500;margin-right:8px}h3{font-size:17px;margin:22px 0 6px}
p{margin:0 0 12px}ul,ol{margin:0 0 14px;padding-left:22px}li{margin:5px 0}
.tldr{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:20px 22px;margin:28px 0 0}.tldr h2{margin:0 0 10px;font-size:15px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:18px 0 6px}.stat{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px}
.stat b{display:block;font-size:26px;line-height:1.1}.stat span{font-size:13.5px;color:var(--muted);display:block;margin-top:4px;line-height:1.35}
table{border-collapse:collapse;width:100%;font-size:14px;margin:10px 0 14px;background:var(--surface);border:1px solid var(--line)}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}th{font-size:12px;letter-spacing:.03em;text-transform:uppercase;color:var(--muted);font-weight:600;background:var(--tag)}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}tr.top td{background:var(--accent-soft)}.tablewrap{overflow-x:auto}.note{font-size:13px;color:var(--muted);font-weight:400}
.callout{background:var(--accent-soft);border-radius:12px;padding:14px 16px;margin:14px 0}.callout.warn{background:var(--warn-soft)}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}.grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px 16px}.card h3{margin-top:0}
.pill{display:inline-block;font-size:12px;font-weight:700;letter-spacing:.04em;padding:2px 9px;border-radius:999px}
.t-AUTO{background:var(--good-soft);color:var(--good)}.t-UNDO{background:var(--accent-soft);color:var(--accent)}.t-APPROVE{background:var(--warn-soft);color:var(--warn)}.t-BLOCK{background:var(--bad-soft);color:var(--bad)}
.chart{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:10px 12px;position:relative}.chart svg{width:100%;height:auto;display:block}
.chart text{fill:var(--muted);font-size:12px;font-family:inherit}.chart .lab{fill:var(--ink);font-size:13px;font-weight:600}.chart .val{fill:var(--ink);font-size:12px}
figure{margin:14px 0 18px}figcaption{font-size:13.5px;color:var(--muted);margin-top:6px}
.tip{position:absolute;pointer-events:none;background:var(--ink);color:var(--bg);font-size:12.5px;padding:6px 9px;border-radius:8px;opacity:0;transition:opacity .1s;max-width:260px;line-height:1.4}
.legend{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:13px;color:var(--ink-soft);margin:6px 0 0 4px}.legend i{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:6px;vertical-align:-1px}
.insp{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px;display:grid;grid-template-columns:1fr 1.2fr;gap:18px}
.insp label{display:flex;flex-direction:column;gap:3px;font-size:13px;color:var(--ink-soft);margin-bottom:10px}
.insp select,.insp input[type=number]{font:inherit;font-size:14px;padding:5px 8px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink)}
input[type=range]{width:100%;accent-color:var(--accent)}.big{font-size:22px;font-weight:700}
pre{font:12.5px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:10px 12px;overflow-x:auto;margin:8px 0 0;white-space:pre-wrap}
code{font-size:13px;background:var(--tag);padding:1px 5px;border-radius:4px}.sources li{font-size:13.5px}
@media (max-width:760px){.stats,.grid4{grid-template-columns:1fr 1fr}.grid2,.insp{grid-template-columns:1fr}}
</style></head><body><div class="wrap">
<p class="kicker">Product proposal · AI operations · written for PRISM</p>
<h1>Who signs off?</h1>
<p class="lede">An AI agent that runs a hotel's day will make thousands of small decisions and a few expensive ones. "Fully autonomous" and "approve every step" are both expensive. A tiered autonomy policy decides, action by action, what the agent may do alone, what it may do with an undo window, and what waits for the owner. Every decision leaves a record a person can audit.</p>
<div class="byline"><span>Aditya Mathur</span><span>Bengaluru</span><span>November 2026</span><span><a href="https://github.com/adimathur-creates/adimathur-creates.github.io/tree/main/prism-gm-agent-autonomy">Code and 17 tests</a></span></div>
<p class="disclaimer">Independent work from public sources. Not affiliated with or reviewed by PRISM. I don't know how the GM Agent works inside. Action types, dollar amounts and error rates are labelled assumptions, and the simulation shows the trade-offs, not PRISM's numbers.</p>

<section class="tldr"><h2>The short version</h2>
<ul>
<li><b>Context.</b> PRISM's FY26 annual report describes a GM Agent that runs a hotel's daily operations, such as reconciliation, vendor renewals, occupancy calls and review action plans, "without a human triggering each step" <a class="src" href="https://www.hospitalitynet.org/opinion/4134191/the-gm-agent-has-no-manager">[source]</a>. Industry commentators have asked who answers for its mistakes <a class="src" href="https://www.hospitalitynet.org/news/4134234/oyos-autonomous-gm-agent-has-no-one-to-answer-to-one-hotel-cut-ota-dependency-from-100-to-10-in-a-year-what-hotel-groups-really-want-from-vendors">[source]</a>. Owners will ask the same thing before they let it near their money.</li>
<li><b>The trade-off.</b> In hotel pricing, letting the algorithm decide cut expected mispricing loss by 4–36% compared with how managers actually used it <a class="src" href="https://www.cesifo.org/DocDL/cesifo1_wp10849.pdf">[source]</a>. Yet revenue managers override system recommendations often more than half the time <a class="src" href="https://www.phocuswire.com/opinion/technology/why-ai-pricing-fails-hotels-what-needs-to-change">[source]</a>. Too much human review wastes the agent; too little hands owners a risk they can't see.</li>
<li><b>The result (simulated, ${N} runs × 150 hotels × 30 days).</b> Autonomy tiers kept <b>${pct(M.tiers.free)}</b> of actions hands-free and cut the cost of agent mistakes by <b>${pct(harmCut)}</b> compared with full autonomy, using <b>${M.tiers.minutesPerHotelDay.toFixed(0)}</b> owner-minutes a day instead of ${M.every_step.minutesPerHotelDay.toFixed(0)}.</li>
<li><b>The biggest lever isn't the policy.</b> Most approvals come from the agent proposing actions with missing facts or low confidence. Fixing those inputs took hands-free actions to <b>${pct(M.inputs.free)}</b> and owner time to <b>${M.inputs.minutesPerHotelDay.toFixed(0)} minutes</b>. So I'd build data completeness before a cleverer approval engine.</li>
<li><b>Tested and parked:</b> "earned autonomy", where an action type graduates after a clean record at a hotel. It saved about ${(M.tiers.minutesPerHotelDay - M.earned.minutesPerHotelDay).toFixed(0)} owner-minute a day and slightly increased harm. Not worth building first.</li>
</ul></section>

<div class="stats">
<div class="stat"><b>${pct(M.tiers.free)}</b><span>of agent actions run without waiting for the owner, under tiers</span></div>
<div class="stat"><b>${pct(harmCut)}</b><span>less money lost to agent mistakes than full autonomy</span></div>
<div class="stat"><b>${M.tiers.minutesPerHotelDay.toFixed(0)} vs ${M.every_step.minutesPerHotelDay.toFixed(0)}</b><span>owner-minutes a day: tiers vs approving every step</span></div>
<div class="stat"><b>${pct(M.inputs.free)}</b><span>hands-free once the agent's inputs are complete</span></div>
</div>

<h2><span class="n">1</span>Why this is the problem to solve now</h2>
<div class="grid2">
<div class="card"><h3>What PRISM is building</h3><ul>
<li>India runs technology, pricing, reservations, analytics and support for every market. The company reports that 94% of new code is AI-authored, and a GM Agent is in development <a class="src" href="https://skift.com/?p=836066">[source]</a>.</li>
<li>AI-led pricing and service tools are already deployed at individual properties, with owner engagement centralised from India <a class="src" href="https://www.kotakneo.com/news/ipos/oyo-parent-prism-fy26-profit-994-crore/">[source]</a>.</li>
<li>Motel 6 and Studio 6, US franchise businesses, are about 46% of gross booking value <a class="src" href="https://skift.com/?p=836066">[source]</a>. A franchisee owns the P&amp;L the agent acts on.</li></ul></div>
<div class="card"><h3>Who feels it</h3><ul>
<li><b>Owner or franchisee:</b> wants fewer chores, but not a surprise refund, a renewed contract or a guest moved to another hotel without knowing why.</li>
<li><b>PRISM's partner team:</b> answers when an owner disputes what the agent did. Without a record, every dispute is a he-said-she-said.</li>
<li><b>Guest:</b> gets an instant refund or reply when the agent can act, and a wrong one when it shouldn't have.</li></ul></div>
</div>

<h2><span class="n">2</span>The policy: try it</h2>
<p>Pick an action the agent wants to take and change what it knows. The policy returns a tier, the reasons, and the audit record the action leaves behind.</p>
<div class="insp" id="insp">
<div>
<label>Action<select id="iType">${Object.entries(P.ACTIONS).map(([k, a]) => `<option value="${k}"${k === "guest_refund" ? " selected" : ""}>${esc(a.label)}</option>`).join("")}</select></label>
<label>Money at stake ($)<input type="number" id="iMoney" value="80" min="0" step="10"></label>
<label>Agent confidence: <span id="oConf">92%</span><input type="range" id="iConf" min="50" max="100" value="92"></label>
<label>Facts present: <span id="oEv">100%</span><input type="range" id="iEv" min="40" max="100" value="100"></label>
<label>Owner's past approvals of this action at this hotel<select id="iHist"><option value="none">None yet</option><option value="clean">25 approved, all accepted</option><option value="reversed">25 approved, 1 reversed</option></select></label>
</div>
<div><div><span class="pill" id="oTier">AUTO</span></div><ul id="oReasons" style="margin-top:10px"></ul><div class="note">Audit record</div><pre id="oAudit"></pre></div>
</div>
<h3>The default tier for each action</h3>
<div class="tablewrap"><table><tr><th>Action</th><th class="num">Typical $</th><th class="num">Undoable</th><th>Tier</th><th>Why</th></tr>${mix}</table></div>
<div class="grid4">
<div class="card"><span class="pill t-AUTO">AUTO</span><p style="margin-top:8px">Small, reversible, facts complete, agent confident. Done and logged.</p></div>
<div class="card"><span class="pill t-UNDO">UNDO</span><p style="margin-top:8px">Done now. The owner gets a notice and can reverse it within the window.</p></div>
<div class="card"><span class="pill t-APPROVE">APPROVE</span><p style="margin-top:8px">Waits for a yes: $1,000 or more, missing facts, low confidence, or guest-facing and irreversible.</p></div>
<div class="card"><span class="pill t-BLOCK">BLOCK</span><p style="margin-top:8px">Commits future spend, such as a vendor renewal. The agent drafts it; a person signs.</p></div>
</div>

<h2><span class="n">3</span>What it does over a month (simulated)</h2>
<p>150 hotels, 30 days, about ${Math.round(base[0].meta.actions / 150 / 30)} agent actions per hotel per day, ${N} runs. Agent accuracy varies by hotel, because some properties have messier data than others. Every arm sees the same actions.</p>
<figure class="chart" id="c1"><div class="tip"></div></figure>
<div class="legend">${ARMS.map((k, i) => `<span><i style="background:var(--s${i + 1})"></i>${esc(NAME[k])}</span>`).join("")}</div>
<figcaption>Hands-free: higher is better. Owner minutes and money lost: lower is better.</figcaption>
<div class="tablewrap"><table>
<tr><th>Arm</th><th class="num">Hands-free</th><th class="num">Owner min / day</th><th class="num">Mistakes caught</th><th class="num">Lost to mistakes / month</th><th class="num">Lost to waiting / month</th><th class="num">Owner time / month</th></tr>
${ARMS.map((k) => `<tr${k === "inputs" ? ' class="top"' : ""}><td><b>${esc(NAME[k])}</b></td><td class="num">${pct(M[k].free)}</td><td class="num">${M[k].minutesPerHotelDay.toFixed(1)}</td><td class="num">${pct(M[k].caughtShare)}</td><td class="num">${usd(M[k].harmPerHotelMonth)}</td><td class="num">${usd(M[k].delayPerHotelMonth)}</td><td class="num">${usd(ownerCost(M[k].minutesPerHotelDay))}</td></tr>`).join("")}
</table></div>
<p class="note">Per hotel. "Lost to waiting" is money lost when an urgent action, such as tonight's rate or a guest move, waits past its window for an owner's yes. Owner time is priced at $${HOURLY} an hour, which is my assumption.</p>
<div class="callout"><b>Why "approve every step" isn't the safe option.</b> It catches the most mistakes, but urgent actions miss their window while the owner is busy. The money lost to waiting is larger than the money it saves on mistakes, and the owner spends ${M.every_step.minutesPerHotelDay.toFixed(0)} minutes a day clicking yes. Owners who are asked 30 times a day stop reading, and the catch rate falls (see the sensitivity table).</div>
<h3>Does it survive different assumptions?</h3>
<div class="tablewrap"><table><tr><th>Change one assumption</th><th class="num">Fully autonomous</th><th class="num">Every step</th><th class="num">Tiers</th></tr>${sens}</table></div>
<p class="note">Each cell: money lost per hotel-month (mistakes + waiting) · owner minutes a day. Tiers beat full autonomy on money in every row. When owners answer within 2 hours, approving every step loses the least money, but it still costs ${M.every_step.minutesPerHotelDay.toFixed(0)} minutes a day of a GM's attention.</p>
<div class="callout warn"><b>Tested and parked: earned autonomy.</b> Letting an action type graduate to hands-free after 20 clean approvals at a hotel moved hands-free from ${pct(M.tiers.free)} to ${pct(M.earned.free)}. It saved ${(M.tiers.minutesPerHotelDay - M.earned.minutesPerHotelDay).toFixed(1)} owner-minutes a day, and raised money lost to mistakes from ${usd(M.tiers.harmPerHotelMonth)} to ${usd(M.earned.harmPerHotelMonth)}. Most approvals come from missing facts and low confidence, which a track record shouldn't override. Revisit once inputs are fixed.</div>

<h2><span class="n">4</span>Spec</h2>
<h3>Rules (v1)</h3>
<ol>
<li>A stated hard rule always wins: missing facts, confidence under 80%, or $1,000 or more means asking. No track record overrides it.</li>
<li>Irreversible and guest-facing, such as refunds or moving a guest, waits for a yes by default.</li>
<li>Anything that commits future spend is blocked. The agent drafts it and a person signs.</li>
<li>Every action writes an audit record: what, how much, the facts it used, its confidence, the tier, why, who decided, and until when it can be undone.</li>
<li>The owner can tighten any rule for their hotel, but can't loosen the hard rules.</li>
</ol>
<h3>What to build first</h3>
<ol>
<li><b>The audit record and owner digest.</b> Without them, no other rule can be checked, and disputes can't be settled.</li>
<li><b>Input completeness:</b> close the gaps that make the agent propose actions with missing facts, such as PMS, bank and channel-manager feeds. That's the biggest lever on owner time in the simulation.</li>
<li><b>Tiers,</b> rolled out in shadow mode first.</li>
</ol>
<h3>Rollout</h3>
<ol>
<li><b>Shadow (4 weeks):</b> the agent proposes, the tier is logged, people still act. For each action type, measure how often the agent would have been wrong, by hotel.</li>
<li><b>Grant tiers by action type,</b> starting with rate changes and housekeeping, where mistakes are small and reversible. Refunds and guest moves come last.</li>
<li><b>Randomise by hotel</b> (tiers vs the current process). Primary metric: owner minutes a day. Guardrails: money lost to agent mistakes, guest complaints, owner disputes.</li>
</ol>
<h3>Metrics</h3>
<div class="tablewrap"><table><tr><th>Metric</th><th>Why</th></tr>
<tr><td>Hands-free share by action type</td><td>Value delivered to the owner</td></tr>
<tr><td>Owner minutes a day</td><td>The cost of oversight, and the reason owners would pay</td></tr>
<tr><td>Reversal rate in undo windows</td><td>The best early warning that an action type has drifted</td></tr>
<tr><td>Disputes per 1,000 actions, and time to resolve</td><td>Whether the audit record actually settles arguments</td></tr>
<tr><td>Missing-facts rate on proposed actions</td><td>The input problem behind most approvals</td></tr>
</table></div>
<h3>Questions I'd bring to the team</h3>
<ul>
<li>Which GM Agent actions are live today, and what share of its proposals does a person currently change?</li>
<li>When an owner disputes an agent decision, what record exists now, and how long does it take to resolve?</li>
<li>Do US franchisees and Indian partner hotels want the same rules? My guess is no: different money at stake, different trust.</li>
</ul>

<h2><span class="n">5</span>Method and limits</h2>
<ul>
<li>Action types, dollar amounts, frequencies and error rates are my assumptions, in <code>src/policy.js</code> and <code>src/simulate.js</code>. The conclusions are about direction and trade-offs, not PRISM's actual costs.</li>
<li>A mistake costs a share of the money at stake, doubled when it's guest-facing. Reputation and owner churn aren't modelled, which understates the cost of full autonomy.</li>
<li>Owners are assumed to catch 85% of mistakes when asked and 45% in an undo window. The sensitivity table shows what happens when they're less careful.</li>
<li>Deterministic rules, no model calls: the policy has to be explainable to an owner and reproducible in a dispute.</li>
</ul>
<h3>Sources</h3>
<ol class="sources">
<li><a href="https://www.hospitalitynet.org/opinion/4134191/the-gm-agent-has-no-manager">Hospitality Net, "The GM Agent Has No Manager"</a> — GM Agent scope as described in PRISM's FY26 annual report</li>
<li><a href="https://www.hospitalitynet.org/news/4134234/oyos-autonomous-gm-agent-has-no-one-to-answer-to-one-hotel-cut-ota-dependency-from-100-to-10-in-a-year-what-hotel-groups-really-want-from-vendors">Hospitality Net newsletter, Sept 2026</a> — accountability questions about the GM Agent</li>
<li><a href="https://skift.com/?p=836066">Skift, "What Prism's annual report reveals"</a> — India operating engine, 94% AI-authored code, GM Agent, G6 share of GBV</li>
<li><a href="https://www.kotakneo.com/news/ipos/oyo-parent-prism-fy26-profit-994-crore/">Kotak Neo / PTI, Aug 2026</a> — FY26 results, AI pricing and service tools at property level</li>
<li><a href="https://www.cesifo.org/DocDL/cesifo1_wp10849.pdf">Garcia, Tolvanen and Wagner, CESifo working paper</a> — delegating hotel pricing to the algorithm cuts expected loss 4–36%</li>
<li><a href="https://www.phocuswire.com/opinion/technology/why-ai-pricing-fails-hotels-what-needs-to-change">PhocusWire, "Why AI pricing fails hotels"</a> — revenue managers override recommendations often more than half the time</li>
</ol>
<p class="note">Built by Aditya Mathur. <a href="../">More work</a>.</p>
</div>
<script>
${read("policy.js")}
(function(){
  const P = window.Policy, $ = (s) => document.querySelector(s);
  const H = { none: null, clean: { approved: 25, accepted: 25, reversals: 0 }, reversed: { approved: 25, accepted: 24, reversals: 1 } };
  $("#iType").addEventListener("change", () => { $("#iMoney").value = P.ACTIONS[$("#iType").value].money; render(); });
  function render(){
    const a = { type: $("#iType").value, money: +$("#iMoney").value, confidence: +$("#iConf").value / 100, evidence: +$("#iEv").value / 100 };
    $("#oConf").textContent = $("#iConf").value + "%"; $("#oEv").textContent = $("#iEv").value + "%";
    const d = P.tier(a, H[$("#iHist").value]); $("#oTier").textContent = d.tier; $("#oTier").className = "pill t-" + d.tier;
    $("#oReasons").innerHTML = d.reasons.map((r) => "<li>" + r + "</li>").join("");
    $("#oAudit").textContent = JSON.stringify(P.auditRecord(a, d, "MOTEL-6-0412", new Date().toISOString().slice(0, 16) + "Z"), null, 2);
  }
  ["#iMoney", "#iConf", "#iEv", "#iHist"].forEach((s) => $(s).addEventListener("input", render)); render();
  const data = ${JSON.stringify(chart)}, metrics = [["free", "Hands-free actions", (v) => Math.round(v * 100) + "%"], ["minutes", "Owner minutes a day", (v) => v.toFixed(0)], ["cost", "Money lost per hotel-month", (v) => "$" + Math.round(v).toLocaleString("en-US")]];
  const W = 900, H2 = 320, pl = 20, pr = 20, pt = 30, pb = 40, el = document.getElementById("c1"), tip = el.querySelector(".tip");
  const gw = (W - pl - pr) / 3, bw = 40, gap = 6; let s = '<svg viewBox="0 0 ' + W + ' ' + H2 + '" role="img" aria-label="Outcomes by autonomy policy">';
  metrics.forEach(([k, label, f], gi) => { const max = Math.max(...data.map((d) => d[k])) * 1.15 || 1, gx = pl + gi * gw, x0 = gx + (gw - (bw * 4 + gap * 3)) / 2, base = H2 - pb;
    s += '<text class="lab" x="' + (gx + gw / 2) + '" y="' + (H2 - 14) + '" text-anchor="middle">' + label + '</text><line x1="' + (gx + 10) + '" x2="' + (gx + gw - 10) + '" y1="' + base + '" y2="' + base + '" stroke="var(--grid)"/>';
    data.forEach((d, i) => { const h = (base - pt) * d[k] / max, x = x0 + i * (bw + gap);
      s += '<rect class="b" data-t="' + d.name + ': ' + f(d[k]) + '" x="' + x + '" y="' + (base - h) + '" width="' + bw + '" height="' + Math.max(1, h) + '" rx="4" fill="var(--s' + (i + 1) + ')"/>';
      s += '<text class="val" x="' + (x + bw / 2) + '" y="' + (base - h - 6) + '" text-anchor="middle">' + f(d[k]) + '</text>'; }); });
  s += '</svg>'; el.innerHTML = s; el.appendChild(tip);
  el.querySelectorAll("rect.b").forEach((r) => { r.addEventListener("mousemove", (e) => { tip.textContent = r.dataset.t; const b = el.getBoundingClientRect(); tip.style.left = Math.min(e.clientX - b.left + 12, b.width - 270) + "px"; tip.style.top = (e.clientY - b.top - 30) + "px"; tip.style.opacity = 1; }); r.addEventListener("mouseleave", () => tip.style.opacity = 0); });
})();
</script></body></html>`;
fs.writeFileSync(path.join(__dirname, "..", "index.html"), html);
console.log("ok", html.length, JSON.stringify({ tiersFree: M.tiers.free, harmCut, minT: M.tiers.minutesPerHotelDay, minE: M.every_step.minutesPerHotelDay, inputsFree: M.inputs.free, minI: M.inputs.minutesPerHotelDay, earnedSave: M.tiers.minutesPerHotelDay - M.earned.minutesPerHotelDay, costs: ARMS.map((k) => Math.round(M[k].totalPerHotelMonth)), actionsPerDay: base[0].meta.actions / 150 / 30 }));
