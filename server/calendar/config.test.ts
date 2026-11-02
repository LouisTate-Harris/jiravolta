import { describe, it, expect } from 'vitest';
import { loadCalendarConfigs } from './config';

describe('loadCalendarConfigs', () => {
    it('reads one calendar per ICS_CALENDAR_<NAME> var, deriving id and label from the name', () => {
        const configs = loadCalendarConfigs({
            ICS_CALENDAR_MAIN: 'op://vault/item-a/url',
            ICS_CALENDAR_WORK_PLAN: 'op://vault/item-b/url',
            NOT_RELEVANT: 'ignored',
            JIRA_BASE_URL: 'https://example-tenant.invalid',
        });

        expect(configs).toEqual([
            { id: 'main', label: 'Main', url: 'op://vault/item-a/url' },
            { id: 'work_plan', label: 'Work Plan', url: 'op://vault/item-b/url' },
        ]);
    });

    it('ignores calendar vars with an empty value', () => {
        expect(loadCalendarConfigs({ ICS_CALENDAR_MAIN: '' })).toEqual([]);
    });

    it('returns an empty list when no calendar vars are set', () => {
        expect(loadCalendarConfigs({ JIRA_BASE_URL: 'https://example-tenant.invalid' })).toEqual([]);
    });
});
