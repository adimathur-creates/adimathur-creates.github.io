// Builds ../index.html. Run: node src/build_page.js
const fs = require("fs"), path = require("path");
const S = require("./engine.js"), Sim = require("./simulate.js"), T = require("./teasers.js");
const read = (f) => fs.readFileSync(path.join(__dirname, f), "utf8");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const N = 30, runs = Sim.seeds(N);
const avg = (p, k) => runs.reduce((s, r) => s + r[p][k], 0) / N;
const st = {}; for (const p of ["strict", "lenient", "ask"]) st[p] = { recall: avg(p, "recall"), fitFound: avg(p, "fitFound"), fitLost: avg(p, "fitLost"), fitTotal: avg(p, "fitTotal"), screens: avg(p, "fullScreens"), wasted: avg(p, "wasted"), precision: avg(p, "precision"), hours: avg(p, "hours"), questions: avg(p, "questions"), asked: avg(p, "asked"), reviews: avg(p, "reviews"), unanswered: avg(p, "unanswered") };
for (const p in st) st[p].hpf = st[p].hours / st[p].fitFound;
const rmin = Math.min(...runs.map((r) => r.strict.recall)), rmax = Math.max(...runs.map((r) => r.strict.recall));
const sweepE = Sim.sweep("ebitda", [0.4, 0.55, 0.7, 0.85, 1.0]);
const sweepB = Sim.sweep("bankerReplies", [0.3, 0.5, 0.75, 0.9]);
const pct = (x) => (x * 100).toFixed(0) + "%", n0 = (x) => Math.round(x).toLocaleString("en-US"), n1 = (x) => x.toFixed(1);
const A = Sim.ASSUME;

const policyRows = [["strict", "Forced yes/no", "A missing deal-breaker counts as a no"], ["lenient", "Pass anything not ruled out", "A missing field counts as a yes"], ["ask", "Ask, then decide (proposed)", "Ask the banker up to 2 questions, then decide"]]
  .map(([k, name, rule]) => `<tr${k === "ask" ? ' class="top"' : ""}><td><b>${name}</b><br><span class="note">${rule}</span></td><td class="num">${n1(st[k].fitFound)} of ${n1(st[k].fitTotal)}<br><span class="note">${pct(st[k].recall)}</span></td><td class="num">${n1(st[k].fitLost)}</td><td class="num">${n0(st[k].screens)}</td><td class="num">${n0(st[k].wasted)}</td><td class="num">${n0(st[k].hours)}</td><td class="num">${n1(st[k].hpf)}</td><td class="num">${n0(st[k].questions)}</td></tr>`).join("");

