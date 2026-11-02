import type { PoolIssue, IssuePoolSource } from '../../services/jiraService';
import type { TicketEntry } from '../../utils/ticketListStorage';

export type IssuePickerGroup = 'Ticket list' | 'Sprint' | 'Saved filter' | 'Assigned to me';

export interface IssuePickerOption {
    key: string;
    summary: string;
    group: IssuePickerGroup;
}

const GROUP_BY_SOURCE: Array<{ source: IssuePoolSource; label: IssuePickerGroup }> = [
    { source: 'sprint', label: 'Sprint' },
    { source: 'filter', label: 'Saved filter' },
    { source: 'assigned', label: 'Assigned to me' },
];

/**
 * Your ticket list always wins (it's what you've deliberately curated), then
 * the issue pool fills in the rest, each tagged with whichever of
 * sprint/filter/assigned it's most specifically drawn from. An issue in both
 * only appears once, under 'Ticket list'.
 */
export function buildIssuePickerOptions(pool: PoolIssue[], ticketList: TicketEntry[]): IssuePickerOption[] {
    const seen = new Set<string>();
    const options: IssuePickerOption[] = [];

    for (const entry of ticketList) {
        seen.add(entry.key);
        options.push({ key: entry.key, summary: entry.alias ?? entry.key, group: 'Ticket list' });
    }

    for (const issue of pool) {
        if (seen.has(issue.key)) continue;
        seen.add(issue.key);
        const matched = GROUP_BY_SOURCE.find(g => issue.sources.includes(g.source));
        options.push({ key: issue.key, summary: issue.summary, group: matched?.label ?? 'Assigned to me' });
    }

    return options;
}
