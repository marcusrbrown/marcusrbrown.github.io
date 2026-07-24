import type {Page} from '@playwright/test'
import {Buffer} from 'node:buffer'
import {createHash} from 'node:crypto'
import {mkdir, readFile, stat} from 'node:fs/promises'
import path from 'node:path'
import {inflateSync} from 'node:zlib'

import {presetThemes} from '../../src/utils/preset-themes'
import {
  AUDIT_PRESET_IDS,
  AUDIT_ROUTES,
  AUDIT_THEMES,
  AUDIT_VIEWPORTS,
  isAuditAssertionForFindingClass,
  isAuditPresetId,
  isAuditRoute,
  parseAuditActions,
  parseAuditAssertion,
  parseAuditManifest,
  parseTargetDescriptor,
  parseThemeSelection,
  type AuditAction,
  type AuditAssertion,
  type AuditManifest,
  type AuditPresetId,
  type AuditRoute,
  type AuditThemeSelection,
  type AuditVariant,
  type AuditViewport,
  type EvidenceIntegrity,
  type EvidenceReference,
  type Finding,
  type ResponsiveCounterpart,
  type TargetDescriptor,
  type ValidationClean,
  type ValidationInfrastructureError,
} from './contract'
import {findingFingerprint, normalizeIdentityText, variantKey} from './identity'
import {assertIssueLedger, type IssueLedger} from './issue-ledger'

export const AUDIT_ORIGIN = 'https://mrbro.dev'
export const CANDIDATE_BUNDLE_VERSION = 1
export const MAX_CANDIDATES = 100
export const MAX_EXPLORATION_STEPS = 20
export const MAX_EXPLORATION_MS = 120_000
export const MAX_DIAGNOSTICS = 100
export const MAX_EVIDENCE_BYTES = 5_000_000
export const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

export interface Candidate {
  route: AuditRoute
  findingClass: Finding['findingClass']
  responsive: Finding['responsive']
  semanticTarget: string
  target: TargetDescriptor
  assertion: AuditAssertion
  actions: AuditAction[]
  failureSignature: string
  description: string
  reproduction: string[]
  variant: AuditVariant
  observation: {status: 'failure'; signature: string; observedAt: string}
}

const candidateVariantKey = (candidate: Candidate): string => variantKey(candidate.variant)
const candidateFingerprint = (candidate: Candidate): string => findingFingerprint(candidate)

const buildCandidateReplayRequest = (
  candidate: Candidate,
  variant: AuditVariant = candidate.variant,
  issueNumber = 1,
): ActiveVariantReplayRequest => ({
  issueNumber,
  fingerprint: candidateFingerprint(candidate),
  variantKey: candidateVariantKey(candidate),
  route: candidate.route,
  semanticTarget: candidate.semanticTarget,
  findingClass: candidate.findingClass,
  assertion: candidate.assertion,
  actions: candidate.actions,
  failureSignature: candidate.failureSignature,
  responsive: candidate.responsive,
  variant,
  target: candidate.target,
  reproduction: candidate.reproduction,
})

export interface CandidateBundle {
  version: 1
  runId: string
  runKind: 'scheduled' | 'manual'
  generatedAt: string
  issueNumber?: number
  rotatingPresetId?: AuditPresetId
  candidates: Candidate[]
  diagnostics: string[]
  exploration: {steps: number; durationMs: number}
}

export interface CoreMatrixState {
  route: AuditRoute
  viewport: AuditViewport
  theme: AuditThemeSelection
  state: 'core'
}

export interface ActiveVariantReplayRequest {
  issueNumber: number
  fingerprint: string
  variantKey: string
  route: AuditRoute
  semanticTarget: string
  findingClass: Finding['findingClass']
  failureSignature: string
  responsive: Finding['responsive']
  variant: AuditVariant
  target: TargetDescriptor
  assertion: AuditAssertion
  actions: AuditAction[]
  reproduction: string[]
}

export const buildActiveReplayRequests = (issueNumber: number, ledger: IssueLedger): ActiveVariantReplayRequest[] => {
  if (!Number.isInteger(issueNumber) || issueNumber < 1) throw new Error('invalid active replay issue number')
  assertIssueLedger(ledger)
  const replays = new Map(ledger.replay.map(replay => [replay.variantKey, replay]))
  if (replays.size !== ledger.replay.length || replays.size !== ledger.variants.length)
    throw new Error('active variant replay is not bijective')
  return ledger.variants.map(variant => {
    const replay = replays.get(variant.key)
    if (!replay) throw new Error('active variant replay is missing')
    if (variantKey(variant) !== variant.key) throw new Error('active variant key does not match replay variant')
    return {
      issueNumber,
      fingerprint: ledger.fingerprint,
      variantKey: variant.key,
      route: ledger.route,
      semanticTarget: ledger.semanticTarget,
      findingClass: ledger.findingClass,
      assertion: ledger.assertion,
      actions: replay.actions,
      failureSignature: ledger.failureSignature,
      responsive: ledger.responsive,
      variant: {viewport: variant.viewport, theme: variant.theme, state: variant.state},
      target: replay.target,
      reproduction: replay.reproduction,
    }
  })
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const safeText = (value: unknown, max = 2_000): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= max &&
  [...value].every(character => {
    const code = character.codePointAt(0) ?? 0
    return code > 0x1f && code !== 0x7f
  })
const dateTime = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value))
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).every(key => keys.includes(key))

