#!/usr/bin/env tsx

import {Buffer} from 'node:buffer'
import {execFileSync} from 'node:child_process'
import {readFileSync, statSync} from 'node:fs'
import {basename, extname, resolve} from 'node:path'
import process from 'node:process'
import {pathToFileURL} from 'node:url'
import * as ts from 'typescript'

const DEFAULT_LIMITS = {
  maxTrackedFiles: 5_000,
  maxFileBytes: 1_024 * 1_024,
  maxTotalBytes: 20 * 1_024 * 1_024,
  maxDiagnostics: 64,
  maxProcessOutputBytes: 1_024 * 1_024,
} as const

const SOURCE_EXTENSIONS = new Set(['.cjs', '.cts', '.js', '.jsx', '.mjs', '.mts', '.ts', '.tsx'])
const EXCLUDED_PATH_SEGMENTS = new Set([
  '.agents',
  '.ai',
  '.git',
  '.opencode',
  '.worktrees',
  'coverage',
  'dist',
  'docs',
  'node_modules',
  'public',
  'tests',
  'vendor',
])
const AGENT_METADATA_FILES = new Set(['AGENTS.md', 'HARNESSES.md'])
const MANIFEST_SECTIONS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'] as const

/** Public React Router 7.18 RSC/server-action names, not the unrelated unstable client APIs. */
const RSC_API_IDENTIFIERS = new Set([
  'unstable_BrowserCreateFromReadableStreamFunction',
  'unstable_DecodeActionFunction',
  'unstable_DecodeFormStateFunction',
  'unstable_DecodeReplyFunction',
  'unstable_EncodeReplyFunction',
  'unstable_LoadServerActionFunction',
  'unstable_RSCHydratedRouter',
  'unstable_RSCHydratedRouterProps',
  'unstable_RSCManifestPayload',
  'unstable_RSCMatch',
  'unstable_RSCPayload',
  'unstable_RSCRenderPayload',
  'unstable_RSCRouteConfig',
  'unstable_RSCRouteConfigEntry',
  'unstable_RSCRouteManifest',
  'unstable_RSCRouteMatch',
  'unstable_RSCStaticRouter',
  'unstable_RSCStaticRouterProps',
  'unstable_createCallServer',
  'unstable_getRSCStream',
  'unstable_matchRSCServerRequest',
  'unstable_routeRSCServerRequest',
])

export interface TrackedFile {
  path: string
  content: string
}

export interface TrackedManifest {
  path: string
  manifest: unknown
}

export interface BoundaryLimits {
  maxTrackedFiles?: number
  maxFileBytes?: number
  maxTotalBytes?: number
  maxDiagnostics?: number
  maxProcessOutputBytes?: number
}

export interface BoundaryDiagnostic {
  path: string
  reason: string
}

export interface BoundaryResult {
  ok: boolean
  diagnostics: BoundaryDiagnostic[]
}

export interface EvaluateBoundaryInput {
  files: readonly TrackedFile[]
  packageManifest: unknown
  manifests?: readonly TrackedManifest[]
  limits?: BoundaryLimits
}

export interface BoundaryAdapters {
  listTrackedFiles: () => readonly string[]
  readFile: (path: string, maxBytes: number) => string
  readPackageJson: (maxBytes: number) => string
}

interface NormalizedBoundaryLimits {
  maxTrackedFiles: number
  maxFileBytes: number
  maxTotalBytes: number
  maxDiagnostics: number
  maxProcessOutputBytes: number
}

const mergeLimits = (overrides: BoundaryLimits | undefined): NormalizedBoundaryLimits => ({
  ...DEFAULT_LIMITS,
  ...overrides,
})

const diagnostic = (path: string, reason: string): BoundaryDiagnostic => ({path, reason: reason.slice(0, 159)})

