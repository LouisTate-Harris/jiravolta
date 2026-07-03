import React from 'react';
import type { DraftWorklog } from '../types';
import { formatTime, formatDate } from '../utils/dateUtils';
import './ReviewPanel.css';

interface ReviewPanelProps {
    drafts: DraftWorklog[];
    isOpen: boolean;
    onToggle: () => void;
    onApproveAll: () => void;
    onDiscardAll: () => void;
    formatIssueLabel: (issueKey: string, maxLength?: number) => string;
    getIssueFullLabel: (issueKey: string) => string;
    isIssueAliased: (issueKey: string) => boolean;
}

export const ReviewPanel: React.FC<ReviewPanelProps> = ({
    drafts,
    isOpen,
    onToggle,
    onApproveAll,
    onDiscardAll,
    formatIssueLabel,
    getIssueFullLabel,
    isIssueAliased,
}) => {
    const getChangeTypeLabel = (changeType: string): string => {
        switch (changeType) {
            case 'create':
                return 'Created';
            case 'update':
                return 'Updated';
            case 'delete':
                return 'Deleted';
            default:
                return changeType;
        }
    };

    const getChangeTypeClass = (changeType: string): string => {
        switch (changeType) {
            case 'create':
                return 'create';
            case 'update':
                return 'update';
            case 'delete':
                return 'delete';
            default:
                return '';
        }
    };

    return (
        <>
            <button className="review-toggle-btn" onClick={onToggle}>
                {isOpen ? '→' : '←'} Review Changes {drafts.length > 0 && `(${drafts.length})`}
            </button>

            <div className={`review-panel ${isOpen ? 'open' : ''}`}>
                <div className="review-panel-header">
                    <h2>Pending Changes</h2>
                    <button className="close-btn" onClick={onToggle}>×</button>
                </div>

                <div className="review-panel-content">
                    {drafts.length === 0 ? (
                        <div className="empty-state">
                            <p>No pending changes</p>
                        </div>
                    ) : (
                        <div className="drafts-list">
                            {drafts.map(draft => (
                                <div key={draft.id} className="draft-item">
                                    <div className={`change-badge ${getChangeTypeClass(draft.changeType)}`}>
                                        {getChangeTypeLabel(draft.changeType)}
                                    </div>
                                    <div className="draft-details">
                                        <div className="draft-issue" title={getIssueFullLabel(draft.issueKey)}>
                                            <span className={isIssueAliased(draft.issueKey) ? 'issue-alias-name' : undefined}>
                                                {formatIssueLabel(draft.issueKey, 38)}
                                            </span>
                                        </div>
                                        <div className="draft-date">
                                            {formatDate(new Date(draft.start))}
                                        </div>
                                        <div className="draft-time">
                                            {formatTime(new Date(draft.start))} - {formatTime(new Date(draft.end))}
                                        </div>
                                        <div className="draft-duration">
                                            {draft.durationMinutes} minutes
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {drafts.length > 0 && (
                    <div className="review-panel-actions">
                        <button className="btn-discard" onClick={onDiscardAll}>
                            Discard All
                        </button>
                        <button className="btn-approve" onClick={onApproveAll}>
                            Approve All
                        </button>
                    </div>
                )}
            </div>

            {isOpen && <div className="review-panel-overlay" onClick={onToggle} />}
        </>
    );
};
