// Builds ../index.html. Run: node src/build_page.js
const fs = require("fs"), path = require("path");
const D = require("./dates.js"), S = require("./simulate.js");
const read = (f) => fs.readFileSync(path.join(__dirname, f), "utf8");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const N = 20, runs = S.seeds(N, { borrowers: 20000 });
const avg = (p, seg, k) => runs.reduce((s, r) => s + r[p][seg][k], 0) / N;
const M = {}; for (const p of S.POLICIES) { M[p] = {}; for (const seg of ["all", "monthly", "weekly", "irregular"]) { M[p][seg] = {}; for (const k of ["firstOnTime", "dpd1", "dpd30", "writeOff", "contacts", "shift"]) M[p][seg][k] = avg(p, seg, k); } }
const pct = (x, d = 0) => (x * 100).toFixed(d) + "%", pp = (x) => (x * 100).toFixed(1) + " pts";
const NAMES = { fixed: "Today: due 30 days after disbursal", aligned: "Due the day after payday", autopay: "Payday date + AutoPay on that day", split: "Payday + AutoPay + half-payment option" };
const SHORT = { fixed: "Today", aligned: "Payday date", autopay: "+ AutoPay", split: "+ half-payment option" };
const F = M.fixed.all, A = M.aligned.all, P = M.autopay.all, X = M.split.all;
const missF = 1 - F.firstOnTime, missX = 1 - X.firstOnTime;

const sens = [
  ["Pays anyway when short", "payIfShort", [0.4, 0.55, 0.7], (v) => pct(v)],
  ["Days money lasts after payday", "bufferMeanDays", [3, 7, 12], (v) => v + " days"],
  ["Payday read correctly (salaried)", "detect", [0.5, 0.92], (v) => pct(v)],
  ["Weekly cure with half-payment option", "splitScrape", [0.2, 0.35, 0.5], (v) => pct(v)]
].map(([label, key, vals, fmt]) => vals.map((v) => {
  const o = key === "detect" ? { detect: { monthly: v } } : { [key]: v }; const r = S.run(Object.assign({ borrowers: 15000 }, o));
  return `<tr><td>${label}: <b>${fmt(v)}</b>${S.ASSUME[key] === v || (key === "detect" && v === 0.92) ? ' <span class="note">(base)</span>' : ""}</td>${S.POLICIES.map((p) => `<td class="num">${pct(r[p].all.firstOnTime)} · ${pct(r[p].all.dpd30, 1)}</td>`).join("")}</tr>`;
}).join("")).join("");

const ss = [[`First instalment missed: ${pct(missF, 0)} → 10% lower`, missF, missF * 0.9], [`30+ days past due: ${pct(F.dpd30, 1)} → 10% lower`, F.dpd30, F.dpd30 * 0.9], [`30+ days past due: ${pct(F.dpd30, 1)} → 5% lower`, F.dpd30, F.dpd30 * 0.95]]
  .map(([l, p0, p1]) => { const n = S.sampleSize(p0, p1); return `<tr><td>${l}</td><td class="num">${n.toLocaleString("en-IN")}</td><td class="num">${(n / 2500).toFixed(1)} days</td></tr>`; }).join("");

const segRows = ["monthly", "weekly", "irregular"].map((s) => `<tr><td><b>${({ monthly: "Monthly salary", weekly: "Weekly pay (gig, daily wage)", irregular: "Irregular" })[s]}</b> <span class="note">${pct(S.ASSUME.mix[s])} of borrowers</span></td>${S.POLICIES.map((p) => `<td class="num">${pct(M[p][s].firstOnTime)} · ${pct(M[p][s].dpd30, 1)}</td>`).join("")}</tr>`).join("");

const chartData = S.POLICIES.map((p) => ({ k: p, name: SHORT[p], miss: 1 - M[p].all.firstOnTime, dpd30: M[p].all.dpd30, contacts: M[p].all.contacts }));

