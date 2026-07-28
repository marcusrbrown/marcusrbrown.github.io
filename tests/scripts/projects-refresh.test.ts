import type {Project, ProjectsSnapshot} from '../../src/types'
import type {GitHubRepo} from '../../src/utils/projects'
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {
  buildProjectsSnapshot,
  fetchRepoListing,
  GENERATOR,
  isProjectsRepo,
  readPreviousSnapshot,
  refreshProjectsSnapshot,
} from '../../scripts/projects-refresh'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const emptySnapshot: ProjectsSnapshot = {projects: [], generatedAt: '2020-01-01T00:00:00.000Z', generator: GENERATOR}

/**
 * Builds a FULL GitHubRepo object — the real API shape with all fields
 * required by the `isProjectsRepo` validator. Tests MUST use this helper
 * so they exercise the same shape the production validator checks.
 */
const makeRepo = (overrides: Partial<GitHubRepo> & {id: number; name: string; full_name: string}): GitHubRepo => ({
  description: 'A portfolio project',
  html_url: `https://github.com/${overrides.full_name}`,
  language: 'TypeScript',
  stargazers_count: 0,
  fork: false,
  archived: false,
  homepage: null,
  topics: ['portfolio'],
  updated_at: '2026-01-01T00:00:00.000Z',
  created_at: '2025-01-01T00:00:00.000Z',
  ...overrides,
})

const jsonResponse = (body: unknown, init: Partial<{status: number; headers: Record<string, string>}> = {}) =>
  ({
    ok: (init.status ?? 200) < 400,
    status: init.status ?? 200,
    statusText: init.status && init.status >= 400 ? 'Error' : 'OK',
    headers: new Headers(init.headers ?? {}),
    json: async () => body,
  }) as unknown as Response

// ---------------------------------------------------------------------------
// Unit: isProjectsRepo (runtime validator)
// ---------------------------------------------------------------------------

