// Builds ../index.html. Run: node src/build_page.js
const fs = require("fs"), path = require("path"), S = require("./sim.js");
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n0 = (x) => Math.round(x).toLocaleString("en-IN"), pct = (x, d = 1) => (x * 100).toFixed(d) + "%";
const SEEDS = [7, 11, 19, 23, 29];
const avgRun = (opts) => { const rs = SEEDS.map((s) => S.run(Object.assign({ seed: s }, opts))), o = {};
  for (const p of S.POLICIES) { const k = (f) => rs.reduce((a, r) => a + f(r[p]), 0) / rs.length; o[p] = { per1000: k((m) => m.per1000), enq: k((m) => m.enqPerUser), spiral: k((m) => m.spiralRate), churn: k((m) => m.churnRate), pd: k((m) => m.pd), bad: k((m) => m.badPer1000), med: k((m) => m.medianWeeks), counter: k((m) => m.counter / m.users * 1000), alt: k((m) => m.alt / m.users * 1000),
    byReason: Object.fromEntries(Object.keys(S.REASONS).map((rk) => [rk, rs.reduce((a, r) => a + r[p].byReason[rk].approved / r[p].byReason[rk].n, 0) / rs.length])) }; }
  return o; };
const L0 = avgRun({ planLift: 0 }), L5 = avgRun({ planLift: 0.5 }), L1 = avgRun({ planLift: 1 });
const C = 4000, LOSS = 40000, profit = (m) => m.per1000 * (1 - m.pd) * C - m.bad * LOSS;
const incA = L0.not_yet.per1000 - L0.status_quo.per1000, incBad = L0.not_yet.bad - L0.status_quo.bad, incPD = incBad / incA, breakEven = C / (C + LOSS);
const n = S.sampleSize(L0.status_quo.per1000 / 1000, L0.status_quo.per1000 / 1000 + 0.033);
const mult = L0.not_yet.per1000 / L0.status_quo.per1000;

const HI = {
  overdue: ["एक दूसरे लोन या कार्ड की किस्त बकाया है", "बकाया रकम चुका दीजिए। आपकी रिपोर्ट में भुगतान दिखने के 30 दिन बाद हम फिर से जाँच करेंगे।"],
  affordability: ["आपकी आय के हिसाब से माँगी गई रकम ज़्यादा है", "आप आज ही कम रकम के लिए योग्य हो सकते हैं। या कोई छोटा मौजूदा लोन बंद करके फिर से जाँचें।"],
  enquiries: ["हाल में कई जगह लोन के लिए आवेदन हुए हैं", "12 हफ़्ते कहीं भी आवेदन न करें, हर आवेदन से स्कोर गिरता है। हम आपके लिए बिना हार्ड इन्क्वायरी के जाँच करते रहेंगे।"],
  thin: ["अभी सैलरी या क्रेडिट का इतिहास कम है", "एक ही बैंक खाते में तीन और महीने की सैलरी से अक्सर फ़र्क पड़ता है। हम तब फिर से जाँचेंगे।"],
  income: ["आपकी आय की पुष्टि नहीं हो पाई", "अकाउंट एग्रीगेटर से बैंक डेटा शेयर करके आय की पुष्टि करें, दो मिनट लगते हैं।"],
  policy: ["अभी हमारी लोन नीति के दायरे से बाहर (उम्र, जगह या नौकरी का प्रकार)", "अभी हम लोन नहीं दे सकते। इसके बदले हम ये विकल्प दे सकते हैं।"],
  risk: ["कुल क्रेडिट प्रोफ़ाइल; कोई एक बदलाव काफ़ी नहीं", "जल्दी कोई एक बदलाव इसे नहीं बदलेगा। समय पर भुगतान करते रहें; हम 6 महीने में फिर से जाँचेंगे।"],
};
const CHECK = { overdue: "30 days after the overdue clears", affordability: "Today, for a smaller amount", enquiries: "In 12 weeks", thin: "In 13 weeks", income: "As soon as income is verified", policy: "Not applicable", risk: "In 6 months" };
const CTA = { overdue: "Remind me when it shows as paid", affordability: "See the amount I can get today", enquiries: "Check for me in 12 weeks", thin: "Check for me in 13 weeks", income: "Verify income now", policy: "See other options", risk: "Track my credit score" };
const CHECK_HI = { overdue: "बकाया चुकने के 30 दिन बाद", affordability: "आज ही, कम रकम के लिए", enquiries: "12 हफ़्ते बाद", thin: "13 हफ़्ते बाद", income: "आय की पुष्टि होते ही", policy: "लागू नहीं", risk: "6 महीने बाद" };
const CTA_HI = { overdue: "भुगतान दिखने पर याद दिलाएँ", affordability: "आज मिलने वाली रकम देखें", enquiries: "12 हफ़्ते बाद मेरे लिए जाँचें", thin: "13 हफ़्ते बाद मेरे लिए जाँचें", income: "अभी आय की पुष्टि करें", policy: "दूसरे विकल्प देखें", risk: "मेरा क्रेडिट स्कोर ट्रैक करें" };
const SCREENS = Object.fromEntries(Object.entries(S.REASONS).map(([k, r]) => [k, { label: r.label, plan: r.plan, hi: HI[k], check: CHECK[k], cta: CTA[k], checkHi: CHECK_HI[k], ctaHi: CTA_HI[k], kind: r.kind }]));

