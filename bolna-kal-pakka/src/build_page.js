// Builds ../index.html from results/summary.json. Run: node src/report.js && node src/build_page.js
const fs = require("fs"), path = require("path");
const S = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "results", "summary.json"), "utf8"));
const P = require("./playbook.js"), D = require("./dispositions.js");
const CSS = fs.readFileSync(path.join(__dirname, "style.css"), "utf8");
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const pc = (x) => (x == null ? "–" : Math.round(x * 100) + "%");
const T = S.test, A = S["test+real"], nv = T.naive, kit = T.e3, hy = A.hybrid;
const testRows = S.rows.filter((r) => r.split === "test"), failing = testRows.filter((r) => r.fail.length).length, critical = testRows.filter((r) => r.fail.some((f) => f[0] === "C")).length;
const coll = testRows.filter((r) => r.out), MAPN = { ptp_confirmed: "promise_to_pay", refused: "not_interested", already_paid: "already_paid" };
const naiveUsable = coll.filter((r) => MAPN[r.out.outcome] && r.naive.outcome === MAPN[r.out.outcome]).length, kitOutcome = coll.filter((r) => r.e3.outcome === r.out.outcome).length;
const NAME = Object.fromEntries(Object.entries(P).map(([k, v]) => [k, v.name]));
const perCode = Object.entries(hy.perCode).map(([k, v]) => `<tr><td><span class="code">${k}</span> ${esc(NAME[k])}</td><td class="num">${v.tp + v.fn}</td><td class="num">${v.tp}</td><td class="num">${v.fn}</td><td class="num">${v.fp}</td><td>${esc(({ C3: "Missed both made-up claims (a 25% discount, medical advice). Next version: give C3 its own question with the customer's list of allowed offers.", Q2: "Two false alarms: reading out the amount then asking one question got called 'overloaded'. Too noisy to use yet.", Q4: "The extraction missed 'samajh gaya' eight times in a 7-minute call. A plain string check catches it every time.", Q5: "String check catches brackets and placeholders; internal process talk ('aage badhte hain') still needs a person.", Q7: "Three false alarms: it read pushing on after a request, or any line after a closing, as talking after goodbye. Review-later only.", Q8: "0 of 2 from text alone. Bolna's own interruption count (9 in my Samjho call) is the better signal." })[k] || "")}</td></tr>`).join("");
const play = Object.entries(P).map(([k, v]) => `<tr><td><span class="code">${k}</span> <b>${esc(v.name)}</b><br><span class="note">${esc(v.cost)}</span></td><td>${esc(v.fix)}</td><td>${esc(v.setting)}${v.seen ? `<br><span class="note"><b>Where I hit it:</b> ${esc(v.seen)}</span>` : ""}</td></tr>`).join("");
const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kal pakka? Which voice-agent calls to listen to first · Aditya Mathur</title>
<meta name="description" content="A call-QA setup built on Bolna's own extractions: flags money details told to relatives, vague answers booked as promises, made-up offers, threats and Hinglish quality slips. Tested on 24 held-out calls and 3 of my own Bolna calls.">
<style>${CSS}</style></head><body><div class="wrap">
<p class="kicker">Voice AI · Call QA · built on Bolna, for Bolna's solutions team</p>
<h1>Kal pakka?</h1>
<p class="lede">"Kal pakka" means "tomorrow, for sure", and in a collections call it often means nothing. When a borrower says <i>"dekhti hoon, salary aane do, try karungi"</i>, a voice agent that writes down "promise to pay" has just put a person into the wrong follow-up queue. At 200,000+ calls a day, nobody hears that call. This page is how I'd decide which calls a solutions engineer should listen to first, using only what Bolna already has.</p>
<div class="byline"><span>Aditya Mathur</span><span>Bengaluru</span><span>November 2026</span><span><a href="https://github.com/adimathur-creates/adimathur-creates.github.io/tree/main/bolna-kal-pakka">Questions, test calls, results and code</a></span></div>
<p class="disclaimer">Independent work, not affiliated with Bolna. Every number below comes from Bolna's own test-dispositions endpoint, run from my Bolna account on harness agents that never place calls. 36 test calls are written by me (invented brands and people), 12 used while writing the questions and 24 held out and run once. 3 calls are my own real Bolna calls from October. Small sample: read the numbers as direction, not proof.</p>

