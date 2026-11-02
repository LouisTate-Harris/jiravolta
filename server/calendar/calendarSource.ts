/**
 * Calendar source interface.
 *
 * This is the seam between "where calendar data comes from" and the rest of
 * the app. The ICS implementation lives behind it; a Microsoft Graph
 * (/me/calendarView) implementation can replace or sit alongside it later
 * without the UI or matching code changing.
 */

export type BusyStatus = 'free' | 'tentative' | 'busy' | 'oof' | 'working_elsewhere' | 'unknown';

export interface CalendarEvent {
    /** UID + RECURRENCE-ID/occurrence start, unique per occurrence. */
    uid: string;
    /** Which configured calendar this event came from. */
    calendarId: string;
    start: Date;
    end: Date;
    allDay: boolean;
    busyStatus: BusyStatus;
    /** Only populated when the feed exposes more than busy/free. */
    title?: string;
}

export interface CalendarSource {
    readonly id: string;
    readonly label: string;
    getEvents(start: Date, end: Date): Promise<CalendarEvent[]>;
}
