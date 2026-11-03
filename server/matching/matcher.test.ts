import { describe, expect, it } from 'vitest'
import { matchTitles } from './matcher'
import { lexicalScorer } from './similarity'
import type { LearnedMapping } from './learnedMappings'

const candidates = [
  { key: 'ABC-1', summary: 'Demand forecasting model' },
  { key: 'ABC-2', summary: 'Team ceremonies' },
  { key: 'ABC-3', summary: 'Vendor contract renewal' },
]

const learned = (id: string, issueKey: string, count = 3): LearnedMapping => ({
  id, title: id, issueKey, count, lastUsed: '2026-11-01T00:00:00.000Z',
})

describe('matchTitles', () => {
  it('uses remembered mappings first, normalising the title', async () => {
    const [p] = await matchTitles({ titles: ['RE: Weekly sync (2/4)'], candidates, learned: [learned('weekly sync', 'ABC-2')], scorer: lexicalScorer })
    expect(p).toMatchObject({ issueKey: 'ABC-2', source: 'remembered', confidence: 1 })
  })

  it('ignores a remembered mapping whose ticket has left the pool', async () => {
    const [p] = await matchTitles({ titles: ['Weekly sync'], candidates, learned: [learned('weekly sync', 'GONE-9')], scorer: lexicalScorer })
    expect(p.source).toBe('none')
    expect(p.reason).toContain('GONE-9')
  })

  it('picks up a ticket key written in the title', async () => {
    const [p] = await matchTitles({ titles: ['Pairing on ABC-3 follow-ups'], candidates, learned: [], scorer: lexicalScorer })
    expect(p).toMatchObject({ issueKey: 'ABC-3', source: 'similar' })
  })

  it('matches against ticket summaries and against past titles', async () => {
    const result = await matchTitles({
      titles: ['Forecasting model deep work', 'FC deep work block'],
      candidates,
      learned: [learned('fc deep work', 'ABC-1')],
      scorer: lexicalScorer,
    })
    expect(result[0]).toMatchObject({ issueKey: 'ABC-1', source: 'similar' })
    expect(result[1]).toMatchObject({ issueKey: 'ABC-1', source: 'similar' })
    expect(result[1].reason).toContain('you mapped')
  })

  it('returns no proposal when nothing is close, and dedupes repeated titles', async () => {
    const result = await matchTitles({ titles: ['Lunch', 'Lunch'], candidates, learned: [], scorer: lexicalScorer })
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ issueKey: null, source: 'none' })
  })
})
