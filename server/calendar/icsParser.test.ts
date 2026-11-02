import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseICS } from './icsParser';

function loadFixture(name: string): string {
    return readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)), 'utf-8');
}

// A wide window covering every fixture's events; individual tests narrow
// further where the windowing behaviour itself is what's under test.
const WINDOW_START = new Date('2026-10-01T00:00:00Z');
const WINDOW_END = new Date('2026-11-30T00:00:00Z');

describe('parseICS — non-calendar response', () => {
    it('throws a clear error instead of silently returning nothing', () => {
        const html = loadFixture('not-a-calendar.html');
        expect(() => parseICS(html, 'cal1', WINDOW_START, WINDOW_END)).toThrow(/not an iCalendar/i);
    });
});

describe('parseICS — single event', () => {
    it('parses a plain non-recurring event with the right time and busy status', () => {
        const events = parseICS(loadFixture('single-event.ics'), 'main', WINDOW_START, WINDOW_END);
        expect(events).toHaveLength(1);
        const [event] = events;
        expect(event.calendarId).toBe('main');
        expect(event.title).toBe('Example planning session');
        expect(event.start.toISOString()).toBe('2026-11-03T14:00:00.000Z');
        expect(event.end.toISOString()).toBe('2026-11-03T15:00:00.000Z');
        expect(event.allDay).toBe(false);
        expect(event.busyStatus).toBe('busy');
    });
});

describe('parseICS — recurring event with EXDATE and a moved occurrence', () => {
    it('expands the series correctly across the BST->GMT changeover, honouring the exclusion and the override', () => {
        const events = parseICS(
            loadFixture('recurring-with-exception.ics'),
            'main',
            new Date('2026-10-15T00:00:00Z'),
            new Date('2026-11-16T00:00:00Z'),
        );

        // 19 Oct (BST), 26 Oct (GMT) — 2 Nov is excluded, 9 Nov is moved.
        expect(events.map(e => e.start.toISOString())).toEqual([
            '2026-10-19T08:00:00.000Z', // 09:00 BST
            '2026-10-26T09:00:00.000Z', // 09:00 GMT — clocks have gone back
            '2026-11-09T10:00:00.000Z', // moved occurrence, 10:00 GMT
        ]);

        expect(events[0].title).toBe('Example weekly stand-up');
        expect(events[0].uid).toBe('recurring-standup-fixture-001::2026-10-19T08:00:00.000Z');

        const moved = events[2];
        expect(moved.title).toBe('Example weekly stand-up (moved)');
        expect(moved.end.toISOString()).toBe('2026-11-09T10:15:00.000Z');
        expect(moved.uid).toBe('recurring-standup-fixture-001::2026-11-09T09:00:00.000Z');

        // The excluded 2 Nov occurrence must not appear at all.
        expect(events.some(e => e.start.toISOString().startsWith('2026-11-02'))).toBe(false);
    });
});

describe('parseICS — all-day event', () => {
    it('is flagged allDay and spans local midnight to midnight regardless of host timezone', () => {
        const events = parseICS(loadFixture('all-day.ics'), 'main', WINDOW_START, WINDOW_END);
        expect(events).toHaveLength(1);
        const [event] = events;
        expect(event.allDay).toBe(true);
        expect(event.start.toISOString()).toBe('2026-11-06T00:00:00.000Z'); // GMT, no DST offset
        expect(event.end.toISOString()).toBe('2026-11-07T00:00:00.000Z');
        expect(event.busyStatus).toBe('oof');
    });
});

describe('parseICS — cancelled events', () => {
    it('excludes a standalone cancelled event and a cancelled occurrence of a recurring series, keeping the rest of the series', () => {
        const events = parseICS(
            loadFixture('cancelled.ics'),
            'main',
            new Date('2026-10-25T00:00:00Z'),
            new Date('2026-11-20T00:00:00Z'),
        );

        expect(events.every(e => e.uid.startsWith('recurring-with-cancelled-occurrence-fixture-002'))).toBe(true);
        expect(events.map(e => e.start.toISOString())).toEqual([
            '2026-11-01T09:00:00.000Z',
            '2026-11-15T09:00:00.000Z',
        ]);
    });
});

describe('parseICS — busy status resolution', () => {
    it('reads X-MICROSOFT-CDO-BUSYSTATUS values and falls back to TRANSP, then unknown', () => {
        const events = parseICS(loadFixture('busy-status-variants.ics'), 'main', WINDOW_START, WINDOW_END);
        const byUid = Object.fromEntries(events.map(e => [e.uid, e.busyStatus]));

        expect(byUid['busy-status-free-001']).toBe('free');
        expect(byUid['busy-status-tentative-002']).toBe('tentative');
        expect(byUid['busy-status-oof-003']).toBe('oof');
        expect(byUid['busy-status-workingelsewhere-004']).toBe('working_elsewhere');
        expect(byUid['transp-fallback-opaque-005']).toBe('busy');
        expect(byUid['transp-fallback-transparent-006']).toBe('free');
        expect(byUid['no-status-at-all-007']).toBe('unknown');
    });
});

describe('parseICS — window filtering', () => {
    it('excludes events entirely outside the requested window', () => {
        const events = parseICS(
            loadFixture('single-event.ics'),
            'main',
            new Date('2026-11-04T00:00:00Z'),
            new Date('2026-11-05T00:00:00Z'),
        );
        expect(events).toHaveLength(0);
    });

    it('includes an event that only partially overlaps the window', () => {
        const events = parseICS(
            loadFixture('single-event.ics'),
            'main',
            new Date('2026-11-03T14:30:00Z'),
            new Date('2026-11-05T00:00:00Z'),
        );
        expect(events).toHaveLength(1);
    });
});
