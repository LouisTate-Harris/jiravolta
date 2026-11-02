import React, { useState, useRef } from 'react';
import type { ImportBlock } from './importBlock';
import { getIssueColor } from '../../utils/colorUtils';
import { formatTime, snapToQuarterHour, calculateDuration } from '../../utils/dateUtils';
import './ImportBlockCard.css';

interface ImportBlockCardProps {
    block: ImportBlock;
    calendarLabel: string;
    startHour: number;
    isSelected: boolean;
    isClashing: boolean;
    onSelect: () => void;
    onUpdate: (updates: Partial<Pick<ImportBlock, 'start' | 'end'>>) => void;
}

const MINUTES_PER_PIXEL = 1; // 60px per hour, same convention as the main timeline

/**
 * A single block on the import review grid. Drag-to-move and
 * drag-to-resize are adapted from WorklogBlock.tsx's approach (stable
 * ref-backed handlers, original-time snapshot at drag start, 15-minute
 * snapping) since this grid has its own data model (ImportBlock, not
 * Worklog) and its own visual treatment (coloured by calendar, not by
 * issue), but the interaction should feel identical to the rest of the app.
 */
export const ImportBlockCard: React.FC<ImportBlockCardProps> = ({
    block,
    calendarLabel,
    startHour,
    isSelected,
    isClashing,
    onSelect,
    onUpdate,
}) => {
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const dragStartY = useRef(0);
    const originalStart = useRef<Date | null>(null);
    const originalEnd = useRef<Date | null>(null);
    const blockRef = useRef(block);
    const onUpdateRef = useRef(onUpdate);
    const mouseMoveHandlerRef = useRef<((e: MouseEvent) => void) | null>(null);
    const mouseUpHandlerRef = useRef<(() => void) | null>(null);

    React.useEffect(() => {
        blockRef.current = block;
        onUpdateRef.current = onUpdate;
    }, [block, onUpdate]);

    const timeToPixel = (date: Date): number => {
        const hours = date.getHours() - startHour;
        return (hours * 60 + date.getMinutes()) / MINUTES_PER_PIXEL;
    };

    React.useEffect(() => {
        mouseMoveHandlerRef.current = (e: MouseEvent) => {
            const deltaY = e.clientY - dragStartY.current;
            const deltaMinutes = Math.round((deltaY * MINUTES_PER_PIXEL) / 15) * 15;

            if (isDragging && originalStart.current && originalEnd.current) {
                const newStart = new Date(originalStart.current.getTime() + deltaMinutes * 60 * 1000);
                const newEnd = new Date(originalEnd.current.getTime() + deltaMinutes * 60 * 1000);
                const snappedStart = snapToQuarterHour(newStart);
                const durationMs = originalEnd.current.getTime() - originalStart.current.getTime();
                const snappedEnd = new Date(snappedStart.getTime() + durationMs);

                const dayStart = new Date(snappedStart);
                dayStart.setHours(0, 0, 0, 0);
                const dayEnd = new Date(snappedStart);
                dayEnd.setHours(23, 59, 59, 999);
                if (snappedStart < dayStart || snappedEnd > dayEnd) return; // keep it on the same day

                onUpdateRef.current({ start: snappedStart.toISOString(), end: snapToQuarterHour(newEnd).toISOString() });
            } else if (isResizing && originalEnd.current) {
                const newEnd = new Date(originalEnd.current.getTime() + deltaMinutes * 60 * 1000);
                let snappedEnd = snapToQuarterHour(newEnd);
                const dayEnd = new Date(blockRef.current.start);
                dayEnd.setHours(23, 59, 59, 999);
                if (snappedEnd > dayEnd) snappedEnd = dayEnd;

                const duration = calculateDuration(new Date(blockRef.current.start), snappedEnd);
                if (duration >= 15) {
                    onUpdateRef.current({ end: snappedEnd.toISOString() });
                }
            }
        };

        mouseUpHandlerRef.current = () => {
            if (mouseMoveHandlerRef.current) window.removeEventListener('mousemove', mouseMoveHandlerRef.current);
            if (mouseUpHandlerRef.current) window.removeEventListener('mouseup', mouseUpHandlerRef.current);
            originalStart.current = null;
            originalEnd.current = null;
            setIsDragging(false);
            setIsResizing(false);
        };
    });

    const startDrag = (e: React.MouseEvent) => {
        if ((e.target as HTMLElement).classList.contains('import-block-resize-handle')) return;
        e.preventDefault();
        e.stopPropagation();
        onSelect();

        dragStartY.current = e.clientY;
        originalStart.current = new Date(block.start);
        originalEnd.current = new Date(block.end);
        if (mouseMoveHandlerRef.current) window.addEventListener('mousemove', mouseMoveHandlerRef.current);
        if (mouseUpHandlerRef.current) window.addEventListener('mouseup', mouseUpHandlerRef.current);
        setIsDragging(true);
    };

    const startResize = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        onSelect();

        dragStartY.current = e.clientY;
        originalEnd.current = new Date(block.end);
        if (mouseMoveHandlerRef.current) window.addEventListener('mousemove', mouseMoveHandlerRef.current);
        if (mouseUpHandlerRef.current) window.addEventListener('mouseup', mouseUpHandlerRef.current);
        setIsResizing(true);
    };

    React.useEffect(() => () => {
        if (mouseMoveHandlerRef.current) window.removeEventListener('mousemove', mouseMoveHandlerRef.current);
        if (mouseUpHandlerRef.current) window.removeEventListener('mouseup', mouseUpHandlerRef.current);
    }, []);

    const top = timeToPixel(new Date(block.start));
    const height = Math.max(calculateDuration(new Date(block.start), new Date(block.end)) / MINUTES_PER_PIXEL, 10);
    const calendarColor = block.manual ? '#999' : getIssueColor(block.calendarId);

    const classNames = [
        'import-block',
        block.excluded && 'import-block--excluded',
        block.alreadyLogged && 'import-block--logged',
        isClashing && !block.excluded && 'import-block--clash',
        block.manual && 'import-block--manual',
        isSelected && 'import-block--selected',
        isDragging && 'dragging',
        isResizing && 'resizing',
    ].filter(Boolean).join(' ');

    return (
        <div
            className={classNames}
            style={{ top: `${top}px`, height: `${height}px`, borderLeftColor: calendarColor }}
            onMouseDown={startDrag}
            onClick={(e) => { e.stopPropagation(); if (!isDragging && !isResizing) onSelect(); }}
            title={`${block.title} (${calendarLabel})\n${formatTime(new Date(block.start))} - ${formatTime(new Date(block.end))}`}
        >
            <div className="import-block-content">
                <b className="import-block-title">{block.title}</b>
                {height >= 28 && (
                    <span className="import-block-time">
                        {formatTime(new Date(block.start))}–{formatTime(new Date(block.end))}
                    </span>
                )}
            </div>
            <div className="import-block-resize-handle" onMouseDown={startResize} title="Drag to resize" />
        </div>
    );
};
