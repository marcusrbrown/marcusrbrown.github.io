import type {
  AuditAction,
  AuditManifest,
  EvidenceReference,
  Finding,
  ValidationClean,
} from '../../scripts/live-audit/contract'
import type {GhCommandResult, GhRunner} from '../../scripts/live-audit/github-runner'
import {Buffer} from 'node:buffer'
import {createHash} from 'node:crypto'
import * as fs from 'node:fs'
import {mkdirSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it, vi} from 'vitest'
import {computeEvidenceIntegrity} from '../../scripts/live-audit/evidence'
import {findingFingerprint, operationKey, variantKey} from '../../scripts/live-audit/identity'
import {
  parseIssueLedger,
  renderIssueLedger,
  type IssueLedger,
  type LedgerReplay,
} from '../../scripts/live-audit/issue-ledger'
import {evidenceAssetName} from '../../scripts/live-audit/release-evidence'
import {
  classifyReporterError,
  decideAudit,
  reportAudit,
  validateReporterArtifact,
} from '../../scripts/live-audit/reporter'

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)
const digest = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')
const repo = {owner: 'example', repo: 'repo'}
const workflowRunUrl = 'https://github.com/example/repo/actions/runs/123456'

const ref = (role: 'context' | 'crop', path: string, bytes = png): EvidenceReference => ({
  role,
  path,
  alt: `${role} image`,
  caption: `${role} evidence`,
  integrity: computeEvidenceIntegrity(path, bytes),
})

const evidencePair = (contextPath: string, cropPath: string): [EvidenceReference, EvidenceReference] => [
  ref('context', contextPath),
  ref('crop', cropPath),
]

const makeFinding = (overrides: Partial<Finding> = {}): Finding => {
  const base = {
    route: '/projects',
    findingClass: 'broken-image',
    responsive: 'not-applicable',
    semanticTarget: 'project-card-image',
    target: {kind: 'test-id', value: 'project-card-1'},
    assertion: {version: 1, kind: 'image-load', expected: 'loaded'},
    actions: [],
    failureSignature: 'broken image',
    description: 'Broken project image',
    reproduction: ['Open projects'],
    variant: {viewport: 'mobile', theme: {kind: 'preset', presetId: 'dracula'}, state: 'default'},
    observations: [
      {kind: 'candidate', status: 'failure', signature: 'broken image', observedAt: '2026-07-20T03:30:00.000Z'},
      {kind: 'replay', status: 'failure', signature: 'broken image', observedAt: '2026-07-20T03:30:00.000Z'},
    ],
    evidence: evidencePair('evidence/context.png', 'evidence/crop.png'),
  } satisfies Finding
  return {...base, ...overrides} as Finding
}

interface ManifestOverrides {
  readonly runId?: string
  readonly runKind?: 'manual' | 'scheduled'
  readonly issueNumber?: number
  readonly findings?: Finding[]
  readonly validations?: AuditManifest['validations']
}
const manifestFor = (overrides: ManifestOverrides = {}): AuditManifest => {
  const common = {
    version: 1 as const,
    runId: overrides.runId ?? 'run-reporter-1',
    generatedAt: '2026-07-20T03:30:00.000Z',
    findings: overrides.findings ?? [makeFinding()],
    validations: overrides.validations ?? [],
  }
  return overrides.runKind === 'manual'
    ? {...common, runKind: 'manual', issueNumber: overrides.issueNumber ?? 204}
    : {...common, runKind: 'scheduled', rotatingPresetId: 'dracula'}
}

const validationFor = (finding: Finding, issueNumber = 204): ValidationClean => ({
  status: 'clean',
  issueNumber,
  fingerprint: findingFingerprint(finding),
  variantKey: variantKey(finding.variant),
  route: finding.route,
  semanticTarget: finding.semanticTarget,
  findingClass: finding.findingClass,
  failureSignature: finding.failureSignature,
  assertion: finding.assertion,
  actions: finding.actions,
  variant: finding.variant,
  target: finding.target,
  observedAt: '2026-07-20T03:30:00.000Z',
  evidence: evidencePair('evidence/context.png', 'evidence/crop.png'),
})

const rootFor = (
  files: Record<string, Uint8Array> = {
    'evidence/context.png': png,
    'evidence/crop.png': png,
  },
): string => {
  const root = mkdtempSync(join(tmpdir(), 'live-audit-reporter-'))
  for (const [path, bytes] of Object.entries(files)) {
    const fullPath = join(root, path)
    mkdirSync(join(fullPath, '..'), {recursive: true})
    writeFileSync(fullPath, bytes)
  }
  return root
}

const rawIssue = (input: {
  number: number
  body: string | null
  state?: 'open' | 'closed'
  reason?: string | null
  labels?: readonly string[]
}) => ({
  number: input.number,
  title: 'audit',
  body: input.body,
  state: input.state ?? 'open',
  state_reason: input.reason ?? null,
  labels: (input.labels ?? ['visual-audit']).map(name => ({name})),
  comments: 0,
  updated_at: '2026-07-20T03:30:00Z',
})

type LedgerReplayFixture = Omit<LedgerReplay, 'actions'> & {readonly actions?: AuditAction[]}
type LedgerFixtureOverrides = Omit<Partial<IssueLedger>, 'actions' | 'replay'> & {
  readonly actions?: AuditAction[]
  readonly replay?: readonly LedgerReplayFixture[]
}

const ledgerFor = (finding: Finding, overrides: LedgerFixtureOverrides = {}): IssueLedger => {
  const actions = overrides.actions ?? finding.actions
  const replay = (
    overrides.replay ?? [
      {
        variantKey: variantKey(finding.variant),
        target: finding.target,
        assertion: finding.assertion,
        reproduction: finding.reproduction,
      },
    ]
  ).map(item => ({...item, actions: item.actions ?? actions}))
  return {
    version: 1,
    fingerprint: findingFingerprint(finding),
    route: finding.route,
    semanticTarget: finding.semanticTarget,
    findingClass: finding.findingClass,
    assertion: finding.assertion,
    responsive: finding.responsive,
    failureSignature: finding.failureSignature,
    variants: [
      {
        key: variantKey(finding.variant),
        viewport: finding.variant.viewport,
        theme: finding.variant.theme,
        state: finding.variant.state,
        cleanCount: 0,
      },
    ],
    operations: [],
    transition: {kind: 'open', source: 'reporter'},
    ...overrides,
    actions,
    replay,
  }
}

interface MemoryOptions {
  readonly issue?: ReturnType<typeof rawIssue>
  readonly issues?: readonly ReturnType<typeof rawIssue>[]
  readonly release?: boolean
  readonly assets?: readonly Record<string, unknown>[]
  readonly closeEvents?: readonly Record<string, unknown>[]
  readonly onIssueRead?: (issue: ReturnType<typeof rawIssue>, count: number) => void
  readonly onIssueList?: (issues: ReturnType<typeof rawIssue>[], label: string, count: number) => void
  readonly onAssetList?: (assets: Record<string, unknown>[], count: number) => void
  readonly onBodyPatch?: (issue: ReturnType<typeof rawIssue>) => void
  readonly comments?: readonly {body: string; actor: string; createdAt?: string}[]
  readonly failReopenOnce?: boolean
  readonly failCommentOnce?: boolean
}

const memoryGithub = (options: MemoryOptions = {}) => {
  let issue = options.issue
  const issues = [...(options.issues ?? (issue ? [issue] : []))]
  const comments: {body: string; user: {login: string}; id: number; created_at: string}[] = (
    options.comments ?? []
  ).map((comment, index) => ({
    body: comment.body,
    user: {login: comment.actor},
    id: index + 1,
    created_at: comment.createdAt ?? '2026-07-20T03:30:00Z',
  }))
  const assets = [...(options.assets ?? [])]
  const writes: string[] = []
  let issueReadCount = 0
  let issueListCount = 0
  let assetListCount = 0
  let failReopenOnce = options.failReopenOnce ?? false
  let releaseExists = options.release ?? true
  let failComment = options.failCommentOnce ?? false
  const release = () => ({
    id: 42,
    tag_name: 'live-audit-evidence',
    upload_url: 'https://uploads.github.com/example',
    draft: false,
    prerelease: false,
    assets,
  })
  const run = vi.fn(
    async (args: readonly string[], runOptions?: {readonly input?: string}): Promise<GhCommandResult> => {
      const endpoint = args[1] ?? ''
      if (endpoint.includes('/releases/tags/'))
        return releaseExists
          ? {stdout: JSON.stringify(release()), stderr: '', exitCode: 0}
          : {stdout: '', stderr: '404', exitCode: 1}
      if (endpoint.endsWith('/releases') && args.includes('POST')) {
        releaseExists = true
        writes.push('release-create')
        return {stdout: JSON.stringify(release()), stderr: '', exitCode: 0}
      }
      if (endpoint.endsWith('/assets') && args[0] === 'api') {
        assetListCount += 1
        options.onAssetList?.(assets, assetListCount)
        return {stdout: JSON.stringify([assets]), stderr: '', exitCode: 0}
      }
      if (args[0] === 'release' && args[1] === 'upload') {
        const path = args[3] ?? ''
        const name = path.split('/').at(-1) ?? ''
        const bytes = readFileSync(path)
        const asset = {
          id: assets.length + 1,
          name,
          state: 'uploaded',
          size: bytes.length,
          content_type: 'image/png',
          digest: `sha256:${digest(bytes)}`,
          browser_download_url: `https://github.com/example/repo/releases/download/live-audit-evidence/${name}`,
        }
        const existingIndex = assets.findIndex(candidate => candidate.name === name)
        if (existingIndex === -1) {
          assets.push(asset)
        } else {
          assets.splice(existingIndex, 1, asset)
        }
        writes.push('asset-upload')
        return {stdout: '', stderr: '', exitCode: 0}
      }
      if (endpoint.includes('/releases/assets/') && args.includes('DELETE')) {
        const id = Number(endpoint.split('/').at(-1))
        const index = assets.findIndex(candidate => candidate.id === id)
        if (index !== -1) assets.splice(index, 1)
        writes.push('asset-delete')
        return {stdout: '', stderr: '', exitCode: 0}
      }
      if (endpoint.includes('/issues?labels=')) {
        const state = endpoint.includes('state=closed') ? 'closed' : 'open'
        const label = decodeURIComponent(endpoint.split('labels=')[1]?.split('&')[0] ?? '')
        issueListCount += 1
        options.onIssueList?.(issues, label, issueListCount)
        return {
          stdout: JSON.stringify([
            issues.filter(candidate => candidate.state === state && candidate.labels.some(item => item.name === label)),
          ]),
          stderr: '',
          exitCode: 0,
        }
      }
      const issueMatch = endpoint.match(/\/issues\/(\d+)(?:\/|$)/)
      if (issueMatch && endpoint.endsWith('/events'))
        return {stdout: JSON.stringify([options.closeEvents ?? []]), stderr: '', exitCode: 0}
      if (issueMatch && endpoint.endsWith('/comments')) {
        if (args.includes('POST')) {
          if (failComment) {
            failComment = false
            return {stdout: '', stderr: 'injected comment failure', exitCode: 1}
          }
          const body = JSON.parse(runOptions?.input ?? '{}').body as string
          comments.push({
            body,
            id: comments.length + 1,
            user: {login: 'reporter-bot'},
            created_at: '2026-07-20T03:30:00Z',
          })
          writes.push('comment')
          return {stdout: '{}', stderr: '', exitCode: 0}
        }
        return {stdout: JSON.stringify([comments]), stderr: '', exitCode: 0}
      }
      if (endpoint.endsWith('/issues') && args.includes('POST')) {
        const input = JSON.parse(runOptions?.input ?? '{}') as {title: string; body: string; labels: string[]}
        issue = rawIssue({number: 204, body: input.body})
        issues.push(issue)
        writes.push('issue-create')
        return {stdout: JSON.stringify(issue), stderr: '', exitCode: 0}
      }
      if (issueMatch) {
        if (!issue) throw new Error('issue missing')
        if (args.includes('PATCH')) {
          const input = JSON.parse(runOptions?.input ?? '{}') as {
            body?: string
            state?: 'open' | 'closed'
            state_reason?: string
          }
          if (input.body !== undefined) {
            issue.body = input.body
            writes.push('body-update')
            options.onBodyPatch?.(issue)
          }
          if (input.state !== undefined) {
            if (input.state === 'open' && failReopenOnce) {
              failReopenOnce = false
              return {stdout: '', stderr: 'injected reopen failure', exitCode: 1}
            }
            issue.state = input.state
            issue.state_reason = input.state_reason ?? null
            writes.push(input.state === 'open' ? 'reopen' : 'close')
          }
          return {stdout: JSON.stringify(issue), stderr: '', exitCode: 0}
        }
        issueReadCount += 1
        options.onIssueRead?.(issue, issueReadCount)
        return {stdout: JSON.stringify(issue), stderr: '', exitCode: 0}
      }
      return {stdout: '{}', stderr: '', exitCode: 0}
    },
  )
  return {runner: {run} satisfies GhRunner, getIssue: () => issue, comments, assets, writes}
}

