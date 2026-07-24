import {createHash} from 'node:crypto'
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {validatePng} from './evidence'
import {GhRunnerError, parseGhJson, type GhRunner} from './github-runner'

export const EVIDENCE_RELEASE_TAG = 'live-audit-evidence'

export interface EvidenceAsset {
  readonly id: number
  readonly name: string
  readonly state: string
  readonly size: number
  readonly contentType: string
  readonly digest?: string
  readonly browserDownloadUrl: string
}

export interface EvidenceRelease {
  readonly id: number
  readonly tagName: string
  readonly uploadUrl: string
  readonly isDraft: boolean
  readonly isPrerelease: boolean
  readonly isPrivate?: boolean
  readonly assets: readonly EvidenceAsset[]
}

export type EvidenceReleaseLookup =
  {readonly status: 'missing'} | {readonly status: 'found'; readonly release: EvidenceRelease}

export interface PublicImageResult {
  readonly ok: boolean
  readonly bytes?: Uint8Array
  readonly contentType?: string
  readonly sha256?: string
  readonly reason?: string
}
export interface PublicImageExpectation {
  readonly owner: string
  readonly repo: string
  readonly tag: string
  readonly assetName: string
  readonly expectedSha256?: string
}

export interface AssetPublishResult {
  readonly reused: boolean
  readonly asset: EvidenceAsset
}

export type EvidenceAssetPlan =
  | {readonly kind: 'reuse'; readonly asset: EvidenceAsset}
  | {readonly kind: 'upload'; readonly assetName: string; readonly expectedBytes: Uint8Array}
  | {
      readonly kind: 'replace'
      readonly asset: EvidenceAsset
      readonly assetName: string
      readonly expectedBytes: Uint8Array
      readonly reason: string
      readonly delete: true
      readonly upload: true
    }
  | {readonly kind: 'error'; readonly asset?: EvidenceAsset; readonly reason: string}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isRawAsset = (value: unknown): value is Record<string, unknown> =>
  isRecord(value) &&
  typeof value.id === 'number' &&
  Number.isInteger(value.id) &&
  typeof value.name === 'string' &&
  typeof value.state === 'string' &&
  typeof value.size === 'number' &&
  typeof value.content_type === 'string' &&
  typeof value.browser_download_url === 'string' &&
  (value.digest === undefined || typeof value.digest === 'string')
const toAsset = (value: Record<string, unknown>): EvidenceAsset => ({
  id: value.id as number,
  name: value.name as string,
  state: value.state as string,
  size: value.size as number,
  contentType: value.content_type as string,
  digest: value.digest as string | undefined,
  browserDownloadUrl: value.browser_download_url as string,
})
const parseAssetList = (value: unknown): EvidenceAsset[] => {
  if (!Array.isArray(value)) throw new GhRunnerError('GitHub asset response has an unexpected shape')
  const rawAssets = value.every(isRawAsset)
    ? value
    : value.length <= 100 && value.every(page => Array.isArray(page))
      ? value.flat()
      : (() => {
          throw new GhRunnerError('GitHub asset response has an unexpected shape or was truncated')
        })()
  if (rawAssets.length > 1_000 || !rawAssets.every(isRawAsset))
    throw new GhRunnerError('GitHub asset response has an unexpected shape or was truncated')
  return rawAssets.map(toAsset)
}
const isRelease = (value: unknown): value is Record<string, unknown> =>
  isRecord(value) &&
  typeof value.id === 'number' &&
  typeof value.tag_name === 'string' &&
  typeof value.upload_url === 'string' &&
  typeof value.draft === 'boolean' &&
  typeof value.prerelease === 'boolean' &&
  (value.private === undefined || typeof value.private === 'boolean') &&
  Array.isArray(value.assets) &&
  value.assets.every(isRawAsset)
const toRelease = (value: unknown): EvidenceRelease => {
  if (!isRelease(value)) throw new GhRunnerError('GitHub release response is missing required fields')
  if (!Array.isArray(value.assets) || !value.assets.every(isRawAsset))
    throw new GhRunnerError('GitHub release assets have an unexpected shape')
  return {
    id: value.id as number,
    tagName: value.tag_name as string,
    uploadUrl: value.upload_url as string,
    isDraft: value.draft as boolean,
    isPrerelease: value.prerelease as boolean,
    isPrivate: value.private as boolean | undefined,
    assets: value.assets.map(asset => toAsset(asset)),
  }
}