/** Parse the agent handoff. This is deliberately not `AuditManifest`: candidates have one observation only. */
export const parseCandidateBundle = (input: unknown): CandidateBundle => {
  if (
    !isRecord(input) ||
    !exactKeys(input, [
      'version',
      'runId',
      'runKind',
      'generatedAt',
      'issueNumber',
      'rotatingPresetId',
      'candidates',
      'diagnostics',
      'exploration',
    ]) ||
    input.version !== CANDIDATE_BUNDLE_VERSION ||
    !safeText(input.runId, 200) ||
    !dateTime(input.generatedAt) ||
    !['scheduled', 'manual'].includes(String(input.runKind)) ||
    !Array.isArray(input.candidates) ||
    input.candidates.length > MAX_CANDIDATES ||
    !Array.isArray(input.diagnostics) ||
    input.diagnostics.length > MAX_DIAGNOSTICS ||
    input.diagnostics.some(value => !safeText(value, 500)) ||
    !isRecord(input.exploration) ||
    !Number.isInteger(input.exploration.steps) ||
    Number(input.exploration.steps) < 0 ||
    Number(input.exploration.steps) > MAX_EXPLORATION_STEPS ||
    !Number.isInteger(input.exploration.durationMs) ||
    Number(input.exploration.durationMs) < 0 ||
    Number(input.exploration.durationMs) > MAX_EXPLORATION_MS
  )
    throw new Error('invalid live-audit candidate bundle')
  if (
    input.runKind === 'scheduled' &&
    (!isAuditPresetId(String(input.rotatingPresetId)) || input.issueNumber !== undefined)
  )
    throw new Error('invalid scheduled candidate metadata')
  if (
    input.runKind === 'manual' &&
    (!Number.isInteger(input.issueNumber) || Number(input.issueNumber) < 1 || input.rotatingPresetId !== undefined)
  )
    throw new Error('invalid manual candidate metadata')
  const candidates = input.candidates.map(value => {
    if (
      !isRecord(value) ||
      Object.keys(value).sort().join(',') !==
        'actions,assertion,description,failureSignature,findingClass,observation,reproduction,responsive,route,semanticTarget,target,variant'
    )
      throw new Error('candidate contains unsupported fields')
    if (
      typeof value.route !== 'string' ||
      !isAuditRoute(value.route) ||
      !safeText(value.semanticTarget, 200) ||
      !safeText(value.failureSignature) ||
      !isRecord(value.assertion) ||
      !safeText(value.description) ||
      !Array.isArray(value.reproduction) ||
      value.reproduction.length === 0 ||
      value.reproduction.length > 20 ||
      value.reproduction.some(step => !safeText(step, 500)) ||
      !['not-applicable', 'required', 'uncertain'].includes(String(value.responsive)) ||
      !['broken-image', 'layout', 'overflow', 'visibility', 'hit-target', 'content'].includes(
        String(value.findingClass),
      ) ||
      !isRecord(value.variant) ||
      !['desktop', 'mobile'].includes(String(value.variant.viewport)) ||
      !safeText(value.variant.state, 200) ||
      !isRecord(value.observation) ||
      value.observation.status !== 'failure' ||
      !safeText(value.observation.signature) ||
      !dateTime(value.observation.observedAt)
    )
      throw new Error('invalid candidate')
    parseTargetDescriptor(value.target)
    const assertion = parseAuditAssertion(value.assertion)
    const actions = parseAuditActions(value.actions)
    if (!isAuditAssertionForFindingClass(value.findingClass as Finding['findingClass'], assertion))
      throw new Error('candidate finding class does not match assertion')
    parseThemeSelection(value.variant.theme)
    return {...value, actions} as unknown as Candidate
  })
  return {...input, candidates} as unknown as CandidateBundle
}

export const reconstructAuditUrl = (route: unknown): URL => {
  if (typeof route !== 'string' || !isAuditRoute(route) || route.includes('://') || route.startsWith('//'))
    throw new Error('route is not an allowlisted relative route')
  const url = new URL(route, AUDIT_ORIGIN)
  if (url.origin !== AUDIT_ORIGIN || url.username || url.password || url.search || url.hash)
    throw new Error('route expands outside the production origin')
  return url
}

interface NavigationPage {
  goto: (
    url: string,
    options: {timeout: number; waitUntil: 'domcontentloaded'},
  ) => Promise<{status: () => number} | null>
  url: () => string
}

export const navigateAuditRoute = async (page: NavigationPage, route: AuditRoute, timeout = 30_000): Promise<void> => {
  const response = await page.goto(reconstructAuditUrl(route).toString(), {timeout, waitUntil: 'domcontentloaded'})
  if (new URL(page.url()).origin !== AUDIT_ORIGIN) throw new Error('final navigation redirected off origin')
  if (response && response.status() >= 400) throw new Error(`audit route returned HTTP ${response.status()}`)
}

export const chooseRotatingPreset = (when: Date): AuditPresetId => {
  if (Number.isNaN(when.getTime())) throw new Error('invalid schedule time')
  const minutes = when.getUTCHours() * 60 + when.getUTCMinutes()
  if (minutes !== 3 * 60 + 30 && minutes !== 15 * 60 + 30) throw new Error('invalid schedule slot')
  const slot = minutes === 15 * 60 + 30 ? 1 : 0
  const day = Math.floor(Date.UTC(when.getUTCFullYear(), when.getUTCMonth(), when.getUTCDate()) / 86_400_000)
  return AUDIT_PRESET_IDS[
    (((day * 2 + slot) % AUDIT_PRESET_IDS.length) + AUDIT_PRESET_IDS.length) % AUDIT_PRESET_IDS.length
  ] as AuditPresetId
}

