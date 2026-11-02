import type { Worklog } from '../../types';
import type { CalendarEventDto, BusyStatus } from '../../services/calendarService';

export const MANUAL_CALENDAR_ID = 'manual';

export interface ImportBlock {
    /** The calendar event's uid for calendar-sourced blocks, a fresh id for manual ones. */
    id: string;
    calendarId: string;
    title: string;
    start: string; // ISO
    end: string; // ISO
    allDay: boolean;
    busyStatus: BusyStatus | 'manual';
    /** Soft hide — reversible, kept out of the created drafts. */
    excluded: boolean;
    /** Overlaps a worklog that's already in Jira for this week. */
    alreadyLogged: boolean;
    /** Added by dragging on empty grid space, rather than from a calendar. */
    manual: boolean;
}

function timeRangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
    return new Date(aStart) < new Date(bEnd) && new Date(aEnd) > new Date(bStart);
}

const DEFAULT_EXCLUDED_BUSY_STATUSES: BusyStatus[] = ['free', 'tentative', 'oof', 'working_elsewhere'];

export function toImportBlock(event: CalendarEventDto, existingWorklogs: Worklog[]): ImportBlock {
    const alreadyLogged = existingWorklogs.some(w => timeRangesOverlap(event.start, event.end, w.start, w.end));
    const defaultExcluded = event.allDay || DEFAULT_EXCLUDED_BUSY_STATUSES.includes(event.busyStatus) || alreadyLogged;

    return {
        id: event.uid,
        calendarId: event.calendarId,
        title: event.title ?? 'Busy',
        start: event.start,
        end: event.end,
        allDay: event.allDay,
        busyStatus: event.busyStatus,
        excluded: defaultExcluded,
        alreadyLogged,
        manual: false,
    };
}

export function createManualBlock(calendarDay: Date, startMinutesFromMidnight: number, durationMinutes: number): ImportBlock {
    const start = new Date(calendarDay);
    start.setHours(0, startMinutesFromMidnight, 0, 0);
    const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

    return {
        id: crypto.randomUUID(),
        calendarId: MANUAL_CALENDAR_ID,
        title: 'New block',
        start: start.toISOString(),
        end: end.toISOString(),
        allDay: false,
        busyStatus: 'manual',
        excluded: false,
        alreadyLogged: false,
        manual: true,
    };
}

/** Blocks that are included and overlap another included block. */
export function findClashingBlockIds(blocks: ImportBlock[]): Set<string> {
    const included = blocks.filter(b => !b.excluded);
    const clashing = new Set<string>();

    for (let i = 0; i < included.length; i++) {
        for (let j = i + 1; j < included.length; j++) {
            if (timeRangesOverlap(included[i].start, included[i].end, included[j].start, included[j].end)) {
                clashing.add(included[i].id);
                clashing.add(included[j].id);
            }
        }
    }

    return clashing;
}
