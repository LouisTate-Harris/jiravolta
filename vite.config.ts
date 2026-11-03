import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import type { Plugin, ViteDevServer } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { loadCalendarConfigs } from './server/calendar/config'
import { IcsCalendarSource } from './server/calendar/icsCalendarSource'
import { MergedCalendarSource } from './server/calendar/mergedCalendarSource'
import type { CalendarEvent } from './server/calendar/calendarSource'
import { fetchIssuePool } from './server/jira/issuePool'
import { LearnedMappingStore, resolveConfigDir } from './server/matching/learnedMappings'
import { createLocalScorer } from './server/matching/similarity'
import { matchTitles } from './server/matching/matcher'
import { askClaude, createClaudeClient, DEFAULT_CLAUDE_MATCH_MODEL } from './server/matching/claude'
import type { TicketCandidate } from './server/matching/types'

const JIRA_ISSUE_SEARCH_FIELDS = [
  'summary',
  'parent',
  'labels',
  'customfield_12345',
  'issuetype',
  'worklog',
]
const JIRA_SEARCH_PAGE_SIZE = 100
const JIRA_WORKLOG_PAGE_SIZE = 100

function parseDateParam(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) {
    return null
  }

  const [, year, month, day] = match
  return new Date(Number(year), Number(month) - 1, Number(day))
}

function formatDateParam(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getMondayWeekStart(date: Date): Date {
  const normalized = new Date(date)
  const day = normalized.getDay()
  const diff = day === 0 ? -6 : 1 - day
  normalized.setDate(normalized.getDate() + diff)
  normalized.setHours(0, 0, 0, 0)
  return normalized
}

function getSundayWeekEnd(weekStart: Date): Date {
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)
  weekEnd.setHours(23, 59, 59, 999)
  return weekEnd
}

/**
 * Local Jira middleware that caches worklog data in .cache/<weekStart>.json.
 *
 * Flow (on cache MISS):
 *  1. JQL search  → find issues with the current user's worklogs for the week
 *  2. Per-issue   → collect worklog IDs that fall within the date range
 *                   (pages beyond the embedded 20 are fetched individually)
 *  3. Bulk list   → POST /rest/api/3/worklog/list only for missing worklog details
 *  4. Persist     → write { worklogs, issueKeyMap, issueDetailsMap } to .cache/<weekStart>.json
 *
 * On cache HIT the file is returned directly — no Jira calls are made.
 */
