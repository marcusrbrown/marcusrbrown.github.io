import {Buffer} from 'node:buffer'
import {spawn} from 'node:child_process'
import {tmpdir} from 'node:os'
import {isAbsolute, join, relative, sep} from 'node:path'
import process from 'node:process'

export const DEFAULT_GH_TIMEOUT_MS = 30_000
export const DEFAULT_GH_OUTPUT_BYTES = 256_000

export interface GhCommandResult {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number | null
}

export interface GhRunOptions {
  readonly input?: string
  readonly timeoutMs?: number
}

export interface GhRunner {
  run: (args: readonly string[], options?: GhRunOptions) => Promise<GhCommandResult>
}

export type SpawnCommand = (
  args: readonly string[],
  input: string | undefined,
  options: {
    readonly command: string
    readonly timeoutMs: number
    readonly maxOutputBytes: number
    readonly env: Readonly<Record<string, string>>
  },
) => Promise<GhCommandResult>

export class GhRunnerError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GhRunnerError'
  }
}

const redacted = (_value: string): string => '[redacted]'

const ghEnvironment = (): Readonly<Record<string, string>> => {
  const configuredHome = process.env.HOME
  const cwd = process.cwd()
  const relativeHome =
    configuredHome === undefined || !isAbsolute(configuredHome) ? '..' : relative(cwd, configuredHome)
  const repositoryLocal = relativeHome === '' || (!relativeHome.startsWith(`..${sep}`) && relativeHome !== '..')
  const home =
    configuredHome !== undefined && isAbsolute(configuredHome) && !repositoryLocal
      ? configuredHome
      : join(tmpdir(), 'live-audit-gh-home')
  const environment: Record<string, string> = {PATH: process.env.PATH ?? '', HOME: home, NO_COLOR: '1'}
  for (const key of ['GH_TOKEN', 'GITHUB_TOKEN', 'GH_HOST']) {
    const value = process.env[key]
    if (value !== undefined) environment[key] = value
  }
  return environment
}

const defaultSpawnCommand: SpawnCommand = (args, input, options) =>
  new Promise((resolve, reject) => {
    const child = spawn(options.command, args, {
      env: options.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []
    let stdoutBytes = 0
    let stderrBytes = 0
    let bounded = false
    let timedOut = false
    let settled = false
    let graceTimer: NodeJS.Timeout | undefined
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
      graceTimer = setTimeout(() => child.kill('SIGKILL'), 250)
    }, options.timeoutMs)
    const append = (chunks: Buffer[], currentBytes: number, chunk: Buffer): number => {
      const remaining = options.maxOutputBytes - currentBytes
      if (remaining <= 0) {
        bounded = true
        return currentBytes
      }
      const kept = chunk.subarray(0, remaining)
      chunks.push(kept)
      if (kept.byteLength < chunk.byteLength) bounded = true
      return currentBytes + kept.byteLength
    }
    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBytes = append(stdoutChunks, stdoutBytes, chunk)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderrBytes = append(stderrChunks, stderrBytes, chunk)
    })
    child.once('error', () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (graceTimer) clearTimeout(graceTimer)
      reject(new GhRunnerError('failed to start gh'))
    })
    child.once('close', exitCode => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (graceTimer) clearTimeout(graceTimer)
      const stdout = Buffer.concat(stdoutChunks).toString('utf8')
      const stderr = Buffer.concat(stderrChunks).toString('utf8')
      if (timedOut) reject(new GhRunnerError(`gh timed out after ${options.timeoutMs}ms`))
      else if (bounded) reject(new GhRunnerError(`gh output exceeded bounded limit of ${options.maxOutputBytes} bytes`))
      else resolve({stdout, stderr, exitCode})
    })
    if (input !== undefined) child.stdin.write(input)
    child.stdin.end()
  })

export const createGhRunner = (
  options: {
    readonly command?: string
    readonly timeoutMs?: number
    readonly maxOutputBytes?: number
    readonly spawnCommand?: SpawnCommand
  } = {},
): GhRunner => {
  const timeoutMs = options.timeoutMs ?? DEFAULT_GH_TIMEOUT_MS
  const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_GH_OUTPUT_BYTES
  const execute = options.spawnCommand ?? defaultSpawnCommand
  return {
    run: (args, runOptions = {}) =>
      execute(args, runOptions.input, {
        command: options.command ?? 'gh',
        timeoutMs: runOptions.timeoutMs ?? timeoutMs,
        maxOutputBytes,
        env: ghEnvironment(),
      }),
  }
}

