import React from 'react';
import './LoadingOverlay.css';

export const LoadingOverlay: React.FC<{ message?: string }> = ({ message }) => {
    return (
        <div className="loading-overlay" role="status" aria-live="polite">
            <div className="loading-overlay__backdrop" />
            <div className="loading-overlay__content">
                <div className="spinner" />
                {message && <div className="loading-overlay__message">{message}</div>}
            </div>
        </div>
    );
};

export default LoadingOverlay;
