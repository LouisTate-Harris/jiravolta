import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { normaliseTitle } from './normalise'

export interface LearnedMapping {
  /** Normalised title — one remembered ticket per title. */
  id: string
  /** The most recent raw title, for display. */
  title: string
  issueKey: string
  /** How many times this title→ticket pair has been confirmed in a row. */
  count: number
  lastUsed: string
}

export interface ConfirmedPair {
  title: string
  issueKey: string
}

/** Where learned mappings and the model cache live: outside the repo, per user. */
export function resolveConfigDir(env: Record<string, string | undefined> = process.env): string {
  return env.JIRAVOLTA_CONFIG_DIR || path.join(os.homedir(), '.config', 'jiravolta')
}

export class LearnedMappingStore {
  private readonly dir: string
  private readonly file: string

  constructor(dir: string) {
    this.dir = dir
    this.file = path.join(dir, 'learned-mappings.json')
  }

  list(): LearnedMapping[] {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf-8')) as unknown
      if (!Array.isArray(parsed)) return []
      return parsed.filter(
        (m): m is LearnedMapping =>
          typeof m?.id === 'string' && typeof m?.issueKey === 'string' && typeof m?.title === 'string',
      )
    } catch {
      return []
    }
  }

  /** Confirming a different ticket for a known title replaces it and restarts the count. */
  record(pairs: ConfirmedPair[], now: Date = new Date()): LearnedMapping[] {
    const byId = new Map(this.list().map(m => [m.id, m]))

    for (const pair of pairs) {
      const id = normaliseTitle(pair.title)
      if (!id || !pair.issueKey) continue
      const existing = byId.get(id)
      byId.set(id, {
        id,
        title: pair.title.trim(),
        issueKey: pair.issueKey,
        count: existing && existing.issueKey === pair.issueKey ? existing.count + 1 : 1,
        lastUsed: now.toISOString(),
      })
    }

    const all = Array.from(byId.values())
    this.write(all)
    return all
  }

  remove(id: string): boolean {
    const all = this.list()
    const remaining = all.filter(m => m.id !== id)
    if (remaining.length === all.length) return false
    this.write(remaining)
    return true
  }

  private write(mappings: LearnedMapping[]): void {
    fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 })
    const tmp = `${this.file}.${process.pid}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(mappings, null, 2), { mode: 0o600 })
    fs.renameSync(tmp, this.file)
  }
}
