import { describe, it, expect } from 'vitest';
import { buildIssuePickerOptions } from './issuePickerOptions';
import type { PoolIssue } from '../../services/jiraService';
import type { TicketEntry } from '../../utils/ticketListStorage';

describe('buildIssuePickerOptions', () => {
    it('lists ticket-list entries first, under the Ticket list group', () => {
        const ticketList: TicketEntry[] = [{ key: 'ABC-1', alias: 'My alias' }];
        const options = buildIssuePickerOptions([], ticketList);
        expect(options).toEqual([{ key: 'ABC-1', summary: 'My alias', group: 'Ticket list' }]);
    });

    it('falls back to the key when a ticket-list entry has no alias', () => {
        const options = buildIssuePickerOptions([], [{ key: 'ABC-1' }]);
        expect(options[0].summary).toBe('ABC-1');
    });

    it('tags a pool issue with Sprint when it is in the sprint', () => {
        const pool: PoolIssue[] = [{ key: 'ABC-2', summary: 'Sprint issue', sources: ['sprint'] }];
        expect(buildIssuePickerOptions(pool, [])).toEqual([{ key: 'ABC-2', summary: 'Sprint issue', group: 'Sprint' }]);
    });

    it('prefers Sprint over Saved filter or Assigned when an issue is in more than one', () => {
        const pool: PoolIssue[] = [{ key: 'ABC-3', summary: 'Both', sources: ['assigned', 'filter', 'sprint'] }];
        expect(buildIssuePickerOptions(pool, [])[0].group).toBe('Sprint');
    });

    it('does not duplicate an issue that is both in the ticket list and the pool', () => {
        const pool: PoolIssue[] = [{ key: 'ABC-1', summary: 'Pool summary', sources: ['sprint'] }];
        const ticketList: TicketEntry[] = [{ key: 'ABC-1', alias: 'My alias' }];
        const options = buildIssuePickerOptions(pool, ticketList);
        expect(options).toHaveLength(1);
        expect(options[0]).toEqual({ key: 'ABC-1', summary: 'Pool summary', group: 'Ticket list' });
    });

    it('offers only sprint and filter issues when either is configured', () => {
        const pool: PoolIssue[] = [
            { key: 'IN-1', summary: 'On the board', sources: ['sprint'] },
            { key: 'IN-2', summary: 'In the filter', sources: ['filter', 'assigned'] },
            { key: 'OUT-1', summary: 'Only assigned to me', sources: ['assigned'] },
        ];
        const ticketList: TicketEntry[] = [{ key: 'OUT-2', alias: 'Elsewhere' }, { key: 'IN-1' }];
        expect(buildIssuePickerOptions(pool, ticketList).map(o => o.key)).toEqual(['IN-1', 'IN-2']);
    });

    it('offers everything when neither a board nor a filter is configured', () => {
        const pool: PoolIssue[] = [{ key: 'ABC-9', summary: 'Mine', sources: ['assigned'] }];
        expect(buildIssuePickerOptions(pool, []).map(o => o.key)).toEqual(['ABC-9']);
    });
});