function bars(rows, fmt, title) {
  const W = 460, rh = 32, pl = 200, pr = 70, H = rows.length * rh + 30, mx = Math.max(...rows.map((r) => r.v)) * 1.08;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}"><text class="lab" x="0" y="14">${esc(title)}</text>`;
  rows.forEach((r, i) => { const y = 24 + i * rh, w = Math.max(2, ((W - pl - pr) * r.v) / mx);
    s += `<text x="${pl - 8}" y="${y + 16}" text-anchor="end">${esc(r.label)}</text><rect class="b" data-t="${esc(r.label + ": " + fmt(r.v))}" x="${pl}" y="${y + 4}" width="${w}" height="${rh - 12}" rx="4" fill="${r.hi ? "var(--accent)" : "var(--s2)"}"/><text class="val" x="${pl + w + 6}" y="${y + 17}">${fmt(r.v)}</text>`; });
  return s + "</svg>";
}
const SHORT = { status_quo: "Reason + reapply in 30 days", plan: "Reason + specific plan", not_yet: "\"Not yet\" path" };
const row = (lab, f, cls) => `<tr${cls ? ` class="${cls}"` : ""}><td><b>${lab}</b></td>${S.POLICIES.map((p) => `<td class="num">${f(p)}</td>`).join("")}</tr>`;

