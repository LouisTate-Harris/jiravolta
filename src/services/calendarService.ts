/**
 * Client for the calendar-import local endpoints (see vite.config.ts and
 * server/calendar/). Mirrors jiraService.ts's conventions: a cached config
 * check, logged calls, never-throw-on-missing-config where that matches how
 * the app already treats an unconfigured Jira.
 */

import { formatDate } from '../utils/dateUtils';

export interface CalendarInfo {
    id: string;
    label: string;
}

export type BusyStatus = 'free' | 'tentative' | 'busy' | 'oof' | 'working_elsewhere' | 'unknown';

export interface CalendarEventDto {
    uid: string;
    calendarId: string;
    title: string | null;
    start: string;
    end: string;
    allDay: boolean;
    busyStatus: BusyStatus;
}

export interface CalendarFailure {
    id: string;
    label: string;
    error: string;
}

export interface CalendarEventsResponse {
    events: CalendarEventDto[];
    failed: CalendarFailure[];
}

const SOURCES_ENDPOINT = '/_local/calendar-sources';
const EVENTS_ENDPOINT = '/_local/calendar-events';

let _sourcesCache: CalendarInfo[] | null = null;

/**
 * Fetches the configured calendar list once and caches it. An empty list
 * means no ICS_CALENDAR_* vars are set, which the UI treats the same way it
 * treats Jira being unconfigured: the feature just doesn't offer itself.
 */
export async function fetchCalendarSources(): Promise<CalendarInfo[]> {
    if (_sourcesCache) return _sourcesCache;
    try {
        const response = await fetch(SOURCES_ENDPOINT);
        const data = await response.json() as { calendars: CalendarInfo[] };
        _sourcesCache = data.calendars ?? [];
    } catch (error) {
        console.error('[CALENDAR API] Failed to fetch calendar sources', error);
        _sourcesCache = [];
    }
    return _sourcesCache;
}

export function isCalendarImportConfigured(): boolean {
    return (_sourcesCache?.length ?? 0) > 0;
}

export async function fetchCalendarEvents(weekStart: Date, weekEnd: Date): Promise<CalendarEventsResponse> {
    const week = formatDate(weekStart);
    const weekEndKey = formatDate(weekEnd);

    console.log('[CALENDAR API] Fetching merged events', { week, weekEndKey });

    const response = await fetch(`${EVENTS_ENDPOINT}?week=${week}&weekEnd=${weekEndKey}`);
    if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Calendar events fetch failed: ${response.status} ${errorText}`);
    }

    const data = await response.json() as CalendarEventsResponse;
    console.log('[CALENDAR API] Events loaded', { count: data.events.length, failed: data.failed.map(f => f.label) });
    return data;
}