export const parseGhJson = <T>(
  result: GhCommandResult,
  guard: (value: unknown) => value is T,
  maxOutputBytes = DEFAULT_GH_OUTPUT_BYTES,
): T => {
  if (result.exitCode !== 0)
    throw new GhRunnerError(`gh failed with exit code ${result.exitCode ?? 'unknown'} (${redacted(result.stderr)})`)
  if (Buffer.byteLength(result.stdout, 'utf8') > maxOutputBytes)
    throw new GhRunnerError(`gh output exceeded bounded limit of ${maxOutputBytes} bytes`)
  let value: unknown
  try {
    value = JSON.parse(result.stdout) as unknown
  } catch {
    throw new GhRunnerError('gh returned malformed JSON')
  }
  if (!guard(value)) throw new GhRunnerError('gh returned an unexpected response shape')
  return value
}

export interface GitHubRepository {
  readonly owner: string
  readonly repo: string
}
export interface GitHubIssue {
  readonly number: number
  readonly title: string
  readonly body: string | null
  readonly state: 'open' | 'closed'
  readonly stateReason: string | null
  readonly labels: readonly string[]
  readonly comments: number
  readonly updatedAt: string
}
export interface GitHubCloseEvent {
  readonly id: number
  readonly event: 'closed' | 'reopened'
  readonly createdAt: string
  readonly actor: string | null
}
export interface GitHubIssueComment {
  readonly id: number
  readonly body: string
  readonly actor: string | null
  readonly createdAt: string
}
export type GitHubPermission = 'read' | 'triage' | 'write' | 'maintain' | 'admin'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const assertRepository = (repository: GitHubRepository): void => {
  if (!/^[A-Z0-9][\w.-]{0,99}$/i.test(repository.owner) || !/^[A-Z0-9][\w.-]{0,99}$/i.test(repository.repo))
    throw new GhRunnerError('invalid repository identifier')
}
const assertIssueNumber = (issueNumber: number): void => {
  if (!Number.isInteger(issueNumber) || issueNumber < 1 || issueNumber > 2_000_000_000)
    throw new GhRunnerError('invalid issue number')
}
const assertActor = (actor: string): void => {
  if (!/^[A-Z0-9][\w.-]{0,99}$/i.test(actor)) throw new GhRunnerError('invalid actor identifier')
}
const assertLifecycleActor = (actor: string): void => {
  if (actor.endsWith('[bot]')) {
    assertActor(actor.slice(0, -'[bot]'.length))
    return
  }
  assertActor(actor)
}
const isIssue = (value: unknown): value is Record<string, unknown> => {
  if (
    !isRecord(value) ||
    typeof value.number !== 'number' ||
    typeof value.title !== 'string' ||
    (typeof value.body !== 'string' && value.body !== null) ||
    !['open', 'closed'].includes(String(value.state)) ||
    (typeof value.state_reason !== 'string' && value.state_reason !== null) ||
    typeof value.comments !== 'number' ||
    typeof value.updated_at !== 'string' ||
    !Array.isArray(value.labels)
  )
    return false
  return value.labels.every(label => isRecord(label) && typeof label.name === 'string')
}
const toIssue = (value: Record<string, unknown>): GitHubIssue => ({
  number: value.number as number,
  title: value.title as string,
  body: value.body as string | null,
  state: value.state as 'open' | 'closed',
  stateReason: value.state_reason as string | null,
  labels: (value.labels as {name: string}[]).map(label => label.name),
  comments: value.comments as number,
  updatedAt: value.updated_at as string,
})
const isUnknownArray = (value: unknown): value is unknown[] => Array.isArray(value)
const flattenRecordPages = (
  value: unknown,
  label: string,
  maxPages = 100,
  maxItems = 1_000,
): Record<string, unknown>[] => {
  if (!Array.isArray(value) || value.length > maxPages || !value.every(page => Array.isArray(page)))
    throw new GhRunnerError(`${label} pagination response was truncated or unexpected`)
  const items = value.flat()
  if (items.length > maxItems || !items.every(item => isRecord(item)))
    throw new GhRunnerError(`${label} pagination response was truncated or unexpected`)
  return items
}

const LABELED_ISSUE_STATES = ['open', 'closed'] as const
const MAX_LABELED_ISSUES = 1_000

