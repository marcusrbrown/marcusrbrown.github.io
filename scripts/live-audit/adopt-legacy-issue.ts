import {Buffer} from 'node:buffer'
import {randomUUID} from 'node:crypto'
import {appendFile, lstat, readFile, rename, unlink, writeFile} from 'node:fs/promises'
import {dirname, join, sep} from 'node:path'
import process from 'node:process'
import {pathToFileURL} from 'node:url'
import {parseArgs} from 'node:util'

import {parseLegacyAdoptionDescriptor, type ParsedLegacyAdoptionDescriptor} from './contract'
import {createGhRunner, type GhRunner} from './github-runner'
import {
  adoptLegacyIssue,
  classifyReporterError,
  validateLegacyAdoptionActor,
  type LegacyAdoptionDependencies,
  type LegacyAdoptionOperation,
  type LegacyAdoptionResult,
  type ReporterDiagnostic,
  type ReporterStatus,
  type ReporterWriteMode,
} from './reporter'

export const ADOPT_LEGACY_ISSUE_RESULT_VERSION = 2 as const
export const MAX_LEGACY_DESCRIPTOR_BYTES = 250_000
export const MAX_LEGACY_RESULT_BYTES = 250_000
export const MAX_LEGACY_SUMMARY_BYTES = 20_000
export const MAX_LEGACY_ENV_VALUE_BYTES = 2_000

export interface AdoptLegacyIssueCliFileStat {
  readonly size: number
  readonly dev: number
  readonly ino: number
  readonly isDirectory: () => boolean
  readonly isFile: () => boolean
  readonly isSymbolicLink: () => boolean
}

export interface AdoptLegacyIssueCliFileSystem {
  readonly appendFile?: (path: string, data: string, encoding?: 'utf8') => Promise<void> | void
  readonly lstat: (path: string) => Promise<AdoptLegacyIssueCliFileStat> | AdoptLegacyIssueCliFileStat
  readonly readFile: (path: string, encoding?: 'utf8') => Promise<Uint8Array | string> | Uint8Array | string
  readonly rename: (source: string, destination: string) => Promise<void> | void
  readonly unlink: (path: string) => Promise<void> | void
  readonly writeFile: (path: string, data: string | Uint8Array, encoding?: 'utf8') => Promise<void> | void
}

export type AdoptLegacyIssueRunnerFactory = (environment: Readonly<Record<string, string>>) => GhRunner
export type AdoptLegacyIssueSummaryWriter = (path: string, summary: string) => Promise<void> | void

export interface AdoptLegacyIssueCliOptions {
  readonly descriptorPath: string
  readonly resultPath: string
}

export interface RunAdoptLegacyIssueCliInput {
  readonly argv?: readonly string[]
  readonly options?: AdoptLegacyIssueCliOptions
  readonly env?: Readonly<Record<string, string | undefined>>
  readonly fs?: AdoptLegacyIssueCliFileSystem
  readonly runnerFactory?: AdoptLegacyIssueRunnerFactory
  readonly summaryWriter?: AdoptLegacyIssueSummaryWriter
}

export interface AdoptLegacyIssuePreflightFailureResult {
  readonly version: typeof ADOPT_LEGACY_ISSUE_RESULT_VERSION
  readonly kind: 'preflight-failure'
  readonly status: 'failure'
  readonly diagnosticDetails: readonly ReporterDiagnostic[]
  readonly operations: readonly []
  readonly writeCount: 0
}

export interface AdoptLegacyIssueAdoptionResultFile {
  readonly version: typeof ADOPT_LEGACY_ISSUE_RESULT_VERSION
  readonly kind: 'adoption-result'
  readonly status: ReporterStatus
  readonly diagnosticDetails: readonly ReporterDiagnostic[]
  readonly operations: readonly LegacyAdoptionOperation[]
  readonly issueNumber: number
  readonly fingerprint: string
  readonly adoptionKey: string
  readonly writeCount: number
}

export type AdoptLegacyIssueResultFile = AdoptLegacyIssuePreflightFailureResult | AdoptLegacyIssueAdoptionResultFile

const nodeFileSystem: AdoptLegacyIssueCliFileSystem = {
  appendFile,
  lstat,
  readFile,
  rename,
  unlink,
  writeFile,
}

