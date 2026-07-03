/**
 * Jira Cloud API service with read-only worklog fetching
 * Every API call is logged to console for debugging
 */

import type { Worklog, DraftWorklog } from '../types';
import { formatDate } from '../utils/dateUtils';
import type {
    JiraWeekCacheData,
    JiraWorklog,
} from './jiraTypes';
import { transformJiraWorklogList } from './jiraTransformers';

export interface WeekWorklogData {
    worklogs: Worklog[];
    issueNameMap: Record<string, string>;
}

export interface JiraConfig {
    configured: boolean;
    baseUrl: string | null;
}

let _configCache: JiraConfig | null = null;

export async function fetchJiraConfig(): Promise<JiraConfig> {
    if (_configCache) return _configCache;
    try {
        const res = await fetch('/_local/jira-config');
        _configCache = await res.json() as JiraConfig;
    } catch {
        _configCache = { configured: false, baseUrl: null };
    }
    return _configCache;
}

const LOCAL_JIRA_WORKLOGS_ENDPOINT = '/_local/jira-worklogs';
const LOCAL_JIRA_TEST_ENDPOINT = '/_local/jira-test';
const LOCAL_JIRA_WORKLOG_CREATE_ENDPOINT = '/_local/jira-worklog-create';
const LOCAL_JIRA_WORKLOG_UPDATE_ENDPOINT = '/_local/jira-worklog-update';
const LOCAL_JIRA_WORKLOG_DELETE_ENDPOINT = '/_local/jira-worklog-delete';
const LOCAL_JIRA_CACHE_INVALIDATE_ENDPOINT = '/_local/jira-cache-invalidate';
const LOCAL_JIRA_ACTIVE_ISSUES_ENDPOINT = '/_local/jira-active-issues';
const LOCAL_JIRA_CACHE_CLEAR_ALL_ENDPOINT = '/_local/jira-cache-clear-all';
const LOCAL_JIRA_ISSUE_ENDPOINT = '/_local/jira-issue';

export function isJiraConfigured(): boolean {
    return _configCache?.configured ?? false;
}

/**
 * Fetch worklogs for a specific date range from Jira
 * Uses Jira Cloud API v3 worklog search endpoint
 * 
 * @param weekStart - Start of the week
 * @param weekEnd - End of the week
 * @returns Array of worklogs
 */
export async function fetchWorklogsForWeek(
    weekStart: Date,
    weekEnd: Date
): Promise<WeekWorklogData> {
    if (!isJiraConfigured()) {
        console.warn('[JIRA API] Jira not configured, using mock data');
        throw new Error('Jira not configured. Please set JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN in .env.local');
    }

    const weekKey = formatDate(weekStart);
    const weekEndKey = formatDate(weekEnd);

    console.log('[JIRA API] Using local middleware', { weekKey, weekEndKey });

    try {
        const response = await fetch(`${LOCAL_JIRA_WORKLOGS_ENDPOINT}?week=${weekKey}&weekEnd=${weekEndKey}`);
        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown local middleware error');
            throw new Error(`Local Jira middleware error: ${response.status} ${errorText}`);
        }

        const cacheData: JiraWeekCacheData = await response.json();
        console.log('[JIRA API] Local cache data', {
            worklogs: cacheData.worklogs.length,
            issues: Object.keys(cacheData.issueKeyMap).length,
            issueDetails: Object.keys(cacheData.issueDetailsMap ?? {}).length,
        });

        const issueNameMap = Object.values(cacheData.issueDetailsMap ?? {}).reduce<Record<string, string>>((acc, details) => {
            if (details.key) {
                acc[details.key] = details.summary?.trim() || details.key;
            }
            return acc;
        }, {});

        const worklogs = transformJiraWorklogList(cacheData.worklogs, cacheData.issueKeyMap).filter(w => {
            const d = new Date(w.start);
            return d >= weekStart && d <= weekEnd;
        });

        return { worklogs, issueNameMap };
    } catch (error) {
        console.error('[JIRA API] Fetch failed', error);
        throw error;
    }
}

/**
 * Test Jira connection
 * Useful for validating credentials
 */
export async function testJiraConnection(): Promise<boolean> {
    if (!isJiraConfigured()) {
        return false;
    }

    console.log('[JIRA API] Testing connection via local middleware');

    try {
        const response = await fetch(LOCAL_JIRA_TEST_ENDPOINT);

        console.log('[JIRA API] Connection test result', {
            status: response.status,
            ok: response.ok,
        });

        return response.ok;
    } catch (error) {
        console.error('[JIRA API] Connection test failed', error);
        return false;
    }
}

/**
 * Create a new worklog in Jira for the given draft.
 * Returns the Jira-assigned worklog (with a real numeric id).
 */
