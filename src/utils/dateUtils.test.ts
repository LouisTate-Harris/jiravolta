import { describe, it, expect } from 'vitest';
import { getWeekStart, getWeekEnd, getWeekDays, formatDate, snapToQuarterHour, calculateDuration, isSameDay } from './dateUtils';

describe('getWeekStart', () => {
    it('returns the same Monday when given a Monday', () => {
        expect(formatDate(getWeekStart(new Date(2026, 10, 2)))).toBe('2026-11-02');
    });

    it('rolls a mid-week date back to Monday', () => {
        expect(formatDate(getWeekStart(new Date(2026, 10, 5)))).toBe('2026-11-02');
    });

    it('rolls Sunday back to the Monday that started its week', () => {
        expect(formatDate(getWeekStart(new Date(2026, 10, 8)))).toBe('2026-11-02');
    });

    it('handles the UK clocks-change weekend (25 Oct 2026, BST to GMT)', () => {
        // Sunday 25 Oct 2026 is the day the clocks go back; its week starts Monday 19 Oct.
        expect(formatDate(getWeekStart(new Date(2026, 9, 25)))).toBe('2026-10-19');
    });
});

describe('getWeekEnd / getWeekDays', () => {
    it('returns Sunday as the end of the week', () => {
        expect(formatDate(getWeekEnd(new Date(2026, 10, 2)))).toBe('2026-11-08');
    });

    it('returns 7 consecutive days starting Monday', () => {
        const days = getWeekDays(new Date(2026, 10, 4));
        expect(days).toHaveLength(7);
        expect(formatDate(days[0])).toBe('2026-11-02');
        expect(formatDate(days[6])).toBe('2026-11-08');
    });
});

describe('snapToQuarterHour', () => {
    it('rounds down to the nearest 15 minutes', () => {
        const snapped = snapToQuarterHour(new Date(2026, 10, 2, 9, 7));
        expect(snapped.getMinutes()).toBe(0);
    });

    it('rounds up to the nearest 15 minutes', () => {
        const snapped = snapToQuarterHour(new Date(2026, 10, 2, 9, 53));
        expect(snapped.getHours()).toBe(10);
        expect(snapped.getMinutes()).toBe(0);
    });
});

describe('calculateDuration', () => {
    it('returns whole minutes between two timestamps', () => {
        const start = new Date(2026, 10, 2, 9, 0);
        const end = new Date(2026, 10, 2, 10, 15);
        expect(calculateDuration(start, end)).toBe(75);
    });
});

describe('isSameDay', () => {
    it('is true for the same calendar day at different times', () => {
        expect(isSameDay(new Date(2026, 10, 2, 8, 0), new Date(2026, 10, 2, 22, 0))).toBe(true);
    });

    it('is false across midnight', () => {
        expect(isSameDay(new Date(2026, 10, 2, 23, 59), new Date(2026, 10, 3, 0, 1))).toBe(false);
    });
});
