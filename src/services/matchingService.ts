/**
 * Client for the ticket-matching local endpoints (see vite.config.ts and
 * server/matching/). Matching and learned mappings are best-effort: if the
 * server is unreachable the wizard still works, just without proposals.
 */

import type { MatchProposal, TicketCandidate } from '../../server/matching/types';

export type { MatchProposal, MatchSource, TicketCandidate } from '../../server/matching/types';

export interface LearnedMapping {
    id: string;
    title: string;
    issueKey: string;
    count: number;
    lastUsed: string;
}

export interface MatchConfig {
    claudeAvailable: boolean;
    claudeModel: string | null;
}

const BASE = '/_local';

async function postJson<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${BASE}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        const data = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(data?.error ?? `${path} failed: ${response.status}`);
    }
    return response.json() as Promise<T>;
}

export async function fetchMatchConfig(): Promise<MatchConfig> {
    try {
        const response = await fetch(`${BASE}/calendar-match-config`);
        if (!response.ok) return { claudeAvailable: false, claudeModel: null };
        return await response.json() as MatchConfig;
    } catch {
        return { claudeAvailable: false, claudeModel: null };
    }
}

export async function matchTitles(titles: string[], candidates: TicketCandidate[]): Promise<MatchProposal[]> {
    const data = await postJson<{ proposals: MatchProposal[] }>('calendar-match', { titles, candidates });
    return data.proposals;
}

export async function askClaudeToMatch(titles: string[], candidates: TicketCandidate[]): Promise<MatchProposal[]> {
    const data = await postJson<{ proposals: MatchProposal[] }>('calendar-match-claude', { titles, candidates });
    return data.proposals;
}

export async function fetchLearnedMappings(): Promise<LearnedMapping[]> {
    try {
        const response = await fetch(`${BASE}/learned-mappings`);
        if (!response.ok) return [];
        return (await response.json() as { mappings: LearnedMapping[] }).mappings;
    } catch {
        return [];
    }
}

export async function saveLearnedMappings(pairs: Array<{ title: string; issueKey: string }>): Promise<void> {
    if (pairs.length === 0) return;
    const response = await fetch(`${BASE}/learned-mappings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pairs }),
    });
    if (!response.ok) throw new Error(`Saving learned mappings failed: ${response.status}`);
}

export async function deleteLearnedMapping(id: string): Promise<void> {
    const response = await fetch(`${BASE}/learned-mappings?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!response.ok) throw new Error(`Deleting learned mapping failed: ${response.status}`);
}
