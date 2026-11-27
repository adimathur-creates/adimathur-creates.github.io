// Builds ../index.html from ../results.json. Run: node src/experiments.js && node src/build_page.js
const fs = require("fs"), path = require("path");
const D = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "results.json"), "utf8"));
const CSS = fs.readFileSync(path.join(__dirname, "style.css"), "utf8");
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const pct = (x, d = 0) => (x * 100).toFixed(d) + "%", rs = (x) => "₹" + Math.round(x).toLocaleString("en-IN");
const S = D.seeds, lo = (f) => Math.min(...S.map(f)), hi = (f) => Math.max(...S.map(f));
const range = (f, fmt) => { const a = fmt(lo(f)), b = fmt(hi(f)); if (a === b) return a; const u = a.match(/\s\D+$|%$/); return u && b.endsWith(u[0]) ? a.slice(0, -u[0].length) + "–" + b : a + "–" + b; };
const share = (k) => range((x) => x.s[k].share, (v) => pct(v)), med = (k, fmt) => range((x) => x.s[k].median || 0, fmt);
const pts = (v) => Math.round(v * 100) + " pts";

const ISSUES = [
  { k: "annualised", see: "A fund bought three months ago shows a 35% return.", truth: "It is up about 8%. XIRR turns a short gain into a yearly rate, so small moves look huge.", size: med("annualised", pts) + " too high (typical gap between the XIRR shown and the actual gain)",
    fix: "Show absolute return for money invested under a year and XIRR from one year on. This is the convention SEBI sets for fund performance.", effort: "Small", pri: "1" },
  { k: "externalZero", see: "A fund bought through another platform shows 0% return, with “invested” equal to today's value.", truth: "Its cost is unknown, so the return is unknown. In the book its real return was often 25%+.", size: med("externalZero", (v) => pct(v)) + " of the family's value affected (median)",
    fix: "Now: show “cost unknown” instead of 0%, and leave it out of the family return with a coverage note. Next: import the client's detailed CAS (it has transactions; a summary CAS has only balances).", effort: "Small, then medium", pri: "1" },
  { k: "familyAvg", see: "The family return is an average of each member's XIRR, weighted by value.", truth: "A family return should pool every rupee in and out across members. Averages ignore when each member invested.", size: med("familyAvg", pts) + " off (median)",
    fix: "Compute family XIRR on the pooled cash flows of all members.", effort: "Small", pri: "2" },
  { k: "switchDouble", see: "“Total invested” jumps after the client switches funds.", truth: "A switch moves money between funds. No new money came in.", size: med("switchDouble", (v) => pct(v)) + " overstatement of total invested (median)",
    fix: "Link each switch-out to its switch-in (same PAN, same date, same amount) and treat the pair as internal.", effort: "Small", pri: "2" },
  { k: "taxMethod", see: "This year's tax estimate uses average cost and counts holding time from the first SIP.", truth: "Units leave first-in, first-out, and each SIP instalment has its own holding period. Units bought in the last 12 months are short-term.", size: "Usually small: median " + med("taxMethod", rs) + " a family, because most gains sit under the ₹1.25 lakh exemption",
    fix: "Lot-wise FIFO with per-lot holding periods, grandfathering for units bought before 1 Feb 2018, and slab tax for debt units bought from 1 Apr 2023.", effort: "Medium", pri: "3" },
  { k: "syncLag", see: "The portfolio value is slightly low for a day or two.", truth: "The latest purchase has not synced yet.", size: med("syncLag", (v) => pct(v, 1)) + " of value (median)",
    fix: "Reconcile units against the registrar's records and show the value from registrar units. Hold the return until the transaction lands.", effort: "Small", pri: "3" },
];

