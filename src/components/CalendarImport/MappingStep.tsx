import React, { useMemo, useState } from 'react';
import { formatTime } from '../../utils/dateUtils';
import type { MatchConfig } from '../../services/matchingService';
import type { IssuePickerOption } from './issuePickerOptions';
import { IssuePicker } from './IssuePicker';
import { rowAssignment, rowMinutes, needsTicket } from './mapping';
import type { Assignments, AssignmentSource, MappingRow } from './mapping';
import './MappingStep.css';

interface MappingStepProps {
    rows: MappingRow[];
    assignments: Assignments;
    options: IssuePickerOption[];
    matching: boolean;
    matchError: string | null;
    matchConfig: MatchConfig;
    grouped: boolean;
    claudeTitles: string[];
    onToggleGrouped: () => void;
    onSetIssue: (row: MappingRow, issueKey: string) => void;
    onSetSkip: (row: MappingRow, skip: boolean) => void;
    onSetRemember: (row: MappingRow, remember: boolean) => void;
    onAskClaude: (titles: string[]) => Promise<void>;
    onOpenLearned: () => void;
}

const BADGE: Record<AssignmentSource, { label: string; className: string }> = {
    remembered: { label: 'Remembered', className: 'mapping-badge--remembered' },
    similar: { label: 'Similar', className: 'mapping-badge--similar' },
    claude: { label: 'Claude', className: 'mapping-badge--claude' },
    manual: { label: 'Manual', className: 'mapping-badge--manual' },
    none: { label: 'Needs a ticket', className: 'mapping-badge--none' },
};

