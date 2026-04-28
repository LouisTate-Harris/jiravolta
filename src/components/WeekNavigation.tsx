import React from 'react';
import { formatDate, getWeekStart, getWeekEnd } from '../utils/dateUtils';
import type { IssueDisplayMode } from '../types';
import './WeekNavigation.css';

interface WeekNavigationProps {
    currentWeek: Date;
    onPreviousWeek: () => void;
    onNextWeek: () => void;
    onToday: () => void;
    issueDisplayMode: IssueDisplayMode;
    onIssueDisplayModeChange: (mode: IssueDisplayMode) => void;
    onClearCache?: () => void;
}

export const WeekNavigation: React.FC<WeekNavigationProps> = ({
    currentWeek,
    onPreviousWeek,
    onNextWeek,
    onToday,
    issueDisplayMode,
    onIssueDisplayModeChange,
    onClearCache,
}) => {
    const weekStart = getWeekStart(currentWeek);
    const weekEnd = getWeekEnd(currentWeek);

    return (
        <div className="week-navigation">
            <div className="week-info">
                <h1>JiraVolta</h1>
                <div className="week-range">
                    {formatDate(weekStart)} — {formatDate(weekEnd)}
                </div>
            </div>
            <div className="week-controls">
                <div className="issue-display-toggle" role="group" aria-label="Issue label mode">
                    <button
                        type="button"
                        className={`toggle-btn ${issueDisplayMode === 'name' ? 'active' : ''}`}
                        onClick={() => onIssueDisplayModeChange('name')}
                    >
                        Ticket Name
                    </button>
                    <button
                        type="button"
                        className={`toggle-btn ${issueDisplayMode === 'key' ? 'active' : ''}`}
                        onClick={() => onIssueDisplayModeChange('key')}
                    >
                        Jira ID
                    </button>
                </div>
                <button onClick={onPreviousWeek} className="nav-btn">
                    ← Previous Week
                </button>
                <button onClick={onToday} className="today-btn">
                    Today
                </button>
                <button onClick={onNextWeek} className="nav-btn">
                    Next Week →
                </button>
                {onClearCache && (
                    <button onClick={onClearCache} className="nav-btn clear-cache-btn" title="Delete all server-side cache files and re-fetch from Jira">
                        Clear Cache
                    </button>
                )}
            </div>
        </div>
    );
};
