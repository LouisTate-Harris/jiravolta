/**
 * The ICS feed URL is a bearer secret (anyone holding it can read the
 * calendar with no further auth), so it must never reach a log, an error
 * message, or an exception. This is the one place that strips it, used by
 * every calendar module that might otherwise let a URL leak via an
 * underlying library's own error text.
 */
export function redactUrls(message: string): string {
    return message.replace(/https?:\/\/\S+/gi, '[redacted]');
}
