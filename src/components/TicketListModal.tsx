import React, { useState, useRef } from 'react';
import type { TicketEntry } from '../utils/ticketListStorage';
import { getAllColors, getIssueColor } from '../utils/colorUtils';
import './TicketListModal.css';

interface TicketListModalProps {
    ticketList: TicketEntry[];
    onTicketListChange: (list: TicketEntry[]) => void;
    onClose: () => void;
    getIssueFullLabel: (key: string) => string;
    onTicketAdded: (key: string) => void;
    fetchIssueSummary: (key: string) => Promise<string | null>;
    jiraConfigured: boolean;
}

const BROWSE_URL_PATTERN = /\/browse\/([A-Za-z]+-\d+)/i;

export const TicketListModal: React.FC<TicketListModalProps> = ({
    ticketList,
    onTicketListChange,
    onClose,
    getIssueFullLabel,
    onTicketAdded,
    fetchIssueSummary,
    jiraConfigured,
}) => {
    const [localList, setLocalList] = useState<TicketEntry[]>(ticketList);
    const [addInput, setAddInput] = useState('');
    const [addError, setAddError] = useState<string | null>(null);
    const [addWarning, setAddWarning] = useState<string | null>(null);
    const [isFetchingName, setIsFetchingName] = useState(false);
    const [dragIndex, setDragIndex] = useState<number | null>(null);
    const dragIndexRef = useRef<number | null>(null);
    const localListRef = useRef<TicketEntry[]>(localList);

    const handleAdd = async () => {
        const trimmed = addInput.trim();
        if (!trimmed) return;
        const match = trimmed.match(BROWSE_URL_PATTERN);
        if (!match) {
            setAddError('Enter a valid Jira ticket URL');
            return;
        }
        const key = match[1].toUpperCase();
        const isDuplicate = localList.some(e => e.key === key);

        if (!isDuplicate) {
            setIsFetchingName(true);
            const summary = await fetchIssueSummary(key);
            setIsFetchingName(false);
            const newList = [...localList, { key, alias: summary ?? undefined }];
            setLocalList(newList);
            localListRef.current = newList;
            onTicketListChange(newList);
            setAddWarning(summary === null && jiraConfigured ? "Added, but couldn't fetch its name." : null);
        } else {
            setAddWarning(null);
        }

        onTicketAdded(key);
        setAddInput('');
        setAddError(null);
    };

    const handleRemove = (index: number) => {
        const newList = localList.filter((_, i) => i !== index);
        setLocalList(newList);
        localListRef.current = newList;
        onTicketListChange(newList);
    };

    const handleAliasChange = (index: number, value: string) => {
        const newList = localList.map((entry, i) =>
            i === index ? { ...entry, alias: value || undefined } : entry
        );
        setLocalList(newList);
        localListRef.current = newList;
        onTicketListChange(newList);
    };

    const handleColorChange = (index: number, color: string) => {
        const entry = localList[index];
        const newColor = entry.color === color ? undefined : color;
        const newList = localList.map((e, i) =>
            i === index ? { ...e, color: newColor } : e
        );
        setLocalList(newList);
        localListRef.current = newList;
        onTicketListChange(newList);
    };

    const handleDragStart = (index: number) => {
        dragIndexRef.current = index;
        setDragIndex(index);
    };

    const handleDragOver = (e: React.DragEvent, overIndex: number) => {
        e.preventDefault();
        if (dragIndexRef.current === null || dragIndexRef.current === overIndex) return;
        const newList = [...localListRef.current];
        const [moved] = newList.splice(dragIndexRef.current, 1);
        newList.splice(overIndex, 0, moved);
        localListRef.current = newList;
        dragIndexRef.current = overIndex;
        setLocalList(newList);
        setDragIndex(overIndex);
    };

    const handleDragEnd = () => {
        onTicketListChange(localListRef.current);
        setDragIndex(null);
        dragIndexRef.current = null;
    };

    const issueLabel = (key: string): string => {
        const full = getIssueFullLabel(key);
        return full !== key ? full : '';
    };

    const colors = getAllColors();

    return (
        <>
            <div className="ticket-modal-backdrop" onClick={onClose} />
            <div
                className="ticket-modal"
                role="dialog"
                aria-modal="true"
                aria-label="Edit Ticket List"
            >
                <div className="ticket-modal-header">
                    <h2>Edit Ticket List</h2>
                    <button className="ticket-modal-close" onClick={onClose} aria-label="Close">
                        ×
                    </button>
                </div>

                <div className="ticket-modal-add">
                    <input
                        type="text"
                        inputMode="text"
                        placeholder="https://yourdomain.atlassian.net/browse/CAN-7983"
                        value={addInput}
                        onChange={e => {
                            setAddInput(e.target.value);
                            setAddError(null);
                            setAddWarning(null);
                        }}
                        onKeyDown={e => e.key === 'Enter' && !isFetchingName && handleAdd()}
                        autoFocus
                    />
                    <button onClick={handleAdd} disabled={isFetchingName}>Add</button>
                </div>
                {addError && <div className="ticket-modal-add-error">{addError}</div>}
                {addWarning && <div className="ticket-modal-add-warning">{addWarning}</div>}

                <ul className="ticket-modal-list">
                    {localList.length === 0 && (
                        <li className="ticket-modal-empty">No tickets yet. Add one above.</li>
                    )}
                    {localList.map((entry, index) => {
                        const activeColor = entry.color ?? getIssueColor(entry.key);
                        const placeholder = issueLabel(entry.key) || entry.key;
                        return (
                            <li
                                key={entry.key}
                                className={`ticket-modal-item${dragIndex === index ? ' dragging' : ''}`}
                                draggable
                                onDragStart={() => handleDragStart(index)}
                                onDragOver={e => handleDragOver(e, index)}
                                onDragEnd={handleDragEnd}
                                onDrop={e => e.preventDefault()}
                            >
                                <span className="ticket-modal-handle" aria-hidden="true">⠿</span>
                                <span className="ticket-modal-key">{entry.key}</span>
                                <input
                                    className="ticket-modal-alias"
                                    type="text"
                                    placeholder={placeholder}
                                    value={entry.alias ?? ''}
                                    onChange={e => handleAliasChange(index, e.target.value)}
                                />
                                <div className="ticket-modal-swatches">
                                    {colors.map(c => (
                                        <button
                                            key={c}
                                            type="button"
                                            className={`ticket-modal-swatch${activeColor === c ? ' active' : ''}`}
                                            style={{ backgroundColor: c }}
                                            onClick={() => handleColorChange(index, c)}
                                            aria-label={`Set color ${c}`}
                                        />
                                    ))}
                                </div>
                                <button
                                    type="button"
                                    className="ticket-modal-remove"
                                    onClick={() => handleRemove(index)}
                                    aria-label={`Remove ${entry.key}`}
                                >
                                    ×
                                </button>
                            </li>
                        );
                    })}
                </ul>

                <div className="ticket-modal-footer">
                    <button className="ticket-modal-done" onClick={onClose}>Done</button>
                </div>
            </div>
        </>
    );
};
