/**
 * Color palette utility for issue-based worklog coloring
 * Generates 15 visually distinct colors using HSL color space
 */

// Generate 15 distinct colors with good saturation and lightness for readability
const COLOR_PALETTE = [
    'hsl(0, 70%, 75%)',     // Red
    'hsl(25, 70%, 75%)',    // Orange
    'hsl(50, 70%, 75%)',    // Yellow
    'hsl(75, 70%, 75%)',    // Yellow-Green
    'hsl(100, 70%, 75%)',   // Green
    'hsl(150, 70%, 75%)',   // Teal
    'hsl(180, 70%, 75%)',   // Cyan
    'hsl(200, 70%, 75%)',   // Light Blue
    'hsl(220, 70%, 75%)',   // Blue
    'hsl(250, 70%, 75%)',   // Indigo
    'hsl(280, 70%, 75%)',   // Purple
    'hsl(300, 70%, 75%)',   // Magenta
    'hsl(320, 70%, 75%)',   // Pink
    'hsl(340, 70%, 75%)',   // Rose
    'hsl(360, 70%, 75%)',   // Red-Pink
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
 * @param backgroundColor - HSL color string
 * @returns 'black' or 'white'
 */
export function getContrastColor(_backgroundColor: string): string {
    // For our palette with 70% saturation and 75% lightness, black text works well
    return '#000000';
}

/**
 * Get all available colors in the palette
 * Useful for displaying a color legend
 */
export function getAllColors(): string[] {
    return [...COLOR_PALETTE];
}