const failure = (...diagnostics: BoundaryDiagnostic[]): BoundaryResult => ({ok: false, diagnostics})

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isSafeRelativePath = (path: unknown): path is string => {
  if (typeof path !== 'string' || path.length === 0 || path.length > 240) return false
  if (path.includes('\0') || path.includes('\\') || path.startsWith('/') || path.endsWith('/')) return false
  const segments = path.split('/')
  return segments.every(segment => segment.length > 0 && segment !== '.' && segment !== '..')
}

const isValidLimit = (value: number): boolean => Number.isSafeInteger(value) && value > 0

const hasValidManifestSections = (manifest: Record<string, unknown>): boolean => {
  if (typeof manifest.name !== 'string' || manifest.name.length === 0) return false

  return MANIFEST_SECTIONS.every(section => {
    const value = manifest[section]
    return value === undefined || (isRecord(value) && Object.values(value).every(entry => typeof entry === 'string'))
  })
}

const isProhibitedPackageName = (name: string): boolean =>
  name === 'react-server-dom' ||
  name.startsWith('react-server-dom-') ||
  name.startsWith('@react-router/') ||
  /^react-router-(?:cloudflare|node|rsc|serve|server)(?:$|-)/.test(name)

const isProhibitedModule = (name: string): boolean =>
  isProhibitedPackageName(name) || /^(?:react-router|react-router-dom)\/(?:rsc|server)(?:\/|$)/.test(name)

const safePackageName = (name: string): string => name.replaceAll(/[^\w@./-]/g, '?').slice(0, 80)

const isExcludedPath = (path: string): boolean => {
  const segments = path.split('/')
  return segments.some(segment => EXCLUDED_PATH_SEGMENTS.has(segment)) || AGENT_METADATA_FILES.has(basename(path))
}

const isScannableSource = (path: string): boolean => SOURCE_EXTENSIONS.has(extname(path).toLowerCase())

const hasServerFrameworkFilename = (path: string): boolean => {
  const name = basename(path)
  return name.startsWith('react-router.config.') || name.startsWith('entry.server.') || name.includes('.server.')
}

const scriptKindFor = (path: string): ts.ScriptKind => {
  switch (extname(path).toLowerCase()) {
    case '.jsx':
      return ts.ScriptKind.JSX
    case '.tsx':
      return ts.ScriptKind.TSX
    case '.cjs':
    case '.js':
    case '.mjs':
      return ts.ScriptKind.JS
    default:
      return ts.ScriptKind.TS
  }
}

const moduleSpecifierText = (node: ts.Node): string | null => {
  if (ts.isImportEqualsDeclaration(node)) {
    if (!ts.isExternalModuleReference(node.moduleReference)) return null
    const value = node.moduleReference.expression
    return value && ts.isStringLiteralLike(value) ? value.text : null
  }

  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
    const moduleSpecifier = node.moduleSpecifier
    return moduleSpecifier && ts.isStringLiteralLike(moduleSpecifier) ? moduleSpecifier.text : null
  }

  if (
    ts.isImportTypeNode(node) &&
    ts.isLiteralTypeNode(node.argument) &&
    ts.isStringLiteralLike(node.argument.literal)
  ) {
    return node.argument.literal.text
  }

  if (ts.isCallExpression(node)) {
    const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword
    const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require'
    const argument = node.arguments[0]
    if ((isDynamicImport || isRequire) && argument && ts.isStringLiteralLike(argument)) return argument.text
  }

  return null
}

const isNonLiteralModuleLoading = (node: ts.Node): boolean => {
  if (!ts.isCallExpression(node)) return false
  const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword
  const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require'
  if (!isDynamicImport && !isRequire) return false
  const argument = node.arguments[0]
  return !(argument && ts.isStringLiteralLike(argument))
}

