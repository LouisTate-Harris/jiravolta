const REPLY_PREFIX = /^\s*((re|fw|fwd|accepted|declined|tentative|updated|canceled|cancelled|invitation)\s*:\s*)+/i
const TRAILING_BRACKETS = /\s*[([][^)\]]*[)\]]\s*$/

/**
 * Collapses cosmetic differences so "Team stand-up (3/5)" and
 * "RE: Team stand-up" count as the same meeting.
 */
export function normaliseTitle(title: string): string {
  let result = title.trim()
  result = result.replace(REPLY_PREFIX, '')
  while (TRAILING_BRACKETS.test(result)) {
    result = result.replace(TRAILING_BRACKETS, '')
  }
  return result
    .toLowerCase()
    .replace(/[-–—_/]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}