export const listLabeledIssues = async (
  runner: GhRunner,
  repository: GitHubRepository,
  label: string,
): Promise<readonly GitHubIssue[]> => {
  assertRepository(repository)
  if (!/^[A-Z0-9][\w.-]{0,99}$/i.test(label)) throw new GhRunnerError('invalid issue label')

  const issues = new Map<number, GitHubIssue>()
  for (const state of LABELED_ISSUE_STATES) {
    const result = await runner.run([
      'api',
      `repos/${repository.owner}/${repository.repo}/issues?labels=${label}&state=${state}&per_page=100`,
      '--paginate',
      '--slurp',
    ])
    const raw = flattenRecordPages(parseGhJson(result, isUnknownArray), 'labeled issues')
    for (const item of raw) {
      if ('pull_request' in item) continue
      if (!isIssue(item)) throw new GhRunnerError('GitHub labeled issue response has an unexpected shape')
      const issue = toIssue(item)
      assertIssueNumber(issue.number)
      if (issue.state !== state || !issue.labels.includes(label)) continue
      if (issues.has(issue.number)) continue
      if (issues.size >= MAX_LABELED_ISSUES)
        throw new GhRunnerError('labeled issue response was truncated or exceeded bounded result limit')
      issues.set(issue.number, issue)
    }
  }
  return [...issues.values()]
}

export const getIssue = async (
  runner: GhRunner,
  repository: GitHubRepository,
  issueNumber: number,
): Promise<GitHubIssue> => {
  assertRepository(repository)
  assertIssueNumber(issueNumber)
  const result = await runner.run(['api', `repos/${repository.owner}/${repository.repo}/issues/${issueNumber}`])
  const raw = parseGhJson(result, isRecord)
  if (!isIssue(raw)) throw new GhRunnerError('GitHub issue response has an unexpected shape')
  return toIssue(raw)
}

export const getIssueCloseEvents = async (
  runner: GhRunner,
  repository: GitHubRepository,
  issueNumber: number,
): Promise<readonly GitHubCloseEvent[]> => {
  assertRepository(repository)
  assertIssueNumber(issueNumber)
  const result = await runner.run([
    'api',
    `repos/${repository.owner}/${repository.repo}/issues/${issueNumber}/events`,
    '--paginate',
    '--slurp',
  ])
  const raw = flattenRecordPages(parseGhJson(result, isUnknownArray), 'issue events')
  const events: GitHubCloseEvent[] = []
  for (const event of raw) {
    if (typeof event.event !== 'string') throw new GhRunnerError('GitHub issue lifecycle event has an unexpected shape')
    if (event.event !== 'closed' && event.event !== 'reopened') continue
    if (typeof event.id !== 'number' || !Number.isSafeInteger(event.id) || event.id < 1)
      throw new GhRunnerError('GitHub issue lifecycle event has an invalid id')
    if (typeof event.created_at !== 'string' || !Number.isFinite(Date.parse(event.created_at)))
      throw new GhRunnerError('GitHub issue lifecycle event has an invalid timestamp')
    if (!Object.prototype.hasOwnProperty.call(event, 'actor'))
      throw new GhRunnerError('GitHub issue lifecycle event has an unexpected shape')
    let actor: string | null
    if (event.actor === null) actor = null
    else if (isRecord(event.actor) && typeof event.actor.login === 'string') {
      assertLifecycleActor(event.actor.login)
      actor = event.actor.login
    } else throw new GhRunnerError('GitHub issue lifecycle event has an unexpected actor shape')
    events.push({id: event.id, event: event.event, createdAt: event.created_at, actor})
  }
  return events.sort((left, right) => {
    const byTimestamp = Date.parse(left.createdAt) - Date.parse(right.createdAt)
    if (byTimestamp !== 0) return byTimestamp
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
  })
}

export const searchIssues = async (
  runner: GhRunner,
  repository: GitHubRepository,
  label: string,
  state: 'open' | 'closed',
): Promise<readonly GitHubIssue[]> => {
  assertRepository(repository)
  if (!/^[A-Z0-9][\w.-]{0,99}$/i.test(label)) throw new GhRunnerError('invalid issue label')
  const query = `repo:${repository.owner}/${repository.repo} label:${label} state:${state}`
  const result = await runner.run([
    'api',
    'search/issues',
    '--method',
    'GET',
    '--field',
    `q=${query}`,
    '--paginate',
    '--slurp',
  ])
  const pages = parseGhJson(result, isUnknownArray)
  const items: Record<string, unknown>[] = []
  let totalCount = 0
  for (const page of pages) {
    if (
      !isRecord(page) ||
      typeof page.total_count !== 'number' ||
      page.incomplete_results !== false ||
      !Array.isArray(page.items) ||
      !page.items.every(isIssue)
    )
      throw new GhRunnerError('issue search response was incomplete or truncated')
    totalCount = Math.max(totalCount, page.total_count)
    items.push(...page.items)
  }
  if (items.length > 1_000 || items.length < totalCount)
    throw new GhRunnerError('issue search response was incomplete or truncated')
  return items.map(item => toIssue(item))
}

