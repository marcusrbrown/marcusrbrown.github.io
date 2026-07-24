import type {GhCommandResult, GhRunner} from '../../scripts/live-audit/github-runner'
import {Buffer} from 'node:buffer'
import {createHash} from 'node:crypto'
import {mkdtempSync, symlinkSync, writeFileSync} from 'node:fs'
import {appendFile, lstat, readFile, rename, unlink, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it, vi} from 'vitest'
import {
  MAX_LEGACY_DESCRIPTOR_BYTES,
  parseAdoptLegacyIssueCliArgs,
  runAdoptLegacyIssueCli,
  type AdoptLegacyIssueCliFileSystem,
} from '../../scripts/live-audit/adopt-legacy-issue'
import {parseLegacyAdoptionDescriptor, type LegacyAdoptionDescriptor} from '../../scripts/live-audit/contract'
import {parseIssueLedger, renderIssueLedger} from '../../scripts/live-audit/issue-ledger'
import {adoptLegacyIssue, decideLegacyAdoption} from '../../scripts/live-audit/reporter'

const humanBody = '# Existing legacy report\n\nPreserve these bytes.\n'
const bodySha256 = createHash('sha256').update(humanBody).digest('hex')

const descriptor = (): LegacyAdoptionDescriptor => ({
  version: 1,
  repository: {owner: 'example', repo: 'legacy-site'},
  issueNumber: 17,
  expectedIssue: {
    updatedAt: '2026-07-20T03:30:00.000Z',
    state: 'open',
    stateReason: null,
    labels: ['legacy', 'visual-audit'],
    humanBodySha256: bodySha256,
    ledger: 'absent',
  },
  route: '/projects',
  semanticTarget: 'project-card-image',
  findingClass: 'broken-image',
  failureSignature: 'broken image',
  responsive: 'not-applicable',
  variants: [
    {
      viewport: 'mobile',
      theme: {kind: 'preset', presetId: 'dracula'},
      state: 'default',
      target: {kind: 'test-id', value: 'project-card-image'},
      assertion: {version: 1, kind: 'image-load', expected: 'loaded'},
      actions: [],
      reproduction: ['Open projects'],
    },
  ],
})

const rawIssue = (input: {
  number?: number
  body: string
  labels: readonly string[]
  updatedAt?: string
  state?: 'open' | 'closed'
  stateReason?: string | null
}) => ({
  number: input.number ?? 17,
  title: 'legacy issue',
  body: input.body,
  state: input.state ?? 'open',
  state_reason: input.stateReason ?? null,
  labels: input.labels.map(name => ({name})),
  comments: 0,
  updated_at: input.updatedAt ?? '2026-07-20T03:30:00.000Z',
})

const adoptionRunner = (
  options: {
    readonly issueNumber?: number
    readonly labels?: readonly string[]
    readonly body?: string
    readonly state?: 'open' | 'closed'
    readonly stateReason?: string | null
    readonly failLabels?: boolean
    readonly onGet?: (count: number, issue: ReturnType<typeof rawIssue>) => void
  } = {},
) => {
  const issue = rawIssue({
    number: options.issueNumber,
    body: options.body ?? humanBody,
    labels: options.labels ?? descriptor().expectedIssue.labels,
    state: options.state,
    stateReason: options.stateReason,
  })
  let failLabels = options.failLabels ?? false
  let getCount = 0
  const writes: string[] = []
  const run = vi.fn(
    async (args: readonly string[], runOptions?: {readonly input?: string}): Promise<GhCommandResult> => {
      const endpoint = args[1] ?? ''
      if (endpoint.endsWith(`/issues/${options.issueNumber ?? 17}/labels`) && args.includes('PUT')) {
        if (failLabels) {
          failLabels = false
          return {stdout: '', stderr: 'label failure', exitCode: 1}
        }
        const input = JSON.parse(runOptions?.input ?? '{}') as {labels: string[]}
        issue.labels = input.labels.map(name => ({name}))
        writes.push('labels-update')
        return {stdout: JSON.stringify(issue.labels), stderr: '', exitCode: 0}
      }
      if (endpoint.endsWith(`/issues/${options.issueNumber ?? 17}`) && args.includes('PATCH')) {
        const input = JSON.parse(runOptions?.input ?? '{}') as {body?: string}
        if (input.body !== undefined) issue.body = input.body
        writes.push('body-update')
        return {stdout: JSON.stringify(issue), stderr: '', exitCode: 0}
      }
      if (endpoint.endsWith(`/issues/${options.issueNumber ?? 17}`)) {
        getCount += 1
        options.onGet?.(getCount, issue)
        return {stdout: JSON.stringify(issue), stderr: '', exitCode: 0}
      }
      throw new Error(`unexpected endpoint: ${endpoint}`)
    },
  )
  return {runner: {run} satisfies GhRunner, getIssue: () => issue, writes}
}

