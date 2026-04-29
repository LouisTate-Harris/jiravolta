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
