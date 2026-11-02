import React, { useMemo, useState } from 'react';
import type { ImportBlock } from './importBlock';
import { createManualBlock } from './importBlock';
import { ImportBlockCard } from './ImportBlockCard';
import type { CalendarInfo } from '../../services/calendarService';
import './ImportBlockGrid.css';

interface ImportBlockGridProps {
    weekDays: Date[];
    blocks: ImportBlock[];
    calendars: CalendarInfo[];
    selectedBlockId: string | null;
    clashingIds: Set<string>;
    onSelectBlock: (id: string | null) => void;
    onUpdateBlock: (id: string, updates: Partial<Pick<ImportBlock, 'start' | 'end'>>) => void;
    onCreateManualBlock: (block: ImportBlock) => void;
}

const HOUR_HEIGHT = 60;
const DEFAULT_START_HOUR = 7;
const DEFAULT_END_HOUR = 19;

/**
 * Flex-based layout (day columns share the row equally, same as
 * InteractiveTimeline.css) rather than a fixed CSS Grid column count, so it
 * scales correctly to however many days are in weekDays — the app's week
 * always has all 7, not just Mon-Fri.
 */
export const ImportBlockGrid: React.FC<ImportBlockGridProps> = ({
    weekDays,
    blocks,
    calendars,
    selectedBlockId,
    clashingIds,
    onSelectBlock,
    onUpdateBlock,
    onCreateManualBlock,
}) => {
    const [createDrag, setCreateDrag] = useState<{ dayIndex: number; startY: number; currentY: number } | null>(null);

    const { startHour, endHour } = useMemo(() => {
        let min = DEFAULT_START_HOUR;
        let max = DEFAULT_END_HOUR;
        for (const block of blocks) {
            if (block.allDay) continue;
            min = Math.min(min, new Date(block.start).getHours());
            max = Math.max(max, new Date(block.end).getHours() + (new Date(block.end).getMinutes() > 0 ? 1 : 0));
        }
        return { startHour: Math.max(0, min), endHour: Math.min(24, max) };
    }, [blocks]);

    const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);

    const pixelToMinutesFromMidnight = (y: number): number => {
        const minutes = startHour * 60 + y;
        return Math.max(0, Math.min(23 * 60 + 45, minutes));
    };

    const blocksForDay = (dayIndex: number): ImportBlock[] => {
        const target = weekDays[dayIndex];
        return blocks.filter(b => !b.allDay && new Date(b.start).toDateString() === target.toDateString());
    };

    const allDayBlocksForDay = (dayIndex: number): ImportBlock[] => {
        const target = weekDays[dayIndex];
        return blocks.filter(b => b.allDay && new Date(b.start).toDateString() === target.toDateString());
    };

    const handleColumnMouseDown = (e: React.MouseEvent, dayIndex: number) => {
        if ((e.target as HTMLElement).closest('.import-block')) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const y = e.clientY - rect.top;
        setCreateDrag({ dayIndex, startY: y, currentY: y });
        onSelectBlock(null);
    };

    const handleColumnMouseMove = (e: React.MouseEvent, dayIndex: number) => {
        if (!createDrag || createDrag.dayIndex !== dayIndex) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const y = Math.max(0, e.clientY - rect.top);
        setCreateDrag({ ...createDrag, currentY: y });
    };

    const finishCreateDrag = () => {
        if (!createDrag) return;
        const top = Math.min(createDrag.startY, createDrag.currentY);
        const bottom = Math.max(createDrag.startY, createDrag.currentY);

        const snappedStart = Math.round(pixelToMinutesFromMidnight(top) / 15) * 15;
        const snappedDuration = Math.max(Math.round((bottom - top) / 15) * 15, 15);

        const block = createManualBlock(weekDays[createDrag.dayIndex], snappedStart, snappedDuration);
        onCreateManualBlock(block);
        onSelectBlock(block.id);
        setCreateDrag(null);
    };

    const calendarLabel = (calendarId: string): string => {
        if (calendarId === 'manual') return 'Added by hand';
        return calendars.find(c => c.id === calendarId)?.label ?? calendarId;
    };

    return (
        <div className="import-grid-wrap" onMouseUp={finishCreateDrag} onMouseLeave={finishCreateDrag}>
            <div className="import-day-headers">
                <div className="import-header-spacer" />
                {weekDays.map((day, i) => (
                    <div key={i} className="import-day-header">
                        <span>{day.toLocaleDateString('en-GB', { weekday: 'short' })}</span>
                        <small>{day.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</small>
                    </div>
                ))}
            </div>

            <div className="import-allday-row">
                <div className="import-allday-label">all-day</div>
                {weekDays.map((_, dayIndex) => (
                    <div key={dayIndex} className="import-allday-cell">
                        {allDayBlocksForDay(dayIndex).map(block => (
                            <button
                                key={block.id}
                                type="button"
                                className={`import-allday-chip${block.excluded ? ' import-allday-chip--excluded' : ''}${selectedBlockId === block.id ? ' import-allday-chip--selected' : ''}`}
                                onClick={() => onSelectBlock(block.id)}
                                title={block.title}
                            >
                                {block.title}
                            </button>
                        ))}
                    </div>
                ))}
            </div>

            <div className="import-body">
                <div className="import-hours-col">
                    {hours.map(hour => (
                        <div key={hour} className="import-hour-label" style={{ height: `${HOUR_HEIGHT}px` }}>
                            {hour.toString().padStart(2, '0')}:00
                        </div>
                    ))}
                </div>

                <div className="import-days-row">
                    {weekDays.map((_day, dayIndex) => (
                        <div
                            key={dayIndex}
                            className="import-day-column"
                            style={{ height: `${hours.length * HOUR_HEIGHT}px` }}
                            onMouseDown={(e) => handleColumnMouseDown(e, dayIndex)}
                            onMouseMove={(e) => handleColumnMouseMove(e, dayIndex)}
                        >
                            {hours.map((_h, i) => (
                                <div key={i} className="import-hour-cell" style={{ height: `${HOUR_HEIGHT}px` }} />
                            ))}

                            {blocksForDay(dayIndex).map(block => (
                                <ImportBlockCard
                                    key={block.id}
                                    block={block}
                                    calendarLabel={calendarLabel(block.calendarId)}
                                    startHour={startHour}
                                    isSelected={selectedBlockId === block.id}
                                    isClashing={clashingIds.has(block.id)}
                                    onSelect={() => onSelectBlock(block.id)}
                                    onUpdate={(updates) => onUpdateBlock(block.id, updates)}
                                />
                            ))}

                            {createDrag?.dayIndex === dayIndex && (
                                <div
                                    className="import-block import-block--manual import-block--preview"
                                    style={{
                                        top: `${Math.min(createDrag.startY, createDrag.currentY)}px`,
                                        height: `${Math.max(Math.abs(createDrag.currentY - createDrag.startY), 10)}px`,
                                    }}
                                >
                                    + New block
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
