import React, { useEffect, useState } from 'react';
import { fetchLearnedMappings, deleteLearnedMapping } from '../../services/matchingService';
import type { LearnedMapping } from '../../services/matchingService';
import type { IssuePickerOption } from './issuePickerOptions';
import './LearnedMappingsModal.css';

interface LearnedMappingsModalProps {
    options: IssuePickerOption[];
    onClose: () => void;
}

/**
 * Everything the matcher has learned from your past imports. Entries whose
 * ticket has left the pool are flagged stale: they're ignored when proposing,
 * and stay here until you delete them (or re-confirm a ticket for that title).
 */
export const LearnedMappingsModal: React.FC<LearnedMappingsModalProps> = ({ options, onClose }) => {
    const [mappings, setMappings] = useState<LearnedMapping[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchLearnedMappings().then(setMappings);
    }, []);

    const summaryByKey = new Map(options.map(o => [o.key, o.summary]));

    const remove = async (id: string) => {
        try {
            await deleteLearnedMapping(id);
            setMappings(prev => prev?.filter(m => m.id !== id) ?? null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Delete failed');
        }
    };

    return (
        <>
            <div className="learned-backdrop" onClick={onClose} />
            <div className="learned-modal" role="dialog" aria-modal="true" aria-label="Learned mappings">
                <div className="learned-top">
                    <h3>Learned mappings</h3>
                    <button type="button" className="import-wizard-close" onClick={onClose} aria-label="Close">×</button>
                </div>
                <p className="learned-note">
                    Saved on this computer only, in your home folder. Used to propose tickets for the same or similar titles next time.
                </p>
                {error && <div className="import-wizard-status import-wizard-status--error">{error}</div>}
                {mappings === null && <div className="import-wizard-status">Loading…</div>}
                {mappings?.length === 0 && <div className="import-wizard-status">Nothing learned yet. Mappings are saved when you create drafts.</div>}
                {mappings && mappings.length > 0 && (
                    <div className="learned-scroll">
                        <table className="learned-table">
                            <thead>
                                <tr><th>Event title</th><th>Ticket</th><th>Times</th><th>Last used</th><th /></tr>
                            </thead>
                            <tbody>
                                {mappings.map(m => {
                                    const stale = options.length > 0 && !summaryByKey.has(m.issueKey);
                                    return (
                                        <tr key={m.id}>
                                            <td>{m.title}</td>
                                            <td>
                                                <b>{m.issueKey}</b> {summaryByKey.get(m.issueKey)}
                                                {stale && <span className="learned-stale">stale</span>}
                                            </td>
                                            <td>{m.count}</td>
                                            <td>{new Date(m.lastUsed).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</td>
                                            <td><button type="button" className="learned-delete" onClick={() => remove(m.id)}>Delete</button></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </>
    );
};
