import type {AuditAction, AuditVariant} from '../../scripts/live-audit/contract'
import type {GhCommandResult, GhRunner, GitHubIssue} from '../../scripts/live-audit/github-runner'
import {Buffer} from 'node:buffer'
import {describe, expect, it} from 'vitest'
import {findingFingerprint, variantKey} from '../../scripts/live-audit/identity'
import {renderIssueLedger, type IssueLedger} from '../../scripts/live-audit/issue-ledger'
import {
  MAX_EVENT_BYTES,
  parsePrepareArgs,
  runPrepareDiscovery,
  type PrepareDiscoveryFileSystem,
} from '../../scripts/live-audit/prepare-discovery'
import {parseReplayPlanJson} from '../../scripts/live-audit/replay-plan'

const generatedAt = '2026-07-24T03:30:00.000Z'
const env = (eventName: string): Record<string, string> => ({
  GITHUB_EVENT_NAME: eventName,
  GITHUB_REPOSITORY: 'example/repo',
  GITHUB_RUN_ID: '12345',
  GITHUB_RUN_ATTEMPT: '1',
  GH_TOKEN: 'secret-token',
})

const result = (stdout: string): GhCommandResult => ({stdout, stderr: '', exitCode: 0})

const issue = (number: number, body: string, labels: readonly string[] = ['visual-audit']): GitHubIssue => ({
  number,
  title: `Finding ${number}`,
  body,
  state: 'open',
  stateReason: null,
  labels,
  comments: 0,
  updatedAt: generatedAt,
})

const rawIssue = (value: GitHubIssue): Record<string, unknown> => ({
  number: value.number,
  title: value.title,
  body: value.body,
  state: value.state,
  state_reason: value.stateReason,
  comments: value.comments,
  updated_at: value.updatedAt,
  labels: value.labels.map(name => ({name})),
})

const makeLedger = (
  variants: readonly AuditVariant[] = [
    {viewport: 'mobile', theme: {kind: 'preset', presetId: 'dracula'}, state: 'core'},
  ],
): IssueLedger => {
  const fingerprint = findingFingerprint({route: '/projects', semanticTarget: 'card', failureSignature: 'broken image'})
  const keys = variants.map(variantKey)
  const actions: AuditAction[] = [{version: 1, kind: 'click', target: {kind: 'test-id', value: 'project-card-image'}}]
  return {
    version: 1,
    fingerprint,
    route: '/projects',
    semanticTarget: 'card',
    findingClass: 'broken-image',
    assertion: {version: 1, kind: 'image-load', expected: 'loaded'},
    actions,
    responsive: 'not-applicable',
    failureSignature: 'broken image',
    variants: variants.map((variant, index) => ({
      key: keys[index] ?? '',
      viewport: variant.viewport,
      theme: variant.theme,
      state: variant.state,
      cleanCount: 0,
    })),
    replay: variants.map((_, index) => ({
      variantKey: keys[index] ?? '',
      target: {kind: 'test-id', value: 'project-card-image'},
      assertion: {version: 1, kind: 'image-load', expected: 'loaded'},
      actions,
      reproduction: ['Open projects'],
    })),
    operations: [{key: 'issue-op', checkpoint: 'issue', completedAt: generatedAt}],
    transition: {kind: 'open', source: 'reporter'},
  }
}

const manualEvent = (body = '@fro-bot validate #42'): Record<string, unknown> => ({
  action: 'created',
  issue: {number: 42},
  comment: {
    body,
    author_association: 'MEMBER',
    user: {login: 'alice', type: 'User'},
  },
})

const scheduleEvent = (schedule: string): Record<string, unknown> => ({schedule})

const workflowDispatchEvent = (mode: string, schedule?: unknown): Record<string, unknown> => ({
  inputs: {
    mode,
    ...(schedule === undefined ? {} : {'live-audit-slot': schedule}),
  },
})