<section class="tldr"><h2>What I found</h2><ul>
<li><b>The usual setup misses almost everything.</b> One outcome question and a yes/no "did the agent make a mistake?" flagged <b>${nv.anyFailure.tp} of ${failing}</b> held-out calls that had a real failure. It said "no mistake" on a call where the agent threatened a home visit, and on one where it told a stranger about someone's loan.</li>
<li><b>Specific questions do most of the work.</b> The same model, asked about 13 named failures, flagged <b>${kit.anyFailure.tp} of ${failing}</b> failing calls with ${kit.anyFailure.fp} false alarm, and <b>${kit.critical.tp} of ${critical}</b> calls with a money or compliance failure with none.</li>
<li><b>Outcomes become usable.</b> ${kitOutcome} of ${coll.length} collections outcomes right, versus ${naiveUsable} of ${coll.length} that the usual setup could even express (it has no bucket for wrong number, dispute or hardship). Every promised date was resolved correctly, including <i>parso</i> and <i>3 tareekh</i>.</li>
<li><b>Some failures shouldn't go to an LLM at all.</b> On my own 7-minute Samjho call, the extraction missed "samajh gaya" said eight times in a female voice. A two-line string check catches it. The setup I'd ship uses both.</li>
</ul></section>

<div class="stats">
<div class="stat"><b>${nv.anyFailure.tp} → ${kit.anyFailure.tp}</b><span>of ${failing} failing held-out calls flagged (usual setup → this one)</span></div>
<div class="stat"><b>${kit.critical.tp}/${critical}</b><span>calls with a money or compliance failure caught, 0 false alarms</span></div>
<div class="stat"><b>${Math.round((kit.critical.flagged / testRows.length) * 100)}%</b><span>of calls to hear first ("listen now" queue) to reach those ${kit.critical.tp}</span></div>
<div class="stat"><b>${kitOutcome}/${coll.length}</b><span>collections outcomes right; ${kit.dateRight}/${kit.ptpTrue} promise dates resolved</span></div>
</div>

<h2><span class="n">1</span>Why this is the job</h2>
<p>The role asks for someone who listens to real calls, finds where agents fail and fixes them, across collections, D2C, healthcare and logistics, in Hindi and Hinglish. With 1,050+ customers and most of them self-serve, the team cannot listen to more than a sliver. So the real question is <i>which</i> sliver. Bolna already runs extractions on every call and already has an endpoint to test them against a transcript. I used exactly that, and nothing else, so a customer could switch this on today.</p>

<h2><span class="n">2</span>The 13 failures, and what each one costs</h2>
<p>Five are <b>critical</b>: they cost the customer money or break a rule (C1–C5). These go to a "listen now" queue. Eight are <b>quality</b>: they make the agent sound broken (Q1–Q8). These go to a weekly review. The list comes from my own calls and from what goes wrong in collections.</p>
<div class="tablewrap"><table><tr><th>Failure</th><th>Prompt line that fixes it</th><th>Bolna setting, and where I hit it myself</th></tr>${play}</table></div>

