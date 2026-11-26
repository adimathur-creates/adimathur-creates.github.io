// Builds ../index.html. Run: node src/build_page.js
const fs = require("fs"), path = require("path");
const S = require("./sim.js"), L = require("./ledger.js");
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const lakh = (v) => "₹" + (v / 1e5).toFixed(1) + "L", n0 = (x) => Math.round(x).toLocaleString("en-IN");
const N = 10, R = S.seeds(N), RR = S.seeds(N, { alloc: "risk" });
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
function arm(rs, p) { return { loud: mean(rs.flatMap((r) => r[p].loud)), silent: mean(rs.flatMap((r) => r[p].silent)), caught: rs.reduce((s, r) => s + r[p].caught, 0), events: rs.reduce((s, r) => s + r[p].events, 0), cost: mean(rs.map((r) => r[p].cost)), fa: mean(rs.map((r) => r[p].falseAlarms)), hours: mean(rs.map((r) => r[p].auditHours)) }; }
const ARMS = { client: arm(R, "client"), confidence: arm(R, "confidence"), random: arm(R, "random"), stratified: arm(R, "stratified"), risk: arm(RR, "stratified") };
const ANAME = { client: "Wait for the client to complain", confidence: "Watch model confidence", random: "Random audits (1% of volume)", stratified: "Risk-stratified audits + confidence", risk: "Stratified, audits allocated by money at risk" };
const ORDER = ["client", "confidence", "random", "stratified", "risk"];
const perDep = Object.keys(S.DEPLOYMENTS).map((d) => { const row = { d }; for (const [k, rs, p] of [["client", R, "client"], ["confidence", R, "confidence"], ["random", R, "random"], ["stratified", R, "stratified"], ["risk", RR, "stratified"]]) { const ev = rs.flatMap((r) => r[p].perDeployment[d].events); row[k] = { silent: mean(ev.filter((e) => e.type === "silent" && e.delay != null).map((e) => e.delay)), missedSilent: ev.filter((e) => e.type === "silent" && e.delay == null).length, cost: mean(rs.map((r) => r[p].perDeployment[d].cost)) }; } return row; });
const planV = S.auditPlan(S.ASSUME), planR = S.auditPlan(Object.assign({}, S.ASSUME, { alloc: "risk" }));
const costCut = 1 - ARMS.risk.cost / ARMS.client.cost, extraHours = ARMS.risk.hours - ARMS.random.hours;

// timeline series (seed 101, risk allocation)
const ser = RR[0].series, ev0 = RR[0].events;
const roll = (a, k) => a.map((_, i) => { const w = a.slice(Math.max(0, i - k + 1), i + 1).filter((v) => v != null); return w.length ? w.reduce((x, y) => x + y, 0) / w.length : null; });
const TL = {}; for (const d of Object.keys(S.DEPLOYMENTS)) { const det = (p) => RR[0][p].perDeployment[d].events; TL[d] = { truth: ser[d].stratified.truth, est: roll(ser[d].stratified.est, 7), alarmsS: ser[d].stratified.alarms,
  events: ev0.filter((e) => e.d === d).map((e) => ({ ...e, audit: (det("stratified").find((x) => x.start === e.start) || {}).detected ?? null, conf: (det("confidence").find((x) => x.start === e.start) || {}).detected ?? null, client: (det("client").find((x) => x.start === e.start) || {}).detected ?? null })) }; }

// value ledger
const LV = L.run(), HT = L.holdoutTable([0.01, 0.02, 0.05, 0.1, 0.2], 200);
const over = LV.creditAll / LV.truth, baOver = LV.beforeAfter / LV.truth - 1;

// monthly value statement mock: inspection agent error with CI from one month of stratified audits (no drift)
const D = S.DEPLOYMENTS.inspect, o = S.ASSUME, rHigh = D.baseErr / (1 - o.lowConfShare + o.lowConfShare * o.lowConfErrMultiple), rLow = rHigh * o.lowConfErrMultiple;
const riskShare = o.lowConfShare + (1 - o.lowConfShare) * o.baseNovel, pRisk = (o.lowConfShare * rLow + (1 - o.lowConfShare) * o.baseNovel * rHigh) / riskShare, pRest = rHigh;
const auditsMonth = planR.inspect * 30, nR = auditsMonth * o.riskShareOfAudits, nQ = auditsMonth - nR;
const errSE = Math.sqrt(riskShare ** 2 * pRisk * (1 - pRisk) / nR + (1 - riskShare) ** 2 * pRest * (1 - pRest) / nQ);

