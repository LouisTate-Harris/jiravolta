import type { DraftWorklog } from '../types';
import { formatDate } from './dateUtils';

const STORAGE_KEY_PREFIX = 'jiravolta_drafts_';

/**
 * Get storage key for a specific week
 */
function getStorageKey(weekStart: Date): string {
    return `${STORAGE_KEY_PREFIX}${formatDate(weekStart)}`;
}

/**
 * Load drafts for a specific week from LocalStorage
 */
export function loadDrafts(weekStart: Date): DraftWorklog[] {
    try {
        const key = getStorageKey(weekStart);
        const data = localStorage.getItem(key);
        if (!data) return [];
        return JSON.parse(data) as DraftWorklog[];
    } catch (error) {
        console.error('Error loading drafts from LocalStorage:', error);
        return [];
    }
}

/**
 * Save drafts for a specific week to LocalStorage
 */
export function saveDrafts(weekStart: Date, drafts: DraftWorklog[]): void {
    try {
        const key = getStorageKey(weekStart);
        localStorage.setItem(key, JSON.stringify(drafts));
    } catch (error) {
        console.error('Error saving drafts to LocalStorage:', error);
    }
}

/**
 * Clear drafts for a specific week
 */
export function clearDrafts(weekStart: Date): void {
    try {
        const key = getStorageKey(weekStart);
        localStorage.removeItem(key);
    } catch (error) {
        console.error('Error clearing drafts from LocalStorage:', error);
    }
}

/**
 * Clear all drafts from LocalStorage
 */
export function clearAllDrafts(): void {
    try {
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
            if (key.startsWith(STORAGE_KEY_PREFIX)) {
                localStorage.removeItem(key);
            }
        });
    } catch (error) {
        console.error('Error clearing all drafts from LocalStorage:', error);
    }
}