const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>The deal you never saw: handling missing data in AI deal screening · Aditya Mathur</title>
<meta name="description" content="A forced yes/no on a teaser with missing numbers quietly rejects deals that fit. A decision layer that asks the banker first, a working prototype, a simulation of a year of inbound deals, and a feature spec.">
<style>
:root{--bg:#fafaf8;--surface:#fff;--ink:#15151f;--ink-soft:#3b414b;--muted:#5b6170;--line:#e4e3de;--accent:#2b4fd8;--accent-soft:#eaeefc;--tag:#f0efea;--good:#1f6b45;--good-soft:#e5f3eb;--bad:#a5332a;--bad-soft:#fbeae8;--warn:#8a5a10;--warn-soft:#fbf1df;--bar:#b9c3e6;--grid:#ebeae6}
@media (prefers-color-scheme:dark){:root{--bg:#101215;--surface:#171a1f;--ink:#e9ebee;--ink-soft:#c3c8d0;--muted:#9aa1ad;--line:#2a2e36;--accent:#8ea6ff;--accent-soft:#1a2140;--tag:#1f232a;--good:#6fd09c;--good-soft:#142a1e;--bad:#f09186;--bad-soft:#2d1816;--warn:#f0b86e;--warn-soft:#2a2214;--bar:#3a4466;--grid:#24272d}}
*{box-sizing:border-box}html,body{margin:0}body{background:var(--bg);color:var(--ink);font:16px/1.62 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,sans-serif}
a{color:var(--accent);text-underline-offset:3px}a.src{font-size:12px;white-space:nowrap}.wrap{max-width:980px;margin:0 auto;padding:44px 18px 80px}
.kicker{font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:0 0 10px}h1{font-size:clamp(30px,5vw,44px);line-height:1.08;margin:0 0 12px;letter-spacing:-.02em}
.lede{font-size:19px;color:var(--muted);margin:0 0 14px;max-width:800px}.byline{font-size:14px;color:var(--muted);display:flex;flex-wrap:wrap;gap:4px 16px}
.disclaimer{font-size:13px;color:var(--muted);border-left:3px solid var(--line);padding:4px 0 4px 12px;margin:18px 0 0}
h2{font-size:24px;line-height:1.2;margin:56px 0 10px;letter-spacing:-.01em}h2 .n{color:var(--muted);font-weight:500;margin-right:8px}h3{font-size:17px;margin:22px 0 6px}
p{margin:0 0 12px}ul,ol{margin:0 0 14px;padding-left:22px}li{margin:5px 0}
.tldr{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:20px 22px;margin:28px 0 0}.tldr h2{margin:0 0 10px;font-size:15px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:18px 0 6px}.stat{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px}
.stat b{display:block;font-size:26px;line-height:1.1}.stat span{font-size:13.5px;color:var(--muted);display:block;margin-top:4px;line-height:1.35}
table{border-collapse:collapse;width:100%;font-size:14px;margin:10px 0 14px;background:var(--surface);border:1px solid var(--line)}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}th{font-size:12px;letter-spacing:.03em;text-transform:uppercase;color:var(--muted);font-weight:600;background:var(--tag)}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}tr.top td{background:var(--accent-soft)}.tablewrap{overflow-x:auto}.note{font-size:13px;color:var(--muted);font-weight:400}
.callout{background:var(--accent-soft);border-radius:12px;padding:14px 16px;margin:14px 0}.callout.warn{background:var(--warn-soft)}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px 16px}.card h3{margin-top:0}
.chart{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:10px 12px;position:relative}.chart svg{width:100%;height:auto;display:block}
.chart text{fill:var(--muted);font-size:12px;font-family:inherit}.chart .lab{fill:var(--ink);font-size:13px}figure{margin:14px 0 18px}figcaption{font-size:13.5px;color:var(--muted);margin-top:6px}
.tip{position:absolute;pointer-events:none;background:var(--ink);color:var(--bg);font-size:12.5px;padding:6px 9px;border-radius:8px;opacity:0;transition:opacity .1s;max-width:260px;line-height:1.4}
.legend{display:flex;gap:16px;font-size:13px;color:var(--ink-soft);margin:4px 0 0 4px}.legend i{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:6px;vertical-align:-1px}
/* prototype */
.proto{background:var(--surface);border:1px solid var(--line);border-radius:14px;overflow:hidden}
.ptabs{display:flex;flex-wrap:wrap;border-bottom:1px solid var(--line);background:var(--tag)}.ptabs button{font:inherit;font-size:14px;border:0;background:none;color:var(--ink-soft);padding:10px 14px;cursor:pointer;border-bottom:2px solid transparent}
.ptabs button[aria-selected="true"]{color:var(--ink);border-bottom-color:var(--accent);font-weight:600}
.pbody{display:grid;grid-template-columns:1fr 1.15fr}.pleft{padding:16px;border-right:1px solid var(--line)}.pright{padding:16px}
.teaser{font-size:14px;color:var(--ink-soft);background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:12px;line-height:1.55}
.seg{display:inline-flex}.seg button{font:inherit;font-size:13.5px;border:1px solid var(--line);background:var(--surface);color:var(--ink);padding:6px 12px;cursor:pointer}
.seg button:first-child{border-radius:999px 0 0 999px}.seg button:last-child{border-radius:0 999px 999px 0}.seg button+button{border-left:0}.seg button[aria-pressed="true"]{background:var(--ink);color:var(--bg);border-color:var(--ink)}
.verdict{display:flex;align-items:center;gap:10px;margin:0 0 8px}.vpill{font-weight:700;font-size:14px;letter-spacing:.04em;padding:4px 12px;border-radius:999px}
.v-PASS{background:var(--good-soft);color:var(--good)}.v-REJECT{background:var(--bad-soft);color:var(--bad)}.v-ASK,.v-REVIEW{background:var(--warn-soft);color:var(--warn)}
.rows{width:100%;font-size:13.5px;margin:8px 0}.rows td{padding:6px 8px}.st{font-weight:600;font-size:12px;letter-spacing:.03em;text-transform:uppercase;white-space:nowrap}
.st-pass{color:var(--good)}.st-fail{color:var(--bad)}.st-missing{color:var(--warn)}.q{background:var(--warn-soft);border-radius:10px;padding:10px 12px;margin:8px 0;font-size:14px}
.email{white-space:pre-wrap;font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin-top:8px}
.mandate{display:grid;grid-template-columns:repeat(4,1fr);gap:8px 12px;font-size:13px;margin:10px 0 0}.mandate label{display:flex;flex-direction:column;gap:2px;color:var(--ink-soft)}
.mandate input{font:inherit;font-size:14px;padding:4px 6px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--ink);text-align:right}
.btn{font:inherit;font-size:13.5px;border:1px solid var(--line);background:var(--surface);color:var(--ink);border-radius:999px;padding:6px 12px;cursor:pointer}
code{font-size:13px;background:var(--tag);padding:1px 5px;border-radius:4px}.sources li{font-size:13.5px}
@media (max-width:760px){.stats,.mandate{grid-template-columns:1fr 1fr}.grid2,.grid3,.pbody{grid-template-columns:1fr}.pleft{border-right:0;border-bottom:1px solid var(--line)}}
</style></head><body><div class="wrap">
<p class="kicker">Product proposal · Deal Screening · written for Binocs</p>
<h1>The deal you never saw</h1>
<p class="lede">Teasers leave numbers out. A screening tool that must say yes or no will quietly reject deals that fit, and nobody finds out. A decision layer that asks the banker one or two questions first keeps those deals and still saves analyst time.</p>
<div class="byline"><span>Aditya Mathur</span><span>Bengaluru</span><span>November 2026</span><span><a href="https://github.com/adimathur-creates/adimathur-creates.github.io/tree/main/binocs-screen-unknowns">Code and 16 tests</a></span></div>
<p class="disclaimer">Independent work, not affiliated with or reviewed by Binocs. Teasers, companies and the mandate are fictional. The simulation uses labelled assumptions you can change in the code. It does not test Binocs' extraction or any real customer data.</p>

