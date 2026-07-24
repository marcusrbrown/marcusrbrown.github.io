import {Buffer} from 'node:buffer'
import {closeSync, fsyncSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import process from 'node:process'
import {parseArgs} from 'node:util'

import {
  createGhRunner,
  getIssue,
  getRepositoryPermission,
  listLabeledIssues,
  type GhRunner,
  type GitHubIssue,
  type GitHubRepository,
} from './github-runner'
import {parseIssueLedger, type IssueLedger} from './issue-ledger'
import {buildManualReplayPlan, buildScheduledReplayPlan, serializeReplayPlan, type ReplayPlan} from './replay-plan'
import {
  authorizeManualRoute,
  parseLiveAuditEvent,
  type LiveAuditEventRoute,
  type LiveAuditIgnoredReason,
  type ManualCandidateRoute,
} from './route-event'

export const MAX_EVENT_BYTES = 256_000
export const DEFAULT_EXPLORATION = {steps: 2, durationMs: 10_000} as const

export interface PrepareDiscoveryFileSystem {
  readonly readFileSync: (path: string) => string | Uint8Array
  readonly writeFileSync: (
    path: string,
    data: string | Uint8Array,
    options?: {readonly flag?: string; readonly mode?: number},
  ) => void
  readonly renameSync: (from: string, to: string) => void
  readonly unlinkSync?: (path: string) => void
  readonly openSync?: (path: string, flags: string) => number
  readonly fsyncSync?: (fd: number) => void
  readonly closeSync?: (fd: number) => void
}

export interface PrepareDiscoveryArgs {
  readonly eventFile: string
  readonly out: string
}

export interface RunPrepareDiscoveryInput {
  readonly eventFile: string
  readonly out: string
  readonly env: Readonly<Record<string, string | undefined>>
  readonly fs: PrepareDiscoveryFileSystem
  readonly clock: () => Date
  readonly runner: GhRunner
  readonly exploration?: {readonly steps: number; readonly durationMs: number}
}

export type PrepareDiscoveryRejectReason =
  | 'invalid-arguments'
  | 'invalid-environment'
  | 'unsafe-path'
  | 'event-file-invalid'
  | 'event-too-large'
  | 'invalid-clock'
  | 'insufficient-permission'
  | 'permission-check-failed'
  | 'github-preflight-failed'
  | 'missing-visual-audit-label'
  | 'suppressed'
  | 'invalid-ledger'
  | 'duplicate-fingerprint'
  | 'invalid-replay-plan'
  | 'output-write-failed'

export type PrepareDiscoveryResult =
  | {readonly kind: 'ignored'; readonly reason: LiveAuditIgnoredReason}
  | {readonly kind: 'rejected'; readonly reason: PrepareDiscoveryRejectReason}
  | {
      readonly kind: 'written'
      readonly runKind: 'manual' | 'scheduled'
      readonly bytes: number
      readonly issueNumbers: readonly number[]
      readonly activeVariants: number
    }

interface ParsedEnvironment {
  readonly eventName: string
  readonly repository: GitHubRepository
  readonly runId: string
  readonly runAttempt: number
}

const defaultFileSystem: PrepareDiscoveryFileSystem = {
  readFileSync: path => readFileSync(path),
  writeFileSync: (path, data, options) => writeFileSync(path, data, options),
  renameSync,
  unlinkSync,
  openSync,
  fsyncSync,
  closeSync,
}

const isSafeText = (value: unknown, maxLength: number): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= maxLength &&
  [...value].every(character => {
    const code = character.codePointAt(0) ?? 0
    return code > 0x1f && code !== 0x7f
  })

const isSafePath = (value: string): boolean => {
  if (!isSafeText(value, 1_000) || value.endsWith('/') || value.includes('\\')) return false
  return !value.split('/').some(part => part === '.' || part === '..')
}

const parseRepository = (value: unknown): GitHubRepository | undefined => {
  if (typeof value !== 'string') return undefined
  const match = /^([A-Z0-9][\w.-]{0,99})\/([A-Z0-9][\w.-]{0,99})$/i.exec(value)
  if (!match?.[1] || !match[2]) return undefined
  return {owner: match[1], repo: match[2]}
}

const parsePositiveIntegerText = (value: unknown): string | undefined => {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return undefined
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? value : undefined
}

const parseEnvironment = (env: Readonly<Record<string, string | undefined>>): ParsedEnvironment | undefined => {
  const eventName = env.GITHUB_EVENT_NAME
  const repository = parseRepository(env.GITHUB_REPOSITORY)
  const runId = parsePositiveIntegerText(env.GITHUB_RUN_ID)
  const runAttemptText = parsePositiveIntegerText(env.GITHUB_RUN_ATTEMPT)
  if (
    typeof eventName !== 'string' ||
    !isSafeText(eventName, 100) ||
    !repository ||
    !runId ||
    !runAttemptText ||
    !isSafeText(env.GH_TOKEN, 1_000)
  )
    return undefined
  return {eventName, repository, runId, runAttempt: Number(runAttemptText)}
}

type EventReadResult =
  {readonly ok: true; readonly value: unknown} | {readonly ok: false; readonly result: PrepareDiscoveryResult}

const readEvent = (fileSystem: PrepareDiscoveryFileSystem, path: string): EventReadResult => {
  let raw: string | Uint8Array
  try {
    raw = fileSystem.readFileSync(path)
  } catch {
    return {ok: false, result: {kind: 'rejected', reason: 'event-file-invalid'}}
  }
  const bytes = typeof raw === 'string' ? Buffer.byteLength(raw, 'utf8') : raw.byteLength
  if (bytes > MAX_EVENT_BYTES) return {ok: false, result: {kind: 'rejected', reason: 'event-too-large'}}
  try {
    return {ok: true, value: JSON.parse(typeof raw === 'string' ? raw : Buffer.from(raw).toString('utf8')) as unknown}
  } catch {
    return {ok: false, result: {kind: 'rejected', reason: 'event-file-invalid'}}
  }
}

const parseLedgerForIssue = (current: GitHubIssue): IssueLedger | undefined => {
  if (typeof current.body !== 'string') return undefined
  try {
    return parseIssueLedger(current.body).ledger
  } catch {
    return undefined
  }
}

const withLabel = (current: GitHubIssue, label: string): GitHubIssue => ({
  ...current,
  labels: [...new Set([...current.labels, label])],
})

const mergeIssue = (current: GitHubIssue | undefined, incoming: GitHubIssue, sourceLabel: string): GitHubIssue =>
  current ? withLabel(current, sourceLabel) : withLabel(incoming, sourceLabel)

const isExpectedPermissionAbsence = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false
  return /^(?:HTTP\s+)?404(?:\s+Not Found)?$|^(?:not found|no access)$/i.test(error.message.trim())
}

