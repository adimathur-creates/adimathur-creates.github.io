// Builds ../index.html. Run: node src/build_page.js
const fs = require("fs"), path = require("path"), S = require("./sim.js");
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const pct = (x, d = 1) => (x * 100).toFixed(d) + "%", n0 = (x) => Math.round(x).toLocaleString("en-IN");
const SEEDS = [7, 11, 19, 23, 29];
function avg(opts, pol) { const rs = SEEDS.map((s) => S.run(Object.assign({ seed: s }, opts))[pol]); const k = (f) => rs.reduce((a, m) => a + f(m), 0) / rs.length;
  return { rate: k((m) => m.rate), day0: k((m) => m.day0), late: k((m) => m.avgLate), fail: k((m) => m.failPer), revoke: k((m) => m.revokeRate), chase: k((m) => m.chasePer100), seg: Object.fromEntries(Object.keys(S.SEGMENTS).map((g) => [g, k((m) => m.bySeg[g].collected / m.bySeg[g].cycles)])) }; }
const ARMS = [
  ["daily", "Retry every morning for 3 days", {}, "daily"],
  ["spread", "Spread retries: day 0, 2, 5, 9", {}, "spread"],
  ["timing", "Inflow-aware timing only", { noReminder: true, noLink: true }, "inflow"],
  ["reminder", "+ reminder the evening before", { noLink: true }, "inflow"],
  ["full", "+ pay link after 2nd failure", {}, "inflow"],
].map(([k, label, o, p]) => ({ k, label, m: avg(o, p) }));
const A = Object.fromEntries(ARMS.map((a) => [a.k, a.m]));
const lift = A.full.rate - A.daily.rate, timingShare = (A.timing.rate - A.daily.rate) / lift;

// illustrative payers (deterministic): balance over a cycle and where each policy's 4 attempts land
function story(kind) {
  const days = 16, due = 0; let bal, inflowDays, amount, spend, monthly;
  if (kind === "salaried") { monthly = 30000; amount = 5400; spend = 0.10; bal = 2100; inflowDays = { 4: monthly }; } // fee due on the 5th, salary on the 9th
  else { monthly = 18000; amount = 2900; spend = 0.28; bal = 900; inflowDays = { 3: monthly / 4.3, 10: monthly / 4.3 }; } // weekly market-day income
  const pre = [], post = []; let b = bal;
  for (let d = 0; d < days; d++) { pre.push(b); b += inflowDays[d] || 0; post.push(b); b = b * (1 - spend); }
  const win = (d, w) => (w === "morning" ? pre[d] : post[d]);
  const plans = { daily: [[0, "morning"], [1, "morning"], [2, "morning"], [3, "morning"]], spread: [[0, "morning"], [2, "morning"], [5, "morning"], [9, "morning"]],
    inflow: kind === "salaried" ? [[0, "morning"], [4, "afternoon"], [5, "afternoon"], [8, "morning"]] : [[0, "morning"], [3, "afternoon"], [4, "afternoon"], [10, "afternoon"]] };
  const res = {}; for (const [p, plan] of Object.entries(plans)) { let paid = null; const marks = []; for (const [d, w] of plan) { if (paid !== null) break; const ok = win(d, w) >= amount; marks.push({ d, w, ok }); if (ok) paid = d; } res[p] = { marks, paid }; }
  return { days, pre, post, amount, inflowDays: Object.keys(inflowDays).map(Number), res, kind };
}
const STORIES = { salaried: story("salaried"), weekly: story("weekly") };