const memoryFs = (
  initial: Record<string, Uint8Array | string> = {},
): PrepareDiscoveryFileSystem & {
  files: Map<string, Uint8Array>
  failRename: boolean
} => {
  const files = new Map(Object.entries(initial).map(([path, value]) => [path, Buffer.from(value)]))
  const memory: PrepareDiscoveryFileSystem & {files: Map<string, Uint8Array>; failRename: boolean} = {
    files,
    failRename: false,
    readFileSync: (path: string) => {
      const value = files.get(path)
      if (!value) throw new Error('missing file')
      return Buffer.from(value)
    },
    writeFileSync: (path: string, data: string | Uint8Array) => {
      files.set(path, Buffer.from(data))
    },
    renameSync: (from: string, to: string) => {
      if (memory.failRename) throw new Error('rename failed')
      const value = files.get(from)
      if (!value) throw new Error('missing temp file')
      files.set(to, value)
      files.delete(from)
    },
    unlinkSync: (path: string) => {
      files.delete(path)
    },
  }
  return memory
}

const runnerFor = (options: {
  readonly permission?: string
  readonly permissionError?: Error
  readonly issue?: GitHubIssue
  readonly visualIssues?: readonly GitHubIssue[]
  readonly suppressedIssues?: readonly GitHubIssue[]
}) => {
  const calls: string[][] = []
  const runner: GhRunner = {
    run: async args => {
      calls.push([...args])
      const command = args[1] ?? ''
      if (command.endsWith('/collaborators/alice/permission')) {
        if (options.permissionError) throw options.permissionError
        return result(JSON.stringify({permission: options.permission ?? 'write'}))
      }
      if (/\/issues\/\d+$/.test(command)) return result(JSON.stringify(rawIssue(options.issue ?? issue(42, ''))))
      if (command.includes('labels=visual-audit-suppressed'))
        return result(JSON.stringify([(options.suppressedIssues ?? []).map(rawIssue)]))
      if (command.includes('labels=visual-audit'))
        return result(JSON.stringify([(options.visualIssues ?? []).map(rawIssue)]))
      throw new Error(`unexpected GitHub call: ${command}`)
    },
  }
  return {runner, calls}
}

const prepare = async (input: {
  readonly eventName: string
  readonly event: unknown
  readonly out?: string
  readonly fs?: ReturnType<typeof memoryFs>
  readonly runner?: GhRunner
  readonly envOverrides?: Record<string, string | undefined>
  readonly clock?: Date
}) => {
  const fileSystem = input.fs ?? memoryFs()
  const eventFile = '/event.json'
  fileSystem.files.set(eventFile, Buffer.from(JSON.stringify(input.event)))
  const outputPath = input.out ?? '/replay-plan.json'
  const eventSchedule =
    input.eventName === 'schedule' &&
    typeof input.event === 'object' &&
    input.event !== null &&
    'schedule' in input.event &&
    typeof input.event.schedule === 'string'
      ? input.event.schedule
      : input.eventName === 'workflow_dispatch' &&
          typeof input.event === 'object' &&
          input.event !== null &&
          'inputs' in input.event &&
          typeof input.event.inputs === 'object' &&
          input.event.inputs !== null &&
          'live-audit-slot' in input.event.inputs &&
          typeof input.event.inputs['live-audit-slot'] === 'string'
        ? input.event.inputs['live-audit-slot']
        : undefined
  const result = await runPrepareDiscovery({
    eventFile,
    out: outputPath,
    env: {...env(input.eventName), ...input.envOverrides},
    fs: fileSystem,
    clock: () => input.clock ?? new Date(eventSchedule === '30 15 * * *' ? '2026-07-24T15:30:00.000Z' : generatedAt),
    runner: input.runner ?? runnerFor({}).runner,
  })
  return {fileSystem, outputPath, result}
}