export async function createJiraWorklog(draft: DraftWorklog): Promise<JiraWorklog> {
    // Jira requires an explicit timezone offset, not trailing 'Z'
    const started = new Date(draft.start).toISOString().replace('Z', '+0000');
    const timeSpentSeconds = draft.durationMinutes * 60;

    console.log('[JIRA API] Creating worklog', { issueKey: draft.issueKey, started, timeSpentSeconds });

    const response = await fetch(LOCAL_JIRA_WORKLOG_CREATE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issueKey: draft.issueKey, started, timeSpentSeconds }),
    });

    if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Failed to create worklog for ${draft.issueKey}: ${response.status} ${errorText}`);
    }

    return response.json() as Promise<JiraWorklog>;
}

/**
 * Update an existing Jira worklog with new timing data from the given draft.
 * draft.id must be the original Jira worklog id.
 */
export async function updateJiraWorklog(draft: DraftWorklog): Promise<void> {
    const started = new Date(draft.start).toISOString().replace('Z', '+0000');
    const timeSpentSeconds = draft.durationMinutes * 60;

    console.log('[JIRA API] Updating worklog', { worklogId: draft.id, issueKey: draft.issueKey, started, timeSpentSeconds });

    const response = await fetch(LOCAL_JIRA_WORKLOG_UPDATE_ENDPOINT, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issueKey: draft.issueKey, worklogId: draft.id, started, timeSpentSeconds }),
    });

    if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Failed to update worklog ${draft.id}: ${response.status} ${errorText}`);
    }
}

/**
 * Delete a worklog in Jira.
 * draft.id must be the original Jira worklog id.
 */
export async function deleteJiraWorklog(draft: DraftWorklog): Promise<void> {
    console.log('[JIRA API] Deleting worklog', { worklogId: draft.id, issueKey: draft.issueKey });

    const url = `${LOCAL_JIRA_WORKLOG_DELETE_ENDPOINT}?issueKey=${encodeURIComponent(draft.issueKey)}&worklogId=${encodeURIComponent(draft.id)}`;
    const response = await fetch(url, { method: 'DELETE' });

    if (!response.ok && response.status !== 204) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Failed to delete worklog ${draft.id}: ${response.status} ${errorText}`);
    }
}

/**
 * Invalidate the local cache file for a given week so the next fetch
 * goes back to Jira instead of serving stale data.
 * Best-effort — errors are swallowed.
 */
export async function invalidateWeekCache(weekStart: Date): Promise<void> {
    const week = formatDate(weekStart);
    try {
        await fetch(`${LOCAL_JIRA_CACHE_INVALIDATE_ENDPOINT}?week=${week}`, { method: 'DELETE' });
        console.log('[JIRA API] Cache invalidated for week', week);
    } catch {
        // best-effort
    }
}

export interface ActiveIssue {
    key: string;
    summary: string;
}

/**
 * Fetch all active issues assigned to the current Jira user.
 * The result is cached server-side in .cache/active-issues.json.
 */
export async function fetchActiveIssues(): Promise<ActiveIssue[]> {
    if (!isJiraConfigured()) {
        return [];
    }
    console.log('[JIRA API] Fetching active issues');
    try {
        const response = await fetch(LOCAL_JIRA_ACTIVE_ISSUES_ENDPOINT);
        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error');
            console.warn('[JIRA API] Active issues fetch failed:', response.status, errorText);
            return [];
        }
        const data = await response.json() as { issues: ActiveIssue[] };
        console.log('[JIRA API] Active issues loaded:', data.issues.length);
        return data.issues;
    } catch (error) {
        console.error('[JIRA API] Active issues fetch error', error);
        return [];
    }
}

/**
 * Fetch a single issue's summary by key. Returns null if Jira isn't
 * configured, the request fails, or the issue has no summary — never throws.
 */
export async function fetchIssueSummary(key: string): Promise<string | null> {
    if (!isJiraConfigured()) {
        return null;
    }
    try {
        const response = await fetch(`${LOCAL_JIRA_ISSUE_ENDPOINT}?key=${encodeURIComponent(key)}`);
        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error');
            console.warn('[JIRA API] Issue summary fetch failed:', response.status, errorText);
            return null;
        }
        const data = await response.json() as { key: string; summary: string | null };
        return data.summary ?? null;
    } catch (error) {
        console.error('[JIRA API] Issue summary fetch error', error);
        return null;
    }
}

export type CacheScope = 'worklogs' | 'active-issues' | 'ticket-list';

/**
 * Delete the given server-side cache file(s). Omit `scopes` to clear everything
 * (week worklog caches, the active-issues cache, and the ticket list cache).
 * Best-effort — errors are swallowed.
 */
export async function clearCache(scopes?: CacheScope[]): Promise<void> {
    try {
        const params = new URLSearchParams();
        (scopes ?? []).forEach(scope => params.append('scope', scope));
        const query = params.toString();
        const url = query ? `${LOCAL_JIRA_CACHE_CLEAR_ALL_ENDPOINT}?${query}` : LOCAL_JIRA_CACHE_CLEAR_ALL_ENDPOINT;
        await fetch(url, { method: 'DELETE' });
        console.log('[JIRA API] Cache cleared', scopes ?? 'all');
    } catch {
        // best-effort
    }
}
