import { describe, it, expect } from 'vitest';
import { MergedCalendarSource } from './mergedCalendarSource';
import type { CalendarSource, CalendarEvent } from './calendarSource';

function fakeSource(id: string, label: string, behaviour: 'ok' | 'fail', events: CalendarEvent[] = []): CalendarSource {
    return {
        id,
        label,
        getEvents: async () => {
            if (behaviour === 'fail') throw new Error(`${label} feed unreachable`);
            return events;
        },
    };
}

function makeEvent(uid: string, calendarId: string, startIso: string): CalendarEvent {
    return {
        uid,
        calendarId,
        title: uid,
        start: new Date(startIso),
        end: new Date(new Date(startIso).getTime() + 30 * 60 * 1000),
        allDay: false,
        busyStatus: 'busy',
    };
}

describe('MergedCalendarSource', () => {
    it('merges and time-sorts events from multiple calendars', async () => {
        const main = fakeSource('main', 'Main', 'ok', [makeEvent('m1', 'main', '2026-11-03T10:00:00Z')]);
        const work = fakeSource('work_plan', 'Work Plan', 'ok', [makeEvent('w1', 'work_plan', '2026-11-03T09:00:00Z')]);
        const merged = new MergedCalendarSource([main, work]);

        const result = await merged.getEvents(new Date('2026-11-01T00:00:00Z'), new Date('2026-11-08T00:00:00Z'));

        expect(result.failed).toEqual([]);
        expect(result.events.map(e => e.uid)).toEqual(['w1', 'm1']); // sorted by start time
    });

    it('reports a failed calendar without losing events from the others', async () => {
        const main = fakeSource('main', 'Main', 'ok', [makeEvent('m1', 'main', '2026-11-03T10:00:00Z')]);
        const work = fakeSource('work_plan', 'Work Plan', 'fail');
        const merged = new MergedCalendarSource([main, work]);

        const result = await merged.getEvents(new Date('2026-11-01T00:00:00Z'), new Date('2026-11-08T00:00:00Z'));

        expect(result.events.map(e => e.uid)).toEqual(['m1']);
        expect(result.failed).toEqual([{ id: 'work_plan', label: 'Work Plan', error: 'Work Plan feed unreachable' }]);
    });

    it('exposes the configured calendar list', () => {
        const merged = new MergedCalendarSource([
            fakeSource('main', 'Main', 'ok'),
            fakeSource('work_plan', 'Work Plan', 'ok'),
        ]);
        expect(merged.calendars).toEqual([
            { id: 'main', label: 'Main' },
            { id: 'work_plan', label: 'Work Plan' },
        ]);
    });
});
