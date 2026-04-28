import React, { useState, useRef, useCallback } from 'react';
import type { Worklog, DraftWorklog } from '../types';
import { snapToQuarterHour, formatTime, calculateDuration } from '../utils/dateUtils';
import { checkForOverlaps } from '../utils/validationUtils';
import { WorklogBlock } from './WorklogBlock';
import './InteractiveTimeline.css';

interface InteractiveTimelineProps {
    weekDays: Date[];
    worklogs: Worklog[];
    onCreateWorklog: (worklog: DraftWorklog) => void;
    onUpdateWorklog: (id: string, updates: Partial<Worklog>) => void;
    onDeleteWorklog: (id: string) => void;
    onDuplicateWorklog: (id: string) => void;
    availableIssues: string[];
    formatIssueLabel: (issueKey: string, maxLength?: number) => string;
    getIssueFullLabel: (issueKey: string) => string;
    startHour?: number;
    endHour?: number;
    selectedWorklogIds: Set<string>;
    onToggleSelection: (id: string, isMulti: boolean) => void;
    clipboardWorklogs: Worklog[];
    onPasteWorklogs: (dayIndex: number, cursorTime: Date) => void;
}

interface DragState {
    type: 'create' | 'move' | 'resize';
    dayIndex: number;
    startY: number;
    initialStartTime?: Date;
    initialEndTime?: Date;
    worklogId?: string;
}

const HOUR_HEIGHT = 60; // pixels per hour
const MINUTES_PER_PIXEL = 60 / HOUR_HEIGHT;

