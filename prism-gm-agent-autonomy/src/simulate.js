/* A month of agent actions across many hotels under four autonomy policies.
   All rates are labelled assumptions. */
(function (root, f) { if (typeof module === "object" && module.exports) module.exports = f(require("./policy.js")); else root.Sim = f(root.Policy); })(this, function (P) {
  "use strict";
  function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const ASSUME = {
    hotels: 300, days: 30,
    baseError: 0.04,          // agent is wrong on this share of actions with full evidence and high confidence
    lowEvidenceError: 0.25,   // ...and this share when facts are missing
    lowConfidenceError: 0.18, // ...and this share when it is unsure
    missingEvidence: 0.12,    // share of actions proposed with some facts missing
    lowConfidence: 0.10,      // share proposed with confidence under 80%
    harmMultiple: 1.0,        // a wrong action costs this multiple of the money at stake (guest-facing x2)
    undoCatch: 0.45,          // owner catches a wrong action inside the undo window
    approveCatch: 0.85,       // owner catches a wrong action when asked first
    approveMinutes: 2,        // owner minutes per approval request
    undoMinutes: 0.3,         // owner minutes per undo notification skimmed
    waitHours: 6,             // typical wait for an owner's yes
    delayCostShare: 0.25,     // share of the money at stake lost when an urgent action waits past its window
    hotelSpread: 0.9,         // how much agent accuracy varies by hotel (messy data at some properties)
    digestSample: 0.10        // share of earned-autonomy actions shown in the owner's daily digest
  };
  const POLICIES = ["autonomous", "every_step", "tiers", "earned"];
  const NAMES = { autonomous: "Fully autonomous", every_step: "Owner approves every step", tiers: "Fixed tiers", earned: "Tiers + earned autonomy" };

  function run(opts) {
    const a = Object.assign({}, ASSUME, opts || {}); const r = rng(a.seed || 2026);
    const types = Object.keys(P.ACTIONS);
    // generate one action stream, replayed for every policy
    const stream = [], quality = [];
    for (let h = 0; h < a.hotels; h++) quality.push(Math.exp((r() + r() + r() - 1.5) * a.hotelSpread));
    for (let h = 0; h < a.hotels; h++) for (let d = 0; d < a.days; d++) for (const t of types) {
      const n = Math.floor(P.ACTIONS[t].perDay) + (r() < P.ACTIONS[t].perDay % 1 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const ev = r() < a.missingEvidence ? 0.5 + r() * 0.4 : 1, conf = r() < a.lowConfidence ? 0.5 + r() * 0.29 : 0.8 + r() * 0.2;
        const pWrong = Math.min(0.6, (ev < 1 ? a.lowEvidenceError : conf < 0.8 ? a.lowConfidenceError : a.baseError) * quality[h]);
        const money = Math.round(P.ACTIONS[t].money * (0.5 + r()));
        stream.push({ h, d, type: t, evidence: ev, confidence: conf, money, wrong: r() < pWrong, u1: r(), u2: r() });
      }
    }
    const out = { meta: { actions: stream.length, assume: a } };
    for (const pol of POLICIES) {
      const hist = new Map(); let auto = 0, undo = 0, approve = 0, block = 0, minutes = 0, harm = 0, delay = 0, caught = 0, wrongTotal = 0;
      for (const x of stream) {
        const A = P.ACTIONS[x.type], key = x.h + ":" + x.type; if (!hist.has(key)) hist.set(key, { approved: 0, accepted: 0, reversals: 0 });
        const h = hist.get(key);
        let t;
        if (pol === "autonomous") t = P.NEVER.includes(x.type) ? "AUTO" : "AUTO";
        else if (pol === "every_step") t = "APPROVE";
        else t = P.tier(x, pol === "earned" ? h : null).tier;
        if (t === "BLOCK") t = "APPROVE"; // blocked actions go to the owner as a draft
        const cost = x.money * A.harmShare * a.harmMultiple * (A.guestFacing ? 2 : 1);
        if (x.wrong) wrongTotal++;
        let earned = false;
        if (pol === "earned" && t === "AUTO") earned = P.tier(x, h).earned;
        if (t === "AUTO") { auto++; if (x.wrong) harm += cost;
          if (earned && x.u2 < a.digestSample) { minutes += a.undoMinutes; h.approved++; if (x.wrong && x.u1 < a.undoCatch) h.reversals++; else h.accepted++; } }
        else if (t === "UNDO") { undo++; minutes += a.undoMinutes; h.approved++; if (x.wrong) { if (x.u1 < a.undoCatch) { caught++; h.reversals++; } else { harm += cost; h.accepted++; } } else h.accepted++; }
        else { approve++; minutes += a.approveMinutes; if (a.waitHours > A.urgentHours) delay += x.money * A.harmShare * a.delayCostShare;
          h.approved++; if (x.wrong) { if (x.u1 < a.approveCatch) caught++; else { harm += cost; h.accepted++; } } else h.accepted++; }
      }
      const hm = a.hotels * a.days / 30; // hotel-months
      out[pol] = { auto: auto / stream.length, undo: undo / stream.length, approve: approve / stream.length,
        minutesPerHotelDay: minutes / (a.hotels * a.days), harmPerHotelMonth: harm / hm, delayPerHotelMonth: delay / hm,
        totalPerHotelMonth: (harm + delay) / hm, caughtShare: wrongTotal ? caught / wrongTotal : 0 };
    }
    return out;
  }
  // The same tiers, but with the agent's inputs fixed: fewer actions proposed with missing facts or low confidence.
  const COMPLETE = { missingEvidence: 0.04, lowConfidence: 0.05 };
  function seeds(n, opts) { const res = []; for (let s = 1; s <= n; s++) res.push(run(Object.assign({ hotels: 150 }, opts || {}, { seed: s }))); return res; }
  return { ASSUME, POLICIES, NAMES, COMPLETE, run, seeds };
});
