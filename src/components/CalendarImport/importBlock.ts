import type { Worklog } from '../../types';
import type { CalendarEventDto, BusyStatus } from '../../services/calendarService';
import { getIssueColor } from '../../utils/colorUtils';

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

/** The one colour used for a calendar everywhere: block edge, toggle chip, legend. */
export function calendarColor(calendarId: string): string {
    return calendarId === MANUAL_CALENDAR_ID ? '#999' : getIssueColor(calendarId);
}

/**
 * A copy of a block placed straight after the original (same length), so it
 * doesn't land on top of it. If there's no room left in the day it keeps the
 * original time and can be dragged from there.
 */
export function duplicateBlock(block: ImportBlock): ImportBlock {
    const start = new Date(block.start);
    const end = new Date(block.end);
    const duration = end.getTime() - start.getTime();
    const copyStart = new Date(end);
    const copyEnd = new Date(copyStart.getTime() + duration);
    const sameDay = copyEnd.toDateString() === start.toDateString();

    return {
        ...block,
        id: crypto.randomUUID(),
        start: sameDay ? copyStart.toISOString() : block.start,
        end: sameDay ? copyEnd.toISOString() : block.end,
        excluded: false,
        alreadyLogged: false,
    };
}

export interface BlockLane {
    lane: number;
    lanes: number;
}

/**
 * Outlook-style overlap layout for one day: blocks that overlap are put in
 * side-by-side lanes sharing the column width, so nothing is drawn on top of
 * anything else. Lanes are assigned per cluster of overlapping blocks;
 * `calendarOrder` makes blocks from the same calendar prefer the same lane.
 */
export function layoutLanes(blocks: ImportBlock[], calendarOrder: string[] = []): Map<string, BlockLane> {
    const rank = (b: ImportBlock) => {
        const i = calendarOrder.indexOf(b.calendarId);
        return i === -1 ? calendarOrder.length : i;
    };
    const sorted = [...blocks].sort((a, b) =>
        a.start.localeCompare(b.start) || rank(a) - rank(b) || b.end.localeCompare(a.end),
    );

    const result = new Map<string, BlockLane>();
    let cluster: Array<{ block: ImportBlock; lane: number }> = [];
    let laneEnds: string[] = [];
    let clusterEnd = '';

    const flush = () => {
        for (const item of cluster) result.set(item.block.id, { lane: item.lane, lanes: laneEnds.length });
        cluster = [];
        laneEnds = [];
        clusterEnd = '';
    };

    for (const block of sorted) {
        if (cluster.length > 0 && block.start >= clusterEnd) flush();

        let lane = laneEnds.findIndex(end => end <= block.start);
        if (lane === -1) {
            lane = laneEnds.length;
            laneEnds.push(block.end);
        } else {
            laneEnds[lane] = block.end;
        }
        cluster.push({ block, lane });
        if (block.end > clusterEnd) clusterEnd = block.end;
    }
    flush();

    return result;
}
