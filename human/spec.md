# JiraVolta

Overview
--------
JiraVolta is a desktop-first web app for viewing and preparing Jira worklogs one week at a time. The app focuses on making timesheet edits fast and visual: a summary matrix (Jira issues × weekday) sits above an interactive timeline (days on the x-axis aligned with the matrix, time-of-day on the y-axis). Users create and edit local draft worklogs via drag interactions, review changes, and then perform a bulk push (simulated in MVP).

MVP Scope (confirmed)
----------------------
- Platform: Desktop web app only (no mobile/tablet interactions in MVP).
- Data: Mock Jira data only for MVP (no real Jira API/auth integration).
- Time granularity: 15-minute increments; timeline snaps to 15-minute blocks.
- Overlap policy: Hard prevention of overlapping worklogs on the same user/day/time.
- Draft persistence: Browser LocalStorage for draft worklogs (survives refresh).
- Week navigation: Previous / Next week controls (7-day view centered on week).
- Review flow: Bulk review and bulk push (single approve/push action).

User-facing Features
---------------------
1) Status Matrix (Summary)
- View: 7 columns for days of the selected week (Mon-Sun) on the x-axis and Jira issue keys on the y-axis.
- Cells: show total hours for that issue on that day (empty or 0 if none).
- Totals: show per-day total hours row and per-issue total column.
- States: loading, empty (no issues), and error states for mock fetch.

Acceptance criteria (matrix)
- Display 7 day columns with the correct weekday labels for the selected week.
- Each Jira issue row lists totals per day and a row total.
- Footer row shows sum of hours per day.

2) Interactive Timeline (Editor)
- Layout: same 7 day columns aligned horizontally with the matrix above; vertical axis is time (configurable range, default 08:00–18:00).
- Create: click-and-drag on an empty day column to create a draft worklog; created worklogs snap to 15-minute increments; minimum duration 15 minutes.
- Move: drag a draft/existing block up/down to change start time or drag left/right to change day; drag-resize to change duration.
- Overlap handling: disallow drops/resizes that would create overlaps; show inline warning and prevent the action.
- Visuals: drafts shown in a distinct style (e.g., dashed border) until approved; hover shows issue key, start, end, and duration.

Acceptance criteria (timeline)
- User can create a draft by dragging; new draft appears in LocalStorage and in the matrix totals.
- User can move a draft between days and times; times snap to 15-minute increments.
- System prevents creating or resizing a draft that would overlap another draft/worklog on the same day.

3) Draft Lifecycle & Review
- Drafts: any creation, move or resize action produces a local draft record (not sent to Jira in MVP).
- Review panel: a collapsible side panel listing all pending drafts with summary (issue, day, start, end, duration, action type: created/updated/deleted).
- Bulk actions: user can Bulk Approve (simulated push) or Discard All.
- After Approve in MVP (mock): mark drafts as "pushed" and clear pending drafts; in a real integration this would send API requests.

Acceptance criteria (review)
- Review panel lists all pending changes with accurate details.
- Bulk Approve clears drafts and shows a success confirmation (simulated push).
- Discard All removes drafts and restores the state to last-synced mock data.

4) Week Navigation & Synchronization
- Controls: previous/next buttons to move the 7-day window backward/forward by one week.
- Synchronization: switching weeks updates both matrix and timeline consistently; pending drafts are scoped to their week and persist in LocalStorage.

Data Model (core entities)
- Worklog
	- id: string (uuid)
	- issueKey: string (e.g., PROJ-123)
	- start: ISO-8601 datetime
	- end: ISO-8601 datetime
	- durationMinutes: integer
	- source: "jira" | "draft"
- DraftWorklog extends Worklog
	- changeType: "create" | "update" | "delete"
	- lastModified: ISO-8601

Validation rules
- Minimum duration: 15 minutes.
- Start/end timestamps snap to 15-minute boundaries.
- Cannot create or update a draft that overlaps another worklog/draft on the same day.

Interactions & UX details
- Snapping: all drag and resize interactions snap to the nearest 15-minute tick.
- Keyboard accessibility: support arrow keys for nudging selected draft by 15-minute increments (optional in MVP iteration 2).
- Timezone: use the user's browser local timezone; store datetimes in ISO-8601 with timezone offset.

Non-functional requirements
- Performance: initial mock dataset should render the matrix + timeline within 200ms for up to 50 issues and 200 worklogs.
- Persistence: drafts stored in LocalStorage under a clear key per user-week.
- Accessibility baseline: keyboard focusable interactive elements and ARIA labels for timeline blocks.

Out of scope for MVP
- Real Jira authentication or API integration (push is simulated).
- Mobile or touch-optimized interactions.
- Per-item approval (only bulk approve is supported in MVP).
- Collaborative multi-user realtime editing.

Acceptance Criteria (summary - testable)
- Given a selected week, when the UI loads, then matrix and timeline show mock data for that week.
- Given an empty slot on the timeline, when the user click-drags for >=15 minutes, then a draft appears and the matrix totals update.
- Given two drafts that would overlap, when the user attempts an overlapping drag/resize, then the UI blocks the action and shows a warning.
- Given multiple drafts, when the user opens the review panel and clicks Bulk Approve, then drafts are cleared and a success confirmation is shown.

Terminology
- "Worklog": any record representing time allocated to an issue (may be from Jira or a local draft).
- "Draft": a local-only worklog change (create/update/delete) pending review.

Next steps for implementation
1. Implement UI scaffold: matrix + aligned timeline and week navigation.
2. Implement core interactions: drag-to-create, drag-to-move, resize-to-change-duration with 15-minute snapping.
3. Implement LocalStorage draft persistence and review panel with Bulk Approve/Discard All.
4. Add testable acceptance checks and small sample mock dataset for dev QA.

Document history
- 2026-04-24: Rewritten into MVP-ready spec (mock data, 15-min granularity, LocalStorage drafts, no overlaps, desktop-only).

