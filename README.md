# JiraVolta

A desktop-first web application for viewing and preparing Jira worklogs one week at a time. Built with React + TypeScript.

## Overview

JiraVolta focuses on making timesheet edits fast and visual with:
- **Status Matrix**: Summary view showing hours by issue and day
- **Interactive Timeline**: Drag-and-drop interface for creating and editing worklogs
- **Review Panel**: Bulk approval system for pending changes
- **Week Navigation**: Easy navigation between weeks

## Features (MVP)

✅ View worklogs in a visual timeline with 15-minute granularity  
✅ Create new worklogs by dragging on the timeline  
✅ Move and resize existing worklogs  
✅ Automatic snapping to 15-minute increments  
✅ Overlap detection and prevention  
✅ Draft persistence in LocalStorage  
✅ Bulk approve/discard changes  
✅ Week-by-week navigation  
✅ Mock Jira data (no real API integration in MVP)

## Getting Started

### Prerequisites

- Node.js 18+ 
- pnpm (or npm/yarn)

### Installation

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview
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

### Project Structure
```
src/
├── components/          # React components
│   ├── StatusMatrix.tsx     # Hours summary table
│   ├── InteractiveTimeline.tsx  # Drag-and-drop timeline
│   ├── WorklogBlock.tsx     # Individual worklog blocks
│   ├── ReviewPanel.tsx      # Draft review sidebar
│   └── WeekNavigation.tsx   # Week controls
├── utils/              # Utility functions
│   ├── dateUtils.ts        # Date manipulation
│   ├── validationUtils.ts  # Overlap detection
│   ├── storageUtils.ts     # LocalStorage handling
│   └── mockData.ts         # Mock Jira data generator
├── types.ts            # TypeScript type definitions
└── App.tsx             # Main application component
```

### Key Concepts

**Worklogs** are either:
- `source: 'jira'` - Fetched from mock Jira API
- `source: 'draft'` - Local changes pending approval

**Drafts** track changes with `changeType`:
- `create` - New worklog
- `update` - Modified existing worklog
- `delete` - Removed worklog

**Validation** ensures:
- Minimum 15-minute duration
- Times snap to 15-minute boundaries
- No overlapping worklogs on same day

## Limitations (MVP)

⚠️ Desktop only - no mobile/tablet optimization  
⚠️ Mock data only - no real Jira API integration  
⚠️ No authentication or user management  
⚠️ No per-item approval (bulk only)  
⚠️ No collaborative/multi-user features

## Future Enhancements

- Real Jira API integration with OAuth
- Mobile-responsive design
- Keyboard shortcuts for power users
- Per-item draft approval
- Undo/redo functionality
- Worklog comments and descriptions
- Time tracking statistics and reports

## Development

### Type Checking
```bash
pnpm tsc --noEmit
```

### Linting
```bash
pnpm eslint .
```

## License

MIT

## Acknowledgments

Based on the specification in [spec.md](./spec.md)

