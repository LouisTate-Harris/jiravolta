import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IcsCalendarSource } from './icsCalendarSource';

const { fetchIcsMock } = vi.hoisted(() => ({ fetchIcsMock: vi.fn() }));
vi.mock('./icsFetch', () => ({ fetchIcs: fetchIcsMock }));

const CALENDAR_BODY = 'BEGIN:VCALENDAR\nEND:VCALENDAR';
const SENTINEL_URL = 'https://example-tenant.invalid/secret-path?token=super-secret-value';
const start = new Date('2026-11-01T00:00:00Z');
const end = new Date('2026-11-08T00:00:00Z');

describe('IcsCalendarSource', () => {
    beforeEach(() => {
        fetchIcsMock.mockReset();
    });

    it('fetches once and serves the cache for subsequent calls within the TTL', async () => {
        fetchIcsMock.mockResolvedValue({ status: 'ok', body: CALENDAR_BODY, etag: 'v1' });
        const source = new IcsCalendarSource({ id: 'main', label: 'Main', url: SENTINEL_URL, cacheTtlMs: 60_000 });

        await source.getEvents(start, end);
        await source.getEvents(start, end);

        expect(fetchIcsMock).toHaveBeenCalledTimes(1);
    });

    it('refetches once the cache TTL has elapsed, sending the previous etag', async () => {
        fetchIcsMock.mockResolvedValue({ status: 'ok', body: CALENDAR_BODY, etag: 'v1' });
        const source = new IcsCalendarSource({ id: 'main', label: 'Main', url: SENTINEL_URL, cacheTtlMs: 1 });

        await source.getEvents(start, end);
        await new Promise(resolve => setTimeout(resolve, 5));
        await source.getEvents(start, end);

        expect(fetchIcsMock).toHaveBeenCalledTimes(2);
        expect(fetchIcsMock).toHaveBeenLastCalledWith(SENTINEL_URL, { etag: 'v1' });
    });

    it('serves the last good body on a 304 not-modified response', async () => {
        fetchIcsMock
            .mockResolvedValueOnce({ status: 'ok', body: CALENDAR_BODY, etag: 'v1' })
            .mockResolvedValueOnce({ status: 'not-modified' });
        const source = new IcsCalendarSource({ id: 'main', label: 'Main', url: SENTINEL_URL, cacheTtlMs: 1 });

        await source.getEvents(start, end);
        await new Promise(resolve => setTimeout(resolve, 5));
        const events = await source.getEvents(start, end);

        expect(events).toEqual([]); // empty but valid calendar body, parsed successfully
        expect(fetchIcsMock).toHaveBeenCalledTimes(2);
    });

    it('falls back to the last good data when a later fetch fails, without throwing', async () => {
        fetchIcsMock
            .mockResolvedValueOnce({ status: 'ok', body: CALENDAR_BODY, etag: 'v1' })
            .mockRejectedValueOnce(new Error('ICS fetch failed: HTTP 503'));
        const source = new IcsCalendarSource({ id: 'main', label: 'Main', url: SENTINEL_URL, cacheTtlMs: 1 });

        await source.getEvents(start, end);
        await new Promise(resolve => setTimeout(resolve, 5));
        await expect(source.getEvents(start, end)).resolves.toEqual([]);
    });

    it('throws when there is no cache to fall back to', async () => {
        fetchIcsMock.mockRejectedValue(new Error('ICS fetch failed: HTTP 503'));
        const source = new IcsCalendarSource({ id: 'main', label: 'Main', url: SENTINEL_URL });

        await expect(source.getEvents(start, end)).rejects.toThrow(/HTTP 503/);
    });
});
