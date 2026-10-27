// Within the Rules: a compliance auditor for collections voice calls.
// Deterministic rules only. Every finding names the rule, the turn, the evidence and who has to fix it.
// Rules marked "RBI" follow press reports of the RBI (Commercial Banks – Responsible Business Conduct)
// Amendment Directions, 2026. Rules marked "Lender policy" are my proposals, for the lender to set.

export const RULES = {
  R1: { name: "Calling hours", source: "RBI", text: "Recovery calls only between 8 am and 7 pm." },
  R2: { name: "Bereavement or wedding", source: "RBI", text: "No recovery contact during a bereavement or a wedding in the family." },
  R3: { name: "Open grievance", source: "RBI", text: "No recovery pressure while a related grievance is unresolved." },
  R4: { name: "Excessive calling", source: "RBI + lender cap", text: "No excessive calls. RBI sets no number; this lender caps attempts at 3 a day." },
  R5: { name: "Recording disclosure", source: "RBI", text: "Tell the borrower the call is recorded." },
  R6: { name: "Identity disclosure", source: "Lender policy", text: "Say which lender is calling and that the caller is an automated assistant." },
  R7: { name: "Threats or misleading claims", source: "RBI", text: "No intimidation, shaming or misleading claims (police, jail, home visits, telling others, legal action that isn't real)." },
  R8: { name: "Abusive language", source: "RBI", text: "No abusive or insulting language." },
  R9: { name: "Third-party disclosure", source: "RBI + privacy", text: "If someone other than the borrower answers, don't discuss the debt with them." },
  R10: { name: "Stop request", source: "Lender policy", text: "If the borrower asks to stop calling, stop and hand to a human." },
};

export const OWNERS = {
  "Pre-dial": "Dialler rules: the call should never have been placed",
  "Agent said it": "Agent prompt or guardrail: the agent's own words broke the rule",
  "Missed signal": "Conversation flow: the customer gave a clear signal and the agent carried on",
  "Possibly misheard": "Speech recognition: a low-confidence turn may hide a signal; a person must listen",
};