function bars() {
  const SHORT = { annualised: "Under-a-year gain annualised", externalZero: "Bought elsewhere shows 0%", familyAvg: "Family return averaged, not pooled", switchDouble: "Switch counted as new money", taxMethod: "Tax method shortcuts", syncLag: "Value low while syncing" };
  const rows = ISSUES.map((i) => ({ label: SHORT[i.k], full: D.labels[i.k], v: S[0].s[i.k].share, r: share(i.k) }));
  const W = 760, rh = 34, pl = 250, pr = 70, H = rows.length * rh + 34, mx = 0.7;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Share of families whose shortcut report has each problem"><text class="lab" x="0" y="14">Families whose report shows the problem (seed 7; range across 3 seeds on hover)</text>`;
  [0, 0.2, 0.4, 0.6].forEach((t) => { const x = pl + ((W - pl - pr) * t) / mx; s += `<line x1="${x}" x2="${x}" y1="24" y2="${H - 8}" stroke="var(--grid)"/><text x="${x}" y="${H}" text-anchor="middle">${pct(t)}</text>`; });
  rows.forEach((r, i) => { const y = 26 + i * rh, w = Math.max(3, ((W - pl - pr) * r.v) / mx);
    s += `<text x="${pl - 10}" y="${y + 16}" text-anchor="end">${esc(r.label.length > 52 ? r.label.slice(0, 50) + "…" : r.label)}</text><rect x="0" y="${y}" width="${W}" height="${rh}" fill="transparent" class="b" data-t="${esc(r.full + ": " + pct(r.v, 1) + " of families (" + r.r + " across seeds)")}"/><rect x="${pl}" y="${y + 6}" width="${w}" height="${rh - 14}" rx="4" fill="${i < 2 ? "var(--accent)" : "var(--s2)"}" pointer-events="none"/><text class="val" x="${pl + w + 6}" y="${y + 18}">${pct(r.v)}</text>`; });
  return s + "</svg>";
}
const sensRows = D.sens.map((x) => `<tr><td>${esc({ externalShare: "Share of holdings bought outside Wealthy", recency: "How recent the money is (1 = spread evenly, 3 = mostly recent)", switchLinkLost: "Share of switches arriving unlinked" }[x.k])}</td><td class="num">${x.v}</td><td class="num">${pct(x.anyErr)}</td><td class="num">${pct(x.s.annualised)}</td><td class="num">${pct(x.s.externalZero)}</td><td class="num">${pct(x.s.switchDouble, 1)}</td></tr>`).join("");

const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Numbers you can trust: checking client portfolio reports · Aditya Mathur</title>
<meta name="description" content="A check of how mutual fund client reports go wrong: annualised short-term returns, 0% on holdings bought elsewhere, averaged family returns, double-counted switches and tax estimates. Written for Wealthy's portfolio reporting team. Synthetic data, tested maths.">
<style>${CSS}</style></head><body><div class="wrap">
<p class="kicker">Product proposal · Client portfolio reporting · written for Wealthy (Holdings, Family Holdings, MF Reports)</p>
<h1>Numbers you can trust</h1>
<p class="lede">An MFD opens a client's report in front of the client. If one number looks wrong, the client stops trusting all of them, and the MFD spends the meeting explaining the app instead of giving advice. This is a check of six ways a mutual fund report can be wrong without anything crashing, how often each shows up in a realistic book, and what I would fix first.</p>
<div class="byline"><span>Aditya Mathur</span><span>Bengaluru</span><span>November 2026</span><span><a href="https://github.com/adimathur-creates/adimathur-creates.github.io/tree/main/wealthy-numbers-you-can-trust">Code and 17 tests</a></span></div>
<p class="disclaimer">Independent work. Not affiliated with or reviewed by Wealthy, and no Wealthy data. I have not seen how Wealthy's reports compute returns today; the “shortcut report” is a set of common methods, not a description of Wealthy. The book of ${D.seeds[0].n.toLocaleString("en-IN")} families is simulated and every rate is a labelled assumption in the code. Tax figures are estimates under FY 2026-27 rules, not tax advice.</p>

<section class="tldr"><h2>The short version</h2>
<ul>
<li><b>${range((x) => x.anyErr, (v) => pct(v))} of family reports</b> in the simulated book had at least one number a client could act on wrongly when built with common shortcuts. The rate depends on my assumptions (it ranged ${pct(Math.min(...D.sens.map((x) => x.anyErr)))}–${pct(Math.max(...D.sens.map((x) => x.anyErr)))} across the tests below). How big each error is does not: that part is just maths.</li>
<li><b>Two small display rules clear ${range((x) => x.cheap, (v) => pct(v))} of affected families completely:</b> show absolute return for money held under a year, and say “cost unknown” instead of 0% for holdings bought elsewhere. Neither needs new data.</li>
<li><b>Tax estimates are wrong more often than they are wrong by much.</b> Average-cost shortcuts misclassify short- and long-term gains in ${share("taxMethod")} of families, but the rupee gap is usually small because most gains sit under the ₹1.25 lakh exemption. Worth fixing for ITR season and for CAs, not first.</li>
<li><b>The bigger opportunity is a number reports don't show.</b> ${range((x) => x.harvestShare, (v) => pct(v))} of members had unused ₹1.25 lakh exemption this year and long-term gains they could book against it. Median room: ${range((x) => x.harvestMedian, rs)}, worth up to ${range((x) => x.avoidedMedian, rs)} of future tax each. That is an MFD conversation, and a reason to open the report before 31 March.</li>
</ul></section>