<h2><span class="n">3</span>Results on the 24 held-out calls</h2>
<div class="tablewrap"><table><tr><th></th><th class="num">Usual setup</th><th class="num">This setup</th></tr>
<tr><td>Failing calls flagged (${failing} had at least one failure)</td><td class="num">${nv.anyFailure.tp}</td><td class="num">${kit.anyFailure.tp}</td></tr>
<tr><td>False alarms on clean calls (${testRows.length - failing} clean)</td><td class="num">${nv.anyFailure.fp}</td><td class="num">${kit.anyFailure.fp}</td></tr>
<tr><td>Calls with a critical failure caught (${critical})</td><td class="num">n/a</td><td class="num">${kit.critical.tp}</td></tr>
<tr><td>Collections outcome right (${coll.length})</td><td class="num">${naiveUsable}*</td><td class="num">${kitOutcome}</td></tr>
<tr><td>Vague answers recorded as promises</td><td class="num">${nv.ptp.fp}</td><td class="num">${kit.ptp.fp}</td></tr>
<tr><td>Promise date right (${kit.ptpTrue} real promises)</td><td class="num">${nv.dateRight}</td><td class="num">${kit.dateRight}</td></tr>
<tr><td>Every failure code exactly right</td><td class="num">n/a</td><td class="num">${kit.exactCodes} of ${testRows.length} (${T.hybrid.exactCodes} with string checks)</td></tr></table></div>
<p class="note">*The usual setup has only promise_to_pay, already_paid, not_interested and other, so wrong numbers, disputes, hardship and "maybe" all land in the same bucket and get the same follow-up. In the development calls it also marked <i>"try karungi"</i> as a promise.</p>
<h3>Per failure, held-out and my own calls together, with string checks for Q4 to Q6</h3>
<div class="tablewrap"><table><tr><th>Code</th><th class="num">In calls</th><th class="num">Caught</th><th class="num">Missed</th><th class="num">False alarms</th><th>What it means</th></tr>${perCode}</table></div>

<h2><span class="n">4</span>What changed while I wrote the questions</h2>
<ul>
<li><b>Version 1:</b> marked the wife of a borrower as "no firm commitment" instead of wrong person, and called <i>"ek zaroori account update hai"</i> to a brother a disclosure.</li>
<li><b>Version 2:</b> fixed the outcome by saying "wrong person wins over every other option". Added a list of what is <i>not</i> a disclosure. It still flagged the brother call. Telling the model what not to do did not work.</li>
<li><b>Version 3 (final):</b> rewrote the check as two steps (is this the customer? if not, did the agent say a money word from this list?). Brother call clean, wife call still caught. Frozen here before the held-out run.</li>
</ul>

<h2><span class="n">5</span>My own calls</h2>
<p>These are real Bolna calls I made in October to agents I built, with me playing the customer. The extraction flagged all three. It caught the English "Thank you, one moment" inside a Hindi call. It missed the gender slips and the brackets read aloud, which the string checks catch. It also added a "talked after goodbye" alarm where there wasn't one.</p>
<div class="rep" id="rep"><div class="tabs" id="pick" role="tablist"></div><div id="view"></div></div>

<h2><span class="n">6</span>How I'd use this with a new customer, week one</h2>
<ol>
<li><b>Day 1:</b> attach the critical and quality questions to their agent. Add their own outcome options, and their list of allowed offers to C3.</li>
<li><b>Day 1–2:</b> red-team before go-live: wrong number, a relative picks up, "kal pakka", "salary aane do", a waiver request, "insaan se baat karao", a switch to Kannada, a half sentence. Run each transcript through test-dispositions.</li>
<li><b>Day 3–7:</b> every morning, listen to the "listen now" calls first, then a few clean ones to catch what the questions miss. Fix with the prompt line from section 2 and ship the fix as an agent version to part of the traffic.</li>
<li><b>Weekly:</b> share counts by failure with the customer, so they see their agent getting better.</li>
</ol>

<h2><span class="n">7</span>What I'd tell product</h2>
<ul>
<li><b>Pre-call messages need a language.</b> A tool's pre-call message is one fixed string, so my Hindi call said "Thank you, one moment" in English. A per-language version, or speaking it in the active language, would remove a whole class of slips.</li>
<li><b>Language switching should need a real ask.</b> My agent switched to Hindi because I said "chalo theek hai" after the goodbye.</li>
<li><b>Show interruption counts next to extractions.</b> Text can't see talking over someone. The execution already records it (9 interruptions on my Samjho call). As a filter beside extraction results, it would cover the one failure transcripts can't.</li>
<li><b>Batch test-dispositions.</b> I ran it one transcript at a time. A saved set of labelled transcripts with a score after every edit would make extraction changes safe to ship.</li>
</ul>

