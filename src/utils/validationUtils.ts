import type { Worklog, DraftWorklog } from '../types';

/**
 * Check if two worklogs overlap
 */
export function doWorklogsOverlap(worklog1: Worklog, worklog2: Worklog): boolean {
    const start1 = new Date(worklog1.start);
    const end1 = new Date(worklog1.end);
    const start2 = new Date(worklog2.start);
    const end2 = new Date(worklog2.end);

    // Check if they're on the same day
    if (start1.toDateString() !== start2.toDateString()) {
        return false;
    }

    // Check for time overlap: worklog1 starts before worklog2 ends AND worklog1 ends after worklog2 starts
    return start1 < end2 && end1 > start2;
}

/**
 * Check if a worklog would overlap with any existing worklogs
 */
export function checkForOverlaps(
    newWorklog: Worklog,
    existingWorklogs: Worklog[],
    excludeId?: string
): boolean {
    return existingWorklogs.some(existing => {
        if (excludeId && existing.id === excludeId) {
            return false; // Don't check against itself
        }
        return doWorklogsOverlap(newWorklog, existing);
    });
}

/**
 * Validate worklog timing (15-minute increments, minimum duration)
 */
export function validateWorklogTiming(worklog: Worklog): { valid: boolean; error?: string } {
    const start = new Date(worklog.start);
    const end = new Date(worklog.end);

    // Check minimum duration
    if (worklog.durationMinutes < 15) {
        return { valid: false, error: 'Minimum duration is 15 minutes' };
    }

    // Check 15-minute increment snapping
    if (start.getMinutes() % 15 !== 0 || end.getMinutes() % 15 !== 0) {
        return { valid: false, error: 'Start and end times must be in 15-minute increments' };
    }

    // Check start before end
    if (start >= end) {
        return { valid: false, error: 'Start time must be before end time' };
    }

    return { valid: true };
}

/**
 * Get all worklogs for a specific day
 */
export function getWorklogsForDay(worklogs: Worklog[], date: Date): Worklog[] {
    const targetDateStr = date.toDateString();
    return worklogs.filter(worklog => {
        const worklogDate = new Date(worklog.start);
        return worklogDate.toDateString() === targetDateStr;
    });
}

/**
 * Merge worklogs and drafts, with drafts taking precedence
 */
export function mergeWorklogsAndDrafts(
    worklogs: Worklog[],
    drafts: DraftWorklog[]
): Worklog[] {
    const result: Worklog[] = [...worklogs];

    drafts.forEach(draft => {
        if (draft.changeType === 'create') {
            result.push(draft);
        } else if (draft.changeType === 'update') {
            const index = result.findIndex(w => w.id === draft.id);
            if (index !== -1) {
                result[index] = draft;
            }
        } else if (draft.changeType === 'delete') {
            const index = result.findIndex(w => w.id === draft.id);
            if (index !== -1) {
                result.splice(index, 1);
            }
        }
    });

    return result;
}
