/**
 * Merges three sources of Jira issues into one pool for the calendar-import
 * ticket picker: the active sprint of a board, a saved filter, and whatever
 * is already assigned to the current user (the same JQL the existing
 * /_local/jira-active-issues endpoint uses). An issue present in more than
 * one source keeps every source it came from, so the picker can show where
 * each suggestion is drawn from.
 */

export type IssueSource = 'sprint' | 'filter' | 'assigned';

export interface JqlIssue {
    key: string;
    summary: string;
}

export interface PoolIssue {
    key: string;
    summary: string;
    sources: IssueSource[];
}

const PAGE_SIZE = 100;
const ASSIGNED_TO_ME_JQL = 'assignee = currentUser() AND statusCategory != Done';

function jsonHeaders(authHeader: string): Record<string, string> {
    return { Authorization: authHeader, Accept: 'application/json', 'Content-Type': 'application/json' };
}

async function fetchJqlIssues(baseUrl: string, authHeader: string, jql: string): Promise<JqlIssue[]> {
    const issues: JqlIssue[] = [];
    let nextPageToken: string | undefined;

    while (true) {
        const response = await fetch(`${baseUrl}/rest/api/3/search/jql`, {
            method: 'POST',
            headers: jsonHeaders(authHeader),
            body: JSON.stringify({ jql, fields: ['summary'], maxResults: PAGE_SIZE, nextPageToken }),
        });
        if (!response.ok) {
            throw new Error(`JQL search failed: HTTP ${response.status}`);
        }

        const page = await response.json() as {
            issues?: Array<{ key: string; fields: { summary?: string } }>;
            nextPageToken?: string;
        };
        const pageIssues = page.issues ?? [];
        issues.push(...pageIssues.map(i => ({ key: i.key, summary: i.fields.summary?.trim() || i.key })));

        nextPageToken = page.nextPageToken;
        if (!nextPageToken || pageIssues.length === 0) break;
    }

    return issues;
}

/**
 * Issues on the board's currently active sprint(s). A board with no active
 * sprint — a kanban-only board, or one between sprints — is a normal state,
 * not a failure, so it resolves to an empty list rather than throwing.
 */
async function fetchActiveSprintIssues(baseUrl: string, authHeader: string, boardId: string): Promise<JqlIssue[]> {
    const sprintResponse = await fetch(`${baseUrl}/rest/agile/1.0/board/${boardId}/sprint?state=active`, {
        headers: { Authorization: authHeader, Accept: 'application/json' },
    });
    if (!sprintResponse.ok) {
        if (sprintResponse.status === 400 || sprintResponse.status === 404) return [];
        throw new Error(`Board sprint lookup failed: HTTP ${sprintResponse.status}`);
    }

    const sprintData = await sprintResponse.json() as { values?: Array<{ id: number }> };
    const sprintIds = (sprintData.values ?? []).map(s => s.id);

    const issues: JqlIssue[] = [];
    for (const sprintId of sprintIds) {
        let startAt = 0;
        while (true) {
            const response = await fetch(
                `${baseUrl}/rest/agile/1.0/sprint/${sprintId}/issue?fields=summary&maxResults=${PAGE_SIZE}&startAt=${startAt}`,
                { headers: { Authorization: authHeader, Accept: 'application/json' } },
            );
            if (!response.ok) break; // a stale/deleted sprint id shouldn't take the whole pool down

            const page = await response.json() as {
                issues?: Array<{ key: string; fields: { summary?: string } }>;
                startAt?: number;
                maxResults?: number;
                total?: number;
            };
            const pageIssues = page.issues ?? [];
            issues.push(...pageIssues.map(i => ({ key: i.key, summary: i.fields.summary?.trim() || i.key })));

            const pageSize = page.maxResults ?? PAGE_SIZE;
            const total = page.total ?? 0;
            startAt = (page.startAt ?? startAt) + pageSize;
            if (pageIssues.length === 0 || startAt >= total) break;
        }
    }

    return issues;
}

export function mergeIssuePool(sources: Partial<Record<IssueSource, JqlIssue[]>>): PoolIssue[] {
    const byKey = new Map<string, { key: string; summary: string; sources: Set<IssueSource> }>();

    for (const source of Object.keys(sources) as IssueSource[]) {
        for (const issue of sources[source] ?? []) {
            const existing = byKey.get(issue.key);
            if (existing) {
                existing.sources.add(source);
            } else {
                byKey.set(issue.key, { key: issue.key, summary: issue.summary, sources: new Set([source]) });
            }
        }
    }

    return Array.from(byKey.values())
        .map(e => ({ key: e.key, summary: e.summary, sources: Array.from(e.sources) }))
        .sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
}

export interface FetchIssuePoolOptions {
    baseUrl: string;
    authHeader: string;
    boardId?: string;
    filterId?: string;
}

export async function fetchIssuePool(options: FetchIssuePoolOptions): Promise<PoolIssue[]> {
    const { baseUrl, authHeader, boardId, filterId } = options;

    const [sprint, filter, assigned] = await Promise.all([
        boardId ? fetchActiveSprintIssues(baseUrl, authHeader, boardId) : Promise.resolve([]),
        filterId ? fetchJqlIssues(baseUrl, authHeader, `filter=${filterId}`) : Promise.resolve([]),
        fetchJqlIssues(baseUrl, authHeader, ASSIGNED_TO_ME_JQL),
    ]);

    return mergeIssuePool({ sprint, filter, assigned });
}