const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Due on payday: cutting early delinquency at Branch without touching credit policy · Aditya Mathur</title>
<meta name="description" content="Many first-instalment misses on small digital loans are timing, not intent: the due date lands before the money does. A due-date engine, a repayment simulation and an experiment plan for Branch India.">
<style>
:root{--bg:#fafaf8;--surface:#fff;--ink:#15151f;--ink-soft:#3b414b;--muted:#5b6170;--line:#e4e3de;--accent:#2b4fd8;--accent-soft:#eaeefc;--tag:#f0efea;--good:#1f6b45;--good-soft:#e5f3eb;--bad:#a5332a;--bad-soft:#fbeae8;--warn:#8a5a10;--warn-soft:#fbf1df;--s1:#b9bec9;--s2:#7b91e0;--s3:#3a5ad8;--s4:#182c86;--grid:#ebeae6}
@media (prefers-color-scheme:dark){:root{--bg:#101215;--surface:#171a1f;--ink:#e9ebee;--ink-soft:#c3c8d0;--muted:#9aa1ad;--line:#2a2e36;--accent:#8ea6ff;--accent-soft:#1a2140;--tag:#1f232a;--good:#6fd09c;--good-soft:#142a1e;--bad:#f09186;--bad-soft:#2d1816;--warn:#f0b86e;--warn-soft:#2a2214;--s1:#363b45;--s2:#5468b8;--s3:#8199f5;--s4:#c4cfff;--grid:#24272d}}
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
.callout{background:var(--accent-soft);border-radius:12px;padding:14px 16px;margin:14px 0}.callout.warn{background:var(--warn-soft)}.callout.good{background:var(--good-soft)}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px 16px}.card h3{margin-top:0}
.chart{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:10px 12px;position:relative}.chart svg{width:100%;height:auto;display:block}
.chart text{fill:var(--muted);font-size:12px;font-family:inherit}.chart .lab{fill:var(--ink);font-size:13px;font-weight:600}.chart .val{fill:var(--ink);font-size:12px}
figure{margin:14px 0 18px}figcaption{font-size:13.5px;color:var(--muted);margin-top:6px}
.tip{position:absolute;pointer-events:none;background:var(--ink);color:var(--bg);font-size:12.5px;padding:6px 9px;border-radius:8px;opacity:0;transition:opacity .1s;max-width:260px;line-height:1.4}
.legend{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:13px;color:var(--ink-soft);margin:6px 0 0 4px}.legend i{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:6px;vertical-align:-1px}
.planner{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px}
.prow{display:flex;flex-wrap:wrap;gap:12px;align-items:end;margin-bottom:12px}.prow label{display:flex;flex-direction:column;gap:3px;font-size:13px;color:var(--ink-soft)}
.prow input,.prow select{font:inherit;font-size:14px;padding:5px 8px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink)}
.kfs{display:grid;grid-template-columns:1fr 1fr;gap:14px}.kfs .card{background:var(--bg)}.kfs h3{font-size:14px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted)}
.big{font-size:20px;font-weight:700}.pill{display:inline-block;font-size:12px;font-weight:600;padding:2px 8px;border-radius:999px;background:var(--good-soft);color:var(--good)}.pill.off{background:var(--tag);color:var(--muted)}
code{font-size:13px;background:var(--tag);padding:1px 5px;border-radius:4px}.sources li{font-size:13.5px}
@media (max-width:760px){.stats{grid-template-columns:1fr 1fr}.grid2,.grid3,.kfs{grid-template-columns:1fr}}
</style></head><body><div class="wrap">
<p class="kicker">Product proposal · Repayment · written for Branch India</p>
<h1>Due on payday</h1>
<p class="lede">On a small digital loan, a missed first instalment is often a timing problem, not a refusal to pay: the due date lands a week before the salary does. Setting the due date for the day after money arrives, collecting it with AutoPay on that day, and offering a pre-agreed half payment when even that fails cuts early delinquency without touching who gets approved.</p>
<div class="byline"><span>Aditya Mathur</span><span>Bengaluru</span><span>November 2026</span><span><a href="https://github.com/adimathur-creates/adimathur-creates.github.io/tree/main/branch-due-on-payday">Code and 16 tests</a></span></div>
<p class="disclaimer">Independent work from public sources. Not affiliated with or reviewed by Branch International. I don't know Branch's current due-date logic, and the simulation uses labelled assumptions rather than Branch data. The point is the method and the experiment, not the exact numbers.</p>