<section class="tldr"><h2>The short version</h2>
<ul>
<li><b>The problem.</b> Binocs' Deal Screening promises "a clear, defensible verdict" with "no grey areas" <a class="src" href="https://binocs.co/deal-screening">[source]</a>. But early screens run on incomplete data <a class="src" href="https://f2.ai/glossary/what-is-deal-screening">[source]</a>. When a teaser doesn't state EBITDA or the stake for sale, a forced verdict has to guess.</li>
<li><b>Why it matters.</b> A wrong "yes" costs an associate about 5 hours and gets noticed. A wrong "no" costs a deal that fit, and nobody ever notices. A tool tuned on visible errors drifts toward rejecting too much.</li>
<li><b>The result.</b> In ${N} simulated years of ${A.deals} inbound deals, a forced yes/no kept only <b>${pct(st.strict.recall)}</b> of the deals that truly fit the mandate (range ${pct(rmin)} to ${pct(rmax)}). Asking up to two banker questions first kept all of them. It also ran <b>${pct(1 - st.ask.wasted / st.lenient.wasted)} fewer wasted full screens</b> than passing everything not ruled out, and had the lowest cost per good deal found (<b>${n1(st.ask.hpf)} hours</b> vs ${n1(st.strict.hpf)} and ${n1(st.lenient.hpf)}).</li>
<li><b>The proposal.</b> Add a third verdict, <b>Ask</b>: the exact question to send, ranked by how likely the answer settles the deal, at most two per deal, drafted as one email. Keep the verdict clear for the partner, and be honest about what is not known.</li>
</ul></section>

<div class="stats">
<div class="stat"><b>${pct(st.strict.recall)}</b><span>of truly fitting deals kept by a forced yes/no in the simulation</span></div>
<div class="stat"><b>100%</b><span>kept when the tool asks up to 2 banker questions first</span></div>
<div class="stat"><b>${pct(1 - st.ask.hours / st.lenient.hours)}</b><span>fewer analyst hours than passing everything not ruled out</span></div>
<div class="stat"><b>500–1,000</b><span>deals a typical mid-market fund screens a year to close 3–5 <a class="src" href="https://pe-curriculum.vercel.app/modules/deal-process/deal-sourcing">[source]</a></span></div>
</div>