<div class="stats">
<div class="stat"><b>${range((x) => x.anyErr, (v) => pct(v))}</b><span>of family reports with at least one misleading number (shortcut methods)</span></div>
<div class="stat"><b>${med("annualised", pts)}</b><span>typical overstatement when a gain on money held under a year is annualised</span></div>
<div class="stat"><b>${range((x) => x.cheap, (v) => pct(v))}</b><span>of affected families fixed by two display rules that need no new data</span></div>
<div class="stat"><b>${range((x) => x.coverage, (v) => pct(v))}</b><span>of family value the checked report can stand behind today; the rest needs cost data</span></div>
</div>

<h2><span class="n">1</span>What a client report has to get right</h2>
<p>The JD puts it in two words: accuracy and clarity. In practice that means every number on Holdings, Family Holdings and the MF report must survive three questions from a client sitting next to their MFD: <i>is it right, do I understand it, and what should I do about it?</i> The six problems below fail the first two quietly. Nothing errors out; the number is just wrong or reads wrong.</p>
<div class="tablewrap"><table><tr><th>Pri</th><th>What the client sees</th><th>What is actually true</th><th>Families hit</th><th>How big</th><th>Fix</th></tr>
${ISSUES.map((i) => `<tr${i.pri === "1" ? ' class="top"' : ""}><td class="num">${i.pri}</td><td>${esc(i.see)}</td><td>${esc(i.truth)}</td><td class="num">${share(i.k)}</td><td>${esc(i.size)}</td><td>${esc(i.fix)} <span class="pill">${esc(i.effort)}</span></td></tr>`).join("")}
</table></div>
<p class="note">Priority = how many families see it × how badly it misleads × effort. Families hit and sizes are ranges across three random seeds of the same book. A family can have several problems.</p>
<figure class="chart">${bars()}<div class="tip"></div></figure>

<h2><span class="n">2</span>See it on one family</h2>
<p>Pick a family. <b>Shortcut</b> is the report built from data as received with common methods. <b>Checked</b> uses the same data, correct methods and the checks in section 4: it holds back what it can't stand behind and says why. <b>Complete data</b> is what the report would show if every transaction were known. Red cells differ from complete data by more than 1%; grey cells are held back.</p>
<div class="rep" id="rep"><div class="tabs" id="fams" role="tablist"></div><div class="tabs" id="modes" role="tablist"></div><div id="body"></div>
<div class="key"><span><i style="background:var(--bad-soft)"></i>differs from complete data</span><span><i style="background:var(--tag)"></i>held back, with the reason</span></div></div>

<h2><span class="n">3</span>The number reports don't show: unused tax-free gains</h2>
<p>Each person can book ₹1.25 lakh of long-term gains on equity funds a year without tax. A client who doesn't sell in a year leaves it unused, and it does not carry forward. If they sell units with long-term gains and buy back the same fund, they pay nothing now and their cost goes up, so a later sale is taxed less. In the book:</p>
<div class="grid2">
<div class="card"><h3>${range((x) => x.harvestShare, (v) => pct(v))} of members</h3><p>had unused exemption this financial year and long-term equity gains they could book against it. ELSS units still in their 3-year lock-in are excluded.</p></div>
<div class="card"><h3>${range((x) => x.harvestMedian, rs)} median room</h3><p>per member, worth up to ${range((x) => x.avoidedMedian, rs)} of future tax at 12.5%. In a family of three that can triple.</p></div>
</div>
<p><b>Why it belongs in reporting:</b> the report already knows each member's realised gains this year and each lot's age. One line, “₹X of gains can still be booked tax-free before 31 March”, gives the MFD a reason to call and something useful to say. <b>Caveats I'd put on the card:</b> it resets the holding period on the repurchased units; the benefit only arrives if those units are sold later; exit loads and small transaction costs apply; and it is a prompt for the MFD, not advice to the client. The exemption is per person and only for equity-oriented funds, not gold or international funds.</p>