function jiraLocalCachePlugin(env: Record<string, string>): Plugin {
  return {
    name: 'jira-local-cache',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        if (req.url?.startsWith('/_local/jira-config')) {
          const configured = !!(env.JIRA_BASE_URL && env.JIRA_EMAIL && env.JIRA_API_TOKEN)
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ configured, baseUrl: env.JIRA_BASE_URL || null }))
          return
        }

        if (req.url?.startsWith('/_local/jira-test')) {
          const baseUrl = env.JIRA_BASE_URL
          const email = env.JIRA_EMAIL
          const token = env.JIRA_API_TOKEN

          if (!baseUrl || !email || !token) {
            res.statusCode = 503
            res.end(JSON.stringify({ error: 'Jira env vars not configured' }))
            return
          }

          try {
            const authHeader = `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`
            const testRes = await fetch(`${baseUrl}/rest/api/3/myself`, {
              headers: {
                'Authorization': authHeader,
                'Accept': 'application/json',
              },
            })

            if (!testRes.ok) {
              res.statusCode = testRes.status
              res.end(JSON.stringify({ error: `Jira test failed: ${testRes.status} ${testRes.statusText}` }))
              return
            }

            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: true }))
            return
          } catch (err) {
            res.statusCode = 500
            res.end(JSON.stringify({ error: String(err) }))
            return
          }
        }

        // ── Write API: helper to read request body ──────────────────────────
        const readBody = (r: IncomingMessage): Promise<string> =>
          new Promise((resolve, reject) => {
            const chunks: Buffer[] = []
            r.on('data', (chunk: Buffer) => chunks.push(chunk))
            r.on('end', () => resolve(Buffer.concat(chunks).toString()))
            r.on('error', reject)
          })

        // ── POST /_local/jira-worklog-create ────────────────────────────────
        if (req.method === 'POST' && req.url?.startsWith('/_local/jira-worklog-create')) {
          const baseUrl = env.JIRA_BASE_URL
          const email = env.JIRA_EMAIL
          const token = env.JIRA_API_TOKEN
          if (!baseUrl || !email || !token) {
            res.statusCode = 503
            res.end(JSON.stringify({ error: 'Jira env vars not configured' }))
            return
          }
          try {
            const body = JSON.parse(await readBody(req)) as { issueKey: string; started: string; timeSpentSeconds: number }
            const authHeader = `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`
            const jiraRes = await fetch(`${baseUrl}/rest/api/3/issue/${encodeURIComponent(body.issueKey)}/worklog`, {
              method: 'POST',
              headers: { 'Authorization': authHeader, 'Accept': 'application/json', 'Content-Type': 'application/json' },
              body: JSON.stringify({ started: body.started, timeSpentSeconds: body.timeSpentSeconds }),
            })
            if (!jiraRes.ok) {
              const errorText = await jiraRes.text().catch(() => jiraRes.statusText)
              res.statusCode = jiraRes.status
              res.end(JSON.stringify({ error: `Jira create worklog failed: ${jiraRes.status} ${errorText}` }))
              return
            }
            const created = await jiraRes.json()
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(created))
          } catch (err) {
            res.statusCode = 500
            res.end(JSON.stringify({ error: String(err) }))
          }
          return
        }

        // ── PUT /_local/jira-worklog-update ─────────────────────────────────
        if (req.method === 'PUT' && req.url?.startsWith('/_local/jira-worklog-update')) {
          const baseUrl = env.JIRA_BASE_URL
          const email = env.JIRA_EMAIL
          const token = env.JIRA_API_TOKEN
          if (!baseUrl || !email || !token) {
            res.statusCode = 503
            res.end(JSON.stringify({ error: 'Jira env vars not configured' }))
            return
          }
          try {
            const body = JSON.parse(await readBody(req)) as { issueKey: string; worklogId: string; started: string; timeSpentSeconds: number }
            const authHeader = `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`
            const jiraRes = await fetch(
              `${baseUrl}/rest/api/3/issue/${encodeURIComponent(body.issueKey)}/worklog/${encodeURIComponent(body.worklogId)}`,
              {
                method: 'PUT',
                headers: { 'Authorization': authHeader, 'Accept': 'application/json', 'Content-Type': 'application/json' },
                body: JSON.stringify({ started: body.started, timeSpentSeconds: body.timeSpentSeconds }),
              },
            )
            if (!jiraRes.ok) {
              const errorText = await jiraRes.text().catch(() => jiraRes.statusText)
              res.statusCode = jiraRes.status
              res.end(JSON.stringify({ error: `Jira update worklog failed: ${jiraRes.status} ${errorText}` }))
              return
            }
            const updated = await jiraRes.json()
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(updated))
          } catch (err) {
            res.statusCode = 500
            res.end(JSON.stringify({ error: String(err) }))
          }
          return
        }

        // ── DELETE /_local/jira-worklog-delete?issueKey=...&worklogId=... ───
        if (req.method === 'DELETE' && req.url?.startsWith('/_local/jira-worklog-delete')) {
          const baseUrl = env.JIRA_BASE_URL
          const email = env.JIRA_EMAIL
          const token = env.JIRA_API_TOKEN
          if (!baseUrl || !email || !token) {
            res.statusCode = 503
            res.end(JSON.stringify({ error: 'Jira env vars not configured' }))
            return
          }
          const deleteUrl = new URL(req.url, 'http://localhost')
          const issueKey = deleteUrl.searchParams.get('issueKey')
          const worklogId = deleteUrl.searchParams.get('worklogId')
          if (!issueKey || !worklogId) {
            res.statusCode = 400
            res.end(JSON.stringify({ error: 'Missing issueKey or worklogId query params' }))
            return
          }
          try {
            const authHeader = `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`
            const jiraRes = await fetch(
              `${baseUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}/worklog/${encodeURIComponent(worklogId)}`,
              { method: 'DELETE', headers: { 'Authorization': authHeader, 'Accept': 'application/json' } },
            )
            if (!jiraRes.ok && jiraRes.status !== 204) {
              const errorText = await jiraRes.text().catch(() => jiraRes.statusText)
              res.statusCode = jiraRes.status
              res.end(JSON.stringify({ error: `Jira delete worklog failed: ${jiraRes.status} ${errorText}` }))
              return
            }
            res.statusCode = 204
            res.end()
          } catch (err) {
            res.statusCode = 500
            res.end(JSON.stringify({ error: String(err) }))
          }
          return
        }

        // ── DELETE /_local/jira-cache-invalidate?week=YYYY-MM-DD ────────────
        if (req.method === 'DELETE' && req.url?.startsWith('/_local/jira-cache-invalidate')) {
          const invalidateUrl = new URL(req.url, 'http://localhost')
          const week = invalidateUrl.searchParams.get('week')
          if (week) {
            const fileToDelete = path.resolve('.cache', `${week}.json`)
            if (fs.existsSync(fileToDelete)) {
              fs.rmSync(fileToDelete)
              console.log(`[jira-local-cache] Invalidated cache for week ${week}`)
            }
          }
          res.statusCode = 204
          res.end()
          return
        }

        // ── DELETE /_local/jira-cache-clear-all?scope=worklogs|active-issues|ticket-list|issue-pool ──
        // Repeat the ?scope= param to clear multiple caches; omit it to clear everything.
        if (req.method === 'DELETE' && req.url?.startsWith('/_local/jira-cache-clear-all')) {
          const clearUrl = new URL(req.url, 'http://localhost')
          const requestedScopes = clearUrl.searchParams.getAll('scope')
          const scopes = requestedScopes.length > 0
            ? requestedScopes
            : ['worklogs', 'active-issues', 'ticket-list', 'issue-pool']
          const dirPath = path.resolve('.cache')
          const scopedCacheFiles = ['active-issues.json', 'ticket-list.json', 'issue-pool.json']

          if (scopes.includes('worklogs') && fs.existsSync(dirPath)) {
            for (const file of fs.readdirSync(dirPath)) {
              if (file.endsWith('.json') && !scopedCacheFiles.includes(file)) {
                fs.rmSync(path.join(dirPath, file))
              }
            }
            const worklogDir = path.join(dirPath, 'worklogs')
            if (fs.existsSync(worklogDir)) {
              fs.rmSync(worklogDir, { recursive: true, force: true })
            }
          }

          if (scopes.includes('active-issues')) {
            const activeIssuesFile = path.join(dirPath, 'active-issues.json')
            if (fs.existsSync(activeIssuesFile)) fs.rmSync(activeIssuesFile)
          }

          if (scopes.includes('ticket-list')) {
            const ticketListFile = path.join(dirPath, 'ticket-list.json')
            if (fs.existsSync(ticketListFile)) fs.rmSync(ticketListFile)
          }

          if (scopes.includes('issue-pool')) {
            const issuePoolFile = path.join(dirPath, 'issue-pool.json')
            if (fs.existsSync(issuePoolFile)) fs.rmSync(issuePoolFile)
          }

          console.log(`[jira-local-cache] Cleared cache (scope=${scopes.join(',')})`)
          res.statusCode = 204
          res.end()
          return
        }

        // ── GET /_local/jira-ticket-list ─────────────────────────────────────
        if (req.method === 'GET' && req.url?.startsWith('/_local/jira-ticket-list')) {
          const ticketListFile = path.join(path.resolve('.cache'), 'ticket-list.json')
          res.setHeader('Content-Type', 'application/json')
          if (fs.existsSync(ticketListFile)) {
            res.end(fs.readFileSync(ticketListFile, 'utf-8'))
          } else {
            res.end('[]')
          }
          return
        }

        // ── PUT /_local/jira-ticket-list ─────────────────────────────────────
        if (req.method === 'PUT' && req.url?.startsWith('/_local/jira-ticket-list')) {
          try {
            const body = await readBody(req)
            const cacheDir = path.resolve('.cache')
            fs.mkdirSync(cacheDir, { recursive: true })
            fs.writeFileSync(path.join(cacheDir, 'ticket-list.json'), body)
            res.statusCode = 204
            res.end()
          } catch (err) {
            res.statusCode = 500
            res.end(JSON.stringify({ error: String(err) }))
          }
          return
        }

        // ── GET /_local/jira-issue?key=CAN-1234 ──────────────────────────────
        // Matches on '?' so it doesn't also catch /_local/jira-issue-pool below.
        if (req.method === 'GET' && req.url?.startsWith('/_local/jira-issue?')) {
          const baseUrl = env.JIRA_BASE_URL
          const email = env.JIRA_EMAIL
          const token = env.JIRA_API_TOKEN
          if (!baseUrl || !email || !token) {
            res.statusCode = 503
            res.end(JSON.stringify({ error: 'Jira env vars not configured' }))
            return
          }
          const issueUrl = new URL(req.url, 'http://localhost')
          const key = issueUrl.searchParams.get('key')
          if (!key) {
            res.statusCode = 400
            res.end(JSON.stringify({ error: 'Missing key query param' }))
            return
          }
          try {
            const authHeader = `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`
            const jiraRes = await fetch(
              `${baseUrl}/rest/api/3/issue/${encodeURIComponent(key)}?fields=summary`,
              { headers: { 'Authorization': authHeader, 'Accept': 'application/json' } },
            )
            if (!jiraRes.ok) {
              const errorText = await jiraRes.text().catch(() => jiraRes.statusText)
              res.statusCode = jiraRes.status
              res.end(JSON.stringify({ error: `Jira issue fetch failed: ${jiraRes.status} ${errorText}` }))
              return
            }
            const issueData = await jiraRes.json() as { key: string; fields?: { summary?: string } }
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ key: issueData.key, summary: issueData.fields?.summary ?? null }))
          } catch (err) {
            res.statusCode = 500
            res.end(JSON.stringify({ error: String(err) }))
          }
          return
        }

        // ── GET /_local/jira-active-issues ───────────────────────────────────
        if (req.method === 'GET' && req.url?.startsWith('/_local/jira-active-issues')) {
          const activeCacheDir = path.resolve('.cache')
          const activeCacheFile = path.join(activeCacheDir, 'active-issues.json')

          if (fs.existsSync(activeCacheFile)) {
            console.log('[jira-local-cache] HIT  .cache/active-issues.json')
            res.setHeader('Content-Type', 'application/json')
            res.setHeader('X-Cache', 'HIT')
            res.end(fs.readFileSync(activeCacheFile, 'utf-8'))
            return
          }

          const activeBaseUrl = env.JIRA_BASE_URL
          const activeEmail = env.JIRA_EMAIL
          const activeToken = env.JIRA_API_TOKEN

          if (!activeBaseUrl || !activeEmail || !activeToken) {
            res.statusCode = 503
            res.end(JSON.stringify({ error: 'Jira env vars not configured' }))
            return
          }

          try {
            console.log('[jira-local-cache] MISS .cache/active-issues.json — fetching from Jira')
            const activeAuthHeader = `Basic ${Buffer.from(`${activeEmail}:${activeToken}`).toString('base64')}`
            const jql = 'assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC'
            const activeIssues: Array<{ key: string; fields: { summary?: string } }> = []
            let nextActivePageToken: string | undefined

            while (true) {
              const searchRes = await fetch(`${activeBaseUrl}/rest/api/3/search/jql`, {
                method: 'POST',
                headers: {
                  'Authorization': activeAuthHeader,
                  'Accept': 'application/json',
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  jql,
                  fields: ['summary'],
                  maxResults: JIRA_SEARCH_PAGE_SIZE,
                  nextPageToken: nextActivePageToken,
                }),
              })

              if (!searchRes.ok) {
                res.statusCode = searchRes.status
                res.end(JSON.stringify({ error: `Active issues JQL failed: ${searchRes.status} ${searchRes.statusText}` }))
                return
              }

              const page = await searchRes.json() as {
                issues?: Array<{ key: string; fields: { summary?: string } }>
                nextPageToken?: string
              }

              const pageIssues = page.issues ?? []
              nextActivePageToken = page.nextPageToken
              activeIssues.push(...pageIssues)

              if (!nextActivePageToken || pageIssues.length === 0) break
            }

            console.log(`[jira-local-cache] Active issues — ${activeIssues.length} found`)

            const result = {
              issues: activeIssues.map(i => ({
                key: i.key,
                summary: i.fields.summary?.trim() ?? i.key,
              })),
            }

            fs.mkdirSync(activeCacheDir, { recursive: true })
            fs.writeFileSync(activeCacheFile, JSON.stringify(result, null, 2))
            res.setHeader('Content-Type', 'application/json')
            res.setHeader('X-Cache', 'MISS')
            res.end(JSON.stringify(result))
          } catch (err) {
            res.statusCode = 500
            res.end(JSON.stringify({ error: String(err) }))
          }
          return
        }

        // ── GET /_local/jira-issue-pool ──────────────────────────────────────
        // Merges the active sprint of JIRA_BOARD_ID, a saved filter
        // (JIRA_EXTRA_FILTER_ID), and issues assigned to the current user —
        // for the calendar-import ticket picker.
        if (req.method === 'GET' && req.url?.startsWith('/_local/jira-issue-pool')) {
          const poolCacheDir = path.resolve('.cache')
          const poolCacheFile = path.join(poolCacheDir, 'issue-pool.json')

          if (fs.existsSync(poolCacheFile)) {
            console.log('[jira-local-cache] HIT  .cache/issue-pool.json')
            res.setHeader('Content-Type', 'application/json')
            res.setHeader('X-Cache', 'HIT')
            res.end(fs.readFileSync(poolCacheFile, 'utf-8'))
            return
          }

          const poolBaseUrl = env.JIRA_BASE_URL
          const poolEmail = env.JIRA_EMAIL
          const poolToken = env.JIRA_API_TOKEN

          if (!poolBaseUrl || !poolEmail || !poolToken) {
            res.statusCode = 503
            res.end(JSON.stringify({ error: 'Jira env vars not configured' }))
            return
          }

          try {
            console.log('[jira-local-cache] MISS .cache/issue-pool.json — fetching from Jira', {
              boardConfigured: !!env.JIRA_BOARD_ID,
              filterConfigured: !!env.JIRA_EXTRA_FILTER_ID,
            })
            const poolAuthHeader = `Basic ${Buffer.from(`${poolEmail}:${poolToken}`).toString('base64')}`
            const issues = await fetchIssuePool({
              baseUrl: poolBaseUrl,
              authHeader: poolAuthHeader,
              boardId: env.JIRA_BOARD_ID || undefined,
              filterId: env.JIRA_EXTRA_FILTER_ID || undefined,
            })

            const result = { issues }
            fs.mkdirSync(poolCacheDir, { recursive: true })
            fs.writeFileSync(poolCacheFile, JSON.stringify(result, null, 2))
            res.setHeader('Content-Type', 'application/json')
            res.setHeader('X-Cache', 'MISS')
            res.end(JSON.stringify(result))
          } catch (err) {
            console.error('[jira-local-cache] Issue pool fetch failed', err instanceof Error ? err.message : err)
            res.statusCode = 502
            res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Issue pool fetch failed' }))
          }
          return
        }

        if (!req.url?.startsWith('/_local/jira-worklogs')) {
          next()
          return
        }

        const url = new URL(req.url, 'http://localhost')
        const requestedWeek = url.searchParams.get('week')
        const requestedWeekEnd = url.searchParams.get('weekEnd')

        if (!requestedWeek || !requestedWeekEnd) {
          res.statusCode = 400
          res.end(JSON.stringify({ error: 'Missing ?week and ?weekEnd params' }))
          return
        }

        const parsedWeek = parseDateParam(requestedWeek)
        if (!parsedWeek) {
          res.statusCode = 400
          res.end(JSON.stringify({ error: 'Invalid ?week param, expected YYYY-MM-DD' }))
          return
        }

        const weekStart = getMondayWeekStart(parsedWeek)
        const weekEnd = getSundayWeekEnd(weekStart)
        const week = formatDateParam(weekStart)
        const weekEndKey = formatDateParam(weekEnd)

        const cacheDir = path.resolve('.cache')
        const cacheFile = path.join(cacheDir, `${week}.json`)
        const worklogCacheDir = path.join(cacheDir, 'worklogs')

        // ── Cache HIT ────────────────────────────────────────────────────────
        if (fs.existsSync(cacheFile)) {
          console.log(`[jira-local-cache] HIT  .cache/${week}.json`)
          const data = fs.readFileSync(cacheFile, 'utf-8')
          let parsed: {
            worklogs?: unknown[]
            issueKeyMap?: Record<string, string>
            issueDetailsMap?: Record<string, unknown>
          } | null = null

          try {
            parsed = JSON.parse(data) as {
              worklogs?: unknown[]
              issueKeyMap?: Record<string, string>
              issueDetailsMap?: Record<string, unknown>
            }
          } catch {
            parsed = null
          }

          const isEmptyCache = parsed !== null
            && (parsed.worklogs?.length ?? 0) === 0
            && Object.keys(parsed.issueKeyMap ?? {}).length === 0
            && Object.keys(parsed.issueDetailsMap ?? {}).length === 0

          // Empty caches can be produced by transient Jira/API failures.
          // Rebuild instead of repeatedly serving a poisoned empty file.
          if (!isEmptyCache) {
            res.setHeader('Content-Type', 'application/json')
            res.setHeader('X-Cache', 'HIT')
            res.end(data)
            return
          }

          console.log(`[jira-local-cache] STALE EMPTY cache .cache/${week}.json — rebuilding`)
        }

        const baseUrl = env.JIRA_BASE_URL
        const email = env.JIRA_EMAIL
        const token = env.JIRA_API_TOKEN

        if (!baseUrl || !email || !token) {
          res.statusCode = 503
          res.end(JSON.stringify({ error: 'Jira env vars not configured' }))
          return
        }

        const authHeader = `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`
        const jsonHeaders = {
          'Authorization': authHeader,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        }

        const sendEmpty = () => {
          const empty = { worklogs: [], issueKeyMap: {}, issueDetailsMap: {} }
          fs.mkdirSync(cacheDir, { recursive: true })
          fs.writeFileSync(cacheFile, JSON.stringify(empty, null, 2))
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('X-Cache', 'MISS')
          res.end(JSON.stringify(empty))
        }

        try {
          console.log(`[jira-local-cache] MISS .cache/${week}.json — fetching from Jira`)

          // ── Step 1: JQL search ───────────────────────────────────────────
          const jql = `worklogAuthor = currentUser() AND worklogDate >= "${week}" AND worklogDate <= "${weekEndKey}"`
          const issues: Array<{
            id: string
            key: string
            fields: {
              summary?: string
              parent?: { id?: string; key?: string; fields?: { summary?: string } }
              labels?: string[]
              customfield_12345?: unknown
              issuetype?: { id?: string; name?: string }
              worklog: { worklogs: Array<{ id: string; started: string }>; total: number }
            }
          }> = []

          let nextPageToken: string | undefined

          while (true) {
            const searchRes = await fetch(`${baseUrl}/rest/api/3/search/jql`, {
              method: 'POST',
              headers: jsonHeaders,
              body: JSON.stringify({
                jql,
                fields: JIRA_ISSUE_SEARCH_FIELDS,
                maxResults: JIRA_SEARCH_PAGE_SIZE,
                nextPageToken,
              }),
            })

            if (!searchRes.ok) {
              res.statusCode = searchRes.status
              res.end(JSON.stringify({ error: `JQL search failed: ${searchRes.status} ${searchRes.statusText}` }))
              return
            }

            const page = await searchRes.json() as {
              issues?: Array<{
                id: string
                key: string
                fields: {
                  summary?: string
                  parent?: { id?: string; key?: string; fields?: { summary?: string } }
                  labels?: string[]
                  customfield_12345?: unknown
                  issuetype?: { id?: string; name?: string }
                  worklog: { worklogs: Array<{ id: string; started: string }>; total: number }
                }
              }>
              nextPageToken?: string
            }

            const pageIssues = page.issues ?? []
            nextPageToken = page.nextPageToken

            issues.push(...pageIssues)

            if (!nextPageToken || pageIssues.length === 0) {
              break
            }
          }

          console.log(`[jira-local-cache] Step 1 — ${issues.length} issue(s) found`)

          if (issues.length === 0) { sendEmpty(); return }

          // ── Step 2: Collect worklog IDs in date range ────────────────────
          const issueKeyMap: Record<string, string> = {}
          const issueDetailsMap: Record<string, {
            id: string
            key: string
            summary?: string
            parent?: { id?: string; key?: string; summary?: string }
            labels?: string[]
            customfield_12345?: unknown
            issuetype?: { id?: string; name?: string }
          }> = {}
          const worklogIds: number[] = []
          const rangeStart = new Date(`${week}T00:00:00.000Z`)
          const rangeEnd = new Date(`${weekEndKey}T23:59:59.999Z`)

          for (const issue of issues) {
            issueKeyMap[issue.id] = issue.key
            issueDetailsMap[issue.id] = {
              id: issue.id,
              key: issue.key,
              summary: issue.fields.summary,
              parent: issue.fields.parent
                ? {
                  id: issue.fields.parent.id,
                  key: issue.fields.parent.key,
                  summary: issue.fields.parent.fields?.summary,
                }
                : undefined,
              labels: issue.fields.labels,
              customfield_12345: issue.fields.customfield_12345,
              issuetype: issue.fields.issuetype,
            }

            let worklogs = issue.fields.worklog.worklogs

            // The embedded list is capped at 20 — page beyond it if needed
            if (issue.fields.worklog.total > worklogs.length) {
              worklogs = []
              let issueWorklogStartAt = 0
              let issueWorklogTotal = issue.fields.worklog.total

              while (issueWorklogStartAt < issueWorklogTotal) {
                const wRes = await fetch(
                  `${baseUrl}/rest/api/3/issue/${issue.key}/worklog?startAt=${issueWorklogStartAt}&maxResults=${JIRA_WORKLOG_PAGE_SIZE}`,
                  { headers: { 'Authorization': authHeader, 'Accept': 'application/json' } },
                )

                if (!wRes.ok) {
                  break
                }

                const wPage = await wRes.json() as {
                  worklogs?: Array<{ id: string; started: string }>
                  startAt?: number
                  maxResults?: number
                  total?: number
                }

                const pageWorklogs = wPage.worklogs ?? []
                const pageStartAt = wPage.startAt ?? issueWorklogStartAt
                const pageSize = wPage.maxResults ?? JIRA_WORKLOG_PAGE_SIZE
                issueWorklogTotal = wPage.total ?? issueWorklogTotal

                worklogs.push(...pageWorklogs)
                issueWorklogStartAt = pageStartAt + pageSize

                if (pageWorklogs.length === 0) {
                  break
                }
              }
            }

            for (const wl of worklogs) {
              const started = new Date(wl.started)
              if (started >= rangeStart && started <= rangeEnd) {
                worklogIds.push(Number(wl.id))
              }
            }
          }

          console.log(`[jira-local-cache] Step 2 — ${worklogIds.length} worklog ID(s) in range`)

          if (worklogIds.length === 0) { sendEmpty(); return }

          // ── Step 3: Reuse cached worklog details and bulk-load only missing ones ──
          fs.mkdirSync(worklogCacheDir, { recursive: true })

          const uniqueWorklogIds = Array.from(new Set(worklogIds))
          const worklogById = new Map<string, unknown>()
          const missingWorklogIds: number[] = []

          for (const worklogId of uniqueWorklogIds) {
            const worklogCacheFile = path.join(worklogCacheDir, `${worklogId}.json`)
            if (fs.existsSync(worklogCacheFile)) {
              const cachedWorklog = JSON.parse(fs.readFileSync(worklogCacheFile, 'utf-8')) as unknown
              worklogById.set(String(worklogId), cachedWorklog)
            } else {
              missingWorklogIds.push(worklogId)
            }
          }

          if (missingWorklogIds.length > 0) {
            const listRes = await fetch(`${baseUrl}/rest/api/3/worklog/list`, {
              method: 'POST',
              headers: jsonHeaders,
              body: JSON.stringify({ ids: missingWorklogIds }),
            })

            if (!listRes.ok) {
              res.statusCode = listRes.status
              res.end(JSON.stringify({ error: `Worklog list fetch failed: ${listRes.status} ${listRes.statusText}` }))
              return
            }

            const fetchedWorklogs = await listRes.json() as Array<{ id: string }>
            for (const worklog of fetchedWorklogs) {
              worklogById.set(worklog.id, worklog)
              fs.writeFileSync(path.join(worklogCacheDir, `${worklog.id}.json`), JSON.stringify(worklog, null, 2))
            }
          }

          const worklogs = uniqueWorklogIds
            .map(worklogId => worklogById.get(String(worklogId)))
            .filter((worklog): worklog is unknown => worklog !== undefined)

          console.log('[jira-local-cache] Step 3 — worklog detail cache', {
            cached: uniqueWorklogIds.length - missingWorklogIds.length,
            fetched: missingWorklogIds.length,
            total: worklogs.length,
          })

          // ── Step 4: Write cache ──────────────────────────────────────────
          const cacheData = { worklogs, issueKeyMap, issueDetailsMap }
          fs.mkdirSync(cacheDir, { recursive: true })
          fs.writeFileSync(cacheFile, JSON.stringify(cacheData, null, 2))

          res.setHeader('Content-Type', 'application/json')
          res.setHeader('X-Cache', 'MISS')
          res.end(JSON.stringify(cacheData))
        } catch (err) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: String(err) }))
        }
      })
    },
  }
}

