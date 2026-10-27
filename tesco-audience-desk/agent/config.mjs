// Everything the agent needs to know about the outside world, in one place.
// Tool slugs and argument names are my best reading of Composio's toolkits.
// Run `npm run verify` before going live: it checks each slug and argument name against
// Composio's live schemas and pins the toolkit versions. It fails loudly on any mismatch.

export const USER_ID = process.env.DESK_USER_ID || "audience-desk";
export const REQUEST_CHANNEL = process.env.DESK_SLACK_CHANNEL || "C0AUDIENCE"; // #audience-requests
export const JIRA_PROJECT = process.env.DESK_JIRA_PROJECT || "CDP";
export const LOG_SHEET_ID = process.env.DESK_LOG_SHEET_ID || "";
export const LOG_RANGE = process.env.DESK_LOG_RANGE || "requests!A:G";

export const TOOLS = {
  slackReply: {
    slug: "SLACK_SEND_MESSAGE",
    args: ({ channel, text, threadTs }) => ({ channel, text, ...(threadTs ? { thread_ts: threadTs } : {}) }),
  },
  jiraCreate: {
    slug: "JIRA_CREATE_ISSUE",
    args: ({ project, summary, description, issuetype, labels }) => ({ project_key: project, summary, description, issue_type: issuetype, labels }),
  },
  sheetAppend: {
    slug: "GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND",
    args: ({ spreadsheetId, range, row }) => ({ spreadsheetId, range, valueInputOption: "USER_ENTERED", values: [row] }),
  },
};

// Slack trigger that fires on new messages in channels the bot can see.
export const SLACK_TRIGGER = process.env.DESK_SLACK_TRIGGER || "SLACK_RECEIVE_MESSAGE";

// Filled in by `npm run verify`. Pinned versions mean a toolkit update can't silently change behaviour.
export const LOCK_FILE = new URL("./composio.lock.json", import.meta.url);