const evaluateSource = (trackedFile: TrackedFile): BoundaryDiagnostic[] => {
  let sourceFile: ts.SourceFile
  try {
    sourceFile = ts.createSourceFile(
      trackedFile.path,
      trackedFile.content,
      ts.ScriptTarget.Latest,
      true,
      scriptKindFor(trackedFile.path),
    )
  } catch {
    return [diagnostic(trackedFile.path, 'source parse error')]
  }

  const parseDiagnostics =
    (sourceFile as ts.SourceFile & {parseDiagnostics?: readonly ts.Diagnostic[]}).parseDiagnostics?.filter(
      diagnosticValue => diagnosticValue.category === ts.DiagnosticCategory.Error,
    ) ?? []
  if (parseDiagnostics.length > 0) {
    return [diagnostic(trackedFile.path, 'source parse error')]
  }

  const findings: BoundaryDiagnostic[] = []
  const addFinding = (reason: string): void => {
    findings.push(diagnostic(trackedFile.path, reason))
  }

  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && RSC_API_IDENTIFIERS.has(node.text)) {
      addFinding(`React Router unstable RSC API: ${node.text}`)
    }

    if (
      ts.isExpressionStatement(node) &&
      ts.isStringLiteral(node.expression) &&
      node.expression.text === 'use server'
    ) {
      addFinding('use server directive')
    }

    const moduleName = moduleSpecifierText(node)
    if (moduleName && isProhibitedModule(moduleName)) {
      addFinding(`prohibited module boundary: ${safePackageName(moduleName)}`)
    }
    if (isNonLiteralModuleLoading(node)) addFinding('non-literal module loading')

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return findings
}

const sortDiagnostics = (diagnostics: BoundaryDiagnostic[]): BoundaryDiagnostic[] =>
  diagnostics.sort((left, right) => {
    const pathOrder = left.path.localeCompare(right.path)
    return pathOrder === 0 ? left.reason.localeCompare(right.reason) : pathOrder
  })

const capDiagnostics = (diagnostics: BoundaryDiagnostic[], limit: number): BoundaryDiagnostic[] => {
  if (diagnostics.length <= limit) return diagnostics
  return [...diagnostics.slice(0, Math.max(0, limit - 1)), diagnostic('.', 'diagnostic output exceeds guard bound')]
}

const validateLimits = (limits: NormalizedBoundaryLimits): BoundaryResult | null => {
  if (
    !isValidLimit(limits.maxTrackedFiles) ||
    !isValidLimit(limits.maxFileBytes) ||
    !isValidLimit(limits.maxTotalBytes) ||
    !isValidLimit(limits.maxDiagnostics) ||
    !isValidLimit(limits.maxProcessOutputBytes)
  ) {
    return failure(diagnostic('.', 'invalid guard bounds'))
  }
  return null
}

const manifestFindings = (path: string, manifest: unknown): BoundaryDiagnostic[] => {
  if (!isRecord(manifest) || !hasValidManifestSections(manifest)) {
    return [diagnostic(path, 'package manifest is missing or has the wrong shape')]
  }

  const findings: BoundaryDiagnostic[] = []
  for (const section of MANIFEST_SECTIONS) {
    const dependencies = manifest[section]
    if (!isRecord(dependencies)) continue
    for (const dependencyName of Object.keys(dependencies)) {
      if (isProhibitedPackageName(dependencyName)) {
        findings.push(diagnostic(path, `prohibited dependency: ${safePackageName(dependencyName)}`))
      }
    }
  }
  return findings
}