describe('projects-refresh script', () => {
  describe('isProjectsRepo', () => {
    it('accepts a full valid repo object', () => {
      expect(isProjectsRepo(makeRepo({id: 1, name: 'my-repo', full_name: 'user/my-repo'}))).toBe(true)
    })

    it('rejects a non-object', () => {
      expect(isProjectsRepo(null)).toBe(false)
      expect(isProjectsRepo('string')).toBe(false)
      expect(isProjectsRepo(42)).toBe(false)
    })

    it('rejects when required numeric fields are missing', () => {
      const {id: _id, ...withoutId} = makeRepo({id: 1, name: 'r', full_name: 'u/r'})
      expect(isProjectsRepo(withoutId)).toBe(false)
    })

    it('rejects when required string fields are missing', () => {
      const {html_url: _url, ...withoutUrl} = makeRepo({id: 1, name: 'r', full_name: 'u/r'})
      expect(isProjectsRepo(withoutUrl)).toBe(false)
    })

    it('accepts null for nullable fields (description, language, homepage)', () => {
      expect(
        isProjectsRepo(
          makeRepo({id: 1, name: 'r', full_name: 'u/r', description: null, language: null, homepage: null}),
        ),
      ).toBe(true)
    })

    it('accepts undefined topics (treated as empty)', () => {
      const repo = makeRepo({id: 1, name: 'r', full_name: 'u/r'})
      const {topics: _topics, ...withoutTopics} = repo
      expect(isProjectsRepo(withoutTopics)).toBe(true)
    })

    it('rejects non-string topics entries', () => {
      expect(isProjectsRepo({...makeRepo({id: 1, name: 'r', full_name: 'u/r'}), topics: [42]})).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // Unit: readPreviousSnapshot
  // ---------------------------------------------------------------------------

  describe('readPreviousSnapshot', () => {
    let tmpDir: string
    let snapshotPath: string

    beforeEach(() => {
      tmpDir = mkdtempSync(join(tmpdir(), 'projects-refresh-test-'))
      snapshotPath = join(tmpDir, 'projects-snapshot.json')
    })

    afterEach(() => {
      rmSync(tmpDir, {recursive: true, force: true})
    })

    it('returns a safe empty snapshot when the file does not exist (ENOENT)', () => {
      const result = readPreviousSnapshot(snapshotPath)
      expect(result.projects).toEqual([])
      expect(result.generator).toBe(GENERATOR)
    })

    it('reads and returns a valid existing snapshot', () => {
      writeFileSync(snapshotPath, `${JSON.stringify(emptySnapshot, null, 2)}\n`)
      const result = readPreviousSnapshot(snapshotPath)
      expect(result).toEqual(emptySnapshot)
    })

    it('hard-fails on malformed JSON (corrupt file, not ENOENT)', () => {
      writeFileSync(snapshotPath, 'not-valid-json')
      expect(() => readPreviousSnapshot(snapshotPath)).toThrow('Unable to read previous projects snapshot')
    })

    it('hard-fails when the snapshot has the wrong shape', () => {
      writeFileSync(snapshotPath, JSON.stringify({unexpected: true}))
      expect(() => readPreviousSnapshot(snapshotPath)).toThrow('Unable to read previous projects snapshot')
    })
  })

  // ---------------------------------------------------------------------------
  // Unit: buildProjectsSnapshot
  // ---------------------------------------------------------------------------

  describe('buildProjectsSnapshot', () => {
    /**
     * Happy path: a realistic listing with 3 portfolio repos plus noise
     * (fork, archived, no-topic, site-repo) → snapshot has exactly the 3,
     * sorted by stars desc, NON-EMPTY, each a valid Project.
     *
     * This test uses the REAL repo shape to guard against the empty-snapshot
     * masking bug documented in gist-list-api-omits-content-snapshot-empty.
     */
    it('produces exactly 3 projects from a mixed listing and snapshot is NON-EMPTY', () => {
      const repos: GitHubRepo[] = [
        makeRepo({
          id: 1,
          name: 'alpha-project',
          full_name: 'user/alpha-project',
          stargazers_count: 10,
          topics: ['portfolio'],
        }),
        makeRepo({
          id: 2,
          name: 'beta-project',
          full_name: 'user/beta-project',
          stargazers_count: 50,
          topics: ['portfolio'],
        }),
        makeRepo({
          id: 3,
          name: 'gamma-project',
          full_name: 'user/gamma-project',
          stargazers_count: 5,
          topics: ['portfolio'],
        }),
        // noise — fork
        makeRepo({id: 4, name: 'forked-repo', full_name: 'user/forked-repo', fork: true, topics: ['portfolio']}),
        // noise — archived
        makeRepo({id: 5, name: 'old-repo', full_name: 'user/old-repo', archived: true, topics: ['portfolio']}),
        // noise — no portfolio topic
        makeRepo({id: 6, name: 'side-project', full_name: 'user/side-project', topics: []}),
        // noise — site repo self-excluded
        makeRepo({
          id: 7,
          name: 'marcusrbrown.github.io',
          full_name: 'marcusrbrown/marcusrbrown.github.io',
          topics: ['portfolio'],
        }),
      ]

      const result = buildProjectsSnapshot(repos, emptySnapshot)

      expect(result.fatalError).toBeNull()
      expect(result.snapshot.projects).toHaveLength(3)
      expect(result.snapshot.projects.length).toBeGreaterThan(0) // NON-EMPTY assertion

      // sorted by stars desc: beta (50) > alpha (10) > gamma (5)
      expect(result.snapshot.projects[0]?.stars).toBe(50)
      expect(result.snapshot.projects[1]?.stars).toBe(10)
      expect(result.snapshot.projects[2]?.stars).toBe(5)

      // each is a valid Project
      for (const project of result.snapshot.projects) {
        const p = project as Project
        expect(typeof p.id).toBe('string')
        expect(typeof p.title).toBe('string')
        expect(typeof p.description).toBe('string')
        expect(typeof p.url).toBe('string')
        expect(typeof p.stars).toBe('number')
      }
    })

    it('produces an empty projects array when no repos pass the portfolio filter (valid, exit 0 scenario)', () => {
      const repos: GitHubRepo[] = [makeRepo({id: 1, name: 'private-fork', full_name: 'user/private-fork', fork: true})]
      const result = buildProjectsSnapshot(repos, emptySnapshot)
      expect(result.fatalError).toBeNull()
      expect(result.snapshot.projects).toEqual([])
    })

    it('does NOT bump generatedAt on a byte-identical rebuild', () => {
      const repos: GitHubRepo[] = [
        makeRepo({
          id: 1,
          name: 'stable-project',
          full_name: 'user/stable-project',
          stargazers_count: 10,
          topics: ['portfolio'],
        }),
      ]

      const first = buildProjectsSnapshot(repos, emptySnapshot)
      expect(first.fatalError).toBeNull()

      // Second run against the snapshot produced by the first
      const second = buildProjectsSnapshot(repos, first.snapshot)
      expect(second.fatalError).toBeNull()
      expect(second.snapshot.generatedAt).toBe(first.snapshot.generatedAt)
      expect(JSON.stringify(second.snapshot)).toBe(JSON.stringify(first.snapshot))
    })

    it('updates generatedAt when the project set changes', async () => {
      const repos1: GitHubRepo[] = [
        makeRepo({id: 1, name: 'project-a', full_name: 'user/project-a', topics: ['portfolio']}),
      ]
      const repos2: GitHubRepo[] = [
        makeRepo({id: 1, name: 'project-a', full_name: 'user/project-a', topics: ['portfolio']}),
        makeRepo({id: 2, name: 'project-b', full_name: 'user/project-b', topics: ['portfolio']}),
      ]

      const first = buildProjectsSnapshot(repos1, emptySnapshot)
      await new Promise(resolve => setTimeout(resolve, 5))
      const second = buildProjectsSnapshot(repos2, first.snapshot)

      expect(second.snapshot.projects).toHaveLength(2)
      expect(second.snapshot.generatedAt).not.toBe(first.snapshot.generatedAt)
    })

    it('sets the generator field correctly', () => {
      const result = buildProjectsSnapshot([], emptySnapshot)
      expect(result.snapshot.generator).toBe(GENERATOR)
    })
  })

  // ---------------------------------------------------------------------------
  // Unit: fetchRepoListing (pagination + origin guard)
  // ---------------------------------------------------------------------------

  describe('fetchRepoListing', () => {
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('fetches a single page and returns its repos', async () => {
      const repos = [makeRepo({id: 1, name: 'r', full_name: 'u/r'})]
      const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(repos))

      const result = await fetchRepoListing('user', {accept: 'application/vnd.github+json'}, fetchMock)
      expect(result).toHaveLength(1)
      expect(result[0]?.id).toBe(1)
    })

    it('follows a same-origin api.github.com next link (pagination — repo on page 2 IS included)', async () => {
      const page1 = [makeRepo({id: 1, name: 'r1', full_name: 'u/r1'})]
      const page2 = [makeRepo({id: 2, name: 'r2', full_name: 'u/r2'})]
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(page1, {headers: {link: '<https://api.github.com/users/u/repos?page=2>; rel="next"'}}),
        )
        .mockResolvedValueOnce(jsonResponse(page2))

      const result = await fetchRepoListing('u', {}, fetchMock)
      expect(result).toHaveLength(2)
      expect(result.map(r => r.id)).toEqual([1, 2])
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('stops pagination at an off-origin next link (token never forwarded off-origin)', async () => {
      const repos = [makeRepo({id: 1, name: 'r', full_name: 'u/r'})]
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(repos, {headers: {link: '<https://evil.example.com/steal>; rel="next"'}}))

      const result = await fetchRepoListing('u', {accept: 'application/vnd.github+json'}, fetchMock)
      expect(result).toHaveLength(1)
      // stopped after page 1 — off-origin link ignored
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock.mock.calls[0]?.[0]).toContain('api.github.com')
    })

    it('throws on a non-ok HTTP response', async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({}, {status: 500}))
      await expect(fetchRepoListing('u', {}, fetchMock)).rejects.toThrow('GitHub request failed')
    })

    it('throws on a timeout', async () => {
      const fetchMock = vi.fn().mockRejectedValueOnce(new DOMException('timeout', 'TimeoutError'))
      await expect(fetchRepoListing('u', {}, fetchMock)).rejects.toThrow('GitHub request timed out')
    })

    it('throws when the response body does not match the repos shape', async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse([{broken: true}]))
      await expect(fetchRepoListing('u', {}, fetchMock)).rejects.toThrow('Unexpected repo list response shape')
    })
  })

  // ---------------------------------------------------------------------------
  // Integration: refreshProjectsSnapshot
  // ---------------------------------------------------------------------------

  describe('refreshProjectsSnapshot (integration)', () => {
    let tmpDir: string
    let snapshotPath: string

    beforeEach(() => {
      tmpDir = mkdtempSync(join(tmpdir(), 'projects-refresh-integration-'))
      snapshotPath = join(tmpDir, 'projects-snapshot.json')
      writeFileSync(snapshotPath, `${JSON.stringify(emptySnapshot, null, 2)}\n`)
    })

    afterEach(() => {
      rmSync(tmpDir, {recursive: true, force: true})
      vi.unstubAllGlobals()
      process.exitCode = 0
    })

    it('happy path: 3 portfolio repos in listing → snapshot NON-EMPTY, exit 0, sorted by stars', async () => {
      const listing = [
        makeRepo({
          id: 10,
          name: 'project-alpha',
          full_name: 'marcusrbrown/project-alpha',
          stargazers_count: 100,
          topics: ['portfolio'],
        }),
        makeRepo({
          id: 20,
          name: 'project-beta',
          full_name: 'marcusrbrown/project-beta',
          stargazers_count: 5,
          topics: ['portfolio'],
        }),
        makeRepo({
          id: 30,
          name: 'project-gamma',
          full_name: 'marcusrbrown/project-gamma',
          stargazers_count: 42,
          topics: ['portfolio'],
        }),
        // noise
        makeRepo({id: 40, name: 'a-fork', full_name: 'marcusrbrown/a-fork', fork: true, topics: ['portfolio']}),
        makeRepo({
          id: 50,
          name: 'old-archived',
          full_name: 'marcusrbrown/old-archived',
          archived: true,
          topics: ['portfolio'],
        }),
        makeRepo({id: 60, name: 'no-topic', full_name: 'marcusrbrown/no-topic', topics: []}),
        makeRepo({
          id: 70,
          name: 'marcusrbrown.github.io',
          full_name: 'marcusrbrown/marcusrbrown.github.io',
          topics: ['portfolio'],
        }),
      ]

      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse(listing)))

      await refreshProjectsSnapshot({snapshotPath, username: 'marcusrbrown', token: 'test-token'})

      expect(process.exitCode).toBe(0)
      const written = JSON.parse(readFileSync(snapshotPath, 'utf8')) as ProjectsSnapshot
      expect(written.projects).toHaveLength(3)
      expect(written.projects.length).toBeGreaterThan(0) // NON-EMPTY
      expect(written.projects[0]?.stars).toBe(100) // stars desc
      expect(written.projects[1]?.stars).toBe(42)
      expect(written.projects[2]?.stars).toBe(5)
      expect(written.generator).toBe(GENERATOR)
    })

    it('error path: listing fetch returns HTTP 500 → previous snapshot preserved, exit non-zero', async () => {
      const before = readFileSync(snapshotPath, 'utf8')
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse({}, {status: 500})))

      await refreshProjectsSnapshot({snapshotPath, username: 'marcusrbrown', token: undefined})

      expect(process.exitCode).toBe(1)
      expect(readFileSync(snapshotPath, 'utf8')).toBe(before)
    })

    it('error path: network rejection (timeout) → previous snapshot preserved, exit non-zero', async () => {
      const before = readFileSync(snapshotPath, 'utf8')
      vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new DOMException('timeout', 'TimeoutError')))

      await refreshProjectsSnapshot({snapshotPath, username: 'marcusrbrown', token: undefined})

      expect(process.exitCode).toBe(1)
      expect(readFileSync(snapshotPath, 'utf8')).toBe(before)
    })

    it('edge: zero portfolio repos in listing → snapshot with empty projects[] written, exit 0 (not an error)', async () => {
      const listing = [makeRepo({id: 1, name: 'private-fork', full_name: 'user/private-fork', fork: true})]
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse(listing)))

      await refreshProjectsSnapshot({snapshotPath, username: 'user', token: undefined})

      expect(process.exitCode).toBe(0)
      const written = JSON.parse(readFileSync(snapshotPath, 'utf8')) as ProjectsSnapshot
      expect(written.projects).toEqual([])
      expect(written.generator).toBe(GENERATOR)
    })

    it('edge: byte-identical rebuild → generatedAt unchanged vs previous', async () => {
      const listing = [
        makeRepo({
          id: 1,
          name: 'stable-proj',
          full_name: 'user/stable-proj',
          stargazers_count: 7,
          topics: ['portfolio'],
        }),
      ]

      // First run
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse(listing)))
      await refreshProjectsSnapshot({snapshotPath, username: 'user', token: undefined})
      expect(process.exitCode).toBe(0)
      const afterFirst = JSON.parse(readFileSync(snapshotPath, 'utf8')) as ProjectsSnapshot
      const firstGeneratedAt = afterFirst.generatedAt

      // Second run — same listing, same token
      vi.unstubAllGlobals()
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse(listing)))
      await new Promise(resolve => setTimeout(resolve, 5))
      await refreshProjectsSnapshot({snapshotPath, username: 'user', token: undefined})
      expect(process.exitCode).toBe(0)
      const afterSecond = JSON.parse(readFileSync(snapshotPath, 'utf8')) as ProjectsSnapshot
      expect(afterSecond.generatedAt).toBe(firstGeneratedAt)
    })

    it('integration: authorization header sent to api.github.com, not elsewhere', async () => {
      const listing = [makeRepo({id: 1, name: 'proj', full_name: 'user/proj', topics: ['portfolio']})]
      const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(listing))
      vi.stubGlobal('fetch', fetchMock)

      await refreshProjectsSnapshot({snapshotPath, username: 'user', token: 'secret-token'})

      expect(process.exitCode).toBe(0)
      const listingCall = fetchMock.mock.calls.find((call: unknown[]) => (call[0] as string).includes('api.github.com'))
      expect(listingCall).toBeDefined()
      const headers = listingCall?.[1]?.headers as Record<string, string>
      expect(headers.authorization).toBe('Bearer secret-token')
      // Only one fetch call — no off-origin calls
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('edge: pagination — portfolio repo on page 2 IS included in final snapshot', async () => {
      const page1 = [
        makeRepo({
          id: 1,
          name: 'page1-repo',
          full_name: 'user/page1-repo',
          stargazers_count: 10,
          topics: ['portfolio'],
        }),
      ]
      const page2 = [
        makeRepo({
          id: 2,
          name: 'page2-repo',
          full_name: 'user/page2-repo',
          stargazers_count: 20,
          topics: ['portfolio'],
        }),
      ]
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(page1, {headers: {link: '<https://api.github.com/users/user/repos?page=2>; rel="next"'}}),
        )
        .mockResolvedValueOnce(jsonResponse(page2))
      vi.stubGlobal('fetch', fetchMock)

      await refreshProjectsSnapshot({snapshotPath, username: 'user', token: undefined})

      expect(process.exitCode).toBe(0)
      const written = JSON.parse(readFileSync(snapshotPath, 'utf8')) as ProjectsSnapshot
      expect(written.projects).toHaveLength(2)
      // both repos included, sorted by stars: page2 (20) > page1 (10)
      expect(written.projects[0]?.stars).toBe(20)
      expect(written.projects[1]?.stars).toBe(10)
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('edge: off-origin next link stops pagination — token not forwarded', async () => {
      const listing = [makeRepo({id: 1, name: 'r', full_name: 'user/r', topics: ['portfolio']})]
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(listing, {headers: {link: '<https://evil.example.com/steal?token=1>; rel="next"'}}),
        )
      vi.stubGlobal('fetch', fetchMock)

      await refreshProjectsSnapshot({snapshotPath, username: 'user', token: 'secret-token'})

      expect(process.exitCode).toBe(0)
      // Only 1 fetch — off-origin link was ignored
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock.mock.calls.some((call: unknown[]) => (call[0] as string).includes('evil.example.com'))).toBe(
        false,
      )
    })

    it('edge: corrupt existing snapshot file → hard-fail, exit non-zero, no overwrite', async () => {
      writeFileSync(snapshotPath, 'NOT VALID JSON AT ALL')
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)

      await refreshProjectsSnapshot({snapshotPath, username: 'user', token: undefined})

      expect(process.exitCode).toBe(1)
      // Snapshot file content should be unchanged (corrupt)
      expect(readFileSync(snapshotPath, 'utf8')).toBe('NOT VALID JSON AT ALL')
      // Fetch should never have been called (abort before any I/O)
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })
})
