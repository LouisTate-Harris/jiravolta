import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mergeIssuePool, fetchIssuePool } from './issuePool';

describe('mergeIssuePool', () => {
    it('keeps every source an issue appears in', () => {
        const pool = mergeIssuePool({
            sprint: [{ key: 'ABC-1', summary: 'In sprint and filter' }],
            filter: [{ key: 'ABC-1', summary: 'In sprint and filter' }, { key: 'ABC-2', summary: 'Filter only' }],
            assigned: [{ key: 'ABC-3', summary: 'Assigned only' }],
        });

        expect(pool).toEqual([
            { key: 'ABC-1', summary: 'In sprint and filter', sources: ['sprint', 'filter'] },
            { key: 'ABC-2', summary: 'Filter only', sources: ['filter'] },
            { key: 'ABC-3', summary: 'Assigned only', sources: ['assigned'] },
        ]);
    });

    it('sorts by key numerically within a project prefix', () => {
        const pool = mergeIssuePool({ sprint: [{ key: 'ABC-10', summary: 'ten' }, { key: 'ABC-2', summary: 'two' }] });
        expect(pool.map(p => p.key)).toEqual(['ABC-2', 'ABC-10']);
    });

    it('returns an empty pool when every source is empty', () => {
        expect(mergeIssuePool({ sprint: [], filter: [], assigned: [] })).toEqual([]);
    });
});

const BASE_URL = 'https://example-tenant.invalid';
const AUTH = 'Basic dGVzdDp0ZXN0';

function jqlResponse(issues: Array<{ key: string; summary: string }>, nextPageToken?: string) {
    return {
        ok: true,
        json: () => Promise.resolve({
            issues: issues.map(i => ({ key: i.key, fields: { summary: i.summary } })),
            nextPageToken,
        }),
    };
}

describe('fetchIssuePool', () => {
    beforeEach(() => { vi.restoreAllMocks(); });
    afterEach(() => { vi.unstubAllGlobals(); });

    it('merges sprint, filter and assigned issues from three separate calls', async () => {
        const fetchMock = vi.fn()
            // 1: active sprint lookup for the board
            .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ values: [{ id: 99 }] }) })
            // 2: sprint issues page
            .mockResolvedValueOnce(jqlResponse([{ key: 'SPR-1', summary: 'Sprint issue' }]))
            // 3: filter issues
            .mockResolvedValueOnce(jqlResponse([{ key: 'FLT-1', summary: 'Filter issue' }]))
            // 4: assigned-to-me issues
            .mockResolvedValueOnce(jqlResponse([{ key: 'ASG-1', summary: 'Assigned issue' }]));
        vi.stubGlobal('fetch', fetchMock);

        const pool = await fetchIssuePool({ baseUrl: BASE_URL, authHeader: AUTH, boardId: '99', filterId: '12345' });

        expect(pool.map(p => p.key)).toEqual(['ASG-1', 'FLT-1', 'SPR-1']);
        expect(fetchMock).toHaveBeenCalledTimes(4);
        expect(fetchMock.mock.calls[0][0]).toContain('/board/99/sprint?state=active');
    });

    it('treats a board with no active sprint as empty, not a failure', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({ ok: false, status: 400 }) // no active sprint on this board
            .mockResolvedValueOnce(jqlResponse([{ key: 'ASG-1', summary: 'Assigned issue' }])); // no filterId, so this is "assigned"
        vi.stubGlobal('fetch', fetchMock);

        const pool = await fetchIssuePool({ baseUrl: BASE_URL, authHeader: AUTH, boardId: '99' });

        expect(pool).toEqual([{ key: 'ASG-1', summary: 'Assigned issue', sources: ['assigned'] }]);
    });

    it('skips the sprint and filter calls entirely when no board/filter id is configured', async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce(jqlResponse([{ key: 'ASG-1', summary: 'Assigned issue' }]));
        vi.stubGlobal('fetch', fetchMock);

        const pool = await fetchIssuePool({ baseUrl: BASE_URL, authHeader: AUTH });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(pool).toEqual([{ key: 'ASG-1', summary: 'Assigned issue', sources: ['assigned'] }]);
    });

    it('paginates sprint issues across startAt/total', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ values: [{ id: 99 }] }) })
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    issues: [{ key: 'SPR-1', fields: { summary: 'One' } }],
                    startAt: 0, maxResults: 1, total: 2,
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    issues: [{ key: 'SPR-2', fields: { summary: 'Two' } }],
                    startAt: 1, maxResults: 1, total: 2,
                }),
            })
            .mockResolvedValueOnce(jqlResponse([])); // assigned
        vi.stubGlobal('fetch', fetchMock);

        const pool = await fetchIssuePool({ baseUrl: BASE_URL, authHeader: AUTH, boardId: '99' });

        expect(pool.map(p => p.key)).toEqual(['SPR-1', 'SPR-2']);
    });

    it('falls back to the issue key when a summary is missing', async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ issues: [{ key: 'ASG-1', fields: {} }] }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const pool = await fetchIssuePool({ baseUrl: BASE_URL, authHeader: AUTH });
        expect(pool[0].summary).toBe('ASG-1');
    });
});