const depsFor = (
  artifactRoot: string,
  memory: ReturnType<typeof memoryGithub>,
  mode: 'disabled' | 'manual-only' | 'enabled' = 'enabled',
) => ({
  artifactRoot,
  repository: repo,
  runner: memory.runner,
  verifyPublicImage: vi.fn(async (url: string) => ({ok: true, sha256: digest(png), reason: url})),
  workflowRunUrl,
  writeMode: mode,
  reporterActor: 'reporter-bot',
  now: () => new Date('2026-07-20T03:30:00.000Z'),
})

describe('reporter sealed artifact boundary', () => {
  it('rejects an oversized sparse evidence file before reading payload or calling GitHub', async () => {
    const root = rootFor()
    const sparsePath = join(root, 'evidence/context.png')
    fs.truncateSync(sparsePath, 5_000_001)
    fs.chmodSync(sparsePath, 0o000)
    try {
      const memory = memoryGithub()
      await expect(
        reportAudit({manifest: manifestFor(), ...depsFor(root, memory), writeMode: 'disabled'}),
      ).rejects.toThrow(/size|large|bounded/)
      expect(memory.runner.run).not.toHaveBeenCalled()
    } finally {
      fs.chmodSync(sparsePath, 0o600)
    }
  })

  it('rejects truncated, hash, dimension, byte-size, extra, and missing integrity metadata before GitHub', async () => {
    const root = rootFor()
    const good = manifestFor()
    const current = depsFor(root, memoryGithub(), 'disabled')
    expect(validateReporterArtifact({manifest: good, artifactRoot: root}).evidence.size).toBe(2)
    for (const mutate of [
      (reference: EvidenceReference) => ({...reference, integrity: {...reference.integrity, sha256: '0'.repeat(64)}}),
      (reference: EvidenceReference) => ({...reference, integrity: {...reference.integrity, width: 2}}),
      (reference: EvidenceReference) => ({
        ...reference,
        integrity: {...reference.integrity, bytes: reference.integrity.bytes + 1},
      }),
      (reference: EvidenceReference) => ({...reference, integrity: {...reference.integrity, path: 'other.png'}}),
      (reference: EvidenceReference) => ({...reference, integrity: {...reference.integrity, extra: true}}),
    ]) {
      const finding = makeFinding({evidence: [mutate(makeFinding().evidence[0]), makeFinding().evidence[1]]})
      await expect(reportAudit({manifest: manifestFor({findings: [finding]}), ...current})).rejects.toThrow(
        /integrity|metadata|PNG/,
      )
      expect(current.runner.run).not.toHaveBeenCalled()
    }
    const missing = structuredClone(good) as unknown as {findings: Record<string, unknown>[]}
    const first = missing.findings[0]
    if (!first) throw new Error('finding missing')
    const evidence = first.evidence as Record<string, unknown>[]
    delete evidence[0]?.integrity
    await expect(reportAudit({manifest: missing, ...current})).rejects.toThrow()
    expect(current.runner.run).not.toHaveBeenCalled()
    writeFileSync(join(root, 'evidence/crop.png'), png.subarray(0, -1))
    await expect(reportAudit({manifest: good, ...current})).rejects.toThrow(/PNG|truncated|incomplete/)
    expect(current.runner.run).not.toHaveBeenCalled()
  })

  it('rejects conflicting terminal outcomes and manual validations for another issue before GitHub', async () => {
    const finding = makeFinding()
    const clean: ValidationClean = {
      status: 'clean' as const,
      issueNumber: 204,
      fingerprint: findingFingerprint(finding),
      variantKey: variantKey(finding.variant),
      route: finding.route,
      semanticTarget: finding.semanticTarget,
      findingClass: finding.findingClass,
      assertion: finding.assertion,
      actions: finding.actions,
      failureSignature: finding.failureSignature,
      variant: finding.variant,
      target: finding.target,
      observedAt: '2026-07-20T03:30:00.000Z',
      evidence: evidencePair('clean/context.png', 'clean/crop.png'),
    }
    const root = rootFor({
      'evidence/context.png': png,
      'evidence/crop.png': png,
      'clean/context.png': png,
      'clean/crop.png': png,
    })
    const current = depsFor(root, memoryGithub(), 'disabled')
    await expect(reportAudit({manifest: manifestFor({validations: [clean]}), ...current})).rejects.toThrow(/conflict/)
    const duplicate = manifestFor({findings: [], validations: [clean, {...clean}]})
    await expect(reportAudit({manifest: duplicate, ...current})).rejects.toThrow(/duplicate/)
    const manual = manifestFor({
      runKind: 'manual',
      issueNumber: 204,
      findings: [],
      validations: [{...clean, issueNumber: 205}],
      runId: 'manual',
    })
    await expect(reportAudit({manifest: manual, ...current})).rejects.toThrow(/manual|enclosing|issue/)
  })

  it('rejects a workflow URL for another repository before GitHub', async () => {
    const current = depsFor(rootFor(), memoryGithub(), 'disabled')
    await expect(
      reportAudit({manifest: manifestFor(), ...current, workflowRunUrl: 'https://github.com/evil/repo/actions/runs/1'}),
    ).rejects.toThrow(/workflow|repository/)
    expect(current.runner.run).not.toHaveBeenCalled()
  })
})

