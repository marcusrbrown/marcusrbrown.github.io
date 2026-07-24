import type {Page} from '@playwright/test'
import {Buffer} from 'node:buffer'
import {randomBytes} from 'node:crypto'
import {
  closeSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import {basename, dirname, join, resolve} from 'node:path'
import process from 'node:process'
import {parseArgs} from 'node:util'

import {
  parseAuditManifest,
  type AuditManifest,
  type EvidenceReference,
  type Finding,
  type ValidationClean,
  type ValidationReplay,
} from './contract'
import {
  captureTargetEvidence,
  computeEvidenceIntegrity,
  evaluateAuditAssertion,
  finalizeActiveVariant,
  finalizeCandidate,
  parseCandidateBundle,
  prepareAuditReplayState,
  validatePng,
  type ActiveVariantReplayRequest,
  type Candidate,
  type CapturedEvidence,
  type ReplayObservation,
} from './evidence'
import {MAX_REPLAY_PLAN_BYTES, parseReplayPlanJson, serializeReplayPlan} from './replay-plan'

export const MAX_FINALIZER_INPUT_BYTES = MAX_REPLAY_PLAN_BYTES
export const FINALIZER_RESULT_VERSION = 1
export const MAX_FINALIZATION_MS = 300_000

export interface FinalizerFileSystem {
  readonly readFileSync?: (path: string) => string | Uint8Array
  readonly writeFileSync?: (
    path: string,
    data: string | Uint8Array,
    options?: {readonly flag?: string; readonly mode?: number},
  ) => void
  readonly mkdirSync?: (path: string, options?: {readonly recursive?: boolean; readonly mode?: number}) => void
  readonly renameSync?: (from: string, to: string) => void
  readonly rmSync?: (path: string, options?: {readonly recursive?: boolean; readonly force?: boolean}) => void
  readonly lstatSync?: (path: string) => {
    isSymbolicLink: () => boolean
    isDirectory: () => boolean
    isFile?: () => boolean
    size?: number
    dev?: number
    ino?: number
  }
  readonly realpathSync?: (path: string) => string
  readonly readdirSync?: (path: string) => string[]
  readonly openSync?: (path: string, flags: string) => number
  readonly fsyncSync?: (fd: number) => void
  readonly closeSync?: (fd: number) => void
}

export interface FinalizerEvidenceFile {
  readonly path: string
  readonly bytes: Uint8Array
}

export interface FinalizerReplayOutput {
  readonly finding?: Finding
  readonly validation?: ValidationReplay
  readonly diagnostic?: string
  readonly files?: readonly FinalizerEvidenceFile[]
}

export interface FinalizerBrowserAdapter {
  readonly finalizeCandidate: (candidate: Candidate) => Promise<FinalizerReplayOutput>
  readonly finalizeActive: (request: ActiveVariantReplayRequest) => Promise<FinalizerReplayOutput>
  readonly close?: () => Promise<void>
}

export interface RunFinalizeDiscoveryInput {
  readonly args: readonly string[]
  readonly fileSystem?: FinalizerFileSystem
  readonly browser?: FinalizerBrowserAdapter
  readonly clock?: () => Date
  readonly timeoutMs?: number
}

export interface FinalizationResultFile {
  readonly version: typeof FINALIZER_RESULT_VERSION
  readonly runKind: 'manual' | 'scheduled'
  readonly hasOperations: boolean
  readonly findingCount: number
  readonly validationCount: number
  readonly diagnosticCount: number
  readonly manifestPath: 'manifest.json'
  readonly status: 'success' | 'warning' | 'failure'
}

interface FinalizerArgs {
  readonly plan: string
  readonly candidates: string
  readonly out: string
  readonly result: string
}

const defaultFileSystem: Required<FinalizerFileSystem> = {
  readFileSync: path => readFileSync(path),
  writeFileSync: (path, data, options) => writeFileSync(path, data, options),
  mkdirSync: (path, options) => mkdirSync(path, options),
  renameSync,
  rmSync: (path, options) => rmSync(path, options),
  lstatSync,
  realpathSync,
  readdirSync: path => readdirSync(path),
  openSync,
  fsyncSync,
  closeSync,
}

const knownArgs = new Set(['--plan', '--candidates', '--out', '--result'])

const parseFinalizerArgs = (args: readonly string[]): FinalizerArgs => {
  const counts = new Map<string, number>()
  for (const argument of args) {
    if (argument.startsWith('--') && knownArgs.has(argument)) counts.set(argument, (counts.get(argument) ?? 0) + 1)
  }
  if ([...counts.values()].some(count => count > 1)) throw new Error('duplicate finalizer argument')
  const parsed = parseArgs({
    args: [...args],
    options: {
      plan: {type: 'string'},
      candidates: {type: 'string'},
      out: {type: 'string'},
      result: {type: 'string'},
    },
    allowPositionals: true,
    strict: true,
  })
  if (parsed.positionals.length > 0) throw new Error('positional finalizer arguments are not allowed')
  const values = parsed.values
  if (
    typeof values.plan !== 'string' ||
    typeof values.candidates !== 'string' ||
    typeof values.out !== 'string' ||
    typeof values.result !== 'string'
  )
    throw new Error('missing finalizer argument: plan/candidates/out/result')
  return {plan: values.plan, candidates: values.candidates, out: values.out, result: values.result}
}

const inputBytes = (raw: string | Uint8Array): Uint8Array => (typeof raw === 'string' ? Buffer.from(raw) : raw)

const withTimeout = async <T>(operation: () => Promise<T>, remainingMs: () => number, label: string): Promise<T> => {
  const timeoutMs = remainingMs()
  if (timeoutMs <= 0) throw new Error(`${label} timed out`)
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      operation(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs)
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

const safePath = (path: string): boolean => {
  const absolute = resolve(path)
  return absolute !== dirname(absolute) && !path.split('/').some(part => part === '..' || part === '.')
}

const assertSafeInputPath = (
  fileSystem: FinalizerFileSystem,
  path: string,
): {size: number; dev?: number; ino?: number} => {
  if (!fileSystem.lstatSync || !safePath(path)) throw new Error('unsafe finalizer input path')
  const finalStat = fileSystem.lstatSync(path)
  if (finalStat.isSymbolicLink()) throw new Error('finalizer input path contains a symlink')
  if (fileSystem.realpathSync && !safePath(fileSystem.realpathSync(path)))
    throw new Error('unsafe finalizer input path')
  if (!finalStat || finalStat.isDirectory() || finalStat.isFile?.() === false)
    throw new Error('finalizer input is not a regular file')
  if (finalStat.size === undefined || finalStat.size <= 0 || finalStat.size > MAX_FINALIZER_INPUT_BYTES)
    throw new Error('finalizer input size is outside the bounded limit')
  return {size: finalStat.size, dev: finalStat.dev, ino: finalStat.ino}
}

const readBoundedInput = (fileSystem: FinalizerFileSystem, path: string, label: string): string | Uint8Array => {
  if (!fileSystem.readFileSync) throw new Error('finalizer filesystem cannot read input')
  const before = assertSafeInputPath(fileSystem, path)
  const raw = fileSystem.readFileSync(path)
  const bytes = inputBytes(raw)
  const after = assertSafeInputPath(fileSystem, path)
  if (
    after.size !== before.size ||
    (before.dev !== undefined && after.dev !== before.dev) ||
    (before.ino !== undefined && after.ino !== before.ino) ||
    bytes.byteLength !== after.size
  )
    throw new Error(`${label} changed while it was being read`)
  if (bytes.byteLength > MAX_FINALIZER_INPUT_BYTES) throw new Error(`${label} exceeds byte limit`)
  return typeof raw === 'string' ? raw : bytes
}

const readJson = (fileSystem: FinalizerFileSystem, path: string, label: string): unknown => {
  const raw = readBoundedInput(fileSystem, path, label)
  try {
    return JSON.parse(typeof raw === 'string' ? raw : Buffer.from(raw).toString('utf8')) as unknown
  } catch {
    throw new Error(`invalid ${label} JSON`)
  }
}

const hasExactKeys = (value: unknown, keys: readonly string[]): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

const recordValue = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && key in value
    ? (value as Record<string, unknown>)[key]
    : undefined

const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (typeof value === 'object' && value !== null) {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

const ensureFreshOutput = (fileSystem: FinalizerFileSystem, output: string): void => {
  if (!safePath(output) || !fileSystem.lstatSync) throw new Error('unsafe finalizer output path')
  try {
    const stat = fileSystem.lstatSync(output)
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('finalizer output must be a fresh directory')
    if (!fileSystem.readdirSync || fileSystem.readdirSync(output).length > 0)
      throw new Error('finalizer output is not empty')
    throw new Error('finalizer output already exists')
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('finalizer output')) throw error
    const parent = dirname(output)
    if (fileSystem.lstatSync(parent).isSymbolicLink()) throw new Error('unsafe finalizer output parent')
  }
}

const writeAtomically = (fileSystem: FinalizerFileSystem, path: string, data: string | Uint8Array): void => {
  if (!fileSystem.writeFileSync || !fileSystem.renameSync) throw new Error('finalizer filesystem cannot write')
  const temporary = `${path}.tmp`
  fileSystem.writeFileSync(temporary, data, {flag: 'wx', mode: 0o600})
  fileSystem.renameSync(temporary, path)
}

const remapReference = (reference: EvidenceReference, files: Map<string, Uint8Array>): EvidenceReference => {
  const name = basename(reference.path)
  const bytes = files.get(reference.path) ?? files.get(name)
  if (!bytes) throw new Error(`missing finalizer evidence file: ${reference.path}`)
  const path = `evidence/${name}`
  const png = validatePng(bytes)
  const integrity = computeEvidenceIntegrity(path, bytes)
  if (integrity.width !== png.width || integrity.height !== png.height)
    throw new Error('finalizer evidence dimensions disagree')
  return {...reference, path, integrity}
}

const remapEvidencePair = (
  evidence: [EvidenceReference, EvidenceReference],
  files: Map<string, Uint8Array>,
): [EvidenceReference, EvidenceReference] => [remapReference(evidence[0], files), remapReference(evidence[1], files)]

const remapFinding = (finding: Finding, files: Map<string, Uint8Array>): Finding => {
  const evidence = remapEvidencePair(finding.evidence, files)
  if (finding.responsive === 'not-applicable') return {...finding, evidence}
  return {
    ...finding,
    evidence,
    counterpart: {
      ...finding.counterpart,
      evidence: remapEvidencePair(finding.counterpart.evidence, files),
    },
  }
}

const remapValidation = (validation: ValidationReplay, files: Map<string, Uint8Array>): ValidationReplay => {
  if (validation.status !== 'clean') return validation
  const clean: ValidationClean = {
    ...validation,
    evidence: remapEvidencePair(validation.evidence, files),
  }
  return clean
}

const evidenceReferences = (
  findings: readonly Finding[],
  validations: readonly ValidationReplay[],
): EvidenceReference[] => [
  ...findings.flatMap(finding => [
    ...finding.evidence,
    ...(finding.responsive === 'not-applicable' ? [] : finding.counterpart.evidence),
  ]),
  ...validations.flatMap(validation => (validation.status === 'clean' ? validation.evidence : [])),
]

const assertEvidenceSealing = (
  findings: readonly Finding[],
  validations: readonly ValidationReplay[],
  files: Map<string, Uint8Array>,
): void => {
  const references = evidenceReferences(findings, validations)
  const sourcePaths = new Set<string>()
  const outputPaths = new Set<string>()
  for (const reference of references) {
    if (sourcePaths.has(reference.path)) throw new Error('duplicate finalizer evidence path')
    sourcePaths.add(reference.path)
    const outputPath = `evidence/${basename(reference.path)}`
    if (outputPaths.has(outputPath)) throw new Error('finalizer evidence basename collision')
    outputPaths.add(outputPath)
    if (!files.has(reference.path)) throw new Error(`missing finalizer evidence file: ${reference.path}`)
  }
  if (files.size !== sourcePaths.size) throw new Error('finalizer evidence contains an unreferenced file')
  for (const path of files.keys()) {
    if (path !== basename(path) || path.includes('..') || path.includes('/') || path.includes('\\'))
      throw new Error('unsafe finalizer evidence file path')
    if (!sourcePaths.has(path)) throw new Error('finalizer evidence contains an unreferenced file')
  }
}

const createResult = (
  runKind: 'manual' | 'scheduled',
  manifest: AuditManifest,
  diagnosticCount: number,
): FinalizationResultFile => ({
  version: FINALIZER_RESULT_VERSION,
  runKind,
  hasOperations: manifest.findings.length > 0 || manifest.validations.length > 0,
  findingCount: manifest.findings.length,
  validationCount: manifest.validations.length,
  diagnosticCount,
  manifestPath: 'manifest.json',
  status: diagnosticCount === 0 ? 'success' : 'warning',
})

const defaultBrowser = async (temporaryDirectory: string): Promise<FinalizerBrowserAdapter> => {
  const {chromium} = await import('@playwright/test')
  mkdirSync(temporaryDirectory, {recursive: true, mode: 0o700})
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
  try {
    browser = await chromium.launch({timeout: 30_000})
    const context = await browser.newContext()
    const page = await context.newPage()
    const observations = new Map<string, ReplayObservation>()
    const replayKey = (input: Candidate | ActiveVariantReplayRequest, variant: Candidate['variant']): string =>
      `${input.route}|${JSON.stringify(variant)}`
    const capture = async (
      pageTarget: Page,
      input: Candidate | ActiveVariantReplayRequest,
      variant: Candidate['variant'],
    ): Promise<CapturedEvidence> =>
      captureTargetEvidence(pageTarget, input.target, temporaryDirectory, 'finalizer evidence', {
        fingerprint: 'fingerprint' in input ? input.fingerprint : 'candidate',
        variantKey: 'variantKey' in input ? input.variantKey : 'candidate',
        route: input.route,
        viewport: variant.viewport,
        theme: variant.theme,
        semanticTarget: input.semanticTarget,
        observedResult: observations.get(replayKey(input, variant))?.status === 'clean' ? 'clean' : 'failure',
      })
    const run = async (
      input: Candidate | ActiveVariantReplayRequest,
      variant: Candidate['variant'] = input.variant,
    ): Promise<ReplayObservation> => {
      const replayInput = {...input, variant}
      await prepareAuditReplayState(page, replayInput)
      const observation = await evaluateAuditAssertion(page, input.target, input.assertion)
      observations.set(replayKey(input, variant), observation)
      return observation
    }
    const finalize = async (input: Candidate | ActiveVariantReplayRequest): Promise<FinalizerReplayOutput> => {
      const replay = () => run(input)
      const evidence = () => capture(page, input, input.variant)
      const counterpartReplay =
        input.responsive === 'not-applicable' ? undefined : (variant: Candidate['variant']) => run(input, variant)
      const counterpartCapture =
        input.responsive === 'not-applicable'
          ? undefined
          : (variant: Candidate['variant']) => capture(page, input, variant)
      const output: FinalizerReplayOutput =
        'issueNumber' in input
          ? await finalizeActiveVariant(input, replay, evidence, counterpartReplay, counterpartCapture)
          : await finalizeCandidate(input, replay, evidence, counterpartReplay, counterpartCapture)
      const files: FinalizerEvidenceFile[] = []
      const references = output.finding
        ? [
            ...output.finding.evidence,
            ...(output.finding.responsive === 'not-applicable' ? [] : output.finding.counterpart.evidence),
          ]
        : output.validation?.status === 'clean'
          ? output.validation.evidence
          : []
      for (const reference of references) {
        const bytes = Buffer.from(readFileSync(join(temporaryDirectory, reference.path)))
        files.push({path: reference.path, bytes})
      }
      return {...output, files}
    }
    return {
      finalizeCandidate: candidate => finalize(candidate),
      finalizeActive: request => finalize(request),
      close: async () => {
        await context.close()
        await browser?.close()
        rmSync(temporaryDirectory, {recursive: true, force: true})
      },
    }
  } catch (error) {
    await browser?.close()
    rmSync(temporaryDirectory, {recursive: true, force: true})
    throw error
  }
}

export const runFinalizeDiscovery = async (input: RunFinalizeDiscoveryInput): Promise<FinalizationResultFile> => {
  const args = parseFinalizerArgs(input.args)
  const fileSystem = {...defaultFileSystem, ...(input.fileSystem ?? {})}
  const plan = parseReplayPlanJson(readBoundedInput(fileSystem, args.plan, 'replay plan'))
  const rawCandidateBundle = readJson(fileSystem, args.candidates, 'candidate bundle')
  const candidateKeys =
    typeof rawCandidateBundle === 'object' &&
    rawCandidateBundle !== null &&
    !Array.isArray(rawCandidateBundle) &&
    recordValue(rawCandidateBundle, 'runKind') === 'scheduled'
      ? ['version', 'runId', 'runKind', 'generatedAt', 'rotatingPresetId', 'candidates', 'diagnostics', 'exploration']
      : ['version', 'runId', 'runKind', 'generatedAt', 'issueNumber', 'candidates', 'diagnostics', 'exploration']
  if (!hasExactKeys(rawCandidateBundle, candidateKeys)) throw new Error('candidate bundle contains unsupported fields')
  const candidateBundle = parseCandidateBundle(rawCandidateBundle)
  if (candidateBundle.runId !== plan.runId || candidateBundle.runKind !== plan.runKind)
    throw new Error('plan and candidate run metadata disagree')
  if (
    candidateBundle.generatedAt !== plan.generatedAt ||
    JSON.stringify(candidateBundle.exploration) !== JSON.stringify(plan.exploration)
  )
    throw new Error('plan and candidate exploration metadata disagree')
  if (plan.runKind === 'manual' && candidateBundle.issueNumber !== plan.issueNumber)
    throw new Error('plan and candidate issue disagree')
  if (plan.runKind === 'manual' && candidateBundle.candidates.length > 0)
    throw new Error('manual candidate bundle cannot add exploratory candidates')
  if (plan.runKind === 'scheduled' && candidateBundle.rotatingPresetId !== plan.rotatingPresetId)
    throw new Error('plan and candidate preset disagree')
  if (
    plan.runKind === 'scheduled' &&
    candidateBundle.candidates.some(
      candidate =>
        !plan.coreMatrix.some(
          state =>
            state.route === candidate.route &&
            state.viewport === candidate.variant.viewport &&
            JSON.stringify(state.theme) === JSON.stringify(candidate.variant.theme),
        ),
    )
  )
    throw new Error('candidate is outside the planned core matrix')
  ensureFreshOutput(fileSystem, args.out)
  const scratch = join(dirname(args.out), `.finalizer-${plan.runId}-${randomBytes(8).toString('hex')}`)
  const browser = input.browser ?? (await defaultBrowser(scratch))
  const diagnostics: string[] = [...candidateBundle.diagnostics]
  const timeoutMs = input.timeoutMs ?? MAX_FINALIZATION_MS
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_FINALIZATION_MS)
    throw new Error('finalizer timeout is outside the bounded limit')
  const clock = input.clock ?? (() => new Date())
  const deadline = clock().getTime() + timeoutMs
  const findings: Finding[] = []
  const validations: ValidationReplay[] = []
  const files = new Map<string, Uint8Array>()
  try {
    for (const candidate of candidateBundle.candidates) {
      const output = await withTimeout(
        () => browser.finalizeCandidate(candidate),
        () => deadline - clock().getTime(),
        'candidate replay',
      )
      if (output.finding) findings.push(output.finding)
      if (output.diagnostic) diagnostics.push(output.diagnostic)
      for (const file of output.files ?? []) {
        if (files.has(file.path)) throw new Error('duplicate finalizer evidence file path')
        files.set(file.path, file.bytes)
      }
    }
    for (const request of plan.activeRequests) {
      const output = await withTimeout(
        () => browser.finalizeActive(request),
        () => deadline - clock().getTime(),
        'active replay',
      )
      if (output.finding) findings.push(output.finding)
      if (output.validation?.status === 'clean') validations.push(output.validation)
      if (output.diagnostic || output.validation?.status === 'infrastructure-error')
        diagnostics.push(
          output.diagnostic ??
            (output.validation?.status === 'infrastructure-error' ? output.validation.diagnostic : undefined) ??
            'active replay failed',
        )
      for (const file of output.files ?? []) {
        if (files.has(file.path)) throw new Error('duplicate finalizer evidence file path')
        files.set(file.path, file.bytes)
      }
    }
    const manifestInput =
      plan.runKind === 'manual'
        ? {
            version: 1,
            runId: plan.runId,
            runKind: 'manual' as const,
            issueNumber: plan.issueNumber,
            generatedAt: plan.generatedAt,
            findings: findings.map(finding => remapFinding(finding, files)),
            validations: validations.map(validation => remapValidation(validation, files)),
          }
        : {
            version: 1,
            runId: plan.runId,
            runKind: 'scheduled' as const,
            rotatingPresetId: plan.rotatingPresetId,
            generatedAt: plan.generatedAt,
            findings: findings.map(finding => remapFinding(finding, files)),
            validations: validations.map(validation => remapValidation(validation, files)),
          }
    assertEvidenceSealing(findings, validations, files)
    const manifest = parseAuditManifest(manifestInput)
    const result = createResult(plan.runKind, manifest, diagnostics.length)
    if (!fileSystem.mkdirSync || !fileSystem.writeFileSync) throw new Error('finalizer filesystem cannot write')
    const temporary = `${args.out}.tmp`
    fileSystem.mkdirSync(temporary, {recursive: true, mode: 0o700})
    fileSystem.mkdirSync(join(temporary, 'evidence'), {recursive: true, mode: 0o700})
    fileSystem.mkdirSync(join(temporary, 'provenance'), {recursive: true, mode: 0o700})
    for (const [path, bytes] of files)
      fileSystem.writeFileSync(join(temporary, 'evidence', basename(path)), bytes, {flag: 'wx', mode: 0o600})
    fileSystem.writeFileSync(join(temporary, 'manifest.json'), canonicalJson(manifest), {flag: 'wx', mode: 0o600})
    fileSystem.writeFileSync(join(temporary, 'diagnostics.json'), canonicalJson(diagnostics), {flag: 'wx', mode: 0o600})
    fileSystem.writeFileSync(join(temporary, 'finalization-result.json'), canonicalJson(result), {
      flag: 'wx',
      mode: 0o600,
    })
    fileSystem.writeFileSync(join(temporary, 'provenance', 'replay-plan.json'), serializeReplayPlan(plan), {
      flag: 'wx',
      mode: 0o600,
    })
    fileSystem.writeFileSync(join(temporary, 'provenance', 'candidate-bundle.json'), canonicalJson(candidateBundle), {
      flag: 'wx',
      mode: 0o600,
    })
    if (!fileSystem.renameSync) throw new Error('finalizer filesystem cannot rename')
    fileSystem.renameSync(temporary, args.out)
    try {
      writeAtomically(fileSystem, args.result, canonicalJson(result))
      if (!fileSystem.readFileSync) throw new Error('finalizer filesystem cannot verify result')
      const expectedResult = canonicalJson(result)
      const artifactResult = fileSystem.readFileSync(join(args.out, 'finalization-result.json'))
      const externalResult = fileSystem.readFileSync(args.result)
      if (
        Buffer.from(inputBytes(artifactResult)).toString('utf8') !== expectedResult ||
        Buffer.from(inputBytes(externalResult)).toString('utf8') !== expectedResult
      )
        throw new Error('finalizer result bytes disagree')
    } catch (error) {
      if (fileSystem.rmSync) fileSystem.rmSync(args.out, {recursive: true, force: true})
      throw error
    }
    return result
  } catch (error) {
    try {
      if (fileSystem.rmSync) fileSystem.rmSync(`${args.out}.tmp`, {recursive: true, force: true})
      if (fileSystem.rmSync) fileSystem.rmSync(`${args.result}.tmp`, {recursive: true, force: true})
    } catch {
      // Preserve the original failure.
    }
    throw error
  } finally {
    await browser.close?.()
  }
}

export const main = async (): Promise<void> => {
  await runFinalizeDiscovery({args: process.argv.slice(2)})
}