const assertStableRelease = (release: EvidenceRelease): EvidenceRelease => {
  if (release.tagName !== EVIDENCE_RELEASE_TAG || release.isDraft || release.isPrerelease || release.isPrivate)
    throw new GhRunnerError('evidence release must be published and stable')
  return release
}
const isNotFound = (result: {readonly exitCode: number | null; readonly stderr: string}): boolean =>
  result.exitCode !== 0 && /\b404\b/.test(result.stderr)
const releaseEndpoint = (repository: {readonly owner: string; readonly repo: string}): string =>
  `repos/${repository.owner}/${repository.repo}/releases/tags/${EVIDENCE_RELEASE_TAG}`
const acceptsUnknown = (_value: unknown): _value is unknown => true

export const inspectEvidenceRelease = async (
  runner: GhRunner,
  repository: {readonly owner: string; readonly repo: string},
): Promise<EvidenceReleaseLookup> => {
  const existing = await runner.run(['api', releaseEndpoint(repository)])
  if (existing.exitCode === 0)
    return {status: 'found', release: assertStableRelease(toRelease(parseGhJson(existing, isRecord)))}
  if (isNotFound(existing)) return {status: 'missing'}
  throw new GhRunnerError(`GitHub release lookup failed with exit code ${existing.exitCode ?? 'unknown'}`)
}

export const listEvidenceAssets = async (
  runner: GhRunner,
  repository: {readonly owner: string; readonly repo: string},
  release: EvidenceRelease,
): Promise<readonly EvidenceAsset[]> => {
  assertStableRelease(release)
  const endpoint = `repos/${repository.owner}/${repository.repo}/releases/${release.id}/assets`
  const listed = await runner.run(['api', endpoint, '--paginate', '--slurp'])
  return parseAssetList(parseGhJson(listed, acceptsUnknown))
}

export const getOrCreateEvidenceRelease = async (
  runner: GhRunner,
  repository: {readonly owner: string; readonly repo: string},
): Promise<EvidenceRelease> => {
  const inspected = await inspectEvidenceRelease(runner, repository)
  if (inspected.status === 'found') return inspected.release
  const created = await runner.run(
    ['api', `repos/${repository.owner}/${repository.repo}/releases`, '--method', 'POST', '--input', '-'],
    {
      input: JSON.stringify({
        tag_name: EVIDENCE_RELEASE_TAG,
        name: EVIDENCE_RELEASE_TAG,
        body: 'Machine-managed live audit evidence. Do not rename or delete referenced assets.',
        draft: false,
        prerelease: false,
      }),
    },
  )
  return assertStableRelease(toRelease(parseGhJson(created, isRecord)))
}

const digest = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')
export const evidenceAssetName = (input: {
  readonly operationKey: string
  readonly fingerprint: string
  readonly variantKey: string
  readonly role: 'context' | 'crop'
  readonly bytes: Uint8Array
}): string =>
  `${input.operationKey}-${input.fingerprint}-${input.variantKey}-${input.role}-${digest(input.bytes).slice(0, 16)}.png`
