import type {AuditManifest, EvidenceReference, Finding} from '../../scripts/live-audit/contract'
import type {GhRunner} from '../../scripts/live-audit/github-runner'
import {Buffer} from 'node:buffer'
import {createHash} from 'node:crypto'
import {mkdirSync, mkdtempSync, symlinkSync, writeFileSync} from 'node:fs'
import {appendFile, lstat, readFile, realpath, rename, unlink, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {
  MAX_DIAGNOSTIC_BYTES,
  MAX_MANIFEST_BYTES,
  MAX_RESULT_BYTES,
  MAX_SUMMARY_BYTES,
  runReportAuditCli,
  type ReportAuditCliFileSystem,
} from '../../scripts/live-audit/report-audit'

const {reportAuditMock} = vi.hoisted(() => ({reportAuditMock: vi.fn()}))
vi.mock('../../scripts/live-audit/reporter', () => ({
  classifyReporterError: (error: unknown) => ({
    status: 'failure',
    diagnostic: {
      code: 'contract',
      severity: 'failure',
      message: error instanceof Error ? error.message : 'reporter failed',
    },
  }),
  reportAudit: reportAuditMock,
}))

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

const fs: ReportAuditCliFileSystem = {
  appendFile,
  lstat,
  readFile,
  realpath,
  rename,
  unlink,
  writeFile,
}

const digest = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')

const rootFor = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'live-audit-report-cli-'))
  mkdirSync(join(root, 'evidence'), {recursive: true})
  writeFileSync(join(root, 'evidence/context.png'), png)
  writeFileSync(join(root, 'evidence/crop.png'), png)
  return root
}

const ref = (role: 'context' | 'crop', path: string): EvidenceReference => ({
  role,
  path,
  alt: `${role} evidence`,
  caption: `${role} screenshot`,
  integrity: {path, sha256: digest(png), width: 1, height: 1, bytes: png.byteLength},
})

const findingFor = (contextPath = 'evidence/context.png', cropPath = 'evidence/crop.png'): Finding => ({
  route: '/projects',
  findingClass: 'broken-image',
  responsive: 'not-applicable',
  semanticTarget: 'project-card-image',
  target: {kind: 'test-id', value: 'project-card-image'},
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
  evidence: [ref('context', contextPath), ref('crop', cropPath)],
})

const manifestFor = (overrides: Partial<AuditManifest> = {}): AuditManifest =>
  ({
    version: 1,
    runId: 'run-report-cli-1',
    generatedAt: '2026-07-20T03:30:00.000Z',
    runKind: 'scheduled',
    rotatingPresetId: 'dracula',
    findings: [],
    validations: [],
    ...overrides,
  }) as AuditManifest

