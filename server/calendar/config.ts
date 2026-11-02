export interface CalendarConfig {
    id: string;
    label: string;
    url: string;
}

const ENV_PREFIX = 'ICS_CALENDAR_';

function titleCaseWord(word: string): string {
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/**
 * Reads one calendar per ICS_CALENDAR_<NAME> env var. <NAME> becomes both the
 * calendar's id (lowercased) and its display label (underscores become
 * spaces, each word title-cased) — e.g. ICS_CALENDAR_WORK_PLAN -> id
 * "work_plan", label "Work Plan". Order is alphabetical by id for a stable,
 * predictable calendar list in the UI.
 */
export function loadCalendarConfigs(env: Record<string, string | undefined>): CalendarConfig[] {
    const configs: CalendarConfig[] = [];

    for (const [key, value] of Object.entries(env)) {
        if (!key.startsWith(ENV_PREFIX) || !value) continue;
        const suffix = key.slice(ENV_PREFIX.length);
        if (!suffix) continue;

        configs.push({
            id: suffix.toLowerCase(),
            label: suffix.split('_').filter(Boolean).map(titleCaseWord).join(' '),
            url: value,
        });
    }

    return configs.sort((a, b) => a.id.localeCompare(b.id));
}
