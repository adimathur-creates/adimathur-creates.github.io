// node test.mjs — pins the auditor's behaviour so a rule change can't silently break it.
import assert from "node:assert/strict";
import { audit, evaluate, preDial, scaleModel, parseTranscript } from "./engine.js";
import { CALLS } from "./calls.js";

const ev = evaluate(CALLS);
// every labelled call except the two documented hard cases gets exactly its labels
for (const r of ev.rows) {
  if (["C17", "C19"].includes(r.call.id)) continue;
  assert.deepEqual(r.result.rulesHit, [...r.call.labels].sort(), `${r.call.id}: ${r.result.rulesHit} vs ${r.call.labels}`);
}
// the hard cases fail the way the page says they do
assert.deepEqual(ev.rows.find((r) => r.call.id === "C17").missed, ["R7"]);
assert.deepEqual(ev.rows.find((r) => r.call.id === "C19").extra, ["R3"]);
assert.equal(ev.tp, 12); assert.equal(ev.fp, 1); assert.equal(ev.fn, 1);
// a low-confidence near-miss goes to a person, never straight to "violation"
const c9 = audit(CALLS.find((c) => c.id === "C09"));
assert.equal(c9.verdict, "LISTEN"); assert.equal(c9.findings[0].who, "Possibly misheard");
// a legal-stage account may state legal facts; the same words on a 30-day account are a threat
const legal = CALLS.find((c) => c.id === "C12");
assert.deepEqual(audit(legal).rulesHit, []);
assert.deepEqual(audit({ ...legal, stage: "dpd_30" }).rulesHit, ["R7"]);
// calling hours edges: 08:00 and 18:59 allowed, 07:59 and 19:00 not
const p = (t) => preDial({ startTime: t, attemptsToday: 0, flags: {} }).map((f) => f.rule);
assert.deepEqual(p("08:00"), []); assert.deepEqual(p("18:59"), []); assert.deepEqual(p("07:59"), ["R1"]); assert.deepEqual(p("19:00"), ["R1"]);
// "fir" alone means "then" in Hinglish and must not read as a police threat
const fir = audit({ ...CALLS[0], turns: [CALLS[0].turns[0], { s: "agent", t: "Fir aap 5 tareekh tak payment kar dijiye." }] });
assert.ok(!fir.rulesHit.includes("R7"));
// pasted transcripts parse into the same shape
const pt = parseTranscript("A: Namaste\nC: papa guzar gaye [0.9]\nA: Dukh hua, hum baad mein call karenge.");
assert.equal(pt.length, 3); assert.equal(pt[1].conf, 0.9); assert.equal(pt[1].s, "customer");
// scale model arithmetic
const s = scaleModel({ callsPerMonth: 1_000_000, violationRate: 0.005, sampleRate: 0.02, recall: 0.9, flagRate: 0.03, minutesPerReview: 4 });
assert.equal(s.violations, 5000); assert.equal(s.foundBySampling, 100); assert.equal(s.foundByAuditor, 4500);
console.log("ok – 19 calls and 9 behaviour checks passed");
