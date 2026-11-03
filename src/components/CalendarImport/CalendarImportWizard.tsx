import React, { useEffect, useMemo, useState } from 'react';
import type { DraftWorklog, Worklog } from '../../types';
import type { TicketEntry } from '../../utils/ticketListStorage';
import { calculateDuration, formatTime } from '../../utils/dateUtils';
import {
    fetchCalendarSources,
    fetchCalendarEvents,
    type CalendarInfo,
    type CalendarFailure,
} from '../../services/calendarService';
import { fetchIssuePool } from '../../services/jiraService';
import {
    fetchMatchConfig,
    matchTitles,
    askClaudeToMatch,
    saveLearnedMappings,
    type MatchConfig,
} from '../../services/matchingService';
import { toImportBlock, findClashingBlockIds, duplicateBlock, calendarColor } from './importBlock';
import type { ImportBlock } from './importBlock';
import { ImportBlockGrid } from './ImportBlockGrid';
import { buildIssuePickerOptions } from './issuePickerOptions';
import { MappingStep } from './MappingStep';
import { LearnedMappingsModal } from './LearnedMappingsModal';
import { autoGroup, splitOut, moveToGroup } from './grouping';
import type { Groups } from './grouping';
import {
    applyProposals,
    buildRows,
    reconcileGroups,
    isComplete,
    needsTicket,
    pairsToRemember,
    rowAssignment,
    setIssue,
    setRemember,
    setSkip,
    titlesForClaude,
    toDrafts,
} from './mapping';
import type { Assignments, MappingRow } from './mapping';
import './CalendarImportWizard.css';

interface CalendarImportWizardProps {
    weekStart: Date;
    weekDays: Date[];
    jiraWorklogs: Worklog[];
    ticketList: TicketEntry[];
    onClose: () => void;
    /** `tickets` are the tickets the drafts use that aren't in the ticket list yet. */
    onImport: (drafts: DraftWorklog[], tickets: TicketEntry[]) => void;
}

type CategoryKey = 'allDay' | 'freeTentative' | 'oof';