<h2><span class="n">1</span>The problem, from the user's side</h2>
<div class="grid3">
<div class="card"><h3>Associate</h3><p>Reads 15–20 teasers a week. A first screen takes 4–6 hours per CIM <a class="src" href="https://workwisesolutions.org/guides/ai-deal-screening-complete-guide.html">[source]</a>. Wants the tool to throw out obvious misses and never throw out a real one.</p></div>
<div class="card"><h3>Partner</h3><p>Wants a verdict and a one-pager they can trust in 2 minutes. Loses trust the first time they hear a competitor bought a deal the tool rejected.</p></div>
<div class="card"><h3>Banker (sell side)</h3><p>Expects a buyer to respond fast. Will answer a sharp question ("is a majority stake available?"). Ignores a 12-question list.</p></div>
</div>
<div class="callout"><b>The gap.</b> Most teasers lead with sector and geography and hold back the rest until an NDA. In my assumed disclosure rates, only ${pct(A.disclose.ebitda)} of teasers state EBITDA, ${pct(A.disclose.control)} say whether a majority stake is on offer, and ${pct(A.disclose.topCustomer)} mention customer concentration. A tool with only "pass" or "reject" has to treat each blank as one or the other. Both are wrong a lot of the time.</div>

<h2><span class="n">2</span>Try it</h2>
<p>Four fictional teasers against an example mid-market mandate. Switch between a forced yes/no and the proposed Ask verdict, or change the mandate.</p>
<div class="proto" id="proto">
<div class="ptabs" role="tablist">${T.map((t, i) => `<button role="tab" data-t="${t.id}" aria-selected="${i === 0}">${esc(t.name)}</button>`).join("")}</div>
<div class="pbody">
<div class="pleft"><p class="note" id="tdesc"></p><div class="teaser" id="ttext"></div>
<p style="margin:12px 0 6px" class="note">Verdict mode</p><div class="seg" id="mode"><button data-m="strict" aria-pressed="false">Forced yes/no</button><button data-m="ask" aria-pressed="true">Ask, then decide</button></div>
<details style="margin-top:12px"><summary class="note" style="cursor:pointer">Edit mandate</summary><div class="mandate">
<label>EBITDA min ($M)<input type="number" step="0.5" id="m_emin" value="${S.DEFAULT_MANDATE.ebitdaMin}"></label>
<label>EBITDA max ($M)<input type="number" step="1" id="m_emax" value="${S.DEFAULT_MANDATE.ebitdaMax}"></label>
<label>Margin min (%)<input type="number" step="1" id="m_margin" value="${S.DEFAULT_MANDATE.marginMin * 100}"></label>
<label>Growth min (%)<input type="number" step="1" id="m_growth" value="${S.DEFAULT_MANDATE.growthMin * 100}"></label></div>
<p class="note" style="margin-top:6px">Sectors: ${S.DEFAULT_MANDATE.sectors.join(", ")} · Geography: ${S.DEFAULT_MANDATE.geos.join(", ")} · Control only · Largest customer under ${pct(S.DEFAULT_MANDATE.topCustomerMax)}</p></details>
</div>
<div class="pright"><div class="verdict"><span class="vpill" id="vpill"></span><span id="vreason" class="note"></span></div>
<table class="rows" id="vrows"></table><div id="vq"></div></div>
</div></div>