const formatMinutes = (m: number) => `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;

export const MappingStep: React.FC<MappingStepProps> = ({
    rows, assignments, options, matching, matchError, matchConfig, grouped, claudeTitles,
    onToggleGrouped, onSetIssue, onSetSkip, onSetRemember, onAskClaude, onOpenLearned,
}) => {
    const [onlyNeeding, setOnlyNeeding] = useState(false);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [claudeBusy, setClaudeBusy] = useState(false);
    const [claudeError, setClaudeError] = useState<string | null>(null);

    const visibleRows = useMemo(
        () => (onlyNeeding ? rows.filter(r => needsTicket(rowAssignment(r, assignments))) : rows),
        [rows, assignments, onlyNeeding],
    );
    const needCount = rows.filter(r => needsTicket(rowAssignment(r, assignments))).length;
    const optionByKey = useMemo(() => new Map(options.map(o => [o.key, o])), [options]);

    const sendToClaude = async () => {
        setClaudeBusy(true);
        setClaudeError(null);
        try {
            await onAskClaude(claudeTitles);
            setPreviewOpen(false);
        } catch (err) {
            setClaudeError(err instanceof Error ? err.message : 'Claude request failed');
        } finally {
            setClaudeBusy(false);
        }
    };

    return (
        <div className="mapping-step">
            <div className="import-wizard-bar">
                <span className="import-wizard-bar-label">Tickets</span>
                <button type="button" className={`import-chip${grouped ? ' import-chip--on' : ''}`} onClick={onToggleGrouped}>
                    Group repeated titles
                </button>
                <button type="button" className={`import-chip${onlyNeeding ? ' import-chip--on' : ''}`} onClick={() => setOnlyNeeding(v => !v)}>
                    Only rows needing a ticket
                </button>
                <span className="import-wizard-sep" />
                <button type="button" className="mapping-link" onClick={onOpenLearned}>Learned mappings</button>
                {matchConfig.claudeAvailable && (
                    <button
                        type="button"
                        className="mapping-claude-btn"
                        disabled={claudeTitles.length === 0 || matching}
                        onClick={() => setPreviewOpen(v => !v)}
                    >
                        Ask Claude about {claudeTitles.length} title{claudeTitles.length === 1 ? '' : 's'}…
                    </button>
                )}
                <span className="mapping-bar-count">
                    <b className="mapping-ok">{rows.length - needCount}</b> mapped · <b className={needCount ? 'mapping-bad' : ''}>{needCount}</b> need{needCount === 1 ? 's' : ''} a ticket
                </span>
            </div>

            {previewOpen && (
                <div className="mapping-claude-panel">
                    <b>Ask Claude: preview of what will be sent</b>
                    <span>
                        {claudeTitles.length} event title{claudeTitles.length === 1 ? '' : 's'} (no times, attendees or descriptions) and {options.length} ticket
                        keys with summaries, sent to the Claude API ({matchConfig.claudeModel}) with the configured key.
                    </span>
                    <pre>{claudeTitles.map(t => `“${t}”`).join(', ')}</pre>
                    {claudeError && <span className="mapping-bad">{claudeError}</span>}
                    <div className="mapping-claude-actions">
                        <button type="button" className="mapping-claude-btn" disabled={claudeBusy} onClick={sendToClaude}>
                            {claudeBusy ? 'Asking…' : 'Send to Claude'}
                        </button>
                        <button type="button" disabled={claudeBusy} onClick={() => setPreviewOpen(false)}>Cancel</button>
                    </div>
                </div>
            )}

            {matchError && (
                <div className="import-wizard-status import-wizard-status--warning">
                    Couldn't suggest tickets automatically ({matchError}). Choose a ticket for each row.
                </div>
            )}

            <div className="mapping-scroll">
                {matching ? (
                    <div className="import-wizard-status">Finding likely tickets…</div>
                ) : (
                    <table className="mapping-table">
                        <thead>
                            <tr>
                                <th>When</th>
                                <th className="mapping-num">Time</th>
                                <th>Calendar event</th>
                                <th>Jira ticket</th>
                                <th>Match</th>
                                <th title="Save this title → ticket pair for next time">Remember</th>
                                <th>Skip</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visibleRows.length === 0 && (
                                <tr><td colSpan={7} className="mapping-empty">Every row has a ticket.</td></tr>
                            )}
                            {visibleRows.map(row => {
                                const a = rowAssignment(row, assignments);
                                const badge = BADGE[a.source];
                                const first = new Date(row.blocks[0].start);
                                const unmatched = needsTicket(a);
                                return (
                                    <tr key={row.id} className={`${unmatched ? 'mapping-row--unmatched' : ''}${a.skip ? ' mapping-row--skipped' : ''}`}>
                                        <td className="mapping-when">
                                            {row.blocks.length > 1
                                                ? `${row.blocks.length} blocks`
                                                : `${first.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })} ${formatTime(first)}`}
                                        </td>
                                        <td className="mapping-num">{formatMinutes(rowMinutes(row))}</td>
                                        <td className="mapping-title" title={row.title}>{row.title}</td>
                                        <td>
                                            <IssuePicker
                                                value={a.issueKey ?? ''}
                                                options={options}
                                                disabled={a.skip}
                                                onChange={key => onSetIssue(row, key)}
                                                placeholder="Choose a ticket…"
                                            />
                                            {a.issueKey && !optionByKey.has(a.issueKey) && (
                                                <span className="mapping-why">{a.issueKey} isn't in your ticket pool</span>
                                            )}
                                        </td>
                                        <td>
                                            <span className={`mapping-badge ${badge.className}`}>
                                                {badge.label}{a.source === 'similar' ? ` ${Math.round(a.confidence * 100)}%` : ''}
                                            </span>
                                            {a.reason && !a.skip && <span className="mapping-why">{a.reason}</span>}
                                        </td>
                                        <td>
                                            <input
                                                type="checkbox"
                                                checked={a.remember}
                                                disabled={a.skip || !a.issueKey}
                                                onChange={e => onSetRemember(row, e.target.checked)}
                                                aria-label={`Remember ${row.title}`}
                                            />
                                        </td>
                                        <td>
                                            <input
                                                type="checkbox"
                                                checked={a.skip}
                                                onChange={e => onSetSkip(row, e.target.checked)}
                                                aria-label={`Skip ${row.title}`}
                                            />
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};