<h2><span class="n">4</span>What I would ship, in order</h2>
<ol>
<li><b>Two display rules (week 1–2).</b> Absolute return under one year, XIRR after. “Cost unknown” instead of 0% for holdings without purchase history, with the family return labelled “covers X% of value”.</li>
<li><b>Correct family maths (week 2–4).</b> Pooled family XIRR. Switch-out and switch-in linked as internal transfers. Total invested counts only money that came from outside.</li>
<li><b>Checks before a number is shown (week 3–6).</b> Units per folio reconciled against registrar records. Each check either passes, labels the number, or holds it with a reason the MFD can read out. A held number is better than a wrong one, but every held line is a cost, so the held-back rate is a tracked metric with a ceiling.</li>
<li><b>Fill the gaps (month 2).</b> Ask for the client's detailed CAS at onboarding, since it carries the transactions needed for cost and XIRR. This is what lifts coverage above ${range((x) => x.coverage, (v) => pct(v))}.</li>
<li><b>Tax P&amp;L and the exemption card (month 2–3).</b> FIFO lots, per-lot holding periods, grandfathering, debt bought after April 2023 at slab. Then the unused-exemption line, timed for January to March.</li>
</ol>
<div class="grid2">
<div class="card"><h3>How I'd know it worked</h3><ul><li>Share of report lines that pass every check (target set after a baseline week)</li><li>Share of family value with known cost</li><li>Support tickets that say a return or total “looks wrong”, per 1,000 reports opened</li><li>Reports shared by MFDs with clients, per active MFD</li></ul></div>
<div class="card"><h3>Guardrails</h3><ul><li>Held-back lines stay under a set share of value; if they rise, fix data before adding checks</li><li>Every held line shows a reason and a next step</li><li>Recompute nightly and diff against yesterday; large unexplained moves block the report for that client</li></ul></div>
</div>