const envFor = (overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> => ({
  GITHUB_REPOSITORY: 'example/repo',
  GITHUB_SERVER_URL: 'https://github.com',
  GITHUB_RUN_ID: '123456',
  GITHUB_RUN_ATTEMPT: '2',
  GH_TOKEN: 'super-secret-token',
  GITHUB_STEP_SUMMARY: undefined,
  ...overrides,
})

const writeManifest = async (root: string, manifest: unknown, name = 'manifest.json'): Promise<string> => {
  const path = join(root, name)
  await writeFile(path, JSON.stringify(manifest), 'utf8')
  return path
}

const argsFor = (manifestPath: string, root: string, resultPath: string): string[] => [
  '--manifest',
  manifestPath,
  '--artifact-root',
  root,
  '--result',
  resultPath,
]

const emptyRunner = (): GhRunner => ({run: vi.fn(async () => ({stdout: '[]', stderr: '', exitCode: 0}))})

describe('live-audit report CLI', () => {
  beforeEach(() => {
    reportAuditMock.mockImplementation(
      async (input: {readonly manifest: AuditManifest; readonly writeMode?: string}) => {
        if (input.manifest.runId === 'run-report-cli-thrown') throw new Error('reporter threw')
        if (input.manifest.runId === 'run-report-cli-failure')
          return {
            manifest: input.manifest,
            status: 'failure',
            diagnosticDetails: [{code: 'planning', severity: 'failure', message: 'typed failure'}],
            operations: [],
            diagnostics: ['typed failure'],
            writeCount: 0,
            issueNumbers: [],
          }
        const warning = input.writeMode !== 'enabled'
        return {
          manifest: input.manifest,
          status: warning ? 'warning' : 'success',
          diagnosticDetails: warning
            ? [
                {
                  code: input.writeMode === 'manual-only' ? 'manual-only' : 'writes-disabled',
                  severity: 'warning',
                  message: 'decision warning',
                },
              ]
            : [],
          operations: [],
          diagnostics: warning ? ['decision warning'] : [],
          writeCount: 0,
          issueNumbers: [],
        }
      },
    )
  })

  it('rejects unknown, duplicate, missing, positional, and stdin-like arguments before constructing the runner', async () => {
    const root = rootFor()
    const manifestPath = await writeManifest(root, manifestFor())
    const runnerFactory = vi.fn(() => emptyRunner())
    const common = {env: envFor(), fs, runnerFactory}

    await expect(
      runReportAuditCli({
        ...common,
        argv: [...argsFor(manifestPath, root, join(root, 'result.json')), '--unknown', 'value'],
      }),
    ).rejects.toThrow()
    await expect(
      runReportAuditCli({
        ...common,
        argv: [...argsFor(manifestPath, root, join(root, 'result.json')), '--result', join(root, 'other.json')],
      }),
    ).rejects.toThrow()
    await expect(
      runReportAuditCli({
        ...common,
        argv: ['--manifest', manifestPath, '--artifact-root', root],
      }),
    ).rejects.toThrow()
    await expect(
      runReportAuditCli({
        ...common,
        argv: [...argsFor(manifestPath, root, join(root, 'result.json')), 'stdin-data'],
      }),
    ).rejects.toThrow()
    expect(runnerFactory).not.toHaveBeenCalled()
  })

  it('rejects invalid closed environment values before constructing the runner', async () => {
    const root = rootFor()
    const manifestPath = await writeManifest(root, manifestFor())
    const runnerFactory = vi.fn(() => emptyRunner())
    const values = [
      {GITHUB_REPOSITORY: 'example'},
      {GITHUB_SERVER_URL: 'https://github.example.com'},
      {GITHUB_SERVER_URL: 'http://github.com'},
      {GITHUB_RUN_ID: 'not-a-run'},
      {GITHUB_RUN_ATTEMPT: '0'},
      {GH_TOKEN: ''},
      {LIVE_AUDIT_WRITE_MODE: 'sometimes'},
    ]

    for (const [index, value] of values.entries()) {
      const resultPath = join(root, `invalid-env-${index}.json`)
      await expect(
        runReportAuditCli({
          argv: argsFor(manifestPath, root, resultPath),
          env: envFor(value),
          fs,
          runnerFactory,
        }),
      ).resolves.toBe(1)
      expect(JSON.parse(await readFile(resultPath, 'utf8'))).toMatchObject({
        version: 1,
        status: 'failure',
        operations: [],
        writeCount: 0,
        issueNumbers: [],
      })
    }
    expect(runnerFactory).not.toHaveBeenCalled()
  })

  it('rejects traversal, symlink, malformed, and oversized manifests before constructing the runner', async () => {
    const root = rootFor()
    const outside = mkdtempSync(join(tmpdir(), 'live-audit-report-cli-outside-'))
    const outsideManifest = await writeManifest(outside, manifestFor())
    const symlinkPath = join(root, 'linked-manifest.json')
    symlinkSync(outsideManifest, symlinkPath)
    const malformed = await writeManifest(root, '{')
    const oversized = join(root, 'oversized.json')
    writeFileSync(oversized, Buffer.alloc(MAX_MANIFEST_BYTES + 1, 0x20))
    const runnerFactory = vi.fn(() => emptyRunner())
    for (const [index, manifestPath] of [
      join(root, '..', root.split('/').pop() ?? '', 'missing.json'),
      symlinkPath,
      malformed,
      oversized,
    ].entries()) {
      const resultPath = join(root, `invalid-manifest-${index}.json`)
      await expect(
        runReportAuditCli({
          argv: argsFor(manifestPath, root, resultPath),
          env: envFor(),
          fs,
          runnerFactory,
        }),
      ).resolves.toBe(1)
      const result = JSON.parse(await readFile(resultPath, 'utf8')) as Record<string, unknown>
      expect(result).toMatchObject({version: 1, status: 'failure', operations: [], writeCount: 0, issueNumbers: []})
      expect(JSON.stringify(result)).not.toContain(envFor().GH_TOKEN)
    }
    expect(runnerFactory).not.toHaveBeenCalled()
  })

  it('bounds streamed public image verification and honors the content-length precheck', async () => {
    const root = rootFor()
    const manifestPath = await writeManifest(root, manifestFor())
    const verified = vi.fn()
    reportAuditMock.mockImplementationOnce(
      async (input: {
        readonly manifest: AuditManifest
        readonly verifyPublicImage: (url: string) => Promise<{readonly ok: boolean; readonly reason?: string}>
      }) => {
        verified(await input.verifyPublicImage('https://example.test/declared-too-large.png'))
        verified(await input.verifyPublicImage('https://example.test/chunked-too-large.png'))
        return {
          manifest: input.manifest,
          status: 'success' as const,
          diagnosticDetails: [],
          operations: [],
          diagnostics: [],
          writeCount: 0,
          issueNumbers: [],
        }
      },
    )
    const fetchImpl = vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input)
      if (url.endsWith('declared-too-large.png'))
        return new Response(png, {
          status: 200,
          headers: {'content-length': '5000001', 'content-type': 'image/png'},
        })
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array(5_000_001))
            controller.close()
          },
        }),
        {status: 200, headers: {'content-type': 'image/png'}},
      )
    })

    await expect(
      runReportAuditCli({
        argv: argsFor(manifestPath, root, join(root, 'result.json')),
        env: envFor(),
        fs,
        runnerFactory: () => emptyRunner(),
        fetch: fetchImpl,
      }),
    ).resolves.toBe(0)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(verified).toHaveBeenNthCalledWith(1, {ok: false, reason: 'public image exceeds size limit'})
    expect(verified).toHaveBeenNthCalledWith(2, {ok: false, reason: 'public image exceeds size limit'})
  })

  it('aborts a stalled response body reader within the same deadline and cancels it', async () => {
    vi.useFakeTimers()
    try {
      const root = rootFor()
      const manifestPath = await writeManifest(root, manifestFor())
      const cancel = vi.fn(async () => undefined)
      const body = {
        getReader: () => ({
          cancel,
          read: () => new Promise<ReadableStreamReadResult<Uint8Array>>(() => undefined),
        }),
      } as unknown as ReadableStream<Uint8Array>
      const response = {
        body,
        headers: new Headers({'content-type': 'image/png'}),
        ok: true,
      } as unknown as Response
      reportAuditMock.mockImplementationOnce(
        async (input: {
          readonly manifest: AuditManifest
          readonly verifyPublicImage: (url: string) => Promise<{readonly ok: boolean; readonly reason?: string}>
        }) => {
          const verification = await input.verifyPublicImage('https://example.test/stalled.png')
          return {
            manifest: input.manifest,
            status: verification.ok ? ('success' as const) : ('failure' as const),
            diagnosticDetails: verification.ok
              ? []
              : [{code: 'contract' as const, severity: 'failure' as const, message: verification.reason ?? 'failed'}],
            operations: [],
            diagnostics: verification.ok ? [] : [verification.reason ?? 'failed'],
            writeCount: 0,
            issueNumbers: [],
          }
        },
      )
      const fetchImpl = vi.fn(async () => response)
      const run = runReportAuditCli({
        argv: argsFor(manifestPath, root, join(root, 'result.json')),
        env: envFor(),
        fs,
        runnerFactory: () => emptyRunner(),
        fetch: fetchImpl,
      })
      await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1))
      await vi.advanceTimersByTimeAsync(15_000)
      expect(cancel).toHaveBeenCalledTimes(1)
      expect(await run).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('accepts valid PNG bytes delivered as octet-stream and rejects malformed or non-PNG octet-stream', async () => {
    const root = rootFor()
    const manifestPath = await writeManifest(root, manifestFor())
    const verified: {
      readonly ok: boolean
      readonly contentType?: string
      readonly sha256?: string
      readonly reason?: string
    }[] = []
    const malformedPng = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0])
    const nonPng = Buffer.from('not-a-png')
    reportAuditMock.mockImplementationOnce(
      async (input: {
        readonly manifest: AuditManifest
        readonly verifyPublicImage: (url: string) => Promise<{
          readonly ok: boolean
          readonly contentType?: string
          readonly sha256?: string
          readonly reason?: string
        }>
      }) => {
        verified.push(
          await input.verifyPublicImage(
            'https://github.com/example/repo/releases/download/live-audit-evidence/valid.png',
          ),
          await input.verifyPublicImage(
            'https://github.com/example/repo/releases/download/live-audit-evidence/malformed.png',
          ),
          await input.verifyPublicImage(
            'https://github.com/example/repo/releases/download/live-audit-evidence/non-png.png',
          ),
        )
        return {
          manifest: input.manifest,
          status: verified.every(item => item.ok) ? ('success' as const) : ('failure' as const),
          diagnosticDetails: verified.every(item => item.ok)
            ? []
            : [{code: 'asset-verification' as const, severity: 'failure' as const, message: 'invalid public PNG'}],
          operations: [],
          diagnostics: ['invalid public PNG'],
          writeCount: 0,
          issueNumbers: [],
        }
      },
    )
    const fetchImpl = vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input)
      const body = url.endsWith('/valid.png') ? png : url.endsWith('/malformed.png') ? malformedPng : nonPng
      return new Response(body, {status: 200, headers: {'content-type': 'application/octet-stream'}})
    })
    const resultPath = join(root, 'result.json')

    await expect(
      runReportAuditCli({
        argv: argsFor(manifestPath, root, resultPath),
        env: envFor(),
        fs,
        runnerFactory: () => emptyRunner(),
        fetch: fetchImpl,
      }),
    ).resolves.toBe(1)
    expect(verified[0]).toMatchObject({ok: true, contentType: 'application/octet-stream', sha256: digest(png)})
    expect(verified[1]).toMatchObject({ok: false})
    expect(verified[2]).toMatchObject({ok: false})
    expect(JSON.parse(await readFile(resultPath, 'utf8'))).toMatchObject({status: 'failure'})
  })

  it.each([
    ['missing', undefined, 'disabled'],
    ['disabled', 'disabled', 'disabled'],
    ['manual-only', 'manual-only', 'manual-only'],
    ['enabled', 'enabled', 'enabled'],
  ])('accepts %s write mode and always produces a decision', async (_label, configuredMode, expectedMode) => {
    const root = rootFor()
    const manifestPath = await writeManifest(root, manifestFor())
    const resultPath = join(root, `${_label}.result.json`)
    const runner = emptyRunner()
    const runnerFactory = vi.fn(() => runner)
    const summaryWriter = vi.fn()
    const exitCode = await runReportAuditCli({
      argv: argsFor(manifestPath, root, resultPath),
      env: envFor({LIVE_AUDIT_WRITE_MODE: configuredMode}),
      fs,
      runnerFactory,
      summaryWriter,
      fetch: vi.fn(),
      clock: () => new Date('2026-07-20T03:30:00.000Z'),
    })

    expect(exitCode).toBe(0)
    expect(runnerFactory).toHaveBeenCalledTimes(1)
    expect(JSON.parse(await readFile(resultPath, 'utf8'))).toMatchObject({
      version: 1,
      status: expectedMode === 'enabled' ? 'success' : 'warning',
    })
  })

  it('maps typed success, warning, and failure reporter outcomes to exit codes without diagnostic string matching', async () => {
    const root = rootFor()
    const successManifest = await writeManifest(root, manifestFor(), 'success.json')
    const warningManifest = await writeManifest(root, manifestFor(), 'warning.json')
    const failureManifest = await writeManifest(
      root,
      manifestFor({runId: 'run-report-cli-failure', findings: [findingFor()]}),
      'failure.json',
    )
    const thrownManifest = await writeManifest(root, manifestFor({runId: 'run-report-cli-thrown'}), 'thrown.json')
    const run = (manifestPath: string, name: string) =>
      runReportAuditCli({
        argv: argsFor(manifestPath, root, join(root, name)),
        env: envFor({LIVE_AUDIT_WRITE_MODE: name === 'warning-result.json' ? 'disabled' : 'enabled'}),
        fs,
        runnerFactory: () => emptyRunner(),
        summaryWriter: vi.fn(),
        clock: () => new Date('2026-07-20T03:30:00.000Z'),
      })

    expect(await run(successManifest, 'success-result.json')).toBe(0)
    expect(await run(warningManifest, 'warning-result.json')).toBe(0)
    expect(await run(failureManifest, 'failure-result.json')).toBe(1)
    expect(await run(thrownManifest, 'thrown-result.json')).toBe(1)
    expect(JSON.parse(await readFile(join(root, 'failure-result.json'), 'utf8'))).toMatchObject({
      status: 'failure',
      diagnosticDetails: [{code: 'planning', severity: 'failure'}],
    })
    expect(JSON.parse(await readFile(join(root, 'thrown-result.json'), 'utf8'))).toMatchObject({
      status: 'failure',
      diagnosticDetails: [{code: 'contract', severity: 'failure'}],
    })
  })

  it('emits a bounded redacted failure diagnostic through an injectable writer after persisting the result', async () => {
    const root = rootFor()
    const manifestPath = await writeManifest(root, manifestFor({runId: 'run-report-cli-failure'}))
    const resultPath = join(root, 'reporter-result.json')
    const token = envFor().GH_TOKEN as string
    const diagnosticWriter = vi.fn()
    const longMessage = `${token} ${'actionable reporter failure '.repeat(200)}`
    reportAuditMock.mockImplementationOnce(async (input: {readonly manifest: AuditManifest}) => ({
      manifest: input.manifest,
      status: 'failure' as const,
      diagnosticDetails: [{code: 'asset-verification' as const, severity: 'failure' as const, message: longMessage}],
      operations: [],
      diagnostics: [longMessage],
      writeCount: 0,
      issueNumbers: [],
    }))
    const input = {
      argv: argsFor(manifestPath, root, resultPath),
      env: envFor(),
      fs,
      runnerFactory: () => emptyRunner(),
      diagnosticWriter,
    }

    await expect(runReportAuditCli(input)).resolves.toBe(1)
    expect(diagnosticWriter).toHaveBeenCalledTimes(1)
    const diagnostic = diagnosticWriter.mock.calls[0]?.[0] as string
    expect(diagnostic).toContain('asset-verification')
    expect(diagnostic).not.toContain(token)
    expect(Buffer.byteLength(diagnostic, 'utf8')).toBeLessThanOrEqual(MAX_DIAGNOSTIC_BYTES)
    expect(JSON.parse(await readFile(resultPath, 'utf8'))).toMatchObject({
      status: 'failure',
      diagnosticDetails: [{code: 'asset-verification', severity: 'failure'}],
    })
  })

  it('writes a versioned closed result atomically and omits tokens and raw stderr', async () => {
    const root = rootFor()
    const manifestPath = await writeManifest(root, manifestFor())
    const resultPath = join(root, 'report-result.json')
    const summaryPath = join(root, 'summary.md')
    const summaryWriter = vi.fn(async (path: string, content: string) => appendFile(path, content, 'utf8'))
    const renameSpy = vi.spyOn(fs, 'rename')

    expect(
      await runReportAuditCli({
        argv: argsFor(manifestPath, root, resultPath),
        env: envFor({GITHUB_STEP_SUMMARY: summaryPath}),
        fs,
        runnerFactory: () => emptyRunner(),
        summaryWriter,
        clock: () => new Date('2026-07-20T03:30:00.000Z'),
      }),
    ).toBe(0)

    const result = JSON.parse(await readFile(resultPath, 'utf8')) as Record<string, unknown>
    expect(Object.keys(result).sort()).toEqual([
      'diagnosticDetails',
      'issueNumbers',
      'operations',
      'status',
      'version',
      'writeCount',
    ])
    expect(JSON.stringify(result)).not.toContain('super-secret-token')
    expect(JSON.stringify(result)).not.toContain('raw stderr')
    expect(renameSpy).toHaveBeenCalledTimes(1)
    expect(summaryWriter).toHaveBeenCalledTimes(1)
    const summary = await readFile(summaryPath, 'utf8')
    expect(Buffer.byteLength(summary, 'utf8')).toBeLessThanOrEqual(MAX_SUMMARY_BYTES)
    expect(Buffer.byteLength(await readFile(resultPath), 'utf8')).toBeLessThanOrEqual(MAX_RESULT_BYTES)
  })

  it('cleans up the temporary result when an atomic write fails', async () => {
    const root = rootFor()
    const manifestPath = await writeManifest(root, manifestFor())
    const resultPath = join(root, 'failed-result.json')
    const writes: string[] = []
    const failingFs: ReportAuditCliFileSystem = {
      ...fs,
      writeFile: async (path, content) => {
        writes.push(path)
        if (path !== resultPath) throw new Error('write failed')
        await writeFile(path, content)
      },
    }

    await expect(
      runReportAuditCli({
        argv: argsFor(manifestPath, root, resultPath),
        env: envFor(),
        fs: failingFs,
        runnerFactory: () => emptyRunner(),
      }),
    ).rejects.toThrow('write failed')
    expect(writes).toHaveLength(1)
    await expect(readFile(resultPath)).rejects.toThrow()
  })

  it('builds the production workflow URL with an optional attempt and validates repository identity', async () => {
    const root = rootFor()
    const manifestPath = await writeManifest(root, manifestFor())
    const resultPath = join(root, 'result.json')
    const runner = emptyRunner()
    const runnerFactory = vi.fn(() => runner)

    await expect(
      runReportAuditCli({
        argv: argsFor(manifestPath, root, resultPath),
        env: envFor({GITHUB_RUN_ATTEMPT: undefined}),
        fs,
        runnerFactory,
      }),
    ).resolves.toBe(0)
    expect(runnerFactory).toHaveBeenCalledWith(expect.objectContaining({GITHUB_SERVER_URL: 'https://github.com'}))
    expect(reportAuditMock.mock.calls.at(-1)?.[0].workflowRunUrl).toBe(
      'https://github.com/example/repo/actions/runs/123456',
    )
  })
})
