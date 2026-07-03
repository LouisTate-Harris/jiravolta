import React, { useState } from 'react';
import type { CacheScope } from '../services/jiraService';
import './ClearCacheModal.css';

interface ClearCacheModalProps {
    onClose: () => void;
    onClear: (scopes: CacheScope[]) => Promise<void> | void;
}

const CACHE_OPTIONS: Array<{ scope: CacheScope; label: string; description: string }> = [
    {
        scope: 'worklogs',
        label: 'Worklogs',
        description: 'Weekly worklog data fetched from Jira. Re-fetches on next visit to each week.',
    },
    {
        scope: 'active-issues',
        label: 'Active issues',
        description: 'Issues currently assigned to you in Jira, used for the ticket picker.',
    },
    {
        scope: 'ticket-list',
        label: 'My ticket list',
        description: 'Your manually curated list of issues, aliases, and colours.',
    },
];

export const ClearCacheModal: React.FC<ClearCacheModalProps> = ({ onClose, onClear }) => {
    const [selected, setSelected] = useState<Set<CacheScope>>(new Set());
    const [isClearing, setIsClearing] = useState(false);

    const toggle = (scope: CacheScope) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(scope)) {
                next.delete(scope);
            } else {
                next.add(scope);
            }
            return next;
        });
    };

    const handleClear = async () => {
        if (selected.size === 0) return;
        setIsClearing(true);
        try {
            await onClear(Array.from(selected));
        } finally {
            setIsClearing(false);
        }
        onClose();
    };

    return (
        <>
            <div className="clear-cache-modal-backdrop" onClick={onClose} />
            <div
                className="clear-cache-modal"
                role="dialog"
                aria-modal="true"
                aria-label="Clear Cache"
            >
                <div className="clear-cache-modal-header">
                    <h2>Clear Cache</h2>
                    <button className="clear-cache-modal-close" onClick={onClose} aria-label="Close">
                        ×
                    </button>
                </div>

                <ul className="clear-cache-modal-list">
                    {CACHE_OPTIONS.map(option => (
                        <li key={option.scope} className="clear-cache-modal-item">
                            <label>
                                <input
                                    type="checkbox"
                                    checked={selected.has(option.scope)}
                                    onChange={() => toggle(option.scope)}
                                />
                                <div className="clear-cache-modal-item-text">
                                    <span className="clear-cache-modal-item-label">{option.label}</span>
                                    <span className="clear-cache-modal-item-description">{option.description}</span>
                                </div>
                            </label>
                        </li>
                    ))}
                </ul>

                <div className="clear-cache-modal-footer">
                    <button className="clear-cache-modal-cancel" onClick={onClose}>Cancel</button>
                    <button
                        className="clear-cache-modal-confirm"
                        onClick={handleClear}
                        disabled={selected.size === 0 || isClearing}
                    >
                        {isClearing ? 'Clearing…' : 'Clear Selected'}
                    </button>
                </div>
            </div>
        </>
    );
};
