import { describe, it, expect } from 'vitest';
import { autoGroup, splitOut, moveToGroup, titleSimilarity, isOverrun } from './grouping';
import type { ImportBlock } from './importBlock';

let n = 0;
function block(title: string, day: string, start: string, end: string): ImportBlock {
    return {
        id: `b${++n}`, calendarId: 'main', title,
        start: `2026-11-${day}T${start}:00.000Z`, end: `2026-11-${day}T${end}:00.000Z`,
        allDay: false, busyStatus: 'busy', excluded: false, alreadyLogged: false, manual: false,
    };
}

describe('titleSimilarity', () => {
    it('scores a shortened title highly and different meetings low', () => {
        expect(titleSimilarity('Emails, Teams and Slack catch up', 'Emails, Teams, Slack')).toBeGreaterThanOrEqual(0.75);
        expect(titleSimilarity('Alex / Sam 1:1', 'Alex / Jo 1:1')).toBeLessThan(0.75);
        expect(titleSimilarity('Planning', 'Planning')).toBe(0);
    });
});

describe('autoGroup', () => {
    it('groups identical titles and near-identical titles, explaining each', () => {
        const a = block('Emails, Teams and Slack catch up', '02', '09:00', '09:30');
        const b = block('Emails, Teams and Slack catch up', '03', '09:00', '09:30');
        const c = block('Emails, Teams, Slack', '04', '09:00', '09:30');
        const d = block('Budget review', '04', '10:00', '11:00');
        const groups = autoGroup([a, b, c, d]);
        expect(new Set([a, b, c].map(x => groups.groupOf[x.id])).size).toBe(1);
        expect(groups.groupOf[d.id]).toBe(d.id);
        expect(groups.members[b.id].reason).toBe('same');
        expect(groups.members[c.id].reason).toBe('similar');
    });

    it('attaches an overrun to the block before it on the same day', () => {
        const planning = block('Sprint planning', '03', '10:00', '11:00');
        const lunch = block('Lunch and learn', '03', '12:00', '12:30');
        const overrun = block('overrun', '03', '11:00', '11:30');
        const otherDay = block('Sprint planning', '04', '10:00', '11:00');
        const groups = autoGroup([lunch, overrun, planning, otherDay]);
        expect(groups.groupOf[overrun.id]).toBe(groups.groupOf[planning.id]);
        expect(groups.groupOf[overrun.id]).not.toBe(groups.groupOf[lunch.id]);
        expect(groups.members[overrun.id].why).toContain('Sprint planning');
    });

    it('leaves an overrun alone when nothing precedes it that day', () => {
        const overrun = block('Overrun', '03', '09:00', '09:30');
        const later = block('Standup', '03', '10:00', '10:15');
        const groups = autoGroup([overrun, later]);
        expect(groups.groupOf[overrun.id]).toBe(overrun.id);
        expect(isOverrun(overrun)).toBe(true);
    });

    it('joins an overrun to the wider group its previous block belongs to', () => {
        const a = block('Team stand-up', '03', '09:00', '09:15');
        const overrun = block('Overrun', '03', '09:15', '09:30');
        const b = block('Team stand-up', '04', '09:00', '09:15');
        const groups = autoGroup([a, overrun, b]);
        expect(new Set([a, overrun, b].map(x => groups.groupOf[x.id])).size).toBe(1);
    });
});

describe('splitOut and moveToGroup', () => {
    it('lets you undo or override the automatic grouping', () => {
        const a = block('Team stand-up', '03', '09:00', '09:15');
        const b = block('Team stand-up', '04', '09:00', '09:15');
        const c = block('Budget review', '04', '10:00', '11:00');
        let groups = autoGroup([a, b, c]);
        groups = splitOut(groups, b.id);
        expect(groups.groupOf[b.id]).not.toBe(groups.groupOf[a.id]);
        groups = moveToGroup(groups, c.id, groups.groupOf[a.id]);
        expect(groups.groupOf[c.id]).toBe(groups.groupOf[a.id]);
        expect(groups.members[c.id].reason).toBe('manual');
    });
});