export const InteractiveTimeline: React.FC<InteractiveTimelineProps> = ({
    weekDays,
    worklogs,
    onCreateWorklog,
    onUpdateWorklog,
    onDeleteWorklog,
    onDuplicateWorklog,
    availableIssues,
    formatIssueLabel,
    getIssueFullLabel,
    startHour = 0,
    endHour = 23,
    selectedWorklogIds,
    onToggleSelection,
    clipboardWorklogs,
    onPasteWorklogs,
}) => {
    const [dragState, setDragState] = useState<DragState | null>(null);
    const [previewWorklog, setPreviewWorklog] = useState<Worklog | null>(null);
    const [overlapWarning, setOverlapWarning] = useState<string | null>(null);
    const [selectedIssue, setSelectedIssue] = useState<string>(availableIssues[0] || 'PROJ-101');
    const timelineRef = useRef<HTMLDivElement>(null);
    const timelineContainerRef = useRef<HTMLDivElement>(null);
    const gridRef = useRef<HTMLDivElement>(null);
    const lastHoverRef = useRef<{ dayIndex: number; time: Date } | null>(null);
    const [dayColumnWidth, setDayColumnWidth] = useState<number>(0);

    // Calculate dynamic hour range based on worklogs
    const { actualStartHour, actualEndHour } = React.useMemo(() => {
        let minHour = startHour;
        let maxHour = endHour;

        // Check all worklogs for their time ranges
        worklogs.forEach(worklog => {
            const start = new Date(worklog.start);
            const end = new Date(worklog.end);
            const startHourVal = start.getHours();
            const endHourVal = end.getHours();

            minHour = Math.min(minHour, startHourVal);
            maxHour = Math.max(maxHour, endHourVal);
        });

        // Also check preview worklog if it exists
        if (previewWorklog) {
            const start = new Date(previewWorklog.start);
            const end = new Date(previewWorklog.end);
            minHour = Math.min(minHour, start.getHours());
            maxHour = Math.max(maxHour, end.getHours());
        }

        // Ensure we never go below 0 or above 23
        return {
            actualStartHour: Math.max(0, minHour),
            actualEndHour: Math.min(23, maxHour)
        };
    }, [worklogs, previewWorklog, startHour, endHour]);

    const hours = Array.from({ length: actualEndHour - actualStartHour + 1 }, (_, i) => actualStartHour + i);

    // Auto-scroll to 08:00 on mount and week change
    React.useEffect(() => {
        if (timelineContainerRef.current) {
            // Scroll to 8am relative to actualStartHour
            const scrollPosition = (8 - actualStartHour) * HOUR_HEIGHT;
            timelineContainerRef.current.scrollTop = Math.max(0, scrollPosition);
        }
    }, [weekDays, actualStartHour]);

    // Calculate day column width on mount and resize
    React.useEffect(() => {
        const updateDayColumnWidth = () => {
            if (timelineContainerRef.current) {
                const grid = timelineContainerRef.current.querySelector('.timeline-grid');
                if (grid) {
                    const width = grid.clientWidth / weekDays.length;
                    setDayColumnWidth(width);
                }
            }
        };

        updateDayColumnWidth();
        window.addEventListener('resize', updateDayColumnWidth);
        return () => window.removeEventListener('resize', updateDayColumnWidth);
    }, [weekDays.length]);

    // Ctrl+V: paste clipboard worklogs at the last hovered position
    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
                const target = e.target as HTMLElement;
                if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
                if (clipboardWorklogs.length > 0 && lastHoverRef.current) {
                    e.preventDefault();
                    onPasteWorklogs(lastHoverRef.current.dayIndex, lastHoverRef.current.time);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [clipboardWorklogs, onPasteWorklogs]);

    const pixelToTime = useCallback((y: number, baseDate: Date): Date => {
        const minutes = y * MINUTES_PER_PIXEL;
        const date = new Date(baseDate);
        date.setHours(actualStartHour, 0, 0, 0);
        date.setMinutes(minutes);
        return snapToQuarterHour(date);
    }, [actualStartHour]);

    const timeToPixel = useCallback((date: Date): number => {
        const hours = date.getHours() - actualStartHour;
        const minutes = date.getMinutes();
        return (hours * 60 + minutes) / MINUTES_PER_PIXEL;
    }, [actualStartHour]);

    const handleMouseDown = (e: React.MouseEvent, dayIndex: number) => {
        if ((e.target as HTMLElement).classList.contains('worklog-block')) {
            return; // Let the block handle its own drag
        }

        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const y = e.clientY - rect.top;

        setDragState({
            type: 'create',
            dayIndex,
            startY: y,
        });

        const startTime = pixelToTime(y, weekDays[dayIndex]);
        setPreviewWorklog({
            id: 'preview',
            issueKey: selectedIssue,
            start: startTime.toISOString(),
            end: startTime.toISOString(),
            durationMinutes: 0,
            source: 'draft',
        });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        // Always track hover position for paste support
        if (timelineRef.current && gridRef.current && dayColumnWidth > 0) {
            const timeRect = timelineRef.current.getBoundingClientRect();
            const gridRect = gridRef.current.getBoundingClientRect();
            const y = e.clientY - timeRect.top;
            const xInGrid = e.clientX - gridRect.left;
            if (y >= 0 && xInGrid >= 0 && xInGrid <= gridRect.width) {
                const hoveredDayIndex = Math.max(0, Math.min(weekDays.length - 1, Math.floor(xInGrid / dayColumnWidth)));
                lastHoverRef.current = { dayIndex: hoveredDayIndex, time: pixelToTime(y, weekDays[hoveredDayIndex]) };
            }
        }

        if (!dragState || !timelineRef.current) return;

        const rect = timelineRef.current.getBoundingClientRect();
        const y = e.clientY - rect.top;

        if (dragState.type === 'create' && previewWorklog) {
            const startY = Math.min(dragState.startY, y);
            const endY = Math.max(dragState.startY, y);
            const duration = Math.max((endY - startY) * MINUTES_PER_PIXEL, 15);

            const startTime = pixelToTime(startY, weekDays[dragState.dayIndex]);
            const endTime = new Date(startTime);
            endTime.setMinutes(endTime.getMinutes() + duration);

            const updatedPreview = {
                ...previewWorklog,
                start: startTime.toISOString(),
                end: snapToQuarterHour(endTime).toISOString(),
                durationMinutes: calculateDuration(startTime, snapToQuarterHour(endTime)),
            };

            // Check for overlaps (informational only)
            const hasOverlap = checkForOverlaps(updatedPreview, worklogs);
            setOverlapWarning(hasOverlap ? 'Overlapping with existing worklog' : null);

            setPreviewWorklog(updatedPreview);
        }
    };

    const handleMouseUp = () => {
        if (dragState?.type === 'create' && previewWorklog && previewWorklog.durationMinutes >= 15) {
            // Create worklog (overlaps now allowed)
            const draft: DraftWorklog = {
                ...previewWorklog,
                id: crypto.randomUUID(),
                source: 'draft',
                changeType: 'create',
                lastModified: new Date().toISOString(),
            };
            onCreateWorklog(draft);
        }

        setDragState(null);
        setPreviewWorklog(null);
        setOverlapWarning(null);
    };

    const getWorklogsForDay = (dayIndex: number): Worklog[] => {
        const targetDate = weekDays[dayIndex];
        return worklogs.filter(worklog => {
            const worklogDate = new Date(worklog.start);
            return worklogDate.toDateString() === targetDate.toDateString();
        });
    };

    return (
        <div className="interactive-timeline">
            <div className="timeline-header">
                <div className="issue-selector">
                    <label>New issue assigned to: </label>
                    <select value={selectedIssue} onChange={(e) => setSelectedIssue(e.target.value)}>
                        {availableIssues.map(issue => (
                            <option key={issue} value={issue} title={getIssueFullLabel(issue)}>
                                {formatIssueLabel(issue, 46)}
                            </option>
                        ))}
                    </select>
                </div>
                {overlapWarning && (
                    <div className="overlap-warning">{overlapWarning}</div>
                )}
            </div>

            <div className="timeline-day-headers">
                <div className="timeline-day-headers-spacer" />
                {weekDays.map((day, dayIndex) => {
                    const isToday = day.toDateString() === new Date().toDateString();
                    return (
                        <div key={dayIndex} className={`timeline-day-header${isToday ? ' timeline-day-header--today' : ''}`}>
                            <span className="timeline-day-header-name">
                                {day.toLocaleDateString('en-GB', { weekday: 'short' })}
                            </span>
                            <span className="timeline-day-header-date">
                                {day.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                            </span>
                        </div>
                    );
                })}
            </div>

            <div
                className="timeline-container"
                ref={timelineContainerRef}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={() => {
                    handleMouseUp();
                    lastHoverRef.current = null;
                }}
            >
                <div className="time-labels" ref={timelineRef}>
                    {hours.map(hour => (
                        <div key={hour} className="time-label" style={{ height: `${HOUR_HEIGHT}px` }}>
                            {hour.toString().padStart(2, '0')}:00
                        </div>
                    ))}
                </div>

                <div className="timeline-grid" ref={gridRef}>
                    {weekDays.map((_day, dayIndex) => (
                        <div
                            key={dayIndex}
                            className="day-column"
                            onMouseDown={(e) => handleMouseDown(e, dayIndex)}
                        >
                            {hours.map((_hour, hourIndex) => (
                                <div
                                    key={hourIndex}
                                    className="hour-cell"
                                    style={{ height: `${HOUR_HEIGHT}px` }}
                                >
                                    <div className="quarter-markers">
                                        <div className="marker" />
                                        <div className="marker" />
                                        <div className="marker" />
                                    </div>
                                </div>
                            ))}

                            {getWorklogsForDay(dayIndex).map(worklog => (
                                <WorklogBlock
                                    key={worklog.id + worklog.start}
                                    worklog={worklog}
                                    startHour={actualStartHour}
                                    hourHeight={HOUR_HEIGHT}
                                    onUpdate={(updates) => onUpdateWorklog(worklog.id, updates)}
                                    onDelete={() => onDeleteWorklog(worklog.id)}
                                    onDuplicate={() => onDuplicateWorklog(worklog.id)}
                                    allWorklogs={worklogs}
                                    weekDays={weekDays}
                                    dayIndex={dayIndex}
                                    dayColumnWidth={dayColumnWidth}
                                    timelineLeft={timelineRef.current?.getBoundingClientRect().left || 0}
                                    isSelected={selectedWorklogIds.has(worklog.id)}
                                    onToggleSelection={onToggleSelection}
                                    formatIssueLabel={formatIssueLabel}
                                    getIssueFullLabel={getIssueFullLabel}
                                />
                            ))}

                            {previewWorklog && dragState?.dayIndex === dayIndex && (
                                <div
                                    className={`worklog-block preview ${overlapWarning ? 'overlap' : ''}`}
                                    style={{
                                        top: `${timeToPixel(new Date(previewWorklog.start))}px`,
                                        height: `${previewWorklog.durationMinutes / MINUTES_PER_PIXEL}px`,
                                    }}
                                >
                                    <div className="worklog-content">
                                        <div className="worklog-issue" title={getIssueFullLabel(previewWorklog.issueKey)}>
                                            {formatIssueLabel(previewWorklog.issueKey, 26)}
                                        </div>
                                        <div className="worklog-time">
                                            {formatTime(new Date(previewWorklog.start))} - {formatTime(new Date(previewWorklog.end))}
                                        </div>
                                        <div className="worklog-duration">
                                            {previewWorklog.durationMinutes}m
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