<section class="tldr"><h2>The short version</h2>
<ul>
<li><b>Why this problem.</b> In FY25, Branch India's credit cost (write-offs and provisions) was <b>₹398 Cr</b> against <b>₹770 Cr</b> of net income, and 10.3% of AUM slipped into the 1–90 days past due buckets <a class="src" href="https://connect.acuite.in/fcompany-details/BRANCH_INTERNATIONAL_FINANCIAL_SERVICES_PRIVATE_LIMITED/13th_Aug_25">[source]</a>. Repayment is the biggest lever on the P&amp;L, and every rupee of it comes back through a product flow.</li>
<li><b>The insight.</b> A due date fixed at "disbursal + 30 days" lands at a random point in the borrower's pay month. In a randomised fintech trial in Indonesia, moving the due date to just after salary day raised repayment likelihood by 27% <a class="src" href="https://abfer.org/component/edocman/main-annual-conference/are-borrowers-paid-to-repay-payday-effect-in-fintech-lending">[source]</a>.</li>
<li><b>What I found.</b> In a simulation of 3-instalment loans, payday due dates cut first-instalment misses from <b>${pct(missF)}</b> to <b>${pct(1 - A.firstOnTime)}</b> and collection contacts by <b>${pct(1 - A.contacts / F.contacts)}</b>. But on their own they did <b>not</b> cut loans reaching 30+ days past due. A borrower who misses a date set right after payday has a month until the next one. With AutoPay and a half-payment option, 30+ fell from <b>${pct(F.dpd30, 1)}</b> to <b>${pct(X.dpd30, 1)}</b>.</li>
<li><b>Write-offs barely move</b>, and they shouldn't. Borrowers who would never repay are a credit-policy problem, not a calendar problem. This is honest about which part it can fix.</li>
<li><b>The test.</b> Four arms, randomised by borrower. About ${S.sampleSize(missF, missF * 0.9).toLocaleString("en-IN")} borrowers per arm can detect a 10% drop in first-instalment misses. At Branch's stated volume that fills in days. The real wait is the 30-day repayment cycle.</li>
</ul></section>

<div class="stats">
<div class="stat"><b>${pct(missF)} → ${pct(missX)}</b><span>first instalments missed, today vs the full package (simulated)</span></div>
<div class="stat"><b>${pct(1 - X.contacts / F.contacts)}</b><span>fewer collection contacts per loan</span></div>
<div class="stat"><b>${pct(F.dpd30, 1)} → ${pct(X.dpd30, 1)}</b><span>loans reaching 30+ days past due</span></div>
<div class="stat"><b>±${pct(Math.abs(X.writeOff - F.writeOff), 1)}</b><span>change in write-offs: credit risk stays credit risk</span></div>
</div>

<h2><span class="n">1</span>The problem</h2>
<div class="grid3">
<div class="card"><h3>Borrower</h3><p>Salary lands on the last working day. The app set the due date for the 22nd. By then the money has gone on rent and groceries. They pay late on the 1st, get a late fee, a reminder call, and a mark on their credit report.</p></div>
<div class="card"><h3>Branch</h3><p>Pays collection costs for a borrower who was always going to pay. Also gets a weaker repeat customer: a late first instalment usually means a smaller next limit, or none.</p></div>
<div class="card"><h3>Lenders to Branch</h3><p>Branch's debt covenants include monthly collection efficiency of at least 85% and caps on write-offs <a class="src" href="https://connect.acuite.in/fcompany-details/BRANCH_INTERNATIONAL_FINANCIAL_SERVICES_PRIVATE_LIMITED/13th_Aug_25">[source]</a>. Timing misses drag collection efficiency even when the money eventually comes in.</p></div>
</div>
<div class="callout"><b>The pattern elsewhere.</b> In a study of small-business borrowers in Mexico, 80% of those who missed a scheduled payment paid within 10 days <a class="src" href="https://advanced-hindsight.com/wp-content/uploads/2024/04/CCL-Mastercard-Report-2-KONFIO-240109.pdf">[source]</a>. That's the signature of a timing problem. The market Branch competes in is also under scrutiny: fintechs hold 56.8% of personal loans under ₹50,000, and their delinquency in that segment is 6.4% <a class="src" href="https://visionias.in/current-affairs/upsc-daily-news-summary/article/2026-07-01/the-economic-times/economy/fintechs-capture-57-share-of-small-personal-loans-as-stress-mounts-rbi-report">[source]</a>.</div>

