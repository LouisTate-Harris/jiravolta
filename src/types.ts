export interface Worklog {
    id: string;
    issueKey: string;
    start: string;
    end: string;
    durationMinutes: number;
    source: 'jira' | 'draft';
    comment?: string;
}

export interface DraftWorklog extends Worklog {
    source: 'draft';
    changeType: 'create' | 'update' | 'delete';
    lastModified: string;
}

export interface WeekData {
    startDate: Date;
    endDate: Date;
    worklogs: Worklog[];
    drafts: DraftWorklog[];
}

export interface MatrixCell {
    issueKey: string;
    dayIndex: number;
    hours: number;
}

export interface IssueTotal {
    issueKey: string;
    totalHours: number;
    dailyHours: number[];
}

export type IssueDisplayMode = 'name' | 'key';
