// The same requests the web page offers, with the answer each one must get.
import assert from "node:assert/strict";
import { generatePopulation, runDesk, parseRequest, catalogueHealth } from "../engine.js";
import { planCalls } from "./actions.mjs";

const pop = generatePopulation();
const cases = [
  ["Lapsed bakery shoppers who haven't bought bread in 8 weeks, for an email win-back. Exclude anyone we've contacted twice this week.", "REUSE", "SEG-101"],
  ["High value online shoppers who bought plant-based in the last 12 weeks, app push for a new range launch", "REUSE", "SEG-102"],
  ["Customers who haven't bought pet food for 6 weeks, email reminder about the new pet range", "EXTEND", "SEG-104"],
  ["New parents buying baby products in the last 4 weeks for a Meta campaign", "BLOCKED", null],
  ["Wine buyers in the last 12 weeks for an SMS offer on Christmas fizz", "REUSE", "SEG-105"],
  ["Clubcard Plus members who buy world foods and frozen", "BUILD", null],
  ["Free-from shoppers in the last 12 weeks, email about the new gluten-free bakery range", "REUSE", "SEG-107"],
  ["Something nice for loyal customers", "NEEDS_INFO", null],
];
let n = 0;
for (const [text, code, seg] of cases) {
  const r = runDesk(pop, text, { now: 0 });
  assert.equal(r.decision.code, code, `${text}\n  got ${r.decision.code}: ${r.decision.why}`);
  if (seg) assert.equal(r.decision.segment?.id, seg, text);
  // never release an audience that failed a hard check
  if (r.checks.some((c) => c.status === "block" || c.status === "fail")) assert.equal(r.decision.code, "BLOCKED");
  // a ticket exists exactly when engineering work is needed
  assert.equal(!!r.outputs.jira, code === "EXTEND" || code === "BUILD", text);
  n++;
}
// sensitive categories always carry a review or a block
assert.ok(runDesk(pop, "Free-from shoppers in the last 12 weeks, email").decision.review);
// exclusions are not read as the audience
assert.deepEqual(parseRequest("Snack buyers last 4 weeks excluding wine buyers, email").spec.categories, ["snacks"]);
// the catalogue's planted duplicates are found
const pairs = catalogueHealth(pop).pairs.map((p) => p.a.id + "~" + p.b.id);
assert.ok(pairs.includes("SEG-102~SEG-131") && pairs.includes("SEG-111~SEG-127"));
// dry-run plan: Jira before Slack so the reply can carry the ticket key
const plan = planCalls(runDesk(pop, cases[2][0]), { channel: "C1" }).map((c) => c.slug);
assert.deepEqual(plan.slice(0, 2), ["JIRA_CREATE_ISSUE", "SLACK_SEND_MESSAGE"]);
// same input, same answer
assert.equal(JSON.stringify(runDesk(pop, cases[0][0], { now: 0 }).outputs), JSON.stringify(runDesk(pop, cases[0][0], { now: 0 }).outputs));
console.log(`ok – ${n} request cases and 5 rule checks passed`);
