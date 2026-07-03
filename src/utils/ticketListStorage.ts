const STORAGE_KEY = 'jiravolta-ticket-list';

export interface TicketEntry {
    key: string;
    alias?: string;
    color?: string;
}

export function loadTicketList(): TicketEntry[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
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
    } catch {
        return [];
    }
}

export function saveTicketList(list: TicketEntry[]): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (err) {
        console.error('[ticketListStorage] Failed to save ticket list', err);
    }
}