export const CalendarImportWizard: React.FC<CalendarImportWizardProps> = ({
    weekStart,
    weekDays,
    jiraWorklogs,
    ticketList,
    onClose,
    onImport,
}) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [calendars, setCalendars] = useState<CalendarInfo[]>([]);
    const [failedCalendars, setFailedCalendars] = useState<CalendarFailure[]>([]);
    const [blocks, setBlocks] = useState<ImportBlock[]>([]);
    const [enabledCalendarIds, setEnabledCalendarIds] = useState<Set<string>>(new Set());
    const [categoryIncluded, setCategoryIncluded] = useState<Record<CategoryKey, boolean>>({
        allDay: false,
        freeTentative: false,
        oof: false,
    });
    const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
    const [step, setStep] = useState<1 | 2>(1);
    const [assignments, setAssignments] = useState<Assignments>({});
    const [matching, setMatching] = useState(false);
    const [matchError, setMatchError] = useState<string | null>(null);
    const [matchConfig, setMatchConfig] = useState<MatchConfig>({ claudeAvailable: false, claudeModel: null });
    const [groups, setGroups] = useState<Groups>({ groupOf: {}, members: {} });
    const [groupedFor, setGroupedFor] = useState('');
    const [learnedOpen, setLearnedOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [issuePoolOptions, setIssuePoolOptions] = useState<ReturnType<typeof buildIssuePickerOptions>>([]);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            setLoading(true);
            setError(null);
            try {
                const weekEnd = weekDays[weekDays.length - 1];
                const [sources, { events, failed }, issuePool, config] = await Promise.all([
                    fetchCalendarSources(),
                    fetchCalendarEvents(weekStart, weekEnd),
                    fetchIssuePool(),
                    fetchMatchConfig(),
                ]);
                if (cancelled) return;

                setMatchConfig(config);

                setCalendars(sources);
                setIssuePoolOptions(buildIssuePickerOptions(issuePool, ticketList));
                setEnabledCalendarIds(new Set(sources.map(s => s.id)));
                setBlocks(events.map(event => toImportBlock(event, jiraWorklogs)));
                setFailedCalendars(failed);
            } catch (err) {
                if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load calendars');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => { cancelled = true; };
        // Intentionally runs once: the wizard is mounted fresh each time it's opened for a week.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const visibleBlocks = useMemo(
        () => blocks.filter(b => b.manual || enabledCalendarIds.has(b.calendarId)),
        [blocks, enabledCalendarIds],
    );
    const clashingIds = useMemo(() => findClashingBlockIds(visibleBlocks), [visibleBlocks]);
    const selectedBlock = visibleBlocks.find(b => b.id === selectedBlockId) ?? null;

    const includedBlocks = visibleBlocks.filter(b => !b.excluded);
    const totalMinutes = includedBlocks.reduce((sum, b) => sum + calculateDuration(new Date(b.start), new Date(b.end)), 0);
    const clashCount = Array.from(clashingIds).filter(id => includedBlocks.some(b => b.id === id)).length;

    const toggleCalendar = (id: string) => {
        setEnabledCalendarIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const categoryMatches = (block: ImportBlock, key: CategoryKey): boolean => {
        if (key === 'allDay') return block.allDay;
        if (key === 'freeTentative') return block.busyStatus === 'free' || block.busyStatus === 'tentative';
        return block.busyStatus === 'oof' || block.busyStatus === 'working_elsewhere';
    };

    const toggleCategory = (key: CategoryKey) => {
        const nowIncluded = !categoryIncluded[key];
        setCategoryIncluded(prev => ({ ...prev, [key]: nowIncluded }));
        setBlocks(prev => prev.map(b => (categoryMatches(b, key) ? { ...b, excluded: !nowIncluded } : b)));
    };

    const updateBlock = (id: string, updates: Partial<ImportBlock>) => {
        setBlocks(prev => prev.map(b => (b.id === id ? { ...b, ...updates } : b)));
    };

    const deleteBlock = (id: string) => {
        setBlocks(prev => prev.filter(b => b.id !== id));
        setSelectedBlockId(prev => (prev === id ? null : prev));
    };

    const addManualBlock = (block: ImportBlock) => {
        setBlocks(prev => [...prev, block]);
    };

    const duplicateSelected = (block: ImportBlock) => {
        const copy = duplicateBlock(block);
        setBlocks(prev => [...prev, copy]);
        setSelectedBlockId(copy.id);
    };

    const changeBlockDay = (block: ImportBlock, dayIndex: number) => {
        const target = weekDays[dayIndex];
        const start = new Date(block.start);
        const end = new Date(block.end);
        const newStart = new Date(target);
        newStart.setHours(start.getHours(), start.getMinutes(), 0, 0);
        const newEnd = new Date(newStart.getTime() + (end.getTime() - start.getTime()));
        updateBlock(block.id, { start: newStart.toISOString(), end: newEnd.toISOString() });
    };

    const changeBlockTime = (block: ImportBlock, field: 'start' | 'end', timeValue: string) => {
        const [hours, minutes] = timeValue.split(':').map(Number);
        if (Number.isNaN(hours) || Number.isNaN(minutes)) return;

        const base = new Date(block[field]);
        base.setHours(hours, minutes, 0, 0);

        if (field === 'start') {
            if (base >= new Date(block.end)) return;
            updateBlock(block.id, { start: base.toISOString() });
        } else {
            if (base <= new Date(block.start)) return;
            updateBlock(block.id, { end: base.toISOString() });
        }
    };

    const candidates = useMemo(
        () => issuePoolOptions.map(o => ({ key: o.key, summary: o.summary })),
        [issuePoolOptions],
    );
    const rows = useMemo(() => buildRows(includedBlocks, groups), [includedBlocks, groups]);
    const claudeTitles = useMemo(() => titlesForClaude(includedBlocks, assignments), [includedBlocks, assignments]);
    const unmappedCount = rows.filter(r => needsTicket(rowAssignment(r, assignments))).length;

    const goToMapping = async () => {
        // Auto-group afresh only when the set of blocks changed; otherwise keep any splits/merges you made.
        const signature = includedBlocks.map(b => b.id).sort().join('|');
        let activeGroups = groups;
        if (signature !== groupedFor) {
            activeGroups = autoGroup(includedBlocks);
            setGroups(activeGroups);
            setGroupedFor(signature);
        }

        setStep(2);
        setMatching(true);
        setMatchError(null);
        try {
            const titles = Array.from(new Set(includedBlocks.map(b => b.title)));
            const proposals = await matchTitles(titles, candidates);
            setAssignments(prev => reconcileGroups(applyProposals(prev, includedBlocks, proposals), includedBlocks, activeGroups));
        } catch (err) {
            setMatchError(err instanceof Error ? err.message : 'matching failed');
        } finally {
            setMatching(false);
        }
    };

    const askClaude = async (titles: string[]) => {
        const proposals = await askClaudeToMatch(titles, candidates);
        setAssignments(prev => reconcileGroups(applyProposals(prev, includedBlocks, proposals), includedBlocks, groups));
    };

    const splitBlock = (blockId: string) => setGroups(prev => splitOut(prev, blockId));
    const addToGroup = (blockId: string, targetGroupId: string) => {
        const next = moveToGroup(groups, blockId, targetGroupId);
        setGroups(next);
        // The block adopts the group's ticket, so a whole group always shares one.
        const others = new Set(includedBlocks.filter(b => b.id !== blockId && next.groupOf[b.id] === targetGroupId).map(b => b.id));
        setAssignments(prev => reconcileGroups(prev, includedBlocks, next, others));
    };

    const chooseIssue = (row: MappingRow, key: string) => setAssignments(prev => setIssue(prev, row.blockIds, key));
    const skipRow = (row: MappingRow, skip: boolean) => setAssignments(prev => setSkip(prev, row.blockIds, skip));
    const rememberRow = (row: MappingRow, remember: boolean) => setAssignments(prev => setRemember(prev, row.blockIds, remember));

    const drafts = useMemo(() => toDrafts(includedBlocks, assignments), [includedBlocks, assignments]);
    const draftMinutes = drafts.reduce((sum, d) => sum + d.durationMinutes, 0);
    const usedTicketCount = new Set(drafts.map(d => d.issueKey)).size;

    const handleCreate = async () => {
        setCreating(true);
        try {
            await saveLearnedMappings(pairsToRemember(includedBlocks, assignments));
        } catch (err) {
            // Learning is a convenience; never block creating the drafts on it.
            console.error('[CALENDAR IMPORT] Could not save learned mappings', err);
        }

        const known = new Set(ticketList.map(t => t.key));
        const summaryByKey = new Map(issuePoolOptions.map(o => [o.key, o.summary]));
        const newTickets: TicketEntry[] = [];
        for (const key of new Set(drafts.map(d => d.issueKey))) {
            if (known.has(key)) continue;
            const summary = summaryByKey.get(key);
            newTickets.push(summary && summary !== key ? { key, alias: summary } : { key });
        }

        onImport(drafts, newTickets);
        onClose();
    };

    const toTimeInputValue = (iso: string): string => {
        const d = new Date(iso);
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    };

    return (
        <>
            <div className="import-wizard-backdrop" onClick={onClose} />
            <div className="import-wizard" role="dialog" aria-modal="true" aria-label="Import calendar">
                <div className="import-wizard-top">
                    <h2>Import calendar · w/c {weekStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</h2>
                    <div className="import-stepper">
                        <span className={step === 1 ? 'import-step--on' : 'import-step--done'}>{step === 2 ? '✓ ' : '1 '}Review blocks</span>
                        →
                        <span className={step === 2 ? 'import-step--on' : ''}>2 Map to tickets</span>
                    </div>
                    <button className="import-wizard-close" onClick={onClose} aria-label="Close">×</button>
                </div>

                {loading && <div className="import-wizard-status">Loading calendars…</div>}
                {error && <div className="import-wizard-status import-wizard-status--error">{error}</div>}

                {!loading && !error && step === 1 && (
                    <>
                        <div className="import-wizard-bar">
                            <span className="import-wizard-bar-label">Calendars</span>
                            {calendars.map(cal => (
                                <button
                                    key={cal.id}
                                    type="button"
                                    className={`import-chip import-chip--calendar${enabledCalendarIds.has(cal.id) ? ' import-chip--on' : ''}`}
                                    style={{ borderLeftColor: calendarColor(cal.id) }}
                                    onClick={() => toggleCalendar(cal.id)}
                                    title={enabledCalendarIds.has(cal.id) ? `Hide ${cal.label}` : `Show ${cal.label}`}
                                >
                                    {cal.label}
                                    <span className="import-chip-count">{blocks.filter(b => b.calendarId === cal.id).length}</span>
                                </button>
                            ))}
                            <span className="import-wizard-sep" />
                            <button type="button" className={`import-chip${categoryIncluded.allDay ? ' import-chip--on' : ''}`} onClick={() => toggleCategory('allDay')}>
                                All-day
                            </button>
                            <button type="button" className={`import-chip${categoryIncluded.freeTentative ? ' import-chip--on' : ''}`} onClick={() => toggleCategory('freeTentative')}>
                                Free / Tentative
                            </button>
                            <button type="button" className={`import-chip${categoryIncluded.oof ? ' import-chip--on' : ''}`} onClick={() => toggleCategory('oof')}>
                                Out of office
                            </button>
                        </div>

                        {failedCalendars.length > 0 && (
                            <div className="import-wizard-status import-wizard-status--warning">
                                Couldn't refresh: {failedCalendars.map(f => f.label).join(', ')}. Showing what's available.
                            </div>
                        )}

                        <div className="import-wizard-body">
                            <ImportBlockGrid
                                weekDays={weekDays}
                                blocks={visibleBlocks}
                                calendars={calendars}
                                selectedBlockId={selectedBlockId}
                                clashingIds={clashingIds}
                                onSelectBlock={setSelectedBlockId}
                                onUpdateBlock={(id, updates) => updateBlock(id, updates)}
                                onCreateManualBlock={addManualBlock}
                            />

                            <aside className="import-wizard-side">
                                {selectedBlock ? (
                                    <>
                                        <h3>Selected block</h3>
                                        <label className="import-field">
                                            Title
                                            <input
                                                type="text"
                                                value={selectedBlock.title}
                                                onChange={e => updateBlock(selectedBlock.id, { title: e.target.value })}
                                            />
                                        </label>
                                        <div className="import-field-row">
                                            <label className="import-field">
                                                Day
                                                <select
                                                    value={weekDays.findIndex(d => d.toDateString() === new Date(selectedBlock.start).toDateString())}
                                                    onChange={e => changeBlockDay(selectedBlock, Number(e.target.value))}
                                                >
                                                    {weekDays.map((d, i) => (
                                                        <option key={i} value={i}>{d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</option>
                                                    ))}
                                                </select>
                                            </label>
                                            <label className="import-field">
                                                Calendar
                                                <div className="import-field-static import-field-calendar">
                                                    <i className="import-calendar-swatch" style={{ background: calendarColor(selectedBlock.calendarId) }} />
                                                    {selectedBlock.manual ? 'Added by hand' : calendars.find(c => c.id === selectedBlock.calendarId)?.label ?? selectedBlock.calendarId}
                                                </div>
                                            </label>
                                        </div>
                                        {!selectedBlock.allDay && (
                                            <div className="import-field-row">
                                                <label className="import-field">
                                                    Start
                                                    <input type="time" step={900} value={toTimeInputValue(selectedBlock.start)} onChange={e => changeBlockTime(selectedBlock, 'start', e.target.value)} />
                                                </label>
                                                <label className="import-field">
                                                    End
                                                    <input type="time" step={900} value={toTimeInputValue(selectedBlock.end)} onChange={e => changeBlockTime(selectedBlock, 'end', e.target.value)} />
                                                </label>
                                            </div>
                                        )}
                                        <div className="import-field">
                                            Duration
                                            <div className="import-field-static">
                                                {selectedBlock.allDay ? 'All day' : `${calculateDuration(new Date(selectedBlock.start), new Date(selectedBlock.end))}m`}
                                            </div>
                                        </div>
                                        <div className="import-side-actions">
                                            <button type="button" onClick={() => duplicateSelected(selectedBlock)} title="Add a copy straight after this block">
                                                Duplicate
                                            </button>
                                            <button type="button" onClick={() => updateBlock(selectedBlock.id, { excluded: !selectedBlock.excluded })}>
                                                {selectedBlock.excluded ? 'Include' : 'Exclude'}
                                            </button>
                                            <button type="button" className="import-side-delete" onClick={() => deleteBlock(selectedBlock.id)}>
                                                Delete
                                            </button>
                                        </div>
                                        {clashingIds.has(selectedBlock.id) && !selectedBlock.excluded && (
                                            <div className="import-warnline">
                                                {formatTime(new Date(selectedBlock.start))} overlaps another included block. Exclude one or adjust the time.
                                            </div>
                                        )}
                                        {selectedBlock.alreadyLogged && (
                                            <div className="import-warnline import-warnline--info">
                                                Overlaps a worklog already in Jira for this week.
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <div className="import-side-empty">Select a block to edit it, or drag on the grid to add one.</div>
                                )}

                                <div className="import-legend">
                                    <span><i className="import-swatch" /> Will import</span>
                                    <span><i className="import-swatch import-swatch--excluded" /> Excluded (click to include)</span>
                                    <span><i className="import-swatch import-swatch--logged" /> Already logged in Jira</span>
                                    <span><i className="import-swatch import-swatch--clash" /> Overlap to resolve</span>
                                    <span><i className="import-swatch import-swatch--manual" /> Added by hand</span>
                                </div>
                            </aside>
                        </div>

                        <div className="import-wizard-foot">
                            <div className="import-wizard-summary">
                                <b>{includedBlocks.length}</b> block{includedBlocks.length === 1 ? '' : 's'} to import
                                {' · '}<b>{Math.floor(totalMinutes / 60)}h {totalMinutes % 60}m</b>
                                {' · '}{visibleBlocks.length - includedBlocks.length} excluded
                                {clashCount > 0 && <> · <span className="import-wizard-summary-warn">{clashCount} overlap{clashCount === 1 ? '' : 's'}</span></>}
                            </div>
                            <div className="import-wizard-foot-right">
                                <button type="button" onClick={onClose}>Cancel</button>
                                <button
                                    type="button"
                                    className="import-wizard-primary"
                                    disabled={includedBlocks.length === 0}
                                    onClick={goToMapping}
                                >
                                    Next: map to tickets →
                                </button>
                            </div>
                        </div>
                    </>
                )}

                {!loading && !error && step === 2 && (
                    <>
                        <MappingStep
                            rows={rows}
                            assignments={assignments}
                            options={issuePoolOptions}
                            matching={matching}
                            matchError={matchError}
                            matchConfig={matchConfig}
                            claudeTitles={claudeTitles}
                            onSplitBlock={splitBlock}
                            onAddToGroup={addToGroup}
                            onSetIssue={chooseIssue}
                            onSetSkip={skipRow}
                            onSetRemember={rememberRow}
                            onAskClaude={askClaude}
                            onOpenLearned={() => setLearnedOpen(true)}
                        />
                        <div className="import-wizard-foot">
                            <div className="import-wizard-summary">
                                <b>{drafts.length} draft{drafts.length === 1 ? '' : 's'}</b>
                                {' · '}<b>{Math.floor(draftMinutes / 60)}h {draftMinutes % 60}m</b> across {usedTicketCount} ticket{usedTicketCount === 1 ? '' : 's'}
                                {unmappedCount > 0 && <> · <span className="import-wizard-summary-warn">{unmappedCount} still need{unmappedCount === 1 ? 's' : ''} a ticket</span></>}
                            </div>
                            <div className="import-wizard-foot-right">
                                <button type="button" onClick={() => setStep(1)}>← Back</button>
                                <button
                                    type="button"
                                    className="import-wizard-primary"
                                    disabled={matching || creating || drafts.length === 0 || !isComplete(includedBlocks, assignments)}
                                    onClick={handleCreate}
                                >
                                    Create {drafts.length} draft worklog{drafts.length === 1 ? '' : 's'}
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {learnedOpen && <LearnedMappingsModal options={issuePoolOptions} onClose={() => setLearnedOpen(false)} />}
        </>
    );
};
