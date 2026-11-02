import ical from 'node-ical';
import type { CalendarEvent, BusyStatus } from './calendarSource';

/**
 * node-ical resolves `DTSTART;VALUE=DATE` (all-day) boundaries using the
 * Node process's own local timezone, not a timezone it was told to use.
 * Pinning it here makes all-day events (and nothing else — recurrence
 * expansion already carries its own IANA tzid) correct regardless of what
 * timezone the host running this server happens to be in. Side effect is
 * intentional and confined to this module, which is the only one that calls
 * into node-ical.
 */
process.env.TZ = 'Europe/London';

const BUSY_STATUS_MAP: Record<string, BusyStatus> = {
    FREE: 'free',
    TENTATIVE: 'tentative',
    BUSY: 'busy',
    OOF: 'oof',
    WORKINGELSEWHERE: 'working_elsewhere',
};

// node-ical strips the "X-" prefix from X-MICROSOFT-CDO-BUSYSTATUS.
function resolveBusyStatus(raw: Record<string, unknown>): BusyStatus {
    const cdo = raw['MICROSOFT-CDO-BUSYSTATUS'] ?? raw['X-MICROSOFT-CDO-BUSYSTATUS'];
    if (typeof cdo === 'string') {
        const mapped = BUSY_STATUS_MAP[cdo.toUpperCase()];
        if (mapped) return mapped;
    }

    const transp = raw.transparency ?? raw.TRANSP;
    if (typeof transp === 'string') {
        const upper = transp.toUpperCase();
        if (upper === 'OPAQUE') return 'busy';
        if (upper === 'TRANSPARENT') return 'free';
    }

    return 'unknown';
}

function isCancelled(raw: Record<string, unknown>): boolean {
    return typeof raw.status === 'string' && raw.status.toUpperCase() === 'CANCELLED';
}

function readTitle(raw: Record<string, unknown>): string | undefined {
    return typeof raw.summary === 'string' && raw.summary.trim() ? raw.summary.trim() : undefined;
}

interface NodeIcalEvent {
    type: string;
    uid: string;
    start: Date & { dateOnly?: boolean };
    end: Date & { dateOnly?: boolean };
    datetype?: string;
    summary?: string;
    status?: string;
    recurrenceid?: Date;
    rrule?: { between(after: Date, before: Date, inclusive: boolean): Date[] };
    exdate?: Record<string, Date>;
    recurrences?: Record<string, NodeIcalEvent>;
    [key: string]: unknown;
}

function toCalendarEvent(
    source: NodeIcalEvent,
    calendarId: string,
    overrideUid?: string,
): CalendarEvent {
    return {
        uid: overrideUid ?? source.uid,
        calendarId,
        title: readTitle(source),
        start: source.start,
        end: source.end,
        allDay: source.datetype === 'date' || source.start.dateOnly === true,
        busyStatus: resolveBusyStatus(source),
    };
}

/**
 * Parse a raw ICS feed body into CalendarEvents overlapping [windowStart, windowEnd).
 * Expands RRULE recurrences, applies EXDATE exclusions and RECURRENCE-ID
 * overrides (including per-occurrence cancellation), and excludes
 * STATUS:CANCELLED events. Throws if the body doesn't look like an
 * iCalendar feed rather than silently returning nothing.
 */
export function parseICS(
    icsText: string,
    calendarId: string,
    windowStart: Date,
    windowEnd: Date,
): CalendarEvent[] {
    if (!icsText.trimStart().startsWith('BEGIN:VCALENDAR')) {
        throw new Error('Calendar feed response was not an iCalendar body');
    }

    const parsed = ical.parseICS(icsText) as Record<string, NodeIcalEvent>;
    const events: CalendarEvent[] = [];

    // Expand recurrences a day wider than the requested window so an override
    // that shifts an occurrence near the edge isn't lost, then filter the
    // final (possibly overridden) instances against the real window below.
    const searchStart = new Date(windowStart.getTime() - 24 * 60 * 60 * 1000);
    const searchEnd = new Date(windowEnd.getTime() + 24 * 60 * 60 * 1000);

    for (const component of Object.values(parsed)) {
        if (!component || component.type !== 'VEVENT') continue;
        // Standalone override components are reached via their master's
        // `recurrences` map below, not processed again here.
        if (component.recurrenceid) continue;

        if (component.rrule) {
            if (isCancelled(component)) continue; // whole series cancelled

            const overridesByTime = new Map<number, NodeIcalEvent>();
            for (const override of Object.values(component.recurrences ?? {})) {
                if (override.recurrenceid) {
                    overridesByTime.set(override.recurrenceid.getTime(), override);
                }
            }
            const exdateTimes = new Set<number>(
                Object.values(component.exdate ?? {}).map(d => d.getTime()),
            );

            const baseDurationMs = component.end.getTime() - component.start.getTime();
            const occurrenceTimes = new Set<number>(
                component.rrule.between(searchStart, searchEnd, true).map(d => d.getTime()),
            );
            // Make sure an override is considered even if its RECURRENCE-ID
            // falls just outside what the rrule library itself enumerated.
            for (const time of overridesByTime.keys()) occurrenceTimes.add(time);

            for (const time of occurrenceTimes) {
                const override = overridesByTime.get(time);
                if (override) {
                    if (isCancelled(override)) continue;
                    events.push(
                        toCalendarEvent(override, calendarId, `${component.uid}::${override.recurrenceid!.toISOString()}`),
                    );
                    continue;
                }
                if (exdateTimes.has(time)) continue;

                const start = new Date(time);
                const end = new Date(time + baseDurationMs);
                events.push({
                    uid: `${component.uid}::${start.toISOString()}`,
                    calendarId,
                    title: readTitle(component),
                    start,
                    end,
                    allDay: component.datetype === 'date',
                    busyStatus: resolveBusyStatus(component),
                });
            }
            continue;
        }

        if (isCancelled(component)) continue;
        events.push(toCalendarEvent(component, calendarId));
    }

    return events
        .filter(e => e.end > windowStart && e.start < windowEnd)
        .sort((a, b) => a.start.getTime() - b.start.getTime());
}
