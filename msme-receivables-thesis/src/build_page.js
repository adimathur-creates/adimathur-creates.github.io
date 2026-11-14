// Builds ../index.html from model.js and facts.js. Run: node src/build_page.js
const fs = require("fs"), path = require("path");
const M = require("./model.js"), F = require("./facts.js");
const modelSrc = fs.readFileSync(path.join(__dirname, "model.js"), "utf8");
const f = F.facts;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const cr = (x) => "Rs " + Math.round(x).toLocaleString("en-IN") + " cr";
const src = (k) => `<a class="src" href="${f[k].url}" title="${esc(f[k].src)}">[source]</a>`;

const base = M.rank();
const top = M.ARCHETYPES.find((a) => a.id === base[0].id);
const be = Object.fromEntries(top.inputs.map((i) => [i.k, M.breakEven(top, i.k)]));
const fmtIn = (i, v) => i.unit === "share" ? (v * 100).toFixed(v < 0.01 ? 2 : 1) + "%" : i.unit === "Rs" ? "Rs " + Math.round(v).toLocaleString("en-IN") : i.unit === "Rs cr" ? cr(v) : Math.round(v).toLocaleString("en-IN") + " " + i.unit;
const filedShare = 55244 / 810000;

const shapeCards = M.ARCHETYPES.map((a, n) => `
  <div class="card shape" id="shape-${a.id}">
    <div class="shape-n">${n + 1}</div>
    <h3>${esc(a.name)}</h3>
    <p>${esc(a.what)}</p>
    <p class="note"><b>Who pays:</b> ${esc(a.payer)}</p>
    ${F.players.filter((p) => p.shape === a.id).length ? `<p class="note"><b>Already here:</b> ${F.players.filter((p) => p.shape === a.id).map((p) => `<a href="${p.url}">${esc(p.name)}</a>`).join(", ")}</p>` : ""}
  </div>`).join("");

const scoreRows = M.ARCHETYPES.map((a) => `<tr><td><b>${esc(a.short)}</b></td>${M.CRITERIA.map((c) => c.id === "fund" ? `<td class="num" data-fund="${a.id}"></td>` : `<td class="num"${a.notes[c.id] ? ` title="${esc(a.notes[c.id])}"` : ""}>${a.scores[c.id]}${a.notes[c.id] ? '<sup>*</sup>' : ""}</td>`).join("")}<td class="num" data-score="${a.id}"></td></tr>`).join("");

const notesList = M.ARCHETYPES.map((a) => Object.keys(a.notes).length ? `<li><b>${esc(a.short)}:</b> ${Object.entries(a.notes).map(([k, v]) => `<i>${esc(M.CRITERIA.find((c) => c.id === k).label.toLowerCase())}</i> — ${esc(v)}`).join("; ")}</li>` : "").join("");

const assumptionEditors = M.ARCHETYPES.map((a) => `
  <details class="assume" data-arch="${a.id}">
    <summary><b>${esc(a.short)}</b> <span class="note">revenue at maturity <span data-rev="${a.id}"></span> · exit at ${a.multiple}x revenue</span></summary>
    <div class="inputs">${a.inputs.map((i) => `
      <label><span>${esc(i.label)}</span>
        <input type="number" step="any" data-k="${i.k}" value="${i.unit === "share" ? +(i.v * 100).toFixed(3) : i.v}">${i.unit === "share" ? "<em>%</em>" : ""}
        <small>${esc(i.why)}</small></label>`).join("")}
      <label><span>Exit multiple on revenue</span><input type="number" step="0.5" data-mult value="${a.multiple}"><small>Assumption. Lower for lending-like revenue, higher for software.</small></label>
    </div>
  </details>`).join("");

const timeline = [
  ["Apr 2023", "Section 43B(h) applies to invoices from 1 April 2023: paying a micro or small supplier late now costs the buyer its tax deduction for that year.", "h43b"],
  ["Nov 2024", "TReDS made mandatory for every company above Rs 250 crore turnover (was Rs 500 crore) and all CPSEs, by 31 March 2025.", "tredsMandate"],
  ["Jun 2025", "MSME Online Dispute Resolution portal goes live. From 15 Oct 2025 every new delayed-payment case must be filed on it.", "odr"],
  ["Jan 2026", "Economic Survey puts delayed dues at about Rs 8.1 lakh crore and pushes cash-flow-based lending.", "stock"],
  ["Feb 2026", "Budget: credit guarantee for TReDS invoice discounting, mandatory TReDS settlement for CPSE purchases, a secondary market for TReDS receivables.", "budget"],
  ["Sep 2026", "Credit guarantee cover for TReDS financing goes live.", "cgtmse"],
  ["Oct 2026", "MSMED (Amendment) Act in force: 90-day mediation, 75% pre-deposit to appeal an award, awards enforceable as debt under IBC, disclosure penalties up to Rs 1 lakh.", "amend"],
  ["Dec 2026", "Amended council (MSEFC) process takes effect on 15 December.", "amend"]
].map(([d, t, k]) => `<li><span class="when">${d}</span><span>${esc(t)} ${src(k)}</span></li>`).join("");