export const buildCoreMatrix = (presetId: AuditPresetId): CoreMatrixState[] => {
  if (!isAuditPresetId(presetId)) throw new Error('unknown rotating preset')
  return AUDIT_ROUTES.flatMap(route =>
    AUDIT_VIEWPORTS.flatMap(viewport => [
      ...AUDIT_THEMES.map(mode => ({route, viewport, theme: {kind: 'mode' as const, mode}, state: 'core' as const})),
      {route, viewport, theme: {kind: 'preset' as const, presetId}, state: 'core' as const},
    ]),
  )
}

export const MAX_PNG_DIMENSION = 10_000
const MAX_PNG_DECOMPRESSED_BYTES = 50_000_000
const PNG_CRC_TABLE = Array.from({length: 256}, (_, value) => {
  let crc = value
  for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) === 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
  return crc >>> 0
})
const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff
  for (const byte of bytes) crc = (PNG_CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}
const pngChannels = (colorType: number): number => {
  if (colorType === 0 || colorType === 3) return 1
  if (colorType === 2) return 3
  if (colorType === 4) return 2
  if (colorType === 6) return 4
  throw new Error('evidence PNG has an unsupported color type')
}
const validBitDepth = (colorType: number, bitDepth: number): boolean => {
  if (colorType === 3) return [1, 2, 4, 8].includes(bitDepth)
  if (colorType === 0) return [1, 2, 4, 8, 16].includes(bitDepth)
  return [8, 16].includes(bitDepth)
}

export const validatePng = (bytes: Uint8Array, maxBytes = MAX_EVIDENCE_BYTES): {width: number; height: number} => {
  const buffer = Buffer.from(bytes)
  if (buffer.length > maxBytes) throw new Error('evidence PNG exceeds size limit')
  if (buffer.length < PNG_SIGNATURE.length || !PNG_SIGNATURE.every((byte, index) => buffer[index] === byte))
    throw new Error('evidence is not a PNG')

  let offset = PNG_SIGNATURE.length
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  let interlace = 0
  let seenHeader = false
  let seenPalette = false
  let seenData = false
  let dataEnded = false
  let seenEnd = false
  const idat: Buffer[] = []

  while (offset < buffer.length) {
    if (buffer.length - offset < 12) throw new Error('evidence PNG has a truncated chunk')
    const length = buffer.readUInt32BE(offset)
    if (length > buffer.length - offset - 12) throw new Error('evidence PNG has a truncated chunk')
    const typeBytes = buffer.subarray(offset + 4, offset + 8)
    if (!typeBytes.every(byte => (byte >= 0x41 && byte <= 0x5a) || (byte >= 0x61 && byte <= 0x7a)))
      throw new Error('evidence PNG has an invalid chunk type')
    const type = typeBytes.toString('ascii')
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    const expectedCrc = buffer.readUInt32BE(offset + 8 + length)
    const crcInput = Buffer.allocUnsafe(4 + length)
    typeBytes.copy(crcInput, 0)
    data.copy(crcInput, 4)
    if (crc32(crcInput) !== expectedCrc) throw new Error('evidence PNG has an invalid chunk CRC')

    if (!seenHeader && type !== 'IHDR') throw new Error('evidence PNG must begin with IHDR')
    if (type === 'IHDR') {
      if (seenHeader || length !== 13) throw new Error('evidence PNG has an invalid IHDR')
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8] ?? 0
      colorType = data[9] ?? 0
      const compression = data[10]
      const filter = data[11]
      interlace = data[12] ?? 255
      if (
        width === 0 ||
        height === 0 ||
        width > MAX_PNG_DIMENSION ||
        height > MAX_PNG_DIMENSION ||
        !validBitDepth(colorType, bitDepth) ||
        compression !== 0 ||
        filter !== 0 ||
        interlace !== 0
      )
        throw new Error('evidence PNG has invalid image dimensions or encoding')
      seenHeader = true
    } else if (type === 'PLTE') {
      if (
        seenPalette ||
        seenData ||
        length === 0 ||
        length % 3 !== 0 ||
        length > 768 ||
        colorType === 0 ||
        colorType === 4
      )
        throw new Error('evidence PNG has an invalid palette')
      seenPalette = true
      if (colorType === 3 && length / 3 > 2 ** bitDepth) throw new Error('evidence PNG palette exceeds bit depth')
    } else if (type === 'IDAT') {
      if (dataEnded || !seenHeader || (colorType === 3 && !seenPalette))
        throw new Error('evidence PNG has IDAT in an invalid position')
      seenData = true
      idat.push(Buffer.from(data))
    } else if (type === 'IEND') {
      if (length !== 0 || !seenData || seenEnd) throw new Error('evidence PNG has an invalid IEND')
      seenEnd = true
      offset += 12
      if (offset !== buffer.length) throw new Error('evidence PNG has trailing data')
      break
    } else if ((typeBytes[0] ?? 0) < 0x61) {
      throw new Error('evidence PNG has an unsupported critical chunk')
    }

    if (type !== 'IDAT' && seenData) dataEnded = true
    offset += 12 + length
  }

  if (!seenHeader || !seenData || !seenEnd) throw new Error('evidence PNG is incomplete')
  if (colorType === 3 && !seenPalette) throw new Error('evidence PNG is missing its palette')
  const bitsPerPixel = pngChannels(colorType) * bitDepth
  const rowBytes = Math.ceil((width * bitsPerPixel) / 8)
  const scanlineBytes = (rowBytes + 1) * height
  if (scanlineBytes > MAX_PNG_DECOMPRESSED_BYTES) throw new Error('evidence PNG decompressed data exceeds size limit')
  let scanlines: Buffer
  try {
    scanlines = inflateSync(Buffer.concat(idat), {maxOutputLength: scanlineBytes + 1})
  } catch {
    throw new Error('evidence PNG IDAT stream is invalid')
  }
  if (scanlines.length !== scanlineBytes) throw new Error('evidence PNG IDAT stream is truncated or oversized')
  for (let row = 0; row < height; row += 1) {
    const filter = scanlines[row * (rowBytes + 1)]
    if (filter === undefined || filter > 4) throw new Error('evidence PNG has an invalid scanline filter')
  }
  return {width, height}
}