const allowedImageOrigin = (value: string): boolean => {
  try {
    const origin = new URL(value).hostname
    return origin === 'github.com' || origin.endsWith('.githubusercontent.com')
  } catch {
    return false
  }
}
const isExpectedReleaseUrl = (value: string, expected: PublicImageExpectation): boolean => {
  try {
    const parsed = new URL(value)
    return (
      parsed.hostname === 'github.com' &&
      parsed.pathname === `/${expected.owner}/${expected.repo}/releases/download/${expected.tag}/${expected.assetName}`
    )
  } catch {
    return false
  }
}
const readResponseBytes = async (response: Response, maxBytes: number, signal: AbortSignal): Promise<Uint8Array> => {
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength > maxBytes) throw new Error('public image exceeded byte limit')
    return bytes
  }
  const reader = response.body.getReader()
  const abort = (): void => {
    reader.cancel('response read aborted').catch(() => undefined)
  }
  signal.addEventListener('abort', abort, {once: true})
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break
      if (total + result.value.byteLength > maxBytes) {
        await reader.cancel('response exceeded byte limit')
        throw new Error('public image exceeded byte limit')
      }
      chunks.push(result.value)
      total += result.value.byteLength
    }
  } finally {
    signal.removeEventListener('abort', abort)
    reader.releaseLock()
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

export const verifyPublicPng = async (
  url: string,
  fetchImpl: typeof fetch = fetch,
  expected: PublicImageExpectation,
  limits: {readonly timeoutMs?: number; readonly maxBytes?: number} = {},
): Promise<PublicImageResult> => {
  const maxBytes = limits.maxBytes ?? 5_000_000
  try {
    if (!isExpectedReleaseUrl(url, expected))
      return {ok: false, reason: 'image URL is outside the expected release namespace'}
    const signal = AbortSignal.timeout(limits.timeoutMs ?? 15_000)
    const response = await fetchImpl(url, {redirect: 'follow', signal})
    if (
      !response.ok ||
      !allowedImageOrigin(response.url) ||
      (new URL(response.url).hostname === 'github.com' && !isExpectedReleaseUrl(response.url, expected))
    )
      return {ok: false, reason: 'image response was not a public GitHub image'}
    const contentType = response.headers.get('content-type') ?? ''
    const contentLength = Number(response.headers.get('content-length'))
    if (Number.isFinite(contentLength) && contentLength > maxBytes)
      return {ok: false, reason: 'public image exceeded byte limit'}
    const bytes = await readResponseBytes(response, maxBytes, signal)
    if (!contentType.toLowerCase().startsWith('image/png'))
      return {ok: false, reason: 'public response was not a PNG image'}
    try {
      validatePng(bytes, maxBytes)
    } catch (error) {
      return {ok: false, reason: error instanceof Error ? error.message : 'public PNG is invalid'}
    }
    const sha256 = digest(bytes)
    if (expected.expectedSha256 !== undefined && expected.expectedSha256 !== sha256)
      return {ok: false, reason: 'public image hash mismatch'}
    return {ok: true, bytes, contentType, sha256}
  } catch (error) {
    return {ok: false, reason: error instanceof Error ? error.message : 'image verification failed'}
  }
}

const assetMatches = (asset: EvidenceAsset, expectedBytes: Uint8Array): boolean =>
  asset.state === 'uploaded' &&
  asset.size === expectedBytes.byteLength &&
  asset.contentType.toLowerCase() === 'image/png' &&
  asset.digest === `sha256:${digest(expectedBytes)}`

const isSafeAssetName = (value: string): boolean => /^[A-Za-z0-9][\w.-]{0,200}\.png$/.test(value)
const assertExpectedPng = (bytes: Uint8Array): void => {
  try {
    validatePng(bytes)
  } catch (error) {
    throw new GhRunnerError(error instanceof Error ? error.message : 'expected evidence is not a valid PNG')
  }
}
type CollisionClassification =
  | {readonly kind: 'absent'}
  | {readonly kind: 'replace'; readonly asset: EvidenceAsset; readonly reason: string}
  | {readonly kind: 'verify'; readonly asset: EvidenceAsset}
  | {readonly kind: 'error'; readonly asset?: EvidenceAsset; readonly reason: string}
const classifyCollision = (
  assets: readonly EvidenceAsset[],
  assetName: string,
  expectedBytes: Uint8Array,
  expectedUrl: PublicImageExpectation,
): CollisionClassification => {
  const namedAssets = assets.filter(asset => asset.name === assetName)
  if (namedAssets.length > 1)
    return {kind: 'error', asset: namedAssets[0], reason: 'multiple release assets share the requested name'}
  const collision = namedAssets[0]
  if (!collision) return {kind: 'absent'}
  if (collision.state === 'starter' || collision.size === 0)
    return {kind: 'replace', asset: collision, reason: 'existing asset is positively incomplete'}
  if (!assetMatches(collision, expectedBytes))
    return {kind: 'error', asset: collision, reason: 'existing asset metadata does not match expected PNG'}
  if (!isExpectedReleaseUrl(collision.browserDownloadUrl, expectedUrl))
    return {kind: 'error', asset: collision, reason: 'existing asset URL is outside the release namespace'}
  return {kind: 'verify', asset: collision}
}

export const planEvidenceAsset = async (input: {
  readonly repository: {readonly owner: string; readonly repo: string}
  readonly release: EvidenceRelease
  readonly assets: readonly EvidenceAsset[]
  readonly assetName: string
  readonly expectedBytes: Uint8Array
  readonly verifyPublicImage: (url: string) => Promise<PublicImageResult>
}): Promise<EvidenceAssetPlan> => {
  assertStableRelease(input.release)
  if (!isSafeAssetName(input.assetName)) throw new GhRunnerError('unsafe evidence asset name')
  assertExpectedPng(input.expectedBytes)
  const expectedUrl = {
    owner: input.repository.owner,
    repo: input.repository.repo,
    tag: input.release.tagName,
    assetName: input.assetName,
  }
  const classification = classifyCollision(input.assets, input.assetName, input.expectedBytes, expectedUrl)
  if (classification.kind === 'absent')
    return {kind: 'upload', assetName: input.assetName, expectedBytes: input.expectedBytes}
  if (classification.kind === 'replace')
    return {
      kind: 'replace',
      asset: classification.asset,
      assetName: input.assetName,
      expectedBytes: input.expectedBytes,
      reason: classification.reason,
      delete: true,
      upload: true,
    }
  if (classification.kind === 'error')
    return {kind: 'error', asset: classification.asset, reason: classification.reason}
  let verified: PublicImageResult
  try {
    verified = await input.verifyPublicImage(classification.asset.browserDownloadUrl)
  } catch (error) {
    return {
      kind: 'error',
      asset: classification.asset,
      reason: error instanceof Error ? error.message : 'public verification failed',
    }
  }
  if (!verified.ok || verified.sha256 !== digest(input.expectedBytes))
    return {kind: 'error', asset: classification.asset, reason: verified.reason ?? 'public verification failed'}
  return {kind: 'reuse', asset: classification.asset}
}

export const publishEvidenceAsset = async (input: {
  readonly runner: GhRunner
  readonly repository: {readonly owner: string; readonly repo: string}
  readonly release: EvidenceRelease
  readonly assetName: string
  readonly expectedBytes: Uint8Array
  readonly verifyPublicImage: (url: string) => Promise<PublicImageResult>
}): Promise<AssetPublishResult> => {
  assertStableRelease(input.release)
  if (!isSafeAssetName(input.assetName)) throw new GhRunnerError('unsafe evidence asset name')
  assertExpectedPng(input.expectedBytes)
  const assetEndpoint = `repos/${input.repository.owner}/${input.repository.repo}/releases/${input.release.id}/assets`
  const listed = await input.runner.run(['api', assetEndpoint, '--paginate', '--slurp'])
  const assets = parseAssetList(parseGhJson(listed, acceptsUnknown))
  const expectedUrl = {
    owner: input.repository.owner,
    repo: input.repository.repo,
    tag: input.release.tagName,
    assetName: input.assetName,
  }
  const classification = classifyCollision(assets, input.assetName, input.expectedBytes, expectedUrl)
  if (classification.kind === 'verify') {
    const verified = await input.verifyPublicImage(classification.asset.browserDownloadUrl)
    if (verified.ok && verified.sha256 === digest(input.expectedBytes))
      return {reused: true, asset: classification.asset}
    throw new GhRunnerError('existing durable evidence asset could not be publicly verified; refusing deletion')
  }
  if (classification.kind === 'error') throw new GhRunnerError(classification.reason)
  if (classification.kind === 'replace') {
    const collision = classification.asset
    const deleted = await input.runner.run([
      'api',
      `repos/${input.repository.owner}/${input.repository.repo}/releases/assets/${collision.id}`,
      '--method',
      'DELETE',
    ])
    if (deleted.exitCode !== 0)
      throw new GhRunnerError(`asset collision delete failed with exit code ${deleted.exitCode ?? 'unknown'}`)
  }
  const tempDirectory = mkdtempSync(join(tmpdir(), 'live-audit-evidence-'))
  const tempPath = join(tempDirectory, input.assetName)
  writeFileSync(tempPath, input.expectedBytes)
  try {
    const uploaded = await input.runner.run([
      'release',
      'upload',
      input.release.tagName,
      tempPath,
      '--repo',
      `${input.repository.owner}/${input.repository.repo}`,
    ])
    if (uploaded.exitCode !== 0 && !uploaded.stderr.includes('422'))
      throw new GhRunnerError(`asset upload failed with exit code ${uploaded.exitCode ?? 'unknown'}`)
    const after = parseAssetList(
      parseGhJson(await input.runner.run(['api', assetEndpoint, '--paginate', '--slurp']), acceptsUnknown),
    )
    const asset = after.find(candidate => candidate.name === input.assetName)
    if (
      !asset ||
      !assetMatches(asset, input.expectedBytes) ||
      !isExpectedReleaseUrl(asset.browserDownloadUrl, expectedUrl)
    )
      throw new GhRunnerError('uploaded evidence asset could not be verified')
    const verified = await input.verifyPublicImage(asset.browserDownloadUrl)
    if (!verified.ok || verified.sha256 !== digest(input.expectedBytes))
      throw new GhRunnerError('uploaded evidence URL did not return matching PNG bytes')
    return {reused: false, asset}
  } finally {
    rmSync(tempDirectory, {recursive: true, force: true})
  }
}
