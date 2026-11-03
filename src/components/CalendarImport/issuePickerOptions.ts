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
 * Only issues from the board's sprint or the saved filter are offered, so
 * proposals never stray onto tickets from elsewhere ("assigned to me" can
 * pull in unrelated projects). If the pool has no sprint/filter issues at all
 * (neither is configured), everything is offered rather than nothing.
 *
 * Your ticket list still comes first, but only for tickets that are in scope.
 * Their summary is Jira's rather than your alias, because matching works on
 * what the ticket is about.
 */
export function buildIssuePickerOptions(pool: PoolIssue[], ticketList: TicketEntry[]): IssuePickerOption[] {
    const inScope = (issue: PoolIssue) => issue.sources.includes('sprint') || issue.sources.includes('filter');
    const restrict = pool.some(inScope);
    const allowed = restrict ? pool.filter(inScope) : pool;
    const byKey = new Map(allowed.map(i => [i.key, i]));

    const seen = new Set<string>();
    const options: IssuePickerOption[] = [];

    for (const entry of ticketList) {
        if (restrict && !byKey.has(entry.key)) continue;
        seen.add(entry.key);
        options.push({ key: entry.key, summary: byKey.get(entry.key)?.summary ?? entry.alias ?? entry.key, group: 'Ticket list' });
    }

    for (const issue of allowed) {
        if (seen.has(issue.key)) continue;
        seen.add(issue.key);
        const matched = GROUP_BY_SOURCE.find(g => issue.sources.includes(g.source));
        options.push({ key: issue.key, summary: issue.summary, group: matched?.label ?? 'Assigned to me' });
    }

    return options;
}