function bars(rows, fmt, title, lo) {
  const W = 470, rh = 30, pl = 210, pr = 60, H = rows.length * rh + 30, mn = lo || 0, mx = Math.max(...rows.map((r) => r.v)) * 1.02;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}"><text class="lab" x="0" y="14">${esc(title)}</text>`;
  rows.forEach((r, i) => { const y = 24 + i * rh, w = Math.max(2, ((W - pl - pr) * (r.v - mn)) / (mx - mn));
    s += `<text x="${pl - 8}" y="${y + 15}" text-anchor="end">${esc(r.label)}</text><rect class="b" data-t="${esc(r.label + ": " + fmt(r.v))}" x="${pl}" y="${y + 3}" width="${w}" height="${rh - 10}" rx="4" fill="${r.hi ? "var(--accent)" : "var(--s2)"}"/><text class="val" x="${pl + w + 6}" y="${y + 16}">${fmt(r.v)}</text>`; });
  return s + "</svg>";
}
const SH = { daily: "Every morning, 3 days", spread: "Spread: 0, 2, 5, 9", timing: "Inflow-aware timing", reminder: "+ reminder", full: "+ pay link" };

const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Four shots: spending a UPI AutoPay cycle's attempts wisely · Aditya Mathur</title>
<meta name="description" content="Under NPCI rules a UPI AutoPay mandate gets one attempt and three retries per cycle, off-peak only. A proposal for Jodo Collect: schedule those four attempts for when payers actually have money. Simulation across salaried, weekly and irregular earners.">
<style>
:root{--bg:#fafaf8;--surface:#fff;--ink:#15151f;--ink-soft:#3b414b;--muted:#5b6170;--line:#e4e3de;--accent:#4b3fd1;--accent-soft:#eeecfc;--tag:#f0efea;--good:#1f6b45;--good-soft:#e5f3eb;--bad:#a5332a;--bad-soft:#fbeae8;--s2:#9aa0ab;--grid:#ebeae6;--money:#b9e4cd}
@media (prefers-color-scheme:dark){:root{--bg:#101215;--surface:#171a1f;--ink:#e9ebee;--ink-soft:#c3c8d0;--muted:#9aa1ad;--line:#2a2e36;--accent:#a49cff;--accent-soft:#1f1c40;--tag:#1f232a;--good:#6fd09c;--good-soft:#142a1e;--bad:#f09186;--bad-soft:#2d1816;--s2:#5d6470;--grid:#24272d;--money:#1d3a2b}}
*{box-sizing:border-box}html,body{margin:0}body{background:var(--bg);color:var(--ink);font:16px/1.62 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,sans-serif}
a{color:var(--accent);text-underline-offset:3px}a.src{font-size:12px;white-space:nowrap}.wrap{max-width:1000px;margin:0 auto;padding:44px 18px 80px}
.kicker{font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:0 0 10px}h1{font-size:clamp(30px,5vw,44px);line-height:1.08;margin:0 0 12px;letter-spacing:-.02em}
.lede{font-size:19px;color:var(--muted);margin:0 0 14px;max-width:840px}.byline{font-size:14px;color:var(--muted);display:flex;flex-wrap:wrap;gap:4px 16px}
.disclaimer{font-size:13px;color:var(--muted);border-left:3px solid var(--line);padding:4px 0 4px 12px;margin:18px 0 0}
h2{font-size:24px;line-height:1.2;margin:56px 0 10px;letter-spacing:-.01em}h2 .n{color:var(--muted);font-weight:500;margin-right:8px}h3{font-size:17px;margin:22px 0 6px}
p{margin:0 0 12px}ul,ol{margin:0 0 14px;padding-left:22px}li{margin:5px 0}
.tldr{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:20px 22px;margin:28px 0 0}.tldr h2{margin:0 0 10px;font-size:15px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:18px 0 6px}.stat{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px}
.stat b{display:block;font-size:26px;line-height:1.1}.stat span{font-size:13.5px;color:var(--muted);display:block;margin-top:4px;line-height:1.35}
table{border-collapse:collapse;width:100%;font-size:14px;margin:10px 0 14px;background:var(--surface);border:1px solid var(--line)}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}th{font-size:12px;letter-spacing:.03em;text-transform:uppercase;color:var(--muted);font-weight:600;background:var(--tag)}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}tr.top td{background:var(--accent-soft)}.tablewrap{overflow-x:auto}.note{font-size:13px;color:var(--muted)}
.callout{background:var(--accent-soft);border-radius:12px;padding:14px 16px;margin:14px 0}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}.card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px 16px}.card h3{margin-top:0}
.chart{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px 14px;position:relative}.chart svg{width:100%;height:auto;display:block}
.chart text{fill:var(--muted);font-size:12px;font-family:inherit}.chart .lab{fill:var(--ink);font-size:13px;font-weight:600}.chart .val{fill:var(--ink);font-size:12px}
.tip{position:absolute;pointer-events:none;background:var(--ink);color:var(--bg);font-size:12.5px;padding:6px 9px;border-radius:8px;opacity:0;transition:opacity .1s;max-width:280px;line-height:1.4;z-index:2}
.tabs{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}.tabs button{font:inherit;font-size:13px;border:1px solid var(--line);background:var(--bg);color:var(--ink-soft);border-radius:999px;padding:5px 12px;cursor:pointer}.tabs button[aria-selected=true]{background:var(--accent);border-color:var(--accent);color:#fff}
.legend{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:13px;color:var(--ink-soft);margin:6px 0 0 4px}.legend i{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:6px;vertical-align:-1px}
.wa{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px;max-width:520px}.wa .msg{background:var(--good-soft);border-radius:10px;padding:10px 12px;font-size:14px;white-space:pre-line}
code{font-size:13px;background:var(--tag);padding:1px 5px;border-radius:4px}.sources li{font-size:13.5px}
@media (max-width:760px){.stats{grid-template-columns:1fr 1fr}.grid2{grid-template-columns:1fr}}
</style></head><body><div class="wrap">
<p class="kicker">Product proposal · Recurring payments · written for Jodo Collect (Founder's Office)</p>
<h1>Four shots</h1>
<p class="lede">Under NPCI rules, a UPI AutoPay mandate gets one attempt and three retries each cycle, all outside peak hours. Spend them on the wrong days and the merchant chases the customer by hand, and the customer gets failure messages until they revoke the mandate. This proposal schedules the four attempts for when payers actually have money.</p>
<div class="byline"><span>Aditya Mathur</span><span>Bengaluru</span><span>November 2026</span><span><a href="https://github.com/adimathur-creates/adimathur-creates.github.io/tree/main/jodo-four-shots">Code and 9 tests</a></span></div>
<p class="disclaimer">Independent work. Not affiliated with or reviewed by Jodo, and no Jodo data. Payers are simulated: income patterns, spending, failure and revocation rates are labelled assumptions in the code. I don't know how Collect schedules retries today; the "daily" and "spread" arms are common patterns, not a description of Collect.</p>

<section class="tldr"><h2>The short version</h2>
<ul>
<li><b>Why it matters to Collect.</b> Jodo launched Collect in September 2025 after concluding its problems were recurring-payment problems: missed EMIs, failed mandates, manual reminders and reconciliation chaos <a class="src" href="https://www.jodo.in/blog/insight/jodo-2025-wrapped/">[source]</a>. Its early users include microfinance, co-operative societies and small businesses running collections on WhatsApp <a class="src" href="https://www.jodo.in/blog/insight/jodo-2025-wrapped/">[source]</a>.</li>
<li><b>The constraint.</b> Each mandate now gets one execution attempt and at most three retries, all in non-peak hours: outside 10 am–1 pm and 5–9:30 pm <a class="src" href="https://www.business-standard.com/finance/news/upi-api-update-daily-caps-npci-paytm-phonepe-july-2025-125061600735_1.html">[source]</a>.</li>
<li><b>The cost of getting it wrong.</b> UPI AutoPay revocations reached about 20 million a month, tied to low customer balances <a class="src" href="https://www.business-standard.com/amp/finance/news/upi-autopay-revocations-hit-20-mn-monthly-over-low-customer-balances-125090700500_1.html">[source]</a>. Every failed attempt is a wasted shot and another failure message to the customer.</li>
<li><b>The result (simulated, 30,000 payers, 3 months, ${SEEDS.length} runs).</b> Retrying every morning for three days collected <b>${pct(A.daily.rate)}</b> of cycles. Scheduling attempts in the window after a payer's money usually lands collected <b>${pct(A.timing.rate)}</b>, with ${pct(1 - A.timing.revoke / A.daily.revoke, 0)} fewer revoked mandates.</li>
<li><b>The finding I didn't expect.</b> Timing did ${pct(timingShare, 0)} of the work. Reminders and pay links added only ${(100 * (A.full.rate - A.timing.rate)).toFixed(1)} points on top. The scheduler is the product; the WhatsApp nudges are polish.</li>
</ul></section>

<div class="stats">
<div class="stat"><b>${pct(A.daily.rate, 0)} → ${pct(A.full.rate, 0)}</b><span>cycles collected: daily retries vs inflow-aware with reminders</span></div>
<div class="stat"><b>${pct(timingShare, 0)}</b><span>of the gain comes from timing alone</span></div>
<div class="stat"><b>${pct(1 - A.full.revoke / A.daily.revoke, 0)}</b><span>fewer mandates revoked over 3 months</span></div>
<div class="stat"><b>${A.daily.chase.toFixed(0)} → ${A.full.chase.toFixed(0)}</b><span>payers a merchant chases by hand, per 100 cycles</span></div>
</div>

<h2><span class="n">1</span>The problem</h2>
<div class="grid2">
<div class="card"><h3>What a Collect merchant lives with</h3><ul>
<li>A coaching centre, a co-operative society or a microfinance lender sets fees or EMIs due on a fixed date, often the 1st, 5th or 10th.</li>
<li>Their customers are paid on a different day, or weekly, or irregularly. A debit on the due date often hits an empty account.</li>
<li>When the retries run out, the merchant is back to calling and messaging people on WhatsApp, the exact work Collect is meant to remove.</li></ul></div>
<div class="card"><h3>Why the rules raise the stakes</h3><ul>
<li>Four attempts per cycle, all off-peak <a class="src" href="https://www.business-standard.com/finance/news/upi-api-update-daily-caps-npci-paytm-phonepe-july-2025-125061600735_1.html">[source]</a>. A retry that lands before payday is a lost shot.</li>
<li>Debits scheduled during peak hours now risk technical declines <a class="src" href="https://republicworld.com/business/upi-autopay-failure-morning-peak-hours-npci-new-rules-2026">[source]</a>.</li>
<li>Mandate executions more than doubled to 808 million in July 2025 <a class="src" href="https://www.business-standard.com/amp/finance/news/upi-autopay-revocations-hit-20-mn-monthly-over-low-customer-balances-125090700500_1.html">[source]</a>. As volume grows, so does the cost of wasted attempts.</li></ul></div>
</div>
<p><b>Problem statement.</b> For each mandate cycle, choose the day and the off-peak window for each of the four attempts so the money is most likely there. Add a reminder and a payer-initiated fallback only where they help. Measure success as cycles collected, days late, failed attempts per cycle and mandates revoked.</p>

<h2><span class="n">2</span>Watch where the four shots land</h2>
<p>Two illustrative payers. Bars are the account balance through the cycle (green on the day income arrives). The line is the amount due. Markers are each policy's attempts: ✓ paid, ✕ failed.</p>
<div class="tabs" id="tabs"></div>
<figure class="chart" id="story"><div class="tip"></div></figure>
<p class="note" id="storyNote"></p>

<h2><span class="n">3</span>What it does across 30,000 payers (simulated)</h2>
<p>Three payer types: salaried (45%), weekly earners like microfinance borrowers and shopkeepers (35%), and irregular income (20%). Paydays slip by up to three days, and weekly income sometimes doesn't come. Policies learn each payer's usual money-in day from three months of history. Every arm sees the same payers and the same money, and every attempt is off-peak.</p>
<div class="grid2">
<figure class="chart">${bars(ARMS.map((a) => ({ label: SH[a.k], v: a.m.rate * 100, hi: a.k === "timing" || a.k === "full" })), (v) => v.toFixed(1) + "%", "Cycles collected within 15 days", 60)}<div class="tip"></div></figure>
<figure class="chart">${bars(ARMS.map((a) => ({ label: SH[a.k], v: a.m.revoke * 100, hi: a.k === "full" })), (v) => v.toFixed(1) + "%", "Mandates revoked over 3 months (lower is better)")}<div class="tip"></div></figure>
</div>
<div class="tablewrap"><table><tr><th>Policy</th><th class="num">Collected</th><th class="num">On the due date</th><th class="num">Avg days late</th><th class="num">Failed attempts / cycle</th><th class="num">Revoked (3 mo)</th><th class="num">Manual chases / 100</th></tr>
${ARMS.map((a) => `<tr${a.k === "timing" ? ' class="top"' : ""}><td><b>${esc(a.label)}</b></td><td class="num">${pct(a.m.rate)}</td><td class="num">${pct(a.m.day0)}</td><td class="num">${a.m.late.toFixed(1)}</td><td class="num">${a.m.fail.toFixed(2)}</td><td class="num">${pct(a.m.revoke)}</td><td class="num">${a.m.chase.toFixed(1)}</td></tr>`).join("")}</table></div>
<h3>By payer type</h3>
<div class="tablewrap"><table><tr><th>Payer type</th>${ARMS.map((a) => `<th class="num">${esc(SH[a.k])}</th>`).join("")}</tr>
${Object.entries(S.SEGMENTS).map(([k, g]) => `<tr><td>${esc(g.label)}</td>${ARMS.map((a) => `<td class="num">${pct(a.m.seg[k], 0)}</td>`).join("")}</tr>`).join("")}</table></div>
<div class="grid2">
<div class="card"><h3>What the numbers say</h3><ul>
<li><b>Retrying every morning is the worst use of four shots.</b> All four land before payday for anyone paid after the due date.</li>
<li><b>Spreading helps salaried payers but hurts weekly earners,</b> whose money comes and goes within days.</li>
<li><b>Inflow-aware timing fixes both,</b> and an afternoon window on money-in day catches income credited that morning.</li></ul></div>
<div class="card"><h3>What it doesn't fix</h3><ul>
<li>Irregular earners stay hardest (${pct(A.full.seg.irregular, 0)} at best). There's no pattern to learn, so the fallback has to be the pay link and the merchant.</li>
<li>If the income day is learned wrong (a job change, a moved salary date), timing misses until history catches up.</li>
<li>Timing can't create money. It only stops wasting attempts.</li></ul></div>
</div>

<h2><span class="n">4</span>What the merchant sees</h2>
<p>Founders' office work is half product, half talking to customers. Here's the daily WhatsApp summary I'd test with ten Collect merchants before building any dashboard.</p>
<div class="wa"><div class="msg">Good morning, Sharma Coaching 👋
Today: ₹1,84,500 collected from 41 students.
Pending: 6 students. 4 are scheduled for 2 pm today, after their usual salary credit. 2 have used 3 of 4 attempts; we've sent them a pay link.
Needs you: Ravi K. paused his AutoPay yesterday. Call him?
Reply DETAILS for the list.</div></div>
<p class="note">Illustrative copy. The point: the merchant only hears about the customers who need a human.</p>

<h2><span class="n">5</span>How I'd take it from here</h2>
<div class="grid2">
<div class="card"><h3>Questions for 10 merchants (week 1)</h3><ol>
<li>When are most of your customers paid: monthly, weekly or daily?</li>
<li>Which day do you set as the due date, and why that day?</li>
<li>What do you do when an AutoPay fails? How long does chasing take each month?</li>
<li>Have customers complained about failure messages, or cancelled AutoPay after one?</li>
<li>Would you let Collect move the debit a few days for a customer, if more got paid?</li></ol></div>
<div class="card"><h3>Metrics and test (weeks 2–6)</h3><ul>
<li><b>Funnel:</b> mandate link sent → approved → first debit paid → still active at month 3.</li>
<li><b>Primary:</b> cycles collected within 15 days.</li>
<li><b>Guardrails:</b> mandates revoked, failed attempts per cycle, days late, merchant complaints.</li>
<li><b>Test:</b> randomise by payer within willing merchants. Start with salaried payers, where history is clearest. Read collection at cycle 1 and revocations at cycle 3.</li></ul></div>
</div>

<h2><span class="n">6</span>Method and limits</h2>
<ul>
<li>Daily balance simulation (<code>src/sim.js</code>). Income lands around noon: morning attempts see the balance before it, afternoon attempts after it. Spending drains a share of the balance each day. Technical declines at 2% per attempt. Each failed attempt adds a 1.5% chance the payer revokes the mandate.</li>
<li>The reminder turns a near-miss (at least half the amount in the account) into a payment 15% of the time. The pay link is paid 50% of the time once money arrives. Both are assumptions, and they matter less than timing in every run.</li>
<li>Not modelled: bank-specific technical declines, pre-debit notification timing rules, mandates above ₹15,000 that need authentication, and merchant-chosen due dates that already match paydays.</li>
<li>Some reports say a mandate is cancelled if all four attempts fail <a class="src" href="https://ibsintelligence.com/?p=569442">[source]</a>. That would make wasted attempts even costlier; I didn't model it.</li>
</ul>
<h3>Sources</h3>
<ol class="sources">
<li><a href="https://www.jodo.in/blog/insight/jodo-2025-wrapped/">Jodo, "Jodo's 2025 Wrapped" (Collect launch, problems, early segments)</a></li>
<li><a href="https://jodo.in/blog/product/jodo-launches-upi-autopay">Jodo, "Jodo launches UPI Autopay" (move from NACH to UPI AutoPay)</a></li>
<li><a href="https://www.business-standard.com/finance/news/upi-api-update-daily-caps-npci-paytm-phonepe-july-2025-125061600735_1.html">Business Standard, NPCI limits on AutoPay retries and peak hours</a></li>
<li><a href="https://www.business-standard.com/amp/finance/news/upi-autopay-revocations-hit-20-mn-monthly-over-low-customer-balances-125090700500_1.html">Business Standard, UPI AutoPay revocations hit 20 mn a month on low balances</a></li>
<li><a href="https://republicworld.com/business/upi-autopay-failure-morning-peak-hours-npci-new-rules-2026">Republic, AutoPay technical declines in peak windows (2026)</a></li>
<li><a href="https://ibsintelligence.com/?p=569442">IBS Intelligence, NPCI AutoPay execution rules</a></li>
</ol>
<p class="note">Built by Aditya Mathur. <a href="../">More work</a>.</p>
</div>
<script>
(function(){
  const ST = ${JSON.stringify(STORIES)}, NAME = { daily: "Every morning, 3 days", spread: "Spread: day 0, 2, 5, 9", inflow: "Inflow-aware" };
  const NOTE = { salaried: "Fee due on the 5th, salary on the 9th. Daily retries spend all four shots before payday, so the merchant chases. Spread happens to land on day 5, after payday. Inflow-aware aims at the afternoon of payday itself.", weekly: "Weekly market-day income on day 3 and day 10, spent fast. Morning attempts keep landing on low balances; inflow-aware hits the afternoon of income day." };
  const tabs = document.getElementById("tabs"), el = document.getElementById("story"), tip = el.querySelector(".tip");
  [["salaried", "Salaried, paid 4 days after the due date"], ["weekly", "Weekly earner"]].forEach(([k, l]) => { const b = document.createElement("button"); b.textContent = l; b.onclick = () => draw(k); tabs.appendChild(b); });
  function draw(k) {
    [...tabs.children].forEach((b, i) => b.setAttribute("aria-selected", ["salaried", "weekly"][i] === k));
    const d = ST[k], W = 960, H = 340, pl = 170, pr = 20, pt = 20, pb = 120, n = d.days, mx = Math.max(...d.post, d.amount) * 1.1, cw = (W - pl - pr) / n;
    const Y = (v) => pt + (H - pt - pb) * (1 - v / mx); let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Balance and attempts">';
    for (let g = 0; g <= 4; g++) { const v = (mx * g) / 4; s += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + Y(v) + '" y2="' + Y(v) + '" stroke="var(--grid)"/><text x="' + (pl - 6) + '" y="' + (Y(v) + 4) + '" text-anchor="end">₹' + Math.round(v).toLocaleString("en-IN") + '</text>'; }
    for (let i = 0; i < n; i++) { const x = pl + i * cw + 3, inf = d.inflowDays.includes(i), v = d.post[i];
      s += '<rect class="b" data-t="Day ' + i + ': ₹' + Math.round(d.pre[i]).toLocaleString("en-IN") + ' before noon, ₹' + Math.round(d.post[i]).toLocaleString("en-IN") + ' after' + (inf ? " (income arrives)" : "") + '" x="' + x + '" y="' + Y(v) + '" width="' + (cw - 6) + '" height="' + (Y(0) - Y(v)) + '" rx="3" fill="' + (inf ? "var(--money)" : "var(--grid)") + '" stroke="var(--line)"/>';
      s += '<text x="' + (x + (cw - 6) / 2) + '" y="' + (Y(0) + 14) + '" text-anchor="middle">' + (i === 0 ? "due" : "+" + i) + '</text>'; }
    s += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + Y(d.amount) + '" y2="' + Y(d.amount) + '" stroke="var(--accent)" stroke-width="2" stroke-dasharray="6 4"/><text x="' + (W - pr) + '" y="' + (Y(d.amount) - 6) + '" text-anchor="end" style="fill:var(--accent)">amount due ₹' + d.amount.toLocaleString("en-IN") + '</text>';
    ["daily", "spread", "inflow"].forEach((p, row) => { const y = Y(0) + 34 + row * 26; s += '<text x="' + (pl - 6) + '" y="' + (y + 4) + '" text-anchor="end" style="fill:var(--ink)">' + NAME[p] + '</text>';
      d.res[p].marks.forEach((m) => { const x = pl + m.d * cw + cw / 2 + (m.w === "afternoon" ? 6 : -6); s += '<text class="b" data-t="' + NAME[p] + ': day ' + m.d + ', ' + m.w + ', ' + (m.ok ? "paid" : "failed") + '" x="' + x + '" y="' + (y + 5) + '" text-anchor="middle" style="font-size:15px;font-weight:700;fill:' + (m.ok ? "var(--good)" : "var(--bad)") + '">' + (m.ok ? "✓" : "✕") + '</text>'; });
      s += '<text x="' + (W - pr) + '" y="' + (y + 4) + '" text-anchor="end">' + (d.res[p].paid === null ? "not collected → merchant chases" : "paid day " + d.res[p].paid) + '</text>'; });
    el.innerHTML = s + "</svg>"; el.appendChild(tip); bind(el); document.getElementById("storyNote").textContent = NOTE[k];
  }
  function bind(root) { const tp = root.querySelector(".tip"); root.querySelectorAll(".b").forEach((r) => { r.addEventListener("mousemove", (ev) => { tp.textContent = r.dataset.t; const b = root.getBoundingClientRect(); tp.style.left = Math.min(ev.clientX - b.left + 12, b.width - 290) + "px"; tp.style.top = (ev.clientY - b.top - 34) + "px"; tp.style.opacity = 1; }); r.addEventListener("mouseleave", () => (tp.style.opacity = 0)); }); }
  draw("salaried"); document.querySelectorAll(".chart").forEach((c) => { if (c.id !== "story") bind(c); });
})();
</script></body></html>`;
fs.writeFileSync(path.join(__dirname, "..", "index.html"), html);
console.log(JSON.stringify({ arms: ARMS.map((a) => [a.k, +(a.m.rate * 100).toFixed(1), +(a.m.revoke * 100).toFixed(2), +a.m.chase.toFixed(1)]), timingShare, stories: Object.fromEntries(Object.entries(STORIES).map(([k, v]) => [k, Object.fromEntries(Object.entries(v.res).map(([p, r]) => [p, r.paid]))])) }));