<h2><span class="n">2</span>The feature: try the due-date engine</h2>
<p>Pick a disbursal date and how the borrower is paid. The first instalment can move up to 15 days either side of the standard date, so it can always reach a monthly payday. Interest is charged per day held, so a later date costs a little more and an earlier one a little less. The borrower sees the exact dates and amounts before signing, as the Key Facts Statement requires.</p>
<div class="planner" id="planner">
<div class="prow">
<label>Disbursal date<input type="date" id="pdate" value="2026-11-26"></label>
<label>Income pattern<select id="ptype"><option value="last">Salary, last working day</option><option value="1">Salary, 1st of month</option><option value="7">Salary, 7th</option><option value="15">Salary, 15th</option><option value="w5">Weekly, Friday</option><option value="irr">Irregular</option></select></label>
<label>Loan (₹)<input type="number" id="pamt" value="20000" step="1000" min="1000"></label>
<label>Interest per month, on balance<input type="number" id="prate" value="3" step="0.25" min="0.5"></label>
</div>
<div class="kfs"><div class="card"><h3>Today: 30 days after disbursal</h3><div id="kstd"></div></div><div class="card"><h3>Proposed: day after payday</h3><div id="kali"></div></div></div>
<p class="note" id="pnote" style="margin-top:10px"></p>
</div>

<h2><span class="n">3</span>What it does to repayment (simulated)</h2>
<p>20,000 borrowers per run, ${N} runs, 3 monthly instalments each. Every borrower has an income pattern, a few days of cash after each inflow, and a fixed ${pct(S.ASSUME.wontPay, 1)} chance of never paying under any schedule. All four arms see the same borrowers.</p>
<figure class="chart" id="c1"><div class="tip"></div></figure>
<div class="legend">${S.POLICIES.map((p, i) => `<span><i style="background:var(--s${i + 1})"></i>${esc(NAMES[p])}</span>`).join("")}</div>
<figcaption>Lower is better on all three. Averages over ${N} runs.</figcaption>
<div class="tablewrap"><table>
<tr><th>Arm</th><th class="num">1st instalment on time</th><th class="num">Ever late</th><th class="num">30+ days past due</th><th class="num">Written off</th><th class="num">Collection contacts / loan</th><th class="num">Avg date shift</th></tr>
${S.POLICIES.map((p) => `<tr${p === "split" ? ' class="top"' : ""}><td><b>${esc(NAMES[p])}</b></td><td class="num">${pct(M[p].all.firstOnTime, 1)}</td><td class="num">${pct(M[p].all.dpd1, 1)}</td><td class="num">${pct(M[p].all.dpd30, 1)}</td><td class="num">${pct(M[p].all.writeOff, 1)}</td><td class="num">${M[p].all.contacts.toFixed(2)}</td><td class="num">${M[p].all.shift.toFixed(1)} days</td></tr>`).join("")}
</table></div>
<div class="callout warn"><b>The trap.</b> Moving the date alone takes 30+ from ${pct(F.dpd30, 1)} to ${pct(A.dpd30, 1)}: no better. When the borrower is paid monthly and the due date is the day after payday, a miss means a month's wait for the next salary. So a borrower who would have been 10 days late becomes 30 days late. With thin cash buffers, alignment alone makes 30+ <i>worse</i> (see the sensitivity table). That's why the package ships together: AutoPay removes the "forgot" misses, and the half-payment option gives a borrower who's short a mid-month way back.</div>
<h3>By income type</h3>
<div class="tablewrap"><table><tr><th>Segment</th>${S.POLICIES.map((p) => `<th class="num">${esc(SHORT[p])}</th>`).join("")}</tr>${segRows}</table></div>
<p class="note">Each cell: first instalment on time · 30+ days past due. Salaried borrowers gain most. Irregular earners get nothing from date alignment and need a different product (smaller, more frequent instalments). That's the next test, not this one.</p>
<h3>Does it survive different assumptions?</h3>
<div class="tablewrap"><table><tr><th>Change one assumption</th>${S.POLICIES.map((p) => `<th class="num">${esc(SHORT[p])}</th>`).join("")}</tr>${sens}</table></div>
<p class="note">Same cell format. In every row, payday dates raise first-instalment on-time and the full package has the lowest 30+. The size of the gain changes; the direction doesn't.</p>

