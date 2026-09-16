#!/usr/bin/env tsx

/**
 * Semantic content-change detector for the blog-refresh workflow.
 *
 * `blog-refresh.ts` and `projects-refresh.ts` regenerate `generatedAt` (and,
 * for projects, each project's upstream-push-derived `lastUpdated` and
 * third-party `stars` count) on every run, even when nothing a reader would
 * see has changed. Byte-level `git status` therefore treats a pure timestamp
 * (or star-count) drift as "changed" and opens a content-refresh PR for no
 * visible reason (see PR #369, where the only delta across both snapshot
 * files was one project's `lastUpdated` and the top-level `generatedAt`).
 *
 * This script decides whether the workflow's regenerated
 * `src/data/blog-snapshot.json` / `src/data/projects-snapshot.json` and
 * `public/project-previews/` differ from the last commit in any way a reader
 * would notice, ignoring only these volatile fields (none of which mean the
 * project's content changed):
 *   - top-level `generatedAt` in both snapshots — pure generation metadata
 *   - each project's `lastUpdated` in `projects-snapshot.json` — tracks the
 *     upstream repo's push activity, not any displayed property
 *   - each project's `stars` in `projects-snapshot.json` — tracks
 *     third-party interaction (someone starring the repo), not the project
 *     itself changing
 *
 * `blog-snapshot.json` posts carry `gistUpdatedAt`, but that field is the
 * timestamp of the exact content being compared (the gist's Markdown
 * source), not unrelated repo activity: a real edit already changes `html`
 * and/or `frontmatter`, which this script DOES compare. It is deliberately
 * NOT stripped — see the `kind === 'projects'` guard in
 * `normalizeForComparison`.
 *
 * Fails closed: any unreadable/unparseable snapshot, or any failure in the
 * git comparison itself, is reported as CHANGED (with a `::warning::`) so a
 * broken comparison can never silently suppress a real content update — see
 * docs/solutions/best-practices/checks-that-pass-while-validating-nothing-2026-09-01.md.
 *
 * Dual CLI/library shape mirrors `scripts/blog-refresh.ts`: pure comparison
 * logic is exported and unit-tested directly; `main()` wires it to git/fs and
 * runs when invoked directly via the `import.meta.url` guard.
 */

import {Buffer} from 'node:buffer'
import {execFileSync} from 'node:child_process'
import {appendFileSync, readFileSync} from 'node:fs'
import {join} from 'node:path'
import process from 'node:process'

export const BLOG_SNAPSHOT_PATH = 'src/data/blog-snapshot.json'
export const PROJECTS_SNAPSHOT_PATH = 'src/data/projects-snapshot.json'
export const PREVIEW_DIRECTORY = 'public/project-previews/'

type SnapshotKind = 'blog' | 'projects'
type UnknownRecord = Record<string, unknown>

/** Read result for the current (working-tree) copy of a file. */
export type CurrentRead = {content: string} | {error: string}
/** Read result for the committed (`HEAD`) copy of a file. `content: null` means the path legitimately did not exist at `HEAD` (a new file — a real change, not a failure). */
export type PreviousRead = {content: string | null} | {error: string}
/** Read result for `git status --porcelain` scoped to the preview directory. */
export type PreviewStatusRead = {output: string} | {error: string}

export interface CheckOutcome {
  status: 'unchanged' | 'changed' | 'error'
  /** Human-readable line describing what was compared and the outcome. */
  note: string
  /** Present only when `status === 'error'`; surfaced as a `::warning::`. */
  warning?: string
}

export interface DiffResult {
  changed: boolean
  summary: string[]
  warnings: string[]
}

// --- Pure comparison logic ---

