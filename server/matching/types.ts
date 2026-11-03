export interface TicketCandidate {
  key: string
  summary: string
}

export type MatchSource = 'remembered' | 'similar' | 'claude' | 'none'

export interface MatchProposal {
  /** The title exactly as sent in, so callers can key results by it. */
  title: string
  issueKey: string | null
  source: MatchSource
  /** 0–1. Exact remembered mappings are 1. */
  confidence: number
  reason: string
}
