#!/usr/bin/env node
// Run one request through the desk from the command line.
//   node desk.mjs "Lapsed bakery shoppers, 8 weeks, email" --team "CRM Marketing"
//   node desk.mjs "..." --live --channel C123 --thread 1730000000.000100
// Without --live it prints the Composio calls it would make and touches nothing.
import { generatePopulation, runDesk } from "../engine.js";
import { planCalls, runCalls } from "./actions.mjs";
import { REQUEST_CHANNEL } from "./config.mjs";

const argv = process.argv.slice(2);
const flag = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const text = argv.find((a, i) => !a.startsWith("--") && !argv[i - 1]?.startsWith("--") );
if (!text) { console.error('Usage: node desk.mjs "<request>" [--team T] [--live --channel C --thread TS]'); process.exit(1); }
const live = argv.includes("--live");

const pop = generatePopulation();
const result = runDesk(pop, text, { team: flag("--team") || "Requester" });
const calls = planCalls(result, { channel: flag("--channel") || REQUEST_CHANNEL, threadTs: flag("--thread") });

let composio = null;
if (live) {
  const { Composio } = await import("@composio/core");
  composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
}
const done = await runCalls(composio, calls, { live });

console.log(`\n${result.decision.code}: ${result.decision.title}\n${result.decision.why}\n`);
for (const c of done) console.log(`${c.dryRun ? "[dry run]" : "[sent]"} ${c.slug}\n${JSON.stringify(c.arguments, null, 2)}\n`);
