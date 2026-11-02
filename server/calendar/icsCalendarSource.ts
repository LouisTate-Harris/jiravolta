import { fetchIcs } from './icsFetch';
import { parseICS } from './icsParser';
import type { CalendarSource, CalendarEvent } from './calendarSource';

const CACHE_TTL_MS = 15 * 60 * 1000; // per the handoff: don't poll Outlook's feed more often than this

interface CacheEntry {
    body: string;
    etag?: string;
    fetchedAt: number;
}

export interface IcsCalendarSourceOptions {
    id: string;
    label: string;
    url: string;
    /** Overridable for tests; defaults to CACHE_TTL_MS. */
    cacheTtlMs?: number;
}

/**
 * A CalendarSource backed by a published Outlook ICS feed. Caches the raw
 * body in memory for `cacheTtlMs`, and on a fetch/parse failure falls back to
 * the last good body rather than breaking the app, surfacing a redacted
 * error only when there is no cached data to fall back to.
 */
export class IcsCalendarSource implements CalendarSource {
    readonly id: string;
    readonly label: string;
    private readonly url: string;
    private readonly cacheTtlMs: number;
    private cache: CacheEntry | null = null;

    constructor(options: IcsCalendarSourceOptions) {
        this.id = options.id;
        this.label = options.label;
        this.url = options.url;
        this.cacheTtlMs = options.cacheTtlMs ?? CACHE_TTL_MS;
    }

    async getEvents(start: Date, end: Date): Promise<CalendarEvent[]> {
        const body = await this.getBody();
        return parseICS(body, this.id, start, end);
    }

    private async getBody(): Promise<string> {
        const now = Date.now();
        if (this.cache && now - this.cache.fetchedAt < this.cacheTtlMs) {
            return this.cache.body;
        }

        try {
            const result = await fetchIcs(this.url, { etag: this.cache?.etag });

            if (result.status === 'not-modified' && this.cache) {
                this.cache = { ...this.cache, fetchedAt: now };
                return this.cache.body;
            }
            if (result.status === 'ok' && result.body) {
                this.cache = { body: result.body, etag: result.etag, fetchedAt: now };
                return result.body;
            }

            throw new Error('ICS fetch returned no usable data');
        } catch (err) {
            if (this.cache) {
                return this.cache.body;
            }
            throw err;
        }
    }
}
