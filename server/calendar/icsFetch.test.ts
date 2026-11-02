import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchIcs } from './icsFetch';

const SENTINEL_URL = 'https://example-tenant.invalid/secret-path/9f8a7b6c5d4e3f2a1b0c?token=super-secret-value';

function jsonHeaders(extra: Record<string, string> = {}): Headers {
    return new Headers({ 'content-type': 'text/calendar', ...extra });
}

describe('fetchIcs', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('returns the body on a successful fetch', async () => {
        const body = 'BEGIN:VCALENDAR\nEND:VCALENDAR';
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            status: 200,
            ok: true,
            headers: jsonHeaders({ etag: 'abc123' }),
            text: () => Promise.resolve(body),
        }));

        const result = await fetchIcs(SENTINEL_URL);
        expect(result).toEqual({ status: 'ok', body, etag: 'abc123' });
    });

    it('returns not-modified on HTTP 304 without requiring a body', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 304, ok: false, headers: jsonHeaders() }));
        const result = await fetchIcs(SENTINEL_URL, { etag: 'abc123' });
        expect(result).toEqual({ status: 'not-modified' });
    });

    it('sends If-None-Match when an etag is supplied', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            status: 200, ok: true, headers: jsonHeaders(), text: () => Promise.resolve('BEGIN:VCALENDAR\nEND:VCALENDAR'),
        });
        vi.stubGlobal('fetch', fetchMock);

        await fetchIcs(SENTINEL_URL, { etag: 'abc123' });
        expect(fetchMock).toHaveBeenCalledWith(SENTINEL_URL, expect.objectContaining({
            headers: { 'If-None-Match': 'abc123' },
        }));
    });

    it('retries on failure and succeeds once a later attempt works', async () => {
        const fetchMock = vi.fn()
            .mockRejectedValueOnce(new Error('network blip'))
            .mockResolvedValueOnce({ status: 200, ok: true, headers: jsonHeaders(), text: () => Promise.resolve('BEGIN:VCALENDAR\nEND:VCALENDAR') });
        vi.stubGlobal('fetch', fetchMock);

        const promise = fetchIcs(SENTINEL_URL, { retries: 2 });
        await vi.runAllTimersAsync();
        const result = await promise;

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(result.status).toBe('ok');
    });

    it('gives up after exhausting retries and throws', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('still broken')));

        const promise = fetchIcs(SENTINEL_URL, { retries: 1 });
        const expectation = expect(promise).rejects.toThrow();
        await vi.runAllTimersAsync();
        await expectation;
    });

    it('rejects a non-calendar response body with a clear error', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            status: 200, ok: true, headers: jsonHeaders(), text: () => Promise.resolve('<html>not a calendar</html>'),
        }));

        await expect(fetchIcs(SENTINEL_URL, { retries: 0 })).rejects.toThrow(/not a calendar feed/i);
    });

    it('never includes the URL in a thrown error, even when the underlying error message contains it', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error(`fetch failed: could not reach ${SENTINEL_URL}`)));

        const promise = fetchIcs(SENTINEL_URL, { retries: 0 });
        let caught: Error | undefined;
        try {
            await promise;
        } catch (err) {
            caught = err as Error;
        }

        expect(caught).toBeDefined();
        expect(caught!.message).not.toContain(SENTINEL_URL);
        expect(caught!.message).not.toContain('super-secret-value');
        expect(caught!.message).toContain('[redacted]');
    });

    it('aborts via the timeout and does not leak the URL in that failure either', async () => {
        vi.stubGlobal('fetch', vi.fn().mockImplementation((_url: string, init: { signal: AbortSignal }) => {
            return new Promise((_resolve, reject) => {
                init.signal.addEventListener('abort', () => reject(new Error('This operation was aborted')));
            });
        }));

        const promise = fetchIcs(SENTINEL_URL, { timeoutMs: 1000, retries: 0 });
        const expectation = expect(promise).rejects.toThrow();
        await vi.advanceTimersByTimeAsync(1000);
        await expectation;
    });
});
