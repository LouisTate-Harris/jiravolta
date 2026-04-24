/**
 * Jira Cloud API service with read-only worklog fetching
 * Every API call is logged to console for debugging
 */

import type { Worklog } from '../types';
import type { JiraWorklogResponse, JiraErrorResponse } from './jiraTypes';
import { transformJiraWorklogResponse, formatDateForJira } from './jiraTransformers';

// Environment variables for Jira authentication
const JIRA_BASE_URL = import.meta.env.VITE_JIRA_BASE_URL;
const JIRA_EMAIL = import.meta.env.VITE_JIRA_EMAIL;
const JIRA_API_TOKEN = import.meta.env.VITE_JIRA_API_TOKEN;

/**
 * Check if Jira is configured
 */
export function isJiraConfigured(): boolean {
    return !!(JIRA_BASE_URL && JIRA_EMAIL && JIRA_API_TOKEN);
}

/**
 * Create Basic Auth header for Jira API
 */
function getAuthHeader(): string {
    const credentials = btoa(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`);
    return `Basic ${credentials}`;
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
): Promise<Worklog[]> {
    if (!isJiraConfigured()) {
        console.warn('[JIRA API] Jira not configured, using mock data');
        throw new Error('Jira not configured. Please set VITE_JIRA_BASE_URL, VITE_JIRA_EMAIL, and VITE_JIRA_API_TOKEN in .env.local');
    }

    const endpoint = `${JIRA_BASE_URL}/rest/api/3/worklog/updated`;
    const fromDate = formatDateForJira(weekStart);
    const toDate = formatDateForJira(weekEnd);

    console.log('[JIRA API] Fetching worklogs', {
        endpoint,
        weekStart: fromDate,
        weekEnd: toDate,
    });

    try {
        const response = await fetchWithRetry(endpoint, {
            method: 'GET',
            headers: {
                'Authorization': getAuthHeader(),
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            const errorData: JiraErrorResponse = await response.json().catch(() => ({}));
            console.error('[JIRA API] Request failed', {
                status: response.status,
                statusText: response.statusText,
                errorData,
            });

            throw new Error(
                errorData.errorMessages?.join(', ') ||
                `Jira API error: ${response.status} ${response.statusText}`
            );
        }

        const data: JiraWorklogResponse = await response.json();
        console.log('[JIRA API] Raw response', {
            totalResults: data.total,
            returnedResults: data.results.length,
            startAt: data.startAt,
        });

        const worklogs = transformJiraWorklogResponse(data);

        // Filter worklogs to only include those in the date range
        const filteredWorklogs = worklogs.filter(worklog => {
            const worklogDate = new Date(worklog.start);
            return worklogDate >= weekStart && worklogDate <= weekEnd;
        });

        console.log('[JIRA API] Transformed worklogs', {
            total: worklogs.length,
            filtered: filteredWorklogs.length,
            worklogs: filteredWorklogs,
        });

        return filteredWorklogs;
    } catch (error) {
        console.error('[JIRA API] Fetch failed', error);
        throw error;
    }
}

/**
 * Fetch with exponential backoff retry logic
 */
async function fetchWithRetry(
    url: string,
    options: RequestInit,
    maxRetries = 3
): Promise<Response> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`[JIRA API] Attempt ${attempt}/${maxRetries}`);
            const response = await fetch(url, options);

            // Don't retry on 4xx errors (client errors)
            if (response.status >= 400 && response.status < 500) {
                return response;
            }

            // Return successful responses
            if (response.ok) {
                return response;
            }

            // Retry on 5xx errors (server errors)
            if (attempt < maxRetries) {
                const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
                console.warn(`[JIRA API] Retry after ${delay}ms due to status ${response.status}`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }

            return response;
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            if (attempt < maxRetries) {
                const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
                console.warn(`[JIRA API] Retry after ${delay}ms due to error:`, error);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    throw lastError || new Error('Max retries exceeded');
}

/**
 * Test Jira connection
 * Useful for validating credentials
 */
export async function testJiraConnection(): Promise<boolean> {
    if (!isJiraConfigured()) {
        return false;
    }

    const endpoint = `${JIRA_BASE_URL}/rest/api/3/myself`;
    console.log('[JIRA API] Testing connection', { endpoint });

    try {
        const response = await fetch(endpoint, {
            method: 'GET',
            headers: {
                'Authorization': getAuthHeader(),
                'Accept': 'application/json',
            },
        });

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
