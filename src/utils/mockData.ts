import type { Worklog } from '../types';

const MOCK_ISSUES = [
    'PROJ-101',
    'PROJ-102',
    'PROJ-103',
    'PROJ-104',
    'PROJ-105',
    'PROJ-106',
    'PROJ-107',
    'PROJ-108',
];

/**
 * Simple seeded random number generator for deterministic data
 */
function seededRandom(seed: number) {
    let state = seed;
    return function () {
        state = (state * 1664525 + 1013904223) % 4294967296;
        return state / 4294967296;
    };
}

/**
 * Generate mock worklogs for a given week (deterministic based on week start)
 */
export function generateMockWorklogs(weekStart: Date): Worklog[] {
    // Use week start timestamp as seed for consistent data
    const seed = Math.floor(weekStart.getTime() / 1000);
    const random = seededRandom(seed);

    const worklogs: Worklog[] = [];

    // Generate worklogs for each day of the week (Mon-Fri mainly)
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        const date = new Date(weekStart);
        date.setDate(date.getDate() + dayOffset);

        // Skip weekends for most entries
        if (dayOffset >= 5 && random() > 0.3) {
            continue;
        }

        // Generate 2-5 worklogs per day
        const numWorklogs = Math.floor(random() * 4) + 2;
        let currentTime = 9; // Start at 9 AM

        for (let i = 0; i < numWorklogs; i++) {
            const issueKey = MOCK_ISSUES[Math.floor(random() * MOCK_ISSUES.length)];

            // Duration: 15, 30, 45, 60, 90, or 120 minutes
            const durations = [15, 30, 45, 60, 90, 120];
            const durationMinutes = durations[Math.floor(random() * durations.length)];

            const start = new Date(date);
            start.setHours(currentTime, 0, 0, 0);

            const end = new Date(start);
            end.setMinutes(end.getMinutes() + durationMinutes);

            // Don't go past 6 PM
            if (end.getHours() >= 18) {
                break;
            }

            // Use deterministic ID based on date and index
            const dateStr = date.toISOString().split('T')[0];
            const deterministicId = `worklog-${dateStr}-${i}-${issueKey}`;

            worklogs.push({
                id: deterministicId,
                issueKey,
                start: start.toISOString(),
                end: end.toISOString(),
                durationMinutes,
                source: 'jira',
            });

            // Move to next time slot (add some gap)
            currentTime = end.getHours() + (end.getMinutes() >= 30 ? 1 : 0.5);

            // Random gap between worklogs
            if (random() > 0.5) {
                currentTime += 0.25 + random() * 0.5;
            }
        }
    }

    return worklogs;
}

/**
 * Simulate fetching worklogs from Jira API
 */
export async function fetchMockWorklogs(weekStart: Date): Promise<Worklog[]> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 300));

    // 5% chance of error for testing
    if (Math.random() < 0.05) {
        throw new Error('Failed to fetch worklogs from Jira');
    }

    return generateMockWorklogs(weekStart);
}
