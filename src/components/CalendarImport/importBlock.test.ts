import { describe, it, expect } from 'vitest';
import { toImportBlock, findClashingBlockIds, createManualBlock, duplicateBlock, layoutLanes, MANUAL_CALENDAR_ID } from './importBlock';
import type { CalendarEventDto } from '../../services/calendarService';
import type { Worklog } from '../../types';

function event(overrides: Partial<CalendarEventDto> = {}): CalendarEventDto {
    return {
        uid: 'event-1',
        calendarId: 'main',
        title: 'Example meeting',
        start: '2026-11-03T09:00:00.000Z',
        end: '2026-11-03T10:00:00.000Z',
        allDay: false,
        busyStatus: 'busy',
        ...overrides,
    };
}

describe('toImportBlock', () => {
    it('keeps a busy, non-overlapping event included by default', () => {
        const block = toImportBlock(event(), []);
        expect(block.excluded).toBe(false);
        expect(block.alreadyLogged).toBe(false);
    });

    it.each(['free', 'tentative', 'oof', 'working_elsewhere'] as const)(
        'excludes %s events by default',
        (busyStatus) => {
            expect(toImportBlock(event({ busyStatus }), []).excluded).toBe(true);
        },
    );

    it('excludes all-day events by default', () => {
        expect(toImportBlock(event({ allDay: true }), []).excluded).toBe(true);
    });

    it('excludes and flags a block that overlaps an existing Jira worklog', () => {
        const existing: Worklog = {
            id: 'w1', issueKey: 'ABC-1', source: 'jira',
            start: '2026-11-03T09:30:00.000Z', end: '2026-11-03T09:45:00.000Z', durationMinutes: 15,
        };
        const block = toImportBlock(event(), [existing]);
        expect(block.alreadyLogged).toBe(true);
        expect(block.excluded).toBe(true);
    });

    it('falls back to "Busy" when the feed exposes no title', () => {
        expect(toImportBlock(event({ title: null }), []).title).toBe('Busy');
    });
});

describe('createManualBlock', () => {
    it('is included by default and tagged as manual', () => {
        const block = createManualBlock(new Date('2026-11-03T00:00:00Z'), 9 * 60, 30);
        expect(block.manual).toBe(true);
        expect(block.calendarId).toBe(MANUAL_CALENDAR_ID);
        expect(block.excluded).toBe(false);
    });
});

describe('findClashingBlockIds', () => {
    it('flags two included blocks that overlap in time', () => {
        const a = { ...toImportBlock(event({ uid: 'a' }), []) };
        const b = { ...toImportBlock(event({ uid: 'b', start: '2026-11-03T09:30:00.000Z', end: '2026-11-03T10:30:00.000Z' }), []) };
        const clashing = findClashingBlockIds([a, b]);
        expect(clashing).toEqual(new Set(['a', 'b']));
    });

    it('does not flag an excluded block even if it would otherwise overlap', () => {
        const a = { ...toImportBlock(event({ uid: 'a' }), []), excluded: true };
        const b = { ...toImportBlock(event({ uid: 'b', start: '2026-11-03T09:30:00.000Z', end: '2026-11-03T10:30:00.000Z' }), []) };
        expect(findClashingBlockIds([a, b])).toEqual(new Set());
    });

    it('does not flag non-overlapping blocks', () => {
        const a = { ...toImportBlock(event({ uid: 'a' }), []) };
        const b = { ...toImportBlock(event({ uid: 'b', start: '2026-11-03T11:00:00.000Z', end: '2026-11-03T12:00:00.000Z' }), []) };
        expect(findClashingBlockIds([a, b])).toEqual(new Set());
    });
});

describe('layoutLanes', () => {
    const block = (uid: string, calendarId: string, start: string, end: string) =>
        toImportBlock(event({ uid, calendarId, start: `2026-11-03T${start}:00.000Z`, end: `2026-11-03T${end}:00.000Z` }), []);

    it('gives a lone block the full width', () => {
        expect(layoutLanes([block('a', 'main', '09:00', '10:00')]).get('a')).toEqual({ lane: 0, lanes: 1 });
    });

    it('puts overlapping blocks side by side, calendar order deciding the lane', () => {
        const lanes = layoutLanes(
            [block('task', 'plan', '09:00', '10:00'), block('meeting', 'main', '09:30', '10:30')],
            ['main', 'plan'],
        );
        expect(lanes.get('task')).toEqual({ lane: 0, lanes: 2 });
        expect(lanes.get('meeting')).toEqual({ lane: 1, lanes: 2 });
    });

    it('reuses a freed lane and keeps separate clusters independent', () => {
        const lanes = layoutLanes([
            block('a', 'main', '09:00', '10:00'),
            block('b', 'main', '09:30', '11:00'),
            block('c', 'main', '10:00', '10:30'),
            block('d', 'main', '13:00', '14:00'),
        ]);
        expect(lanes.get('c')).toEqual({ lane: 0, lanes: 2 });
        expect(lanes.get('d')).toEqual({ lane: 0, lanes: 1 });
    });

    it('treats back-to-back blocks as not overlapping', () => {
        const lanes = layoutLanes([block('a', 'main', '09:00', '10:00'), block('b', 'main', '10:00', '11:00')]);
        expect(lanes.get('b')).toEqual({ lane: 0, lanes: 1 });
    });
});

describe('duplicateBlock', () => {
    it('places the copy straight after the original, same length, with a new id', () => {
        const original = toImportBlock(event(), []);
        const copy = duplicateBlock(original);
        expect(copy.id).not.toBe(original.id);
        expect(copy.start).toBe(original.end);
        expect(copy.end).toBe('2026-11-03T11:00:00.000Z');
        expect(copy.title).toBe(original.title);
        expect(copy.calendarId).toBe(original.calendarId);
    });

    it('is included even if the original was excluded', () => {
        const copy = duplicateBlock({ ...toImportBlock(event(), []), excluded: true, alreadyLogged: true });
        expect(copy.excluded).toBe(false);
        expect(copy.alreadyLogged).toBe(false);
    });
});