<h2><span class="n">8</span>What this does not show</h2>
<ul>
<li>Real production calls. 36 calls I wrote and 3 of my own are a small, clean sample; real calls have noise, crosstalk and wrong transcriptions.</li>
<li>One model, one run per call. I did not test other extraction models or run each call more than once.</li>
<li>The string checks were written after I saw the held-out misses. They are plain rules taken from the failure definitions, but treat those rows as indicative.</li>
<li>Audio. Tone, pace and talking over someone need the recording, not the transcript.</li>
</ul>

<h2><span class="n">9</span>The questions, exactly as configured</h2>
<p class="note">Category "Agent QA": two free-text answers validated by regex. Category "Collections outcome": one pre-defined answer, a date and an amount.</p>
<div class="tx">${esc(D.agentQA.map((d) => d.name + "\n" + d.question).join("\n\n"))}</div>

<h2>Sources</h2><ul class="sources">
<li><a href="https://techcrunch.com/2026/01/20/bolna-nabs-6-3-million-from-general-catalyst-for-its-india-focused-voice-orchestration-platform/">TechCrunch: Bolna's seed round and orchestration approach</a></li>
<li><a href="https://yourstory.com/ai-story/voice-ai-startup-bolna-raises-63m-led-by-general-catalyst">YourStory: from 1,500 to 200,000+ daily calls</a></li>
<li><a href="https://www.bolna.ai/docs/api-reference/dispositions/overview">Bolna docs: extractions, dispositions and categories</a></li>
<li><a href="https://www.bolna.ai/docs/api-reference/dispositions/test">Bolna docs: test dispositions against a transcript</a></li>
</ul></div>
<script>
const R = ${JSON.stringify(S.rows.filter((r) => r.split === "real").map((r) => ({ id: r.id, v: r.vertical, fail: r.fail, t: r.t, naive: r.naive, e3: r.e3, hybrid: r.hybrid })))}, NAME = ${JSON.stringify(NAME)};
const codes = (s) => (!s || s === "none" ? [] : s.split(","));
let cur = 0;
function chip(k, truth) { const ok = truth.includes(k); return '<span class="code ' + (ok ? "hit" : "miss") + '" title="' + (NAME[k] || "") + '">' + k + "</span>"; }
function draw() {
  document.getElementById("pick").innerHTML = R.map((r, i) => '<button role="tab" aria-selected="' + (i === cur) + '" data-i="' + i + '">' + r.v + "</button>").join("");
  document.querySelectorAll("#pick button").forEach((b) => (b.onclick = () => { cur = +b.dataset.i; draw(); }));
  const r = R[cur], e = codes(r.e3.crit).concat(codes(r.e3.qual)), h = codes(r.hybrid.crit).concat(codes(r.hybrid.qual));
  const miss = (got) => r.fail.filter((k) => !got.includes(k));
  document.getElementById("view").innerHTML = '<div class="cmp">' +
    '<div class="card"><h4>My labels</h4>' + (r.fail.map((k) => '<span class="code">' + k + "</span> " + NAME[k]).join("<br>") || "none") + "</div>" +
    '<div class="card"><h4>Usual setup</h4>Agent mistake: <b>' + r.naive.mistake + "</b><br>Outcome: " + r.naive.outcome + "</div>" +
    '<div class="card"><h4>This setup (extraction + string checks)</h4>' + (h.map((k) => chip(k, r.fail)).join("") || "none") + (miss(h).length ? '<br><span class="note">Missed: ' + miss(h).join(", ") + "</span>" : "") + '<br><span class="note">Extraction alone: ' + (e.join(", ") || "none") + "</span></div></div>" +
    '<div class="tx">' + r.t.replace(/&/g, "&amp;").replace(/</g, "&lt;") + "</div>";
}
draw();
</script></body></html>`;
fs.writeFileSync(path.join(__dirname, "..", "index.html"), html);
console.log("wrote", html.length);
