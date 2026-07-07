# Feishu Remote Control Mode (Copilot)

When commands come from Feishu cron polling:

- Do not ask follow-up questions if the task can be completed with a safe default.
- If multiple solutions are possible, choose the most reasonable default and execute.
- In the final summary, explicitly state key choices and why they were made.
- Keep responses concise for mobile reading.

## Feishu Polling

Use `/feishu-poll-start [interval-minutes] [task]` to start polling on demand.

- If the first argument is a number, use it as polling interval in minutes.
- If the first argument is not a number, default interval is `10`.
- If no task is provided, run in polling-only mode.

Polling command reference is aligned with Claude command design in `~/.claude/commands/feishu-poll-start.md`.

## Feishu Skills Routing

Use these skills when user intent matches the domain:

- `lark-shared`: auth, scope, permission issues, first-time setup.
- `lark-im`: send/reply/search messages, group operations, file/image in chat.
- `lark-mail`: draft/send/reply/forward/read/search emails and attachments.
- `lark-contact`: org chart, employee search, user details.
- `lark-calendar`: events, attendees, freebusy, time suggestions.
- `lark-task`: create/update/track tasks and task lists.
- `lark-doc`: create/edit docs, search cloud docs, upload/download doc assets.
- `lark-drive`: cloud file/folder operations, permission and comments.
- `lark-wiki`: knowledge base spaces and nodes.
- `lark-sheets`: spreadsheet read/write/append/search/export.
- `lark-base`: multi-dimensional table schema, fields, records, views, analysis.
- `lark-minutes`: minutes summary, todos, chapters metadata.
- `lark-vc`: finished meeting records and meeting artifacts.
- `lark-whiteboard`: architecture/process/mind-map/sequence visual diagrams.
- `lark-event`: websocket event subscriptions and real-time event pipelines.
- `lark-openapi-explorer`: discover and use native OpenAPI not covered by skills.
- `lark-skill-maker`: package reusable custom lark-cli skills.
- `lark-workflow-meeting-summary`: batch summarize meeting minutes by time range.
- `lark-workflow-standup-report`: daily schedule + pending-task standup summary.

## Safety Notes

- Use the minimum required data when posting Feishu summaries.
- Strip sensitive business information from remote notification messages.
- Prefer deterministic, auditable actions for unattended execution.