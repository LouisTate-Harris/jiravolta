import { normaliseTitle } from './normalise'
import type { LearnedMapping } from './learnedMappings'
import type { SimilarityScorer } from './similarity'
import type { MatchProposal, TicketCandidate } from './types'

const ISSUE_KEY = /\b[A-Z][A-Z0-9]+-\d+\b/g

export interface MatchInput {
  titles: string[]
  candidates: TicketCandidate[]
  learned: LearnedMapping[]
  scorer: SimilarityScorer
}

function none(title: string, reason: string): MatchProposal {
  return { title, issueKey: null, source: 'none', confidence: 0, reason }
}

/**
 * Local matching, in order of trust: a ticket key written in the title,
 * a mapping you've confirmed before, then similarity to ticket summaries and
 * to titles you've mapped before. Nothing here leaves the machine.
 */
export async function matchTitles({ titles, candidates, learned, scorer }: MatchInput): Promise<MatchProposal[]> {
  const poolKeys = new Set(candidates.map(c => c.key))
  const learnedById = new Map(learned.map(m => [m.id, m]))
  // With no pool at all we can't judge staleness, so remembered mappings stand.
  const isLive = (key: string) => poolKeys.size === 0 || poolKeys.has(key)

  const unique = Array.from(new Set(titles))
  const results = new Map<string, MatchProposal>()
  const needSimilarity: string[] = []

  for (const title of unique) {
    const mentioned = (title.match(ISSUE_KEY) ?? []).find(k => poolKeys.has(k))
    if (mentioned) {
      results.set(title, { title, issueKey: mentioned, source: 'similar', confidence: 1, reason: `Title mentions ${mentioned}` })
      continue
    }

    const remembered = learnedById.get(normaliseTitle(title))
    if (remembered && isLive(remembered.issueKey)) {
      const times = remembered.count === 1 ? 'once' : `${remembered.count} times`
      results.set(title, {
        title,
        issueKey: remembered.issueKey,
        source: 'remembered',
        confidence: 1,
        reason: `You mapped this to ${remembered.issueKey} ${times} before`,
      })
      continue
    }

    needSimilarity.push(title)
  }

  if (needSimilarity.length > 0) {
    // Targets: every ticket summary, plus past titles whose ticket is still live.
    const targets: Array<{ text: string; issueKey: string; reason: (score: number) => string }> = []
    for (const c of candidates) {
      targets.push({ text: c.summary, issueKey: c.key, reason: () => `Similar to ${c.key} “${c.summary}”` })
    }
    for (const m of learned) {
      if (isLive(m.issueKey)) {
        targets.push({ text: m.title, issueKey: m.issueKey, reason: () => `Similar to “${m.title}”, which you mapped to ${m.issueKey}` })
      }
    }

    const scores = targets.length > 0 ? await scorer.score(needSimilarity, targets.map(t => t.text)) : []

    needSimilarity.forEach((title, row) => {
      let best = -1
      let bestScore = 0
      const rowScores = scores[row] ?? []
      rowScores.forEach((s, i) => {
        if (s > bestScore) {
          bestScore = s
          best = i
        }
      })

      if (best >= 0 && bestScore >= scorer.threshold) {
        const target = targets[best]
        results.set(title, {
          title,
          issueKey: target.issueKey,
          source: 'similar',
          confidence: Math.min(1, bestScore),
          reason: target.reason(bestScore),
        })
      } else {
        const stale = learnedById.get(normaliseTitle(title))
        results.set(title, none(title, stale ? `${stale.issueKey} is no longer in the ticket pool` : 'No close match found'))
      }
    })
  }

  return unique.map(t => results.get(t)!)
}