function serializeCalendarEvent(event: CalendarEvent) {
  return {
    uid: event.uid,
    calendarId: event.calendarId,
    title: event.title ?? null,
    start: event.start.toISOString(),
    end: event.end.toISOString(),
    allDay: event.allDay,
    busyStatus: event.busyStatus,
  }
}

// Given a date-only `weekEnd` (e.g. the Sunday of a week), returns the local
// midnight that starts the following day — an exclusive upper bound that
// includes all of weekEnd's 24 hours regardless of a DST change that day.
function dayAfter(date: Date): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + 1)
  next.setHours(0, 0, 0, 0)
  return next
}

/**
 * Local calendar-import middleware: merges one or more published Outlook ICS
 * feeds (configured via ICS_CALENDAR_<NAME> env vars) into worklog-block
 * candidates for a requested week. See server/calendar/ for the actual
 * fetching/parsing/caching logic — this just exposes it over HTTP, the same
 * way the Jira middleware above does.
 */
function calendarImportPlugin(env: Record<string, string>): Plugin {
  const configs = loadCalendarConfigs(env)
  const merged = new MergedCalendarSource(configs.map(config => new IcsCalendarSource(config)))

  return {
    name: 'calendar-import',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        // ── GET /_local/calendar-sources ────────────────────────────────────
        if (req.method === 'GET' && req.url?.startsWith('/_local/calendar-sources')) {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ calendars: merged.calendars }))
          return
        }

        // ── GET /_local/calendar-events?week=YYYY-MM-DD&weekEnd=YYYY-MM-DD ──
        if (req.method === 'GET' && req.url?.startsWith('/_local/calendar-events')) {
          if (merged.calendars.length === 0) {
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ events: [], failed: [] }))
            return
          }

          const url = new URL(req.url, 'http://localhost')
          const requestedWeek = url.searchParams.get('week')
          const requestedWeekEnd = url.searchParams.get('weekEnd')

          if (!requestedWeek || !requestedWeekEnd) {
            res.statusCode = 400
            res.end(JSON.stringify({ error: 'Missing ?week and ?weekEnd params' }))
            return
          }

          const parsedWeek = parseDateParam(requestedWeek)
          const parsedWeekEnd = parseDateParam(requestedWeekEnd)
          if (!parsedWeek || !parsedWeekEnd) {
            res.statusCode = 400
            res.end(JSON.stringify({ error: 'Invalid ?week/?weekEnd param, expected YYYY-MM-DD' }))
            return
          }

          try {
            console.log('[calendar-import] Fetching merged events', { week: requestedWeek, weekEnd: requestedWeekEnd })
            const result = await merged.getEvents(parsedWeek, dayAfter(parsedWeekEnd))
            if (result.failed.length > 0) {
              // Calendar labels only — never anything derived from the feed URL.
              console.warn('[calendar-import] Some calendars failed to refresh', result.failed.map(f => f.label))
            }
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({
              events: result.events.map(serializeCalendarEvent),
              failed: result.failed,
            }))
          } catch (err) {
            console.error('[calendar-import] Fetch failed', err instanceof Error ? err.message : err)
            res.statusCode = 502
            res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Calendar fetch failed' }))
          }
          return
        }

        next()
      })
    },
  }
}