export const evaluateReactRouterRscBoundary = (input: EvaluateBoundaryInput): BoundaryResult => {
  const limits = mergeLimits(input.limits)
  const invalidLimits = validateLimits(limits)
  if (invalidLimits) return invalidLimits

  if (!Array.isArray(input.files)) return failure(diagnostic('.', 'tracked file records have the wrong shape'))
  if (!isRecord(input.packageManifest) || !hasValidManifestSections(input.packageManifest)) {
    return failure(diagnostic('package.json', 'package.json is missing or has the wrong shape'))
  }
  if (
    input.manifests !== undefined &&
    (!Array.isArray(input.manifests) ||
      input.manifests.some(
        manifest =>
          !isRecord(manifest) ||
          typeof manifest.path !== 'string' ||
          manifest.path === 'package.json' ||
          !isSafeRelativePath(manifest.path),
      ))
  ) {
    return failure(diagnostic('.', 'tracked package manifest records have the wrong shape'))
  }
  if (
    !input.files.every(
      trackedFile =>
        isRecord(trackedFile) && typeof trackedFile.path === 'string' && typeof trackedFile.content === 'string',
    )
  ) {
    return failure(diagnostic('.', 'tracked file records have the wrong shape'))
  }
  const manifestCount = input.manifests?.length ?? 0
  if (input.files.length + manifestCount > limits.maxTrackedFiles) {
    return failure(diagnostic('.', 'tracked file count exceeds guard bound'))
  }

  let totalBytes = 0
  const diagnostics: BoundaryDiagnostic[] = []
  const files = [...input.files].sort((left, right) => left.path.localeCompare(right.path))

  for (const trackedFile of files) {
    if (!isSafeRelativePath(trackedFile.path)) {
      diagnostics.push(diagnostic('.', 'unsafe tracked path rejected'))
      continue
    }
    if (typeof trackedFile.content !== 'string') {
      diagnostics.push(diagnostic(trackedFile.path, 'tracked file record has the wrong shape'))
      continue
    }

    const fileBytes = Buffer.byteLength(trackedFile.content, 'utf8')
    totalBytes += fileBytes
    if (fileBytes > limits.maxFileBytes) {
      diagnostics.push(diagnostic(trackedFile.path, 'per-file byte bound exceeded'))
      continue
    }
    if (totalBytes > limits.maxTotalBytes) {
      diagnostics.push(diagnostic('.', 'total tracked source byte bound exceeded'))
      break
    }

    if (isExcludedPath(trackedFile.path)) continue
    if (hasServerFrameworkFilename(trackedFile.path)) {
      diagnostics.push(diagnostic(trackedFile.path, 'server/framework filename'))
    }
    if (isScannableSource(trackedFile.path)) diagnostics.push(...evaluateSource(trackedFile))
  }

  diagnostics.push(...manifestFindings('package.json', input.packageManifest))
  for (const trackedManifest of [...(input.manifests ?? [])].sort((left, right) =>
    left.path.localeCompare(right.path),
  )) {
    diagnostics.push(...manifestFindings(trackedManifest.path, trackedManifest.manifest))
  }

  const ordered = capDiagnostics(sortDiagnostics(diagnostics), limits.maxDiagnostics)
  return {ok: ordered.length === 0, diagnostics: ordered}
}

const parsePackageManifest = (raw: string): unknown => {
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return undefined
  }
}

