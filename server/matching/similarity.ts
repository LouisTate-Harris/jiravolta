import path from 'node:path'
import { normaliseTitle } from './normalise'

/**
 * Scores how alike each query string is to each target string, 0–1.
 * `threshold` is the minimum score worth proposing for this scorer, since
 * embedding cosine similarity and word overlap sit on different scales.
 */
export interface SimilarityScorer {
  name: string
  threshold: number
  score(queries: string[], targets: string[]): Promise<number[][]>
}

const STOP_WORDS = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'for', 'in', 'on', 'with', 'meeting', 'call', 'sync'])

function stem(word: string): string {
  return word.replace(/(ing|ed|es|s)$/, '')
}

function tokens(text: string): Set<string> {
  return new Set(
    normaliseTitle(text)
      .split(' ')
      .filter(w => w.length > 1 && !STOP_WORDS.has(w))
      .map(stem),
  )
}

/** Word-overlap fallback: used when the embedding model isn't available. */
export const lexicalScorer: SimilarityScorer = {
  name: 'word-overlap',
  threshold: 0.5,
  async score(queries, targets) {
    const targetTokens = targets.map(tokens)
    return queries.map(query => {
      const q = tokens(query)
      return targetTokens.map(t => {
        if (q.size === 0 || t.size === 0) return 0
        let shared = 0
        for (const word of q) if (t.has(word)) shared++
        return shared / Math.min(q.size, t.size)
      })
    })
  },
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb)
}

export type Embedder = (texts: string[]) => Promise<number[][]>

export function embeddingScorer(embed: Embedder, name: string): SimilarityScorer {
  return {
    name,
    threshold: 0.45,
    async score(queries, targets) {
      if (queries.length === 0 || targets.length === 0) return queries.map(() => targets.map(() => 0))
      const [q, t] = await Promise.all([embed(queries), embed(targets)])
      return q.map(qv => t.map(tv => cosine(qv, tv)))
    },
  }
}

const DEFAULT_MODEL = 'Xenova/all-MiniLM-L6-v2'

/**
 * Lazily loads a small sentence-embedding model (downloaded once into
 * `<configDir>/models`, then fully local). Resolves to the word-overlap scorer
 * if the model can't be loaded, so matching never hard-fails.
 */
export function createLocalScorer(configDir: string, modelId: string = DEFAULT_MODEL) {
  let loading: Promise<SimilarityScorer> | null = null
  let status: { ready: boolean; scorer: string; error?: string } = { ready: false, scorer: 'loading' }

  const load = async (): Promise<SimilarityScorer> => {
    try {
      const { pipeline, env } = await import('@huggingface/transformers')
      env.cacheDir = path.join(configDir, 'models')
      const extractor = await pipeline('feature-extraction', modelId)
      const embed: Embedder = async texts => {
        const output = await extractor(texts, { pooling: 'mean', normalize: true })
        return output.tolist() as number[][]
      }
      status = { ready: true, scorer: modelId }
      return embeddingScorer(embed, modelId)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.warn('[calendar-match] Local similarity model unavailable, using word overlap:', message)
      status = { ready: true, scorer: lexicalScorer.name, error: message }
      return lexicalScorer
    }
  }

  return {
    get(): Promise<SimilarityScorer> {
      loading ??= load()
      return loading
    },
    status: () => status,
  }
}
