import { describe, it, expect } from 'vitest';
import {
    applyProposals, buildRows, emptyAssignment, isComplete, pairsToRemember,
    reconcileGroups, setIssue, setSkip, titlesForClaude, toDrafts,
} from './mapping';
import { autoGroup, moveToGroup, splitOut } from './grouping';
import type { ImportBlock } from './importBlock';

function block(id: string, title: string, hour = 9, overrides: Partial<ImportBlock> = {}): ImportBlock {
    const pad = String(hour).padStart(2, '0');
    return {
        id, calendarId: 'main', title,
        start: `2026-11-03T${pad}:00:00.000Z`, end: `2026-11-03T${pad}:30:00.000Z`,
        allDay: false, busyStatus: 'busy', excluded: false, alreadyLogged: false, manual: false,
        ...overrides,
    };
}

const proposal = (title: string, issueKey: string | null, source: 'remembered' | 'similar' | 'claude' | 'none' = 'similar', confidence = 0.9) =>
    ({ title, issueKey, source, confidence, reason: 'because' });

describe('buildRows', () => {
    const blocks = [block('a', 'Stand-up (1/5)', 9), block('b', 'RE: Stand-up', 10), block('c', 'Budget review', 11)];

    it('makes one row per group, carrying why each block is in it', () => {
        const rows = buildRows(blocks, autoGroup(blocks));
        expect(rows.map(r => r.blockIds)).toEqual([['a', 'b'], ['c']]);
        expect(rows[0].members.map(m => m.reason)).toEqual(['anchor', 'same']);
    });

    it('follows manual changes to the groups', () => {
        let groups = splitOut(autoGroup(blocks), 'b');
        expect(buildRows(blocks, groups)).toHaveLength(3);
        groups = moveToGroup(groups, 'c', 'a');
        expect(buildRows(blocks, groups).map(r => r.blockIds)).toEqual([['a', 'c'], ['b']]);
    });
});

describe('reconcileGroups', () => {
    const blocks = [block('a', 'Emails, Teams and Slack catch up', 9), block('b', 'Emails, Teams, Slack', 10), block('c', 'Lunch', 12)];
    const groups = autoGroup(blocks);

    it('gives every block in a group the best member assignment', () => {
        const proposed = applyProposals({}, blocks, [proposal('Emails, Teams and Slack catch up', 'ABC-1', 'remembered', 1)]);
        const result = reconcileGroups(proposed, blocks, groups);
        expect(result.b.issueKey).toBe('ABC-1');
        expect(result.b.source).toBe('remembered');
        expect(result.c?.issueKey ?? null).toBeNull();
    });

    it('lets a manual choice win over a proposal', () => {
        let assignments = applyProposals({}, blocks, [proposal('Emails, Teams and Slack catch up', 'ABC-1', 'remembered', 1)]);
        assignments = setIssue(assignments, ['b'], 'ABC-9');
        expect(reconcileGroups(assignments, blocks, groups).a.issueKey).toBe('ABC-9');
    });

    it('has a block that just joined a group take the group\'s ticket', () => {
        const mine = setIssue({}, ['c'], 'ABC-5');
        let assignments = applyProposals(mine, blocks, [proposal('Emails, Teams and Slack catch up', 'ABC-1', 'remembered', 1)]);
        assignments = setIssue(assignments, ['a', 'b'], 'ABC-1');
        const joined = moveToGroup(groups, 'c', groups.groupOf.a);
        const result = reconcileGroups(assignments, blocks, joined, new Set(['a', 'b']));
        expect(result.c.issueKey).toBe('ABC-1');
    });
});

describe('applyProposals', () => {
    const blocks = [block('a', 'Stand-up', 9), block('b', 'Stand-up', 10)];

    it('applies a proposal to every block with that title', () => {
        const result = applyProposals({}, blocks, [proposal('Stand-up', 'ABC-1')]);
        expect(result.a.issueKey).toBe('ABC-1');
        expect(result.b.issueKey).toBe('ABC-1');
    });

    it('never overwrites a manual choice', () => {
        const manual = setIssue({}, ['a'], 'ABC-9');
        expect(applyProposals(manual, blocks, [proposal('Stand-up', 'ABC-1')]).a.issueKey).toBe('ABC-9');
    });

    it('does not let an empty proposal erase an existing one', () => {
        const first = applyProposals({}, blocks, [proposal('Stand-up', 'ABC-1')]);
        expect(applyProposals(first, blocks, [proposal('Stand-up', null, 'none', 0)]).a.issueKey).toBe('ABC-1');
    });
});

describe('titlesForClaude', () => {
    it('offers unplaced and weak rows only, once per title', () => {
        const blocks = [block('a', 'Lunch'), block('b', 'Lunch'), block('c', 'Weak'), block('d', 'Strong'), block('e', 'Mine')];
        let assignments = applyProposals({}, blocks, [
            proposal('Weak', 'ABC-1', 'similar', 0.5),
            proposal('Strong', 'ABC-2', 'similar', 0.9),
        ]);
        assignments = setIssue(assignments, ['e'], 'ABC-3');
        expect(titlesForClaude(blocks, assignments).sort()).toEqual(['Lunch', 'Weak']);
    });
});

describe('completion and hand-off', () => {
    const blocks = [block('a', 'Stand-up', 9), block('b', 'Lunch', 12), block('c', 'Budget', 14, { manual: true })];

    it('is incomplete until every block has a ticket or is skipped', () => {
        let assignments = setIssue({}, ['a'], 'ABC-1');
        expect(isComplete(blocks, assignments)).toBe(false);
        assignments = setSkip(assignments, ['b'], true);
        assignments = setIssue(assignments, ['c'], 'ABC-2');
        expect(isComplete(blocks, assignments)).toBe(true);
    });

    it('creates drafts for assigned blocks only', () => {
        let assignments = setIssue({}, ['a', 'c'], 'ABC-1');
        assignments = setSkip(assignments, ['b'], true);
        const drafts = toDrafts(blocks, assignments);
        expect(drafts.map(d => d.issueKey)).toEqual(['ABC-1', 'ABC-1']);
        expect(drafts[0]).toMatchObject({ source: 'draft', changeType: 'create', durationMinutes: 30 });
    });

    it('remembers one pair per title, skipping unticked, skipped and hand-added blocks', () => {
        let assignments = setIssue({}, ['a', 'b', 'c'], 'ABC-1');
        assignments = { ...assignments, b: { ...assignments.b, remember: false } };
        expect(pairsToRemember(blocks, assignments)).toEqual([{ title: 'Stand-up', issueKey: 'ABC-1' }]);
        expect(emptyAssignment().remember).toBe(true);
    });
});
