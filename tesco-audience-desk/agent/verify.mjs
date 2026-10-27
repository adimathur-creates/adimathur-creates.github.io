#!/usr/bin/env node
// Checks every tool the desk uses against Composio's live schema, then pins versions.
// Fails if a slug doesn't exist or if any argument we send isn't in the tool's inputs.
import { writeFileSync } from "node:fs";
import { Composio } from "@composio/core";
import { TOOLS, LOCK_FILE } from "./config.mjs";

const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
const sample = {
  slackReply: { channel: "C", text: "t", threadTs: "1" },
  jiraCreate: { project: "P", summary: "s", description: "d", issuetype: "Story", labels: ["x"] },
  sheetAppend: { spreadsheetId: "id", range: "A:A", row: ["x"] },
};
const lock = {}; let bad = 0;
for (const [key, t] of Object.entries(TOOLS)) {
  try {
    const tool = await composio.tools.getRawComposioToolBySlug(t.slug);
    const known = Object.keys(tool.inputParameters?.properties || {});
    const sent = Object.keys(t.args(sample[key]));
    const missing = sent.filter((k) => !known.includes(k));
    lock[t.slug] = tool.version;
    if (missing.length) { bad++; console.log(`✗ ${t.slug}: unknown argument(s) ${missing.join(", ")}. Tool accepts: ${known.join(", ")}`); }
    else console.log(`✓ ${t.slug} @ ${tool.version}`);
  } catch (e) { bad++; console.log(`✗ ${t.slug}: ${e.message}`); }
}
if (bad) { console.log(`\n${bad} problem(s). Fix agent/config.mjs and run again.`); process.exit(1); }
writeFileSync(LOCK_FILE, JSON.stringify(lock, null, 2));
console.log("\nPinned versions written to composio.lock.json");
