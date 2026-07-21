import {createHash} from 'node:crypto'
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {GhRunnerError, parseGhJson, type GhRunner} from './github-runner'

export const EVIDENCE_RELEASE_TAG = 'live-audit-evidence'
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

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
      : []
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

export const getOrCreateEvidenceRelease = async (
  runner: GhRunner,
  repository: {readonly owner: string; readonly repo: string},
): Promise<EvidenceRelease> => {
  const endpoint = `repos/${repository.owner}/${repository.repo}/releases/tags/${EVIDENCE_RELEASE_TAG}`
  const existing = await runner.run(['api', endpoint])
  let release: EvidenceRelease
  if (existing.exitCode === 0) release = toRelease(parseGhJson(existing, isRecord))
  else if (existing.stderr.includes('404')) {
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
    release = toRelease(parseGhJson(created, isRecord))
  } else throw new GhRunnerError(`GitHub release lookup failed with exit code ${existing.exitCode ?? 'unknown'}`)
  if (release.tagName !== EVIDENCE_RELEASE_TAG || release.isDraft || release.isPrerelease || release.isPrivate)
    throw new GhRunnerError('evidence release must be published and stable')
  return release
}

const digest = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')
const acceptsUnknown = (_value: unknown): _value is unknown => true
export const evidenceAssetName = (input: {
  readonly operationKey: string
  readonly fingerprint: string
  readonly variantKey: string
  readonly role: 'context' | 'crop'
  readonly bytes: Uint8Array
}): string =>
  `${input.operationKey}-${input.fingerprint}-${input.variantKey}-${input.role}-${digest(input.bytes).slice(0, 16)}.png`
const isPng = (bytes: Uint8Array): boolean => PNG_MAGIC.every((byte, index) => bytes[index] === byte)
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
    if (!contentType.toLowerCase().startsWith('image/png') || !isPng(bytes))
      return {ok: false, reason: 'public response was not a PNG image'}
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

export const publishEvidenceAsset = async (input: {
  readonly runner: GhRunner
  readonly repository: {readonly owner: string; readonly repo: string}
  readonly release: EvidenceRelease
  readonly assetName: string
  readonly expectedBytes: Uint8Array
  readonly verifyPublicImage: (url: string) => Promise<PublicImageResult>
}): Promise<AssetPublishResult> => {
  if (!/^[A-Za-z0-9][\w.-]{0,200}\.png$/.test(input.assetName)) throw new GhRunnerError('unsafe evidence asset name')
  const assetEndpoint = `repos/${input.repository.owner}/${input.repository.repo}/releases/${input.release.id}/assets`
  const listed = await input.runner.run(['api', assetEndpoint, '--paginate', '--slurp'])
  const assets = parseAssetList(parseGhJson(listed, acceptsUnknown))
  const collision = assets.find(asset => asset.name === input.assetName)
  if (collision && assetMatches(collision, input.expectedBytes)) {
    const verified = await input.verifyPublicImage(collision.browserDownloadUrl)
    if (verified.ok && verified.sha256 === digest(input.expectedBytes)) return {reused: true, asset: collision}
  }
  if (collision) {
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
    if (!asset || !assetMatches(asset, input.expectedBytes))
      throw new GhRunnerError('uploaded evidence asset could not be verified')
    const verified = await input.verifyPublicImage(asset.browserDownloadUrl)
    if (!verified.ok || verified.sha256 !== digest(input.expectedBytes))
      throw new GhRunnerError('uploaded evidence URL did not return matching PNG bytes')
    return {reused: false, asset}
  } finally {
    rmSync(tempDirectory, {recursive: true, force: true})
  }
}
