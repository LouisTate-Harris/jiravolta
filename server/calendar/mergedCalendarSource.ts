import type { CalendarSource, CalendarEvent } from './calendarSource';

export interface MergedEventsResult {
    events: CalendarEvent[];
    /** Calendars whose source failed outright (no cached data to fall back to). */
    failed: Array<{ id: string; label: string; error: string }>;
}

/**
 * Combines several calendar sources into one week's worth of events. A
 * single calendar failing (feed unreachable, no cache yet) doesn't take the
 * others down with it — its id/label/error is reported in `failed` instead.
 */
export class MergedCalendarSource {
    private readonly sources: CalendarSource[];

    constructor(sources: CalendarSource[]) {
        this.sources = sources;
    }

    get calendars(): Array<{ id: string; label: string }> {
        return this.sources.map(s => ({ id: s.id, label: s.label }));
    }

    async getEvents(start: Date, end: Date): Promise<MergedEventsResult> {
        const results = await Promise.allSettled(this.sources.map(s => s.getEvents(start, end)));

        const events: CalendarEvent[] = [];
        const failed: MergedEventsResult['failed'] = [];

        results.forEach((result, index) => {
            const source = this.sources[index];
            if (result.status === 'fulfilled') {
                events.push(...result.value);
            } else {
                failed.push({
                    id: source.id,
                    label: source.label,
                    error: result.reason instanceof Error ? result.reason.message : 'Fetch failed',
                });
            }
        });

        events.sort((a, b) => a.start.getTime() - b.start.getTime());
        return { events, failed };
    }
}
