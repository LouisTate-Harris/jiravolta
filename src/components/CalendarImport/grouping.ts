import { normaliseTitle } from '../../../server/matching/normalise';
import type { ImportBlock } from './importBlock';

/** Why a block sits in a group, shown beside it so the automatic choices are visible. */
export interface GroupMember {
    reason: 'anchor' | 'same' | 'similar' | 'overrun' | 'manual';
    /** Short human text, e.g. 'Overrun of “Planning”'. */
    why: string;
}

/**
 * Which blocks share a Jira ticket. `groupOf` gives every block a group id
 * (singletons get their own); `members` explains each block's membership.
 */
export interface Groups {
    groupOf: Record<string, string>;
    members: Record<string, GroupMember>;
}

const STOP_WORDS = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'for', 'in', 'on', 'with', 'at', 'up']);
/** Titles at least this alike (Dice coefficient on words) are auto-grouped. */
export const SIMILAR_TITLE_THRESHOLD = 0.75;
const OVERRUN = /\b(over[- ]?run(s|ning)?|overran)\b/i;

const stem = (word: string) => word.replace(/(ing|ed|es|s)$/, '');

function words(title: string): Set<string> {
    return new Set(
        normaliseTitle(title)
            .split(' ')
            .filter(w => w.length > 1 && !STOP_WORDS.has(w))
            .map(stem),
    );
}

export function titleSimilarity(a: string, b: string): number {
    const wa = words(a);
    const wb = words(b);
    if (wa.size < 2 || wb.size < 2) return 0;
    let shared = 0;
    for (const w of wa) if (wb.has(w)) shared++;
    return (2 * shared) / (wa.size + wb.size);
}

export function isOverrun(block: ImportBlock): boolean {
    return OVERRUN.test(block.title);
}

const sameDay = (a: ImportBlock, b: ImportBlock) => new Date(a.start).toDateString() === new Date(b.start).toDateString();

/**
 * Groups identical and near-identical titles, and attaches any "overrun"
 * block to the block before it, so the whole run maps to one ticket. The
 * result is a starting point: every decision can be undone in the UI.
 */
export function autoGroup(blocks: ImportBlock[]): Groups {
    const sorted = [...blocks].sort((a, b) => a.start.localeCompare(b.start));
    const parent = new Map<string, string>(sorted.map(b => [b.id, b.id]));
    const find = (id: string): string => {
        let root = id;
        while (parent.get(root) !== root) root = parent.get(root)!;
        parent.set(id, root);
        return root;
    };
    const union = (a: string, b: string) => parent.set(find(b), find(a));

    const regular = sorted.filter(b => !isOverrun(b));
    for (let i = 0; i < regular.length; i++) {
        for (let j = i + 1; j < regular.length; j++) {
            const a = regular[i];
            const b = regular[j];
            const same = normaliseTitle(a.title) === normaliseTitle(b.title);
            if (same || titleSimilarity(a.title, b.title) >= SIMILAR_TITLE_THRESHOLD) union(a.id, b.id);
        }
    }

    // An overrun belongs to the nearest block that started before it, that day.
    const overrunOf = new Map<string, ImportBlock>();
    for (const block of sorted.filter(isOverrun)) {
        const previous = regular.filter(b => sameDay(b, block) && b.start < block.start).pop();
        if (previous) {
            union(previous.id, block.id);
            overrunOf.set(block.id, previous);
        }
    }

    const byRoot = new Map<string, ImportBlock[]>();
    for (const block of sorted) {
        const root = find(block.id);
        byRoot.set(root, [...(byRoot.get(root) ?? []), block]);
    }

    const groupOf: Record<string, string> = {};
    const members: Record<string, GroupMember> = {};
    for (const group of byRoot.values()) {
        const anchor = group.find(b => !isOverrun(b)) ?? group[0];
        for (const block of group) {
            groupOf[block.id] = anchor.id;
            if (block.id === anchor.id) members[block.id] = { reason: 'anchor', why: 'First in group' };
            else if (overrunOf.has(block.id)) members[block.id] = { reason: 'overrun', why: `Overrun of “${overrunOf.get(block.id)!.title}”` };
            else if (normaliseTitle(block.title) === normaliseTitle(anchor.title)) members[block.id] = { reason: 'same', why: 'Same title' };
            else members[block.id] = { reason: 'similar', why: `Similar to “${anchor.title}”` };
        }
    }
    return { groupOf, members };
}

/** Takes a block out of its group into one of its own. */
export function splitOut(groups: Groups, blockId: string): Groups {
    return {
        groupOf: { ...groups.groupOf, [blockId]: blockId },
        members: { ...groups.members, [blockId]: { reason: 'anchor', why: 'First in group' } },
    };
}

/** Puts a block into an existing group. */
export function moveToGroup(groups: Groups, blockId: string, targetGroupId: string): Groups {
    return {
        groupOf: { ...groups.groupOf, [blockId]: targetGroupId },
        members: { ...groups.members, [blockId]: { reason: 'manual', why: 'Added by you' } },
    };
}
