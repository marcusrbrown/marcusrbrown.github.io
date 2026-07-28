#!/usr/bin/env tsx

/**
 * Projects snapshot refresh script.
 *
 * Fetches the GitHub repos listing for the portfolio user (authenticated,
 * paginated), transforms to `Project[]` via the shared util in
 * `src/utils/projects.ts`, and writes `src/data/projects-snapshot.json`.
 *
 * Fails safe:
 * - Reads the previous snapshot before any network I/O.
 * - On any fetch / validation failure, preserves the previous snapshot
 *   untouched and sets a non-zero `process.exitCode`.
 * - Writes via temp + rename (atomic), cleaning up the temp on failure.
 * - Does NOT bump `generatedAt` when the new `projects` array is
 *   byte-identical to the previous one (stable-rebuild / no CI churn).
 *
 * Dual CLI/library shape: exports the builder functions for tests AND
 * runs when invoked directly via the `import.meta.url` guard.
 */

import type {ProjectsSnapshot} from '../src/types'
import {existsSync, readFileSync, renameSync, unlinkSync, writeFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import process from 'node:process'
import {transformReposToProjects, type GitHubRepo} from '../src/utils/projects'

export const GENERATOR = 'projects-refresh'
const DEFAULT_SNAPSHOT_PATH = 'src/data/projects-snapshot.json'
const DEFAULT_USERNAME = 'marcusrbrown'
const GITHUB_API_ORIGIN = 'https://api.github.com'

// --- Runtime type guards ---

const isString = (value: unknown): value is string => typeof value === 'string'
const isNumber = (value: unknown): value is number => typeof value === 'number'
const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean'
const isNullableString = (value: unknown): value is string | null => value === null || typeof value === 'string'

/**
 * Validates that an unknown value matches the full `GitHubRepo` shape.
 * Rejects any listing item that is missing or mis-typed — never casts blindly.
 */
export const isProjectsRepo = (value: unknown): value is GitHubRepo => {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    isNumber(v.id) &&
    isString(v.name) &&
    isString(v.full_name) &&
    isNullableString(v.description) &&
    isString(v.html_url) &&
    isNullableString(v.language) &&
    isNumber(v.stargazers_count) &&
    isBoolean(v.fork) &&
    isBoolean(v.archived) &&
    isNullableString(v.homepage) &&
    isString(v.updated_at) &&
    isString(v.created_at) &&
    (v.topics === undefined || (Array.isArray(v.topics) && v.topics.every(isString)))
  )
}

const isProjectsRepoArray = (value: unknown): value is GitHubRepo[] =>
  Array.isArray(value) && value.every(isProjectsRepo)

/**
 * Extracts the `rel="next"` URL from a `Link` header, restricted to the
 * `https://api.github.com` origin. This is a defense-in-depth guard:
 * pagination must never follow a URL off-origin, since the caller re-fetches
 * it with the authenticated (token-bearing) headers. A missing, malformed, or
 * off-origin next URL simply stops pagination rather than throwing.
 */
const nextLink = (response: Response): string | null => {
  const link = response.headers?.get('link')
  const match = link?.match(/<([^>]+)>;\s*rel="next"/)
  const candidate = match?.[1]
  if (!candidate) return null
  try {
    return new URL(candidate).origin === GITHUB_API_ORIGIN ? candidate : null
  } catch {
    return null
  }
}

/** Fetches every page of `GET /users/:username/repos`, following `Link: rel="next"`. */
export const fetchRepoListing = async (
  username: string,
  headers: Record<string, string>,
  fetchImpl: typeof fetch = fetch,
): Promise<GitHubRepo[]> => {
  const repos: GitHubRepo[] = []
  let url: string | null = `${GITHUB_API_ORIGIN}/users/${username}/repos?sort=updated&per_page=100`
  while (url) {
    let response: Response
    try {
      response = await fetchImpl(url, {headers, signal: AbortSignal.timeout(30_000)})
    } catch (error) {
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        throw new Error(`GitHub request timed out: ${url}`)
      }
      throw error
    }
    if (!response.ok) throw new Error(`GitHub request failed (${response.status} ${response.statusText}): ${url}`)
    const data: unknown = await response.json()
    if (!isProjectsRepoArray(data)) throw new Error(`Unexpected repo list response shape: ${url}`)
    repos.push(...data)
    url = nextLink(response)
  }
  return repos
}

// --- Snapshot read / write helpers (mirroring blog-refresh.ts) ---

const stableStringify = (snapshot: ProjectsSnapshot): string => `${JSON.stringify(snapshot, null, 2)}\n`

/**
 * Reads and validates the previous snapshot file.
 *
 * - ENOENT → returns a safe empty snapshot (caller can proceed normally).
 * - Parse / shape failure → HARD-FAIL (throws): a corrupt file must never
 *   silently become an empty snapshot and overwrite the only good data.
 */