export const computeEvidenceIntegrity = (relativePath: string, bytes: Uint8Array): EvidenceIntegrity => {
  const pathParts = relativePath.split('/')
  if (
    relativePath.length === 0 ||
    relativePath.length > 500 ||
    relativePath.startsWith('/') ||
    relativePath.includes('\\') ||
    pathParts.some(part => part.length === 0 || part === '.' || part === '..') ||
    /(?:^|\/)(?:tmp|temp|runner|home|var)(?:\/|$)/i.test(relativePath)
  )
    throw new Error('evidence integrity path is unsafe')
  const dimensions = validatePng(bytes)
  return {
    path: relativePath,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    width: dimensions.width,
    height: dimensions.height,
    bytes: bytes.byteLength,
  }
}

const locatorFor = (page: Page, target: TargetDescriptor) => {
  if (target.kind === 'role') {
    const roles = ['article', 'button', 'heading', 'img', 'link', 'listitem', 'main', 'navigation', 'region'] as const
    const role = roles.find(candidate => candidate === target.role)
    if (!role) throw new Error('unsupported accessibility role')
    return page.getByRole(role, {name: target.name})
  }
  if (target.kind === 'text') return page.getByText(target.value, {exact: true})
  if (target.kind === 'test-id') return page.getByTestId(target.value)
  return undefined
}

const viewportSize = (viewport: AuditViewport): {width: number; height: number} =>
  viewport === 'desktop' ? {width: 1440, height: 900} : {width: 390, height: 844}

const themeOptionName = (theme: AuditThemeSelection): string => {
  if (theme.kind === 'mode') return theme.mode.charAt(0).toUpperCase() + theme.mode.slice(1)
  const preset = presetThemes.find(candidate => candidate.id === theme.presetId)
  if (!preset) throw new Error('unknown audit theme preset')
  return preset.name
}

const resolveActionTarget = async (page: Page, target: TargetDescriptor) => {
  const locator = locatorFor(page, target)
  if (!locator || (await locator.count()) !== 1) throw new Error('action target is missing or ambiguous')
  return locator
}

export const prepareAuditReplayState = async (
  page: Page,
  input:
    | Pick<Candidate, 'route' | 'variant' | 'actions'>
    | Pick<ActiveVariantReplayRequest, 'route' | 'variant' | 'actions'>,
): Promise<void> => {
  const actions = parseAuditActions(input.actions)
  await page.setViewportSize(viewportSize(input.variant.viewport))
  await navigateAuditRoute(page, input.route)

  const trigger = page.getByRole('button', {name: /open theme picker/i})
  if ((await trigger.count()) !== 1) throw new Error('theme picker trigger is missing or ambiguous')
  await trigger.click()
  const option = page.getByRole('option', {name: themeOptionName(input.variant.theme), exact: true})
  if ((await option.count()) !== 1) throw new Error('theme picker option is missing or ambiguous')
  await option.click()
  if ((await option.getAttribute('aria-selected')) !== 'true') throw new Error('theme picker option was not selected')

  for (const action of actions) {
    if (action.kind === 'press' && action.scope === 'page') {
      await page.keyboard.press(action.key)
      continue
    }
    const locator = await resolveActionTarget(page, action.target)
    if (action.kind === 'click') {
      const box = await locator.boundingBox()
      if (!box || box.width <= 0 || box.height <= 0) throw new Error('action target is detached or zero-size')
      await locator.click()
    } else if (action.kind === 'press') {
      const box = await locator.boundingBox()
      if (!box || box.width <= 0 || box.height <= 0) throw new Error('action target is detached or zero-size')
      await locator.press(action.key)
    } else {
      await locator.waitFor({state: action.condition, timeout: action.timeoutMs})
    }
  }
}

export interface CapturedEvidence {
  context: EvidenceReference
  crop: EvidenceReference
}

export interface EvidenceIdentity {
  fingerprint: string
  variantKey: string
  route: AuditRoute
  viewport: AuditViewport
  theme: AuditThemeSelection
  semanticTarget: string
  observedResult: 'failure' | 'clean'
}

export const responsiveCounterpartDecision = (
  responsive: Finding['responsive'],
): 'capture-counterpart' | 'not-required' =>
  responsive === 'required' || responsive === 'uncertain' ? 'capture-counterpart' : 'not-required'

export interface ReplayObservation {
  status: 'failure' | 'clean' | 'infrastructure-error'
  signature: string
  observedAt: string
}