describe('reporter reconciled lifecycle', () => {
  it('treats a suppression-labeled matching issue as visible authority without creating or mutating it', async () => {
    const finding = makeFinding()
    const suppressed = rawIssue({
      number: 204,
      body: renderIssueLedger(ledgerFor(finding)),
      labels: ['visual-audit-suppressed'],
    })
    const memory = memoryGithub({issues: [suppressed], release: false})
    const result = await reportAudit({manifest: manifestFor(), ...depsFor(rootFor(), memory), writeMode: 'disabled'})
    expect(result.operations.filter(operation => operation.kind === 'issue-create')).toHaveLength(0)
    expect(memory.writes).toEqual([])
    expect(
      memory.runner.run.mock.calls.some(call => String(call[0][1]).includes('labels=visual-audit-suppressed')),
    ).toBe(true)
  })

  it('treats pre-planning suppression as authoritative and performs zero enabled writes', async () => {
    const finding = makeFinding()
    const memory = memoryGithub({
      issue: rawIssue({
        number: 204,
        body: renderIssueLedger(ledgerFor(finding)),
        labels: ['visual-audit-suppressed'],
      }),
      release: false,
    })
    const result = await reportAudit({manifest: manifestFor(), ...depsFor(rootFor(), memory)})
    expect(result.writeCount).toBe(0)
    expect(memory.writes).toEqual([])
    expect(result.diagnostics.some(item => item.includes('suppressed'))).toBe(true)
  })

  it('aborts before durable writes when suppression appears after planning', async () => {
    const finding = makeFinding()
    const memory = memoryGithub({
      issue: rawIssue({number: 204, body: renderIssueLedger(ledgerFor(finding))}),
      release: false,
      onIssueRead: (issue, count) => {
        if (count === 1) issue.labels = [{name: 'visual-audit-suppressed'}]
      },
    })
    const result = await reportAudit({manifest: manifestFor(), ...depsFor(rootFor(), memory)})
    expect(result.writeCount).toBe(0)
    expect(memory.writes).toEqual([])
    expect(result.diagnostics.some(item => item.includes('drift'))).toBe(true)
  })

  it('aborts a create race when a matching issue appears in the fresh label snapshot', async () => {
    const finding = makeFinding()
    const memory = memoryGithub({
      release: false,
      onIssueList: (issues, _label, count) => {
        if (count === 3) issues.push(rawIssue({number: 204, body: renderIssueLedger(ledgerFor(finding))}))
      },
    })
    const result = await reportAudit({manifest: manifestFor(), ...depsFor(rootFor(), memory)})
    expect(result.writeCount).toBe(0)
    expect(memory.writes).toEqual([])
    expect(result.diagnostics.some(item => item.includes('race') || item.includes('appeared'))).toBe(true)
  })

  it('groups fresh findings by fingerprint into one issue plan with all variant evidence', async () => {
    const mobile = makeFinding()
    const desktop = makeFinding({
      variant: {...mobile.variant, viewport: 'desktop'},
      evidence: evidencePair('desktop/context.png', 'desktop/crop.png'),
    })
    const root = rootFor({
      'evidence/context.png': png,
      'evidence/crop.png': png,
      'desktop/context.png': png,
      'desktop/crop.png': png,
      'desktop/validate-context.png': png,
      'desktop/validate-crop.png': png,
    })
    const result = await reportAudit({
      manifest: manifestFor({findings: [mobile, desktop]}),
      ...depsFor(root, memoryGithub({release: false}), 'disabled'),
    })
    expect(result.operations.filter(operation => operation.kind === 'issue-create')).toHaveLength(1)
    expect(result.operations.filter(operation => operation.kind === 'asset-upload')).toHaveLength(4)
    const memory = memoryGithub({release: false})
    const enabled = await reportAudit({
      manifest: manifestFor({findings: [mobile, desktop]}),
      ...depsFor(root, memory),
    })
    expect(enabled.writeCount).toBe(6)
    expect(memory.writes.filter(write => write === 'issue-create')).toHaveLength(1)
  })

  it('persists non-empty finding actions through created, updated, and validated ledgers', async () => {
    const createdActions: AuditAction[] = [
      {version: 1, kind: 'click', target: {kind: 'test-id', value: 'project-card-1'}},
      {version: 1, kind: 'press', scope: 'page', key: 'Enter'},
    ]
    const createdFinding = makeFinding({actions: createdActions})
    const memory = memoryGithub()
    const created = await reportAudit({
      manifest: manifestFor({findings: [createdFinding]}),
      ...depsFor(rootFor(), memory),
    })
    expect(created.status).toBe('success')
    const createdLedger = parseIssueLedger(memory.getIssue()?.body ?? '').ledger
    expect(createdLedger.actions).toEqual(createdActions)
    expect(createdLedger.replay[0]?.actions).toEqual(createdActions)

    const updatedActions: AuditAction[] = [
      {
        version: 1,
        kind: 'wait',
        condition: 'visible',
        timeoutMs: 500,
        target: {kind: 'test-id', value: 'project-card-1'},
      },
    ]
    const updatedFinding = makeFinding({actions: updatedActions})
    const updated = await reportAudit({
      manifest: manifestFor({runId: 'actions-update', findings: [updatedFinding]}),
      ...depsFor(rootFor(), memory),
    })
    expect(updated.status).toBe('success')
    const updatedLedger = parseIssueLedger(memory.getIssue()?.body ?? '').ledger
    expect(updatedLedger.actions).toEqual(updatedActions)
    expect(updatedLedger.replay[0]?.actions).toEqual(updatedActions)

    const validation = validationFor(updatedFinding)
    const validated = await reportAudit({
      manifest: manifestFor({runId: 'actions-validation', findings: [], validations: [validation]}),
      ...depsFor(rootFor(), memory),
    })
    expect(validated.status).toBe('success')
    const validatedLedger = parseIssueLedger(memory.getIssue()?.body ?? '').ledger
    expect(validatedLedger.actions).toEqual(updatedActions)
    expect(validatedLedger.replay[0]?.actions).toEqual(updatedActions)
  })

  it('keeps grouped issue and asset operations deterministic across manifest order', async () => {
    const mobile = makeFinding()
    const desktop = makeFinding({
      variant: {...mobile.variant, viewport: 'desktop'},
      evidence: evidencePair('desktop/context.png', 'desktop/crop.png'),
    })
    const root = rootFor({
      'evidence/context.png': png,
      'evidence/crop.png': png,
      'desktop/context.png': png,
      'desktop/crop.png': png,
    })
    const first = await decideAudit({
      manifest: manifestFor({findings: [mobile, desktop]}),
      ...depsFor(root, memoryGithub({release: false}), 'disabled'),
    })
    const second = await decideAudit({
      manifest: manifestFor({findings: [desktop, mobile]}),
      ...depsFor(root, memoryGithub({release: false}), 'disabled'),
    })
    expect(first.operations).toEqual(second.operations)
  })

  it('plans exact release, upload, issue, body, comment, and transition mutations while disabled performs zero writes', async () => {
    const root = rootFor()
    const dryMemory = memoryGithub({release: false})
    const enabledMemory = memoryGithub({release: false})
    const manifest = manifestFor()
    const dry = await reportAudit({manifest, ...depsFor(root, dryMemory, 'disabled')})
    const enabled = await reportAudit({manifest, ...depsFor(root, enabledMemory)})
    expect(dry.operations).toEqual(enabled.operations)
    expect(dryMemory.writes).toEqual([])
    expect(dry.operations.map(operation => operation.kind)).toEqual([
      'release-create',
      'asset-upload',
      'asset-upload',
      'issue-create',
    ])
    expect(dry.writeCount).toBe(0)
    expect(enabled.writeCount).toBe(4)
    const manualOnlyMemory = memoryGithub({release: false})
    const manualOnly = await reportAudit({
      manifest,
      ...depsFor(root, manualOnlyMemory, 'manual-only'),
    })
    expect(manualOnly.operations).toEqual(dry.operations)
    expect(manualOnlyMemory.writes).toEqual([])
  })

  it('makes initial grouped issue creation idempotent while allowing a later report operation comment', async () => {
    const memory = memoryGithub({release: false})
    const manifest = manifestFor()
    const first = await reportAudit({manifest, ...depsFor(rootFor(), memory)})
    const writesAfterCreate = [...memory.writes]
    const retry = await reportAudit({manifest, ...depsFor(rootFor(), memory)})
    expect(first.writeCount).toBe(4)
    expect(retry.writeCount).toBe(0)
    expect(memory.writes).toEqual(writesAfterCreate)
    expect(memory.comments).toHaveLength(0)
    const later = await reportAudit({manifest: {...manifest, runId: 'run-reporter-2'}, ...depsFor(rootFor(), memory)})
    expect(later.writeCount).toBeGreaterThan(0)
    expect(memory.comments).toHaveLength(1)
  })

  it('persists a dedicated initial-create completion checkpoint in the created ledger', async () => {
    const finding = makeFinding()
    const memory = memoryGithub({release: false})
    await reportAudit({manifest: manifestFor({findings: [finding]}), ...depsFor(rootFor(), memory)})
    const ledger = parseIssueLedger(memory.getIssue()?.body ?? '').ledger
    const initialCreateKey = operationKey('run-reporter-1', findingFingerprint(finding), 'group', 'initial-create')
    expect(ledger.operations).toContainEqual({
      key: initialCreateKey,
      checkpoint: 'initial-create',
      completedAt: '2026-07-20T03:30:00.000Z',
    })
  })

  it('retries only a failed repeat evidence comment after the body report checkpoint succeeds', async () => {
    const finding = makeFinding()
    const memory = memoryGithub({release: false, failCommentOnce: true})
    await reportAudit({manifest: manifestFor({findings: [finding]}), ...depsFor(rootFor(), memory)})
    const writesBeforeRepeat = memory.writes.length
    const repeatManifest = manifestFor({runId: 'run-reporter-2', findings: [finding]})
    const failedRepeat = await reportAudit({manifest: repeatManifest, ...depsFor(rootFor(), memory)})
    expect(failedRepeat.diagnostics.some(item => item.includes('comment'))).toBe(true)
    expect(memory.writes.slice(writesBeforeRepeat)).toEqual(['asset-upload', 'asset-upload', 'body-update'])
    const retryWrites = memory.writes.length
    const successfulRepeat = await reportAudit({manifest: repeatManifest, ...depsFor(rootFor(), memory)})
    expect(successfulRepeat.diagnostics).toEqual([])
    expect(memory.writes.slice(retryWrites)).toEqual(['comment'])
    expect(memory.comments).toHaveLength(1)
  })

  it('reuses verified assets without planning asset writes and plans safe replacement as delete plus upload', async () => {
    const finding = makeFinding()
    const operation = operationKey('run-reporter-1', findingFingerprint(finding), variantKey(finding.variant), 'report')
    const names = finding.evidence.map(reference =>
      evidenceAssetName({
        operationKey: operation,
        fingerprint: findingFingerprint(finding),
        variantKey: variantKey(finding.variant),
        role: reference.role,
        bytes: png,
      }),
    )
    const assets = names.map((name, index) => ({
      id: index + 1,
      name,
      state: 'uploaded',
      size: png.length,
      content_type: 'image/png',
      digest: `sha256:${digest(png)}`,
      browser_download_url: `https://github.com/example/repo/releases/download/live-audit-evidence/${name}`,
    }))
    const root = rootFor()
    const reuse = await reportAudit({manifest: manifestFor(), ...depsFor(root, memoryGithub({assets}), 'disabled')})
    expect(reuse.operations.filter(operation => operation.kind.startsWith('asset'))).toHaveLength(0)
    const collision = {...assets[0], state: 'starter'}
    const replacement = await reportAudit({
      manifest: manifestFor(),
      ...depsFor(root, memoryGithub({assets: [collision]}), 'disabled'),
    })
    expect(replacement.operations.filter(item => item.assetName === collision.name).map(item => item.kind)).toEqual([
      'asset-delete',
      'asset-upload',
    ])
  })

  it('stops a reuse plan when a fresh execution asset check drifts', async () => {
    const finding = makeFinding()
    const operation = operationKey('run-reporter-1', findingFingerprint(finding), variantKey(finding.variant), 'report')
    const assets = finding.evidence.map((reference, index) => ({
      id: index + 1,
      name: evidenceAssetName({
        operationKey: operation,
        fingerprint: findingFingerprint(finding),
        variantKey: variantKey(finding.variant),
        role: reference.role,
        bytes: png,
      }),
      state: 'uploaded',
      size: png.length,
      content_type: 'image/png',
      digest: `sha256:${digest(png)}`,
      browser_download_url: `https://github.com/example/repo/releases/download/live-audit-evidence/${evidenceAssetName({
        operationKey: operation,
        fingerprint: findingFingerprint(finding),
        variantKey: variantKey(finding.variant),
        role: reference.role,
        bytes: png,
      })}`,
    }))
    const memory = memoryGithub({
      issue: rawIssue({number: 204, body: renderIssueLedger(ledgerFor(finding))}),
      assets,
      onAssetList: (listed, count) => {
        if (count === 2 && listed[0]) listed[0].digest = 'sha256:drift'
      },
    })
    const result = await reportAudit({manifest: manifestFor(), ...depsFor(rootFor(), memory)})
    expect(result.writeCount).toBe(0)
    expect(memory.writes).toEqual([])
    expect(result.diagnostics.some(item => item.includes('asset') && item.includes('drift'))).toBe(true)
  })

  it('stops a replacement plan when the starter asset changes before deletion', async () => {
    const finding = makeFinding()
    const operation = operationKey('run-reporter-1', findingFingerprint(finding), variantKey(finding.variant), 'report')
    const starterName = evidenceAssetName({
      operationKey: operation,
      fingerprint: findingFingerprint(finding),
      variantKey: variantKey(finding.variant),
      role: 'context',
      bytes: png,
    })
    const memory = memoryGithub({
      issue: rawIssue({number: 204, body: renderIssueLedger(ledgerFor(finding))}),
      assets: [
        {
          id: 1,
          name: starterName,
          state: 'starter',
          size: 0,
          content_type: 'application/octet-stream',
          digest: undefined,
          browser_download_url: `https://github.com/example/repo/releases/download/live-audit-evidence/${starterName}`,
        },
      ],
      onAssetList: (listed, count) => {
        if (count === 2 && listed[0]) {
          listed[0].state = 'uploaded'
          listed[0].size = png.length
          listed[0].content_type = 'image/png'
          listed[0].digest = `sha256:${digest(png)}`
        }
      },
    })
    const result = await reportAudit({manifest: manifestFor(), ...depsFor(rootFor(), memory)})
    expect(result.writeCount).toBe(0)
    expect(memory.writes).toEqual([])
    expect(result.diagnostics.some(item => item.includes('asset execution precondition drift'))).toBe(true)
  })

  it('stops an upload plan when an asset appears before upload', async () => {
    const finding = makeFinding()
    const operation = operationKey('run-reporter-1', findingFingerprint(finding), variantKey(finding.variant), 'report')
    const uploadName = evidenceAssetName({
      operationKey: operation,
      fingerprint: findingFingerprint(finding),
      variantKey: variantKey(finding.variant),
      role: 'context',
      bytes: png,
    })
    const memory = memoryGithub({
      issue: rawIssue({number: 204, body: renderIssueLedger(ledgerFor(finding))}),
      onAssetList: (listed, count) => {
        if (count === 2)
          listed.push({
            id: 2,
            name: uploadName,
            state: 'uploaded',
            size: png.length,
            content_type: 'image/png',
            digest: `sha256:${digest(png)}`,
            browser_download_url: `https://github.com/example/repo/releases/download/live-audit-evidence/${uploadName}`,
          })
      },
    })
    const result = await reportAudit({manifest: manifestFor(), ...depsFor(rootFor(), memory)})
    expect(result.writeCount).toBe(0)
    expect(memory.writes).toEqual([])
    expect(result.diagnostics.some(item => item.includes('asset execution precondition drift'))).toBe(true)
  })

  it('fails closed on an asset planning error without invoking a write function', async () => {
    const finding = makeFinding()
    const operation = operationKey('run-reporter-1', findingFingerprint(finding), variantKey(finding.variant), 'report')
    const name = evidenceAssetName({
      operationKey: operation,
      fingerprint: findingFingerprint(finding),
      variantKey: variantKey(finding.variant),
      role: 'context',
      bytes: png,
    })
    const bad = {
      id: 1,
      name,
      state: 'uploaded',
      size: png.length,
      content_type: 'text/plain',
      digest: `sha256:${'f'.repeat(64)}`,
      browser_download_url: 'https://evil.example/not-an-image',
    }
    const memory = memoryGithub({assets: [bad]})
    const result = await reportAudit({manifest: manifestFor(), ...depsFor(rootFor(), memory)})
    expect(result.writeCount).toBe(0)
    expect(memory.writes).toEqual([])
    expect(result.diagnostics.some(item => item.includes('asset') || item.includes('verified'))).toBe(true)
    expect(result.status).toBe('failure')
    expect(result.diagnosticDetails.some(diagnostic => diagnostic.code === 'asset-verification')).toBe(true)
  })

  it('uses exact reporter comments, canonical image order, safe run markers, and closure prose', async () => {
    const primary = makeFinding()
    const counterpart = {
      variant: {...primary.variant, viewport: 'desktop' as const},
      target: primary.target,
      result: {status: 'clean' as const, observedAt: '2026-07-20T03:30:00.000Z'},
      evidence: evidencePair('evidence/desktop-context.png', 'evidence/desktop-crop.png'),
    }
    const root = rootFor({
      'evidence/context.png': png,
      'evidence/crop.png': png,
      'evidence/desktop-context.png': png,
      'evidence/desktop-crop.png': png,
    })
    const memory = memoryGithub()
    const finding = makeFinding({responsive: 'required', counterpart})
    await reportAudit({manifest: manifestFor({findings: [finding]}), ...depsFor(root, memory)})
    expect(memory.getIssue()?.body).toContain('https://github.com/example/repo/releases/download/')
    expect(memory.getIssue()?.body).not.toContain('evidence/context.png')
    expect(memory.getIssue()?.body).not.toContain('run-reporter-1')
    expect(memory.comments).toHaveLength(0)

    const existing = memoryGithub({issue: rawIssue({number: 204, body: memory.getIssue()?.body ?? null})})
    const repeat = await reportAudit({
      manifest: manifestFor({findings: [finding], runId: 'run-reporter-2'}),
      ...depsFor(root, existing),
    })
    expect(repeat.writeCount).toBeGreaterThan(0)
    expect(existing.comments).toHaveLength(1)
    expect(existing.comments[0]?.body).toContain('Scheduled replay')
    expect(existing.comments[0]?.body).not.toContain('run-reporter-1')
  })

  it('sorts reversed context and crop references before rendering', async () => {
    const primary = makeFinding({
      evidence: evidencePair('evidence/context.png', 'evidence/crop.png').reverse() as [
        EvidenceReference,
        EvidenceReference,
      ],
    })
    const counterpart = {
      variant: {...primary.variant, viewport: 'desktop' as const},
      target: primary.target,
      result: {
        status: 'failure' as const,
        failureSignature: primary.failureSignature,
        observedAt: '2026-07-20T03:30:00.000Z',
      },
      evidence: evidencePair('responsive/context.png', 'responsive/crop.png')
        .reverse()
        .map(reference => ({
          ...reference,
          alt: 'untrusted counterpart text',
          caption: 'untrusted counterpart text',
        })) as [EvidenceReference, EvidenceReference],
    }
    const root = rootFor({
      'evidence/context.png': png,
      'evidence/crop.png': png,
      'responsive/context.png': png,
      'responsive/crop.png': png,
    })
    const memory = memoryGithub({release: false})
    await reportAudit({
      manifest: manifestFor({
        findings: [makeFinding({responsive: 'required', counterpart, evidence: primary.evidence})],
      }),
      ...depsFor(root, memory),
    })
    const body = memory.getIssue()?.body ?? ''
    const counterpartContext =
      'Failure counterpart — route=/projects — viewport=desktop — theme=preset:dracula — target=test-id:project-card-1 — role=context'
    const counterpartCrop =
      'Failure counterpart — route=/projects — viewport=desktop — theme=preset:dracula — target=test-id:project-card-1 — role=crop'
    expect(body.indexOf('Failure finding')).toBeLessThan(body.indexOf(counterpartContext))
    expect(body).toContain(counterpartContext)
    expect(body).toContain(counterpartCrop)
    expect(body.indexOf(counterpartContext)).toBeLessThan(body.indexOf(counterpartCrop))
  })

  it('renders canonical clean counterpart text from structured identity', async () => {
    const primary = makeFinding()
    const counterpart = {
      variant: {...primary.variant, viewport: 'desktop' as const},
      target: primary.target,
      result: {status: 'clean' as const, observedAt: '2026-07-20T03:30:00.000Z'},
      evidence: evidencePair('clean/context.png', 'clean/crop.png').map(reference => ({
        ...reference,
        alt: 'spoofed clean counterpart alt',
        caption: 'spoofed clean counterpart caption',
      })) as [EvidenceReference, EvidenceReference],
    }
    const root = rootFor({
      'evidence/context.png': png,
      'evidence/crop.png': png,
      'clean/context.png': png,
      'clean/crop.png': png,
    })
    const memory = memoryGithub({release: false})
    await reportAudit({
      manifest: manifestFor({findings: [makeFinding({responsive: 'required', counterpart})]}),
      ...depsFor(root, memory),
    })
    const body = memory.getIssue()?.body ?? ''
    expect(body).toContain(
      'Clean counterpart — route=/projects — viewport=desktop — theme=preset:dracula — target=test-id:project-card-1 — role=context',
    )
    expect(body).not.toContain('spoofed clean counterpart')
  })

  it('renders primary evidence labels from structured finding identity instead of supplied prose', async () => {
    const finding = makeFinding({
      evidence: evidencePair('evidence/context.png', 'evidence/crop.png').map(reference => ({
        ...reference,
        alt: 'spoofed primary alt',
        caption: 'spoofed primary caption',
      })) as [EvidenceReference, EvidenceReference],
    })
    const memory = memoryGithub({release: false})
    await reportAudit({manifest: manifestFor({findings: [finding]}), ...depsFor(rootFor(), memory)})
    const body = memory.getIssue()?.body ?? ''
    const primaryContext =
      'Failure finding — route=/projects — viewport=mobile — theme=preset:dracula — target=test-id:project-card-1 — observed=broken image — role=context'
    const primaryCrop =
      'Failure finding — route=/projects — viewport=mobile — theme=preset:dracula — target=test-id:project-card-1 — observed=broken image — role=crop'
    expect(body).toContain(primaryContext)
    expect(body).toContain(primaryCrop)
    expect(body).not.toContain('spoofed primary')
    expect(body.indexOf(primaryContext)).toBeLessThan(body.indexOf(primaryCrop))
  })

  it('uses canonical labels for every repeat comment frame, including spoofed responsive metadata', async () => {
    const primary = makeFinding({
      evidence: evidencePair('repeat/context.png', 'repeat/crop.png').map(reference => ({
        ...reference,
        alt: 'spoofed primary repeat alt',
        caption: 'spoofed primary repeat caption',
      })) as [EvidenceReference, EvidenceReference],
    })
    const counterpart = {
      variant: {...primary.variant, viewport: 'desktop' as const},
      target: primary.target,
      result: {
        status: 'failure' as const,
        failureSignature: primary.failureSignature,
        observedAt: '2026-07-20T03:30:00.000Z',
      },
      evidence: evidencePair('repeat/counterpart-context.png', 'repeat/counterpart-crop.png').map(reference => ({
        ...reference,
        alt: 'spoofed counterpart repeat alt',
        caption: 'spoofed counterpart repeat caption',
      })) as [EvidenceReference, EvidenceReference],
    }
    const finding = makeFinding({responsive: 'required', counterpart, evidence: primary.evidence})
    const root = rootFor({
      'repeat/context.png': png,
      'repeat/crop.png': png,
      'repeat/counterpart-context.png': png,
      'repeat/counterpart-crop.png': png,
    })
    const memory = memoryGithub({release: false})
    await reportAudit({manifest: manifestFor({findings: [finding]}), ...depsFor(root, memory)})
    await reportAudit({
      manifest: manifestFor({runId: 'repeat-run', findings: [finding]}),
      ...depsFor(root, memory),
    })
    expect(memory.comments).toHaveLength(1)
    const comment = memory.comments[0]?.body ?? ''
    const primaryContext =
      'Failure finding — route=/projects — viewport=mobile — theme=preset:dracula — target=test-id:project-card-1 — observed=broken image — role=context'
    const primaryCrop =
      'Failure finding — route=/projects — viewport=mobile — theme=preset:dracula — target=test-id:project-card-1 — observed=broken image — role=crop'
    const counterpartContext =
      'Failure counterpart — route=/projects — viewport=desktop — theme=preset:dracula — target=test-id:project-card-1 — role=context'
    const counterpartCrop =
      'Failure counterpart — route=/projects — viewport=desktop — theme=preset:dracula — target=test-id:project-card-1 — role=crop'
    for (const label of [primaryContext, primaryCrop, counterpartContext, counterpartCrop])
      expect(comment).toContain(`![${label}]`)
    expect(comment.indexOf(primaryContext)).toBeLessThan(comment.indexOf(primaryCrop))
    expect(comment.indexOf(primaryCrop)).toBeLessThan(comment.indexOf(counterpartContext))
    expect(comment.indexOf(counterpartContext)).toBeLessThan(comment.indexOf(counterpartCrop))
    expect(comment).not.toContain('spoofed')
  })

  it('does not leave a dangling Markdown escape at the comment length boundary', async () => {
    const finding = makeFinding({description: `${'a'.repeat(1_999)}*`})
    const memory = memoryGithub({release: false})
    await reportAudit({manifest: manifestFor({findings: [finding]}), ...depsFor(rootFor(), memory)})
    const descriptionLine = (memory.getIssue()?.body ?? '').split('\n')[2] ?? ''
    expect(descriptionLine.length).toBeLessThanOrEqual(2_000)
    expect(descriptionLine.endsWith('\\')).toBe(false)
  })

  it('plans and writes exactly four responsive evidence assets in failure context/crop order', async () => {
    const finding = makeFinding()
    const counterpart = {
      variant: {...finding.variant, viewport: 'desktop' as const},
      target: finding.target,
      result: {
        status: 'failure' as const,
        failureSignature: finding.failureSignature,
        observedAt: '2026-07-20T03:30:00.000Z',
      },
      evidence: [
        {
          ...ref('context', 'responsive/context.png'),
          alt: 'failure counterpart context',
          caption: 'failure counterpart context',
        },
        {...ref('crop', 'responsive/crop.png'), alt: 'failure counterpart crop', caption: 'failure counterpart crop'},
      ] as [EvidenceReference, EvidenceReference],
    }
    const responsive = makeFinding({responsive: 'required', counterpart})
    const root = rootFor({
      'evidence/context.png': png,
      'evidence/crop.png': png,
      'responsive/context.png': png,
      'responsive/crop.png': png,
    })
    const dry = await reportAudit({
      manifest: manifestFor({findings: [responsive]}),
      ...depsFor(root, memoryGithub({release: false}), 'disabled'),
    })
    expect(dry.operations.map(operation => operation.kind)).toEqual([
      'release-create',
      'asset-upload',
      'asset-upload',
      'asset-upload',
      'asset-upload',
      'issue-create',
    ])
    const memory = memoryGithub({release: false})
    const result = await reportAudit({manifest: manifestFor({findings: [responsive]}), ...depsFor(root, memory)})
    expect(result.writeCount).toBe(6)
    expect(memory.writes.filter(write => write === 'asset-upload')).toHaveLength(4)
    const body = memory.getIssue()?.body ?? ''
    const counterpartContext =
      'Failure counterpart — route=/projects — viewport=desktop — theme=preset:dracula — target=test-id:project-card-1 — role=context'
    const counterpartCrop =
      'Failure counterpart — route=/projects — viewport=desktop — theme=preset:dracula — target=test-id:project-card-1 — role=crop'
    expect(body.indexOf('role=crop')).toBeLessThan(body.indexOf(counterpartContext))
    expect(body.indexOf(counterpartContext)).toBeLessThan(body.indexOf(counterpartCrop))
  })

  it('counts only reporter-authored markers and independently recovers body, comment, and transition checkpoints', async () => {
    const finding = makeFinding()
    const fingerprint = findingFingerprint(finding)
    const key = variantKey(finding.variant)
    const body = `human\n${renderIssueLedger(ledgerFor(finding, {operations: [{key: 'old', checkpoint: 'evidence', completedAt: '2026-07-20T03:30:00Z'}]}))}`
    const memory = memoryGithub({issue: rawIssue({number: 204, body})})
    const first = await reportAudit({manifest: manifestFor(), ...depsFor(rootFor(), memory)})
    expect(first.writeCount).toBeGreaterThan(0)
    expect(memory.comments).toHaveLength(1)
    const second = await reportAudit({manifest: manifestFor(), ...depsFor(rootFor(), memory)})
    expect(second.writeCount).toBe(0)
    expect(memory.comments).toHaveLength(1)
    expect(memory.getIssue()?.body).toContain(fingerprint)
    expect(memory.getIssue()?.body).toContain(key)
  })

  it('does not let a human comment marker suppress a required reporter evidence comment', async () => {
    const finding = makeFinding()
    const operation = operationKey('run-reporter-1', findingFingerprint(finding), variantKey(finding.variant), 'report')
    const memory = memoryGithub({
      issue: rawIssue({number: 204, body: `human\n${renderIssueLedger(ledgerFor(finding))}`}),
      comments: [{body: `<!-- live-audit-operation:${operation} -->`, actor: 'maintainer'}],
    })
    const result = await reportAudit({manifest: manifestFor(), ...depsFor(rootFor(), memory)})
    expect(result.diagnostics).toEqual([])
    expect(memory.comments).toHaveLength(2)
    expect(memory.comments[1]?.user.login).toBe('reporter-bot')
  })

  it('recovers a validation transition and comment independently after the body checkpoint already exists', async () => {
    const finding = makeFinding()
    const runId = 'manual-partial'
    const fingerprint = findingFingerprint(finding)
    const key = variantKey(finding.variant)
    const validateOperation = operationKey(runId, fingerprint, key, 'validate')
    const transitionOperation = operationKey(runId, fingerprint, key, 'transition')
    const ledger = ledgerFor(finding, {
      variants: ledgerFor(finding).variants.map(variant => ({...variant, cleanCount: 1})),
      operations: [
        {key: validateOperation, checkpoint: 'evidence', completedAt: '2026-07-20T03:30:00.000Z'},
        {key: transitionOperation, checkpoint: 'transition', completedAt: '2026-07-20T03:30:00.000Z'},
      ],
      transition: {
        kind: 'closed',
        source: 'reporter',
        operationKey: transitionOperation,
        completedAt: '2026-07-20T03:30:00.000Z',
      },
    })
    const assets = finding.evidence.map(reference => {
      const name = evidenceAssetName({
        operationKey: validateOperation,
        fingerprint,
        variantKey: key,
        role: reference.role,
        bytes: png,
      })
      return {
        id: finding.evidence.indexOf(reference) + 1,
        name,
        state: 'uploaded',
        size: png.length,
        content_type: 'image/png',
        digest: `sha256:${digest(png)}`,
        browser_download_url: `https://github.com/example/repo/releases/download/live-audit-evidence/${name}`,
      }
    })
    const memory = memoryGithub({issue: rawIssue({number: 204, body: renderIssueLedger(ledger)}), assets})
    const manifest = manifestFor({
      runId,
      runKind: 'manual',
      issueNumber: 204,
      findings: [],
      validations: [validationFor(finding)],
    })
    const result = await reportAudit({manifest, ...depsFor(rootFor(), memory)})
    expect(result.writeCount).toBe(2)
    expect(memory.writes.filter(write => write === 'asset-upload')).toHaveLength(0)
    expect(memory.writes.filter(write => write === 'comment')).toHaveLength(1)
    expect(memory.writes.filter(write => write === 'close')).toHaveLength(1)
    expect((await reportAudit({manifest, ...depsFor(rootFor(), memory)})).writeCount).toBe(0)
  })

  it('suppresses human close variants and races before assets or comments without writing', async () => {
    const finding = makeFinding()
    const ledger = ledgerFor(finding, {transition: {kind: 'closed', source: 'human'}})
    for (const reason of ['not_planned', 'duplicate', null]) {
      const memory = memoryGithub({
        issue: rawIssue({number: 204, body: renderIssueLedger(ledger), state: 'closed', reason}),
      })
      const result = await reportAudit({manifest: manifestFor(), ...depsFor(rootFor(), memory)})
      expect(result.writeCount).toBe(0)
      expect(memory.writes).toEqual([])
    }
    const race = memoryGithub({
      issue: rawIssue({number: 204, body: renderIssueLedger(ledgerFor(finding))}),
      onIssueRead: current => {
        current.state = 'closed'
        current.state_reason = 'not_planned'
        current.body = renderIssueLedger({...ledgerFor(finding), transition: {kind: 'closed', source: 'human'}})
      },
    })
    const result = await reportAudit({manifest: manifestFor(), ...depsFor(rootFor(), race)})
    expect(result.writeCount).toBe(0)
    expect(race.writes).toEqual([])
  })

  it('reopens only a reporter-completed close with matching transition provenance and exact latest actor', async () => {
    const finding = makeFinding()
    const previousTransition = operationKey(
      'previous-run',
      findingFingerprint(finding),
      variantKey(finding.variant),
      'transition',
    )
    const closedLedger = ledgerFor(finding, {
      operations: [{key: previousTransition, checkpoint: 'transition', completedAt: '2026-07-20T03:30:00.000Z'}],
      transition: {
        kind: 'closed',
        source: 'reporter',
        operationKey: previousTransition,
        completedAt: '2026-07-20T03:30:00.000Z',
      },
    })
    const memory = memoryGithub({
      issue: rawIssue({number: 204, body: renderIssueLedger(closedLedger), state: 'closed', reason: 'completed'}),
      closeEvents: [{id: 1, event: 'closed', created_at: '2026-07-20T03:30:00Z', actor: {login: 'reporter-bot'}}],
      comments: [{body: `<!-- live-audit-transition:${previousTransition} -->`, actor: 'reporter-bot'}],
    })
    const result = await reportAudit({manifest: manifestFor(), ...depsFor(rootFor(), memory)})
    expect(result.diagnostics).toEqual([])
    expect(memory.writes.filter(write => write === 'reopen')).toHaveLength(1)
    expect(memory.getIssue()?.state).toBe('open')

    const humanRace = memoryGithub({
      issue: rawIssue({number: 204, body: renderIssueLedger(closedLedger), state: 'closed', reason: 'completed'}),
      closeEvents: [
        {id: 1, event: 'closed', created_at: '2026-07-20T03:30:00Z', actor: {login: 'reporter-bot'}},
        {id: 2, event: 'closed', created_at: '2026-07-20T03:31:00Z', actor: {login: 'maintainer'}},
      ],
      comments: [{body: `<!-- live-audit-transition:${previousTransition} -->`, actor: 'reporter-bot'}],
    })
    const suppressed = await reportAudit({manifest: manifestFor(), ...depsFor(rootFor(), humanRace)})
    expect(suppressed.writeCount).toBe(0)
    expect(humanRace.writes).toEqual([])
  })

  it('retries a pending reopen after comment persistence without rewriting close provenance', async () => {
    const finding = makeFinding()
    const closeOperation = operationKey(
      'previous-run',
      findingFingerprint(finding),
      variantKey(finding.variant),
      'transition',
    )
    const closedLedger = ledgerFor(finding, {
      operations: [{key: closeOperation, checkpoint: 'transition', completedAt: '2026-07-20T03:00:00.000Z'}],
      transition: {
        kind: 'closed',
        source: 'reporter',
        operationKey: closeOperation,
        completedAt: '2026-07-20T03:00:00.000Z',
      },
    })
    const memory = memoryGithub({
      issue: rawIssue({number: 204, body: renderIssueLedger(closedLedger), state: 'closed', reason: 'completed'}),
      closeEvents: [{id: 1, event: 'closed', created_at: '2026-07-20T03:06:00Z', actor: {login: 'reporter-bot'}}],
      comments: [
        {
          body: `<!-- live-audit-transition:${closeOperation} -->`,
          actor: 'reporter-bot',
          createdAt: '2026-07-20T03:05:00Z',
        },
      ],
      failReopenOnce: true,
    })
    const first = await reportAudit({manifest: manifestFor(), ...depsFor(rootFor(), memory)})
    expect(first.diagnostics.some(item => item.includes('state') || item.includes('transition'))).toBe(true)
    expect(memory.writes).toContain('comment')
    expect(memory.writes).not.toContain('reopen')
    const pending = parseIssueLedger(memory.getIssue()?.body ?? '').ledger.transition
    expect(pending.kind).toBe('closed-pending-reopen')
    if (pending.kind !== 'closed-pending-reopen') throw new Error('pending reopen was not persisted')
    const reopenOperation = operationKey(
      'run-reporter-1',
      findingFingerprint(finding),
      variantKey(finding.variant),
      'transition',
    )
    expect(pending.reopenOperationKey).toBe(reopenOperation)
    const writesBeforeRetry = memory.writes.length
    const retry = await reportAudit({manifest: manifestFor(), ...depsFor(rootFor(), memory)})
    expect(retry.diagnostics).toEqual([])
    expect(retry.writeCount).toBe(1)
    expect(memory.writes.filter(write => write === 'reopen')).toHaveLength(1)
    expect(memory.writes.filter(write => write === 'comment')).toHaveLength(1)
    expect(memory.writes.slice(writesBeforeRetry)).toEqual(['reopen'])
    const completed = parseIssueLedger(memory.getIssue()?.body ?? '').ledger.transition
    expect(completed.kind).toBe('closed-pending-reopen')
    expect(pending.operationKey).toBe(closeOperation)
    expect(completed.kind === 'closed-pending-reopen' ? completed.operationKey : '').toBe(closeOperation)
    expect(completed.kind === 'closed-pending-reopen' ? completed.completedAt : '').toBe('2026-07-20T03:00:00.000Z')
    expect(completed.kind === 'closed-pending-reopen' ? completed.reopenOperationKey : '').toBe(reopenOperation)
    const clean = validationFor(finding)
    const firstClean = await reportAudit({
      manifest: manifestFor({runId: 'clean-1', findings: [], validations: [clean]}),
      ...depsFor(rootFor(), memory),
    })
    expect(firstClean.diagnostics).toEqual([])
    const secondClean = await reportAudit({
      manifest: manifestFor({runId: 'clean-2', findings: [], validations: [clean]}),
      ...depsFor(rootFor(), memory),
    })
    expect(secondClean.diagnostics).toEqual([])
    expect(memory.getIssue()?.state).toBe('closed')
    const finalBody = parseIssueLedger(memory.getIssue()?.body ?? '').ledger
    expect(finalBody.transition.kind).toBe('closed')
    expect(finalBody.operations.some(operation => operation.checkpoint === 'transition-pending')).toBe(false)
  })

  it('suppresses closed recurrence without an exact reporter transition marker and post-marker lifecycle close', async () => {
    const finding = makeFinding()
    const transition = operationKey(
      'previous-run',
      findingFingerprint(finding),
      variantKey(finding.variant),
      'transition',
    )
    const ledger = ledgerFor(finding, {
      operations: [{key: transition, checkpoint: 'transition', completedAt: '2026-07-20T03:29:00Z'}],
      transition: {kind: 'closed', source: 'reporter', operationKey: transition, completedAt: '2026-07-20T03:29:00Z'},
    })
    const memory = memoryGithub({
      issue: rawIssue({number: 204, body: renderIssueLedger(ledger), state: 'closed', reason: 'completed'}),
      closeEvents: [{id: 1, event: 'closed', created_at: '2026-07-20T03:29:00Z', actor: {login: 'reporter-bot'}}],
    })
    const result = await reportAudit({manifest: manifestFor(), ...depsFor(rootFor(), memory)})
    expect(result.writeCount).toBe(0)
    expect(memory.writes).toEqual([])
    expect(result.diagnostics.some(item => item.includes('marker') || item.includes('provenance'))).toBe(true)
  })

  it('adds a new variant to the matching fingerprint issue and creates a distinct signature issue', async () => {
    const finding = makeFinding()
    const desktop = makeFinding({
      variant: {...finding.variant, viewport: 'desktop'},
      evidence: evidencePair('desktop/context.png', 'desktop/crop.png'),
    })
    const different = makeFinding({
      failureSignature: 'different failure',
      observations: finding.observations.map(observation => ({
        ...observation,
        signature: 'different failure',
      })) as Finding['observations'],
      evidence: evidencePair('different/context.png', 'different/crop.png'),
    })
    const memory = memoryGithub({issue: rawIssue({number: 204, body: renderIssueLedger(ledgerFor(finding))})})
    const root = rootFor({
      'evidence/context.png': png,
      'evidence/crop.png': png,
      'desktop/context.png': png,
      'desktop/crop.png': png,
      'different/context.png': png,
      'different/crop.png': png,
    })
    const variantResult = await reportAudit({manifest: manifestFor({findings: [desktop]}), ...depsFor(root, memory)})
    expect(variantResult.issueNumbers).toEqual([204])
    expect(memory.writes.filter(write => write === 'issue-create')).toHaveLength(0)
    const updated = JSON.stringify(memory.getIssue()?.body)
    expect(updated).toContain(variantKey(desktop.variant))
    const distinct = await reportAudit({
      manifest: manifestFor({runId: 'distinct', findings: [different]}),
      ...depsFor(root, memory),
    })
    expect(distinct.issueNumbers).toEqual([204])
    expect(memory.writes.filter(write => write === 'issue-create')).toHaveLength(1)
  })

  it('rejects body, ledger, and outside-human-body drift before later mutations', async () => {
    const finding = makeFinding()
    const memory = memoryGithub({
      issue: rawIssue({number: 204, body: `human\n${renderIssueLedger(ledgerFor(finding))}`}),
      onBodyPatch: current => {
        current.body = `tampered\n${current.body ?? ''}`
      },
    })
    const result = await reportAudit({manifest: manifestFor(), ...depsFor(rootFor(), memory)})
    expect(result.writeCount).toBeGreaterThan(0)
    expect(memory.writes.filter(write => write === 'comment')).toHaveLength(0)
    expect(memory.writes.filter(write => write === 'close' || write === 'reopen')).toHaveLength(0)
    expect(result.diagnostics.some(item => item.includes('drift'))).toBe(true)
  })
})