const repositoryPart = /^[A-Z0-9][\w.-]{0,99}$/i
const allowedWriteModes: readonly ReporterWriteMode[] = ['disabled', 'manual-only', 'enabled']

class AdoptLegacyIssueCliError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AdoptLegacyIssueCliError'
  }
}

const byteLength = (value: string | Uint8Array): number =>
  typeof value === 'string' ? Buffer.byteLength(value, 'utf8') : value.byteLength

const boundedText = (value: string, maxBytes: number): string => {
  const bytes = Buffer.from(value, 'utf8')
  return bytes.byteLength <= maxBytes ? value : bytes.subarray(0, maxBytes).toString('utf8')
}

const parseOptions = (argv: readonly string[]): AdoptLegacyIssueCliOptions => {
  const parsed = parseArgs({
    args: [...argv],
    options: {
      descriptor: {type: 'string', multiple: true},
      result: {type: 'string', multiple: true},
    },
    strict: true,
    allowPositionals: false,
  })
  const single = (value: string | string[] | boolean | undefined): string | undefined =>
    Array.isArray(value) ? (value.length === 1 ? value[0] : undefined) : typeof value === 'string' ? value : undefined
  const descriptorPath = single(parsed.values.descriptor)
  const resultPath = single(parsed.values.result)
  if (descriptorPath === undefined || resultPath === undefined)
    throw new AdoptLegacyIssueCliError('--descriptor and --result are required exactly once')
  if (descriptorPath.length === 0 || resultPath.length === 0)
    throw new AdoptLegacyIssueCliError('--descriptor and --result must not be empty')
  return {descriptorPath, resultPath}
}

export const parseAdoptLegacyIssueCliArgs = parseOptions

const readEnvValue = (
  env: Readonly<Record<string, string | undefined>>,
  key: string,
  required = true,
): string | undefined => {
  const value = env[key]
  if (value === undefined) {
    if (required) throw new AdoptLegacyIssueCliError(`${key} is required`)
    return undefined
  }
  if (value.length === 0 || Buffer.byteLength(value, 'utf8') > MAX_LEGACY_ENV_VALUE_BYTES)
    throw new AdoptLegacyIssueCliError(`${key} is invalid or oversized`)
  if ([...value].some(character => (character.codePointAt(0) ?? 0) < 0x20 || character === '\u007F'))
    throw new AdoptLegacyIssueCliError(`${key} contains control characters`)
  return value
}

const parseRepository = (value: string): {readonly owner: string; readonly repo: string} => {
  const parts = value.split('/')
  if (parts.length !== 2 || !repositoryPart.test(parts[0] ?? '') || !repositoryPart.test(parts[1] ?? ''))
    throw new AdoptLegacyIssueCliError('GITHUB_REPOSITORY is invalid')
  return {owner: parts[0] as string, repo: parts[1] as string}
}

interface ClosedEnvironment {
  readonly repository: {readonly owner: string; readonly repo: string}
  readonly ghToken: string
  readonly adopter: string
  readonly writeMode: ReporterWriteMode
  readonly summaryPath?: string
}

const parseEnvironment = (env: Readonly<Record<string, string | undefined>>): ClosedEnvironment => {
  const repository = parseRepository(readEnvValue(env, 'GITHUB_REPOSITORY') as string)
  const ghToken = readEnvValue(env, 'GH_TOKEN') as string
  const adopter = readEnvValue(env, 'LIVE_AUDIT_ADOPTER') as string
  validateLegacyAdoptionActor(adopter)
  const configuredMode = env.LIVE_AUDIT_WRITE_MODE
  const writeMode = configuredMode === undefined ? 'disabled' : configuredMode
  if (!allowedWriteModes.includes(writeMode as ReporterWriteMode))
    throw new AdoptLegacyIssueCliError('LIVE_AUDIT_WRITE_MODE is invalid')
  const summaryPath = readEnvValue(env, 'GITHUB_STEP_SUMMARY', false)
  return {
    repository,
    ghToken,
    adopter,
    writeMode: writeMode as ReporterWriteMode,
    ...(summaryPath === undefined ? {} : {summaryPath}),
  }
}

