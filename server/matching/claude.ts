import Anthropic from '@anthropic-ai/sdk'
import type { MatchProposal, TicketCandidate } from './types'

/** Small and cheap by default; matching titles to tickets doesn't need a frontier model. */
export const DEFAULT_CLAUDE_MATCH_MODEL = 'claude-haiku-5-5'

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    matches: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          issueKey: { type: ['string', 'null'] },
          reason: { type: 'string' },
        },
        required: ['title', 'issueKey', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['matches'],
  additionalProperties: false,
} as const

const SYSTEM_PROMPT = `You match calendar event titles to Jira tickets for timesheet logging.
For each title, choose the single best ticket from the list provided, or null if none is a reasonable fit.
Only use ticket keys from the list. Never invent keys. Prefer null over a weak guess.
Keep each reason to one short sentence.`

export interface ClaudeMessageClient {
  messages: {
    create(params: Record<string, unknown>): Promise<{
      content: Array<{ type: string; text?: string }>
      stop_reason?: string | null
    }>
  }
}

/** What would be sent, for the preview panel. Titles and ticket text only. */
export function buildClaudePrompt(titles: string[], candidates: TicketCandidate[]): string {
  const ticketLines = candidates.map(c => `${c.key}: ${c.summary}`).join('\n')
  const titleLines = titles.map(t => `- ${t}`).join('\n')
  return `Tickets:\n${ticketLines}\n\nEvent titles:\n${titleLines}`
}

export function createClaudeClient(apiKey: string): ClaudeMessageClient {
  return new Anthropic({ apiKey }) as unknown as ClaudeMessageClient
}

export async function askClaude(
  client: ClaudeMessageClient,
  model: string,
  titles: string[],
  candidates: TicketCandidate[],
): Promise<MatchProposal[]> {
  const unique = Array.from(new Set(titles))
  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: RESPONSE_SCHEMA } },
    messages: [{ role: 'user', content: buildClaudePrompt(unique, candidates) }],
  })

  if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') {
    throw new Error(`Claude did not complete the request (${response.stop_reason})`)
  }

  const text = response.content.find(b => b.type === 'text')?.text
  if (!text) throw new Error('Claude returned no text')

  const parsed = JSON.parse(text) as { matches?: Array<{ title: string; issueKey: string | null; reason: string }> }
  const validKeys = new Set(candidates.map(c => c.key))
  const byTitle = new Map((parsed.matches ?? []).map(m => [m.title, m]))

  return unique.map(title => {
    const match = byTitle.get(title)
    if (!match || !match.issueKey || !validKeys.has(match.issueKey)) {
      return { title, issueKey: null, source: 'none' as const, confidence: 0, reason: match?.reason || 'Claude found no confident match' }
    }
    return { title, issueKey: match.issueKey, source: 'claude' as const, confidence: 0.8, reason: match.reason }
  })
}
