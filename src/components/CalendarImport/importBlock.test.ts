import { describe, it, expect } from 'vitest';
import { toImportBlock, findClashingBlockIds, createManualBlock, MANUAL_CALENDAR_ID } from './importBlock';
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