const assertSafePath = (path: string): void => {
  if (
    path.length === 0 ||
    [...path].some(character => (character.codePointAt(0) ?? 0) < 0x20 || character === '\u007F') ||
    path.split(/[\\/]/u).includes('..')
  )
    throw new AdoptLegacyIssueCliError('descriptor path is unsafe')
}

const readDescriptor = async (
  fileSystem: AdoptLegacyIssueCliFileSystem,
  path: string,
): Promise<{readonly raw: unknown; readonly parsed: ParsedLegacyAdoptionDescriptor}> => {
  assertSafePath(path)
  const before = await fileSystem.lstat(path)
  if (before.isSymbolicLink() || !before.isFile() || before.isDirectory())
    throw new AdoptLegacyIssueCliError('descriptor is not a regular file')
  if (!Number.isSafeInteger(before.size) || before.size <= 0 || before.size > MAX_LEGACY_DESCRIPTOR_BYTES)
    throw new AdoptLegacyIssueCliError('descriptor size is outside the bounded limit')
  const rawBytes = await fileSystem.readFile(path)
  if (byteLength(rawBytes) !== before.size) throw new AdoptLegacyIssueCliError('descriptor changed during read')
  const bytes = typeof rawBytes === 'string' ? Buffer.from(rawBytes, 'utf8') : Buffer.from(rawBytes)
  let text: string
  try {
    text = new TextDecoder('utf-8', {fatal: true}).decode(bytes)
  } catch {
    throw new AdoptLegacyIssueCliError('descriptor is not valid UTF-8')
  }
  const after = await fileSystem.lstat(path)
  if (
    after.isSymbolicLink() ||
    !after.isFile() ||
    after.size !== before.size ||
    after.dev !== before.dev ||
    after.ino !== before.ino
  )
    throw new AdoptLegacyIssueCliError('descriptor changed during read')
  let raw: unknown
  try {
    raw = JSON.parse(text) as unknown
  } catch {
    throw new AdoptLegacyIssueCliError('descriptor is malformed JSON')
  }
  let parsed: ParsedLegacyAdoptionDescriptor
  try {
    parsed = parseLegacyAdoptionDescriptor(raw)
  } catch {
    throw new AdoptLegacyIssueCliError('descriptor does not satisfy the legacy adoption contract')
  }
  return {raw, parsed}
}

const redact = (value: string, token: string): string =>
  boundedText(token.length === 0 ? value : value.split(token).join('[redacted]'), 2_000)

const resultFileFor = (
  result: Pick<LegacyAdoptionResult, 'status' | 'diagnosticDetails' | 'operations' | 'writeCount'>,
  descriptor: ParsedLegacyAdoptionDescriptor,
  token: string,
): AdoptLegacyIssueAdoptionResultFile => ({
  version: ADOPT_LEGACY_ISSUE_RESULT_VERSION,
  kind: 'adoption-result',
  status: result.status,
  diagnosticDetails: result.diagnosticDetails.slice(0, 100).map(diagnostic => ({
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: redact(diagnostic.message, token),
  })),
  operations: result.operations.slice(0, 100).map(operation => ({...operation})),
  issueNumber: descriptor.issueNumber,
  fingerprint: descriptor.fingerprint,
  adoptionKey: descriptor.adoptionKey,
  writeCount: result.writeCount,
})

const preflightResultFileFor = (error: unknown, token: string): AdoptLegacyIssuePreflightFailureResult => ({
  version: ADOPT_LEGACY_ISSUE_RESULT_VERSION,
  kind: 'preflight-failure',
  status: 'failure',
  diagnosticDetails: [
    {
      code: 'contract',
      severity: 'failure',
      message: redact(error instanceof Error ? error.message : 'legacy issue adoption preflight failed', token),
    },
  ],
  operations: [],
  writeCount: 0,
})

const serializeResult = (result: AdoptLegacyIssueResultFile): string => {
  const serialized = `${JSON.stringify(result, null, 2)}\n`
  if (byteLength(serialized) > MAX_LEGACY_RESULT_BYTES)
    throw new AdoptLegacyIssueCliError('adoption result exceeds bounded UTF-8 size')
  return serialized
}