// ---------- word lists (Hinglish, Hindi, English) ----------
const L = {
  bereavement: ["passed away", "expired", "died", "death", "funeral", "guzar gaye", "guzar gayi", "nahi rahe", "nahi rahi", "dehant", "antim sanskar", "shraddh", "maut", "गुज़र गए", "गुजर गए", "नहीं रहे", "देहांत"],
  wedding: ["shaadi", "wedding", "marriage", "vivah", "शादी"],
  dispute: ["complaint", "shikayat", "already paid", "pay kar diya", "bhar diya", "jama kar diya", "dispute", "not my loan", "mera loan nahi", "galat amount", "शिकायत"],
  thirdParty: ["wrong number", "main unki", "main inki", "unki wife", "unka beta", "unki beti", "his wife", "her husband", "woh ghar pe nahi", "woh bahar", "main unka", "unke papa", "unki mummy", "relative"],
  stop: ["call mat karo", "phone mat karo", "don't call", "stop calling", "band karo call", "mat karna call"],
  recording: ["recorded", "record ho rahi", "record kiya ja raha", "record ki ja rahi", "रिकॉर्ड"],
  automated: ["ai assistant", "automated", "virtual assistant", "digital assistant", "ai sahayak", "आवाज़ सहायक"],
  threat: ["police", "jail", "arrest", "fir darj", "fir karenge", "fir file", "warrant", "ghar aayenge", "ghar aayegi", "ghar aa jayenge", "ghar bhejenge", "office aayenge", "padosi", "neighbour", "society mein", "naam kharab", "izzat", "sabko pata", "bachchon ke school", "cibil zero", "blacklist kar"],
  legalOnly: ["legal action", "case file", "court", "notice bhej", "legal notice"],
  abuse: ["bewakoof", "idiot", "stupid", "chor", "dhokebaaz", "sharam nahi", "besharam", "nalayak"],
  debtDetail: ["emi", "overdue", "baaki", "bakaya", "outstanding", "due amount", "₹", "rupaye", "rupees", "loan amount", "kist"],
  care: ["dukh", "sorry for your loss", "condolence", "afsos", "maaf kijiye", "baad mein call", "call nahi karenge", "abhi call nahi", "reschedule", "shikayat darj", "complaint register", "complaint number", "team aapse sampark", "human agent", "senior se baat", "transfer kar", "baat nahi kar sakte", "borrower se hi", "unhi se baat"],
};
const norm = (s) => " " + s.toLowerCase().replace(/[.,!?;:"“”'’()]/g, " ").replace(/\s+/g, " ") + " ";
// a phrase matches when it starts at a word boundary ("fir" alone also means "then", so only "fir darj" etc. are listed)
function hit(text, list) {
  const t = norm(text);
  return list.find((w) => { const k = w.toLowerCase().trim(); return /^[^a-z\u0900-\u097f]+$/.test(k) ? t.includes(k) : t.includes(" " + k); }) || null;
}

// small edit distance, used only to catch near-misses on low-confidence turns
function lev(a, b) {
  const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}
function nearMiss(text, list) {
  const words = norm(text).trim().split(" ");
  for (const w of list) {
    const k = w.toLowerCase().split(" ").length;
    for (let i = 0; i + k <= words.length; i++) {
      const g = words.slice(i, i + k).join(" ");
      if (g !== w && w.length >= 6 && lev(g, w.toLowerCase()) <= 2) return { heard: g, maybe: w };
    }
  }
  return null;
}

export const LOW_CONF = 0.6;
const toMin = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };

// ---------- pre-dial gate ----------
export function preDial(call, policy = { maxPerDay: 3 }) {
  const out = [];
  const t = toMin(call.startTime);
  if (t < 8 * 60 || t >= 19 * 60) out.push({ rule: "R1", turn: null, who: "Pre-dial", evidence: `Call placed at ${call.startTime}.` });
  if (call.flags?.bereavement) out.push({ rule: "R2", turn: null, who: "Pre-dial", evidence: "Account carries a bereavement flag from an earlier call." });
  if (call.flags?.wedding) out.push({ rule: "R2", turn: null, who: "Pre-dial", evidence: "Account carries a family-wedding flag." });
  if (call.flags?.grievance) out.push({ rule: "R3", turn: null, who: "Pre-dial", evidence: "An unresolved grievance is open on this account." });
  if (call.attemptsToday >= policy.maxPerDay) out.push({ rule: "R4", turn: null, who: "Pre-dial", evidence: `This would be attempt ${call.attemptsToday + 1} today; cap is ${policy.maxPerDay}.` });
  return out;
}

// ---------- transcript audit ----------
export function audit(call, policy) {
  const findings = [...preDial(call, policy)];
  const turns = call.turns;
  const agentIdx = turns.map((t, i) => (t.s === "agent" ? i : -1)).filter((i) => i >= 0);
  const firstAgent = agentIdx.slice(0, 2).map((i) => turns[i].t).join(" ");
  const add = (rule, turn, who, evidence) => { if (!findings.some((f) => f.rule === rule && f.who === who && f.turn === turn)) findings.push({ rule, turn, who, evidence }); };

  // R5, R6: disclosures in the agent's first two turns
  if (!hit(firstAgent, L.recording)) add("R5", agentIdx[0] ?? 0, "Agent said it", "No mention that the call is recorded in the opening.");
  if (!(firstAgent.toLowerCase().includes(call.lender.toLowerCase()) && hit(firstAgent, L.automated))) add("R6", agentIdx[0] ?? 0, "Agent said it", `Opening does not name ${call.lender} and say it is an automated assistant.`);

  // R7, R8: what the agent says
  turns.forEach((t, i) => {
    if (t.s !== "agent") return;
    const th = hit(t.t, L.threat);
    if (th) add("R7", i, "Agent said it", `“${quote(t.t, th)}”`);
    const lg = hit(t.t, L.legalOnly);
    if (lg && call.stage !== "legal") add("R7", i, "Agent said it", `Legal threat on a ${stageLabel(call.stage)} account: “${quote(t.t, lg)}”`);
    const ab = hit(t.t, L.abuse);
    if (ab) add("R8", i, "Agent said it", `“${quote(t.t, ab)}”`);
  });

  // customer signals the agent must act on: R2, R3, R9, R10
  const signals = [
    ["R2", L.bereavement, "bereavement"], ["R2", L.wedding, "wedding"], ["R3", L.dispute, "dispute or prior payment"],
    ["R9", L.thirdParty, "someone other than the borrower"], ["R10", L.stop, "request to stop calling"],
  ];
  turns.forEach((t, i) => {
    if (t.s !== "customer") return;
    for (const [rule, list, what] of signals) {
      const w = hit(t.t, list);
      if (w) {
        const after = turns.slice(i + 1).filter((x) => x.s === "agent");
        const next = after[0]?.t || "";
        const respected = after.length === 0 || (hit(next, L.care) && !hit(next, L.debtDetail));
        if (rule === "R9") {
          const leak = after.find((a) => hit(a.t, L.debtDetail));
          if (leak) add("R9", turns.indexOf(leak), "Missed signal", `Turn ${i + 1}: “${quote(t.t, w)}”. The agent then discussed the debt: “${quote(leak.t, hit(leak.t, L.debtDetail))}”`);
        } else if (!respected) add(rule, i, "Missed signal", `Customer: “${quote(t.t, w)}” (${what}). Agent carried on: “${clip(next)}”`);
        continue;
      }
      // the same signal, possibly lost to speech recognition
      if (t.conf < LOW_CONF) {
        const nm = nearMiss(t.t, list);
        if (nm) add(rule, i, "Possibly misheard", `Heard “${nm.heard}” at ${Math.round(t.conf * 100)}% confidence. It may have been “${nm.maybe}” (${what}). The agent carried on.`);
      }
    }
  });

  findings.sort((a, b) => (a.turn ?? -1) - (b.turn ?? -1));
  const lowConf = turns.map((t, i) => ({ i, c: t.conf })).filter((x) => turns[x.i].s === "customer" && x.c < LOW_CONF);
  const verdict = findings.some((f) => f.who !== "Possibly misheard") ? "VIOLATION" : findings.length ? "LISTEN" : "CLEAN";
  return { id: call.id, verdict, findings, lowConf, rulesHit: [...new Set(findings.filter((f) => f.who !== "Possibly misheard").map((f) => f.rule))].sort() };
}

function stageLabel(s) { return { pre_due: "pre-due", dpd_30: "30 days overdue", dpd_90: "90 days overdue", legal: "legal-stage" }[s] || s; }
function clip(s, n = 90) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }
function quote(text, word) {
  const i = text.toLowerCase().indexOf(word.toLowerCase().trim());
  if (i < 0) return clip(text);
  const a = Math.max(0, i - 35), b = Math.min(text.length, i + word.length + 40);
  return (a > 0 ? "…" : "") + text.slice(a, b).trim() + (b < text.length ? "…" : "");
}