const sources = Object.values(f).map((x) => `<li><a href="${x.url}">${esc(x.src)}</a> — ${esc(x.v)}: ${esc(x.text)}</li>`).join("") +
  F.players.map((p) => `<li><a href="${p.url}">${esc(p.name)}</a> — ${esc(p.note)}</li>`).join("") +
  F.portfolio.map((p) => `<li><a href="${p.url}">${esc(p.name)}</a> — portfolio fit</li>`).join("");

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Who gets India's small suppliers paid? A seed thesis on MSME late payments · Aditya Mathur</title>
<meta name="description" content="Rs 8.1 lakh crore is owed to India's small businesses. The 2026 reforms built new rails. Which kind of company wins the gap they leave, and can any of them return an early-stage fund? A thesis memo with a working model.">
<style>
:root{--bg:#fafaf8;--surface:#fff;--ink:#15151f;--ink-soft:#3b414b;--muted:#5b6170;--line:#e4e3de;--accent:#2b4fd8;--accent-soft:#eaeefc;--tag:#f0efea;--good:#1f6b45;--good-soft:#e5f3eb;--bad:#a5332a;--bad-soft:#fbeae8;--warn:#8a5a10;--warn-soft:#fbf1df;--bar:#b9c3e6;--grid:#ebeae6}
@media (prefers-color-scheme:dark){:root{--bg:#101215;--surface:#171a1f;--ink:#e9ebee;--ink-soft:#c3c8d0;--muted:#9aa1ad;--line:#2a2e36;--accent:#8ea6ff;--accent-soft:#1a2140;--tag:#1f232a;--good:#6fd09c;--good-soft:#142a1e;--bad:#f09186;--bad-soft:#2d1816;--warn:#f0b86e;--warn-soft:#2a2214;--bar:#3a4466;--grid:#24272d}}
*{box-sizing:border-box}html,body{margin:0}
body{background:var(--bg);color:var(--ink);font:16px/1.62 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,sans-serif}
a{color:var(--accent);text-underline-offset:3px}a.src{font-size:12px;white-space:nowrap}
.wrap{max-width:980px;margin:0 auto;padding:44px 18px 80px}
.kicker{font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:0 0 10px}
h1{font-size:clamp(30px,5vw,44px);line-height:1.08;margin:0 0 12px;letter-spacing:-.02em}
.lede{font-size:19px;color:var(--muted);margin:0 0 14px;max-width:780px}
.byline{font-size:14px;color:var(--muted);display:flex;flex-wrap:wrap;gap:4px 16px}
.disclaimer{font-size:13px;color:var(--muted);border-left:3px solid var(--line);padding:4px 0 4px 12px;margin:18px 0 0}
h2{font-size:24px;line-height:1.2;margin:56px 0 10px;letter-spacing:-.01em}h2 .n{color:var(--muted);font-weight:500;margin-right:6px}
h3{font-size:17px;margin:22px 0 6px}p{margin:0 0 12px}ul,ol{margin:0 0 14px;padding-left:22px}li{margin:5px 0}
.tldr{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:20px 22px;margin:28px 0 0}
.tldr h2{margin:0 0 10px;font-size:15px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:18px 0 6px}
.stat{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px}
.stat b{display:block;font-size:26px;line-height:1.1}.stat span{font-size:13.5px;color:var(--muted);display:block;margin-top:4px;line-height:1.35}
table{border-collapse:collapse;width:100%;font-size:14px;margin:10px 0 14px;background:var(--surface);border:1px solid var(--line)}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:12px;letter-spacing:.03em;text-transform:uppercase;color:var(--muted);font-weight:600;background:var(--tag)}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
tr.top td{background:var(--accent-soft)}
.tablewrap{overflow-x:auto}.note{font-size:13.5px;color:var(--muted);font-weight:400}
.callout{background:var(--accent-soft);border-radius:12px;padding:14px 16px;margin:14px 0}.callout.warn{background:var(--warn-soft)}.callout.good{background:var(--good-soft)}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px 16px;position:relative}.card h3{margin-top:0;padding-right:26px}
.shape-n{position:absolute;top:12px;right:14px;font-weight:700;color:var(--muted)}
ol.timeline{list-style:none;padding:0;border-left:2px solid var(--line);margin-left:6px}
ol.timeline li{padding:0 0 12px 18px;position:relative;display:grid;grid-template-columns:86px 1fr;gap:10px}
ol.timeline li:before{content:"";position:absolute;left:-7px;top:7px;width:12px;height:12px;border-radius:50%;background:var(--accent)}
.when{font-weight:600;font-variant-numeric:tabular-nums}
.controls{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:10px 0}
.seg button{font:inherit;font-size:14px;border:1px solid var(--line);background:var(--surface);color:var(--ink);padding:6px 14px;cursor:pointer}
.seg button:first-child{border-radius:999px 0 0 999px}.seg button:last-child{border-radius:0 999px 999px 0}.seg button+button{border-left:0}
.seg button[aria-pressed="true"]{background:var(--ink);color:var(--bg);border-color:var(--ink)}
.btn{font:inherit;font-size:14px;border:1px solid var(--line);background:var(--surface);color:var(--ink);border-radius:999px;padding:6px 12px;cursor:pointer}
.weights{display:grid;grid-template-columns:repeat(4,1fr);gap:8px 14px;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin:8px 0}
.weights label{font-size:13px;color:var(--ink-soft);display:flex;flex-direction:column;gap:2px}
.weights output{font-variant-numeric:tabular-nums;color:var(--muted);font-size:12px}
input[type=range]{width:100%;accent-color:var(--accent)}
.chart{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:10px 12px;position:relative}
.chart svg{width:100%;height:auto;display:block}.chart text{fill:var(--muted);font-size:12px;font-family:inherit}
.chart .lab{fill:var(--ink);font-size:13px}.chart .val{fill:var(--ink);font-size:12.5px;font-variant-numeric:tabular-nums}
figure{margin:14px 0 18px}figcaption{font-size:13.5px;color:var(--muted);margin-top:6px}
.tip{position:absolute;pointer-events:none;background:var(--ink);color:var(--bg);font-size:12.5px;padding:6px 9px;border-radius:8px;opacity:0;transition:opacity .1s;max-width:260px;line-height:1.4}
details.assume{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:9px 13px;margin:8px 0}
details.assume summary{cursor:pointer}.inputs{display:grid;grid-template-columns:1fr 1fr;gap:10px 18px;margin-top:10px}
.inputs label{display:grid;grid-template-columns:1fr 130px auto;gap:2px 8px;align-items:center;font-size:13.5px}
.inputs label small{grid-column:1/-1;color:var(--muted);font-size:12px;line-height:1.35}
.inputs input,.fundbox input{font:inherit;font-size:14px;padding:4px 6px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--ink);width:100%;text-align:right}
.fundbox{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin:8px 0}
.fundbox label{font-size:13.5px;display:flex;flex-direction:column;gap:3px}.fundbox small{color:var(--muted);font-size:12px}
.big{font-size:22px;font-weight:700}
.verdict{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}.verdict .card h3{font-size:15px;letter-spacing:.04em;text-transform:uppercase}
.k-yes h3{color:var(--good)}.k-maybe h3{color:var(--warn)}.k-no h3{color:var(--bad)}
.sources li{font-size:13.5px}
@media (max-width:760px){.stats,.weights,.fundbox,.verdict,.grid2,.grid3,.inputs{grid-template-columns:1fr 1fr}.verdict,.grid3{grid-template-columns:1fr}ol.timeline li{grid-template-columns:1fr}}
@media print{.controls,.weights,details.assume{display:none}}
</style>
</head>
<body><div class="wrap">
<p class="kicker">Seed thesis memo · fintech · written for 8i Ventures</p>
<h1>Who gets India's small suppliers paid?</h1>
<p class="lede">Rs 8.1 lakh crore is owed to India's small businesses. Between 2023 and 2026 the government built new rails to fix it. This memo asks which kind of company wins the gap those rails leave, and whether any of them can return an early-stage fund.</p>
<div class="byline"><span>Aditya Mathur</span><span>Bengaluru</span><span>Data as of ${F.asOf}</span><span><a href="https://github.com/adimathur-creates/adimathur-creates.github.io/tree/main/msme-receivables-thesis">Model and tests on GitHub</a></span></div>
<p class="disclaimer">Independent work from public sources. Not affiliated with or reviewed by 8i Ventures or any company named here. Every number is either linked to a source or marked as my assumption, and every assumption can be changed on this page. I built <a href="https://recourse-demo.netlify.app/">Recourse</a>, a product in this space, and I score it here like any other shape (it comes last).</p>

