/**
 * Transform Jira API responses to application data structures
 */

import type { Worklog } from '../types';
import type { JiraWorklog, JiraWorklogResponse } from './jiraTypes';

/**
 * Transform a Jira worklog to our application Worklog format
 */
export function transformJiraWorklog(jiraWorklog: JiraWorklog): Worklog {
    const started = new Date(jiraWorklog.started);
    const durationMinutes = Math.round(jiraWorklog.timeSpentSeconds / 60);

    const end = new Date(started);
    end.setMinutes(end.getMinutes() + durationMinutes);

    return {
        id: jiraWorklog.id,
        issueKey: jiraWorklog.issueKey || extractIssueKeyFromId(jiraWorklog.issueId),
        start: started.toISOString(),
        end: end.toISOString(),
        durationMinutes,
        source: 'jira',
    };
}

/**
 * Transform a Jira worklog response to an array of Worklogs
 */
export function transformJiraWorklogResponse(response: JiraWorklogResponse): Worklog[] {
    return response.results.map(transformJiraWorklog);
}

/**
 * Extract issue key from issue ID (fallback if issueKey not provided)
 * This is a placeholder - in reality, you'd need to fetch the issue details
 */
function extractIssueKeyFromId(issueId: string): string {
    // In a real implementation, you'd cache issue ID to key mappings
    // or fetch the issue details from the API
    return `ISSUE-${issueId.slice(-3)}`;
}

/**
 * Format a date for Jira API query parameters
 * Jira expects ISO 8601 format with timezone
 */
export function formatDateForJira(date: Date): string {
    return date.toISOString();
}
