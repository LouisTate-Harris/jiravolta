import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { IssuePickerOption } from './issuePickerOptions';
import './IssuePicker.css';

// Same pattern TicketListModal uses for "paste a Jira link to add a ticket".
const BROWSE_URL_PATTERN = /\/browse\/([A-Za-z]+-\d+)/i;

interface IssuePickerProps {
    value: string;
    options: IssuePickerOption[];
    onChange: (key: string) => void;
    placeholder?: string;
    disabled?: boolean;
}

/**
 * A searchable ticket combobox grouped by where each suggestion came from
 * (your ticket list, the sprint, a saved filter, or assigned-to-me), with a
 * fallback to paste any Jira link directly — so you're never limited to
 * what happens to be in the pool.
 */
export const IssuePicker: React.FC<IssuePickerProps> = ({ value, options, onChange, placeholder, disabled }) => {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);

    const selected = options.find(o => o.key === value);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
                setQuery('');
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const normalizedQuery = query.trim().toLowerCase();
    const filtered = useMemo(() => {
        if (!normalizedQuery) return options;
        return options.filter(o => o.key.toLowerCase().includes(normalizedQuery) || o.summary.toLowerCase().includes(normalizedQuery));
    }, [options, normalizedQuery]);

    const grouped = useMemo(() => {
        const groups = new Map<string, IssuePickerOption[]>();
        for (const option of filtered) {
            const list = groups.get(option.group) ?? [];
            list.push(option);
            groups.set(option.group, list);
        }
        return Array.from(groups.entries());
    }, [filtered]);

    const pastedMatch = BROWSE_URL_PATTERN.exec(query);

    const choose = (key: string) => {
        onChange(key);
        setOpen(false);
        setQuery('');
    };

    return (
        <div className={`issue-picker${disabled ? ' issue-picker--disabled' : ''}`} ref={containerRef}>
            <button
                type="button"
                className="issue-picker-trigger"
                onClick={() => !disabled && setOpen(o => !o)}
                disabled={disabled}
            >
                {selected ? (
                    <span className="issue-picker-trigger-label">
                        <span className="issue-picker-key">{selected.key}</span>
                        <span className="issue-picker-summary">{selected.summary}</span>
                    </span>
                ) : (
                    <span className="issue-picker-placeholder">{placeholder ?? 'Choose a ticket…'}</span>
                )}
                <span className="issue-picker-caret">▾</span>
            </button>

            {open && (
                <div className="issue-picker-dropdown">
                    <input
                        type="text"
                        className="issue-picker-search"
                        autoFocus
                        placeholder="Search by key or title, or paste a Jira link"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter' && pastedMatch) {
                                choose(pastedMatch[1].toUpperCase());
                            } else if (e.key === 'Escape') {
                                setOpen(false);
                                setQuery('');
                            }
                        }}
                    />
                    {pastedMatch && (
                        <button type="button" className="issue-picker-paste-hit" onClick={() => choose(pastedMatch[1].toUpperCase())}>
                            Use {pastedMatch[1].toUpperCase()} from pasted link
                        </button>
                    )}
                    <div className="issue-picker-options">
                        {grouped.length === 0 && <div className="issue-picker-empty">No matching tickets</div>}
                        {grouped.map(([group, items]) => (
                            <div key={group} className="issue-picker-group">
                                <div className="issue-picker-group-label">{group}</div>
                                {items.map(item => (
                                    <button
                                        key={item.key}
                                        type="button"
                                        className={`issue-picker-option${item.key === value ? ' issue-picker-option--selected' : ''}`}
                                        onClick={() => choose(item.key)}
                                        title={item.summary}
                                    >
                                        <span className="issue-picker-key">{item.key}</span>
                                        <span className="issue-picker-summary">{item.summary}</span>
                                    </button>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
