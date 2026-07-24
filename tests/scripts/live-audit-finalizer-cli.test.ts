import type {Finding} from '../../scripts/live-audit/contract'
import {Buffer} from 'node:buffer'
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {describe, expect, it} from 'vitest'
import {buildCoreMatrix, chooseRotatingPreset, computeEvidenceIntegrity} from '../../scripts/live-audit/evidence'
import {runFinalizeDiscovery} from '../../scripts/live-audit/finalize-discovery'
import {findingFingerprint, variantKey} from '../../scripts/live-audit/identity'
import {buildScheduledReplayPlan, serializeReplayPlan} from '../../scripts/live-audit/replay-plan'
import {runReportAuditCli} from '../../scripts/live-audit/report-audit'

describe('live-audit finalizer CLI', () => {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  )
  const makeFinding = (paths: readonly [string, string] = ['context.png', 'crop.png']): Finding => ({
    route: '/projects',
    findingClass: 'broken-image',
    assertion: {version: 1, kind: 'image-load', expected: 'loaded'},
    actions: [],
    semanticTarget: 'test-id:project-card-1',
    target: {kind: 'test-id', value: 'project-card-1'},
    failureSignature: 'image-load:broken',
    description: 'broken image',
    reproduction: ['Open projects'],
    responsive: 'not-applicable',
    variant: {viewport: 'desktop', theme: {kind: 'mode', mode: 'light'}, state: 'core'},
    observations: [
      {kind: 'candidate', status: 'failure', signature: 'image-load:broken', observedAt: '2026-07-24T03:30:00.000Z'},
      {kind: 'replay', status: 'failure', signature: 'image-load:broken', observedAt: '2026-07-24T03:30:00.000Z'},
    ],
    evidence: paths.map((path, index) => ({
      role: index === 0 ? 'context' : 'crop',
      path,
      alt: path,
      caption: path,
      integrity: computeEvidenceIntegrity(path, png),
    })) as [Finding['evidence'][number], Finding['evidence'][number]],
  })
  const makeCandidate = (finding: Finding) => {
    const {observations: _observations, evidence: _evidence, ...candidateFields} = finding
    return {
      ...candidateFields,
      observation: {
        status: 'failure' as const,
        signature: finding.failureSignature,
        observedAt: '2026-07-24T03:30:00.000Z',
      },
    }
  }
  const makeActiveRequest = (variant: {
    viewport: 'desktop' | 'mobile'
    theme: {kind: 'mode'; mode: 'light'}
    state: 'core'
  }) => ({
    issueNumber: 42,
    fingerprint: findingFingerprint({
      route: '/projects',
      semanticTarget: 'test-id:project-card-1',
      failureSignature: 'image-load:broken',
    }),
    variantKey: variantKey(variant),
    route: '/projects' as const,
    semanticTarget: 'test-id:project-card-1',
    findingClass: 'broken-image' as const,
    assertion: {version: 1 as const, kind: 'image-load' as const, expected: 'loaded' as const},
    actions: [],
    failureSignature: 'image-load:broken',
    responsive: 'not-applicable' as const,
    variant,
    target: {kind: 'test-id' as const, value: 'project-card-1'},
    reproduction: ['Open projects'],
  })
  const writeCandidateFixture = (directory: string, finding: Finding) => {
    const plan = buildScheduledReplayPlan({
      runId: 'scheduled-fixture',
      generatedAt: '2026-07-24T03:30:00.000Z',
      exploration: {steps: 0, durationMs: 0},
      activeLedgers: [],
    })
    const candidate = makeCandidate(finding)
    const planPath = join(directory, 'plan.json')
    const candidatePath = join(directory, 'candidates.json')
    writeFileSync(planPath, serializeReplayPlan(plan))
    writeFileSync(
      candidatePath,
      JSON.stringify({
        version: 1,
        runId: plan.runId,
        runKind: 'scheduled',
        rotatingPresetId: plan.rotatingPresetId,
        generatedAt: plan.generatedAt,
        candidates: [candidate],
        diagnostics: [],
        exploration: plan.exploration,
      }),
    )
    return {planPath, candidatePath}
  }
  it('rejects unknown, duplicate, missing, and positional arguments before reading inputs', async () => {
    const fileSystem = {
      readFileSync: () => {
        throw new Error('must not read')
      },
    }

    await expect(runFinalizeDiscovery({args: ['--unknown'], fileSystem})).rejects.toThrow(/argument/i)
    await expect(
      runFinalizeDiscovery({args: ['--plan', 'plan.json', '--plan', 'again.json'], fileSystem}),
    ).rejects.toThrow(/duplicate/i)
    await expect(runFinalizeDiscovery({args: ['--plan', 'plan.json'], fileSystem})).rejects.toThrow(
      /candidates|out|result/i,
    )
    await expect(
      runFinalizeDiscovery({
        args: ['--plan', 'plan.json', '--candidates', 'candidates.json', '--out', 'out', '--result', 'result', 'extra'],
        fileSystem,
      }),
    ).rejects.toThrow(/positional/i)
  })

  it('writes a canonical scheduled no-op artifact without invoking a browser', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'live-audit-finalizer-'))
    const plan = buildScheduledReplayPlan({
      runId: 'scheduled-empty',
      generatedAt: '2026-07-24T03:30:00.000Z',
      exploration: {steps: 0, durationMs: 0},
      activeLedgers: [],
    })
    const planPath = join(directory, 'replay-plan.json')
    const candidatePath = join(directory, 'candidate-bundle.json')
    const outputPath = join(directory, 'artifact')
    const resultPath = join(directory, 'result.json')
    writeFileSync(planPath, serializeReplayPlan(plan))
    writeFileSync(
      candidatePath,
      JSON.stringify({
        version: 1,
        runId: plan.runId,
        runKind: 'scheduled',
        rotatingPresetId: plan.rotatingPresetId,
        generatedAt: plan.generatedAt,
        candidates: [],
        diagnostics: [],
        exploration: plan.exploration,
      }),
    )
    const browser = {
      finalizeCandidate: async () => {
        throw new Error('browser must not run')
      },
      finalizeActive: async () => {
        throw new Error('browser must not run')
      },
    }
    const result = await runFinalizeDiscovery({
      args: ['--plan', planPath, '--candidates', candidatePath, '--out', outputPath, '--result', resultPath],
      browser,
    })
    expect(result).toMatchObject({runKind: 'scheduled', hasOperations: false, status: 'success'})
    expect(readFileSync(join(outputPath, 'finalization-result.json'), 'utf8')).toBe(readFileSync(resultPath, 'utf8'))
    expect(readdirSync(outputPath).sort()).toEqual([
      'diagnostics.json',
      'evidence',
      'finalization-result.json',
      'manifest.json',
      'provenance',
    ])
    expect(readdirSync(join(outputPath, 'provenance')).sort()).toEqual(['candidate-bundle.json', 'replay-plan.json'])
  })

  it('cleans the temporary and final directories when browser finalization fails', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'live-audit-finalizer-failure-'))
    const plan = buildScheduledReplayPlan({
      runId: 'scheduled-failure',
      generatedAt: '2026-07-24T03:30:00.000Z',
      exploration: {steps: 0, durationMs: 0},
      activeLedgers: [],
    })
    const planPath = join(directory, 'replay-plan.json')
    const candidatePath = join(directory, 'candidate-bundle.json')
    const outputPath = join(directory, 'artifact')
    const resultPath = join(directory, 'result.json')
    writeFileSync(planPath, serializeReplayPlan(plan))
    const candidate = {
      route: '/projects',
      findingClass: 'broken-image',
      assertion: {version: 1, kind: 'image-load', expected: 'loaded'},
      actions: [],
      semanticTarget: 'test-id:project-card-1',
      target: {kind: 'test-id', value: 'project-card-1'},
      failureSignature: 'image-load:broken',
      description: 'broken image',
      reproduction: ['Open projects'],
      variant: {viewport: 'desktop', theme: {kind: 'mode', mode: 'light'}, state: 'core'},
      responsive: 'not-applicable',
      observation: {status: 'failure', signature: 'image-load:broken', observedAt: '2026-07-24T03:30:00.000Z'},
    }
    writeFileSync(
      candidatePath,
      JSON.stringify({
        version: 1,
        runId: plan.runId,
        runKind: 'scheduled',
        rotatingPresetId: plan.rotatingPresetId,
        generatedAt: plan.generatedAt,
        candidates: [candidate],
        diagnostics: [],
        exploration: plan.exploration,
      }),
    )
    await expect(
      runFinalizeDiscovery({
        args: ['--plan', planPath, '--candidates', candidatePath, '--out', outputPath, '--result', resultPath],
        browser: {
          finalizeCandidate: async () => {
            throw new Error('injected browser failure')
          },
          finalizeActive: async () => {
            throw new Error('injected browser failure')
          },
        },
      }),
    ).rejects.toThrow('injected browser failure')
    expect(existsSync(outputPath)).toBe(false)
    expect(existsSync(`${outputPath}.tmp`)).toBe(false)
  })

  it('promotes an active recurrent finding into the canonical manifest', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'live-audit-finalizer-active-'))
    const planPath = join(directory, 'replay-plan.json')
    const candidatePath = join(directory, 'candidate-bundle.json')
    const outputPath = join(directory, 'artifact')
    const resultPath = join(directory, 'result.json')
    const target = {kind: 'test-id' as const, value: 'project-card-1'}
    const variant = {
      viewport: 'desktop' as const,
      theme: {kind: 'mode' as const, mode: 'light' as const},
      state: 'core',
    }
    const context = {
      role: 'context' as const,
      path: 'context.png',
      alt: 'context',
      caption: 'context',
      integrity: computeEvidenceIntegrity('context.png', png),
    }
    const crop = {
      role: 'crop' as const,
      path: 'crop.png',
      alt: 'crop',
      caption: 'crop',
      integrity: computeEvidenceIntegrity('crop.png', png),
    }
    const requestBase = {
      issueNumber: 42,
      fingerprint: 'fingerprint-1',
      route: '/projects' as const,
      semanticTarget: 'test-id:project-card-1',
      findingClass: 'broken-image' as const,
      assertion: {version: 1 as const, kind: 'image-load' as const, expected: 'loaded' as const},
      actions: [],
      failureSignature: 'image-load:broken',
      responsive: 'not-applicable' as const,
      variant,
      target,
      reproduction: ['Open projects'],
    }
    const request = {
      ...requestBase,
      fingerprint: findingFingerprint(requestBase),
      variantKey: variantKey(variant),
    }
    const plan = {
      version: 1 as const,
      runId: 'scheduled-active',
      origin: 'https://mrbro.dev' as const,
      generatedAt: '2026-07-24T03:30:00.000Z',
      runKind: 'scheduled' as const,
      cron: '30 3 * * *' as const,
      rotatingPresetId: chooseRotatingPreset(new Date('2026-07-24T03:30:00.000Z')),
      issueNumbers: [42],
      exploration: {steps: 0, durationMs: 0},
      coreMatrix: buildCoreMatrix(chooseRotatingPreset(new Date('2026-07-24T03:30:00.000Z'))),
      activeRequests: [request],
    }
    writeFileSync(planPath, serializeReplayPlan(plan))
    writeFileSync(
      candidatePath,
      JSON.stringify({
        version: 1,
        runId: plan.runId,
        runKind: 'scheduled',
        rotatingPresetId: plan.rotatingPresetId,
        generatedAt: plan.generatedAt,
        candidates: [],
        diagnostics: [],
        exploration: plan.exploration,
      }),
    )
    const finding = {
      route: request.route,
      findingClass: request.findingClass,
      assertion: request.assertion,
      actions: request.actions,
      semanticTarget: request.semanticTarget,
      target: request.target,
      failureSignature: request.failureSignature,
      responsive: request.responsive,
      variant: request.variant,
      reproduction: request.reproduction,
      description: 'broken image',
      observations: [
        {
          kind: 'candidate' as const,
          status: 'failure' as const,
          signature: request.failureSignature,
          observedAt: plan.generatedAt,
        },
        {
          kind: 'replay' as const,
          status: 'failure' as const,
          signature: request.failureSignature,
          observedAt: plan.generatedAt,
        },
      ] as [
        {kind: 'candidate'; status: 'failure'; signature: string; observedAt: string},
        {kind: 'replay'; status: 'failure'; signature: string; observedAt: string},
      ],
      evidence: [context, crop] as [typeof context, typeof crop],
    }
    const result = await runFinalizeDiscovery({
      args: ['--plan', planPath, '--candidates', candidatePath, '--out', outputPath, '--result', resultPath],
      browser: {
        finalizeCandidate: async () => ({}),
        finalizeActive: async () => ({
          finding,
          files: [
            {path: 'context.png', bytes: png},
            {path: 'crop.png', bytes: png},
          ],
        }),
      },
    })
    expect(result.findingCount).toBe(1)
    expect(JSON.parse(readFileSync(join(outputPath, 'manifest.json'), 'utf8')).findings).toHaveLength(1)
  })

  it('rejects candidate metadata drift before browser execution', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'live-audit-finalizer-mismatch-'))
    const plan = buildScheduledReplayPlan({
      runId: 'scheduled-mismatch',
      generatedAt: '2026-07-24T03:30:00.000Z',
      exploration: {steps: 0, durationMs: 0},
      activeLedgers: [],
    })
    const planPath = join(directory, 'plan.json')
    const candidatePath = join(directory, 'candidates.json')
    writeFileSync(planPath, serializeReplayPlan(plan))
    writeFileSync(
      candidatePath,
      JSON.stringify({
        version: 1,
        runId: plan.runId,
        runKind: 'scheduled',
        rotatingPresetId: plan.rotatingPresetId,
        generatedAt: '2026-07-24T15:30:00.000Z',
        candidates: [],
        diagnostics: [],
        exploration: plan.exploration,
      }),
    )
    let browserCalls = 0
    await expect(
      runFinalizeDiscovery({
        args: [
          '--plan',
          planPath,
          '--candidates',
          candidatePath,
          '--out',
          join(directory, 'out'),
          '--result',
          join(directory, 'result'),
        ],
        browser: {
          finalizeCandidate: async () => {
            browserCalls += 1
            return {}
          },
          finalizeActive: async () => {
            browserCalls += 1
            return {}
          },
        },
      }),
    ).rejects.toThrow(/generated|metadata|exploration/i)
    expect(browserCalls).toBe(0)
  })

  it('is consumable by the disabled reporter CLI without GitHub writes or secret leakage', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'live-audit-finalizer-reporter-'))
    const plan = buildScheduledReplayPlan({
      runId: 'scheduled-reporter',
      generatedAt: '2026-07-24T03:30:00.000Z',
      exploration: {steps: 0, durationMs: 0},
      activeLedgers: [],
    })
    const planPath = join(directory, 'plan.json')
    const candidatePath = join(directory, 'candidates.json')
    const artifactRoot = join(directory, 'artifact')
    const resultPath = join(directory, 'finalizer-result.json')
    writeFileSync(planPath, serializeReplayPlan(plan))
    writeFileSync(
      candidatePath,
      JSON.stringify({
        version: 1,
        runId: plan.runId,
        runKind: 'scheduled',
        rotatingPresetId: plan.rotatingPresetId,
        generatedAt: plan.generatedAt,
        candidates: [],
        diagnostics: [],
        exploration: plan.exploration,
      }),
    )
    await runFinalizeDiscovery({
      args: ['--plan', planPath, '--candidates', candidatePath, '--out', artifactRoot, '--result', resultPath],
      browser: {finalizeCandidate: async () => ({}), finalizeActive: async () => ({})},
    })
    const secret = 'ghs_super-secret-model-token'
    const calls: string[][] = []
    const exitCode = await runReportAuditCli({
      options: {
        manifestPath: join(artifactRoot, 'manifest.json'),
        artifactRoot,
        resultPath: join(directory, 'reporter-result.json'),
      },
      env: {
        GITHUB_REPOSITORY: 'owner/repo',
        GITHUB_SERVER_URL: 'https://github.com',
        GITHUB_RUN_ID: '123',
        GH_TOKEN: secret,
        LIVE_AUDIT_WRITE_MODE: 'disabled',
      },
      runnerFactory: () => ({
        run: async (args: readonly string[]) => {
          calls.push([...args])
          return {stdout: '[]', stderr: '', exitCode: 0}
        },
      }),
      fetch: async () => new Response('{}', {status: 200}),
    })
    expect(exitCode).toBe(0)
    expect(calls.every(args => !['POST', 'PATCH', 'DELETE', 'PUT'].includes(args.at(-1) ?? ''))).toBe(true)
    expect(readFileSync(join(directory, 'reporter-result.json'), 'utf8')).not.toContain(secret)
  })

  it.each([
    ['empty plan input', (path: string) => truncateSync(path, 0)],
    ['oversized plan input', (path: string) => truncateSync(path, 5_000_001)],
  ])('rejects %s before invoking the browser', async (_label, mutate) => {
    const directory = mkdtempSync(join(tmpdir(), 'live-audit-finalizer-boundary-'))
    const fixture = writeCandidateFixture(directory, makeFinding())
    mutate(fixture.planPath)
    let browserCalls = 0
    await expect(
      runFinalizeDiscovery({
        args: [
          '--plan',
          fixture.planPath,
          '--candidates',
          fixture.candidatePath,
          '--out',
          join(directory, 'out'),
          '--result',
          join(directory, 'result'),
        ],
        browser: {
          finalizeCandidate: async () => {
            browserCalls += 1
            return {}
          },
          finalizeActive: async () => ({}),
        },
      }),
    ).rejects.toThrow(/size|empty|bounded/)
    expect(browserCalls).toBe(0)
  })

  it('rejects input symlinks, traversal output, and post-read identity drift before browser execution', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'live-audit-finalizer-paths-'))
    const fixture = writeCandidateFixture(directory, makeFinding())
    const symlinkPath = join(directory, 'plan-link.json')
    symlinkSync(fixture.planPath, symlinkPath)
    await expect(
      runFinalizeDiscovery({
        args: [
          '--plan',
          symlinkPath,
          '--candidates',
          fixture.candidatePath,
          '--out',
          join(directory, 'out'),
          '--result',
          join(directory, 'result'),
        ],
        browser: {finalizeCandidate: async () => ({}), finalizeActive: async () => ({})},
      }),
    ).rejects.toThrow(/symlink/)
    await expect(
      runFinalizeDiscovery({
        args: [
          '--plan',
          fixture.planPath,
          '--candidates',
          fixture.candidatePath,
          '--out',
          `${directory}/../escape`,
          '--result',
          join(directory, 'result'),
        ],
        browser: {finalizeCandidate: async () => ({}), finalizeActive: async () => ({})},
      }),
    ).rejects.toThrow(/unsafe|path/)
    let lstatCalls = 0
    await expect(
      runFinalizeDiscovery({
        args: [
          '--plan',
          fixture.planPath,
          '--candidates',
          fixture.candidatePath,
          '--out',
          join(directory, 'drift'),
          '--result',
          join(directory, 'result'),
        ],
        fileSystem: {
          lstatSync: path => ({
            ...lstatSync(path),
            isSymbolicLink: () => false,
            isDirectory: () => false,
            isFile: () => true,
            size: lstatCalls++ === 0 ? 10 : 11,
          }),
        },
        browser: {finalizeCandidate: async () => ({}), finalizeActive: async () => ({})},
      }),
    ).rejects.toThrow(/changed|size/)
  })

  it('rejects duplicate, missing, unreferenced, non-PNG, and basename-colliding evidence without an artifact', async () => {
    const cases = [
      {
        name: 'duplicate source path',
        finding: makeFinding(['context.png', 'context.png']),
        files: ['context.png', 'context.png'],
        invalid: false,
      },
      {
        name: 'unreferenced file',
        finding: makeFinding(),
        files: ['context.png', 'crop.png', 'extra.png'],
        invalid: false,
      },
      {name: 'missing reference', finding: makeFinding(), files: ['context.png'], invalid: false},
      {name: 'non-PNG', finding: makeFinding(), files: ['context.png', 'crop.png'], invalid: true},
      {
        name: 'basename collision',
        finding: makeFinding(['a/context.png', 'b/context.png']),
        files: ['a/context.png', 'b/context.png'],
        invalid: false,
      },
    ] as const
    for (const testCase of cases) {
      const directory = mkdtempSync(join(tmpdir(), `live-audit-finalizer-${testCase.name.replaceAll(' ', '-')}-`))
      const fixture = writeCandidateFixture(directory, testCase.finding)
      const outputPath = join(directory, 'artifact')
      const resultPath = join(directory, 'result')
      const bytes = testCase.invalid ? Buffer.from('not-png') : png
      await expect(
        runFinalizeDiscovery({
          args: [
            '--plan',
            fixture.planPath,
            '--candidates',
            fixture.candidatePath,
            '--out',
            outputPath,
            '--result',
            resultPath,
          ],
          browser: {
            finalizeCandidate: async () => ({
              finding: testCase.finding,
              files: testCase.files.map(path => ({path, bytes})),
            }),
            finalizeActive: async () => ({}),
          },
        }),
      ).rejects.toThrow()
      expect(existsSync(outputPath)).toBe(false)
    }
  })

  it('preserves manual no-op parity and canonical provenance while rejecting secrets in parsed input', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'live-audit-finalizer-manual-'))
    const plan = {
      version: 1,
      runId: 'manual-noop',
      origin: 'https://mrbro.dev',
      generatedAt: '2026-07-24T03:30:00.000Z',
      runKind: 'manual',
      issueNumber: 42,
      exploration: {steps: 0, durationMs: 0},
      coreMatrix: [],
      activeRequests: [
        {
          issueNumber: 42,
          fingerprint: findingFingerprint({
            route: '/projects',
            semanticTarget: 'test-id:project-card-1',
            failureSignature: 'image-load:broken',
          }),
          variantKey: variantKey({viewport: 'desktop', theme: {kind: 'mode', mode: 'light'}, state: 'core'}),
          route: '/projects',
          semanticTarget: 'test-id:project-card-1',
          target: {kind: 'test-id', value: 'project-card-1'},
          findingClass: 'broken-image',
          assertion: {version: 1, kind: 'image-load', expected: 'loaded'},
          actions: [],
          failureSignature: 'image-load:broken',
          reproduction: ['Open projects'],
          responsive: 'not-applicable',
          variant: {viewport: 'desktop', theme: {kind: 'mode', mode: 'light'}, state: 'core'},
        },
      ],
    }
    const planPath = join(directory, 'plan.json')
    const candidatePath = join(directory, 'candidates.json')
    writeFileSync(planPath, JSON.stringify(plan))
    writeFileSync(
      candidatePath,
      JSON.stringify({
        version: 1,
        runId: plan.runId,
        runKind: 'manual',
        issueNumber: 42,
        generatedAt: plan.generatedAt,
        candidates: [],
        diagnostics: [],
        exploration: plan.exploration,
      }),
    )
    const result = await runFinalizeDiscovery({
      args: [
        '--plan',
        planPath,
        '--candidates',
        candidatePath,
        '--out',
        join(directory, 'artifact'),
        '--result',
        join(directory, 'result'),
      ],
      browser: {finalizeCandidate: async () => ({}), finalizeActive: async () => ({diagnostic: 'infrastructure'})},
    })
    expect(result).toMatchObject({runKind: 'manual', hasOperations: false, status: 'warning'})
    expect(readFileSync(join(directory, 'artifact', 'provenance', 'replay-plan.json'), 'utf8')).toContain('manual-noop')
    expect(readFileSync(join(directory, 'artifact', 'diagnostics.json'), 'utf8')).not.toContain('secret-token')
  })

  it('does not invoke a later candidate after the global deadline is exhausted', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'live-audit-finalizer-candidate-deadline-'))
    const plan = buildScheduledReplayPlan({
      runId: 'scheduled-candidate-deadline',
      generatedAt: '2026-07-24T03:30:00.000Z',
      exploration: {steps: 0, durationMs: 0},
      activeLedgers: [],
    })
    const planPath = join(directory, 'replay-plan.json')
    const candidatePath = join(directory, 'candidate-bundle.json')
    const outputPath = join(directory, 'artifact')
    const resultPath = join(directory, 'result.json')
    const firstCandidate = makeCandidate(makeFinding())
    const secondCandidate = makeCandidate(makeFinding())
    writeFileSync(planPath, serializeReplayPlan(plan))
    writeFileSync(
      candidatePath,
      JSON.stringify({
        version: 1,
        runId: plan.runId,
        runKind: 'scheduled',
        rotatingPresetId: plan.rotatingPresetId,
        generatedAt: plan.generatedAt,
        candidates: [firstCandidate, secondCandidate],
        diagnostics: [],
        exploration: plan.exploration,
      }),
    )
    let now = 0
    let browserCalls = 0
    await expect(
      runFinalizeDiscovery({
        args: ['--plan', planPath, '--candidates', candidatePath, '--out', outputPath, '--result', resultPath],
        timeoutMs: 10,
        clock: () => new Date(now),
        browser: {
          finalizeCandidate: async () => {
            browserCalls += 1
            now = 10
            return {}
          },
          finalizeActive: async () => ({}),
        },
      }),
    ).rejects.toThrow('candidate replay timed out')
    expect(browserCalls).toBe(1)
  })

  it('does not invoke a later active replay after the global deadline is exhausted', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'live-audit-finalizer-active-deadline-'))
    const planBase = buildScheduledReplayPlan({
      runId: 'scheduled-active-deadline',
      generatedAt: '2026-07-24T03:30:00.000Z',
      exploration: {steps: 0, durationMs: 0},
      activeLedgers: [],
    })
    const plan = {
      ...planBase,
      activeRequests: [
        makeActiveRequest({viewport: 'desktop', theme: {kind: 'mode', mode: 'light'}, state: 'core'}),
        makeActiveRequest({viewport: 'mobile', theme: {kind: 'mode', mode: 'light'}, state: 'core'}),
      ],
      issueNumbers: [42],
    }
    const planPath = join(directory, 'replay-plan.json')
    const candidatePath = join(directory, 'candidate-bundle.json')
    const outputPath = join(directory, 'artifact')
    const resultPath = join(directory, 'result.json')
    writeFileSync(planPath, serializeReplayPlan(plan))
    writeFileSync(
      candidatePath,
      JSON.stringify({
        version: 1,
        runId: plan.runId,
        runKind: 'scheduled',
        rotatingPresetId: plan.rotatingPresetId,
        generatedAt: plan.generatedAt,
        candidates: [],
        diagnostics: [],
        exploration: plan.exploration,
      }),
    )
    let now = 0
    let browserCalls = 0
    await expect(
      runFinalizeDiscovery({
        args: ['--plan', planPath, '--candidates', candidatePath, '--out', outputPath, '--result', resultPath],
        timeoutMs: 10,
        clock: () => new Date(now),
        browser: {
          finalizeCandidate: async () => ({}),
          finalizeActive: async () => {
            browserCalls += 1
            now = 10
            return {}
          },
        },
      }),
    ).rejects.toThrow('active replay timed out')
    expect(browserCalls).toBe(1)
  })

  it('bounds replay time and cleans output state when an adapter never resolves', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'live-audit-finalizer-timeout-'))
    const fixture = writeCandidateFixture(directory, makeFinding())
    const outputPath = join(directory, 'artifact')
    const resultPath = join(directory, 'result')
    await expect(
      runFinalizeDiscovery({
        args: [
          '--plan',
          fixture.planPath,
          '--candidates',
          fixture.candidatePath,
          '--out',
          outputPath,
          '--result',
          resultPath,
        ],
        timeoutMs: 5,
        browser: {
          finalizeCandidate: async () => new Promise<never>(() => {}),
          finalizeActive: async () => ({}),
        },
      }),
    ).rejects.toThrow(/timed out/)
    expect(existsSync(outputPath)).toBe(false)
    expect(existsSync(`${outputPath}.tmp`)).toBe(false)
    expect(existsSync(`${resultPath}.tmp`)).toBe(false)
  })
})