const parseJsonRecord = (raw: string, label: string): UnknownRecord => {
  const parsed: unknown = JSON.parse(raw)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${label} is not a JSON object`)
  }
  return parsed as UnknownRecord
}

/**
 * Strips `generatedAt` and, for `projects-snapshot.json`, each project's
 * `lastUpdated` and `stars`, then returns a stable JSON string for equality
 * comparison. Key order is preserved from the source object; both the
 * committed and the freshly regenerated file are produced by the same
 * generator's `JSON.stringify(snapshot, null, 2)`, so remaining key order
 * always matches when the underlying data matches.
 */
export const normalizeForComparison = (snapshot: UnknownRecord, kind: SnapshotKind): string => {
  const {generatedAt: _generatedAt, ...rest} = snapshot

  if (kind === 'projects' && Array.isArray(rest.projects)) {
    rest.projects = rest.projects.map(project => {
      if (typeof project !== 'object' || project === null) return project
      const {lastUpdated: _lastUpdated, stars: _stars, ...projectRest} = project as UnknownRecord
      return projectRest
    })
  }

  return JSON.stringify(rest)
}

/**
 * Compares the current and committed copies of one snapshot file, ignoring
 * volatile fields. Fails CLOSED at every boundary: an unreadable file, an
 * unreadable git history entry, or a parse/shape failure all resolve to
 * `status: 'error'`, which the caller treats as `changed: true`.
 */
export const evaluateSnapshotCheck = (
  label: string,
  kind: SnapshotKind,
  current: CurrentRead,
  previous: PreviousRead,
): CheckOutcome => {
  if ('error' in current) {
    return {
      status: 'error',
      note: `${label}: could not read regenerated file`,
      warning: `Could not read regenerated ${label}; falling back to CHANGED: ${current.error}`,
    }
  }
  if ('error' in previous) {
    return {
      status: 'error',
      note: `${label}: could not read committed version`,
      warning: `Could not read committed ${label} from HEAD; falling back to CHANGED: ${previous.error}`,
    }
  }
  if (previous.content === null) {
    return {status: 'changed', note: `${label}: new file (no previous committed version)`}
  }

  try {
    const previousNormalized = normalizeForComparison(parseJsonRecord(previous.content, `previous ${label}`), kind)
    const currentNormalized = normalizeForComparison(parseJsonRecord(current.content, `current ${label}`), kind)
    if (previousNormalized === currentNormalized) {
      const ignored = kind === 'projects' ? 'generatedAt/lastUpdated/stars ignored' : 'generatedAt ignored'
      return {status: 'unchanged', note: `${label}: no semantic change (${ignored})`}
    }
    return {status: 'changed', note: `${label}: content differs`}
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      status: 'error',
      note: `${label}: comparison failed`,
      warning: `Could not semantically compare ${label}; falling back to CHANGED: ${message}`,
    }
  }
}

const PORCELAIN_RENAME_SEPARATOR = ' -> '

/**
 * Extracts the path from one `git status --porcelain` line. Porcelain's
 * status prefix is FIXED-WIDTH: two status characters (`XY`, either of which
 * may be a literal space) followed by exactly one separator space -- path
 * text starts at index 3, always. Trimming the line before slicing (the
 * prior bug) eats one character of the path whenever `X` is a space, which
 * is the common case for a work-tree-only change (` M`, ` D`, ...).
 *
 * Renamed/copied entries report as `XY ORIG_PATH -> NEW_PATH`; this returns
 * NEW_PATH (the destination), since that is what a maintainer reading the
 * summary needs to find on disk right now. The `-> ` split only applies when
 * the status is actually `R`/`C`, so an ordinary path that happens to
 * contain the literal substring " -> " is never misparsed as a rename.
 *
 * Deliberately does NOT unquote C-style quoted paths (the form git emits for
 * unusual filenames under the default `core.quotePath`). Every path under
 * `public/project-previews/` is a `<repo-id>.png` filename generated by
 * `project-preview-refresh.ts` from a numeric GitHub repo id (see
 * `previewFilename`) -- plain ASCII digits plus `.png`, which git never
 * quotes. Out of scope: no repo id can ever produce a quote-worthy filename
 * in this directory.
 */
export const parsePorcelainPath = (line: string): string => {
  const status = line.slice(0, 2)
  const rawPath = line.slice(3)
  if (!status.includes('R') && !status.includes('C')) {
    return rawPath
  }
  const separatorIndex = rawPath.indexOf(PORCELAIN_RENAME_SEPARATOR)
  return separatorIndex === -1 ? rawPath : rawPath.slice(separatorIndex + PORCELAIN_RENAME_SEPARATOR.length)
}

/**
 * Parses `git status --porcelain` output scoped to the preview directory.
 * Porcelain format lists untracked files (`??`) alongside modified/deleted
 * tracked files, so this catches added, removed, AND content-changed
 * preview images — including untracked new PNGs, the case PR #349 fixed
 * after `git diff --quiet` missed them.
 */
export const detectPreviewChanges = (porcelainOutput: string): {changed: boolean; paths: string[]} => {
  const lines = porcelainOutput
    .split('\n')
    .map(line => line.replace(/\r$/, ''))
    .filter(line => line.length > 0)
  const paths = lines.map(parsePorcelainPath)
  return {changed: lines.length > 0, paths}
}

export const evaluatePreviewCheck = (status: PreviewStatusRead): CheckOutcome => {
  if ('error' in status) {
    return {
      status: 'error',
      note: `${PREVIEW_DIRECTORY}: could not check for changes`,
      warning: `Could not check ${PREVIEW_DIRECTORY} for changes; falling back to CHANGED: ${status.error}`,
    }
  }
  const {changed, paths} = detectPreviewChanges(status.output)
  return changed
    ? {status: 'changed', note: `${PREVIEW_DIRECTORY}: changed (${paths.join(', ')})`}
    : {status: 'unchanged', note: `${PREVIEW_DIRECTORY}: no changes`}
}

/** Combines every check into one decision: ANY non-`unchanged` outcome (real change or fail-closed error) means a PR is warranted. */
export const combineOutcomes = (outcomes: CheckOutcome[]): DiffResult => {
  const changed = outcomes.some(outcome => outcome.status !== 'unchanged')
  const summary = outcomes.map(outcome => `- ${outcome.note}`)
  const warnings = outcomes.flatMap(outcome => (outcome.warning ? [outcome.warning] : []))
  return {changed, summary, warnings}
}

// --- git/fs adapters (CLI only; kept thin so the logic above stays pure) ---

const readCurrentFile = (root: string, relativePath: string): CurrentRead => {
  try {
    return {content: readFileSync(join(root, relativePath), 'utf8')}
  } catch (error) {
    return {error: error instanceof Error ? error.message : String(error)}
  }
}

const gitStderr = (error: unknown): string => {
  if (error && typeof error === 'object' && 'stderr' in error) {
    const stderr = (error as {stderr: unknown}).stderr
    if (typeof stderr === 'string') return stderr.trim()
    if (stderr instanceof Uint8Array) return Buffer.from(stderr).toString('utf8').trim()
  }
  return error instanceof Error ? error.message : String(error)
}

const readCommittedFile = (root: string, relativePath: string): PreviousRead => {
  try {
    const content = execFileSync('git', ['show', `HEAD:${relativePath}`], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return {content}
  } catch (error) {
    const stderr = gitStderr(error)
    // "does not exist in <rev>" / "exists on disk, but not in <rev>" both mean the path
    // legitimately has no committed version yet — a new file, not a comparison failure.
    if (/does not exist in/.test(stderr) || /exists on disk, but not in/.test(stderr)) {
      return {content: null}
    }
    return {error: stderr || 'git show failed'}
  }
}

const readPreviewStatus = (root: string): PreviewStatusRead => {
  try {
    const output = execFileSync('git', ['status', '--porcelain', '--', PREVIEW_DIRECTORY], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return {output}
  } catch (error) {
    return {error: gitStderr(error) || 'git status failed'}
  }
}

/** Runs the full detection against a real working tree (used by the CLI, and by tests against a scratch git repo). */
export const runDetection = (root: string): DiffResult => {
  const blogOutcome = evaluateSnapshotCheck(
    'blog-snapshot.json',
    'blog',
    readCurrentFile(root, BLOG_SNAPSHOT_PATH),
    readCommittedFile(root, BLOG_SNAPSHOT_PATH),
  )
  const projectsOutcome = evaluateSnapshotCheck(
    'projects-snapshot.json',
    'projects',
    readCurrentFile(root, PROJECTS_SNAPSHOT_PATH),
    readCommittedFile(root, PROJECTS_SNAPSHOT_PATH),
  )
  const previewOutcome = evaluatePreviewCheck(readPreviewStatus(root))

  return combineOutcomes([blogOutcome, projectsOutcome, previewOutcome])
}

const writeGithubOutput = (name: string, value: string): void => {
  const outputPath = process.env.GITHUB_OUTPUT
  if (!outputPath) return
  appendFileSync(outputPath, `${name}=${value}\n`)
}

export const main = (): void => {
  const result = runDetection(process.cwd())

  console.log('### Content change detection')
  for (const line of result.summary) console.log(line)
  for (const warning of result.warnings) console.warn(`::warning::${warning}`)
  console.log(
    result.changed ? '✅ Real content change detected — PR warranted' : 'ℹ️  No semantic content change — skipping PR',
  )

  writeGithubOutput('changed', result.changed ? 'true' : 'false')
  process.exitCode = 0
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
