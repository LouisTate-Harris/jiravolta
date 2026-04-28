import type { IssueDisplayMode } from '../types';

export function trimLabel(label: string, maxLength: number): string {
    if (maxLength <= 0 || label.length <= maxLength) {
        return label;
    }

    if (maxLength <= 1) {
        return '…';
    }

    return `${label.slice(0, maxLength - 1)}…`;
}

export function getIssueLabel(
    issueKey: string,
    issueNameMap: Record<string, string>,
    mode: IssueDisplayMode,
    maxLength?: number,
): string {
    const base = mode === 'name' ? (issueNameMap[issueKey] || issueKey) : issueKey;
    if (!maxLength || maxLength < 1) {
        return base;
    }

    return trimLabel(base, maxLength);
}