<section class="tldr">
<h2>The short version</h2>
<p><b>The question.</b> Should a seed fund back a company in MSME late payments in 2027, and what shape must that company have to matter to a $50 million fund?</p>
<ul>
<li><b>Yes, but not on the supplier's side.</b> The supplier has the pain and no budget. Since 43B(h), and more since the October 2026 amendment, the <b>buyer</b> carries the cost of paying late. Money and urgency now sit with the buyer.</li>
<li><b>The best shape is a buyer-led working-capital platform</b>: sell compliance to the buyer's finance team first, then finance the same approved invoices early. It scores highest under my weights, and it stays top when I remove the fund-return criterion entirely.</li>
<li><b>No shape returns Fund II on its own in my base case.</b> The platform gets closest (<span data-topmult></span> of the fund at 10% exit ownership). To reach 1x alone it needs about <b>${cr(be.volume)}</b> of invoices financed a year, roughly a fifth of what TReDS discounted in FY26. That is the bar I would hold a founder to in the first meeting.</li>
<li><b>Claim-to-cash is the most underbuilt shape</b> and the one the 2026 amendment helps most, but it needs a balance sheet. Worth a pre-seed (Origami-size) bet only with a lending partner already signed.</li>
</ul>
</section>

<div class="stats">
<div class="stat"><b>Rs 8.1 lakh cr</b><span>stuck in delayed payments to MSMEs (Economic Survey 2025-26) ${src("stock")}</span></div>
<div class="stat"><b>${(filedShare * 100).toFixed(1)}%</b><span>All claims ever filed on Samadhaan since 2017 (Rs 55,244 cr) as a share of today's stuck dues ${src("samadhaan")}</span></div>
<div class="stat"><b>8.7x</b><span>growth in TReDS invoice discounting, FY22 to FY26 (Rs 40,000 cr to Rs 3.47 lakh cr) ${src("treds")}</span></div>
<div class="stat"><b>73 days</b><span>average invoice payment cycle, though 82.6% of invoices carry 0-30 day terms (industry report) ${src("cycle")}</span></div>
</div>