export const evaluateAuditAssertion = async (
  page: Page,
  target: TargetDescriptor,
  rawAssertion: AuditAssertion,
): Promise<ReplayObservation> => {
  const observedAt = new Date().toISOString()
  try {
    const assertion = parseAuditAssertion(rawAssertion)
    if (new URL(page.url()).origin !== AUDIT_ORIGIN) throw new Error('page is outside the audit origin')
    const result = (passes: boolean, detail: string): ReplayObservation => ({
      status: passes ? 'clean' : 'failure',
      signature: normalizeIdentityText(`assertion:${assertion.kind}:${detail}`).slice(0, 2_000),
      observedAt,
    })
    const resolve = async (descriptor: TargetDescriptor) => {
      const locator = locatorFor(page, descriptor)
      if (!locator) {
        if (descriptor.kind !== 'region' || descriptor.width <= 0 || descriptor.height <= 0)
          throw new Error('target is not resolvable')
        return {locator: undefined, box: descriptor}
      }
      if ((await locator.count()) !== 1) throw new Error('target is missing or ambiguous')
      const box = await locator.boundingBox()
      if (!box || box.width <= 0 || box.height <= 0) throw new Error('target is detached or zero-size')
      return {locator, box}
    }
    const primary = await resolve(target)
    if (assertion.kind === 'image-load') {
      if (!primary.locator) throw new Error('image assertion requires a DOM target')
      const state = await primary.locator.evaluate(element => {
        const image = element instanceof HTMLImageElement ? element : element.querySelector('img')
        return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0 ? 'loaded' : 'not-loaded'
      })
      return result(state === 'loaded', `expected-loaded:${state}`)
    }
    if (assertion.kind === 'visibility') {
      if (!primary.locator) throw new Error('visibility assertion requires a DOM target')
      const visible = await primary.locator.isVisible()
      return result(visible, `expected-visible:${visible ? 'visible' : 'hidden'}`)
    }
    const viewport = await page.evaluate(() => ({width: window.innerWidth, height: window.innerHeight}))
    if (assertion.kind === 'viewport-containment') {
      const contained =
        primary.box.x >= 0 &&
        primary.box.y >= 0 &&
        primary.box.x + primary.box.width <= viewport.width &&
        primary.box.y + primary.box.height <= viewport.height
      return result(contained, `contained:${contained ? 'yes' : 'no'}`)
    }
    if (assertion.kind === 'viewport-overflow') {
      const metrics = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        scrollHeight: document.documentElement.scrollHeight,
        clientHeight: document.documentElement.clientHeight,
      }))
      const horizontal = metrics.scrollWidth > metrics.clientWidth
      const vertical = metrics.scrollHeight > metrics.clientHeight
      const overflow =
        assertion.axis === 'horizontal' ? horizontal : assertion.axis === 'vertical' ? vertical : horizontal || vertical
      return result(!overflow, `overflow:${overflow ? 'yes' : 'no'}`)
    }
    if (assertion.kind === 'geometry') {
      const actual =
        assertion.property === 'width'
          ? primary.box.width
          : assertion.property === 'height'
            ? primary.box.height
            : primary.box.width * primary.box.height
      const passes = assertion.operator === 'greater-than' ? actual > assertion.value : actual >= assertion.value
      return result(passes, `geometry:${assertion.property}:${actual}`)
    }
    if (assertion.kind === 'no-overlap') {
      const other = await resolve(assertion.otherTarget)
      const overlaps =
        primary.box.x < other.box.x + other.box.width &&
        primary.box.x + primary.box.width > other.box.x &&
        primary.box.y < other.box.y + other.box.height &&
        primary.box.y + primary.box.height > other.box.y
      return result(!overlaps, `overlap:${overlaps ? 'yes' : 'no'}`)
    }
    if (assertion.kind === 'minimum-size') {
      const passes = primary.box.width >= assertion.width && primary.box.height >= assertion.height
      return result(passes, `minimum-size:${primary.box.width}x${primary.box.height}`)
    }
    if (!primary.locator) throw new Error('text assertion requires a DOM target')
    const text = (await primary.locator.textContent()) ?? ''
    const passes = assertion.operator === 'equals' ? text === assertion.value : text.includes(assertion.value)
    return result(passes, `text:${passes ? 'match' : 'mismatch'}`)
  } catch (error) {
    return {
      status: 'infrastructure-error',
      signature: `assertion evaluation failed: ${String(error).slice(0, 500)}`,
      observedAt,
    }
  }
}

export interface FinalizationResult {
  finding?: Finding
  diagnostic?: string
}

export interface ActiveVariantFinalization {
  validation?: ValidationClean | ValidationInfrastructureError
  finding?: Finding
  diagnostic?: string
}

const oppositeVariant = (variant: AuditVariant): AuditVariant => ({
  ...variant,
  viewport: variant.viewport === 'desktop' ? 'mobile' : 'desktop',
})

const buildCounterpart = async (
  request: ActiveVariantReplayRequest,
  replay?: (variant: AuditVariant) => Promise<ReplayObservation>,
  capture?: (variant: AuditVariant) => Promise<CapturedEvidence>,
): Promise<{value?: ResponsiveCounterpart; diagnostic?: string}> => {
  if (request.responsive === 'not-applicable') return {}
  if (!replay || !capture) return {diagnostic: 'responsive counterpart finalizer is unavailable'}
  const variant = oppositeVariant(request.variant)
  let observation: ReplayObservation
  try {
    observation = await replay(variant)
  } catch {
    return {diagnostic: 'responsive counterpart replay failed'}
  }
  if (observation.status === 'infrastructure-error') return {diagnostic: 'responsive counterpart replay failed'}
  if (
    observation.status === 'failure' &&
    normalizeIdentityText(observation.signature) !== normalizeIdentityText(request.failureSignature)
  )
    return {diagnostic: 'responsive counterpart failure signature disagrees'}
  try {
    const evidence = await capture(variant)
    return {
      value: {
        variant,
        target: request.target,
        result:
          observation.status === 'clean'
            ? {status: 'clean', observedAt: observation.observedAt}
            : {
                status: 'failure',
                failureSignature: observation.signature.slice(0, 2_000),
                observedAt: observation.observedAt,
              },
        evidence: [evidence.context, evidence.crop],
      },
    }
  } catch {
    return {diagnostic: 'responsive counterpart evidence capture failed'}
  }
}