const writeAtomically = (
  fileSystem: PrepareDiscoveryFileSystem,
  outputPath: string,
  content: string,
  runId: string,
  runAttempt: number,
): void => {
  const temporaryPath = join(
    dirname(outputPath),
    `.${outputPath.split('/').at(-1) ?? 'replay-plan'}.${runId}.${runAttempt}.tmp`,
  )
  let temporaryExists = false
  try {
    fileSystem.writeFileSync(temporaryPath, content, {flag: 'wx', mode: 0o600})
    temporaryExists = true
    if (fileSystem.openSync && fileSystem.fsyncSync && fileSystem.closeSync) {
      const descriptor = fileSystem.openSync(temporaryPath, 'r')
      try {
        fileSystem.fsyncSync(descriptor)
      } finally {
        fileSystem.closeSync(descriptor)
      }
    }
    fileSystem.renameSync(temporaryPath, outputPath)
    temporaryExists = false
  } finally {
    if (temporaryExists && fileSystem.unlinkSync) {
      try {
        fileSystem.unlinkSync(temporaryPath)
      } catch {
        // Preserve the original write/rename failure without leaking filesystem details.
      }
    }
  }
}

const resultFromPlan = (runKind: 'manual' | 'scheduled', plan: ReplayPlan, bytes: number): PrepareDiscoveryResult => ({
  kind: 'written',
  runKind,
  bytes,
  issueNumbers: plan.runKind === 'manual' ? [plan.issueNumber] : plan.issueNumbers,
  activeVariants: plan.activeRequests.length,
})