<h2><span class="n">1</span>Why now</h2>
<p>For most of the last 20 years the law said "pay within 45 days" and nobody had a reason to obey. Three things changed in three years: the buyer now pays a tax cost for being late, filing became digital and mandatory, and an award now has teeth.</p>
<ol class="timeline">${timeline}</ol>

<h2><span class="n">2</span>What the new rails still miss</h2>
<div class="tablewrap"><table>
<tr><th>Rail</th><th>What it fixes</th><th>What it leaves out</th></tr>
<tr><td><b>TReDS</b></td><td>Fast, cheap early payment on invoices the buyer has accepted. Volume is up 8.7x since FY22. ${src("treds")}</td><td>Buyers below Rs 250 crore turnover, private buyers who are not onboarded, and any invoice the buyer has not accepted or disputes. ${src("tredsMandate")}</td></tr>
<tr><td><b>Section 43B(h)</b></td><td>Gives the buyer a tax reason to pay micro and small suppliers within 45 days. ${src("h43b")}</td><td>Only covers suppliers the buyer can identify as micro or small. Some buyers respond by avoiding registered suppliers or squeezing terms. ${src("h43bSide")}</td></tr>
<tr><td><b>ODR portal + 2026 amendment</b></td><td>One digital route, 90-day mediation, 75% pre-deposit to appeal, awards enforceable under IBC. ${src("amend")}</td><td>The supplier still has to build the claim: invoice dates, acceptance proof, the buyer's own words, the interest maths. And filing can damage the relationship. ${src("relationship")}</td></tr>
<tr><td><b>Samadhaan (legacy)</b></td><td>Nine years of filings: 2,56,892 applications. ${src("samadhaan")}</td><td>Only 58,148 cases disposed. All claims ever filed equal ${(filedShare * 100).toFixed(1)}% of today's stuck dues: almost nobody files.</td></tr>
</table></div>
<div class="callout"><b>The gap, in one line:</b> the rails work for <i>accepted</i> invoices from <i>large</i> buyers. The money that is stuck is mostly in disputed, unaccepted, or mid-sized-buyer invoices, held by suppliers who cannot assemble a claim and fear losing the customer.</div>