describe('reporter validation closure', () => {
  const cleanValidation = (finding: Finding, issueNumber = 204) =>
    ({
      status: 'clean' as const,
      issueNumber,
      fingerprint: findingFingerprint(finding),
      variantKey: variantKey(finding.variant),
      route: finding.route,
      semanticTarget: finding.semanticTarget,
      findingClass: finding.findingClass,
      assertion: finding.assertion,
      actions: finding.actions,
      failureSignature: finding.failureSignature,
      variant: finding.variant,
      target: finding.target,
      observedAt: '2026-07-20T03:30:00.000Z',
      evidence: evidencePair('evidence/context.png', 'evidence/crop.png'),
    }) satisfies ValidationClean

  it('renders clean validation evidence in order with workflow and two-replay prose', async () => {
    const finding = makeFinding()
    const memory = memoryGithub({issue: rawIssue({number: 204, body: renderIssueLedger(ledgerFor(finding))})})
    const manifest = manifestFor({findings: [], validations: [cleanValidation(finding)]})
    const result = await reportAudit({manifest, ...depsFor(rootFor(), memory)})
    expect(result.writeCount).toBeGreaterThan(0)
    expect(memory.comments).toHaveLength(1)
    expect(memory.comments[0]?.body.indexOf('context evidence')).toBeGreaterThanOrEqual(0)
    expect(memory.comments[0]?.body.indexOf('crop evidence')).toBeGreaterThan(
      memory.comments[0]?.body.indexOf('context evidence') ?? -1,
    )
    expect(memory.comments[0]?.body).toContain('scheduled replay')
    expect(memory.comments[0]?.body).toContain(workflowRunUrl)
  })

  it('keeps the first scheduled clean replay open and describes only one replay', async () => {
    const finding = makeFinding()
    const memory = memoryGithub({issue: rawIssue({number: 204, body: renderIssueLedger(ledgerFor(finding))})})
    const result = await reportAudit({
      manifest: manifestFor({findings: [], validations: [validationFor(finding)]}),
      ...depsFor(rootFor(), memory),
    })
    expect(result.diagnostics).toEqual([])
    expect(memory.getIssue()?.state).toBe('open')
    expect(memory.comments[0]?.body).toContain('First scheduled replay')
    expect(memory.comments[0]?.body).not.toContain('two scheduled replays')
  })

  it('halts validation after human-body drift and races before comment or transition', async () => {
    const finding = makeFinding()
    const drift = memoryGithub({
      issue: rawIssue({number: 204, body: `human\n${renderIssueLedger(ledgerFor(finding))}`}),
      onBodyPatch: current => {
        current.body = `human drift\n${current.body ?? ''}`
      },
    })
    const driftResult = await reportAudit({
      manifest: manifestFor({findings: [], validations: [validationFor(finding)]}),
      ...depsFor(rootFor(), drift),
    })
    expect(driftResult.diagnostics.some(item => item.includes('drift'))).toBe(true)
    expect(drift.writes.filter(write => write === 'comment' || write === 'close')).toHaveLength(0)

    const beforeComment = memoryGithub({
      issue: rawIssue({number: 204, body: `human\n${renderIssueLedger(ledgerFor(finding))}`}),
      onIssueRead: (current, count) => {
        if (count === 6) {
          current.state = 'closed'
          current.state_reason = 'not_planned'
          current.body = `human\n${renderIssueLedger({...ledgerFor(finding), transition: {kind: 'closed', source: 'human'}})}`
        }
      },
    })
    const commentRace = await reportAudit({
      manifest: manifestFor({findings: [], validations: [validationFor(finding)]}),
      ...depsFor(rootFor(), beforeComment),
    })
    expect(commentRace.diagnostics.length).toBeGreaterThan(0)
    expect(beforeComment.writes.filter(write => write === 'comment' || write === 'close')).toHaveLength(0)

    const beforeTransition = memoryGithub({
      issue: rawIssue({number: 204, body: `human\n${renderIssueLedger(ledgerFor(finding))}`}),
      onIssueRead: (current, count) => {
        if (count === 7) {
          current.state = 'closed'
          current.state_reason = 'not_planned'
        }
      },
    })
    const transitionRace = await reportAudit({
      manifest: manifestFor({runKind: 'manual', issueNumber: 204, findings: [], validations: [validationFor(finding)]}),
      ...depsFor(rootFor(), beforeTransition),
    })
    expect(transitionRace.diagnostics.length).toBeGreaterThan(0)
    expect(beforeTransition.writes.filter(write => write === 'close')).toHaveLength(0)
  })

  it('resets only matching variants, requires all manual variants, and closes scheduled runs after two independent runs', async () => {
    const finding = makeFinding()
    const desktop = {...finding.variant, viewport: 'desktop' as const}
    const baseVariant = ledgerFor(finding).variants[0]
    if (!baseVariant) throw new Error('ledger variant missing')
    const initial = ledgerFor(finding, {
      variants: [
        {...baseVariant, cleanCount: 2},
        {...baseVariant, key: variantKey(desktop), viewport: 'desktop', cleanCount: 2},
      ],
      replay: [
        ...ledgerFor(finding).replay,
        {
          variantKey: variantKey(desktop),
          target: finding.target,
          assertion: finding.assertion,
          reproduction: finding.reproduction,
        },
      ],
    })
    const memory = memoryGithub({issue: rawIssue({number: 204, body: renderIssueLedger(initial)})})
    const manual = manifestFor({
      runKind: 'manual',
      issueNumber: 204,
      findings: [],
      validations: [cleanValidation(finding)],
    })
    await reportAudit({manifest: manual, ...depsFor(rootFor(), memory)})
    expect(memory.getIssue()?.state).toBe('open')
    const scheduledLedger = ledgerFor(finding)
    const scheduledMemory = memoryGithub({issue: rawIssue({number: 204, body: renderIssueLedger(scheduledLedger)})})
    const scheduled = manifestFor({findings: [], validations: [cleanValidation(finding)]})
    await reportAudit({manifest: scheduled, ...depsFor(rootFor(), scheduledMemory)})
    const retry = await reportAudit({manifest: scheduled, ...depsFor(rootFor(), scheduledMemory)})
    expect(retry.writeCount).toBe(0)
    await reportAudit({manifest: {...scheduled, runId: 'scheduled-2'}, ...depsFor(rootFor(), scheduledMemory)})
    expect(scheduledMemory.getIssue()?.state).toBe('closed')
    const closedAt = parseIssueLedger(scheduledMemory.getIssue()?.body ?? '').ledger.transition
    await reportAudit({manifest: {...scheduled, runId: 'scheduled-2'}, ...depsFor(rootFor(), scheduledMemory)})
    expect(parseIssueLedger(scheduledMemory.getIssue()?.body ?? '').ledger.transition).toEqual(closedAt)
  })

  it('closes a manual issue only after every active variant is clean in the same manifest', async () => {
    const finding = makeFinding()
    const desktopFinding = makeFinding({variant: {...finding.variant, viewport: 'desktop'}})
    const base = ledgerFor(finding)
    const baseVariant = base.variants[0]
    const baseReplay = base.replay[0]
    if (!baseVariant || !baseReplay) throw new Error('ledger fixture missing')
    const ledger = ledgerFor(finding, {
      variants: [baseVariant, {...baseVariant, key: variantKey(desktopFinding.variant), viewport: 'desktop'}],
      replay: [baseReplay, {...baseReplay, variantKey: variantKey(desktopFinding.variant)}],
    })
    const mobile = validationFor(finding)
    const desktop = {
      ...validationFor(desktopFinding),
      evidence: evidencePair('desktop/context.png', 'desktop/crop.png'),
    }
    const root = rootFor({
      'evidence/context.png': png,
      'evidence/crop.png': png,
      'desktop/context.png': png,
      'desktop/crop.png': png,
      'desktop/validate-context.png': png,
      'desktop/validate-crop.png': png,
    })
    const memory = memoryGithub({issue: rawIssue({number: 204, body: renderIssueLedger(ledger)})})
    const result = await reportAudit({
      manifest: manifestFor({runKind: 'manual', issueNumber: 204, findings: [], validations: [mobile, desktop]}),
      ...depsFor(root, memory),
    })
    expect(result.writeCount).toBe(9)
    expect(memory.writes.filter(write => write === 'close')).toHaveLength(1)
    expect(memory.getIssue()?.state).toBe('closed')
  })

  it('keeps infrastructure diagnostics read-only and does not close on a same-run failure', async () => {
    const finding = makeFinding()
    const {evidence: _evidence, ...cleanWithoutEvidence} = cleanValidation(finding)
    const infrastructure = {
      ...cleanWithoutEvidence,
      status: 'infrastructure-error' as const,
      diagnostic: 'browser unavailable',
    }
    const memory = memoryGithub({issue: rawIssue({number: 204, body: renderIssueLedger(ledgerFor(finding))})})
    const result = await reportAudit({
      manifest: manifestFor({findings: [], validations: [infrastructure]}),
      ...depsFor(rootFor(), memory),
    })
    expect(result.diagnostics).toContain('browser unavailable')
    expect(memory.writes).toEqual([])
    const findingMemory = memoryGithub({issue: rawIssue({number: 204, body: renderIssueLedger(ledgerFor(finding))})})
    const mixed = manifestFor({validations: [cleanValidation(finding)]})
    await expect(reportAudit({manifest: mixed, ...depsFor(rootFor(), findingMemory)})).rejects.toThrow(
      /conflict|duplicate/,
    )
  })

  it('does not close when a same-run finding affects another active variant', async () => {
    const finding = makeFinding()
    const failingVariant = makeFinding({
      variant: {...finding.variant, viewport: 'desktop'},
      evidence: evidencePair('failure/context.png', 'failure/crop.png'),
    })
    const base = ledgerFor(finding)
    const baseVariant = base.variants[0]
    const baseReplay = base.replay[0]
    if (!baseVariant || !baseReplay) throw new Error('ledger fixture missing')
    const ledger = ledgerFor(finding, {
      variants: [baseVariant, {...baseVariant, key: variantKey(failingVariant.variant), viewport: 'desktop'}],
      replay: [baseReplay, {...baseReplay, variantKey: variantKey(failingVariant.variant)}],
    })
    const clean = {...validationFor(finding), evidence: evidencePair('clean/context.png', 'clean/crop.png')}
    const root = rootFor({
      'clean/context.png': png,
      'clean/crop.png': png,
      'failure/context.png': png,
      'failure/crop.png': png,
    })
    const memory = memoryGithub({issue: rawIssue({number: 204, body: renderIssueLedger(ledger)})})
    const result = await reportAudit({
      manifest: manifestFor({runKind: 'manual', issueNumber: 204, findings: [failingVariant], validations: [clean]}),
      ...depsFor(root, memory),
    })
    expect(result.diagnostics).toEqual([])
    expect(memory.writes.filter(write => write === 'close')).toHaveLength(0)
    expect(memory.getIssue()?.state).toBe('open')
  })

  it('blocks manual closure when a sibling clean validation fails eligibility planning', async () => {
    const mobile = makeFinding()
    const desktop = makeFinding({
      variant: {...mobile.variant, viewport: 'desktop'},
      evidence: evidencePair('desktop/context.png', 'desktop/crop.png'),
    })
    const base = ledgerFor(mobile)
    const baseVariant = base.variants[0]
    const baseReplay = base.replay[0]
    if (!baseVariant || !baseReplay) throw new Error('ledger fixture missing')
    const ledger = ledgerFor(mobile, {
      variants: [
        {...baseVariant, cleanCount: 0},
        {...baseVariant, key: variantKey(desktop.variant), viewport: 'desktop', cleanCount: 1},
      ],
      replay: [...base.replay, {...baseReplay, variantKey: variantKey(desktop.variant)}],
    })
    const desktopValidateOp = operationKey(
      'run-reporter-1',
      findingFingerprint(desktop),
      variantKey(desktop.variant),
      'validate',
    )
    const badName = evidenceAssetName({
      operationKey: desktopValidateOp,
      fingerprint: findingFingerprint(desktop),
      variantKey: variantKey(desktop.variant),
      role: 'context',
      bytes: png,
    })
    const memory = memoryGithub({
      issue: rawIssue({number: 204, body: renderIssueLedger(ledger)}),
      assets: [
        {
          id: 1,
          name: badName,
          state: 'uploaded',
          size: png.length,
          content_type: 'text/plain',
          digest: `sha256:${digest(png)}`,
          browser_download_url: `https://github.com/example/repo/releases/download/live-audit-evidence/${badName}`,
        },
      ],
    })
    const root = rootFor({
      'evidence/context.png': png,
      'evidence/crop.png': png,
      'desktop/context.png': png,
      'desktop/crop.png': png,
      'desktop/validate-context.png': png,
      'desktop/validate-crop.png': png,
    })
    const result = await reportAudit({
      manifest: manifestFor({
        runKind: 'manual',
        issueNumber: 204,
        findings: [],
        validations: [
          validationFor(mobile),
          {
            ...validationFor(desktop),
            evidence: evidencePair('desktop/validate-context.png', 'desktop/validate-crop.png'),
          },
        ],
      }),
      ...depsFor(root, memory),
    })
    expect(result.diagnostics.some(item => item.includes('asset planning failed'))).toBe(true)
    expect(memory.writes.filter(write => write === 'close')).toHaveLength(0)
    expect(memory.getIssue()?.state).toBe('open')
  })

  it('uses labeled issue enumeration, excludes search API, and fails closed for malformed or duplicate ledgers', async () => {
    const finding = makeFinding()
    const memory = memoryGithub({
      issues: [
        rawIssue({number: 204, body: renderIssueLedger(ledgerFor(finding))}),
        rawIssue({number: 205, body: renderIssueLedger(ledgerFor({...finding, failureSignature: 'other'}))}),
      ],
    })
    const decision = await decideAudit({manifest: manifestFor(), ...depsFor(rootFor(), memory, 'disabled')})
    expect(decision.diagnostics).toEqual([])
    expect(
      memory.runner.run.mock.calls.flatMap(call => call[0]).some(argument => argument.includes('search/issues')),
    ).toBe(false)
    const malformed = memoryGithub({issue: rawIssue({number: 204, body: 'human'})})
    const malformedResult = await reportAudit({manifest: manifestFor(), ...depsFor(rootFor(), malformed)})
    expect(malformedResult.writeCount).toBe(0)
    expect(malformedResult.status).toBe('failure')
    const duplicate = memoryGithub({
      issues: [
        rawIssue({number: 204, body: renderIssueLedger(ledgerFor(finding))}),
        rawIssue({number: 205, body: renderIssueLedger(ledgerFor(finding))}),
      ],
    })
    const duplicateResult = await reportAudit({manifest: manifestFor(), ...depsFor(rootFor(), duplicate)})
    expect(duplicateResult.writeCount).toBe(0)
    expect(duplicateResult.diagnostics.some(item => item.includes('multiple'))).toBe(true)
    expect(duplicateResult.status).toBe('failure')
  })
})

