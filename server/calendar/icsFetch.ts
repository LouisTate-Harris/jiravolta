import { redactUrls } from './redact';

export interface FetchIcsResult {
    status: 'ok' | 'not-modified';
    body?: string;
    etag?: string;
}

export interface FetchIcsOptions {
    etag?: string;
    timeoutMs?: number;
    retries?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000; // the Main calendar has been observed taking ~20-30s
const DEFAULT_RETRIES = 2;

/**
 * Fetch an ICS feed with a timeout, limited retries with backoff, and
 * conditional-GET support via ETag. Never includes the URL (or anything an
 * underlying error might have embedded) in what it throws — callers may log
 * or display the thrown message directly.
 */
export async function fetchIcs(url: string, options: FetchIcsOptions = {}): Promise<FetchIcsResult> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxRetries = options.retries ?? DEFAULT_RETRIES;
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const headers: Record<string, string> = {};
            if (options.etag) headers['If-None-Match'] = options.etag;

            const response = await fetch(url, { signal: controller.signal, headers });
            clearTimeout(timer);

            if (response.status === 304) {
                return { status: 'not-modified' };
            }
            if (!response.ok) {
                throw new Error(`ICS fetch failed: HTTP ${response.status}`);
            }

            const body = await response.text();
            if (!body.trimStart().startsWith('BEGIN:VCALENDAR')) {
                throw new Error('ICS fetch failed: response was not a calendar feed');
            }

            return { status: 'ok', body, etag: response.headers.get('etag') ?? undefined };
        } catch (err) {
            clearTimeout(timer);
            lastError = err;
            if (attempt < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt));
                continue;
            }
        }
    }

    const rawMessage = lastError instanceof Error ? lastError.message : 'ICS fetch failed';
    throw new Error(redactUrls(rawMessage));
}