<h2><span class="n">3</span>Six shapes a company could take</h2>
<p>I did not start from a list of startups. I started from who pays and what the company owns, then checked who is already there.</p>
<div class="grid3">${shapeCards}</div>

<h2><span class="n">4</span>Scoring them the way an early-stage fund would</h2>
<p>Each shape gets 1 to 5 on eight criteria. Seven are my judgement (hover a starred score for the reason). The eighth comes from the fund-return model in section 5. Drag the weights or switch the scenario; the ranking updates.</p>
<div class="controls"><span class="note">Scenario</span><div class="seg" id="scen">${Object.entries(M.SCENARIOS).map(([k, s]) => `<button data-s="${k}" aria-pressed="${k === "base"}">${s.label}</button>`).join("")}</div><button class="btn" id="resetw">Reset weights</button></div>
<div class="weights" id="weights">${M.CRITERIA.map((c) => `<label>${esc(c.label)}<input type="range" min="0" max="30" value="${c.weight}" data-c="${c.id}"><output data-o="${c.id}">${c.weight}</output></label>`).join("")}</div>
<figure class="chart" id="scorechart"><div class="tip"></div></figure>
<figcaption>Weighted score out of 5. Bars in the accent colour are the current leader.</figcaption>
<div class="tablewrap"><table id="scoretable">
<tr><th>Shape</th>${M.CRITERIA.map((c) => `<th class="num" title="${esc(c.label)}">${({payer:"Payer",distribution:"Distribution",tailwind:"Tailwind",moat:"Moat",capital:"Capital-light",whitespace:"Room",fund:"Fund math",portfolio:"8i fit"})[c.id]}</th>`).join("")}<th class="num">Score</th></tr>
${scoreRows}
</table></div>
<details class="assume"><summary>Why each starred score is what it is</summary><ul>${notesList}</ul></details>

<h2><span class="n">5</span>Can any of them return the fund?</h2>
<p>An early-stage fund needs a few companies that each return the whole fund. Fund II targets $50 million ${src("fund2")}, and 8i has said it aims to own 10-15% of category winners at exit ${src("ownership")}. At <span data-own>10%</span> ownership, one company has to exit at <b data-reqexit></b> to return the fund. For scale: the 12x M2P exit returned Rs 115.9 crore ${src("m2p")}, roughly the size of Fund I.</p>
<div class="fundbox">
<label>Fund size ($ million)<input type="number" id="fsize" value="${M.FUND.sizeUsdM}"><small>8i Fund II target.</small></label>
<label>Ownership at exit (%)<input type="number" id="fown" value="${M.FUND.exitOwnership * 100}"><small>8i's stated aim: 10-15% in winners.</small></label>
<label>Rupees per dollar<input type="number" id="ffx" value="${M.FUND.fxInrPerUsd}"><small>Assumption.</small></label>
</div>
<figure class="chart" id="fundchart"><div class="tip"></div></figure>
<figcaption>Share of the whole fund one company would return. The dashed line is 1x: that company alone returns the fund.</figcaption>
<h3>Change the assumptions behind each shape</h3>
<p class="note">Revenue at maturity is a simple units-times-price model so every input is visible. Each one says where it comes from.</p>
${assumptionEditors}
<h3>What has to be true for the top shape to return the fund alone</h3>
<p class="note">Each row moves one input and holds the rest at base. Read it as "the founder must convince me of at least one of these".</p>
<div class="tablewrap"><table><tr><th>Input</th><th class="num">Base</th><th class="num">Needed for 1x</th><th class="num">Change</th></tr>
${top.inputs.map((i) => `<tr><td>${esc(i.label)}</td><td class="num">${fmtIn(i, i.v)}</td><td class="num">${be[i.k] == null ? "not reachable" : fmtIn(i, be[i.k])}</td><td class="num">${be[i.k] == null ? "" : (be[i.k] / i.v).toFixed(1) + "x"}</td></tr>`).join("")}
</table></div>
<p>Financed volume is the most believable lever. ${cr(be.volume)} a year is large, but it is about ${(be.volume / 347000 * 100).toFixed(0)}% of TReDS's FY26 volume, and the platform sees approved invoices before anyone else does.</p>

