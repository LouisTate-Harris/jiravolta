import { describe, it, expect } from 'vitest';
import { redactUrls } from './redact';

describe('redactUrls', () => {
    it('strips a URL embedded anywhere in a message', () => {
        const sentinel = 'https://example-tenant.invalid/secret-path?token=super-secret-value';
        const message = `ICS fetch failed: could not reach ${sentinel} (ECONNRESET)`;
        const redacted = redactUrls(message);
        expect(redacted).not.toContain(sentinel);
        expect(redacted).not.toContain('super-secret-value');
        expect(redacted).toBe('ICS fetch failed: could not reach [redacted] (ECONNRESET)');
    });

    it('leaves a message with no URL unchanged', () => {
        expect(redactUrls('ICS fetch failed: HTTP 503')).toBe('ICS fetch failed: HTTP 503');
    });

    it('redacts multiple URLs in the same message', () => {
        const redacted = redactUrls('tried https://one.invalid/a then https://two.invalid/b');
        expect(redacted).toBe('tried [redacted] then [redacted]');
    });
});