<h2><span class="n">4</span>The experiment</h2>
<div class="grid2">
<div class="card"><h3>Design</h3><ul>
<li><b>Arms:</b> today's schedule (control), payday date, + AutoPay, + half-payment option.</li>
<li><b>Unit:</b> borrower, at loan offer. Stratify by income type and by new vs repeat.</li>
<li><b>Primary metric:</b> first instalment paid on time. Readable 30–45 days after disbursal.</li>
<li><b>Secondary:</b> 30+ days past due at 90 days, collection contacts per loan, repeat loan within 60 days of closure.</li>
<li><b>Guardrails:</b> offer-to-disbursal conversion (the payday step and AutoPay set-up add friction), interest income per loan, complaints, mandate cancellations.</li>
</ul></div>
<div class="card"><h3>Sample size per arm</h3>
<table><tr><th>Detect</th><th class="num">Borrowers / arm</th><th class="num">Fill time</th></tr>${ss}</table>
<p class="note">5% significance, 80% power. Fill time assumes 2,500 new loans a day per arm, about 5% of Branch's stated 50,000 loans a day <a class="src" href="https://cbinsights.com/company/branch-international">[source]</a>. Enrolment takes days; the repayment cycle takes a month. Plan on a 6-week primary read and a 4-month 30+ read.</p></div>
</div>
<h3>What would change the decision</h3>
<ul>
<li><b>Ship the package</b> if first-instalment on-time rises by at least 5 points and conversion drops by less than 1 point.</li>
<li><b>Ship payday dates alone for salaried borrowers only</b> if AutoPay set-up costs more conversion than it saves in collections.</li>
<li><b>Stop</b> if 30+ rises in any arm for any segment. That's the trap showing up in real data.</li>
</ul>

<h2><span class="n">5</span>Build notes</h2>
<div class="grid2">
<div class="card"><h3>How we learn the payday</h3><ul>
<li><b>Ask:</b> "When does your salary usually arrive?" One question at offer, pre-filled for repeat borrowers.</li>
<li><b>Verify, with consent:</b> salary credits in a bank statement fetched through the Account Aggregator framework, already used in underwriting.</li>
<li><b>Learn:</b> for repeat borrowers, the days they actually paid on are the best signal.</li>
<li>No reading of SMS, contacts or call logs. RBI's digital lending rules restrict what an app may access <a class="src" href="https://www.rbi.org.in/Scripts/BS_CircularIndexDisplay.aspx?Id=12848">[source]</a>, and borrowers notice.</li></ul></div>
<div class="card"><h3>Rules that keep it fair and compliant</h3><ul>
<li>Exact due dates, amounts and APR in the Key Facts Statement before the borrower signs. No charge that isn't in the KFS.</li>
<li>Interest charged per day held, so no one pays more for the date moving except for the extra days.</li>
<li>AutoPay (UPI AutoPay or e-NACH) is optional and set up with explicit consent. Re-present only on the next inflow day, never daily.</li>
<li>The half-payment option is offered before the due date, not sold after a miss. It must never become a rollover.</li></ul></div>
</div>
<h3>Edge cases</h3>
<ul>
<li>Salary dated on a weekend or holiday arrives early: the engine moves the inflow to the working day before.</li>
<li>Payday changes mid-loan (new job): the borrower can move future dates once per loan, with the interest shown before confirming.</li>
<li>Two instalments landing too close together: the engine never schedules them less than 15 days apart.</li>
<li>Borrower's stated payday doesn't match their bank statement: use the statement, tell the borrower why.</li>
</ul>
<h3>Questions I'd bring to the team</h3>
<ul>
<li>How are due dates set today, and what share of first-instalment misses are paid within 10 days? That one query sizes the opportunity.</li>
<li>What share of borrowers already have AutoPay, and how often does it bounce?</li>
<li>How strongly does an on-time first instalment predict a repeat loan? That's where the retention value sits.</li>
</ul>

