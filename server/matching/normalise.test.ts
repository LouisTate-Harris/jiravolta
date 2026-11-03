import { describe, expect, it } from 'vitest'
import { normaliseTitle } from './normalise'

describe('normaliseTitle', () => {
  it('treats reply prefixes, trailing counters and punctuation as cosmetic', () => {
    expect(normaliseTitle('Team stand-up (3/5)')).toBe('team stand up')
    expect(normaliseTitle('RE: Team stand-up')).toBe('team stand up')
    expect(normaliseTitle('  Updated: FW: Team Stand-Up [Teams]  ')).toBe('team stand up')
  })

  it('keeps distinct meetings distinct', () => {
    expect(normaliseTitle('Budget review')).not.toBe(normaliseTitle('Budget planning'))
  })
})
