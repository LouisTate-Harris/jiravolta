import type { DraftWorklog } from '../../types';
import { calculateDuration } from '../../utils/dateUtils';
import { normaliseTitle } from '../../../server/matching/normalise';
import type { MatchProposal } from '../../services/matchingService';
import type { ImportBlock } from './importBlock';
import type { GroupMember, Groups } from './grouping';

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
    /** The group id. */
    id: string;
    blockIds: string[];
    title: string;
    blocks: ImportBlock[];
    /** Why each block is in this group, aligned with `blocks`. */
    members: GroupMember[];
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

/** One row per group (a lone block is a group of one), in the order they start. */
export function buildRows(blocks: ImportBlock[], groups: Groups): MappingRow[] {
    const sorted = [...blocks].sort((a, b) => a.start.localeCompare(b.start));
    const rows = new Map<string, MappingRow>();
    for (const block of sorted) {
        const id = groups.groupOf[block.id] ?? block.id;
        const member = groups.members[block.id] ?? { reason: 'anchor' as const, why: 'First in group' };
        const row = rows.get(id);
        if (row) {
            row.blockIds.push(block.id);
            row.blocks.push(block);
            row.members.push(member);
        } else {
            rows.set(id, { id, blockIds: [block.id], title: block.title, blocks: [block], members: [member] });
        }
    }
    return Array.from(rows.values());
}

/**
 * Makes every block in a group share one assignment: a ticket you chose
 * beats a proposal, a more confident proposal beats a weaker one, and any
 * ticket beats none. `prefer` lets a block that just joined defer to the group.
 */
export function reconcileGroups(assignments: Assignments, blocks: ImportBlock[], groups: Groups, prefer?: Set<string>): Assignments {
    const byGroup = new Map<string, string[]>();
    for (const block of blocks) {
        const id = groups.groupOf[block.id] ?? block.id;
        byGroup.set(id, [...(byGroup.get(id) ?? []), block.id]);
    }

    const rank = (a: Assignment, preferred: boolean) =>
        (a.issueKey ? 1000 : 0) + (a.source === 'manual' ? 100 : 0) + a.confidence * 10 + (preferred ? 1 : 0);

    const next = { ...assignments };
    for (const ids of byGroup.values()) {
        if (ids.length < 2) continue;
        let best = next[ids[0]] ?? emptyAssignment();
        let bestRank = rank(best, prefer?.has(ids[0]) ?? false);
        for (const id of ids.slice(1)) {
            const candidate = next[id] ?? emptyAssignment();
            const r = rank(candidate, prefer?.has(id) ?? false);
            if (r > bestRank) {
                best = candidate;
                bestRank = r;
            }
        }
        for (const id of ids) next[id] = { ...best };
    }
    return next;
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
