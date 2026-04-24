import React from 'react';
import { formatDate, getWeekStart, getWeekEnd } from '../utils/dateUtils';
import './WeekNavigation.css';

interface WeekNavigationProps {
    currentWeek: Date;
    onPreviousWeek: () => void;
    onNextWeek: () => void;
    onToday: () => void;
}

export const WeekNavigation: React.FC<WeekNavigationProps> = ({
    currentWeek,
    onPreviousWeek,
    onNextWeek,
    onToday,
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
                <button onClick={onPreviousWeek} className="nav-btn">
                    ← Previous Week
                </button>
                <button onClick={onToday} className="today-btn">
                    Today
                </button>
                <button onClick={onNextWeek} className="nav-btn">
                    Next Week →
                </button>
            </div>
        </div>
    );
};
