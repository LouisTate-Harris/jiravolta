import type { DraftWorklog } from '../../types';
import { calculateDuration } from '../../utils/dateUtils';
import { normaliseTitle } from '../../../server/matching/normalise';
import type { MatchProposal } from '../../services/matchingService';
import type { ImportBlock } from './importBlock';

export type AssignmentSource = 'remembered' | 'similar' | 'claude' | 'manual' | 'none';

export interface Assignment {
    issueKey: string | null;
    /** Leave this block out of the created drafts. */
    skip: boolean;
    source: AssignmentSource;
    confidence: number;
    reason: string;
    /** Save this title→ticket pair to learned mappings on create. */
    remember: boolean;
}

/** Keyed by block id. */
export type Assignments = Record<string, Assignment>;

export interface MappingRow {
    id: string;
    blockIds: string[];
    title: string;
    blocks: ImportBlock[];
}

/** Below this, a local "similar" proposal is offered to Ask Claude as well. */
export const CONFIDENT_SIMILARITY = 0.6;

export const emptyAssignment = (): Assignment => ({
    issueKey: null,
    skip: false,
    source: 'none',
    confidence: 0,
    reason: '',
    remember: true,
});

const titleKey = (block: ImportBlock) => normaliseTitle(block.title) || block.title;

/** One row per repeated title when grouped, otherwise one row per block. */
export function buildRows(blocks: ImportBlock[], grouped: boolean): MappingRow[] {
    const sorted = [...blocks].sort((a, b) => a.start.localeCompare(b.start));
    if (!grouped) {
        return sorted.map(b => ({ id: b.id, blockIds: [b.id], title: b.title, blocks: [b] }));
    }

    const rows = new Map<string, MappingRow>();
    for (const block of sorted) {
        const key = titleKey(block);
        const row = rows.get(key);
        if (row) {
            row.blockIds.push(block.id);
            row.blocks.push(block);
        } else {
            rows.set(key, { id: key, blockIds: [block.id], title: block.title, blocks: [block] });
        }
    }
    return Array.from(rows.values());
}

export function rowAssignment(row: MappingRow, assignments: Assignments): Assignment {
    return assignments[row.blockIds[0]] ?? emptyAssignment();
}

export function rowMinutes(row: MappingRow): number {
    return row.blocks.reduce((sum, b) => sum + calculateDuration(new Date(b.start), new Date(b.end)), 0);
}

function patch(assignments: Assignments, blockIds: string[], update: (a: Assignment) => Assignment): Assignments {
    const next = { ...assignments };
    for (const id of blockIds) next[id] = update(next[id] ?? emptyAssignment());
    return next;
}

export function setIssue(assignments: Assignments, blockIds: string[], issueKey: string): Assignments {
    return patch(assignments, blockIds, a => ({
        ...a, issueKey, skip: false, source: 'manual', confidence: 1, reason: 'Chosen by you', remember: true,
    }));
}

export function setSkip(assignments: Assignments, blockIds: string[], skip: boolean): Assignments {
    return patch(assignments, blockIds, a => ({ ...a, skip }));
}

export function setRemember(assignments: Assignments, blockIds: string[], remember: boolean): Assignments {
    return patch(assignments, blockIds, a => ({ ...a, remember }));
}

/**
 * Applies proposals (keyed by the raw title they were requested for) to every
 * block with that title. Never overwrites a ticket you chose yourself, and an
 * empty proposal never replaces an existing one.
 */
export function applyProposals(assignments: Assignments, blocks: ImportBlock[], proposals: MatchProposal[]): Assignments {
    const byKey = new Map(proposals.map(p => [normaliseTitle(p.title) || p.title, p]));
    const next = { ...assignments };

    for (const block of blocks) {
        const proposal = byKey.get(titleKey(block));
        if (!proposal) continue;
        const existing = next[block.id] ?? emptyAssignment();
        if (existing.source === 'manual') continue;
        if (proposal.issueKey === null && existing.issueKey !== null) continue;

        next[block.id] = {
            ...existing,
            issueKey: proposal.issueKey,
            source: proposal.source,
            confidence: proposal.confidence,
            reason: proposal.reason,
        };
    }
    return next;
}

export const needsTicket = (a: Assignment) => a.issueKey === null && !a.skip;

/** Titles worth sending to Claude: nothing found locally, or only a weak match. */
export function titlesForClaude(blocks: ImportBlock[], assignments: Assignments): string[] {
    const titles = new Map<string, string>();
    for (const block of blocks) {
        const a = assignments[block.id] ?? emptyAssignment();
        const weak = a.source === 'none' || (a.source === 'similar' && a.confidence < CONFIDENT_SIMILARITY);
        if (weak && !a.skip && a.source !== 'manual') titles.set(titleKey(block), block.title);
    }
    return Array.from(titles.values());
}

export function isComplete(blocks: ImportBlock[], assignments: Assignments): boolean {
    return blocks.every(b => !needsTicket(assignments[b.id] ?? emptyAssignment()));
}

export function toDrafts(blocks: ImportBlock[], assignments: Assignments, now: Date = new Date()): DraftWorklog[] {
    const drafts: DraftWorklog[] = [];
    for (const block of blocks) {
        const a = assignments[block.id];
        if (!a || a.skip || !a.issueKey) continue;
        drafts.push({
            id: crypto.randomUUID(),
            issueKey: a.issueKey,
            start: block.start,
            end: block.end,
            durationMinutes: calculateDuration(new Date(block.start), new Date(block.end)),
            source: 'draft',
            changeType: 'create',
            lastModified: now.toISOString(),
        });
    }
    return drafts;
}

/** One pair per distinct title, for blocks that were actually imported with remember on. */
export function pairsToRemember(blocks: ImportBlock[], assignments: Assignments): Array<{ title: string; issueKey: string }> {
    const pairs = new Map<string, { title: string; issueKey: string }>();
    for (const block of blocks) {
        const a = assignments[block.id];
        // Manually added blocks have placeholder titles, so there's nothing worth learning.
        if (!a || a.skip || !a.issueKey || !a.remember || block.manual) continue;
        pairs.set(titleKey(block), { title: block.title, issueKey: a.issueKey });
    }
    return Array.from(pairs.values());
}
