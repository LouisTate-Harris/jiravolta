import React from 'react';
import type { Worklog } from '../types';
import { formatDayHeader } from '../utils/dateUtils';
import './StatusMatrix.css';

interface StatusMatrixProps {
    weekDays: Date[];
    worklogs: Worklog[];
    loading?: boolean;
    error?: string | null;
}

interface MatrixData {
    issues: string[];
    matrix: Map<string, Map<number, number>>; // issueKey -> dayIndex -> hours
    dayTotals: number[];
    issueTotals: Map<string, number>;
}

function calculateMatrixData(worklogs: Worklog[], weekDays: Date[]): MatrixData {
    const issues = new Set<string>();
    const matrix = new Map<string, Map<number, number>>();
    const dayTotals = new Array(7).fill(0);
    const issueTotals = new Map<string, number>();

    worklogs.forEach(worklog => {
        const worklogDate = new Date(worklog.start);
        const dayIndex = weekDays.findIndex(day =>
            day.toDateString() === worklogDate.toDateString()
        );

        if (dayIndex === -1) return; // Not in this week

        issues.add(worklog.issueKey);

        if (!matrix.has(worklog.issueKey)) {
            matrix.set(worklog.issueKey, new Map());
        }

        const issueMap = matrix.get(worklog.issueKey)!;
        const hours = worklog.durationMinutes / 60;
        const currentHours = issueMap.get(dayIndex) || 0;
        issueMap.set(dayIndex, currentHours + hours);

        dayTotals[dayIndex] += hours;

        const currentIssueTotal = issueTotals.get(worklog.issueKey) || 0;
        issueTotals.set(worklog.issueKey, currentIssueTotal + hours);
    });

    return {
        issues: Array.from(issues).sort(),
        matrix,
        dayTotals,
        issueTotals,
    };
}

export const StatusMatrix: React.FC<StatusMatrixProps> = ({
    weekDays,
    worklogs,
    loading = false,
    error = null,
}) => {
    const matrixData = calculateMatrixData(worklogs, weekDays);

    if (loading) {
        return (
            <div className="status-matrix loading">
                <p>Loading worklogs...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="status-matrix error">
                <p>Error: {error}</p>
            </div>
        );
    }

    if (matrixData.issues.length === 0) {
        return (
            <div className="status-matrix empty">
                <p>No worklogs for this week</p>
            </div>
        );
    }

    return (
        <div className="status-matrix">
            <table>
                <thead>
                    <tr>
                        <th className="issue-column">Issue</th>
                        {weekDays.map((day, index) => (
                            <th key={index} className="day-column">
                                {formatDayHeader(day)}
                            </th>
                        ))}
                        <th className="total-column">Total</th>
                    </tr>
                </thead>
                <tbody>
                    {matrixData.issues.map(issueKey => (
                        <tr key={issueKey}>
                            <td className="issue-cell">{issueKey}</td>
                            {weekDays.map((_, dayIndex) => {
                                const hours = matrixData.matrix.get(issueKey)?.get(dayIndex) || 0;
                                return (
                                    <td key={dayIndex} className="hours-cell">
                                        {hours > 0 ? hours.toFixed(2) : '—'}
                                    </td>
                                );
                            })}
                            <td className="total-cell">
                                {(matrixData.issueTotals.get(issueKey) || 0).toFixed(2)}
                            </td>
                        </tr>
                    ))}
                </tbody>
                <tfoot>
                    <tr>
                        <td className="total-label">Total</td>
                        {matrixData.dayTotals.map((total, index) => (
                            <td key={index} className="total-cell">
                                {total > 0 ? total.toFixed(2) : '—'}
                            </td>
                        ))}
                        <td className="grand-total-cell">
                            {matrixData.dayTotals.reduce((sum, t) => sum + t, 0).toFixed(2)}
                        </td>
                    </tr>
                </tfoot>
            </table>
        </div>
    );
};