export const finalizeActiveVariant = async (
  request: ActiveVariantReplayRequest,
  replay: () => Promise<ReplayObservation>,
  capture: () => Promise<CapturedEvidence>,
  counterpartReplay?: (variant: AuditVariant) => Promise<ReplayObservation>,
  counterpartCapture?: (variant: AuditVariant) => Promise<CapturedEvidence>,
): Promise<ActiveVariantFinalization> => {
  const infrastructure = (diagnostic: string): ValidationInfrastructureError => ({
    issueNumber: request.issueNumber,
    fingerprint: request.fingerprint,
    variantKey: request.variantKey,
    route: request.route,
    semanticTarget: request.semanticTarget,
    findingClass: request.findingClass,
    assertion: request.assertion,
    actions: request.actions,
    failureSignature: request.failureSignature,
    variant: request.variant,
    target: request.target,
    observedAt: new Date().toISOString(),
    status: 'infrastructure-error',
    diagnostic: diagnostic.slice(0, 500),
  })
  let observation: ReplayObservation
  try {
    observation = await replay()
  } catch {
    return {validation: infrastructure('deterministic replay failed')}
  }
  if (observation.status === 'infrastructure-error')
    return {
      validation: infrastructure(observation.signature),
    }
  if (observation.status === 'clean') {
    try {
      const evidence = await capture()
      return {
        validation: {
          issueNumber: request.issueNumber,
          fingerprint: request.fingerprint,
          variantKey: request.variantKey,
          route: request.route,
          semanticTarget: request.semanticTarget,
          findingClass: request.findingClass,
          assertion: request.assertion,
          actions: request.actions,
          failureSignature: request.failureSignature,
          variant: request.variant,
          target: request.target,
          status: 'clean',
          evidence: [evidence.context, evidence.crop],
          observedAt: observation.observedAt,
        },
      }
    } catch {
      return {
        validation: infrastructure('validation evidence capture failed'),
      }
    }
  }
  let second: ReplayObservation
  try {
    second = await replay()
  } catch {
    return {diagnostic: 'second active replay failed'}
  }
  if (
    second.status !== 'failure' ||
    normalizeIdentityText(observation.signature) !== normalizeIdentityText(request.failureSignature) ||
    normalizeIdentityText(second.signature) !== normalizeIdentityText(observation.signature)
  )
    return {diagnostic: 'active variant replay signature disagrees'}
  try {
    const evidence = await capture()
    const counterpart = await buildCounterpart(request, counterpartReplay, counterpartCapture)
    if (counterpart.diagnostic) return counterpart
    const observations: Finding['observations'] = [
      {kind: 'candidate', status: 'failure', signature: observation.signature, observedAt: observation.observedAt},
      {kind: 'replay', ...second},
    ]
    const evidencePair: Finding['evidence'] = [evidence.context, evidence.crop]
    const fields = {
      route: request.route,
      findingClass: request.findingClass,
      assertion: request.assertion,
      actions: request.actions,
      semanticTarget: request.semanticTarget,
      target: request.target,
      failureSignature: request.failureSignature,
      description: `Confirmed recurrent ${request.findingClass} failure`,
      reproduction: request.reproduction,
      variant: request.variant,
      observations,
      evidence: evidencePair,
    }
    if (request.responsive === 'not-applicable') return {finding: {...fields, responsive: 'not-applicable'}}
    if (!counterpart.value) return {diagnostic: 'responsive counterpart finalization failed'}
    return {finding: {...fields, responsive: request.responsive, counterpart: counterpart.value}}
  } catch {
    return {diagnostic: 'active variant failure evidence capture failed'}
  }
}

/** Promote one candidate only after an exact-state replay and independently verified evidence capture. */
export const finalizeActiveVariantWithPlaywright = (
  request: ActiveVariantReplayRequest,
  page: Page,
  capture: () => Promise<CapturedEvidence>,
  counterpartReplay?: (variant: AuditVariant) => Promise<ReplayObservation>,
  counterpartCapture?: (variant: AuditVariant) => Promise<CapturedEvidence>,
): Promise<ActiveVariantFinalization> =>
  finalizeActiveVariant(
    request,
    () => evaluateAuditAssertion(page, request.target, request.assertion),
    capture,
    counterpartReplay,
    counterpartCapture,
  )

export const finalizeCandidate = async (
  candidate: Candidate,
  replay: () => Promise<ReplayObservation>,
  capture: () => Promise<CapturedEvidence>,
  counterpartReplay?: (variant: AuditVariant) => Promise<ReplayObservation>,
  counterpartCapture?: (variant: AuditVariant) => Promise<CapturedEvidence>,
): Promise<FinalizationResult> => {
  if (candidate.observation.status !== 'failure') return {diagnostic: 'candidate is not a failure observation'}
  let second: ReplayObservation
  try {
    second = await replay()
  } catch {
    return {diagnostic: 'deterministic replay failed'}
  }
  if (second.status !== 'failure') return {diagnostic: 'replay did not confirm a failure'}
  if (
    normalizeIdentityText(second.signature) !== normalizeIdentityText(candidate.observation.signature) ||
    normalizeIdentityText(candidate.failureSignature) !== normalizeIdentityText(second.signature)
  )
    return {diagnostic: 'candidate and replay signatures disagree'}
  let evidence: CapturedEvidence
  try {
    evidence = await capture()
  } catch {
    return {diagnostic: 'evidence capture failed'}
  }
  const counterpart =
    candidate.responsive === 'not-applicable'
      ? {}
      : await buildCounterpart(buildCandidateReplayRequest(candidate), counterpartReplay, counterpartCapture)
  if (counterpart.diagnostic || (candidate.responsive !== 'not-applicable' && !counterpart.value))
    return {diagnostic: counterpart.diagnostic ?? 'responsive counterpart finalization failed'}
  const observations: Finding['observations'] = [
    {kind: 'candidate', ...candidate.observation},
    {kind: 'replay', ...second},
  ]
  const evidencePair: Finding['evidence'] = [evidence.context, evidence.crop]
  const fields = {
    route: candidate.route,
    findingClass: candidate.findingClass,
    assertion: candidate.assertion,
    actions: candidate.actions,
    semanticTarget: candidate.semanticTarget,
    target: candidate.target,
    failureSignature: candidate.failureSignature,
    description: candidate.description,
    reproduction: candidate.reproduction,
    variant: candidate.variant,
    observations,
    evidence: evidencePair,
  }
  if (candidate.responsive === 'not-applicable') return {finding: {...fields, responsive: 'not-applicable'}}
  if (!counterpart.value) return {diagnostic: 'responsive counterpart finalization failed'}
  return {finding: {...fields, responsive: candidate.responsive, counterpart: counterpart.value}}
}