describe('prepare-discovery CLI and preflight', () => {
  it('parses exactly the two required CLI arguments and rejects unknown, duplicate, missing, and positional args', () => {
    expect(parsePrepareArgs(['--event-file', 'event.json', '--out', 'replay-plan.json'])).toEqual({
      eventFile: 'event.json',
      out: 'replay-plan.json',
    })
    expect(() => parsePrepareArgs(['--event-file', 'event.json', '--out', 'a', '--out', 'b'])).toThrow()
    expect(() => parsePrepareArgs(['--event-file', 'event.json'])).toThrow()
    expect(() => parsePrepareArgs(['--event-file', 'event.json', '--out', 'plan', '--unknown'])).toThrow()
    expect(() => parsePrepareArgs(['--event-file', 'event.json', '--out', 'plan', 'stdin'])).toThrow()
  })

  it.each(['30 3 * * *', '30 15 * * *'])(
    'routes exact scheduled cron %s and writes a canonical plan',
    async schedule => {
      const {result: outcome, fileSystem} = await prepare({
        eventName: 'schedule',
        event: scheduleEvent(schedule),
        runner: runnerFor({visualIssues: [issue(42, renderIssueLedger(makeLedger()))]}).runner,
      })
      expect(outcome.kind).toBe('written')
      if (outcome.kind === 'written') expect(outcome.issueNumbers).toEqual([42])
      expect(fileSystem.files.has('/replay-plan.json')).toBe(true)
    },
  )

  it.each(['30 3 * * *', '30 15 * * *'])(
    'routes live-audit workflow dispatch slot %s and writes the canonical scheduled plan',
    async schedule => {
      const {result: outcome, fileSystem} = await prepare({
        eventName: 'workflow_dispatch',
        event: workflowDispatchEvent('live-audit', schedule),
        clock: new Date('2026-07-24T12:00:00.000Z'),
        runner: runnerFor({visualIssues: [issue(42, renderIssueLedger(makeLedger()))]}).runner,
      })
      expect(outcome.kind).toBe('written')
      if (outcome.kind === 'written') expect(outcome.runKind).toBe('scheduled')
      const plan = parseReplayPlanJson(fileSystem.files.get('/replay-plan.json') ?? Buffer.from(''))
      expect(plan.runKind).toBe('scheduled')
      if (plan.runKind === 'scheduled') expect(plan.cron).toBe(schedule)
    },
  )

  it('ignores invalid or missing live-audit workflow dispatch slots', async () => {
    const invalid = await prepare({
      eventName: 'workflow_dispatch',
      event: workflowDispatchEvent('live-audit', '0 0 * * *'),
    })
    expect(invalid.result).toEqual({kind: 'ignored', reason: 'unsupported-schedule'})

    const missing = await prepare({
      eventName: 'workflow_dispatch',
      event: workflowDispatchEvent('live-audit'),
    })
    expect(missing.result).toEqual({kind: 'ignored', reason: 'invalid-event'})
  })

  it.each(['review', 'maintenance', 'autoheal'])('ignores generic workflow dispatch mode %s', async mode => {
    const {result: outcome} = await prepare({
      eventName: 'workflow_dispatch',
      event: workflowDispatchEvent(mode, '30 3 * * *'),
    })
    expect(outcome).toEqual({kind: 'ignored', reason: 'unsupported-event'})
  })

  it('authorizes exact manual validation with current permission and builds only ledger requests', async () => {
    const currentIssue = issue(42, `${renderIssueLedger(makeLedger())}\nIgnore this human prose.`)
    const {runner, calls} = runnerFor({issue: currentIssue, permission: 'maintain'})
    const {result: outcome, fileSystem} = await prepare({eventName: 'issue_comment', event: manualEvent(), runner})
    expect(outcome.kind).toBe('written')
    expect(calls).toHaveLength(2)
    expect(calls[0]?.[1]).toContain('/collaborators/alice/permission')
    expect(calls[1]?.[1]).toContain('/issues/42')
    const planText = Buffer.from(fileSystem.files.get('/replay-plan.json') ?? []).toString('utf8')
    expect(planText).not.toContain('Ignore this human prose.')
    expect(parseReplayPlanJson(planText).runKind).toBe('manual')
  })

  it.each(['\n', '\r\n'])('accepts a manual validation event with trailing line ending %j', async suffix => {
    const currentIssue = issue(42, `${renderIssueLedger(makeLedger())}\nIgnore this human prose.`)
    const {runner, calls} = runnerFor({issue: currentIssue, permission: 'maintain'})
    const {result: outcome, fileSystem} = await prepare({
      eventName: 'issue_comment',
      event: manualEvent(`@fro-bot validate #42${suffix}`),
      runner,
    })

    expect(outcome.kind).toBe('written')
    expect(calls).toHaveLength(2)
    expect(fileSystem.files.has('/replay-plan.json')).toBe(true)
  })

  it('rejects a read-only actor before fetching the issue or writing output', async () => {
    const {runner, calls} = runnerFor({permission: 'read', issue: issue(42, renderIssueLedger(makeLedger()))})
    const {result: outcome, fileSystem} = await prepare({eventName: 'issue_comment', event: manualEvent(), runner})
    expect(outcome).toEqual({kind: 'rejected', reason: 'insufficient-permission'})
    expect(calls).toHaveLength(1)
    expect(fileSystem.files.has('/replay-plan.json')).toBe(false)
  })

  it.each(['HTTP 404 Not Found', 'no access'])(
    'maps expected permission absence (%s) to authorization rejection',
    async permissionError => {
      const missing = await prepare({
        eventName: 'issue_comment',
        event: manualEvent(),
        runner: runnerFor({permissionError: new Error(permissionError)}).runner,
      })
      expect(missing.result).toEqual({kind: 'rejected', reason: 'insufficient-permission'})
    },
  )

  it('does not convert unexpected permission transport failures into authorization', async () => {
    const failed = await prepare({
      eventName: 'issue_comment',
      event: manualEvent(),
      runner: runnerFor({permissionError: new Error('network unavailable')}).runner,
    })
    expect(failed.result).toEqual({kind: 'rejected', reason: 'permission-check-failed'})
  })

  it.each([
    ['pull request', {issue: {number: 42, pull_request: {url: 'https://github.com/example/repo/pull/42'}}}],
    ['near match', {comment: {body: '@fro-bot validate #42 now'}}],
    ['bot', {comment: {user: {login: 'alice[bot]', type: 'User'}}}],
  ])('ignores %s before GitHub calls', async (_label, eventOverrides) => {
    const {runner, calls} = runnerFor({})
    const event = {...manualEvent(), ...eventOverrides}
    const {result: outcome, fileSystem} = await prepare({eventName: 'issue_comment', event, runner})
    expect(outcome.kind).toBe('ignored')
    expect(calls).toHaveLength(0)
    expect(fileSystem.files.has('/replay-plan.json')).toBe(false)
  })

  it('requires the manual visual-audit label and excludes explicit suppression', async () => {
    const missingLabel = await prepare({
      eventName: 'issue_comment',
      event: manualEvent(),
      runner: runnerFor({issue: issue(42, renderIssueLedger(makeLedger()), ['other'])}).runner,
    })
    expect(missingLabel.result).toEqual({kind: 'rejected', reason: 'missing-visual-audit-label'})
    const suppressed = await prepare({
      eventName: 'issue_comment',
      event: manualEvent(),
      runner: runnerFor({
        issue: issue(42, renderIssueLedger(makeLedger()), ['visual-audit', 'visual-audit-suppressed']),
      }).runner,
    })
    expect(suppressed.result).toEqual({kind: 'rejected', reason: 'suppressed'})
  })

  it('enumerates the bounded union, excludes suppressed issues, rejects malformed ledgers and duplicate fingerprints', async () => {
    const valid = issue(42, renderIssueLedger(makeLedger()))
    const suppressed = issue(43, renderIssueLedger(makeLedger()), ['visual-audit', 'visual-audit-suppressed'])
    const scheduled = await prepare({
      eventName: 'schedule',
      event: scheduleEvent('30 3 * * *'),
      runner: runnerFor({visualIssues: [valid, suppressed], suppressedIssues: [suppressed]}).runner,
    })
    expect(scheduled.result.kind).toBe('written')
    if (scheduled.result.kind === 'written') expect(scheduled.result.issueNumbers).toEqual([42])
    const malformed = await prepare({
      eventName: 'schedule',
      event: scheduleEvent('30 3 * * *'),
      runner: runnerFor({visualIssues: [issue(42, 'not a ledger')]}).runner,
    })
    expect(malformed.result).toEqual({kind: 'rejected', reason: 'invalid-ledger'})
    const duplicate = await prepare({
      eventName: 'schedule',
      event: scheduleEvent('30 3 * * *'),
      runner: runnerFor({visualIssues: [valid, issue(43, renderIssueLedger(makeLedger()))]}).runner,
    })
    expect(duplicate.result).toEqual({kind: 'rejected', reason: 'duplicate-fingerprint'})
  })

  it('includes every active variant, including reporter-closed recurrence candidates', async () => {
    const variants: AuditVariant[] = [
      {viewport: 'mobile', theme: {kind: 'preset', presetId: 'dracula'}, state: 'core'},
      {viewport: 'desktop', theme: {kind: 'mode', mode: 'dark'}, state: 'core'},
    ]
    const ledger = {
      ...makeLedger(variants),
      operations: [
        {key: 'issue-op', checkpoint: 'issue', completedAt: generatedAt},
        {key: 'close-op', checkpoint: 'transition', completedAt: generatedAt},
      ],
      transition: {kind: 'closed', source: 'reporter', operationKey: 'close-op', completedAt: generatedAt},
    } satisfies IssueLedger
    const outcome = await prepare({
      eventName: 'schedule',
      event: scheduleEvent('30 3 * * *'),
      runner: runnerFor({visualIssues: [issue(42, renderIssueLedger(ledger))]}).runner,
    })
    expect(outcome.result.kind).toBe('written')
    if (outcome.result.kind === 'written') expect(outcome.result.activeVariants).toBe(2)
  })

  it('rejects traversal and oversized event/output paths before GitHub calls', async () => {
    const {runner, calls} = runnerFor({})
    const traversal = await prepare({
      eventName: 'schedule',
      event: scheduleEvent('30 3 * * *'),
      out: '../plan.json',
      runner,
    })
    expect(traversal.result).toEqual({kind: 'rejected', reason: 'unsafe-path'})
    const oversized = await prepare({
      eventName: 'schedule',
      event: `${'x'.repeat(MAX_EVENT_BYTES)}${JSON.stringify(scheduleEvent('30 3 * * *'))}`,
      runner,
    })
    expect(oversized.result).toEqual({kind: 'rejected', reason: 'event-too-large'})
    expect(calls).toHaveLength(0)
  })

  it('produces deterministic bytes for the same clock and inputs', async () => {
    const runnerOptions = {visualIssues: [issue(42, renderIssueLedger(makeLedger()))]}
    const first = await prepare({
      eventName: 'schedule',
      event: scheduleEvent('30 3 * * *'),
      runner: runnerFor(runnerOptions).runner,
    })
    const second = await prepare({
      eventName: 'schedule',
      event: scheduleEvent('30 3 * * *'),
      runner: runnerFor(runnerOptions).runner,
    })
    expect(Buffer.from(first.fileSystem.files.get('/replay-plan.json') ?? [])).toEqual(
      Buffer.from(second.fileSystem.files.get('/replay-plan.json') ?? []),
    )
  })

  it('leaves no partial output when atomic rename fails', async () => {
    const fileSystem = memoryFs({'/replay-plan.json': 'old'})
    fileSystem.failRename = true
    const outcome = await prepare({
      eventName: 'schedule',
      event: scheduleEvent('30 3 * * *'),
      fs: fileSystem,
      runner: runnerFor({visualIssues: [issue(42, renderIssueLedger(makeLedger()))]}).runner,
    })
    expect(outcome.result).toEqual({kind: 'rejected', reason: 'output-write-failed'})
    expect(Buffer.from(fileSystem.files.get('/replay-plan.json') ?? [])).toEqual(Buffer.from('old'))
    const remainingPaths = [...fileSystem.files.keys()].sort()
    expect(remainingPaths).toEqual(['/event.json', '/replay-plan.json'])
    expect(remainingPaths.filter(path => path.endsWith('.tmp'))).toEqual([])
  })
})