<h2><span class="n">6</span>The call</h2>
<div class="verdict">
<div class="card k-yes"><h3>Take the meeting</h3><p><b>Buyer-led working-capital platform.</b> A founder who has sold to CFOs, with a plan to finance invoices through bank or NBFC partners from year two. First proof I would ask for: 10 buyers paying for compliance, and one lender ready to fund their approved invoices.</p></div>
<div class="card k-maybe"><h3>Pre-seed only, with conditions</h3><p><b>Claim-to-cash.</b> The amendment makes a good claim worth money, and nobody owns the supplier's path from evidence to award. Back it only with a lending partner signed, and price the cheque for an Origami-size bet ${src("origami")}.</p></div>
<div class="card k-no"><h3>Pass</h3><p><b>Supplier copilots (including my own Recourse), the payment bureau and plain invoice-discounting marketplaces.</b> Low budget, slow cold start, or crowded with funded players. The copilot also overlaps with Easebuzz, already in 8i's portfolio.</p></div>
</div>

<h2><span class="n">7</span>What I learned diligencing my own company</h2>
<p>I built Recourse: a supplier pastes a WhatsApp thread into Claude, Recourse builds an evidence timeline, works out the legal due date and the MSMED interest, and refuses to let anyone escalate a weak claim. The product works. Run through the model above, the business does not clear the bar.</p>
<div class="grid2">
<div class="card"><h3>My own numbers</h3><ul>
<li>Rs 999 a month, Rs 0 AI cost (customers bring their own Claude), about 69% contribution at 100 customers.</li>
<li>Support is the real cost: Rs 250 per customer per month, break-even at about 56 minutes of support a month.</li>
<li>Year-one target: 150 businesses, about Rs 18 lakh ARR. These are planning targets, not results.</li></ul></div>
<div class="card"><h3>What I would change</h3><ul>
<li>Sell the same evidence engine to the <b>buyer's</b> finance team, where a late payment now has a tax and penalty cost.</li>
<li>Use the claim pack as the input to financing, not just to escalation: a verified, enforceable claim is an asset a lender can price.</li>
<li>Keep the rule that software never changes money or escalates on its own. That trust design is the part worth keeping.</li></ul></div>
</div>

<h2><span class="n">8</span>How I would find this founder first</h2>
<p>The best founder for this company is probably not raising yet. Here is where I would look, and what I would ask.</p>
<div class="grid2">
<div class="card"><h3>Where to look</h3><ol>
<li><b>Chartered accountants.</b> Companies must disclose dues to micro and small suppliers. CAs see which clients are late and which suppliers are owed. Ask 20 CA partners who in their network is building on this.</li>
<li><b>People leaving TReDS exchanges.</b> Ops and sales staff at RXIL, M1xchange, Invoicemart, C2treds and DTX know exactly which invoices TReDS cannot take.</li>
<li><b>ODR and council practitioners.</b> Lawyers and conciliators on the new portal see which claims succeed.</li>
<li><b>Tally and Zoho Books builders.</b> Plug-ins that read payables and Udyam status are the first product a buyer-side founder ships.</li>
<li><b>Origami applicants.</b> Re-read every past fintech application for anyone who touched payables.</li></ol></div>
<div class="card"><h3>First-call questions</h3><ol>
<li>Who signs the cheque, and what does a late payment cost them this year?</li>
<li>How do you know a vendor is micro or small, invoice by invoice?</li>
<li>What happens to a disputed invoice in your product?</li>
<li>Which lender will finance your buyers' approved invoices, and on what terms?</li>
<li>How many support minutes does a customer need each month?</li>
<li>What do you do when a buyer drops a registered supplier to avoid 43B(h)?</li></ol>
<h3>Reasons I would walk away</h3><ul>
<li>Revenue depends on suppliers paying a subscription.</li>
<li>No plan for disputed or unaccepted invoices.</li>
<li>Financing plan is "we will raise debt later".</li></ul></div>
</div>

<h2><span class="n">9</span>How this helps the existing portfolio</h2>
<div class="grid3">${F.portfolio.map((p) => `<div class="card"><h3><a href="${p.url}">${esc(p.name)}</a></h3><p>${esc(p.fit)}</p></div>`).join("")}</div>