const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Not yet, not no: what happens after a declined loan application · Aditya Mathur</title>
<meta name="description" content="A product proposal for Moneyview: turn a declined loan application into a specific path back, with a plan, a check date, a soft pre-check and a smaller-amount offer. Simulated over 26 weeks with credit-risk guardrails.">
<style>
:root{--bg:#fafaf8;--surface:#fff;--ink:#15151f;--ink-soft:#3b414b;--muted:#5b6170;--line:#e4e3de;--accent:#0f7a52;--accent-soft:#e5f3ec;--tag:#f0efea;--bad:#a5332a;--bad-soft:#fbeae8;--warn:#8a5a10;--warn-soft:#fbf1df;--s2:#9aa0ab;--grid:#ebeae6}
@media (prefers-color-scheme:dark){:root{--bg:#101215;--surface:#171a1f;--ink:#e9ebee;--ink-soft:#c3c8d0;--muted:#9aa1ad;--line:#2a2e36;--accent:#5fd3a2;--accent-soft:#132a20;--tag:#1f232a;--bad:#f09186;--bad-soft:#2d1816;--warn:#f0b86e;--warn-soft:#2a2214;--s2:#5d6470;--grid:#24272d}}
*{box-sizing:border-box}html,body{margin:0}body{background:var(--bg);color:var(--ink);font:16px/1.62 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,"Noto Sans Devanagari",sans-serif}
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
.callout{background:var(--accent-soft);border-radius:12px;padding:14px 16px;margin:14px 0}.callout.warn{background:var(--warn-soft)}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}.card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px 16px}.card h3{margin-top:0}
.chart{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px 14px;position:relative}.chart svg{width:100%;height:auto;display:block}
.chart text{fill:var(--muted);font-size:12px;font-family:inherit}.chart .lab{fill:var(--ink);font-size:13px;font-weight:600}.chart .val{fill:var(--ink);font-size:12px}
.tip{position:absolute;pointer-events:none;background:var(--ink);color:var(--bg);font-size:12.5px;padding:6px 9px;border-radius:8px;opacity:0;transition:opacity .1s;max-width:280px;line-height:1.4;z-index:2}
.tabs{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}.tabs button{font:inherit;font-size:13px;border:1px solid var(--line);background:var(--bg);color:var(--ink-soft);border-radius:999px;padding:5px 12px;cursor:pointer}.tabs button[aria-selected=true]{background:var(--accent);border-color:var(--accent);color:#fff}
.phones{display:grid;grid-template-columns:1fr 1fr;gap:18px}.phone{background:var(--surface);border:1px solid var(--line);border-radius:26px;padding:22px 18px;min-height:360px;box-shadow:0 1px 0 var(--line)}
.phone .tag{font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}.phone h4{font-size:19px;margin:10px 0 8px;line-height:1.25}.phone p{font-size:14.5px}
.phone .box{background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:10px 12px;margin:10px 0;font-size:14px}.phone .btn{display:block;text-align:center;background:var(--accent);color:#fff;border-radius:12px;padding:11px;font-weight:600;margin-top:12px}.phone .btn.ghost{background:transparent;color:var(--accent);border:1px solid var(--accent)}
.phone.old .btn{background:var(--s2)}.lang{font-size:12.5px;margin-left:8px}
code{font-size:13px;background:var(--tag);padding:1px 5px;border-radius:4px}.sources li{font-size:13.5px}
@media (max-width:760px){.stats{grid-template-columns:1fr 1fr}.grid2,.phones{grid-template-columns:1fr}}
</style></head><body><div class="wrap">
<p class="kicker">Product proposal · Consumer lending · written for the Moneyview APM role</p>
<h1>Not yet, not no</h1>
<p class="lede">Many people who apply for a loan on a lending app are declined. What they see next decides whether they come back eligible in three months, or keep re-applying, lower their score and go to a costlier lender. This proposal turns a decline into a specific path back, without lowering credit quality.</p>
<div class="byline"><span>Aditya Mathur</span><span>Bengaluru</span><span>November 2026</span><span><a href="https://github.com/adimathur-creates/adimathur-creates.github.io/tree/main/moneyview-not-yet">Code and 9 tests</a></span></div>
<p class="disclaimer">Independent work. Not affiliated with or reviewed by Moneyview, and no Moneyview data. I haven't seen Moneyview's actual decline screens; I didn't apply for a loan to look, because that would add a hard enquiry to my credit report. The decline reasons, their shares and every behaviour rate are labelled assumptions in the code. The numbers show the shape of the trade-off, not Moneyview's results.</p>

<section class="tldr"><h2>The short version</h2>
<ul>
<li><b>The gap.</b> Moneyview had 140.28 million registered users and 11.9 million monetised users at June 2026, and processed more than 200,000 loan applications a day <a class="src" href="https://groww.in/ipo/moneyview-ipo">[source]</a>. Most registered users have never taken a loan, and every declined applicant joins that group.</li>
<li><b>The rule already exists.</b> RBI's fair practices code requires lenders to tell applicants in writing the main reasons their application was rejected <a class="src" href="https://rbi.org.in/scripts/BS_ViewREwiseDraftDirections.aspx?id=199">[source]</a>. A common pattern across lending apps is a reason plus "you can reapply after 30 days" <a class="src" href="https://support-instamoney.freshdesk.com/support/solutions/articles/47001288549-my-previous-application-was-rejected-can-i-reapply-again-">[source]</a>. That meets the rule but doesn't help anyone come back.</li>
<li><b>The proposal.</b> A "not yet" path: the reason in plain words (in Hindi too), the one change that would help, a date when it's worth checking, a soft pre-check that doesn't touch the credit score, an immediate smaller-amount offer where affordability was the problem, and an honest "we can't" with alternatives when nothing will change.</li>
<li><b>The result (simulated, 60,000 declined users, 26 weeks, ${SEEDS.length} runs).</b> Even assuming a plan changes nobody's behaviour, re-approvals went from <b>${n0(L0.status_quo.per1000)}</b> to <b>${n0(L0.not_yet.per1000)}</b> per 1,000 declined users, hard enquiries per user fell by ${pct(1 - L0.not_yet.enq / L0.status_quo.enq, 0)}, and users caught in a loop of three or more declines fell from ${pct(L0.status_quo.spiral, 0)} to ${pct(L0.not_yet.spiral, 0)}.</li>
<li><b>The cost, stated plainly.</b> Re-approved users default more: ${pct(L0.not_yet.pd, 2)} against ${pct(L0.status_quo.pd, 2)}, mainly from temporary fixes and smaller-amount offers. The extra approvals default at about ${pct(incPD, 1)}, well under a break-even of ${pct(breakEven, 1)} on my assumptions. That's a credit-team decision, and the A/B test below is designed to measure it.</li>
</ul></section>

<div class="stats">
<div class="stat"><b>${mult.toFixed(1)}x</b><span>re-approvals within 26 weeks, even if plans change no behaviour</span></div>
<div class="stat"><b>${pct(1 - L0.not_yet.enq / L0.status_quo.enq, 0)}</b><span>fewer hard credit enquiries per declined user</span></div>
<div class="stat"><b>${pct(L0.status_quo.spiral, 0)} → ${pct(L0.not_yet.spiral, 0)}</b><span>users stuck in three or more declines</span></div>
<div class="stat"><b>${n0(n)}</b><span>declined users per arm to test it; under a day of Moneyview volume</span></div>
</div>

<h2><span class="n">1</span>Why this is worth a PM's time</h2>
<div class="grid2">
<div class="card"><h3>What Moneyview has</h3><ul>
<li>Scale: 140.28 million registered users, 11.9 million monetised, 200,000+ applications a day <a class="src" href="https://groww.in/ipo/moneyview-ipo">[source]</a>.</li>
<li>Growth is coming from repeat borrowers: a rising share of the loan book is second and later loans <a class="src" href="https://groww.in/ipo/moneyview-ipo">[source]</a>. A declined user who comes back eligible is the next repeat borrower.</li>
<li>A free credit tracker already in the app <a class="src" href="https://www.analyticsinsight.net/amp/story/review/moneyview">[source]</a>: the natural home for a soft pre-check and a check date.</li></ul></div>
<div class="card"><h3>Why it can't just approve more</h3><ul>
<li>Credit cost is the constraint. Impairment was 5.16% of average managed AUM in FY2026, and Stage 3 loans at Whizdm Finance were 2.72% in June 2026 <a class="src" href="https://www.mstock.com/articles/moneyview-ipo">[source]</a>.</li>
<li>So this can't be "lower the bar". It has to be "help the right people clear it": those whose reason is fixable or temporary, confirmed on their credit report, not self-declared.</li>
<li>Every blind re-application is a hard enquiry, and too many enquiries is itself a decline reason. The status quo pushes some users into that loop.</li></ul></div>
</div>
<p><b>Problem statement.</b> After a decline, (1) bring back applicants whose reason is fixable or temporary, once they're actually eligible; (2) stop applicants from damaging their own credit by re-applying blindly; (3) don't raise the default rate of re-approved loans past what the credit team accepts.</p>

<h2><span class="n">2</span>Try it: the decline screen</h2>
<p>Pick a reason. Left: a typical decline, the kind many apps show. Right: the "not yet" version. Toggle the language.</p>
<div class="tabs" id="rTabs"></div>
<div class="phones">
<div class="phone old"><span class="tag">Typical today</span><h4>Your loan application could not be approved</h4><p id="oldReason"></p><div class="box">You can reapply after 30 days.</div><span class="btn">Okay</span></div>
<div class="phone"><span class="tag">Not yet</span><button class="lang" id="lang">हिन्दी</button><h4 id="nyHead"></h4><div class="box"><b id="nyWhyL">Why</b><br><span id="nyWhy"></span></div><div class="box"><b id="nyFixL">What would change it</b><br><span id="nyFix"></span></div><div class="box"><b id="nyWhenL">Worth checking</b><br><span id="nyWhen"></span></div><span class="btn" id="nyCta"></span><span class="btn ghost" id="nyGhost">Check without affecting my score</span></div>
</div>
<p class="note">The soft pre-check uses the same credit model on a soft bureau pull, so checking never lowers the score. A real re-application happens only when the pre-check says it's likely to pass.</p>

<h2><span class="n">3</span>What it does over 26 weeks (simulated)</h2>
<p>60,000 declined applicants, ${SEEDS.length} runs, three arms that see the same people and the same luck. The biggest unknown is how much a clear plan changes behaviour, so results are shown with no effect, half effect and full effect.</p>
<div class="grid2">
<figure class="chart">${bars(S.POLICIES.map((p) => ({ label: SHORT[p], v: L0.not_yet && L0[p].per1000, hi: p === "not_yet" })), (v) => n0(v), "Re-approved per 1,000 declined (no behaviour effect)")}<div class="tip"></div></figure>
<figure class="chart">${bars(S.POLICIES.map((p) => ({ label: SHORT[p], v: L0[p].spiral * 100, hi: p === "not_yet" })), (v) => v.toFixed(0) + "%", "Stuck in 3+ declines (lower is better)")}<div class="tip"></div></figure>
</div>
<div class="tablewrap"><table><tr><th>Per 1,000 declined users, 26 weeks</th>${S.POLICIES.map((p) => `<th class="num">${esc(SHORT[p])}</th>`).join("")}</tr>
${row("Re-approved (plan has no behaviour effect)", (p) => n0(L0[p].per1000), "top")}
${row("Re-approved (half effect)", (p) => n0(L5[p].per1000))}
${row("Re-approved (full effect)", (p) => n0(L1[p].per1000))}
${row("of which: smaller amount taken at decline", (p) => n0(L0[p].counter))}
${row("Hard credit enquiries per user", (p) => L0[p].enq.toFixed(2))}
${row("Stuck in 3+ declines", (p) => pct(L0[p].spiral, 0))}
${row("Gone to another lender after a spiral", (p) => pct(L0[p].churn, 0))}
${row("Median weeks to approval", (p) => L0[p].med.toFixed(0))}
${row("12-month default rate of re-approvals", (p) => pct(L0[p].pd, 2))}
${row("Expected defaults", (p) => L0[p].bad.toFixed(1))}
${row("Took an alternative product (policy declines)", (p) => n0(L0[p].alt))}
</table></div>
<h3>By decline reason (no behaviour effect)</h3>
<div class="tablewrap"><table><tr><th>Reason</th><th class="num">Share of declines</th><th class="num">Re-approved: today</th><th class="num">Re-approved: not yet</th><th>How it gets fixed</th></tr>
${Object.entries(S.REASONS).map(([k, r]) => `<tr><td>${esc(r.label)}</td><td class="num">${pct(r.share, 0)}</td><td class="num">${pct(L0.status_quo.byReason[k], 0)}</td><td class="num">${pct(L0.not_yet.byReason[k], 0)}</td><td class="note">${{ action: "An action the user can take", amount: "A smaller amount, or lower existing EMIs", quiet: "Time without new applications", time: "Time (salary history builds)", none: "Not fixable soon; say so honestly" }[r.kind]}</td></tr>`).join("")}</table></div>
<div class="grid2">
<div class="card"><h3>Where the gain comes from</h3><ul>
<li><b>Timing.</b> People apply when the pre-check says yes, not on hope. Fewer wasted enquiries, fewer spirals.</li>
<li><b>Quiet periods.</b> For "too many enquiries", the fix is to stop applying. Blind re-application resets the clock every time.</li>
<li><b>The smaller amount.</b> ${n0(L0.not_yet.counter)} per 1,000 take a smaller loan on the spot instead of leaving.</li></ul></div>
<div class="card"><h3>Where it costs</h3><ul>
<li>Some guided fixes are temporary: a card balance paid down, then run up again. I assumed 20%, at twice the default rate.</li>
<li>Smaller-amount loans to stretched borrowers default more (assumed 1.25x).</li>
<li>The fix: re-approve only on a fix confirmed on the bureau report, and cap the smaller amount by EMI-to-income.</li></ul></div>
</div>
<h3>Is the extra risk worth it?</h3>
<p>Assume each repaid loan earns about ₹${n0(C)} over its life and each default loses about ₹${n0(LOSS)} (my assumptions; the credit team has the real numbers). Then extra approvals pay off as long as they default below C ÷ (C + L) = <b>${pct(breakEven, 1)}</b>.</p>
<div class="tablewrap"><table><tr><th>Per 1,000 declined users</th>${S.POLICIES.map((p) => `<th class="num">${esc(SHORT[p])}</th>`).join("")}</tr>
${row("Approvals", (p) => n0(L0[p].per1000))}
${row("Expected defaults", (p) => L0[p].bad.toFixed(1))}
${row("Net contribution (₹, no behaviour effect)", (p) => "₹" + n0(profit(L0[p])), "top")}
</table></div>
<p class="note">The extra approvals from the "not yet" path default at about ${pct(incPD, 1)} in the simulation, against a ${pct(breakEven, 1)} break-even. If real defaults come in above break-even, the guardrail in the test below switches it off.</p>

<h2><span class="n">4</span>What I'd ship first, and how I'd test it</h2>
<div class="grid2">
<div class="card"><h3>v1 scope (one sprint of design, two of build)</h3><ol>
<li>Map each lender decline code to one user-facing reason, one action and one check date. Write it in English and Hindi first.</li>
<li>Smaller-amount offer at decline for affordability declines, within the same EMI-to-income limit.</li>
<li>A check date in the credit tracker, with a soft pre-check and a reminder.</li>
<li>For policy declines: say it plainly, and show alternatives that fit (for example a secured card), not another loan.</li></ol></div>
<div class="card"><h3>Guardrails</h3><ul>
<li>Re-approval only on a fix confirmed on the bureau report, never on the user's word.</li>
<li>No promises: "worth checking", never "you'll be approved".</li>
<li>Reason text reviewed with the lending partner, since the lender owns the decline.</li>
<li>No more than one reminder a week, and an opt-out.</li></ul></div>
</div>
<h3>A/B test</h3>
<div class="tablewrap"><table><tr><th>Item</th><th>Plan</th></tr>
<tr><td>Unit</td><td>Declined applicant, randomised at the moment of decline, 50/50</td></tr>
<tr><td>Primary metric</td><td>Approved loans within 180 days per 1,000 declines</td></tr>
<tr><td>Sample</td><td>${n0(n)} per arm to detect a 3.3-point lift (from ${pct(L0.status_quo.per1000 / 1000, 1)}) at 95% confidence and 80% power; fills in under a day</td></tr>
<tr><td>Guardrails</td><td>12-month default rate of re-approved loans (early read: 30+ days past due at 3 months); hard enquiries per user; complaints mentioning rejection</td></tr>
<tr><td>Stop rule</td><td>Pause if early delinquency of re-approvals is more than 1.3x the approved base</td></tr>
<tr><td>Read</td><td>Approval lift at 90 and 180 days; delinquency at 3, 6 and 12 months</td></tr></table></div>
<h3>Questions I'd bring to the team</h3>
<ul>
<li>What share of declines do partner lenders return with a usable reason code, and how granular is it?</li>
<li>How many declined users re-apply within 30 days today, and how often are they declined again?</li>
<li>Does the credit tracker already use soft pulls that could power a pre-check?</li>
</ul>

<h2><span class="n">5</span>Method and limits</h2>
<ul>
<li>Weekly agent simulation (<code>src/sim.js</code>) of 60,000 declined users over 26 weeks. Each user has one decline reason with its own way of getting fixed. Status quo users re-apply on hope (6% a week after the 30-day block); guided users apply mostly once they're eligible.</li>
<li>The reason mix, fix rates and default multiples are assumptions, not data. The single biggest unknown, how much a plan changes behaviour, is shown at zero, half and full effect.</li>
<li>Not modelled: users who were declined by one partner lender but would be approved by another; the soft pre-check's own error rate; the cost of reminders; fraud.</li>
<li>The decline screens are my mock-ups. The Hindi copy should be reviewed by a native writer and by the lending partner before use.</li>
</ul>
<h3>Sources</h3>
<ol class="sources">
<li><a href="https://groww.in/ipo/moneyview-ipo">Groww, Moneyview IPO details (users, monetised users, applications per day, repeat loans)</a></li>
<li><a href="https://www.mstock.com/articles/moneyview-ipo">m.Stock, Moneyview IPO note (impairment, Stage 3, partners)</a></li>
<li><a href="https://www.analyticsinsight.net/amp/story/review/moneyview">Analytics Insight, Moneyview app features (credit tracker)</a></li>
<li><a href="https://rbi.org.in/scripts/BS_ViewREwiseDraftDirections.aspx?id=199">RBI, Responsible Business Conduct Directions, fair practices code (reasons for rejection in writing)</a></li>
<li><a href="https://support-instamoney.freshdesk.com/support/solutions/articles/47001288549-my-previous-application-was-rejected-can-i-reapply-again-">InstaMoney help centre, reapplying 30 days after a rejection (example of common practice)</a></li>
</ol>
<p class="note">Built by Aditya Mathur. <a href="../">More work</a>.</p>
</div>
<script>
(function(){
  const SC = ${JSON.stringify(SCREENS)}; let lang = "en", cur = "overdue";
  const L = { en: { head: "Not yet. Here's what would change it.", why: "Why", fix: "What would change it", when: "Worth checking", ghost: "Check without affecting my score", btn: "हिन्दी" },
              hi: { head: "अभी नहीं। ये बदलें तो बात बन सकती है।", why: "क्यों", fix: "क्या बदलने से फ़र्क पड़ेगा", when: "कब जाँचना ठीक रहेगा", ghost: "स्कोर पर असर डाले बिना जाँचें", btn: "English" } };
  const HEADNONE = { en: "We can't lend right now. Here's what we can do.", hi: "अभी हम लोन नहीं दे सकते। हम ये कर सकते हैं।" };
  const tabs = document.getElementById("rTabs"), $ = (id) => document.getElementById(id);
  Object.keys(SC).forEach((k) => { const b = document.createElement("button"); b.textContent = SC[k].label.split("(")[0].trim(); b.onclick = () => { cur = k; draw(); }; tabs.appendChild(b); });
  $("lang").onclick = () => { lang = lang === "en" ? "hi" : "en"; draw(); };
  function draw() {
    const s = SC[cur], t = L[lang]; [...tabs.children].forEach((b, i) => b.setAttribute("aria-selected", Object.keys(SC)[i] === cur));
    $("oldReason").textContent = "Reason: " + s.label.split("(")[0].trim().toLowerCase() + ".";
    $("nyHead").textContent = s.kind === "none" && cur === "policy" ? HEADNONE[lang] : t.head;
    $("nyWhyL").textContent = t.why; $("nyFixL").textContent = t.fix; $("nyWhenL").textContent = t.when; $("lang").textContent = t.btn;
    $("nyWhy").textContent = lang === "hi" ? s.hi[0] : s.label; $("nyFix").textContent = lang === "hi" ? s.hi[1] : s.plan; $("nyWhen").textContent = lang === "hi" ? s.checkHi : s.check;
    $("nyCta").textContent = lang === "hi" ? s.ctaHi : s.cta; $("nyGhost").textContent = t.ghost; $("nyGhost").style.display = s.kind === "none" && cur === "policy" ? "none" : "block";
  }
  draw();
  document.querySelectorAll(".chart").forEach((el) => { const tip = el.querySelector(".tip"); el.querySelectorAll(".b").forEach((r) => { r.addEventListener("mousemove", (ev) => { tip.textContent = r.dataset.t; const b = el.getBoundingClientRect(); tip.style.left = Math.min(ev.clientX - b.left + 12, b.width - 290) + "px"; tip.style.top = (ev.clientY - b.top - 34) + "px"; tip.style.opacity = 1; }); r.addEventListener("mouseleave", () => (tip.style.opacity = 0)); }); });
})();
</script></body></html>`;
fs.writeFileSync(path.join(__dirname, "..", "index.html"), html);
console.log(JSON.stringify({ L0: Object.fromEntries(S.POLICIES.map((p) => [p, { a: Math.round(L0[p].per1000), enq: +L0[p].enq.toFixed(2), spiral: +(L0[p].spiral * 100).toFixed(1), pd: +(L0[p].pd * 100).toFixed(2), bad: +L0[p].bad.toFixed(1), profit: Math.round(profit(L0[p])) }])), L1: S.POLICIES.map((p) => Math.round(L1[p].per1000)), incPD, breakEven, n, mult }));
