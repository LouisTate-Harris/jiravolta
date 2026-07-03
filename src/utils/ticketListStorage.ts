const ENDPOINT = '/_local/jira-ticket-list';

export interface TicketEntry {
    key: string;
    alias?: string;
    color?: string;
}

function normalizeTicketList(parsed: unknown): TicketEntry[] {
    if (!Array.isArray(parsed)) return [];
    const entries: TicketEntry[] = parsed.map((item: unknown) => {
        if (typeof item === 'string') return { key: item };
        if (
            typeof item === 'object' &&
            item !== null &&
            typeof (item as Record<string, unknown>).key === 'string'
        ) {
            return item as TicketEntry;
        }
        return null;
    }).filter((item): item is TicketEntry => item !== null);
    const seen = new Set<string>();
    return entries.filter(e => {
        if (seen.has(e.key)) return false;
        seen.add(e.key);
        return true;
    });
}

export async function loadTicketList(): Promise<TicketEntry[]> {
    try {
        const response = await fetch(ENDPOINT);
        if (!response.ok) return [];
        const parsed = await response.json();
        return normalizeTicketList(parsed);
    } catch (err) {
        console.error('[ticketListStorage] Failed to load ticket list', err);
        return [];
    }
}

export async function saveTicketList(list: TicketEntry[]): Promise<void> {
    try {
        await fetch(ENDPOINT, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(list),
        });
    } catch (err) {
        console.error('[ticketListStorage] Failed to save ticket list', err);
    }
}
