import {Buffer} from 'node:buffer'
import {createHash, randomUUID} from 'node:crypto'
import {appendFile, lstat, readFile, realpath, rename, unlink, writeFile} from 'node:fs/promises'
import {dirname, isAbsolute, join, relative, resolve, sep} from 'node:path'
import process from 'node:process'
import {pathToFileURL} from 'node:url'
import {parseArgs} from 'node:util'

import {parseAuditManifest} from './contract'
import {validatePng} from './evidence'
import {createGhRunner, type GhRunner} from './github-runner'
import {
  classifyReporterError,
  reportAudit,
  type ReporterDiagnostic,
  type ReporterOperation,
  type ReporterStatus,
  type ReporterWriteMode,
} from './reporter'

export const REPORT_AUDIT_RESULT_VERSION = 1 as const
export const MAX_MANIFEST_BYTES = 2_000_000
export const MAX_RESULT_BYTES = 250_000
export const MAX_SUMMARY_BYTES = 20_000
export const MAX_DIAGNOSTIC_BYTES = 2_000
export const MAX_ENV_VALUE_BYTES = 2_000
export const MAX_PUBLIC_IMAGE_BYTES = 5_000_000
export const PUBLIC_IMAGE_TIMEOUT_MS = 15_000

export interface ReportAuditCliFileStat {
  readonly isDirectory: () => boolean
  readonly isFile: () => boolean
  readonly isSymbolicLink: () => boolean
}

export interface ReportAuditCliFileSystem {
  readonly appendFile?: (path: string, data: string, encoding?: 'utf8') => Promise<void> | void
  readonly lstat: (path: string) => Promise<ReportAuditCliFileStat> | ReportAuditCliFileStat
  readonly readFile: (path: string, encoding?: 'utf8') => Promise<Uint8Array | string> | Uint8Array | string
  readonly realpath: (path: string) => Promise<string> | string
  readonly rename: (source: string, destination: string) => Promise<void> | void
  readonly unlink: (path: string) => Promise<void> | void
  readonly writeFile: (path: string, data: string | Uint8Array, encoding?: 'utf8') => Promise<void> | void
}

export type ReportAuditRunnerFactory = (environment: Readonly<Record<string, string>>) => GhRunner
export type ReportAuditSummaryWriter = (path: string, summary: string) => Promise<void> | void
export type ReportAuditDiagnosticWriter = (diagnostic: string) => Promise<void> | void

export interface ReportAuditCliOptions {
  readonly manifestPath: string
  readonly artifactRoot: string
  readonly resultPath: string
}

export interface RunReportAuditCliInput {
  readonly argv?: readonly string[]
  readonly options?: ReportAuditCliOptions
  readonly env?: Readonly<Record<string, string | undefined>>
  readonly fs?: ReportAuditCliFileSystem
  readonly runnerFactory?: ReportAuditRunnerFactory
  readonly fetch?: typeof globalThis.fetch
  readonly clock?: () => Date
  readonly summaryWriter?: ReportAuditSummaryWriter
  readonly diagnosticWriter?: ReportAuditDiagnosticWriter
}

export interface ReportAuditResultFile {
  readonly version: typeof REPORT_AUDIT_RESULT_VERSION
  readonly status: ReporterStatus
  readonly diagnosticDetails: readonly ReporterDiagnostic[]
  readonly operations: readonly ReporterOperation[]
  readonly writeCount: number
  readonly issueNumbers: readonly number[]
}

const nodeFileSystem: ReportAuditCliFileSystem = {
  appendFile,
  lstat,
  readFile,
  realpath,
  rename,
  unlink,
  writeFile,
}

const repositoryPart = /^[A-Z0-9][\w.-]{0,99}$/i
const runNumber = /^[1-9]\d{0,19}$/
const allowedWriteModes: readonly ReporterWriteMode[] = ['disabled', 'manual-only', 'enabled']
const REPORT_AUDIT_RELEASE_TAG = 'live-audit-evidence'

class ReportAuditCliError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ReportAuditCliError'
  }
}

const byteLength = (value: string | Uint8Array): number =>
  typeof value === 'string' ? Buffer.byteLength(value, 'utf8') : value.byteLength

const boundedText = (value: string, maxBytes: number): string => {
  const bytes = Buffer.from(value, 'utf8')
  if (bytes.byteLength <= maxBytes) return value
  return bytes.subarray(0, maxBytes).toString('utf8')
}