const serializeSafely = (plan: ReplayPlan): string | undefined => {
  try {
    return serializeReplayPlan(plan)
  } catch {
    return undefined
  }
}

const manualPlan = async (
  route: ManualCandidateRoute,
  environment: ParsedEnvironment,
  input: RunPrepareDiscoveryInput,
): Promise<PrepareDiscoveryResult> => {
  let permission
  try {
    const currentPermission = await getRepositoryPermission(input.runner, environment.repository, route.actor)
    permission = authorizeManualRoute(route, currentPermission)
  } catch (error) {
    if (isExpectedPermissionAbsence(error)) return {kind: 'rejected', reason: 'insufficient-permission'}
    return {kind: 'rejected', reason: 'permission-check-failed'}
  }
  if (permission.kind === 'rejected') return permission

  let currentIssue: GitHubIssue
  try {
    currentIssue = await getIssue(input.runner, environment.repository, route.issueNumber)
  } catch {
    return {kind: 'rejected', reason: 'github-preflight-failed'}
  }
  if (!currentIssue.labels.includes('visual-audit')) return {kind: 'rejected', reason: 'missing-visual-audit-label'}
  if (currentIssue.labels.includes('visual-audit-suppressed')) return {kind: 'rejected', reason: 'suppressed'}
  const ledger = parseLedgerForIssue(currentIssue)
  if (!ledger) return {kind: 'rejected', reason: 'invalid-ledger'}

  let plan: ReplayPlan
  try {
    plan = buildManualReplayPlan({
      runId: environment.runId,
      generatedAt: input.clock().toISOString(),
      issueNumber: route.issueNumber,
      exploration: input.exploration ?? DEFAULT_EXPLORATION,
      activeLedgers: [{issueNumber: route.issueNumber, ledger}],
    })
  } catch {
    return {kind: 'rejected', reason: 'invalid-replay-plan'}
  }
  const serialized = serializeSafely(plan)
  if (!serialized) return {kind: 'rejected', reason: 'invalid-replay-plan'}
  try {
    writeAtomically(input.fs, input.out, serialized, environment.runId, environment.runAttempt)
  } catch {
    return {kind: 'rejected', reason: 'output-write-failed'}
  }
  return resultFromPlan('manual', plan, Buffer.byteLength(serialized, 'utf8'))
}

const scheduledPlan = async (
  route: Extract<LiveAuditEventRoute, {kind: 'scheduled'}>,
  environment: ParsedEnvironment,
  input: RunPrepareDiscoveryInput,
): Promise<PrepareDiscoveryResult> => {
  const when = input.clock()
  if (Number.isNaN(when.getTime())) return {kind: 'rejected', reason: 'invalid-clock'}
  const expectedHour = route.schedule === '30 3 * * *' ? 3 : 15
  if (environment.eventName === 'schedule' && (when.getUTCHours() !== expectedHour || when.getUTCMinutes() !== 30))
    return {kind: 'rejected', reason: 'invalid-clock'}
  const scheduledAt =
    environment.eventName === 'workflow_dispatch'
      ? new Date(Date.UTC(when.getUTCFullYear(), when.getUTCMonth(), when.getUTCDate(), expectedHour, 30))
      : when

  let visualIssues: readonly GitHubIssue[]
  let suppressedIssues: readonly GitHubIssue[]
  try {
    visualIssues = await listLabeledIssues(input.runner, environment.repository, 'visual-audit')
    suppressedIssues = await listLabeledIssues(input.runner, environment.repository, 'visual-audit-suppressed')
  } catch {
    return {kind: 'rejected', reason: 'github-preflight-failed'}
  }

  const issues = new Map<number, GitHubIssue>()
  for (const current of visualIssues)
    issues.set(current.number, mergeIssue(issues.get(current.number), current, 'visual-audit'))
  for (const current of suppressedIssues)
    issues.set(current.number, mergeIssue(issues.get(current.number), current, 'visual-audit-suppressed'))

  const activeLedgers: {issueNumber: number; ledger: IssueLedger}[] = []
  const fingerprints = new Set<string>()
  for (const current of [...issues.values()].sort((left, right) => left.number - right.number)) {
    if (!current.labels.includes('visual-audit') || current.labels.includes('visual-audit-suppressed')) continue
    const ledger = parseLedgerForIssue(current)
    if (!ledger) return {kind: 'rejected', reason: 'invalid-ledger'}
    if (fingerprints.has(ledger.fingerprint)) return {kind: 'rejected', reason: 'duplicate-fingerprint'}
    fingerprints.add(ledger.fingerprint)
    activeLedgers.push({issueNumber: current.number, ledger})
  }

  let plan: ReplayPlan
  try {
    plan = buildScheduledReplayPlan({
      runId: environment.runId,
      generatedAt: scheduledAt.toISOString(),
      exploration: input.exploration ?? DEFAULT_EXPLORATION,
      activeLedgers,
      cron: route.schedule,
    })
  } catch {
    return {kind: 'rejected', reason: 'invalid-replay-plan'}
  }
  const serialized = serializeSafely(plan)
  if (!serialized) return {kind: 'rejected', reason: 'invalid-replay-plan'}
  try {
    writeAtomically(input.fs, input.out, serialized, environment.runId, environment.runAttempt)
  } catch {
    return {kind: 'rejected', reason: 'output-write-failed'}
  }
  return resultFromPlan('scheduled', plan, Buffer.byteLength(serialized, 'utf8'))
}