export const finalizeCandidateWithPlaywright = (
  candidate: Candidate,
  page: Page,
  capture: () => Promise<CapturedEvidence>,
  counterpartReplay?: (variant: AuditVariant) => Promise<ReplayObservation>,
  counterpartCapture?: (variant: AuditVariant) => Promise<CapturedEvidence>,
): Promise<FinalizationResult> =>
  finalizeCandidate(
    candidate,
    () => evaluateAuditAssertion(page, candidate.target, candidate.assertion),
    capture,
    counterpartReplay,
    counterpartCapture,
  )

export interface FinalizeBundleOptions {
  replay: (candidate: Candidate) => Promise<ReplayObservation>
  capture: (candidate: Candidate) => Promise<CapturedEvidence>
  activeRequests?: ActiveVariantReplayRequest[]
  activeReplay?: (request: ActiveVariantReplayRequest) => Promise<ReplayObservation>
  activeCapture?: (request: ActiveVariantReplayRequest) => Promise<CapturedEvidence>
  counterpartReplay?: (request: ActiveVariantReplayRequest, variant: AuditVariant) => Promise<ReplayObservation>
  counterpartCapture?: (request: ActiveVariantReplayRequest, variant: AuditVariant) => Promise<CapturedEvidence>
}

/** Finalize a closed bundle; rejected candidates remain diagnostics and never become manifest findings. */
export const finalizeCandidateBundle = async (
  input: unknown,
  options: FinalizeBundleOptions,
): Promise<{manifest: AuditManifest; diagnostics: string[]; hasOperations: boolean}> => {
  const bundle = parseCandidateBundle(input)
  const activeRequests = options.activeRequests ?? []
  if (bundle.runKind === 'manual' && activeRequests.some(request => request.issueNumber !== bundle.issueNumber))
    throw new Error('manual active replay request does not match bundle issue')
  const findings: Finding[] = []
  const diagnostics = [...bundle.diagnostics]
  const validations: (ValidationClean | ValidationInfrastructureError)[] = []
  const candidateIssueNumber = bundle.runKind === 'manual' ? bundle.issueNumber : 1
  type Terminal =
    {kind: 'finding'; value: Finding} | {kind: 'validation'; value: ValidationClean | ValidationInfrastructureError}
  const terminals = new Map<string, Terminal>()
  const blockedTerminals = new Set<string>()
  const registerTerminal = (key: string, terminal: Terminal): boolean => {
    if (blockedTerminals.has(key)) return false
    const existing = terminals.get(key)
    if (!existing) {
      terminals.set(key, terminal)
      return true
    }
    blockedTerminals.add(key)
    terminals.delete(key)
    if (existing.kind === 'finding') {
      const index = findings.indexOf(existing.value)
      if (index !== -1) findings.splice(index, 1)
    } else {
      const index = validations.indexOf(existing.value)
      if (index !== -1) validations.splice(index, 1)
    }
    diagnostics.push(`conflicting terminal outcomes for ${key}`)
    return false
  }
  for (const candidate of bundle.candidates) {
    const candidateCounterpartReplay = options.counterpartReplay
    const candidateCounterpartCapture = options.counterpartCapture
    const result = await finalizeCandidate(
      candidate,
      () => options.replay(candidate),
      () => options.capture(candidate),
      candidateCounterpartReplay
        ? variant =>
            candidateCounterpartReplay(buildCandidateReplayRequest(candidate, variant, candidateIssueNumber), variant)
        : undefined,
      candidateCounterpartCapture
        ? variant =>
            candidateCounterpartCapture(buildCandidateReplayRequest(candidate, variant, candidateIssueNumber), variant)
        : undefined,
    )
    if (result.finding) {
      const key = `${findingFingerprint(result.finding)}:${variantKey(result.finding.variant)}`
      if (registerTerminal(key, {kind: 'finding', value: result.finding})) findings.push(result.finding)
    }
    if (result.diagnostic) diagnostics.push(result.diagnostic)
  }
  for (const request of activeRequests) {
    if (!options.activeReplay || !options.activeCapture) {
      diagnostics.push('active replay finalizer is unavailable')
      continue
    }
    const activeReplay = options.activeReplay
    const activeCapture = options.activeCapture
    const activeCounterpartReplay = options.counterpartReplay
    const activeCounterpartCapture = options.counterpartCapture
    const result = await finalizeActiveVariant(
      request,
      () => activeReplay(request),
      () => activeCapture(request),
      activeCounterpartReplay ? variant => activeCounterpartReplay(request, variant) : undefined,
      activeCounterpartCapture ? variant => activeCounterpartCapture(request, variant) : undefined,
    )
    if (result.finding) {
      const key = `${findingFingerprint(result.finding)}:${variantKey(request.variant)}`
      if (registerTerminal(key, {kind: 'finding', value: result.finding})) findings.push(result.finding)
    }
    if (result.diagnostic) diagnostics.push(result.diagnostic)
    if (result.validation) {
      const key = `${result.validation.fingerprint}:${result.validation.variantKey}`
      if (result.validation.status === 'infrastructure-error') diagnostics.push(result.validation.diagnostic)
      const registered = registerTerminal(key, {kind: 'validation', value: result.validation})
      if (registered && result.validation.status === 'clean') validations.push(result.validation)
    }
  }
  const manifestCommon = {
    version: 1 as const,
    runId: bundle.runId,
    generatedAt: bundle.generatedAt,
    findings,
    validations,
  }
  const manifestInput =
    bundle.runKind === 'scheduled'
      ? {...manifestCommon, runKind: 'scheduled' as const, rotatingPresetId: bundle.rotatingPresetId as AuditPresetId}
      : {...manifestCommon, runKind: 'manual' as const, issueNumber: bundle.issueNumber as number}
  if (diagnostics.length > MAX_DIAGNOSTICS) throw new Error('live-audit diagnostics exceed bounded limit')
  return {
    manifest: parseAuditManifest(manifestInput),
    diagnostics,
    hasOperations: findings.length > 0 || validations.length > 0,
  }
}