const readUtf8 = async (
  fileSystem: ReportAuditCliFileSystem,
  path: string,
  maxBytes: number,
  label: string,
): Promise<string> => {
  const raw = await fileSystem.readFile(path)
  if (byteLength(raw) > maxBytes) throw new ReportAuditCliError(`${label} exceeds bounded UTF-8 size`)
  const bytes = typeof raw === 'string' ? Buffer.from(raw, 'utf8') : Buffer.from(raw)
  try {
    return new TextDecoder('utf-8', {fatal: true}).decode(bytes)
  } catch {
    throw new ReportAuditCliError(`${label} is not valid UTF-8`)
  }
}

const parseOptions = (argv: readonly string[]): ReportAuditCliOptions => {
  const parsed = parseArgs({
    args: [...argv],
    options: {
      manifest: {type: 'string', multiple: true},
      'artifact-root': {type: 'string', multiple: true},
      result: {type: 'string', multiple: true},
    },
    strict: true,
    allowPositionals: false,
  })
  const singleValue = (value: string | string[] | boolean | undefined): string | undefined =>
    Array.isArray(value) ? (value.length === 1 ? value[0] : undefined) : typeof value === 'string' ? value : undefined
  const manifestPath = singleValue(parsed.values.manifest)
  const artifactRoot = singleValue(parsed.values['artifact-root'])
  const resultPath = singleValue(parsed.values.result)
  if (typeof manifestPath !== 'string' || typeof artifactRoot !== 'string' || typeof resultPath !== 'string')
    throw new ReportAuditCliError('manifest, artifact root, and result arguments are required')
  if (manifestPath.length === 0 || artifactRoot.length === 0 || resultPath.length === 0)
    throw new ReportAuditCliError('manifest, artifact root, and result arguments must not be empty')
  return {manifestPath, artifactRoot, resultPath}
}

export const parseReportAuditCliArgs = parseOptions

const readEnvValue = (
  env: Readonly<Record<string, string | undefined>>,
  key: string,
  required = true,
): string | undefined => {
  const value = env[key]
  if (value === undefined) {
    if (required) throw new ReportAuditCliError(`${key} is required`)
    return undefined
  }
  if (value.length === 0 || Buffer.byteLength(value, 'utf8') > MAX_ENV_VALUE_BYTES)
    throw new ReportAuditCliError(`${key} is invalid or oversized`)
  if ([...value].some(character => (character.codePointAt(0) ?? 0) < 0x20 || character === '\u007F'))
    throw new ReportAuditCliError(`${key} contains control characters`)
  return value
}

const parseRepository = (value: string): {readonly owner: string; readonly repo: string} => {
  const parts = value.split('/')
  if (parts.length !== 2 || !repositoryPart.test(parts[0] ?? '') || !repositoryPart.test(parts[1] ?? ''))
    throw new ReportAuditCliError('GITHUB_REPOSITORY is invalid')
  return {owner: parts[0] as string, repo: parts[1] as string}
}

const parseServerUrl = (value: string): string => {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new ReportAuditCliError('GITHUB_SERVER_URL is invalid')
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.hostname !== 'github.com' ||
    parsed.port !== '' ||
    parsed.search !== '' ||
    parsed.hash !== '' ||
    (parsed.pathname !== '' && parsed.pathname !== '/')
  )
    throw new ReportAuditCliError('GITHUB_SERVER_URL must be https://github.com')
  return 'https://github.com'
}

interface ClosedEnvironment {
  readonly repository: {readonly owner: string; readonly repo: string}
  readonly serverUrl: string
  readonly runId: string
  readonly runAttempt?: string
  readonly ghToken: string
  readonly writeMode: ReporterWriteMode
  readonly summaryPath?: string
}