<h2><span class="n">5</span>How sensitive this is to my assumptions</h2>
<p>How common each problem is depends on the book. How large each error is does not. These runs change one assumption at a time (1,000 families, seed 7).</p>
<div class="tablewrap"><table><tr><th>Assumption</th><th class="num">Value</th><th class="num">Any problem</th><th class="num">Annualised</th><th class="num">Cost unknown</th><th class="num">Switch</th></tr>${sensRows}</table></div>
<p class="note">Base case: ${pct(D.assume.externalShare)} of holdings bought outside Wealthy, recency ${D.assume.recency}, ${pct(D.assume.switchLinkLost)} of switches unlinked, ${pct(D.assume.switchShare)} of families with a switch, ${pct(D.assume.syncLagShare)} of holdings with a purchase still syncing, average member holding about ₹5 lakh (near Wealthy's reported ~₹5,000 crore across 1 lakh+ clients). If Wealthy's clients hold mostly older money, the annualised problem shrinks a lot (recency 1 row). If more clients come with outside portfolios, the cost-unknown problem grows.</p>

<h2><span class="n">6</span>What this does not show</h2>
<ul>
<li>How Wealthy's reports actually work today. Some of these may already be solved. The point is the checklist and the priority order, which I'd run against real reports in week one.</li>
<li>Stocks, bonds, PMS, AIFs and insurance. Multi-asset reports add corporate actions, accrued interest and valuation lag. Same idea, more checks.</li>
<li>Dividends (IDCW), stamp duty, exit loads, surcharge and cess, and slab rates for debt gains.</li>
<li>Monthly NAVs. Real XIRR uses daily NAVs and exact dates.</li>
<li>Whether clients would act on the exemption card. That needs a test with a group of MFDs.</li>
</ul>

<h2><span class="n">7</span>Method and tests</h2>
<p>XIRR is solved by bisection and checked against Excel's documented example (37.34%). Tax follows FY 2026-27 rules: equity-oriented funds 20% short-term (held 12 months or less), 12.5% long-term above ₹1.25 lakh a year per person, no indexation; cost for units bought before 1 Feb 2018 is the higher of actual cost and the lower of the 31 Jan 2018 value and sale value; debt funds bought from 1 Apr 2023 at slab rate whatever the holding period. A test reproduces the public worked example: ₹1.8 lakh of long-term gains → ₹6,875 tax. Other tests: FIFO order, grandfathering both ways, SIP units sold within a year counted as short-term, pooled vs averaged family XIRR, switches as internal transfers, ELSS lock-in, held-back holdings never shown as 0%, and determinism by seed. Run <code>node test/calc.test.js</code> and <code>node test/report.test.js</code>.</p>

<h2>Sources</h2>
<ul class="sources">
<li><a href="https://yourstory.com/2026/01/wealthy-india-mutual-fund-platform-ai-financial-advisors-funding">YourStory: Wealthy's two-app setup (Partner App and client app with a consolidated view)</a></li>
<li><a href="https://yourstory.com/2025/11/wealthy-raises-rs-130-cr-bertelsmann-india-alphawave-global-shepherds-hill">YourStory: ₹130 crore round; products across MFs, equities, bonds, PMS, AIFs and insurance</a></li>
<li><a href="https://cdn.dealstreetasia.com/stories/wealthy-in-bertelsmann-india-464343">DealStreetAsia: ~₹5,000 crore of assets; 350+ distributors added a month</a></li>
<li><a href="https://entrackr.com/news/wealthy-raises-rs-130-cr-led-by-bertelsmann-india-investments-10806350">Entrackr: 6,000+ distributors serving 100,000+ clients</a></li>
<li><a href="https://open-exam-prep.com/study-guides/nism-series-v-a/risk-return-and-performance-of-funds/sebi-norms-on-representation-of-returns">NISM V-A study guide: SEBI norms, returns under one year shown absolute, not annualised</a></li>
<li><a href="https://apmiindia.org/storagebox/images/Circulars/APMI-Important%20Communication-15th%20May'23.pdf">APMI (May 2023): absolute returns under a year, XIRR from one year, for PMS reporting</a></li>
<li><a href="https://www.amfiindia.com/online-center/download-cas">AMFI: summary vs detailed CAS</a> · <a href="https://www.axis.bank.in/blogs/mutual-funds/consolidated-account-statements-in-mutual-funds">Axis Bank: summary has balances only, detailed has transactions</a></li>
<li><a href="https://investwell.freshdesk.com/support/solutions/articles/19000111541-upload-cas-of-cams-karvy">Investwell: distributor software importing detailed CAS, including via MF Central OTP</a></li>
<li><a href="https://www.hdfc.bank.in/blogs/mutual-funds/mutual-fund-taxation-in-fy-2026-27">HDFC Bank: mutual fund taxation in FY 2026-27</a> · <a href="https://www.indmoney.com/blogs/mutual-funds/taxation-on-dividends">INDmoney: exemption not available for gold, debt or international funds</a></li>
<li><a href="https://upstox.com/learning-center/mutual-funds/taxation-in-mutual-funds-tax-saving-capital-gains/article-848/">Upstox: worked example, ₹1.8 lakh LTCG → ₹6,875</a>; also debt funds bought from April 2023 at slab rate</li>
<li><a href="https://www.taxmann.com/post/blog/mutual-fund-taxation-in-india">Taxmann: mutual fund taxation under the Income-tax Act, 2025, including grandfathering</a></li>
</ul>
</div>
<script>
const EX = ${JSON.stringify(D.examples)}, LABEL = ${JSON.stringify(D.labels)};
const rs = (x) => "₹" + Math.round(x).toLocaleString("en-IN"), pc = (x) => (x == null ? "–" : (x * 100).toFixed(1) + "%");
const NAME = { annualised: "Recent SIPs", externalZero: "Outside holdings", familyAvg: "Family of members", switchDouble: "A switch", taxMethod: "Sold this year", syncLag: "Syncing", clean: "Clean family" };
let fi = 0, mode = "sc";
function tabs(el, items, cur, on) { el.innerHTML = items.map(([k, t]) => '<button role="tab" aria-selected="' + (k === cur) + '" data-k="' + k + '">' + t + "</button>").join(""); el.querySelectorAll("button").forEach((b) => (b.onclick = () => on(b.dataset.k))); }
const off = (a, b) => a != null && b != null && Math.abs(a - b) > Math.max(1, Math.abs(b) * 0.01);
const offR = (a, b) => a && b && (a.kind !== b.kind || Math.abs((a.v || 0) - (b.v || 0)) > 0.01);
function draw() {
  tabs(document.getElementById("fams"), EX.map((e, i) => [String(i), NAME[e.issue] || e.issue]), String(fi), (k) => { fi = +k; draw(); });
  tabs(document.getElementById("modes"), [["sc", "Shortcut report"], ["gd", "Checked report"], ["truth", "Complete data"]], mode, (k) => { mode = k; draw(); });
  const f = EX[fi], T = (r) => r.truth, M = (r) => r[mode];
  const fam = { sc: { value: f.scValue, inv: f.scMoneyIn, x: f.scFamX, xk: "Value-weighted average of members", tax: f.members.reduce((s, m) => s + m.scTax, 0) },
    gd: { value: f.value, inv: null, x: f.gdX, xk: "Pooled XIRR, covers " + (f.coverage * 100).toFixed(0) + "% of value", tax: f.members.filter((m) => !m.unknownCost).reduce((s, m) => s + m.tax, 0) },
    truth: { value: f.value, inv: f.moneyIn, x: f.truthX, xk: "Pooled XIRR", tax: f.members.reduce((s, m) => s + m.tax, 0) } }[mode], tr = { value: f.value, inv: f.moneyIn, x: f.truthX, tax: f.members.reduce((s, m) => s + m.tax, 0) };
  const covered = f.coverage > 0.999;
  const invShown = mode === "gd" ? (covered ? f.moneyIn : null) : fam.inv;
  const tile = (lab, val, cls, sub) => '<div class="tile ' + cls + '"><small>' + lab + "</small><b>" + val + "</b>" + (sub ? '<small>' + sub + "</small>" : "") + "</div>";
  let h = '<div class="tiles">' + tile("Family value", rs(fam.value), mode !== "truth" && off(fam.value, tr.value) ? "off" : "") +
    tile("Total invested", invShown == null ? "Partly unknown" : rs(invShown), invShown == null ? "held" : mode !== "truth" && off(invShown, tr.inv) ? "off" : "", invShown == null ? "Some holdings have no purchase history" : "") +
    tile("Family return", pc(fam.x), fam.x == null ? "held" : mode !== "truth" && Math.abs((fam.x || 0) - (tr.x || 0)) > 0.01 && !(mode === "gd" && !covered) ? "off" : "", fam.xk) +
    tile("Equity tax this FY (est.)", rs(fam.tax), mode !== "truth" && off(fam.tax, tr.tax) ? "off" : "", mode === "gd" && f.members.some((m) => m.unknownCost) ? "Excludes holdings with unknown cost" : "") + "</div>";
  h += '<div class="tablewrap"><table><tr><th>Member</th><th>Fund</th><th class="num">Value</th><th class="num">Invested (units held)</th><th class="num">Return</th><th>Note</th></tr>';
  for (const r of f.rows) { if (r.truth.value < 1) continue; const m = M(r), t = T(r);
    const ret = m.ret ? pc(m.ret.v) + ' <span class="pill">' + m.ret.kind + "</span>" : "Held";
    const note = mode === "gd" ? (m.flag || "") : mode === "sc" ? (r.external ? "Bought elsewhere" : r.syncLag ? "Last purchase not yet synced" : r.switchIn ? "Came in through a switch" : r.age < 365 ? "Money in for " + Math.max(1, Math.round(r.age / 30)) + (Math.round(r.age / 30) > 1 ? " months" : " month") : "") : (r.age < 365 ? "Under a year: absolute return" : "");
    h += "<tr><td>" + r.member + "</td><td>" + r.fund + "</td><td class=\\"num" + (mode !== "truth" && off(m.value, t.value) ? " off" : "") + "\\">" + rs(m.value) + "</td><td class=\\"num" + (m.cost == null ? " held" : mode !== "truth" && off(m.cost, t.cost) ? " off" : "") + "\\">" + (m.cost == null ? "Unknown" : rs(m.cost)) + "</td><td class=\\"num" + (!m.ret ? " held" : mode !== "truth" && offR(m.ret, t.ret) ? " off" : "") + "\\">" + ret + '</td><td class="flag">' + note + "</td></tr>"; }
  h += "</table></div>";
  const iss = Object.keys(f.err);
  h += '<ul class="issues">' + (mode === "sc" ? (iss.length ? iss.map((k) => "<li>" + LABEL[k] + "</li>").join("") : "<li>No problems found in this family's shortcut report.</li>") : mode === "gd" ? "<li>Numbers shown here match complete data; anything it can't confirm is held with a reason.</li>" : "<li>Every transaction known. This is the reference.</li>") + "</ul>";
  document.getElementById("body").innerHTML = h;
}
draw();
document.querySelectorAll(".chart").forEach((root) => { const tp = root.querySelector(".tip"); root.querySelectorAll(".b").forEach((r) => { r.addEventListener("mousemove", (ev) => { tp.textContent = r.dataset.t; const b = root.getBoundingClientRect(); tp.style.left = Math.min(ev.clientX - b.left + 12, b.width - 290) + "px"; tp.style.top = (ev.clientY - b.top - 34) + "px"; tp.style.opacity = 1; }); r.addEventListener("mouseleave", () => (tp.style.opacity = 0)); }); });
</script></body></html>`;
fs.writeFileSync(path.join(__dirname, "..", "index.html"), html);
console.log("wrote index.html", html.length, "bytes");