/** Capture context plus a real target crop; never substitutes a full-page image for a crop. */
export const captureTargetEvidence = async (
  page: Page,
  target: TargetDescriptor,
  outputDirectory: string,
  metadata = 'live audit target',
  identity?: EvidenceIdentity,
): Promise<CapturedEvidence> => {
  const locator = locatorFor(page, target)
  const count = locator ? await locator.count() : 1
  if (count !== 1) throw new Error(`target is ${count === 0 ? 'missing' : 'ambiguous'}`)
  const viewport = await page.evaluate(() => ({width: window.innerWidth, height: window.innerHeight}))
  if (locator && !(await locator.isVisible())) throw new Error('target is not visible')
  if (locator) await locator.scrollIntoViewIfNeeded()
  let box = locator ? await locator.boundingBox() : target.kind === 'region' ? target : null
  if (!box || box.width <= 0 || box.height <= 0) throw new Error('target has zero-size bounds')
  if (locator && box.y + box.height > viewport.height) {
    await page.evaluate(amount => window.scrollBy(0, amount), box.y + box.height - viewport.height + 1)
    box = await locator.boundingBox()
  }
  if (!box) throw new Error('target became detached')
  if (box.x < 0 || box.y < 0 || box.x + box.width > viewport.width || box.y + box.height > viewport.height)
    throw new Error(
      `target is outside the viewport (${box.x},${box.y},${box.width},${box.height}; ${viewport.width}x${viewport.height})`,
    )
  await mkdir(outputDirectory, {recursive: true})
  const prefix = identity
    ? `${identity.fingerprint}-${identity.variantKey}`
    : `evidence-${createHash('sha256')
        .update(`${metadata}|${JSON.stringify(target)}`)
        .digest('hex')
        .slice(0, 16)}`
  if (prefix.includes('/') || prefix.includes('\\')) throw new Error('evidence filename is not relative')
  const contextName = `${prefix}-context.png`
  const cropName = `${prefix}-crop.png`
  const contextPath = path.join(outputDirectory, contextName)
  const cropPath = path.join(outputDirectory, cropName)
  const scroll =
    target.kind === 'region'
      ? await page.evaluate(() => ({
          x: window.scrollX,
          y: window.scrollY,
          width: document.documentElement.scrollWidth,
          height: document.documentElement.scrollHeight,
        }))
      : {x: 0, y: 0, width: Number.POSITIVE_INFINITY, height: Number.POSITIVE_INFINITY}
  const clip = {x: box.x + scroll.x, y: box.y + scroll.y, width: box.width, height: box.height}
  if (clip.x + clip.width > scroll.width || clip.y + clip.height > scroll.height)
    throw new Error('region exceeds page bounds')
  await page.screenshot({path: contextPath})
  if (target.kind === 'region') await page.screenshot({path: cropPath, clip})
  else if (locator) await locator.screenshot({path: cropPath})
  else throw new Error('target is detached')
  const [context, crop] = await Promise.all([readFile(contextPath), readFile(cropPath)])
  if ((await stat(contextPath)).size > MAX_EVIDENCE_BYTES || (await stat(cropPath)).size > MAX_EVIDENCE_BYTES)
    throw new Error('evidence PNG exceeds size limit')
  const contextIntegrity = computeEvidenceIntegrity(contextName, context)
  const cropIntegrity = computeEvidenceIntegrity(cropName, crop)
  const label = identity
    ? `${identity.route} ${identity.viewport} ${identity.theme.kind === 'mode' ? identity.theme.mode : identity.theme.presetId} ${identity.semanticTarget}`
    : metadata
  return {
    context: {
      role: 'context',
      path: contextName,
      alt: `${label} context ${identity?.observedResult ?? 'failure'}`,
      caption: `${label} context role observed ${identity?.observedResult ?? 'failure'}`,
      integrity: contextIntegrity,
    },
    crop: {
      role: 'crop',
      path: cropName,
      alt: `${label} crop ${identity?.observedResult ?? 'failure'}`,
      caption: `${label} crop role observed ${identity?.observedResult ?? 'failure'}`,
      integrity: cropIntegrity,
    },
  }
}