const parseEnvironment = (env: Readonly<Record<string, string | undefined>>): ClosedEnvironment => {
  const repository = parseRepository(readEnvValue(env, 'GITHUB_REPOSITORY') as string)
  const serverUrl = parseServerUrl(readEnvValue(env, 'GITHUB_SERVER_URL') as string)
  const runId = readEnvValue(env, 'GITHUB_RUN_ID') as string
  if (!runNumber.test(runId)) throw new ReportAuditCliError('GITHUB_RUN_ID is invalid')
  const runAttempt = readEnvValue(env, 'GITHUB_RUN_ATTEMPT', false)
  if (runAttempt !== undefined && !runNumber.test(runAttempt))
    throw new ReportAuditCliError('GITHUB_RUN_ATTEMPT is invalid')
  const ghToken = readEnvValue(env, 'GH_TOKEN') as string
  const configuredMode = env.LIVE_AUDIT_WRITE_MODE
  const writeMode = configuredMode === undefined ? 'disabled' : configuredMode
  if (!allowedWriteModes.includes(writeMode as ReporterWriteMode))
    throw new ReportAuditCliError('LIVE_AUDIT_WRITE_MODE is invalid')
  const summaryPath = readEnvValue(env, 'GITHUB_STEP_SUMMARY', false)
  return {
    repository,
    serverUrl,
    runId,
    ...(runAttempt === undefined ? {} : {runAttempt}),
    ghToken,
    writeMode: writeMode as ReporterWriteMode,
    ...(summaryPath === undefined ? {} : {summaryPath}),
  }
}

const pathIsInside = (rootPath: string, candidatePath: string): boolean => {
  const candidateRelative = relative(rootPath, candidatePath)
  return (
    candidateRelative !== '' &&
    candidateRelative !== '..' &&
    !candidateRelative.startsWith(`..${sep}`) &&
    !isAbsolute(candidateRelative)
  )
}

const assertNoSymlinkComponents = async (
  fileSystem: ReportAuditCliFileSystem,
  rootPath: string,
  candidatePath: string,
): Promise<void> => {
  const candidateRelative = relative(rootPath, candidatePath)
  let currentPath = rootPath
  for (const part of candidateRelative.split(sep)) {
    currentPath = join(currentPath, part)
    const stat = await fileSystem.lstat(currentPath)
    if (stat.isSymbolicLink()) throw new ReportAuditCliError('manifest path contains a symlink')
  }
}

const loadManifest = async (fileSystem: ReportAuditCliFileSystem, options: ReportAuditCliOptions): Promise<unknown> => {
  if (options.manifestPath.split(/[\\/]/u).includes('..'))
    throw new ReportAuditCliError('manifest path traversal is not allowed')
  const rootPath = resolve(options.artifactRoot)
  const manifestPath = resolve(options.manifestPath)
  if (!pathIsInside(rootPath, manifestPath)) throw new ReportAuditCliError('manifest path is outside artifact root')
  const rootStat = await fileSystem.lstat(rootPath)
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory())
    throw new ReportAuditCliError('artifact root is not a directory')
  await assertNoSymlinkComponents(fileSystem, rootPath, manifestPath)
  const rootRealPath = await fileSystem.realpath(rootPath)
  const manifestRealPath = await fileSystem.realpath(manifestPath)
  if (!pathIsInside(rootRealPath, manifestRealPath))
    throw new ReportAuditCliError('manifest realpath is outside artifact root')
  const manifestStat = await fileSystem.lstat(manifestPath)
  if (manifestStat.isSymbolicLink() || !manifestStat.isFile())
    throw new ReportAuditCliError('manifest is not a regular file')
  const text = await readUtf8(fileSystem, manifestPath, MAX_MANIFEST_BYTES, 'manifest')
  let raw: unknown
  try {
    raw = JSON.parse(text) as unknown
  } catch {
    throw new ReportAuditCliError('manifest is malformed JSON')
  }
  try {
    return parseAuditManifest(raw)
  } catch {
    throw new ReportAuditCliError('manifest does not satisfy the live-audit contract')
  }
}

const workflowRunUrl = (environment: ClosedEnvironment): string =>
  `${environment.serverUrl}/${environment.repository.owner}/${environment.repository.repo}/actions/runs/${environment.runId}`

