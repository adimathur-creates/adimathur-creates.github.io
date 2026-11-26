/* Autonomy policy for a hotel operations agent.
   Every action the agent proposes gets one of four tiers, with the reasons:
   AUTO       - do it now, log it
   UNDO       - do it now, owner can reverse within a window
   APPROVE    - wait for the owner's yes
   BLOCK      - the agent may never do this on its own
   Deterministic: same action, same history -> same tier. */
(function (root, f) { if (typeof module === "object" && module.exports) module.exports = f(); else root.Policy = f(); })(this, function () {
  "use strict";
  // Action catalogue. money = typical $ at stake; undoHours = how long it stays reversible;
  // urgentHours = how fast it must happen before waiting costs money; harmShare = share of the money lost if the agent gets it wrong.
  const ACTIONS = {
    rate_change:     { label: "Change tonight's room rate",   money: 60, harmShare: 0.5,  undoHours: 4,   urgentHours: 2,   guestFacing: false, perDay: 10 },
    review_reply:    { label: "Reply to a guest review",      money: 30, harmShare: 1,    undoHours: 24,  urgentHours: 48,  guestFacing: true,  perDay: 3 },
    housekeeping:    { label: "Re-plan housekeeping roster",  money: 60, harmShare: 0.5,   undoHours: 6,   urgentHours: 3,   guestFacing: false, perDay: 2 },
    recon_adjust:    { label: "Post a reconciliation fix",    money: 400, harmShare: 0.2,  undoHours: 72,  urgentHours: 72,  guestFacing: false, perDay: 4 },
    guest_refund:    { label: "Refund a guest",               money: 90, harmShare: 1,   undoHours: 0,   urgentHours: 24,  guestFacing: true,  perDay: 1.5 },
    overbook_walk:   { label: "Move a guest to another hotel", money: 250, harmShare: 1, undoHours: 0,   urgentHours: 4,   guestFacing: true,  perDay: 0.15 },
    vendor_renewal:  { label: "Renew a vendor contract",      money: 6000, harmShare: 0.5, undoHours: 0,   urgentHours: 240, guestFacing: false, perDay: 0.05 },
    vendor_payment:  { label: "Pay a vendor invoice",         money: 900, harmShare: 0.5,  undoHours: 0,   urgentHours: 120, guestFacing: false, perDay: 0.8 }
  };
  const NEVER = ["vendor_renewal"]; // commits the owner to future spend: always a human decision

  const RULES = {
    autoMaxMoney: 200,        // above this, never fully automatic
    approveMinMoney: 1000,    // at or above this, always needs a yes
    minConfidence: 0.80,      // agent's own confidence below this -> ask
    graduateAfter: 20,        // approvals in a row before a (hotel, action) can move down a tier
    graduateAccept: 0.95,     // and the owner must have accepted this share of them
    demoteOnReversal: true
  };

  /* action: { type, money, confidence (0-1), evidence (0-1 share of required facts present) }
     history: { approved, accepted, reversals } for this hotel and action type */
  function tier(action, history, rules) {
    const r = Object.assign({}, RULES, rules || {}), A = ACTIONS[action.type];
    const money = action.money != null ? action.money : A.money;
    const reasons = []; let t;
    if (NEVER.includes(action.type)) { return { tier: "BLOCK", reasons: ["Commits the owner to future spend. The agent drafts it; a person signs it."], money }; }
    if (action.evidence < 1) reasons.push("Missing " + Math.round((1 - action.evidence) * 100) + "% of the facts this action needs");
    if (action.confidence < r.minConfidence) reasons.push("Agent confidence " + Math.round(action.confidence * 100) + "% is below " + Math.round(r.minConfidence * 100) + "%");
    if (money >= r.approveMinMoney) reasons.push("$" + money + " at stake (approval needed from $" + r.approveMinMoney + ")");
    const irreversible = A.undoHours === 0;
    if (reasons.length) t = "APPROVE";
    else if (irreversible && (money > r.autoMaxMoney || A.guestFacing)) { t = "APPROVE"; reasons.push(A.guestFacing ? "Guest-facing and cannot be undone" : "Cannot be undone and over $" + r.autoMaxMoney); }
    else if (money > r.autoMaxMoney || A.guestFacing) { t = "UNDO"; reasons.push((A.guestFacing ? "Guest-facing" : "Over $" + r.autoMaxMoney) + ", reversible for " + A.undoHours + "h"); }
    else { t = "AUTO"; reasons.push("Small, reversible, evidence complete, confident"); }
    // Earned autonomy: a clean track record at THIS hotel for THIS action type moves it one step toward hands-free.
    // It never overrides a hard rule (missing facts, low confidence, big money) and never unlocks a blocked action.
    const h = history || { approved: 0, accepted: 0, reversals: 0 };
    const hard = action.evidence < 1 || action.confidence < r.minConfidence || money >= r.approveMinMoney;
    const graduated = h.approved >= r.graduateAfter && h.accepted / Math.max(1, h.approved) >= r.graduateAccept && h.reversals === 0;
    if (!hard && graduated && t === "APPROVE" && money <= r.autoMaxMoney) { t = "AUTO"; reasons.push("Earned: owner accepted " + h.accepted + " of " + h.approved + " past ones here; now reviewed in the daily digest"); }
    else if (!hard && graduated && t === "UNDO") { t = "AUTO"; reasons.push("Earned: " + h.accepted + " of " + h.approved + " left in place by the owner here"); }
    if (r.demoteOnReversal && h.reversals > 0 && t === "AUTO") { t = "UNDO"; reasons.push("Owner reversed this action type recently"); }
    return { tier: t, reasons, money, earned: reasons.some((x) => x.startsWith("Earned")) };
  }

  /* The record every action leaves behind: enough to reconstruct who decided what, on what evidence. */
  function auditRecord(action, decision, hotelId, ts) {
    return { hotel: hotelId, at: ts, action: action.type, money: decision.money, confidence: action.confidence, evidence: action.evidence, tier: decision.tier, reasons: decision.reasons, decidedBy: decision.tier === "AUTO" || decision.tier === "UNDO" ? "agent" : "pending owner", reversibleUntil: ACTIONS[action.type].undoHours ? "+" + ACTIONS[action.type].undoHours + "h" : "not reversible" };
  }

  return { ACTIONS, NEVER, RULES, tier, auditRecord };
});