// ---------- pasted transcripts ----------
// One turn per line: "A:" for the agent, "C:" for the customer, optional [0.43] confidence at the end.
export function parseTranscript(text) {
  return text.split(/\n+/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const m = l.match(/^(a|agent|c|customer|b|borrower)\s*:\s*(.*?)\s*(?:\[(0?\.\d+|1(?:\.0+)?)\])?$/i);
    if (!m) return null;
    const s = /^a/i.test(m[1]) ? "agent" : "customer";
    return s === "agent" ? { s, t: m[2] } : { s, t: m[2], conf: m[3] ? parseFloat(m[3]) : 0.9 };
  }).filter(Boolean);
}

// ---------- evaluation against hand labels ----------
export function evaluate(calls, policy) {
  let tp = 0, fp = 0, fn = 0, listenOk = 0, listenTotal = 0;
  const rows = calls.map((c) => {
    const r = audit(c, policy);
    const want = new Set(c.labels || []), got = new Set(r.rulesHit);
    const hitR = [...got].filter((x) => want.has(x)), extra = [...got].filter((x) => !want.has(x)), missed = [...want].filter((x) => !got.has(x));
    tp += hitR.length; fp += extra.length; fn += missed.length;
    if (c.needsListen) { listenTotal++; if (r.verdict === "LISTEN" || r.findings.some((f) => f.who === "Possibly misheard")) listenOk++; }
    return { call: c, result: r, missed, extra };
  });
  return { rows, tp, fp, fn, precision: tp / Math.max(1, tp + fp), recall: tp / Math.max(1, tp + fn), listenOk, listenTotal };
}

// ---------- scale: what sampling finds vs what the auditor finds ----------
export function scaleModel({ callsPerMonth, violationRate, sampleRate, recall, flagRate, minutesPerReview }) {
  const violations = callsPerMonth * violationRate;
  const sampled = callsPerMonth * sampleRate;
  const foundBySampling = violations * sampleRate;
  const flagged = callsPerMonth * flagRate;
  const foundByAuditor = violations * recall;
  return {
    violations, sampled, foundBySampling, flagged, foundByAuditor,
    reviewHoursSampling: (sampled * minutesPerReview) / 60,
    reviewHoursAuditor: (flagged * minutesPerReview) / 60,
  };
}