<h2><span class="n">10</span>Method and limits</h2>
<ul>
<li>Every fact links to a public source; several are news reports of official documents rather than the documents themselves. Industry figures (Recordent) are not official statistics.</li>
<li>The revenue model is deliberately simple: units times price. It is a way to argue about assumptions in the open, not a forecast.</li>
<li>Scores for seven criteria are my judgement. I tested that the top shape does not depend on the fund-return weight, and that the supplier copilot ranks last on every single criterion except capital (see the tests).</li>
<li>I did not count companies with formal MSME procurement; the 25,000 buyers figure is the weakest input. It is the first thing I would check with TReDS exchange data.</li>
<li>Exit multiples are assumptions and change with the market.</li>
</ul>
<h3>Sources</h3>
<ol class="sources">${sources}</ol>
<p class="note">Built by Aditya Mathur. Model: <code>src/model.js</code>, 16 tests in <code>test/model.test.js</code>. <a href="../">More work</a>.</p>
</div>

<script>
${modelSrc}
(function(){
  const M = window.ThesisModel; const $ = (s, r = document) => r.querySelector(s); const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const state = { scen: "base", weights: Object.fromEntries(M.CRITERIA.map(c => [c.id, c.weight])), fund: {}, edits: {}, mults: {} };
  const cr = x => "Rs " + Math.round(x).toLocaleString("en-IN") + " cr";
  function overrides(){ const s = M.SCENARIOS[state.scen].overrides, o = {}; M.ARCHETYPES.forEach(a => { o[a.id] = Object.assign({}, s[a.id] || {}, state.edits[a.id] || {}); }); return o; }
  function fund(){ return Object.assign({}, M.SCENARIOS[state.scen].fund, state.fund); }
  function bars(el, rows, opts){
    const W = 900, rowH = 38, padL = 190, padR = 90, H = rows.length * rowH + 30;
    const max = opts.max; const x = v => padL + (W - padL - padR) * Math.min(v, max) / max;
    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + opts.label + '">';
    opts.ticks.forEach(t => { s += '<line x1="' + x(t) + '" x2="' + x(t) + '" y1="4" y2="' + (H - 22) + '" stroke="var(--grid)"/><text x="' + x(t) + '" y="' + (H - 6) + '" text-anchor="middle">' + opts.tick(t) + '</text>'; });
    rows.forEach((r, i) => { const y = 8 + i * rowH; const lead = opts.lead(r, i);
      s += '<g class="row" data-i="' + i + '"><rect x="0" y="' + (y - 4) + '" width="' + W + '" height="' + rowH + '" fill="transparent"/>';
      s += '<text class="lab" x="' + (padL - 10) + '" y="' + (y + 18) + '" text-anchor="end">' + r.short + '</text>';
      s += '<rect x="' + padL + '" y="' + (y + 4) + '" width="' + Math.max(2, x(r.v) - padL) + '" height="20" rx="4" fill="' + (lead ? 'var(--accent)' : 'var(--bar)') + '"/>';
      s += '<text class="val" x="' + (x(r.v) + 8) + '" y="' + (y + 18) + '">' + opts.fmt(r.v) + (r.v > max ? ' →' : '') + '</text></g>'; });
    if (opts.refLine != null) s += '<line x1="' + x(opts.refLine) + '" x2="' + x(opts.refLine) + '" y1="2" y2="' + (H - 22) + '" stroke="var(--ink)" stroke-dasharray="5 4" stroke-width="1.5"/>';
    s += '</svg>';
    const tip = el.querySelector(".tip"); el.innerHTML = s; el.appendChild(tip);
    $$(".row", el).forEach(g => { g.addEventListener("mousemove", e => { const r = rows[+g.dataset.i]; tip.innerHTML = opts.tip(r); const b = el.getBoundingClientRect(); tip.style.left = Math.min(e.clientX - b.left + 12, b.width - 270) + "px"; tip.style.top = (e.clientY - b.top + 12) + "px"; tip.style.opacity = 1; }); g.addEventListener("mouseleave", () => tip.style.opacity = 0); });
  }
  function render(){
    const o = overrides(), fd = fund();
    const r = M.rank(state.weights, fd, o, state.mults);
    bars($("#scorechart"), r.map(x => Object.assign({ v: x.score }, x)), { label: "Weighted score by shape", max: 5, ticks: [1,2,3,4,5], tick: t => t, fmt: v => v.toFixed(2), lead: (x, i) => i === 0,
      tip: x => "<b>" + x.name + "</b><br>Score " + x.score.toFixed(2) + " of 5<br>Revenue at maturity " + cr(x.revenueCr) + "<br>Returns " + x.fundMultiple.toFixed(2) + "x the fund" });
    const fr = r.slice().sort((a, b) => b.fundMultiple - a.fundMultiple);
    const fmax = Math.max(1.2, Math.ceil(Math.min(3, fr[0].fundMultiple) * 5) / 5);
    bars($("#fundchart"), fr.map(x => Object.assign({ v: x.fundMultiple }, x)), { label: "Fund multiple by shape", max: fmax, ticks: [0, 0.5, 1, 1.5, 2, 2.5, 3].filter(t => t <= fmax), tick: t => t + "x", fmt: v => v.toFixed(2) + "x", lead: x => x.fundMultiple >= 1, refLine: 1,
      tip: x => "<b>" + x.name + "</b><br>Revenue " + cr(x.revenueCr) + "<br>Exit value " + cr(x.exitCr) + "<br>" + x.fundMultiple.toFixed(2) + "x the fund" });
    $$("[data-score]").forEach(td => { const x = r.find(y => y.id === td.dataset.score); td.textContent = x.score.toFixed(2); td.parentElement.classList.toggle("top", x.id === r[0].id); });
    $$("[data-fund]").forEach(td => { const x = r.find(y => y.id === td.dataset.fund); td.textContent = M.fundScore(x.fundMultiple).toFixed(1); });
    $$("[data-rev]").forEach(sp => { const x = r.find(y => y.id === sp.dataset.rev); sp.textContent = cr(x.revenueCr) + " a year · returns " + x.fundMultiple.toFixed(2) + "x"; });
    const ff = Object.assign({}, M.FUND, fd); $$("[data-own]").forEach(b => b.textContent = +(ff.exitOwnership * 100).toFixed(1) + "%"); $$("[data-reqexit]").forEach(b => b.textContent = cr(M.requiredExitCr(fd)) + " (about $" + Math.round(ff.sizeUsdM / ff.exitOwnership) + " million)");
    const base = M.rank(); $$("[data-topmult]").forEach(b => b.textContent = base[0].fundMultiple.toFixed(2) + "x");
  }
  $$("#scen button").forEach(b => b.addEventListener("click", () => { state.scen = b.dataset.s; $$("#scen button").forEach(x => x.setAttribute("aria-pressed", x === b)); syncInputs(); render(); }));
  $$("#weights input").forEach(i => i.addEventListener("input", () => { state.weights[i.dataset.c] = +i.value; $('[data-o="' + i.dataset.c + '"]').textContent = i.value; render(); }));
  $("#resetw").addEventListener("click", () => { M.CRITERIA.forEach(c => { state.weights[c.id] = c.weight; const i = $('[data-c="' + c.id + '"]'); i.value = c.weight; $('[data-o="' + c.id + '"]').textContent = c.weight; }); render(); });
  [["#fsize", "sizeUsdM", 1], ["#fown", "exitOwnership", 0.01], ["#ffx", "fxInrPerUsd", 1]].forEach(([sel, k, mul]) => $(sel).addEventListener("input", e => { const v = parseFloat(e.target.value); if (v > 0) { state.fund[k] = v * mul; render(); } }));
  function syncInputs(){ state.edits = {}; const s = M.SCENARIOS[state.scen];
    $$("details.assume[data-arch]").forEach(d => { const a = M.ARCHETYPES.find(x => x.id === d.dataset.arch); const vals = M.inputsOf(a, s.overrides);
      $$("input[data-k]", d).forEach(inp => { const def = a.inputs.find(i => i.k === inp.dataset.k); const v = vals[inp.dataset.k]; inp.value = def.unit === "share" ? +(v * 100).toFixed(3) : v; }); });
    const own = (s.fund.exitOwnership || M.FUND.exitOwnership); $("#fown").value = +(own * 100).toFixed(1); delete state.fund.exitOwnership; }
  $$("details.assume[data-arch]").forEach(d => { const a = M.ARCHETYPES.find(x => x.id === d.dataset.arch);
    $$("input[data-k]", d).forEach(inp => inp.addEventListener("input", () => { const def = a.inputs.find(i => i.k === inp.dataset.k); const v = parseFloat(inp.value); if (!(v >= 0)) return;
      state.edits[a.id] = Object.assign({}, state.edits[a.id], { [def.k]: def.unit === "share" ? v / 100 : v }); render(); }));
    const m = $("input[data-mult]", d); m.addEventListener("input", () => { const v = parseFloat(m.value); if (v > 0) { state.mults[a.id] = v; render(); } }); });
  render();
})();
</script>
</body></html>`;

fs.writeFileSync(path.join(__dirname, "..", "index.html"), html);
console.log("wrote index.html", html.length, "bytes; top shape:", base[0].short, base[0].fundMultiple.toFixed(2) + "x");
