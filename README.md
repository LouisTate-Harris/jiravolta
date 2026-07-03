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

## Architecture

### Tech Stack
- **React 19** - UI framework
- **TypeScript 6** - Type safety
- **Vite 8** - Build tool & dev server
- **LocalStorage** - Draft persistence