describe('reporter structured outcomes', () => {
  it('reports enabled no-op work as success and disabled planned work as warning', async () => {
    const manifest = manifestFor()
    const enabledMemory = memoryGithub({release: false})
    const enabled = await reportAudit({manifest, ...depsFor(rootFor(), enabledMemory)})
    expect(enabled.status).toBe('success')
    expect(enabled.diagnosticDetails).toEqual([])

    const retry = await reportAudit({manifest, ...depsFor(rootFor(), enabledMemory)})
    expect(retry.status).toBe('success')
    expect(retry.writeCount).toBe(0)

    const dry = await reportAudit({manifest, ...depsFor(rootFor(), memoryGithub({release: false}), 'disabled')})
    expect(dry.operations.length).toBeGreaterThan(0)
    expect(dry.status).toBe('warning')
    expect(dry.diagnosticDetails).toContainEqual({
      code: 'writes-disabled',
      severity: 'warning',
      message: 'reporter writes disabled',
    })
  })

  it('distinguishes manual-only scheduled runs from enabled manual runs', async () => {
    const scheduled = await reportAudit({
      manifest: manifestFor(),
      ...depsFor(rootFor(), memoryGithub({release: false}), 'manual-only'),
    })
    expect(scheduled.status).toBe('warning')
    expect(scheduled.diagnosticDetails).toContainEqual({
      code: 'manual-only',
      severity: 'warning',
      message: 'reporter writes disabled for scheduled runs in manual-only mode',
    })

    const manual = await reportAudit({
      manifest: manifestFor({runKind: 'manual', issueNumber: 204}),
      ...depsFor(
        rootFor(),
        memoryGithub({
          issue: rawIssue({number: 204, body: renderIssueLedger(ledgerFor(makeFinding()))}),
          release: false,
        }),
        'manual-only',
      ),
    })
    expect(manual.status).toBe('success')
  })

  it('reports authoritative suppression as a warning, including mixed suppressed and permitted batches', async () => {
    const suppressedFinding = makeFinding()
    const permittedFinding = makeFinding({
      failureSignature: 'different failure',
      observations: suppressedFinding.observations.map(observation => ({
        ...observation,
        signature: 'different failure',
      })) as Finding['observations'],
      evidence: evidencePair('permitted/context.png', 'permitted/crop.png'),
    })
    const memory = memoryGithub({
      issues: [
        rawIssue({
          number: 204,
          body: renderIssueLedger(ledgerFor(suppressedFinding)),
          labels: ['visual-audit-suppressed'],
        }),
      ],
      release: false,
    })
    const result = await reportAudit({
      manifest: manifestFor({findings: [suppressedFinding, permittedFinding]}),
      ...depsFor(
        rootFor({
          'evidence/context.png': png,
          'evidence/crop.png': png,
          'permitted/context.png': png,
          'permitted/crop.png': png,
        }),
        memory,
      ),
    })
    expect(result.status).toBe('warning')
    expect(result.writeCount).toBeGreaterThan(0)
    expect(result.diagnosticDetails).toContainEqual({
      code: 'suppressed',
      severity: 'warning',
      message: 'reporter issue is explicitly suppressed',
    })
  })

  it('reports infrastructure-only diagnostics as warnings without writes', async () => {
    const finding = makeFinding()
    const {evidence: _evidence, ...cleanWithoutEvidence} = validationFor(finding)
    const result = await reportAudit({
      manifest: manifestFor({
        findings: [],
        validations: [{...cleanWithoutEvidence, status: 'infrastructure-error', diagnostic: 'browser unavailable'}],
      }),
      ...depsFor(
        rootFor(),
        memoryGithub({issue: rawIssue({number: 204, body: renderIssueLedger(ledgerFor(finding))})}),
      ),
    })
    expect(result.status).toBe('warning')
    expect(result.writeCount).toBe(0)
    expect(result.diagnosticDetails).toContainEqual({
      code: 'infrastructure',
      severity: 'warning',
      message: 'browser unavailable',
    })
  })

  it('reports drift and transport failures as typed failures', async () => {
    const finding = makeFinding()
    const operation = operationKey('run-reporter-1', findingFingerprint(finding), variantKey(finding.variant), 'report')
    const assets = finding.evidence.map((reference, index) => ({
      id: index + 1,
      name: evidenceAssetName({
        operationKey: operation,
        fingerprint: findingFingerprint(finding),
        variantKey: variantKey(finding.variant),
        role: reference.role,
        bytes: png,
      }),
      state: 'uploaded',
      size: png.length,
      content_type: 'image/png',
      digest: `sha256:${digest(png)}`,
      browser_download_url: `https://github.com/example/repo/releases/download/live-audit-evidence/${evidenceAssetName({
        operationKey: operation,
        fingerprint: findingFingerprint(finding),
        variantKey: variantKey(finding.variant),
        role: reference.role,
        bytes: png,
      })}`,
    }))
    const driftMemory = memoryGithub({
      issue: rawIssue({number: 204, body: renderIssueLedger(ledgerFor(finding))}),
      assets,
      onAssetList: (listed, count) => {
        if (count === 2 && listed[0]) listed[0].digest = 'sha256:drift'
      },
    })
    const drift = await reportAudit({manifest: manifestFor(), ...depsFor(rootFor(), driftMemory)})
    expect(drift.status).toBe('failure')
    expect(drift.diagnosticDetails.some(diagnostic => diagnostic.code === 'drift')).toBe(true)
    expect(drift.diagnosticDetails.every(diagnostic => diagnostic.severity === 'failure')).toBe(true)

    const transportMemory = memoryGithub({release: false, failCommentOnce: true})
    await reportAudit({manifest: manifestFor(), ...depsFor(rootFor(), transportMemory)})
    const transport = await reportAudit({
      manifest: manifestFor({runId: 'transport-run-2'}),
      ...depsFor(rootFor(), transportMemory),
    })
    expect(transport.status).toBe('failure')
    expect(transport.diagnosticDetails.some(diagnostic => diagnostic.severity === 'failure')).toBe(true)
  })

  it('classifies thrown artifact and contract errors as CLI-safe failures', async () => {
    const error = await reportAudit({
      manifest: manifestFor(),
      ...depsFor('/missing/live-audit-artifact', memoryGithub(), 'disabled'),
    }).catch(error => error)
    expect(classifyReporterError(error).status).toBe('failure')
    expect(classifyReporterError(error).diagnostic.severity).toBe('failure')
  })
})
