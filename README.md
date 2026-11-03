# JiraVolta

A desktop-first web application for viewing and preparing Jira worklogs one week at a time.

## Overview

JiraVolta focuses on making timesheet edits fast and visual with:
- **Status Matrix**: Summary view showing hours by issue and day
- **Interactive Timeline**: Drag-and-drop interface for creating and editing worklogs
- **Review Panel**: Bulk approval system for pending changes
- **Week Navigation**: Easy navigation between weeks

## Features

✅ View worklogs in a visual timeline with 15-minute granularity  
✅ Create new worklogs by dragging on the timeline  
✅ Move and resize existing worklogs  
✅ Automatic snapping to 15-minute increments  
✅ Draft persistence in LocalStorage  
✅ Bulk approve/discard changes  
✅ Week-by-week navigation

## Getting Started

### Prerequisites

- Node.js 18+ 
- pnpm (or npm/yarn)

### Installation

```bash
# Install dependencies
pnpm install

# copy and `.env.example`
cp .env.example .env.local

# fill `.env.local` with the required credentials

# Start development server
pnpm dev
```

The application will be available at `http://localhost:5173/`

## Running with Docker

If you prefer not to install Node.js and pnpm locally, Docker Compose can run the app for you.

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) with the Compose plugin (included in Docker Desktop)

### Setup

```bash
# Copy the example env file and fill in your Jira credentials (same as native setup)
cp .env.example .env.local
# edit .env.local
```

### Start

```bash
# First run — builds the image and starts the app
docker compose up --build

# Subsequent runs — image already built
docker compose up
```

The app will be available at `http://localhost:5173/`.

To stop: press `Ctrl-C`, then run `docker compose down` to remove the container.

The Jira data cache is stored in a Docker named volume (`jiravolta-cache`) and persists across restarts. To wipe it: `docker compose down -v`.

## Usage

### Creating Worklogs
1. Select an issue from the dropdown above the timeline
2. Click and drag on any day column to create a worklog
3. The worklog will snap to 15-minute increments
4. Release to create a draft worklog

### Editing Worklogs
- **Move**: Click and drag a worklog to change its time
- **Resize**: Drag the bottom handle to change duration
- **Delete**: Right-click a worklog and select "Delete"

### Managing Drafts
1. Click the "Review Changes" button on the right side
2. Review all pending changes in the panel
3. Click "Approve All" to save (simulated push to Jira)
4. Click "Discard All" to cancel all changes

### Navigation
- Use "Previous Week" / "Next Week" buttons to navigate
- Click "Today" to jump to the current week
- Week range is displayed at the top

### Importing from calendars

The **Import calendar** button (it appears once at least one calendar is configured) turns the meetings in your published Outlook calendars into draft worklogs for the week you're viewing. Nothing reaches Jira until you approve the drafts in the Review panel, as usual.

1. **Review blocks**: all calendars are merged into one week grid. Drag to move or resize, drag on empty space to add a block, exclude or delete blocks, and resolve overlaps. All-day, Free, Tentative, Out-of-office and anything overlapping a worklog already in Jira start excluded.
2. **Map to tickets**: one table for every block, with repeated titles grouped. Each row gets a proposed ticket and a badge showing where it came from, and you can change any of them with the searchable picker (or paste a Jira link). Every row needs a ticket or must be skipped before you can create the drafts.

#### Configuring calendars

Publish each Outlook calendar and put its ICS link in an `ICS_CALENDAR_<NAME>` variable; the name becomes its label (`ICS_CALENDAR_MEETINGS` shows as "Meetings"). The links expose your event titles to anyone who holds them, so keep them out of files that get committed. They are redacted from logs and errors, and the raw feed is never written to disk. Outlook refreshes published feeds with some lag, so a brand new event can take a while to appear; to rotate a link, republish the calendar and update the variable.

The ticket picker draws on your ticket list, the active sprint of `JIRA_BOARD_ID`, the saved filter `JIRA_EXTRA_FILTER_ID`, and issues assigned to you.

One way to keep the links out of your env files is 1Password: store them as `op://` references in a git-ignored `.env.op.local` and start the app with:

```bash
just run-op   # op run --env-file=.env.op.local -- pnpm dev
```

Calendar import runs natively only; the Docker setup doesn't support it.

#### How tickets are matched

Matching runs locally and never sends anything off your machine, unless you opt in to the Claude step below.

- **Remembered**: when you create drafts, each title and ticket pair you confirmed is saved. Titles are normalised first, so "Team stand-up (3/5)" and "RE: Team stand-up" are the same meeting. A remembered ticket that has left the pool is ignored.
- **Similar**: a small sentence-embedding model (`Xenova/all-MiniLM-L6-v2`, about 25 MB) compares the title with ticket summaries and with titles you've mapped before. It downloads once on first use, then runs offline. If it can't be loaded, a simple word-overlap comparison is used instead.
- **Claude (optional)**: set `ANTHROPIC_API_KEY` and an **Ask Claude** button appears for rows the local steps couldn't place confidently. It is never automatic: you see the event titles and ticket list that will be sent (never times, attendees or descriptions) and click Send. The model defaults to `claude-haiku-5-5`; override it with `CLAUDE_MATCH_MODEL`. Without a key the button doesn't appear.

Tick or untick **Remember** on a row to choose whether its pair is saved. Use **Learned mappings** in step 2 to review and delete what has been learned.

Learned mappings and the model cache live in `~/.config/jiravolta/` (readable only by you), outside the repository. Set `JIRAVOLTA_CONFIG_DIR` to move them.

## Architecture

### Tech Stack
- **React 19** - UI framework
- **TypeScript 6** - Type safety
- **Vite 8** - Build tool & dev server
- **LocalStorage** - Draft persistence
