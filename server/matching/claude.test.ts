import { describe, expect, it, vi } from 'vitest'
import { askClaude, buildClaudePrompt } from './claude'

const candidates = [
  { key: 'ABC-1', summary: 'Budget tracker' },
  { key: 'ABC-2', summary: 'Team ceremonies' },
]

const reply = (matches: unknown) => ({ content: [{ type: 'text', text: JSON.stringify({ matches }) }], stop_reason: 'end_turn' })

describe('askClaude', () => {
  it('maps valid answers and rejects keys outside the supplied pool', async () => {
    const create = vi.fn().mockResolvedValue(reply([
      { title: 'Budget review', issueKey: 'ABC-1', reason: 'Budget work' },
      { title: 'Mystery', issueKey: 'HALLUCINATED-9', reason: 'Guess' },
      { title: 'Lunch', issueKey: null, reason: 'Not work' },
    ]))
    const result = await askClaude({ messages: { create } }, 'test-model', ['Budget review', 'Mystery', 'Lunch'], candidates)
    expect(result.map(r => [r.issueKey, r.source])).toEqual([['ABC-1', 'claude'], [null, 'none'], [null, 'none']])
  })

  it('sends only titles and ticket text, never times or other event data', async () => {
    const create = vi.fn().mockResolvedValue(reply([]))
    await askClaude({ messages: { create } }, 'test-model', ['Budget review'], candidates)
    const sent = JSON.stringify(create.mock.calls[0][0])
    expect(sent).toContain('Budget review')
    expect(create.mock.calls[0][0].model).toBe('test-model')
    expect(buildClaudePrompt(['A'], candidates)).toBe('Tickets:\nABC-1: Budget tracker\nABC-2: Team ceremonies\n\nEvent titles:\n- A')
  })

  it('throws on a refusal or truncation instead of returning partial results', async () => {
    const create = vi.fn().mockResolvedValue({ content: [], stop_reason: 'refusal' })
    await expect(askClaude({ messages: { create } }, 'm', ['x'], candidates)).rejects.toThrow('refusal')
  })
})
