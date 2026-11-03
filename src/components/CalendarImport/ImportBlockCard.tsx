import React, { useEffect, useRef, useState } from 'react';
import type { ImportBlock } from './importBlock';
import { calendarColor } from './importBlock';
import { formatTime, snapToQuarterHour, calculateDuration } from '../../utils/dateUtils';
import './ImportBlockCard.css';

interface ImportBlockCardProps {
    block: ImportBlock;
    calendarLabel: string;
    startHour: number;
    /** Position among side-by-side overlapping blocks. */
    lane: number;
    lanes: number;
    isSelected: boolean;
    isClashing: boolean;
    onSelect: () => void;
    onUpdate: (updates: Partial<Pick<ImportBlock, 'start' | 'end'>>) => void;
}

const MINUTES_PER_PIXEL = 1; // 60px per hour, same convention as the main timeline
const LINE_HEIGHT = 14;

type DragMode = 'move' | 'resize';

interface DragOrigin {
    x: number;
    y: number;
    start: Date;
    end: Date;
    /** Index of this block's day column and the left/right edges of every column, captured at mousedown. */
    dayIndex: number;
    columns: Array<{ left: number; right: number }>;
}

/**
 * A single block on the import review grid. Drag to move (up/down in time,
 * left/right between days) or drag the bottom edge to resize, snapping to 15
 * minutes like the main timeline.
 *
 * The window listeners are registered once per drag and read everything
 * through refs. They must not close over render state: a listener added at
 * mousedown would otherwise see the "not dragging yet" state forever, and the
 * block would never move.
 */
export const ImportBlockCard: React.FC<ImportBlockCardProps> = ({
    block,
    calendarLabel,
    startHour,
    lane,
    lanes,
    isSelected,
    isClashing,
    onSelect,
    onUpdate,
}) => {
    const [mode, setMode] = useState<DragMode | null>(null);
    const modeRef = useRef<DragMode | null>(null);
    const origin = useRef<DragOrigin | null>(null);
    const blockRef = useRef(block);
    const onUpdateRef = useRef(onUpdate);
    const handlersRef = useRef<{ move: (e: MouseEvent) => void; up: () => void } | null>(null);

    useEffect(() => {
        blockRef.current = block;
        onUpdateRef.current = onUpdate;
    }, [block, onUpdate]);

    useEffect(() => {
        const move = (e: MouseEvent) => {
            const o = origin.current;
            if (!o || !modeRef.current) return;

            const deltaMinutes = Math.round(((e.clientY - o.y) * MINUTES_PER_PIXEL) / 15) * 15;

            if (modeRef.current === 'move') {
                let dayIndex = o.dayIndex;
                const hit = o.columns.findIndex(c => e.clientX >= c.left && e.clientX < c.right);
                if (hit !== -1) dayIndex = hit;

                const base = new Date(o.start);
                base.setDate(base.getDate() + (dayIndex - o.dayIndex));
                const start = snapToQuarterHour(new Date(base.getTime() + deltaMinutes * 60 * 1000));
                const end = new Date(start.getTime() + (o.end.getTime() - o.start.getTime()));
                if (start.toDateString() !== base.toDateString() || end.toDateString() !== base.toDateString()) return; // stay within the day
                onUpdateRef.current({ start: start.toISOString(), end: end.toISOString() });
            } else {
                const start = new Date(blockRef.current.start);
                let end = snapToQuarterHour(new Date(o.end.getTime() + deltaMinutes * 60 * 1000));
                if (end.toDateString() !== start.toDateString()) {
                    end = new Date(start);
                    end.setHours(23, 45, 0, 0);
                }
                if (calculateDuration(start, end) >= 15) onUpdateRef.current({ end: end.toISOString() });
            }
        };

        const up = () => {
            window.removeEventListener('mousemove', move);
            window.removeEventListener('mouseup', up);
            origin.current = null;
            modeRef.current = null;
            setMode(null);
        };

        handlersRef.current = { move, up };
        return up; // also detaches if the card unmounts mid-drag
    }, []);

    const begin = (e: React.MouseEvent, next: DragMode) => {
        e.preventDefault();
        e.stopPropagation();
        onSelect();

        const column = (e.currentTarget as HTMLElement).closest('.import-day-column');
        const columns = column?.parentElement
            ? Array.from(column.parentElement.children).map(c => {
                const r = c.getBoundingClientRect();
                return { left: r.left, right: r.right };
            })
            : [];

        origin.current = {
            x: e.clientX,
            y: e.clientY,
            start: new Date(block.start),
            end: new Date(block.end),
            dayIndex: column?.parentElement ? Array.from(column.parentElement.children).indexOf(column) : 0,
            columns,
        };
        modeRef.current = next;
        setMode(next);

        const handlers = handlersRef.current;
        if (handlers) {
            window.addEventListener('mousemove', handlers.move);
            window.addEventListener('mouseup', handlers.up);
        }
    };

    const timeToPixel = (date: Date): number => ((date.getHours() - startHour) * 60 + date.getMinutes()) / MINUTES_PER_PIXEL;

    const top = timeToPixel(new Date(block.start));
    const height = Math.max(calculateDuration(new Date(block.start), new Date(block.end)) / MINUTES_PER_PIXEL, 10);
    const showTime = height >= 40;
    const titleLines = Math.max(1, Math.floor((height - 8 - (showTime ? 12 : 0)) / LINE_HEIGHT));

    const classNames = [
        'import-block',
        block.excluded && 'import-block--excluded',
        block.alreadyLogged && 'import-block--logged',
        isClashing && !block.excluded && 'import-block--clash',
        block.manual && 'import-block--manual',
        isSelected && 'import-block--selected',
        mode === 'move' && 'dragging',
        mode === 'resize' && 'resizing',
    ].filter(Boolean).join(' ');

    return (
        <div
            className={classNames}
            style={{
                top: `${top}px`,
                height: `${height}px`,
                left: `calc(${lane} * 100% / ${lanes} + 2px)`,
                width: `calc(100% / ${lanes} - 4px)`,
                right: 'auto',
                borderLeftColor: calendarColor(block.calendarId),
                '--title-lines': titleLines,
            } as React.CSSProperties}
            onMouseDown={e => begin(e, 'move')}
            onClick={e => { e.stopPropagation(); if (!mode) onSelect(); }}
            title={`${block.title} (${calendarLabel})\n${formatTime(new Date(block.start))} - ${formatTime(new Date(block.end))}`}
        >
            <div className="import-block-content">
                <b className="import-block-title">{block.title}</b>
                {showTime && (
                    <span className="import-block-time">
                        {formatTime(new Date(block.start))}–{formatTime(new Date(block.end))}
                    </span>
                )}
            </div>
            <div className="import-block-resize-handle" onMouseDown={e => begin(e, 'resize')} title="Drag to resize" />
        </div>
    );
};