const depsFor = (
  memory: ReturnType<typeof adoptionRunner>,
  mode: 'disabled' | 'manual-only' | 'enabled' = 'enabled',
  repository = descriptor().repository,
  overrides: {readonly now?: () => Date; readonly reporterActor?: string} = {},
) => ({
  repository,
  runner: memory.runner,
  reporterActor: overrides.reporterActor ?? 'legacy-adopter',
  writeMode: mode,
  ...(overrides.now === undefined ? {} : {now: overrides.now}),
})

const persistedAdoptionCompletedAt = (body: string): string | undefined => {
  const operation = parseIssueLedger(body).ledger.operations.find(operation => operation.checkpoint === 'legacy-adopt')
  return operation !== undefined && 'completedAt' in operation ? operation.completedAt : undefined
}

const cliFs: AdoptLegacyIssueCliFileSystem = {
  appendFile,
  lstat,
  readFile,
  rename,
  unlink,
  writeFile,
}

describe('legacy issue adoption', () => {
  it('parses a closed descriptor and derives identity fields', () => {
    const parsed = parseLegacyAdoptionDescriptor(descriptor())
    expect(parsed.fingerprint).toMatch(/^[a-f0-9]{32}$/)
    expect(parsed.adoptionKey).toMatch(/^[a-f0-9]{32}$/)
    expect(parsed.variants).toHaveLength(1)
  })

  it('exposes a reporter-authority decision and execution result', async () => {
    const runner = {
      run: async () => ({
        stdout: JSON.stringify({
          number: 17,
          title: 'legacy issue',
          body: humanBody,
          state: 'open',
          state_reason: null,
          labels: descriptor().expectedIssue.labels.map(name => ({name})),
          comments: 0,
          updated_at: descriptor().expectedIssue.updatedAt,
        }),
        stderr: '',
        exitCode: 0,
      }),
    }
    const dependencies = {
      repository: descriptor().repository,
      runner,
      reporterActor: 'legacy-adopter',
      writeMode: 'disabled' as const,
    }
    const decision = await decideLegacyAdoption({descriptor: descriptor(), ...dependencies})
    expect(decision.operations.map(operation => operation.kind)).toEqual(['body-update', 'labels-update'])
    const result = await adoptLegacyIssue({descriptor: descriptor(), ...dependencies})
    expect(result.status).toBe('warning')
    expect(result.writeCount).toBe(0)
  })

  it('strictly parses the local adoption CLI arguments', () => {
    expect(parseAdoptLegacyIssueCliArgs(['--descriptor', 'descriptor.json', '--result', 'result.json'])).toEqual({
      descriptorPath: 'descriptor.json',
      resultPath: 'result.json',
    })
  })

  it('rejects prose, extra keys, unsafe text, duplicate variants, and assertion mismatches', () => {
    const valid = descriptor()
    const primary = valid.variants[0]
    if (!primary) throw new Error('descriptor variant fixture missing')
    expect(() => parseLegacyAdoptionDescriptor({...valid, comments: 'do not accept prose'})).toThrow()
    expect(() => parseLegacyAdoptionDescriptor({...valid, failureSignature: 'Broken image'})).toThrow(/normalized/)
    expect(() =>
      parseLegacyAdoptionDescriptor({
        ...valid,
        variants: [...valid.variants, {...primary, state: 'default\u0000'}],
      }),
    ).toThrow()
    expect(() =>
      parseLegacyAdoptionDescriptor({
        ...valid,
        variants: [...valid.variants, {...primary, viewport: 'desktop'}],
      }),
    ).not.toThrow()
    expect(() =>
      parseLegacyAdoptionDescriptor({
        ...valid,
        variants: [...valid.variants, {...primary}],
      }),
    ).toThrow(/duplicate/)
    expect(() =>
      parseLegacyAdoptionDescriptor({
        ...valid,
        variants: [
          {
            ...primary,
            assertion: {version: 1, kind: 'visibility', expected: 'visible'},
          },
        ],
      }),
    ).toThrow(/class|assertion/)
  })

  it('plans and executes body adoption before the canonical label union', async () => {
    const memory = adoptionRunner({labels: ['legacy', 'visual-audit']})
    const decision = await decideLegacyAdoption({descriptor: descriptor(), ...depsFor(memory)})
    expect(decision.operations.map(operation => operation.kind)).toEqual(['body-update', 'labels-update'])
    expect(decision.operations[0]?.key).toBe(decision.adoptionKey)
    const result = await adoptLegacyIssue({descriptor: descriptor(), ...depsFor(memory)})
    expect(result.status).toBe('success')
    expect(result.writeCount).toBe(2)
    expect(memory.writes).toEqual(['body-update', 'labels-update'])
    expect(memory.getIssue()?.labels.map(label => label.name)).toEqual(['fro-bot', 'legacy', 'visual-audit'])
    const body = memory.getIssue()?.body ?? ''
    const parsed = parseIssueLedger(body)
    expect(parsed.humanBody).toBe(humanBody)
    expect(parsed.ledger.operations).toHaveLength(1)
    expect(parsed.ledger.operations[0]?.checkpoint).toBe('legacy-adopt')
    expect(parsed.ledger.variants.every(variant => variant.cleanCount === 0)).toBe(true)
    expect(parsed.ledger.replay).toHaveLength(1)
  })

  it('keeps the complete operation plan stable across disabled, manual-only, and enabled modes', async () => {
    const plans = await Promise.all(
      (['disabled', 'manual-only', 'enabled'] as const).map(async mode => {
        const memory = adoptionRunner()
        const result = await adoptLegacyIssue({descriptor: descriptor(), ...depsFor(memory, mode)})
        return {mode, result, writes: memory.writes}
      }),
    )
    expect(plans.map(item => item.result.operations.map(operation => operation.kind))).toEqual([
      ['body-update', 'labels-update'],
      ['body-update', 'labels-update'],
      ['body-update', 'labels-update'],
    ])
    expect(plans[0]?.result.writeCount).toBe(0)
    expect(plans[0]?.result.status).toBe('warning')
    expect(plans[1]?.result.writeCount).toBe(2)
    expect(plans[2]?.result.writeCount).toBe(2)
    expect(plans[0]?.writes).toEqual([])
  })

  it('recovers a body-only retry by planning labels only and becomes idempotent', async () => {
    const memory = adoptionRunner({failLabels: true})
    const first = await adoptLegacyIssue({descriptor: descriptor(), ...depsFor(memory)})
    expect(first.status).toBe('failure')
    expect(first.writeCount).toBe(1)
    const retry = await decideLegacyAdoption({descriptor: descriptor(), ...depsFor(memory)})
    expect(retry.operations.map(operation => operation.kind)).toEqual(['labels-update'])
    const second = await adoptLegacyIssue({descriptor: descriptor(), ...depsFor(memory)})
    expect(second.status).toBe('success')
    expect(second.writeCount).toBe(1)
    const already = await adoptLegacyIssue({descriptor: descriptor(), ...depsFor(memory)})
    expect(already.status).toBe('warning')
    expect(already.writeCount).toBe(0)
    expect(already.diagnosticDetails[0]?.code).toBe('already-adopted')
  })

  it('persists the first adoption clock across partial recovery and idempotent retries', async () => {
    const firstTime = new Date('2026-07-21T01:02:03.000Z')
    let currentTime = firstTime
    const memory = adoptionRunner({failLabels: true})
    const dependencies = () => depsFor(memory, 'enabled', descriptor().repository, {now: () => currentTime})

    const first = await adoptLegacyIssue({descriptor: descriptor(), ...dependencies()})
    expect(first.status).toBe('failure')
    expect(persistedAdoptionCompletedAt(memory.getIssue()?.body ?? '')).toBe(firstTime.toISOString())

    currentTime = new Date('2026-07-22T04:05:06.000Z')
    const retry = await adoptLegacyIssue({descriptor: descriptor(), ...dependencies()})
    expect(retry.status).toBe('success')
    expect(retry.operations.map(operation => operation.kind)).toEqual(['labels-update'])
    expect(persistedAdoptionCompletedAt(memory.getIssue()?.body ?? '')).toBe(firstTime.toISOString())

    currentTime = new Date('2026-07-23T07:08:09.000Z')
    const already = await adoptLegacyIssue({descriptor: descriptor(), ...dependencies()})
    expect(already.status).toBe('warning')
    expect(already.writeCount).toBe(0)
    expect(persistedAdoptionCompletedAt(memory.getIssue()?.body ?? '')).toBe(firstTime.toISOString())
  })

  it('rejects bot-suffixed reporter actors at the reporter authority boundary', async () => {
    const memory = adoptionRunner()
    await expect(
      adoptLegacyIssue({
        descriptor: descriptor(),
        ...depsFor(memory, 'disabled', descriptor().repository, {reporterActor: 'operator[bot]'}),
      }),
    ).rejects.toThrow(/bot|actor/i)
    expect(memory.writes).toEqual([])
  })

  it('refuses drift before body mutation and between body and label mutations', async () => {
    const beforeBody = adoptionRunner({
      onGet: (count, issue) => {
        if (count === 2) issue.labels = [{name: 'unexpected'}]
      },
    })
    const beforeBodyResult = await adoptLegacyIssue({descriptor: descriptor(), ...depsFor(beforeBody)})
    expect(beforeBodyResult.status).toBe('failure')
    expect(beforeBodyResult.writeCount).toBe(0)
    expect(beforeBody.writes).toEqual([])

    const betweenMutations = adoptionRunner({
      onGet: (count, issue) => {
        if (count === 5) issue.labels = [{name: 'unexpected'}]
      },
    })
    const betweenResult = await adoptLegacyIssue({descriptor: descriptor(), ...depsFor(betweenMutations)})
    expect(betweenResult.status).toBe('failure')
    expect(betweenResult.writeCount).toBe(1)
    expect(betweenMutations.writes).toEqual(['body-update'])
  })

  it('refuses suppression, closed issues, baseline drift, and normal ledgers without writes', async () => {
    for (const options of [
      {labels: ['visual-audit-suppressed']},
      {state: 'closed' as const},
      {body: `${humanBody}changed`},
    ]) {
      const memory = adoptionRunner(options)
      const result = await adoptLegacyIssue({descriptor: descriptor(), ...depsFor(memory)})
      expect(result.writeCount).toBe(0)
      expect(memory.writes).toEqual([])
    }
    const normalLedgerMemory = adoptionRunner()
    const adopted = await adoptLegacyIssue({descriptor: descriptor(), ...depsFor(normalLedgerMemory)})
    expect(adopted.status).toBe('success')
    const normalBody = normalLedgerMemory.getIssue()?.body ?? ''
    const normalLedger = parseIssueLedger(normalBody).ledger
    normalLedger.operations = [
      {
        key: parseLegacyAdoptionDescriptor(descriptor()).adoptionKey,
        checkpoint: 'initial-create',
        completedAt: descriptor().expectedIssue.updatedAt,
      },
    ]
    const normalIssue = normalLedgerMemory.getIssue()
    if (!normalIssue) throw new Error('normal issue fixture missing')
    normalIssue.body = `${humanBody}${renderIssueLedger(normalLedger)}`
    const refused = await adoptLegacyIssue({descriptor: descriptor(), ...depsFor(normalLedgerMemory)})
    expect(refused.status).toBe('failure')
    expect(refused.writeCount).toBe(0)
  })

  it('supports multiple replay variants for any synthetic repository and issue', async () => {
    const base = descriptor()
    const primary = base.variants[0]
    if (!primary) throw new Error('descriptor variant fixture missing')
    const twoVariants: LegacyAdoptionDescriptor = {
      ...base,
      repository: {owner: 'other-owner', repo: 'other-repo'},
      issueNumber: 42,
      expectedIssue: {...base.expectedIssue},
      variants: [...base.variants, {...primary, viewport: 'desktop'}],
    }
    const memory = adoptionRunner({issueNumber: 42})
    const result = await adoptLegacyIssue({
      descriptor: twoVariants,
      ...depsFor(memory, 'enabled', twoVariants.repository),
    })
    expect(result.status).toBe('success')
    expect(result.writeCount).toBe(2)
    expect(parseIssueLedger(memory.getIssue()?.body ?? '').ledger.replay).toHaveLength(2)
  })

  it('rejects CLI invalid paths and writes bounded redacted results atomically', async () => {
    const root = mkdtempSync(join(tmpdir(), 'live-audit-legacy-cli-'))
    const descriptorPath = join(root, 'descriptor.json')
    const resultPath = join(root, 'result.json')
    writeFileSync(descriptorPath, JSON.stringify(descriptor()))
    const runnerFactory = vi.fn(() => adoptionRunner().runner)
    const env = {GITHUB_REPOSITORY: 'example/legacy-site', GH_TOKEN: 'secret-token', LIVE_AUDIT_ADOPTER: 'operator'}
    const exitCode = await runAdoptLegacyIssueCli({
      argv: ['--descriptor', descriptorPath, '--result', resultPath],
      env,
      fs: cliFs,
      runnerFactory,
    })
    expect(exitCode).toBe(0)
    expect(runnerFactory).toHaveBeenCalledTimes(1)
    expect(JSON.parse(await readFile(resultPath, 'utf8'))).toMatchObject({version: 1, status: 'warning', writeCount: 0})
    expect(() => parseAdoptLegacyIssueCliArgs(['--descriptor', descriptorPath])).toThrow()
    expect(() =>
      parseAdoptLegacyIssueCliArgs(['--descriptor', descriptorPath, '--result', resultPath, '--unknown']),
    ).toThrow()
    const symlinkPath = join(root, 'symlink.json')
    symlinkSync(descriptorPath, symlinkPath)
    await expect(
      runAdoptLegacyIssueCli({
        argv: ['--descriptor', symlinkPath, '--result', resultPath],
        env,
        fs: cliFs,
        runnerFactory,
      }),
    ).rejects.toThrow()
    writeFileSync(descriptorPath, Buffer.alloc(MAX_LEGACY_DESCRIPTOR_BYTES + 1, 0x20))
    await expect(
      runAdoptLegacyIssueCli({
        argv: ['--descriptor', descriptorPath, '--result', resultPath],
        env,
        fs: cliFs,
        runnerFactory,
      }),
    ).rejects.toThrow()
  })

  it('requires a bounded human CLI adopter before constructing the runner', async () => {
    const root = mkdtempSync(join(tmpdir(), 'live-audit-legacy-actor-'))
    const descriptorPath = join(root, 'descriptor.json')
    const resultPath = join(root, 'result.json')
    writeFileSync(descriptorPath, JSON.stringify(descriptor()))
    const runnerFactory = vi.fn(() => adoptionRunner().runner)
    const baseEnv = {GITHUB_REPOSITORY: 'example/legacy-site', GH_TOKEN: 'secret-token'}

    for (const actor of [undefined, '', 'operator[bot]', 'operator\u0000']) {
      runnerFactory.mockClear()
      await expect(
        runAdoptLegacyIssueCli({
          argv: ['--descriptor', descriptorPath, '--result', resultPath],
          env: {...baseEnv, ...(actor === undefined ? {} : {LIVE_AUDIT_ADOPTER: actor})},
          fs: cliFs,
          runnerFactory,
        }),
      ).rejects.toThrow()
      expect(runnerFactory).not.toHaveBeenCalled()
    }

    const valid = await runAdoptLegacyIssueCli({
      argv: ['--descriptor', descriptorPath, '--result', resultPath],
      env: {...baseEnv, LIVE_AUDIT_ADOPTER: 'operator'},
      fs: cliFs,
      runnerFactory,
    })
    expect(valid).toBe(0)
    expect(runnerFactory).toHaveBeenCalledTimes(1)
  })
})