<h2><span class="n">3</span>What it does over a year of deal flow</h2>
<p>${A.deals} inbound deals for one fund, ${N} simulated years. About ${pct(runs[0].meta.fitShare)} truly fit the mandate. That is close to the "10% that deserve your time" on the product page, once near-fits are counted. Each policy sees the same teasers.</p>
<div class="tablewrap"><table>
<tr><th>Policy</th><th class="num">Fitting deals kept</th><th class="num">Fitting deals lost</th><th class="num">Full screens</th><th class="num">Wasted screens</th><th class="num">Analyst hours</th><th class="num">Hours per fit deal</th><th class="num">Banker questions</th></tr>
${policyRows}
</table></div>
<p class="note">Averages over ${N} seeds. Hours: a full screen is ${A.hours.fullScreen} h (midpoint of 4–6 h per CIM <a class="src" href="https://workwisesolutions.org/guides/ai-deal-screening-complete-guide.html">[source]</a>), drafting a question ${A.hours.ask} h, a human look at a near-miss or an unanswered deal ${A.hours.review} h, a glance at each auto-verdict ${A.hours.autoCheck} h. All but the first are my assumptions.</p>
<figure class="chart" id="c1"><div class="tip"></div></figure>
<div class="legend"><span><i style="background:var(--bar)"></i>Forced yes/no</span><span><i style="background:var(--accent)"></i>Ask, then decide</span></div>
<figcaption>Share of truly fitting deals kept as teasers state EBITDA more or less often. The forced verdict only works when teasers are complete; asking does not depend on it.</figcaption>
<h3>Where the cost goes</h3>
<ul>
<li><b>Banker questions:</b> about ${n0(st.ask.questions)} a year across ${n0(st.ask.asked)} deals. That's 1–2 a week, sent as one email per deal.</li>
<li><b>Unanswered:</b> ${n0(st.ask.unanswered)} deals a year still have a gap after the questions (assuming ${pct(A.bankerReplies)} of questions get answered). A person makes the call on those, so a slow banker costs time, not deals.</li>
<li><b>Banker reply rate:</b> at 30% replies the human time rises to ${n0(sweepB[0].askHours)} hours. That's still below the ${n0(sweepB[0].lenHours)} hours of passing everything, and no fitting deal is lost.</li>
</ul>

<h2><span class="n">4</span>The feature spec</h2>
<h3>Verdicts</h3>
<div class="tablewrap"><table>
<tr><th>Verdict</th><th>When</th><th>What the user sees</th></tr>
<tr><td><b>Pass</b></td><td>Every criterion is stated and inside the mandate</td><td>Verdict, evidence line per criterion with the quote it came from, and the IC one-pager</td></tr>
<tr><td><b>Reject</b></td><td>Any stated criterion is outside the mandate</td><td>The one criterion that failed and its quote. A stated failure always beats a missing field: never ask about a deal that's already out.</td></tr>
<tr><td><b>Ask</b> (new)</td><td>Nothing stated fails, but a criterion is not in the teaser</td><td>Up to 2 questions, ranked by how likely the answer settles the deal, pre-written as one email to the banker. Re-screens when the reply is pasted or forwarded.</td></tr>
<tr><td><b>Review</b> (new)</td><td>Near miss: EBITDA within 15% under the floor and growing 15%+ a year</td><td>Routed to a person with the reason. These are the deals a partner is angriest to lose.</td></tr>
</table></div>
<h3>Rules</h3>
<ol>
<li><b>Question order:</b> ask first about the criterion that most often fails (EBITDA, then stake, then growth), so the most deals settle with one answer. Learn the rates per customer from their own past pipeline.</li>
<li><b>Cap at 2 questions per deal.</b> More than that reads like a checklist to the banker, and response rates drop.</li>
<li><b>Deal-breakers vs quality screens.</b> The fund marks each criterion. Only a deal-breaker can block a pass on its own.</li>
<li><b>Every verdict is reconstructable</b> from the evidence table alone: field, value, quote, rule. No score without a reason.</li>
<li><b>The one-pager shows an "Unknowns" box,</b> so the partner sees what the verdict is built on.</li>
</ol>
<h3>Edge cases I would test first</h3>
<ul>
<li>Ranges ("EBITDA of $8–10M"): pass only if the whole range fits, otherwise Ask.</li>
<li>Adjusted vs reported EBITDA, LTM vs fiscal year, and currency (Project Maple reports in C$). Normalise before the rule runs, and show the conversion.</li>
<li>Teaser and CIM disagree: the later document wins, and the change is flagged on the deal.</li>
<li>Banker replies "available on request after NDA": counts as unanswered, not as a no.</li>
<li>The mandate changes mid-year: re-screen open Ask and Review deals, never closed ones.</li>
</ul>
<h3>How we would know it works</h3>
<div class="tablewrap"><table>
<tr><th>Metric</th><th>Target</th><th>How to measure</th></tr>
<tr><td>Fitting deals kept (recall)</td><td>&ge; 98%</td><td>Shadow mode on a customer's last 12 months of logged deals: compare the verdict with what their team actually advanced</td></tr>
<tr><td>Hours per fitting deal found</td><td>Down vs the customer's baseline</td><td>Time logged per screen, before and after</td></tr>
<tr><td>Partner override rate</td><td>&lt; 10% of Pass and Reject</td><td>Overrides logged with a reason, read weekly</td></tr>
<tr><td>Banker reply rate to questions</td><td>&ge; 60% in 3 working days</td><td>Replies matched to the deal</td></tr>
<tr><td>Guardrail: deals stuck in Ask</td><td>&lt; 5 days median</td><td>Auto-escalate to Review after 5 days</td></tr>
</table></div>
<h3>Rollout</h3>
<ol><li><b>Shadow (2 weeks):</b> run on 2 design-partner funds' past pipeline. Report lost fitting deals under the current verdict vs Ask.</li>
<li><b>Opt-in:</b> the Ask verdict shows to associates, and emails are drafted, not sent.</li>
<li><b>Default on</b> once recall and override targets hold for a month.</li></ol>
<h3>Questions I would bring to the founder</h3>
<ul><li>What share of current screening verdicts are made with a deal-breaker missing? That one log query would size the problem in a day.</li>
<li>Do customers already override verdicts, and is the override captured? That is the labelled data this needs.</li>
<li>Is the IC one-pager read before or after the verdict? That changes where the Unknowns box goes.</li></ul>