export const readPreviousSnapshot = (snapshotPath: string): ProjectsSnapshot => {
  try {
    const raw = readFileSync(snapshotPath, 'utf8')
    const parsed: unknown = JSON.parse(raw)
    const snapshot = parsed as {projects?: unknown; generatedAt?: unknown; generator?: unknown}
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !Array.isArray(snapshot.projects) ||
      typeof snapshot.generatedAt !== 'string' ||
      typeof snapshot.generator !== 'string' ||
      !snapshot.projects.every(
        project =>
          typeof project === 'object' &&
          project !== null &&
          'id' in project &&
          typeof (project as Record<string, unknown>).id === 'string' &&
          'title' in project &&
          typeof (project as Record<string, unknown>).title === 'string',
      )
    ) {
      throw new Error('snapshot has the wrong shape')
    }
    return parsed as ProjectsSnapshot
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return {projects: [], generatedAt: new Date().toISOString(), generator: GENERATOR}
    }
    throw new Error(
      `Unable to read previous projects snapshot: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

/**
 * Writes `content` to `path` atomically (temp file → rename), cleaning up
 * the temp file on any failure so no partial write lingers.
 */
const atomicWrite = (path: string, content: string): void => {
  const temporaryPath = join(dirname(path), `.${path.split('/').pop() ?? 'snapshot'}.${process.pid}.tmp`)
  try {
    writeFileSync(temporaryPath, content, 'utf8')
    renameSync(temporaryPath, path)
  } catch (error) {
    try {
      if (existsSync(temporaryPath)) unlinkSync(temporaryPath)
    } catch {
      /* preserve original error */
    }
    throw error
  }
}

// --- Build ---

export interface BuildSnapshotResult {
  snapshot: ProjectsSnapshot
  /** Non-null when a fatal condition prevents writing the new snapshot. */
  fatalError: string | null
}

/**
 * Transforms a raw repo listing to the `ProjectsSnapshot` shape.
 *
 * Stable-rebuild logic: if the serialized `projects` array is byte-identical
 * to the previous snapshot, `generatedAt` is preserved so CI commits are
 * not generated on unchanged data.
 */
export const buildProjectsSnapshot = (repos: GitHubRepo[], previousSnapshot: ProjectsSnapshot): BuildSnapshotResult => {
  const projects = transformReposToProjects(repos)

  const candidateSnapshot: ProjectsSnapshot = {
    projects,
    generatedAt: previousSnapshot.generatedAt,
    generator: GENERATOR,
  }

  const unchanged =
    stableStringify({...candidateSnapshot, generatedAt: previousSnapshot.generatedAt}) ===
    stableStringify(previousSnapshot)

  return {
    snapshot: unchanged ? candidateSnapshot : {...candidateSnapshot, generatedAt: new Date().toISOString()},
    fatalError: null,
  }
}

// --- Top-level orchestration: dual CLI/library shape ---

export interface RefreshOptions {
  snapshotPath?: string
  username?: string
  token?: string | undefined
}

/**
 * Fetches the current portfolio repo set, builds a `ProjectsSnapshot`, and
 * writes it to disk. Fails safe: any error before a successful build leaves
 * the on-disk snapshot untouched and sets a non-zero `process.exitCode`.
 *
 * Fail-safe ordering:
 *   1. Read previous snapshot first (aborts on corrupt file rather than silently
 *      treating it as empty and overwriting the only good data).
 *   2. Fetch repo listing (aborts without touching the snapshot on failure).
 *   3. Transform, check byte-identity.
 *   4. Atomic write only after a fully valid new snapshot is in hand.
 */
export const refreshProjectsSnapshot = async (options: RefreshOptions = {}): Promise<void> => {
  const snapshotPath = options.snapshotPath ?? DEFAULT_SNAPSHOT_PATH
  const username = options.username ?? DEFAULT_USERNAME
  const token = options.token ?? (process.env.GITHUB_TOKEN || undefined)

  // Read previous snapshot FIRST before any I/O that could fail.
  let previousSnapshot: ProjectsSnapshot
  try {
    previousSnapshot = readPreviousSnapshot(snapshotPath)
  } catch (error) {
    console.error(`❌ ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
    return
  }

  // Authenticated headers are for api.github.com ONLY.
  // They must never be forwarded to any other origin.
  const apiHeaders: Record<string, string> = {accept: 'application/vnd.github+json'}
  if (token) apiHeaders.authorization = `Bearer ${token}`

  let repos: GitHubRepo[]
  try {
    repos = await fetchRepoListing(username, apiHeaders)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`❌ Projects snapshot refresh failed: ${message}`)
    process.exitCode = 1
    return
  }

  const result = buildProjectsSnapshot(repos, previousSnapshot)

  if (result.fatalError) {
    console.error(`❌ Projects snapshot refresh failed: ${result.fatalError}`)
    process.exitCode = 1
    return
  }

  try {
    atomicWrite(snapshotPath, stableStringify(result.snapshot))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`❌ Projects snapshot refresh failed to write: ${message}`)
    process.exitCode = 1
    return
  }

  console.log(`✅ Projects snapshot refreshed: ${result.snapshot.projects.length} project(s)`)
  process.exitCode = 0
}

if (import.meta.url === `file://${process.argv[1]}`) {
  refreshProjectsSnapshot().catch((error: unknown) => {
    console.error('❌ Unexpected projects snapshot refresh error:', error)
    process.exitCode = 1
  })
}
