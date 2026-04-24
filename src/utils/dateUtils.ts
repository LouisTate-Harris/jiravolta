/**
 * Get the start of the week (Monday) for a given date
 */
export function getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day; // Adjust to Monday
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
}

/**
 * Get the end of the week (Sunday) for a given date
 */
export function getWeekEnd(date: Date): Date {
    const start = getWeekStart(date);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return end;
}

/**
 * Get array of 7 dates (Mon-Sun) for the week containing the given date
 */
export function getWeekDays(date: Date): Date[] {
    const start = getWeekStart(date);
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
        const day = new Date(start);
        day.setDate(day.getDate() + i);
        days.push(day);
    }
    return days;
}

/**
 * Format date as YYYY-MM-DD
 */
export function formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
}

/**
 * Format date as weekday name (Mon, Tue, etc.)
 */
export function formatWeekday(date: Date): string {
    return date.toLocaleDateString('en-US', { weekday: 'short' });
}

/**
 * Format date as "Mon 1/6"
 */
export function formatDayHeader(date: Date): string {
    const weekday = formatWeekday(date);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${weekday} ${month}/${day}`;
}

/**
 * Snap a date to the nearest 15-minute increment
 */
export function snapToQuarterHour(date: Date): Date {
    const d = new Date(date);
    const minutes = d.getMinutes();
    const snappedMinutes = Math.round(minutes / 15) * 15;
    d.setMinutes(snappedMinutes);
    d.setSeconds(0);
    d.setMilliseconds(0);
    return d;
}

/**
 * Format time as HH:MM
 */
export function formatTime(date: Date): string {
    return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
}

/**
 * Calculate duration in minutes between two dates
 */
export function calculateDuration(start: Date, end: Date): number {
    return Math.round((end.getTime() - start.getTime()) / (1000 * 60));
}

/**
 * Check if two dates are on the same day
 */
export function isSameDay(date1: Date, date2: Date): boolean {
    return formatDate(date1) === formatDate(date2);
}

/**
 * Navigate to previous week
 */
export function getPreviousWeek(date: Date): Date {
    const d = new Date(date);
    d.setDate(d.getDate() - 7);
    return d;
}

/**
 * Navigate to next week
 */
export function getNextWeek(date: Date): Date {
    const d = new Date(date);
    d.setDate(d.getDate() + 7);
    return d;
}