<h2><span class="n">5</span>Method and limits</h2>
<ul>
<li>Assumes extraction is correct. Binocs' extraction quality is not tested here; a wrong extracted number is a separate failure mode.</li>
<li>Disclosure rates, banker reply rate and most hours are my assumptions, labelled in <code>src/simulate.js</code>. The direction holds as they change (see the chart and tests). The exact numbers do not.</li>
<li>"Truly fits" means it meets every criterion on full information. It is not "a good investment". Screening only decides who gets a closer look.</li>
<li>Deterministic rules, no model calls. That is deliberate: a verdict a partner can defend has to be reproducible.</li>
</ul>
<h3>Sources</h3>
<ol class="sources">
<li><a href="https://binocs.co/deal-screening">Binocs: Deal Screening</a> — product promise of a clear verdict and the top 10% of inbound</li>
<li><a href="https://f2.ai/glossary/what-is-deal-screening">F2: What is deal screening?</a> — early screens rely on incomplete data</li>
<li><a href="https://workwisesolutions.org/guides/ai-deal-screening-complete-guide.html">WorkWise: AI deal screening guide</a> — 4–6 hours per CIM on a first screen</li>
<li><a href="https://pe-curriculum.vercel.app/modules/deal-process/deal-sourcing">PE Curriculum: Deal sourcing</a> — mid-market funds review 500–1,000 deals a year and close 3–5</li>
</ol>
<p class="note">Built by Aditya Mathur. <a href="../">More work</a>.</p>
</div>
<script>
${read("engine.js")}
${read("teasers.js")}
(function(){
  const S = window.Screen, T = window.Teasers, $ = (s) => document.querySelector(s), $$ = (s) => Array.from(document.querySelectorAll(s));
  let cur = T[0].id, mode = "ask";
  function mandate(){ return { ebitdaMin: +$("#m_emin").value, ebitdaMax: +$("#m_emax").value, marginMin: +$("#m_margin").value / 100, growthMin: +$("#m_growth").value / 100 }; }
  function render(){
    const t = T.find(x => x.id === cur); $("#tdesc").textContent = t.desc + " · from " + t.banker; $("#ttext").textContent = t.text;
    const r = S.screen(Object.assign({}, t.d, { src: t.src }), mandate(), mode);
    $("#vpill").textContent = r.verdict; $("#vpill").className = "vpill v-" + r.verdict; $("#vreason").textContent = r.reason;
    $("#vrows").innerHTML = r.rows.map(x => '<tr><td>' + x.label + '</td><td class="st st-' + x.status + '">' + x.status + '</td><td>' + x.text + (x.src ? '<br><span class="note">"' + x.src + '"</span>' : '') + '</td></tr>').join("");
    if (r.verdict === "ASK") {
      const body = "Hi,\\n\\nThanks for sending " + t.name + ". Before we take a first call, could you confirm:\\n" + r.questions.map((q, i) => (i + 1) + ". " + q.q).join("\\n") + "\\n\\nHappy to sign an NDA if that is easier.\\n\\nBest,";
      $("#vq").innerHTML = '<div class="q"><b>Ask before deciding.</b> ' + r.questions.length + ' question' + (r.questions.length > 1 ? 's' : '') + ', most likely to settle the deal first.' + (r.unasked && r.unasked.length ? ' Not asked yet: ' + r.unasked.map(k => S.GATES.find(g => g.k === k).label.toLowerCase()).join(", ") + '.' : '') + '</div><div class="note">Draft to ' + t.banker + '</div><div class="email">' + body + '</div>';
    } else if (r.verdict === "REVIEW") $("#vq").innerHTML = '<div class="q"><b>Send to a person.</b> A forced verdict would reject this. A partner would want to see it.</div>';
    else $("#vq").innerHTML = "";
  }
  $$(".ptabs button").forEach(b => b.addEventListener("click", () => { cur = b.dataset.t; $$(".ptabs button").forEach(x => x.setAttribute("aria-selected", x === b)); render(); }));
  $$("#mode button").forEach(b => b.addEventListener("click", () => { mode = b.dataset.m; $$("#mode button").forEach(x => x.setAttribute("aria-pressed", x === b)); render(); }));
  ["#m_emin", "#m_emax", "#m_margin", "#m_growth"].forEach(s => $(s).addEventListener("input", render));
  render();
  // chart: recall vs EBITDA disclosure
  const data = ${JSON.stringify(sweepE.map((x) => ({ v: x.v, s: x.strict, a: x.ask })))};
  const W = 900, H = 300, pl = 56, pr = 20, pt = 16, pb = 40, el = document.getElementById("c1"), tip = el.querySelector(".tip");
  const x = v => pl + (W - pl - pr) * (0.09 + 0.82 * (v - 0.4) / 0.6), y = v => pt + (H - pt - pb) * (1 - v);
  let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Fitting deals kept by EBITDA disclosure rate">';
  [0, .25, .5, .75, 1].forEach(t => { s += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(t) + '" y2="' + y(t) + '" stroke="var(--grid)"/><text x="' + (pl - 8) + '" y="' + (y(t) + 4) + '" text-anchor="end">' + Math.round(t * 100) + '%</text>'; });
  const bw = 34;
  data.forEach(d => { const cx = x(d.v);
    s += '<text x="' + cx + '" y="' + (H - 14) + '" text-anchor="middle">' + Math.round(d.v * 100) + '% state EBITDA</text>';
    [["s", "var(--bar)", -bw - 1, "Forced yes/no"], ["a", "var(--accent)", 1, "Ask, then decide"]].forEach(([k, c, off, name]) => {
      const h = y(0) - y(d[k]); s += '<rect class="b" data-t="' + name + ': ' + Math.round(d[k] * 100) + '% kept when ' + Math.round(d.v * 100) + '% of teasers state EBITDA" x="' + (cx + off) + '" y="' + y(d[k]) + '" width="' + bw + '" height="' + Math.max(1, h) + '" rx="4" fill="' + c + '"/>';
      s += '<text class="lab" x="' + (cx + off + bw / 2) + '" y="' + (y(d[k]) - 6) + '" text-anchor="middle" style="font-size:12px">' + Math.round(d[k] * 100) + '%</text>'; }); });
  s += '</svg>'; el.innerHTML = s; el.appendChild(tip);
  el.querySelectorAll("rect.b").forEach(r => { r.addEventListener("mousemove", e => { tip.textContent = r.dataset.t; const b = el.getBoundingClientRect(); tip.style.left = Math.min(e.clientX - b.left + 12, b.width - 270) + "px"; tip.style.top = (e.clientY - b.top - 30) + "px"; tip.style.opacity = 1; }); r.addEventListener("mouseleave", () => tip.style.opacity = 0); });
})();
</script></body></html>`;
fs.writeFileSync(path.join(__dirname, "..", "index.html"), html);
console.log("ok", html.length, JSON.stringify({ strictRecall: st.strict.recall.toFixed(3), wastedCut: (1 - st.ask.wasted / st.lenient.wasted).toFixed(2), hoursCut: (1 - st.ask.hours / st.lenient.hours).toFixed(2), hpf: [st.strict.hpf, st.lenient.hpf, st.ask.hpf].map((v) => v.toFixed(1)) }));
