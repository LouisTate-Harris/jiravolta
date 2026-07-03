/**
 * Color palette utility for issue-based worklog coloring
 * Uses a set of visually distinct colors that vary in hue, saturation and
 * lightness (not just hue) so adjacent entries remain easy to tell apart.
 */

const COLOR_PALETTE = [
    'hsl(0, 65%, 70%)',     // Red
    'hsl(210, 60%, 65%)',   // Blue
    'hsl(35, 60%, 55%)',    // Brown
    'hsl(130, 45%, 60%)',   // Green
    'hsl(0, 0%, 65%)',      // Gray
    'hsl(45, 90%, 65%)',    // Yellow
    'hsl(280, 45%, 65%)',   // Purple
    'hsl(20, 75%, 60%)',    // Orange
    'hsl(190, 55%, 55%)',   // Teal
    'hsl(330, 55%, 70%)',   // Pink
    'hsl(80, 40%, 50%)',    // Olive
    'hsl(250, 50%, 75%)',   // Lavender
    'hsl(15, 45%, 40%)',    // Dark Brown
    'hsl(170, 35%, 75%)',   // Mint
    'hsl(0, 0%, 35%)',      // Dark Gray
];

/**
 * Simple hash function to convert issue key to a consistent index
 * Same issue key always produces the same hash
 */
function hashIssueKey(issueKey: string): number {
    let hash = 0;
    for (let i = 0; i < issueKey.length; i++) {
        const char = issueKey.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
}

/**
 * Get a consistent color for a given issue key
 * @param issueKey - The issue key (e.g., "PROJ-123")
 * @returns HSL color string
 */
export function getIssueColor(issueKey: string): string {
    const hash = hashIssueKey(issueKey);
    const index = hash % COLOR_PALETTE.length;
    return COLOR_PALETTE[index];
}

/**
 * Get text color (black or white) that contrasts well with the background
 * @param backgroundColor - HSL color string, e.g. "hsl(210, 60%, 65%)"
 * @returns '#000000' or '#ffffff'
 */
export function getContrastColor(backgroundColor: string): string {
    const match = backgroundColor.match(/hsl\(\s*[\d.]+,\s*[\d.]+%,\s*([\d.]+)%\s*\)/);
    const lightness = match ? parseFloat(match[1]) : 75;
    return lightness < 55 ? '#ffffff' : '#000000';
}

/**
 * Get all available colors in the palette
 * Useful for displaying a color legend
 */
export function getAllColors(): string[] {
    return [...COLOR_PALETTE];
}
