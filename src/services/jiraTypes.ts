/**
 * Type definitions for Jira Cloud API v3 responses
 * Based on: https://developer.atlassian.com/cloud/jira/platform/rest/v3/
 */

/**
 * Jira worklog response from /rest/api/3/worklog/search
 */
export interface JiraWorklogResponse {
    results: JiraWorklog[];
    startAt: number;
    maxResults: number;
    total: number;
}

/**
 * Individual worklog from Jira API
 */
export interface JiraWorklog {
    id: string;
    issueId: string;
    author: JiraUser;
    updateAuthor?: JiraUser;
    comment?: string;
    created: string;          // ISO datetime
    updated: string;          // ISO datetime
    started: string;          // ISO datetime - when work was performed
    timeSpent: string;        // e.g., "1h 30m"
    timeSpentSeconds: number; // Duration in seconds
    issueKey?: string;        // May not be included in all responses
}

/**
 * Jira user object
 */
export interface JiraUser {
    self: string;
    accountId: string;
    displayName: string;
    active: boolean;
}

/**
 * Jira issue response (for fetching issue details)
 */
export interface JiraIssue {
    id: string;
    key: string;
    self: string;
    fields: {
        summary: string;
        status: {
            name: string;
        };
        issuetype: {
            name: string;
        };
        [key: string]: unknown;
    };
}

/**
 * Error response from Jira API
 */
export interface JiraErrorResponse {
    errorMessages?: string[];
    errors?: Record<string, string>;
}
