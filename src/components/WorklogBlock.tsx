import React, { useState, useRef } from 'react';
import type { Worklog } from '../types';
import { formatTime, snapToQuarterHour, calculateDuration } from '../utils/dateUtils';
import { getIssueColor } from '../utils/colorUtils';
import './WorklogBlock.css';

interface WorklogBlockProps {
    worklog: Worklog;
    startHour: number;
    hourHeight: number;
    onUpdate: (updates: Partial<Worklog>) => void;
    onDelete: () => void;
    onDuplicate: () => void;
    allWorklogs: Worklog[];
    weekDays: Date[];
    dayIndex: number;
    dayColumnWidth?: number;
    timelineLeft?: number;
    isSelected: boolean;
    onToggleSelection: (id: string, isMulti: boolean) => void;
    formatIssueLabel: (issueKey: string, maxLength?: number) => string;
    getIssueFullLabel: (issueKey: string) => string;
    colorOverrideMap?: Record<string, string>;
}

const MINUTES_PER_PIXEL = 60 / 60; // Assuming 60px per hour

export const WorklogBlock: React.FC<WorklogBlockProps> = ({
    worklog,
    startHour,
    hourHeight: _hourHeight,
    onUpdate,
    onDelete,
    onDuplicate,
    allWorklogs: _allWorklogs,
    weekDays,
    dayIndex,
    dayColumnWidth = 0,
    timelineLeft: _timelineLeft = 0,
    isSelected,
    onToggleSelection,
    formatIssueLabel,
    getIssueFullLabel,
    colorOverrideMap,
}) => {
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const [_targetDayIndex, setTargetDayIndex] = useState<number | null>(null);
    const dragStartRef = useRef({ x: 0, y: 0 });
    const initialDayIndexRef = useRef(dayIndex);
    const animationFrameRef = useRef<number | null>(null);
    const isDraggingRef = useRef(false);
    const isResizingRef = useRef(false);
    const worklogRef = useRef(worklog);
    const onUpdateRef = useRef(onUpdate);
    const weekDaysRef = useRef(weekDays);
    const dayColumnWidthRef = useRef(dayColumnWidth);
    const [showMenu, setShowMenu] = useState(false);
    const mouseMoveHandlerRef = useRef<((e: MouseEvent) => void) | null>(null);
    const mouseUpHandlerRef = useRef<(() => void) | null>(null);
    const originalStartRef = useRef<Date | null>(null);
    const originalEndRef = useRef<Date | null>(null);

    // Sync props to refs
    React.useEffect(() => {
        worklogRef.current = worklog;
        onUpdateRef.current = onUpdate;
        weekDaysRef.current = weekDays;
        dayColumnWidthRef.current = dayColumnWidth;
    }, [worklog, onUpdate, weekDays, dayColumnWidth]);

    const timeToPixel = (date: Date): number => {
        const hours = date.getHours() - startHour;
        const minutes = date.getMinutes();
        return (hours * 60 + minutes) / MINUTES_PER_PIXEL;
    };

    // Create stable event handlers that never change identity
    React.useEffect(() => {
        // Mouse move handler with requestAnimationFrame throttling
        mouseMoveHandlerRef.current = (e: MouseEvent) => {
            if (animationFrameRef.current !== null) {
                return; // Skip if animation frame already scheduled
            }

            animationFrameRef.current = requestAnimationFrame(() => {
                animationFrameRef.current = null;

                if (isDraggingRef.current) {
                    const deltaY = e.clientY - dragStartRef.current.y;
                    const deltaX = e.clientX - dragStartRef.current.x;
                    const deltaMinutes = Math.round(deltaY * MINUTES_PER_PIXEL / 15) * 15;

                    const currentWeekDays = weekDaysRef.current;
                    const currentDayColumnWidth = dayColumnWidthRef.current;
                    const currentOnUpdate = onUpdateRef.current;

                    // Use original start/end times stored when drag started
                    if (!originalStartRef.current || !originalEndRef.current) return;

                    // Calculate target day based on horizontal movement
                    let newDayIndex = initialDayIndexRef.current;
                    if (currentDayColumnWidth > 0) {
                        const dayOffset = Math.round(deltaX / currentDayColumnWidth);
                        newDayIndex = Math.max(0, Math.min(currentWeekDays.length - 1, initialDayIndexRef.current + dayOffset));
                        setTargetDayIndex(newDayIndex);
                    }

                    // Get the target day's date
                    const targetDay = currentWeekDays[newDayIndex];

                    // Create new start time on the target day using original times
                    const newStart = new Date(targetDay);
                    newStart.setHours(originalStartRef.current.getHours(), originalStartRef.current.getMinutes(), 0, 0);
                    newStart.setMinutes(newStart.getMinutes() + deltaMinutes);
                    let snappedStart = snapToQuarterHour(newStart);

                    // Create new end time on the same target day using original times
                    const newEnd = new Date(targetDay);
                    newEnd.setHours(originalEndRef.current.getHours(), originalEndRef.current.getMinutes(), 0, 0);
                    newEnd.setMinutes(newEnd.getMinutes() + deltaMinutes);
                    let snappedEnd = snapToQuarterHour(newEnd);

                    // Enforce boundaries: don't allow times before 00:00 or after 23:59
                    const dayStart = new Date(targetDay);
                    dayStart.setHours(0, 0, 0, 0);
                    const dayEnd = new Date(targetDay);
                    dayEnd.setHours(23, 59, 59, 999);

                    // If the block would go before start of day, clamp it
                    if (snappedStart < dayStart) {
                        const offset = dayStart.getTime() - snappedStart.getTime();
                        snappedStart = dayStart;
                        snappedEnd = new Date(snappedEnd.getTime() + offset);
                    }

                    // If the block would go past end of day, clamp it
                    if (snappedEnd > dayEnd) {
                        const offset = snappedEnd.getTime() - dayEnd.getTime();
                        snappedEnd = dayEnd;
                        snappedStart = new Date(snappedStart.getTime() - offset);
                        // Make sure start didn't go before day start
                        if (snappedStart < dayStart) {
                            snappedStart = dayStart;
                        }
                    }

                    // Update without overlap checking (overlaps now allowed)
                    currentOnUpdate({
                        start: snappedStart.toISOString(),
                        end: snappedEnd.toISOString(),
                        durationMinutes: calculateDuration(snappedStart, snappedEnd),
                    });
                } else if (isResizingRef.current) {
                    const deltaY = e.clientY - dragStartRef.current.y;
                    const deltaMinutes = Math.round(deltaY * MINUTES_PER_PIXEL / 15) * 15;

                    const currentWorklog = worklogRef.current;
                    const currentOnUpdate = onUpdateRef.current;

                    // Use original end time stored when resize started
                    if (!originalEndRef.current) return;

                    const newEnd = new Date(originalEndRef.current);
                    newEnd.setMinutes(newEnd.getMinutes() + deltaMinutes);
                    let snappedEnd = snapToQuarterHour(newEnd);

                    // Enforce boundary: don't allow end time to go past midnight
                    const startDate = new Date(currentWorklog.start);
                    const dayEnd = new Date(startDate);
                    dayEnd.setHours(23, 59, 59, 999);
                    if (snappedEnd > dayEnd) {
                        snappedEnd = dayEnd;
                    }

                    const newDuration = calculateDuration(new Date(currentWorklog.start), snappedEnd);

                    if (newDuration >= 15) {
                        // Update without overlap checking (overlaps now allowed)
                        currentOnUpdate({
                            end: snappedEnd.toISOString(),
                            durationMinutes: newDuration,
                        });
                    }
                }
            });
        };

        // Mouse up handler
        mouseUpHandlerRef.current = () => {
            if (animationFrameRef.current !== null) {
                cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
            }

            // Remove event listeners
            if (mouseMoveHandlerRef.current) {
                window.removeEventListener('mousemove', mouseMoveHandlerRef.current);
            }
            if (mouseUpHandlerRef.current) {
                window.removeEventListener('mouseup', mouseUpHandlerRef.current);
            }

            // Clear drag state
            isDraggingRef.current = false;
            isResizingRef.current = false;
            originalStartRef.current = null;
            originalEndRef.current = null;

            // Update React state
            setIsDragging(false);
            setIsResizing(false);
            setTargetDayIndex(null);
        };
    });

    const handleDragStart = (e: React.MouseEvent) => {
        if ((e.target as HTMLElement).classList.contains('resize-handle')) {
            return; // Let resize handle its own event
        }
        e.preventDefault();
        e.stopPropagation();

        // Set drag state
        isDraggingRef.current = true;
        dragStartRef.current = { x: e.clientX, y: e.clientY };
        initialDayIndexRef.current = dayIndex;
        setTargetDayIndex(dayIndex);

        // Store original times for this drag operation
        originalStartRef.current = new Date(worklog.start);
        originalEndRef.current = new Date(worklog.end);

        // Add event listeners with stable handlers
        if (mouseMoveHandlerRef.current) {
            window.addEventListener('mousemove', mouseMoveHandlerRef.current);
        }
        if (mouseUpHandlerRef.current) {
            window.addEventListener('mouseup', mouseUpHandlerRef.current);
        }

        setIsDragging(true);
    };

    const handleResizeStart = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        // Set resize state
        isResizingRef.current = true;
        dragStartRef.current = { x: e.clientX, y: e.clientY };

        // Store original end time for this resize operation
        originalEndRef.current = new Date(worklog.end);

        // Add event listeners with stable handlers
        if (mouseMoveHandlerRef.current) {
            window.addEventListener('mousemove', mouseMoveHandlerRef.current);
        }
        if (mouseUpHandlerRef.current) {
            window.addEventListener('mouseup', mouseUpHandlerRef.current);
        }

        setIsResizing(true);
    };

    // Cleanup on unmount
    React.useEffect(() => {
        return () => {
            if (animationFrameRef.current !== null) {
                cancelAnimationFrame(animationFrameRef.current);
            }
            // Remove event listeners if component unmounts during drag
            if (mouseMoveHandlerRef.current) {
                window.removeEventListener('mousemove', mouseMoveHandlerRef.current);
            }
            if (mouseUpHandlerRef.current) {
                window.removeEventListener('mouseup', mouseUpHandlerRef.current);
            }
        };
    }, []);

    const top = timeToPixel(new Date(worklog.start));
    const height = worklog.durationMinutes / MINUTES_PER_PIXEL;
    const isDraft = worklog.source === 'draft';
    const issueColor = colorOverrideMap?.[worklog.issueKey] ?? getIssueColor(worklog.issueKey);

    return (
        <>
            <div
                className={`worklog-block ${isDraft ? 'worklog-block--draft' : 'worklog-block--jira'} ${isDragging ? 'dragging' : ''} ${isResizing ? 'resizing' : ''} ${isSelected ? 'selected' : ''}`}
                style={{
                    top: `${top}px`,
                    height: `${height}px`,
                    backgroundColor: issueColor,
                }}
                onMouseDown={handleDragStart}
                onClick={(e) => {
                    // Only handle click if not dragging/resizing
                    if (!isDragging && !isResizing) {
                        const isMulti = e.ctrlKey || e.metaKey; // Ctrl on Windows/Linux, Cmd on Mac
                        onToggleSelection(worklog.id, isMulti);
                    }
                }}
                onContextMenu={(e) => {
                    e.preventDefault();
                    setShowMenu(true);
                }}
                title={`${getIssueFullLabel(worklog.issueKey)} (${worklog.issueKey})\n${formatTime(new Date(worklog.start))} - ${formatTime(new Date(worklog.end))}\n${worklog.durationMinutes}m`}
            >
                <div className="worklog-content">
                    <div className="worklog-issue">{formatIssueLabel(worklog.issueKey, 22)}</div>
                    {height > 30 && (
                        <>
                            <div className="worklog-time">
                                {formatTime(new Date(worklog.start))} - {formatTime(new Date(worklog.end))}
                            </div>
                            {height > 50 && (
                                <div className="worklog-duration">{worklog.durationMinutes}m</div>
                            )}
                        </>
                    )}
                </div>
                <div
                    className="resize-handle"
                    onMouseDown={handleResizeStart}
                    title="Drag to resize"
                />
            </div>

            {showMenu && (
                <>
                    <div className="context-menu-overlay" onClick={() => setShowMenu(false)} />
                    <div
                        className="context-menu"
                        style={{
                            top: `${top + height / 2}px`,
                            left: '100%',
                        }}
                    >
                        <button onClick={() => { onDuplicate(); setShowMenu(false); }}>
                            Duplicate
                        </button>
                        <button onClick={() => { onDelete(); setShowMenu(false); }}>
                            Delete
                        </button>
                    </div>
                </>
            )}
        </>
    );
};