const atomicWrite = async (fileSystem: AdoptLegacyIssueCliFileSystem, path: string, content: string): Promise<void> => {
  const temporaryPath = join(dirname(path), `.${path.split(sep).pop() ?? 'result'}.${process.pid}.${randomUUID()}.tmp`)
  try {
    await fileSystem.writeFile(temporaryPath, content, 'utf8')
    await fileSystem.rename(temporaryPath, path)
  } catch (error) {
    try {
      await fileSystem.unlink(temporaryPath)
    } catch {
      // Best-effort cleanup must not hide the original write failure.
    }
    throw error
  }
}

const summaryFor = (result: AdoptLegacyIssueResultFile, token: string): string => {
  const details = result.diagnosticDetails
    .map(diagnostic => `- ${diagnostic.severity}: ${diagnostic.code}: ${redact(diagnostic.message, token)}`)
    .join('\n')
  return boundedText(
    [
      '### Live audit legacy adoption',
      '',
      `- Status: \`${result.status}\``,
      `- Issue: ${result.kind === 'adoption-result' ? result.issueNumber : 'not adopted'}`,
      `- Planned operations: ${result.operations.length}`,
      `- Writes: ${result.writeCount}`,
      details.length === 0 ? '- Diagnostics: none' : `- Diagnostics:\n${details}`,
      '',
    ].join('\n'),
    MAX_LEGACY_SUMMARY_BYTES,
  )
}

export const runAdoptLegacyIssueCli = async (input: RunAdoptLegacyIssueCliInput = {}): Promise<number> => {
  const options = input.options ?? parseOptions(input.argv ?? process.argv.slice(2))
  const fileSystem = input.fs ?? nodeFileSystem
  let environment: ClosedEnvironment
  let descriptorInput: {readonly raw: unknown; readonly parsed: ParsedLegacyAdoptionDescriptor}
  let runner: GhRunner
  try {
    environment = parseEnvironment(input.env ?? process.env)
    descriptorInput = await readDescriptor(fileSystem, options.descriptorPath)
    if (
      descriptorInput.parsed.repository.owner !== environment.repository.owner ||
      descriptorInput.parsed.repository.repo !== environment.repository.repo
    )
      throw new AdoptLegacyIssueCliError('descriptor repository does not match GITHUB_REPOSITORY')
    const runnerFactory = input.runnerFactory ?? (() => createGhRunner())
    runner = runnerFactory({
      GITHUB_REPOSITORY: `${environment.repository.owner}/${environment.repository.repo}`,
      GH_TOKEN: environment.ghToken,
      LIVE_AUDIT_WRITE_MODE: environment.writeMode,
    })
  } catch (error) {
    const token = (input.env ?? process.env).GH_TOKEN ?? ''
    await atomicWrite(fileSystem, options.resultPath, serializeResult(preflightResultFileFor(error, token)))
    return 1
  }
  let result: AdoptLegacyIssueResultFile
  try {
    const dependencies: LegacyAdoptionDependencies = {
      repository: environment.repository,
      runner,
      writeMode: environment.writeMode,
      reporterActor: environment.adopter,
    }
    const adoption = await adoptLegacyIssue({descriptor: descriptorInput.raw, ...dependencies})
    result = resultFileFor(adoption, descriptorInput.parsed, environment.ghToken)
  } catch (error) {
    const classified = classifyReporterError(error)
    result = resultFileFor(
      {
        status: classified.status,
        diagnosticDetails: [classified.diagnostic],
        operations: [],
        writeCount: 0,
      },
      descriptorInput.parsed,
      environment.ghToken,
    )
  }
  await atomicWrite(fileSystem, options.resultPath, serializeResult(result))
  if (environment.summaryPath !== undefined) {
    const summaryWriter =
      input.summaryWriter ??
      (fileSystem.appendFile === undefined
        ? undefined
        : (path: string, content: string) => fileSystem.appendFile?.(path, content, 'utf8'))
    if (summaryWriter === undefined) throw new AdoptLegacyIssueCliError('summary writer is unavailable')
    await summaryWriter(environment.summaryPath, summaryFor(result, environment.ghToken))
  }
  return result.status === 'failure' ? 1 : 0
}

const main = async (): Promise<void> => {
  try {
    process.exitCode = await runAdoptLegacyIssueCli({argv: process.argv.slice(2), env: process.env})
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'legacy issue adoption CLI failed'}\n`)
    process.exitCode = 1
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