<h2><span class="n">6</span>Method and limits</h2>
<ul>
<li>A model, not Branch data. Rates like "pays anyway when short" and "days money lasts" are assumptions in <code>src/simulate.js</code>, chosen so today's arm writes off about the same share of loans Branch reported (net write-offs about 5% of disbursements in FY25).</li>
<li>"Ever late" counts any late instalment over the loan's life. It's not the same as the 10.3% of AUM in the 1–90 day buckets, which is measured at one point in time.</li>
<li>No borrower behaviour response is modelled, such as deliberately stating a late payday to get a longer first period. The 15-day window limits how much this can be gamed.</li>
<li>The trial evidence comes from Indonesia and Mexico, not India. The Indian test is the point of section 4.</li>
</ul>
<h3>Sources</h3>
<ol class="sources">
<li><a href="https://connect.acuite.in/fcompany-details/BRANCH_INTERNATIONAL_FINANCIAL_SERVICES_PRIVATE_LIMITED/13th_Aug_25">Acuité rating rationale, Branch International Financial Services, Aug 2025</a> — FY25 AUM, disbursals, credit cost, slippages, covenants</li>
<li><a href="https://abfer.org/component/edocman/main-annual-conference/are-borrowers-paid-to-repay-payday-effect-in-fintech-lending">Hu, Song and Yu, "Are Borrowers Paid to Repay?" (ABFER 2023)</a> — randomised due-date alignment, +27% repayment likelihood</li>
<li><a href="https://advanced-hindsight.com/wp-content/uploads/2024/04/CCL-Mastercard-Report-2-KONFIO-240109.pdf">Common Cents Lab and Konfio, "Can aligning loan payments with income support small businesses in Mexico?"</a> — 80% of late payers paid within 10 days</li>
<li><a href="https://visionias.in/current-affairs/upsc-daily-news-summary/article/2026-07-01/the-economic-times/economy/fintechs-capture-57-share-of-small-personal-loans-as-stress-mounts-rbi-report">RBI Financial Stability Report coverage, July 2026</a> — fintech share and delinquency in loans under ₹50,000</li>
<li><a href="https://www.rbi.org.in/Scripts/BS_CircularIndexDisplay.aspx?Id=12848">RBI (Digital Lending) Directions, 2025</a> — KFS, cooling-off period, data access rules</li>
<li><a href="https://cbinsights.com/company/branch-international">CB Insights, Branch International profile</a> — company's stated 50,000 loans a day in India</li>
</ol>
<p class="note">Built by Aditya Mathur. <a href="../">More work</a>.</p>
</div>
<script>
${read("dates.js")}
(function(){
  const D = window.DueDates, $ = (s) => document.querySelector(s);
  const inr = (x) => "₹" + Math.round(x).toLocaleString("en-IN");
  const fmt = (s) => new Date(s + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  function pattern(v){ if (v === "irr") return { type: "irregular" }; if (v === "w5") return { type: "weekly", weekday: 5 }; return { type: "monthly", day: v === "last" ? "last" : +v }; }
  function kfs(rows, disb, amt, rate, el){
    const n = rows.length, prin = amt / n; let prev = disb, tot = 0, html = '<table style="margin:0"><tr><th>#</th><th>Due</th><th class="num">Days</th><th class="num">Pay</th></tr>';
    rows.forEach((r, i) => { const due = new Date(r.due + "T00:00:00Z"), days = D.diff(prev, due), bal = amt - prin * i, intr = D.interest(bal, rate, days), pay = prin + intr; tot += pay;
      html += '<tr><td>' + r.k + '</td><td>' + fmt(r.due) + (r.aligned ? ' <span class="pill">day after pay</span>' : '') + '</td><td class="num">' + days + '</td><td class="num">' + inr(pay) + '</td></tr>'; prev = due; });
    html += '</table><p style="margin:8px 0 0"><span class="note">Total repaid</span> <span class="big">' + inr(tot) + '</span></p>'; el.innerHTML = html; return tot;
  }
  function render(){
    const v = $("#pdate").value; if (!v) return; const disb = new Date(v + "T00:00:00Z"), amt = +$("#pamt").value || 20000, rate = (+$("#prate").value || 3) / 100, pat = pattern($("#ptype").value);
    const std = D.schedule(disb, { type: "irregular" }, 3), ali = D.schedule(disb, pat, 3, { window: 15 });
    const t1 = kfs(std, disb, amt, rate, $("#kstd")), t2 = kfs(ali, disb, amt, rate, $("#kali"));
    const moved = ali.filter((r) => r.aligned).length, d = t2 - t1;
    $("#pnote").textContent = moved ? (moved + " of 3 dates moved to the day after payday. Total cost changes by " + (d >= 0 ? "+" : "−") + inr(Math.abs(d)) + ", only for days actually held.") : "No regular inflow to align to, so the standard dates stay. Irregular earners need a different product: smaller, more frequent instalments.";
  }
  ["#pdate", "#ptype", "#pamt", "#prate"].forEach((s) => $(s).addEventListener("input", render)); render();
  // grouped bar chart
  const data = ${JSON.stringify(chartData)}, metrics = [["miss", "1st instalment missed", (v) => Math.round(v * 100) + "%"], ["dpd30", "30+ days past due", (v) => (v * 100).toFixed(1) + "%"], ["contacts", "Collection contacts per loan", (v) => v.toFixed(2)]];
  const W = 900, H = 320, pl = 20, pr = 20, pt = 30, pb = 40, el = document.getElementById("c1"), tip = el.querySelector(".tip");
  const gw = (W - pl - pr) / 3, bw = 40, gap = 6; let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Repayment outcomes by arm">';
  metrics.forEach(([k, label, f], gi) => { const max = Math.max(...data.map((d) => d[k])) * 1.15, gx = pl + gi * gw, x0 = gx + (gw - (bw * 4 + gap * 3)) / 2, base = H - pb;
    s += '<text class="lab" x="' + (gx + gw / 2) + '" y="' + (H - 14) + '" text-anchor="middle">' + label + '</text><line x1="' + (gx + 10) + '" x2="' + (gx + gw - 10) + '" y1="' + base + '" y2="' + base + '" stroke="var(--grid)"/>';
    data.forEach((d, i) => { const h = (base - pt) * d[k] / max, x = x0 + i * (bw + gap);
      s += '<rect class="b" data-t="' + d.name + ': ' + f(d[k]) + ' (' + label.toLowerCase() + ')" x="' + x + '" y="' + (base - h) + '" width="' + bw + '" height="' + Math.max(1, h) + '" rx="4" fill="var(--s' + (i + 1) + ')"/>';
      s += '<text class="val" x="' + (x + bw / 2) + '" y="' + (base - h - 6) + '" text-anchor="middle">' + f(d[k]) + '</text>'; }); });
  s += '</svg>'; el.innerHTML = s; el.appendChild(tip);
  el.querySelectorAll("rect.b").forEach((r) => { r.addEventListener("mousemove", (e) => { tip.textContent = r.dataset.t; const b = el.getBoundingClientRect(); tip.style.left = Math.min(e.clientX - b.left + 12, b.width - 270) + "px"; tip.style.top = (e.clientY - b.top - 30) + "px"; tip.style.opacity = 1; }); r.addEventListener("mouseleave", () => tip.style.opacity = 0); });
})();
</script></body></html>`;
fs.writeFileSync(path.join(__dirname, "..", "index.html"), html);
console.log("ok", html.length, JSON.stringify({ missF, missA: 1 - A.firstOnTime, missX, dpd30: [F.dpd30, A.dpd30, P.dpd30, X.dpd30], contactsCut: 1 - X.contacts / F.contacts, contactsCutA: 1 - A.contacts / F.contacts, wo: [F.writeOff, X.writeOff] }));