const readBody = (r: IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    r.on('data', (chunk: Buffer) => chunks.push(chunk))
    r.on('end', () => resolve(Buffer.concat(chunks).toString()))
    r.on('error', reject)
  })

function parseMatchBody(body: string): { titles: string[]; candidates: TicketCandidate[] } | null {
  try {
    const parsed = JSON.parse(body) as { titles?: unknown; candidates?: unknown }
    if (!Array.isArray(parsed.titles) || !parsed.titles.every(t => typeof t === 'string')) return null
    if (!Array.isArray(parsed.candidates)) return null
    const candidates = parsed.candidates.filter(
      (c): c is TicketCandidate => typeof c?.key === 'string' && typeof c?.summary === 'string',
    )
    return { titles: parsed.titles as string[], candidates }
  } catch {
    return null
  }
}

/**
 * Ticket matching for calendar import: remembered mappings and a local
 * similarity model always run; the Claude endpoint only exists when
 * ANTHROPIC_API_KEY is set. Learned mappings live in the user's home folder
 * (see server/matching/learnedMappings.ts), never in the repo.
 */
function calendarMatchPlugin(env: Record<string, string>): Plugin {
  const configDir = resolveConfigDir(env)
  const store = new LearnedMappingStore(configDir)
  const localScorer = createLocalScorer(configDir, env.JIRAVOLTA_SIMILARITY_MODEL || undefined)
  const apiKey = env.ANTHROPIC_API_KEY || ''
  const claudeModel = env.CLAUDE_MATCH_MODEL || DEFAULT_CLAUDE_MATCH_MODEL
  const claude = apiKey ? createClaudeClient(apiKey) : null

  const sendJson = (res: ServerResponse, status: number, body: unknown) => {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(body))
  }

  return {
    name: 'calendar-match',
    configureServer(server: ViteDevServer) {
      // Warm the model in the background so the first match isn't slow.
      void localScorer.get()

      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const url = req.url ?? ''

        // ── GET /_local/calendar-match-config ───────────────────────────────
        if (req.method === 'GET' && url.startsWith('/_local/calendar-match-config')) {
          sendJson(res, 200, { claudeAvailable: !!claude, claudeModel: claude ? claudeModel : null, similarity: localScorer.status() })
          return
        }

        // ── POST /_local/calendar-match ─────────────────────────────────────
        if (req.method === 'POST' && url.startsWith('/_local/calendar-match-claude')) {
          if (!claude) {
            sendJson(res, 404, { error: 'ANTHROPIC_API_KEY is not configured' })
            return
          }
          const input = parseMatchBody(await readBody(req))
          if (!input) {
            sendJson(res, 400, { error: 'Expected { titles: string[], candidates: {key, summary}[] }' })
            return
          }
          try {
            console.log('[calendar-match] Asking Claude', { titles: input.titles.length, candidates: input.candidates.length })
            sendJson(res, 200, { proposals: await askClaude(claude, claudeModel, input.titles, input.candidates) })
          } catch (err) {
            // The SDK's message never includes the API key, but only forward the message regardless.
            console.error('[calendar-match] Claude request failed', err instanceof Error ? err.message : err)
            sendJson(res, 502, { error: err instanceof Error ? err.message : 'Claude request failed' })
          }
          return
        }

        if (req.method === 'POST' && url.startsWith('/_local/calendar-match')) {
          const input = parseMatchBody(await readBody(req))
          if (!input) {
            sendJson(res, 400, { error: 'Expected { titles: string[], candidates: {key, summary}[] }' })
            return
          }
          try {
            const proposals = await matchTitles({
              titles: input.titles,
              candidates: input.candidates,
              learned: store.list(),
              scorer: await localScorer.get(),
            })
            sendJson(res, 200, { proposals })
          } catch (err) {
            console.error('[calendar-match] Matching failed', err instanceof Error ? err.message : err)
            sendJson(res, 500, { error: err instanceof Error ? err.message : 'Matching failed' })
          }
          return
        }

        // ── GET|PUT|DELETE /_local/learned-mappings ─────────────────────────
        if (url.startsWith('/_local/learned-mappings')) {
          if (req.method === 'GET') {
            sendJson(res, 200, { mappings: store.list() })
            return
          }
          if (req.method === 'PUT') {
            try {
              const parsed = JSON.parse(await readBody(req)) as { pairs?: Array<{ title?: unknown; issueKey?: unknown }> }
              const pairs = (parsed.pairs ?? []).filter(
                (p): p is { title: string; issueKey: string } => typeof p.title === 'string' && typeof p.issueKey === 'string',
              )
              sendJson(res, 200, { mappings: store.record(pairs) })
            } catch {
              sendJson(res, 400, { error: 'Expected { pairs: {title, issueKey}[] }' })
            }
            return
          }
          if (req.method === 'DELETE') {
            const id = new URL(url, 'http://localhost').searchParams.get('id')
            if (!id) {
              sendJson(res, 400, { error: 'Missing ?id param' })
              return
            }
            store.remove(id)
            res.statusCode = 204
            res.end()
            return
          }
        }

        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react(), jiraLocalCachePlugin(env), calendarImportPlugin(env), calendarMatchPlugin(env)],
  }
})