export const getIssueComments = async (
  runner: GhRunner,
  repository: GitHubRepository,
  issueNumber: number,
): Promise<readonly GitHubIssueComment[]> => {
  assertRepository(repository)
  assertIssueNumber(issueNumber)
  const result = await runner.run([
    'api',
    `repos/${repository.owner}/${repository.repo}/issues/${issueNumber}/comments`,
    '--paginate',
    '--slurp',
  ])
  const raw = flattenRecordPages(parseGhJson(result, isUnknownArray), 'issue comments')
  if (
    !raw.every(
      comment =>
        typeof comment.id === 'number' && typeof comment.body === 'string' && typeof comment.created_at === 'string',
    )
  )
    throw new GhRunnerError('GitHub comment response has an unexpected shape')
  return raw.map(comment => ({
    id: comment.id as number,
    body: comment.body as string,
    actor: isRecord(comment.user) && typeof comment.user.login === 'string' ? comment.user.login : null,
    createdAt: comment.created_at as string,
  }))
}

export const getRepositoryPermission = async (
  runner: GhRunner,
  repository: GitHubRepository,
  actor: string,
): Promise<GitHubPermission> => {
  assertRepository(repository)
  assertActor(actor)
  const result = await runner.run([
    'api',
    `repos/${repository.owner}/${repository.repo}/collaborators/${actor}/permission`,
  ])
  const raw = parseGhJson(result, isRecord)
  if (!['read', 'triage', 'write', 'maintain', 'admin'].includes(String(raw.permission)))
    throw new GhRunnerError('GitHub permission response has an unexpected shape')
  return raw.permission as GitHubPermission
}

const assertWriteSuccess = (result: GhCommandResult, label: string): void => {
  if (result.exitCode !== 0) throw new GhRunnerError(`${label} failed with exit code ${result.exitCode ?? 'unknown'}`)
}

export const createIssue = async (
  runner: GhRunner,
  repository: GitHubRepository,
  input: {readonly title: string; readonly body: string; readonly labels: readonly string[]},
): Promise<GitHubIssue> => {
  assertRepository(repository)
  const result = await runner.run(
    ['api', `repos/${repository.owner}/${repository.repo}/issues`, '--method', 'POST', '--input', '-'],
    {input: JSON.stringify(input)},
  )
  const raw = parseGhJson(result, isRecord)
  if (!isIssue(raw)) throw new GhRunnerError('GitHub issue create response has an unexpected shape')
  return toIssue(raw)
}

export const patchIssueBodyFresh = async (
  runner: GhRunner,
  repository: GitHubRepository,
  issueNumber: number,
  merge: (issue: GitHubIssue) => string,
): Promise<GitHubIssue> => {
  const freshIssue = await getIssue(runner, repository, issueNumber)
  const result = await runner.run(
    ['api', `repos/${repository.owner}/${repository.repo}/issues/${issueNumber}`, '--method', 'PATCH', '--input', '-'],
    {input: JSON.stringify({body: merge(freshIssue)})},
  )
  assertWriteSuccess(result, 'GitHub issue body patch')
  return getIssue(runner, repository, issueNumber)
}

export const addIssueComment = async (
  runner: GhRunner,
  repository: GitHubRepository,
  issueNumber: number,
  body: string,
): Promise<void> => {
  assertRepository(repository)
  assertIssueNumber(issueNumber)
  const result = await runner.run(
    [
      'api',
      `repos/${repository.owner}/${repository.repo}/issues/${issueNumber}/comments`,
      '--method',
      'POST',
      '--input',
      '-',
    ],
    {input: JSON.stringify({body})},
  )
  assertWriteSuccess(result, 'GitHub issue comment')
}

export const setIssueLabels = async (
  runner: GhRunner,
  repository: GitHubRepository,
  issueNumber: number,
  labels: readonly string[],
): Promise<void> => {
  assertRepository(repository)
  assertIssueNumber(issueNumber)
  const result = await runner.run(
    [
      'api',
      `repos/${repository.owner}/${repository.repo}/issues/${issueNumber}/labels`,
      '--method',
      'PUT',
      '--input',
      '-',
    ],
    {input: JSON.stringify({labels})},
  )
  assertWriteSuccess(result, 'GitHub issue labels')
}

export const setIssueState = async (
  runner: GhRunner,
  repository: GitHubRepository,
  issueNumber: number,
  state: 'open' | 'closed',
  stateReason: 'completed' | 'not_planned' | 'duplicate' | 'reopened',
): Promise<void> => {
  assertRepository(repository)
  assertIssueNumber(issueNumber)
  const result = await runner.run(
    ['api', `repos/${repository.owner}/${repository.repo}/issues/${issueNumber}`, '--method', 'PATCH', '--input', '-'],
    {input: JSON.stringify({state, state_reason: stateReason})},
  )
  assertWriteSuccess(result, 'GitHub issue state')
}