export const runReactRouterRscBoundary = (
  adapters: BoundaryAdapters,
  limitsOverrides: BoundaryLimits = {},
): BoundaryResult => {
  const limits = mergeLimits(limitsOverrides)
  const invalidLimits = validateLimits(limits)
  if (invalidLimits) return invalidLimits

  let trackedPaths: readonly string[]
  try {
    trackedPaths = adapters.listTrackedFiles()
  } catch {
    return failure(diagnostic('.', 'unable to list tracked files; boundary cannot be verified'))
  }
  if (!Array.isArray(trackedPaths)) return failure(diagnostic('.', 'tracked file list has the wrong shape'))
  if (trackedPaths.length > limits.maxTrackedFiles)
    return failure(diagnostic('.', 'tracked file count exceeds guard bound'))
  if (trackedPaths.some(path => !isSafeRelativePath(path))) {
    return failure(diagnostic('.', 'unsafe tracked path rejected'))
  }

  let packageJson: string
  try {
    const rawPackageJson = adapters.readPackageJson(limits.maxFileBytes)
    if (typeof rawPackageJson !== 'string')
      return failure(diagnostic('package.json', 'package.json has the wrong shape'))
    packageJson = rawPackageJson
  } catch {
    return failure(diagnostic('package.json', 'unable to read package.json; boundary cannot be verified'))
  }
  const rootBytes = Buffer.byteLength(packageJson, 'utf8')
  if (rootBytes > limits.maxFileBytes) return failure(diagnostic('package.json', 'per-file byte bound exceeded'))
  let totalBytes = rootBytes
  const packageManifest = parsePackageManifest(packageJson)
  if (packageManifest === undefined) return failure(diagnostic('package.json', 'package.json is missing or malformed'))

  const files: TrackedFile[] = []
  const manifests: TrackedManifest[] = []
  for (const path of [...new Set(trackedPaths)].sort((left, right) => left.localeCompare(right))) {
    if (path === 'package.json' || isExcludedPath(path)) continue
    const isManifest = basename(path) === 'package.json'
    if (!isManifest && !isScannableSource(path)) continue
    try {
      const content = adapters.readFile(path, limits.maxFileBytes)
      const fileBytes = Buffer.byteLength(content, 'utf8')
      if (fileBytes > limits.maxFileBytes) return failure(diagnostic(path, 'per-file byte bound exceeded'))
      totalBytes += fileBytes
      if (totalBytes > limits.maxTotalBytes) return failure(diagnostic('.', 'total tracked source byte bound exceeded'))
      if (isManifest) {
        const manifest = parsePackageManifest(content)
        if (manifest === undefined) return failure(diagnostic(path, 'package manifest is missing or malformed'))
        if (!isRecord(manifest) || !hasValidManifestSections(manifest)) {
          return failure(diagnostic(path, 'package manifest has the wrong shape'))
        }
        manifests.push({path, manifest})
      } else {
        files.push({path, content})
      }
    } catch {
      return failure(diagnostic(path, 'unable to read tracked source; boundary cannot be verified'))
    }
  }

  return evaluateReactRouterRscBoundary({files, packageManifest, manifests, limits})
}

const readBoundedTextFile = (path: string, maxBytes: number): string => {
  if (statSync(path).size > maxBytes) throw new Error('file exceeds guard bound')
  const content = readFileSync(path, 'utf8')
  if (Buffer.byteLength(content, 'utf8') > maxBytes) throw new Error('file exceeds guard bound')
  return content
}

const createCliAdapters = (root: string): BoundaryAdapters => ({
  listTrackedFiles: () => {
    const output = execFileSync('git', ['ls-files', '-z'], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: DEFAULT_LIMITS.maxProcessOutputBytes,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return output.split('\0').filter(Boolean)
  },
  readFile: (path, maxBytes) => readBoundedTextFile(resolve(root, path), maxBytes),
  readPackageJson: maxBytes => readBoundedTextFile(resolve(root, 'package.json'), maxBytes),
})

const formatDiagnostics = (diagnostics: readonly BoundaryDiagnostic[], maxBytes: number): string => {
  const lines: string[] = []
  let output = ''
  for (const item of diagnostics) {
    const line = `${item.path}: ${item.reason}`
    const next = output.length === 0 ? line : `${output}\n${line}`
    if (Buffer.byteLength(next, 'utf8') > maxBytes) break
    lines.push(line)
    output = next
  }
  return lines.join('\n') || '.: diagnostic output exceeds guard bound'
}

export const checkReactRouterRscBoundary = (): void => {
  const root = process.cwd()
  const result = runReactRouterRscBoundary(createCliAdapters(root))
  if (result.ok) {
    console.log('React Router RSC boundary clean.')
    process.exitCode = 0
    return
  }

  console.error(formatDiagnostics(result.diagnostics, DEFAULT_LIMITS.maxProcessOutputBytes))
  process.exitCode = 1
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  checkReactRouterRscBoundary()
}