export const runPrepareDiscovery = async (input: RunPrepareDiscoveryInput): Promise<PrepareDiscoveryResult> => {
  if (!isSafePath(input.eventFile) || !isSafePath(input.out) || input.eventFile === input.out)
    return {kind: 'rejected', reason: 'unsafe-path'}
  const eventName = input.env.GITHUB_EVENT_NAME
  if (typeof eventName !== 'string' || !isSafeText(eventName, 100))
    return {kind: 'rejected', reason: 'invalid-environment'}
  const rawEvent = readEvent(input.fs, input.eventFile)
  if (!rawEvent.ok) return rawEvent.result
  const route = parseLiveAuditEvent(eventName, rawEvent.value)
  if (route.kind === 'ignored') return route
  const environment = parseEnvironment(input.env)
  if (!environment) return {kind: 'rejected', reason: 'invalid-environment'}
  const now = input.clock()
  if (Number.isNaN(now.getTime())) return {kind: 'rejected', reason: 'invalid-clock'}
  if (route.kind === 'manual-candidate') return manualPlan(route, environment, input)
  return scheduledPlan(route, environment, input)
}

export const parsePrepareArgs = (argv: readonly string[]): PrepareDiscoveryArgs => {
  const parsed = parseArgs({
    args: [...argv],
    options: {
      'event-file': {type: 'string'},
      out: {type: 'string'},
    },
    strict: true,
    allowPositionals: false,
    tokens: true,
  })
  const eventFileCount = parsed.tokens.filter(token => token.kind === 'option' && token.name === 'event-file').length
  const outCount = parsed.tokens.filter(token => token.kind === 'option' && token.name === 'out').length
  const eventFile = parsed.values['event-file']
  const out = parsed.values.out
  if (eventFileCount !== 1 || outCount !== 1 || typeof eventFile !== 'string' || typeof out !== 'string')
    throw new Error('invalid prepare discovery arguments')
  return {eventFile, out}
}

export const main = async (
  argv: readonly string[] = process.argv.slice(2),
  env: Readonly<Record<string, string | undefined>> = process.env,
  fileSystem: PrepareDiscoveryFileSystem = defaultFileSystem,
  clock: () => Date = () => new Date(),
  runner: GhRunner = createGhRunner(),
): Promise<PrepareDiscoveryResult> => {
  let args: PrepareDiscoveryArgs
  try {
    args = parsePrepareArgs(argv)
  } catch {
    return {kind: 'rejected', reason: 'invalid-arguments'}
  }
  return runPrepareDiscovery({
    eventFile: args.eventFile,
    out: args.out,
    env,
    fs: fileSystem,
    clock,
    runner,
  })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(result => {
    console.log(JSON.stringify(result))
    if (result.kind === 'rejected') process.exitCode = 1
  })
}
