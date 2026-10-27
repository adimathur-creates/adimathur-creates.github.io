#!/usr/bin/env node
// Always-on mode: every new message in #audience-requests gets a threaded answer.
// Needs COMPOSIO_API_KEY, a Slack connection for USER_ID, and an active Slack message trigger.
import { Composio } from "@composio/core";
import { generatePopulation, runDesk } from "../engine.js";
import { planCalls, runCalls } from "./actions.mjs";
import { USER_ID, REQUEST_CHANNEL, SLACK_TRIGGER } from "./config.mjs";

const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
const pop = generatePopulation(); // in production this is the real segment service, not a sample
const seen = new Set(); // Slack can redeliver; answer each message once

await composio.triggers.subscribe(async (event) => {
  const p = event.payload || {};
  const channel = p.channel || p.channel_id;
  const ts = p.ts || p.event_ts;
  const text = p.text || "";
  if (channel !== REQUEST_CHANNEL || p.bot_id || p.thread_ts || !text.trim()) return; // only top-level human posts
  if (seen.has(ts)) return; seen.add(ts);
  try {
    const result = runDesk(pop, text, { team: p.user ? `<@${p.user}>` : "Requester" });
    await runCalls(composio, planCalls(result, { channel, threadTs: ts }), { live: true });
    console.log(new Date().toISOString(), ts, result.decision.code);
  } catch (e) {
    console.error("desk failed on", ts, e.message); // the request stays unanswered and visible, not silently lost
  }
}, { triggerSlug: [SLACK_TRIGGER], userId: USER_ID });

console.log(`Listening on ${REQUEST_CHANNEL} via ${SLACK_TRIGGER}`);