const publicImageVerifier = (fetchImpl: typeof globalThis.fetch | undefined) => async (url: string) => {
  if (fetchImpl === undefined) return {ok: false, reason: 'public image verification is unavailable'}
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PUBLIC_IMAGE_TIMEOUT_MS)
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  try {
    const response = await fetchImpl(url, {signal: controller.signal})
    if (!response.ok) return {ok: false, reason: 'public image request failed'}
    const contentType = response.headers.get('content-type') ?? ''
    const normalizedContentType = contentType.split(';', 1)[0]?.trim().toLowerCase()
    if (normalizedContentType !== 'image/png' && normalizedContentType !== 'application/octet-stream')
      return {ok: false, reason: 'public image is not PNG'}
    const contentLength = response.headers.get('content-length')
    if (contentLength !== null) {
      const declaredLength = Number(contentLength)
      if (!Number.isSafeInteger(declaredLength) || declaredLength < 0 || declaredLength > MAX_PUBLIC_IMAGE_BYTES)
        return {ok: false, reason: 'public image exceeds size limit'}
    }
    if (response.body === null) return {ok: false, reason: 'public image body is unavailable'}
    reader = response.body.getReader()
    let rejectAbort: ((reason?: unknown) => void) | undefined
    const abortPromise = new Promise<never>((_, reject) => {
      rejectAbort = reject
    })
    const onAbort = (): void => {
      rejectAbort?.(new Error('public image verification timed out'))
    }
    controller.signal.addEventListener('abort', onAbort, {once: true})
    if (controller.signal.aborted) onAbort()
    const chunks: Uint8Array[] = []
    let totalBytes = 0
    try {
      while (true) {
        const chunk = await Promise.race([reader.read(), abortPromise])
        if (chunk.done) break
        if (totalBytes + chunk.value.byteLength > MAX_PUBLIC_IMAGE_BYTES) {
          reader.cancel().catch(() => undefined)
          return {ok: false, reason: 'public image exceeds size limit'}
        }
        chunks.push(chunk.value)
        totalBytes += chunk.value.byteLength
      }
      const bytes = new Uint8Array(totalBytes)
      let offset = 0
      for (const chunk of chunks) {
        bytes.set(chunk, offset)
        offset += chunk.byteLength
      }
      try {
        validatePng(bytes, MAX_PUBLIC_IMAGE_BYTES)
      } catch {
        return {ok: false, reason: 'public image is not PNG'}
      }
      return {
        ok: true,
        bytes,
        contentType,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      }
    } finally {
      controller.signal.removeEventListener('abort', onAbort)
    }
  } catch {
    if (controller.signal.aborted && reader !== undefined) reader.cancel().catch(() => undefined)
    return {ok: false, reason: 'public image verification failed'}
  } finally {
    clearTimeout(timeout)
  }
}

const redact = (value: string, token: string): string =>
  boundedText(token.length === 0 ? value : value.split(token).join('[redacted]'), 2_000)

const resultFileFor = (
  status: ReporterStatus,
  diagnosticDetails: readonly ReporterDiagnostic[],
  operations: readonly ReporterOperation[],
  writeCount: number,
  issueNumbers: readonly number[],
  token: string,
): ReportAuditResultFile => ({
  version: REPORT_AUDIT_RESULT_VERSION,
  status,
  diagnosticDetails: diagnosticDetails.slice(0, 100).map(diagnostic => ({
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: redact(diagnostic.message, token),
  })),
  operations: operations.slice(0, 500).map(operation => ({...operation})),
  writeCount,
  issueNumbers: issueNumbers.slice(0, 500),
})

const preflightResultFileFor = (error: unknown, token: string): ReportAuditResultFile => ({
  version: REPORT_AUDIT_RESULT_VERSION,
  status: 'failure',
  diagnosticDetails: [
    {
      code: 'contract',
      severity: 'failure',
      message: redact(error instanceof Error ? error.message : 'report audit preflight failed', token),
    },
  ],
  operations: [],
  writeCount: 0,
  issueNumbers: [],
})

const serializeResult = (result: ReportAuditResultFile): string => {
  const serialized = `${JSON.stringify(result, null, 2)}\n`
  if (byteLength(serialized) > MAX_RESULT_BYTES)
    throw new ReportAuditCliError('report result exceeds bounded UTF-8 size')
  return serialized
}

