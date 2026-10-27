// Turns a desk result into Composio tool calls, and runs them (or prints them on a dry run).
import { readFileSync, existsSync } from "node:fs";
import { TOOLS, USER_ID, JIRA_PROJECT, LOG_SHEET_ID, LOG_RANGE, LOCK_FILE } from "./config.mjs";

export function planCalls(result, { channel, threadTs }) {
  const o = result.outputs;
  const calls = [];
  // Jira first, so the Slack reply can link the ticket
  if (o.jira) calls.push({ key: "jiraCreate", ...o.jira, project: JIRA_PROJECT });
  calls.push({ key: "slackReply", channel, threadTs, text: o.slack });
  if (LOG_SHEET_ID) calls.push({ key: "sheetAppend", spreadsheetId: LOG_SHEET_ID, range: LOG_RANGE, row: o.logRow });
  return calls.map((c) => ({ key: c.key, slug: TOOLS[c.key].slug, arguments: TOOLS[c.key].args(c) }));
}

function lock() {
  if (!existsSync(LOCK_FILE)) throw new Error("No composio.lock.json. Run `npm run verify` first; it checks every tool and pins versions.");
  return JSON.parse(readFileSync(LOCK_FILE, "utf8"));
}

export async function runCalls(composio, calls, { live }) {
  const out = [];
  const versions = live ? lock() : {};
  let ticketKey = null;
  for (const c of calls) {
    if (c.key === "slackReply" && ticketKey) c.arguments.text += `\nTicket: *${ticketKey}*`;
    if (!live) { out.push({ ...c, dryRun: true }); continue; }
    const res = await composio.tools.execute(c.slug, { userId: USER_ID, version: versions[c.slug], arguments: c.arguments });
    if (!res.successful) throw new Error(`${c.slug} failed: ${res.error}`);
    if (c.key === "jiraCreate") ticketKey = res.data?.key || res.data?.issue_key || null;
    out.push({ ...c, ok: true, data: res.data });
  }
  return out;
}
