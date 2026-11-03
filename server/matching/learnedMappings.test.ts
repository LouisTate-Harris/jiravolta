import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LearnedMappingStore } from './learnedMappings'

let dir: string
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'learned-')) })
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

describe('LearnedMappingStore', () => {
  it('starts empty and persists recorded pairs', () => {
    const store = new LearnedMappingStore(dir)
    expect(store.list()).toEqual([])
    store.record([{ title: 'Team stand-up (3/5)', issueKey: 'ABC-1' }])
    expect(new LearnedMappingStore(dir).list()).toMatchObject([{ id: 'team stand up', issueKey: 'ABC-1', count: 1 }])
  })

  it('counts repeats of the same pair and restarts when the ticket changes', () => {
    const store = new LearnedMappingStore(dir)
    store.record([{ title: 'Stand-up', issueKey: 'ABC-1' }])
    store.record([{ title: 'RE: Stand-up', issueKey: 'ABC-1' }])
    expect(store.list()[0].count).toBe(2)
    store.record([{ title: 'Stand-up', issueKey: 'ABC-2' }])
    expect(store.list()[0]).toMatchObject({ issueKey: 'ABC-2', count: 1 })
  })

  it('removes entries and writes the file readable only by the owner', () => {
    const store = new LearnedMappingStore(dir)
    store.record([{ title: 'Stand-up', issueKey: 'ABC-1' }])
    expect(fs.statSync(path.join(dir, 'learned-mappings.json')).mode & 0o777).toBe(0o600)
    expect(store.remove('stand up')).toBe(true)
    expect(store.remove('stand up')).toBe(false)
    expect(store.list()).toEqual([])
  })

  it('treats a corrupt file as empty rather than throwing', () => {
    fs.writeFileSync(path.join(dir, 'learned-mappings.json'), '{nope')
    expect(new LearnedMappingStore(dir).list()).toEqual([])
  })
})