function bars(rows, fmt, title, max) {
  const W = 460, rh = 30, pl = 220, pr = 60, H = rows.length * rh + 30, mx = max || Math.max(...rows.map((r) => r.v || 0)) * 1.05 || 1;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}"><text class="lab" x="0" y="14">${esc(title)}</text>`;
  rows.forEach((r, i) => { const y = 24 + i * rh, w = r.v == null ? 0 : Math.max(2, ((W - pl - pr) * r.v) / mx);
    s += `<text x="${pl - 8}" y="${y + 15}" text-anchor="end">${esc(r.label)}</text>` + (r.v == null ? `<text class="val" x="${pl}" y="${y + 16}">never caught</text>` : `<rect class="b" data-t="${esc(r.label + ": " + fmt(r.v))}" x="${pl}" y="${y + 3}" width="${w}" height="${rh - 10}" rx="4" fill="${r.hi ? "var(--accent)" : "var(--s2)"}"/><text class="val" x="${pl + w + 6}" y="${y + 16}">${fmt(r.v)}</text>`); });
  return s + "</svg>";
}
const SHORT = { client: "Client complaints", confidence: "Confidence watch", random: "Random audits", stratified: "Stratified audits", risk: "Stratified, by money at risk" };

const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Still the agent you shipped? Deployment assurance for a forward-deployed AI firm · Aditya Mathur</title>
<meta name="description" content="What I would own at Deployment Inc: after go-live, prove each deployment's value in rupees and catch quiet failures before the client does. Simulation of drift detection and value measurement, with a runbook and a 30-day plan.">
<style>
:root{--bg:#fafaf8;--surface:#fff;--ink:#15151f;--ink-soft:#3b414b;--muted:#5b6170;--line:#e4e3de;--accent:#2b4fd8;--accent-soft:#eaeefc;--tag:#f0efea;--good:#1f6b45;--good-soft:#e5f3eb;--bad:#a5332a;--bad-soft:#fbeae8;--warn:#8a5a10;--warn-soft:#fbf1df;--s2:#9aa0ab;--grid:#ebeae6;--drift:#f6e3c7}
@media (prefers-color-scheme:dark){:root{--bg:#101215;--surface:#171a1f;--ink:#e9ebee;--ink-soft:#c3c8d0;--muted:#9aa1ad;--line:#2a2e36;--accent:#8ea6ff;--accent-soft:#1a2140;--tag:#1f232a;--good:#6fd09c;--good-soft:#142a1e;--bad:#f09186;--bad-soft:#2d1816;--warn:#f0b86e;--warn-soft:#2a2214;--s2:#5d6470;--grid:#24272d;--drift:#3a2e1c}}
*{box-sizing:border-box}html,body{margin:0}body{background:var(--bg);color:var(--ink);font:16px/1.62 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,sans-serif}
a{color:var(--accent);text-underline-offset:3px}a.src{font-size:12px;white-space:nowrap}.wrap{max-width:1000px;margin:0 auto;padding:44px 18px 80px}
.kicker{font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:0 0 10px}h1{font-size:clamp(30px,5vw,44px);line-height:1.08;margin:0 0 12px;letter-spacing:-.02em}
.lede{font-size:19px;color:var(--muted);margin:0 0 14px;max-width:840px}.byline{font-size:14px;color:var(--muted);display:flex;flex-wrap:wrap;gap:4px 16px}
.disclaimer{font-size:13px;color:var(--muted);border-left:3px solid var(--line);padding:4px 0 4px 12px;margin:18px 0 0}
h2{font-size:24px;line-height:1.2;margin:56px 0 10px;letter-spacing:-.01em}h2 .n{color:var(--muted);font-weight:500;margin-right:8px}h3{font-size:17px;margin:22px 0 6px}
p{margin:0 0 12px}ul,ol{margin:0 0 14px;padding-left:22px}li{margin:5px 0}
.own{background:var(--accent-soft);border-radius:14px;padding:20px 22px;margin:28px 0 0}.own h2{margin:0 0 8px;font-size:15px;letter-spacing:.08em;text-transform:uppercase;color:var(--accent)}
.tldr{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:20px 22px;margin:16px 0 0}.tldr h2{margin:0 0 10px;font-size:15px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:18px 0 6px}.stat{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px}
.stat b{display:block;font-size:26px;line-height:1.1}.stat span{font-size:13.5px;color:var(--muted);display:block;margin-top:4px;line-height:1.35}
table{border-collapse:collapse;width:100%;font-size:14px;margin:10px 0 14px;background:var(--surface);border:1px solid var(--line)}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}th{font-size:12px;letter-spacing:.03em;text-transform:uppercase;color:var(--muted);font-weight:600;background:var(--tag)}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}tr.top td{background:var(--accent-soft)}.tablewrap{overflow-x:auto}.note{font-size:13px;color:var(--muted)}
.callout{background:var(--accent-soft);border-radius:12px;padding:14px 16px;margin:14px 0}.callout.warn{background:var(--warn-soft)}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px 16px}.card h3{margin-top:0}
.chart{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px 14px;position:relative}.chart svg{width:100%;height:auto;display:block}
.chart text{fill:var(--muted);font-size:12px;font-family:inherit}.chart .lab{fill:var(--ink);font-size:13px;font-weight:600}.chart .val{fill:var(--ink);font-size:12px}
figure{margin:14px 0 18px}figcaption{font-size:13.5px;color:var(--muted);margin-top:6px}
.tip{position:absolute;pointer-events:none;background:var(--ink);color:var(--bg);font-size:12.5px;padding:6px 9px;border-radius:8px;opacity:0;transition:opacity .1s;max-width:280px;line-height:1.4;z-index:2}
.legend{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:13px;color:var(--ink-soft);margin:6px 0 0 4px}.legend i{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:6px;vertical-align:-1px}
.tabs{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}.tabs button{font:inherit;font-size:13px;border:1px solid var(--line);background:var(--bg);color:var(--ink-soft);border-radius:999px;padding:5px 12px;cursor:pointer}.tabs button[aria-selected=true]{background:var(--accent);border-color:var(--accent);color:#fff}
.stmt{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:18px 20px}.stmt .row{display:grid;grid-template-columns:1.3fr 1fr 1.4fr;gap:10px;padding:9px 0;border-bottom:1px solid var(--line);font-size:14.5px}.stmt .row:last-child{border-bottom:0}.stmt b.big{font-size:20px}
.week{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.week div{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px;font-size:14px}.week b{display:block;margin-bottom:4px}
code{font-size:13px;background:var(--tag);padding:1px 5px;border-radius:4px}.sources li{font-size:13.5px}
@media (max-width:760px){.stats,.week{grid-template-columns:1fr 1fr}.grid2,.grid3{grid-template-columns:1fr}.stmt .row{grid-template-columns:1fr}}
</style></head><body><div class="wrap">
<p class="kicker">What I would own at Deployment Inc · Aditya Mathur</p>
<h1>Still the agent you shipped?</h1>
<p class="lede">A forward-deployed firm wins the deal on a metric the client agrees to. It keeps the client by proving that metric month after month, and by catching the agent going quietly wrong before the client does. This is the function I would build first: deployment assurance.</p>
<div class="byline"><span>Aditya Mathur</span><span>Bengaluru, open to Gurugram</span><span>November 2026</span><span><a href="https://github.com/adimathur-creates/adimathur-creates.github.io/tree/main/deployment-assurance">Code and 11 tests</a></span></div>
<p class="disclaimer">Independent work. Not affiliated with Deployment Inc or Cars24, and no client data. The four deployments are illustrative, shaped like workflows a used-car marketplace publicly says it runs on agents. Every volume, error rate and rupee figure is a labelled assumption in the code. The numbers show trade-offs, not anyone's results.</p>

<section class="own"><h2>What I would own</h2>
<p style="margin:0 0 8px"><b>Deployment assurance: the number, kept true.</b> For every live deployment, one person owns three things after go-live:</p>
<ul style="margin:0"><li><b>A value number the client signs:</b> in rupees, measured against a holdout, with an error bar.</li>
<li><b>An error rate measured by audits,</b> with drift caught in days, not when the client complains.</li>
<li><b>A monthly value statement</b> that becomes the renewal case and, with permission, the next sales case study.</li></ul>
<p style="margin:8px 0 0"><b>The number that says it worked:</b> by month three, every live deployment has a signed value statement, and the client finds zero incidents before we do.</p></section>

<section class="tldr"><h2>The short version</h2>
<ul>
<li><b>Why this, why now.</b> Deployment Inc starts each engagement with a specific workflow and an agreed metric, and stays until the workflow runs reliably at scale <a class="src" href="https://indiantelevision.com/mam/cars24-launches-deployment-inc-with-5m-to-build-enterprise-ai-systems/">[source]</a>. Its co-founder puts it this way: the product is not the agent, it's the changed operation <a class="src" href="https://startupindiax.com/cars24-deployment-inc-ai-startup/">[source]</a>. Both promises need someone measuring after launch.</li>
<li><b>Benchmarks stop at launch.</b> ReliabilityBench, the CTO's own work, tests agents before launch, and notes that production adds users who phrase things differently, APIs that fail and data formats that change <a class="src" href="https://arxiv.org/html/2601.06112v1">[source]</a>. In production there's no answer key, so you need audits.</li>
<li><b>Catching drift.</b> I simulated four months of three deployments, each hit by one loud drift (confidence drops) and one silent drift (confidence doesn't). Watching confidence caught every loud drift within a day but <b>missed all ${ARMS.confidence.events / 2} silent ones</b>. Waiting for complaints caught everything, after about a week, with ${ARMS.client.fa.toFixed(0)} false alarms per run.</li>
<li><b>The design that worked:</b> risk-stratified audits plus a confidence watch, with the same 100 audits a day allocated by money at risk. It caught all ${ARMS.risk.events} drifts and cut drift losses by <b>${(costCut * 100).toFixed(0)}%</b> versus waiting for complaints.</li>
<li><b>Proving value.</b> For a lead re-engagement agent, crediting every returning lead claimed <b>${lakh(LV.creditAll)}/month</b>, and a before/after comparison claimed ${lakh(LV.beforeAfter)}. The true lift was ${lakh(LV.truth)}. A 5% holdout read ${lakh(LV.holdout)} ± ${lakh(LV.holdoutCI)}, for a cost of ${lakh(LV.holdoutCost)} a month.</li>
</ul></section>

<div class="stats">
<div class="stat"><b>0 of ${ARMS.confidence.events / 2}</b><span>silent drifts caught by watching model confidence</span></div>
<div class="stat"><b>${ARMS.risk.caught} of ${ARMS.risk.events}</b><span>drifts caught by stratified audits, loud and silent</span></div>
<div class="stat"><b>${(costCut * 100).toFixed(0)}%</b><span>less lost to drift than waiting for complaints</span></div>
<div class="stat"><b>${over.toFixed(1)}x</b><span>overstatement from crediting every returning lead to the agent</span></div>
</div>

<h2><span class="n">1</span>Why this is the function to build first</h2>
<div class="grid2">
<div class="card"><h3>What the firm promises</h3><ul>
<li>Forward-deployed engineers start with one workflow and an agreed metric, deploy on live operations, and stay until it works reliably at scale <a class="src" href="https://indiantelevision.com/mam/cars24-launches-deployment-inc-with-5m-to-build-enterprise-ai-systems/">[source]</a>.</li>
<li>It grew out of Cars24, where more than 45 agents run across support, sales, financing, inspections, payments and internal operations <a class="src" href="https://www.mediainfoline.com/brand/cars24-launches-deployment-inc-indias-first-forward-deployed-ai-company-invests-5-million">[source]</a>. Cars24 is also its first customer <a class="src" href="https://inc42.com/buzz/cars24-launches-enterprise-ai-company-deployment-inc-invests-5-mn/">[source]</a>.</li>
<li>Target sectors include BFSI, healthcare, manufacturing and logistics <a class="src" href="https://inc42.com/buzz/cars24-launches-enterprise-ai-company-deployment-inc-invests-5-mn/">[source]</a>. There, a wrong approval costs real money and an unproven saving doesn't renew.</li></ul></div>
<div class="card"><h3>What nobody has published yet</h3><ul>
<li>OpenAI's Cars24 case study reports outcomes: over a million conversation minutes a month, 12% of lost seller leads recovered, 50% higher support resolution <a class="src" href="https://openai.com/index/cars24">[source]</a>. It doesn't describe how agents are evaluated or monitored after launch.</li>
<li>Pre-launch reliability now has a vocabulary: consistency across runs, robustness to rephrasing, tolerance of tool failures <a class="src" href="https://arxiv.org/html/2601.06112v1">[source]</a>. Post-launch assurance doesn't. As a firm goes from 3 deployments to 30, it can't run on FDE memory.</li>
<li>Every claimed result is a sales asset. A result measured against a holdout survives a client's CFO.</li></ul></div>
</div>
<p><b>Problem statement.</b> After go-live, (1) catch an agent's drift in days, including drift its own confidence can't see, with a fixed review budget; and (2) report each deployment's value in rupees, measured against what would have happened anyway, with an honest error bar.</p>

<h2><span class="n">2</span>Catching drift before the client does</h2>
<p>Three illustrative deployments, 120 days, ${N} runs. Each gets one <b>loud</b> drift and one <b>silent</b> drift. Loud: a new caller accent or form layout lowers the agent's confidence. Silent: a new vendor template or a policy change makes the agent confidently wrong. Either way, 15% of cases start failing at 25%. A fix lands 2 days after an alarm; a drift nobody catches runs 30 days.</p>
<div class="tablewrap"><table><tr><th>Deployment</th><th class="num">Cases / day</th><th class="num">Error rate at acceptance</th><th class="num">Cost of one error</th><th>What an error looks like</th></tr>
${Object.values(S.DEPLOYMENTS).map((d) => `<tr><td>${esc(d.label)}</td><td class="num">${n0(d.volume)}</td><td class="num">${(d.baseErr * 100).toFixed(0)}%</td><td class="num">₹${n0(d.errCost)}</td><td class="note">${esc(d.what)}</td></tr>`).join("")}</table></div>
<div class="grid2">
<figure class="chart">${bars(ORDER.map((k) => ({ label: SHORT[k], v: ARMS[k].silent, hi: k === "risk" })), (v) => v.toFixed(1) + " days", "Days to catch a silent drift")}<div class="tip"></div></figure>
<figure class="chart">${bars(ORDER.map((k) => ({ label: SHORT[k], v: ARMS[k].cost, hi: k === "risk" })), lakh, "Lost to drift per 4 months (3 deployments)")}<div class="tip"></div></figure>
</div>
<div class="tablewrap"><table><tr><th>Monitoring</th><th class="num">Drifts caught</th><th class="num">Days to catch: loud</th><th class="num">Days to catch: silent</th><th class="num">Lost to drift</th><th class="num">False alarms</th><th class="num">Audit hours</th></tr>
${ORDER.map((k) => `<tr${k === "risk" ? ' class="top"' : ""}><td><b>${esc(ANAME[k])}</b></td><td class="num">${ARMS[k].caught} / ${ARMS[k].events}</td><td class="num">${ARMS[k].loud == null ? "—" : ARMS[k].loud.toFixed(1)}</td><td class="num">${ARMS[k].silent == null ? "never" : ARMS[k].silent.toFixed(1)}</td><td class="num">${lakh(ARMS[k].cost)}</td><td class="num">${ARMS[k].fa.toFixed(1)}</td><td class="num">${ARMS[k].hours ? n0(ARMS[k].hours) : "—"}</td></tr>`).join("")}
</table></div>
<p class="note">Totals across ${N} runs for drifts caught; per-run averages for everything else. Complaint-based detection includes a 3-day reporting lag. "Lost to drift" counts only errors above the acceptance rate while a drift is live.</p>
<div class="grid3">
<div class="card"><h3>Confidence is half the answer</h3><p>It sees loud drift within a day, and silent drift never. An agent that's confidently wrong looks healthy on every dashboard built from its own scores.</p></div>
<div class="card"><h3>Random audits are too thin</h3><p>At 1% of volume, random audits were slower than complaints (${ARMS.random.silent.toFixed(0)} vs ${ARMS.client.silent.toFixed(0)} days on silent drift). Most audited cases are easy ones that were never going to fail.</p></div>
<div class="card"><h3>Put audits where the risk is</h3><p>Send 60% of audits to low-confidence and novel-looking cases, and run a separate alarm on each group. Then give each deployment audits by money at risk, not volume.</p></div>
</div>
<h3>Same 100 audits a day, allocated differently</h3>
<div class="tablewrap"><table><tr><th>Deployment</th><th class="num">Audits / day by volume</th><th class="num">Audits / day by money at risk</th><th class="num">Silent drift caught in (by volume)</th><th class="num">Silent drift caught in (by money at risk)</th><th class="num">Lost to drift (by volume → by money at risk)</th></tr>
${perDep.map((r) => `<tr><td>${esc(S.DEPLOYMENTS[r.d].label)}</td><td class="num">${planV[r.d]}</td><td class="num">${planR[r.d]}</td><td class="num">${r.stratified.silent.toFixed(1)} days</td><td class="num">${r.risk.silent.toFixed(1)} days</td><td class="num">${lakh(r.stratified.cost)} → ${lakh(r.risk.cost)}</td></tr>`).join("")}</table></div>
<p class="note">The trade-off: inspection checks get fewer audits and catch silent drift later, while the two expensive workflows catch it in about half the time. Document and purchase-order audits take longer, so this plan uses about ${n0(extraHours)} more reviewer hours over four months.</p>
<h3>Watch one deployment</h3>
<div class="tabs" id="tlTabs"></div>
<figure class="chart" id="tl"><div class="tip"></div></figure>
<p class="note">One run, with audits allocated by money at risk. The shaded band is how long each drift lasted under audits. The other markers show when the same drift would have been caught by watching confidence or waiting for complaints; for silent drift, confidence never fires. Daily audit counts are small, which is why the alarm accumulates evidence over days (CUSUM) instead of reacting to one bad day.</p>
<div class="legend"><span><i style="background:var(--drift)"></i>Drift live</span><span><i style="background:var(--s2)"></i>True daily error rate (unknown in production)</span><span>▲ <b style="color:var(--accent)">audit alarm</b> · when the same drift would be caught by <b style="color:var(--warn)">confidence</b> or <b style="color:var(--bad)">complaints</b></span></div>

<h2><span class="n">3</span>Proving the value is real</h2>
<p>A lead re-engagement agent calls leads that dropped out. Some of those leads would have come back anyway, more of them in festive season, and more again after a price change on day 70. All three effects are in the simulation, alongside a true agent lift of 2 points.</p>
<figure class="chart">${bars([{ label: "Credit every returning lead", v: LV.creditAll }, { label: "Before vs after launch", v: LV.beforeAfter }, { label: "5% holdout", v: LV.holdout, hi: true }, { label: "True lift (unknowable live)", v: LV.truth }], lakh, "Monthly value claimed for the same agent")}<div class="tip"></div></figure>
<ul>
<li><b>Crediting every return</b> claims ${over.toFixed(1)}x the true value. A "share of lost leads recovered" metric tells you activity, not impact.</li>
<li><b>Before/after</b> overstates by ${(baOver * 100).toFixed(0)}% here, because festive season and the price change land in the "after" window.</li>
<li><b>A holdout</b> (leads the agent randomly doesn't call) gets the true value within its error bar.</li>
</ul>
<h3>How big a holdout?</h3>
<div class="tablewrap"><table><tr><th class="num">Holdout</th><th class="num">True monthly value</th><th class="num">Estimate</th><th class="num">95% error bar</th><th class="num">Cost of the holdout / month</th><th class="num">Error bar covered the truth</th></tr>
${HT.map((r) => `<tr${r.h === 0.05 ? ' class="top"' : ""}><td class="num">${(r.h * 100).toFixed(0)}%</td><td class="num">${lakh(r.truth)}</td><td class="num">${lakh(r.est)}</td><td class="num">± ${lakh(r.ci)}</td><td class="num">${lakh(r.cost)}</td><td class="num">${(r.cover * 100).toFixed(0)}%</td></tr>`).join("")}</table></div>
<p class="note">200 simulated quarters per row. I'd start at 5%: an error bar under a fifth of the value, for about 5% of the lift. Then shrink it once the number has been signed twice.</p>

<h2><span class="n">4</span>The artifact: a monthly value statement</h2>
<p>One page per deployment, signed by the client's owner each month. It's the renewal conversation, the expansion pitch, and with permission the next case study. Here is a mock for two of the illustrative deployments.</p>
<div class="stmt">
<div class="row"><span><b>Lead re-engagement agent</b><br><span class="note">Value this month (vs 5% holdout)</span></span><span><b class="big">${lakh(LV.holdout)}</b><br><span class="note">± ${lakh(LV.holdoutCI)}, 95% interval</span></span><span class="note">${(LV.rates.treated * 100).toFixed(1)}% of called leads returned vs ${(LV.rates.holdout * 100).toFixed(1)}% of the holdout. Holdout cost: ${lakh(LV.holdoutCost)}.</span></div>
<div class="row"><span><b>Inspection scheduling agent</b><br><span class="note">Measured error rate</span></span><span><b class="big">${(D.baseErr * 100).toFixed(1)}%</b><br><span class="note">± ${(1.96 * errSE * 100).toFixed(1)} pts, from ${n0(auditsMonth)} stratified audits</span></span><span class="note">Acceptance gate: under 4%. Not proven yet: the upper end of the error bar is above the gate. Pool two months of audits, or add audits on this deployment, before calling it.</span></div>
<div class="row"><span><b>Incidents</b></span><span><b class="big">1</b><br><span class="note">silent drift, caught by audits on day 3</span></span><span class="note">New address format from a partner app. Fixed in 2 days. Client was told before it was noticed downstream.</span></div>
<div class="row"><span><b>Next month</b></span><span><b class="big">Hold scope</b></span><span class="note">Add 10 audits a day on inspection scheduling so the error gate can be confirmed. Propose adding reschedules once it is.</span></div>
</div>
<p class="note">Values are from the simulation; the incident row is an example of the format.</p>

<h2><span class="n">5</span>Runbook</h2>
<div class="grid2">
<div class="card"><h3>Before go-live</h3><ol>
<li>Agree the metric and the holdout with the client owner in writing.</li>
<li>Set the acceptance error rate from a labelled sample, and keep that sample as the regression set.</li>
<li>Define "risky" for this workflow: low confidence, never-seen templates or callers, high rupee value.</li>
<li>Size the audit budget by money at risk, and staff it (client team, our team or a vendor).</li></ol></div>
<div class="card"><h3>After go-live</h3><ol>
<li>Daily: stratified audits, a separate alarm per group, and a confidence watch.</li>
<li>On an alarm: the FDE triages within a day, finds the segment, then fixes, rolls back or routes those cases to people.</li>
<li>Tell the client about every incident before it shows up downstream.</li>
<li>Monthly: value statement, error with error bar, incidents, an expand-or-hold call.</li></ol></div>
</div>
<h3>My first 30 days</h3>
<div class="week">
<div><b>Week 1</b>Sit with the FDEs on the Cars24 deployments. Write down what "working" means for each, and how anyone would know it stopped.</div>
<div><b>Week 2</b>Stand up audits and a holdout on one live deployment. Ship the first value statement draft to the founders.</div>
<div><b>Week 3</b>Turn it into a template every new engagement starts with: metric, holdout, audit plan, acceptance gate.</div>
<div><b>Week 4</b>First signed value statement. Turn the best number into a one-page case study for the sales team.</div>
</div>
<h3>Two more things I'd raise in month one</h3>
<ul>
<li><b>A BFSI deployment pack.</b> Banks and NBFCs will ask about data handling, audit trails and model-risk documentation before the first workflow is chosen. I've worked in AML at Stripe; I'd write the pack once, so every FDE doesn't answer it from scratch.</li>
<li><b>Deal qualification from the assurance side.</b> If a workflow has no measurable outcome, or no way to audit it, it will be hard to renew. Better to know that before signing.</li>
</ul>

<h2><span class="n">6</span>Method and limits</h2>
<ul>
<li>Daily, group-level simulation (<code>src/sim.js</code>): each deployment-day is split into low-confidence or novel cases versus the rest, with binomial errors and audits. CUSUM alarms test whether a group's error rate has doubled.</li>
<li>Assumed: drift hits 15% of cases at 25% error; a novelty flag spots 60% of drifted cases; clients notice 8–30% of errors; complaints are reported 3 days late. Change any of these in <code>ASSUME</code>.</li>
<li>Audits are assumed correct. In practice reviewers disagree, so you'd double-audit a slice to measure that.</li>
<li>The value ledger (<code>src/ledger.js</code>) assumes a clean randomised holdout. In real deployments, holdout leakage and client pushback ("why aren't you calling everyone?") are the hard part.</li>
<li>Not modelled: model or prompt updates by the FDE team (each one should re-run the regression set), cost of reviewer time, and multi-step agent failures.</li>
</ul>
<h3>Sources</h3>
<ol class="sources">
<li><a href="https://indiantelevision.com/mam/cars24-launches-deployment-inc-with-5m-to-build-enterprise-ai-systems/">Indian Television, Cars24 launches Deployment Inc (Aug 2026)</a></li>
<li><a href="https://startupindiax.com/cars24-deployment-inc-ai-startup/">StartupIndiaX, "the product is the changed operation"</a></li>
<li><a href="https://inc42.com/buzz/cars24-launches-enterprise-ai-company-deployment-inc-invests-5-mn/">Inc42, Cars24 launches Deployment Inc, invests $5 Mn</a></li>
<li><a href="https://www.mediainfoline.com/brand/cars24-launches-deployment-inc-indias-first-forward-deployed-ai-company-invests-5-million">MediaInfoline, launch announcement</a></li>
<li><a href="https://openai.com/index/cars24">OpenAI, How Cars24 scales conversations and builds faster with OpenAI (Jul 2026)</a></li>
<li><a href="https://arxiv.org/html/2601.06112v1">Gupta, ReliabilityBench: Evaluating LLM Agent Reliability Under Production-Like Stress Conditions</a></li>
</ol>
<p class="note">Built by Aditya Mathur. <a href="../">More work</a>.</p>
</div>
<script>
(function(){
  const TL = ${JSON.stringify(TL)}, LABELS = ${JSON.stringify(Object.fromEntries(Object.entries(S.DEPLOYMENTS).map(([k, d]) => [k, d.label])))}, CAP = ${S.ASSUME.capDays};
  const tabs = document.getElementById("tlTabs"), el = document.getElementById("tl"), tip = el.querySelector(".tip");
  Object.keys(TL).forEach((k, i) => { const b = document.createElement("button"); b.textContent = LABELS[k]; b.onclick = () => draw(k); tabs.appendChild(b); });
  function draw(k) {
    [...tabs.children].forEach((b, i) => b.setAttribute("aria-selected", Object.keys(TL)[i] === k));
    const d = TL[k], W = 900, H = 300, pl = 50, pr = 16, pt = 18, pb = 36, n = d.truth.length;
    const mx = Math.max(...d.truth) * 1.15;
    const X = (t) => pl + (t * (W - pl - pr)) / (n - 1), Y = (v) => H - pb - (v * (H - pt - pb)) / mx;
    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Error rate over 120 days">';
    const fixed = (e) => { const a = d.alarmsS.find((t) => t >= e.start && t < e.start + CAP); return a == null ? e.start + CAP : Math.min(e.start + CAP, a + 2); };
    d.events.forEach((e) => { s += '<rect x="' + X(e.start) + '" y="' + pt + '" width="' + (X(fixed(e)) - X(e.start)) + '" height="' + (H - pt - pb) + '" fill="var(--drift)"/><text x="' + (X(e.start) + 4) + '" y="' + (pt + 14) + '">' + e.type + ' drift</text>'; });
    for (let g = 0; g <= 4; g++) { const v = (mx * g) / 4; s += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + Y(v) + '" y2="' + Y(v) + '" stroke="var(--grid)"/><text x="' + (pl - 6) + '" y="' + (Y(v) + 4) + '" text-anchor="end">' + (v * 100).toFixed(1) + '%</text>'; }
    for (let t = 0; t < n; t += 20) s += '<text x="' + X(t) + '" y="' + (H - pb + 18) + '" text-anchor="middle">day ' + t + '</text>';
    s += '<polyline fill="none" stroke="var(--s2)" stroke-width="2" points="' + d.truth.map((v, t) => X(t) + "," + Y(v)).join(" ") + '"/>';
    const tri = (t, c, row, lab) => '<path class="b" data-t="' + lab + ' alarm, day ' + t + '" d="M' + X(t) + ',' + (H - pb - 4 - row * 12) + ' l-6,10 l12,0 z" fill="' + c + '"/>';
    d.alarmsS.forEach((t) => (s += tri(t, "var(--accent)", 0, "Audit")));
    d.events.forEach((e) => { if (e.conf != null) s += tri(e.conf, "var(--warn)", 1, "Confidence watch would catch this " + e.type + " drift:"); if (e.client != null) s += tri(e.client, "var(--bad)", 2, "Waiting for complaints would catch this " + e.type + " drift:"); });
    for (let t = 0; t < n; t++) s += '<rect class="b" data-t="Day ' + t + ': true error ' + (d.truth[t] * 100).toFixed(1) + '%' + '" x="' + (X(t) - 3.5) + '" y="' + pt + '" width="7" height="' + (H - pt - pb - 40) + '" fill="transparent"/>';
    el.innerHTML = s + "</svg>"; el.appendChild(tip); bind(el);
  }
  function bind(root) { const tp = root.querySelector(".tip"); root.querySelectorAll(".b").forEach((r) => { r.addEventListener("mousemove", (ev) => { tp.textContent = r.dataset.t; const b = root.getBoundingClientRect(); tp.style.left = Math.min(ev.clientX - b.left + 12, b.width - 290) + "px"; tp.style.top = (ev.clientY - b.top - 34) + "px"; tp.style.opacity = 1; }); r.addEventListener("mouseleave", () => (tp.style.opacity = 0)); }); }
  draw("loandoc"); document.querySelectorAll(".chart").forEach((c) => { if (c.id !== "tl") bind(c); });
})();
</script></body></html>`;
fs.writeFileSync(path.join(__dirname, "..", "index.html"), html);
console.log(JSON.stringify({ arms: Object.fromEntries(Object.entries(ARMS).map(([k, v]) => [k, { loud: v.loud && +v.loud.toFixed(1), silent: v.silent && +v.silent.toFixed(1), caught: v.caught, events: v.events, cost: Math.round(v.cost / 1e5 * 10) / 10, fa: +v.fa.toFixed(1), hours: Math.round(v.hours) }])), costCut, extraHours, LV: { truth: LV.truth, creditAll: LV.creditAll, ba: LV.beforeAfter, ho: LV.holdout, ci: LV.holdoutCI }, errCI: 1.96 * errSE, auditsMonth, perDep: perDep.map((r) => [r.d, r.stratified.silent, r.risk.silent]) }));