const atomicWrite = async (fileSystem: ReportAuditCliFileSystem, path: string, content: string): Promise<void> => {
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

const summaryFor = (result: ReportAuditResultFile, token: string): string => {
  const details = result.diagnosticDetails
    .map(diagnostic => `- ${diagnostic.severity}: ${diagnostic.code}: ${redact(diagnostic.message, token)}`)
    .join('\n')
  const summary = [
    '### Live audit reporter',
    '',
    `- Status: \`${result.status}\``,
    `- Evidence release: \`${REPORT_AUDIT_RELEASE_TAG}\``,
    `- Planned operations: ${result.operations.length}`,
    `- Writes: ${result.writeCount}`,
    `- Issues: ${result.issueNumbers.length === 0 ? 'none' : result.issueNumbers.join(', ')}`,
    details.length === 0 ? '- Diagnostics: none' : `- Diagnostics:\n${details}`,
    '',
  ].join('\n')
  return boundedText(summary, MAX_SUMMARY_BYTES)
}

const failureDiagnosticFor = (result: ReportAuditResultFile, token: string): string => {
  const details = result.diagnosticDetails
    .map(diagnostic => `${diagnostic.severity}: ${diagnostic.code}: ${redact(diagnostic.message, token)}`)
    .join('\n')
  return boundedText(`Live audit reporter failed\n${details || 'no diagnostic details'}`, MAX_DIAGNOSTIC_BYTES)
}

export const runReportAuditCli = async (input: RunReportAuditCliInput = {}): Promise<number> => {
  const options = input.options ?? parseOptions(input.argv ?? process.argv.slice(2))
  const fileSystem = input.fs ?? nodeFileSystem
  let environment: ClosedEnvironment
  let manifest: unknown
  let runner: GhRunner
  try {
    environment = parseEnvironment(input.env ?? process.env)
    manifest = await loadManifest(fileSystem, options)
    const runnerFactory = input.runnerFactory ?? (() => createGhRunner())
    runner = runnerFactory({
      GITHUB_REPOSITORY: `${environment.repository.owner}/${environment.repository.repo}`,
      GITHUB_SERVER_URL: environment.serverUrl,
      GITHUB_RUN_ID: environment.runId,
      ...(environment.runAttempt === undefined ? {} : {GITHUB_RUN_ATTEMPT: environment.runAttempt}),
      GH_TOKEN: environment.ghToken,
      LIVE_AUDIT_WRITE_MODE: environment.writeMode,
    })
  } catch (error) {
    const token = (input.env ?? process.env).GH_TOKEN ?? ''
    const result = preflightResultFileFor(error, token)
    await atomicWrite(fileSystem, options.resultPath, serializeResult(result))
    const diagnosticWriter = input.diagnosticWriter ?? ((diagnostic: string) => process.stderr.write(`${diagnostic}\n`))
    await diagnosticWriter(failureDiagnosticFor(result, token))
    return 1
  }
  const clock = input.clock ?? (() => new Date())
  const fetchImpl = input.fetch ?? globalThis.fetch
  let result: ReportAuditResultFile
  try {
    const reporterResult = await reportAudit({
      artifactRoot: resolve(options.artifactRoot),
      manifest,
      repository: environment.repository,
      runner,
      verifyPublicImage: publicImageVerifier(fetchImpl),
      workflowRunUrl: workflowRunUrl(environment),
      writeMode: environment.writeMode,
      now: clock,
      reporterActor: 'github-actions[bot]',
    })
    result = resultFileFor(
      reporterResult.status,
      reporterResult.diagnosticDetails,
      reporterResult.operations,
      reporterResult.writeCount,
      reporterResult.issueNumbers,
      environment.ghToken,
    )
  } catch (error) {
    const classified = classifyReporterError(error)
    result = resultFileFor(classified.status, [classified.diagnostic], [], 0, [], environment.ghToken)
  }
  await atomicWrite(fileSystem, options.resultPath, serializeResult(result))
  if (result.status === 'failure') {
    const diagnosticWriter = input.diagnosticWriter ?? ((diagnostic: string) => process.stderr.write(`${diagnostic}\n`))
    await diagnosticWriter(failureDiagnosticFor(result, environment.ghToken))
  }
  if (environment.summaryPath !== undefined) {
    const summary = summaryFor(result, environment.ghToken)
    if (byteLength(summary) > MAX_SUMMARY_BYTES)
      throw new ReportAuditCliError('report summary exceeds bounded UTF-8 size')
    const summaryWriter =
      input.summaryWriter ??
      (fileSystem.appendFile === undefined
        ? undefined
        : (path: string, content: string) => fileSystem.appendFile?.(path, content, 'utf8'))
    if (summaryWriter === undefined) throw new ReportAuditCliError('summary writer is unavailable')
    await summaryWriter(environment.summaryPath, summary)
  }
  return result.status === 'failure' ? 1 : 0
}

const main = async (): Promise<void> => {
  try {
    process.exitCode = await runReportAuditCli({argv: process.argv.slice(2), env: process.env})
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'report audit CLI failed'}\n`)
    process.exitCode = 1
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main()
