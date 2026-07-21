import type {Page} from '@playwright/test'
import {Buffer} from 'node:buffer'
import {createHash} from 'node:crypto'
import {mkdir, readFile, stat} from 'node:fs/promises'
import path from 'node:path'

import {
  AUDIT_PRESET_IDS,
  AUDIT_ROUTES,
  AUDIT_THEMES,
  AUDIT_VIEWPORTS,
  isAuditPresetId,
  isAuditRoute,
  parseAuditManifest,
  parseTargetDescriptor,
  parseThemeSelection,
  type AuditManifest,
  type AuditPresetId,
  type AuditRoute,
  type AuditThemeSelection,
  type AuditVariant,
  type AuditViewport,
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
  failureSignature: string
  description: string
  reproduction: string[]
  variant: AuditVariant
  observation: {status: 'failure'; signature: string; observedAt: string}
}

const candidateVariantKey = (candidate: Candidate): string => variantKey(candidate.variant)
const candidateFingerprint = (candidate: Candidate): string => findingFingerprint(candidate)

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
        'description,failureSignature,findingClass,observation,reproduction,responsive,route,semanticTarget,target,variant'
    )
      throw new Error('candidate contains unsupported fields')
    if (
      typeof value.route !== 'string' ||
      !isAuditRoute(value.route) ||
      !safeText(value.semanticTarget, 200) ||
      !safeText(value.failureSignature) ||
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
    parseThemeSelection(value.variant.theme)
    return value as unknown as Candidate
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

export const validatePng = (bytes: Uint8Array, maxBytes = MAX_EVIDENCE_BYTES): {width: number; height: number} => {
  const buffer = Buffer.from(bytes)
  if (buffer.length > maxBytes) throw new Error('evidence PNG exceeds size limit')
  if (
    buffer.length < 24 ||
    !PNG_SIGNATURE.every((byte, index) => buffer[index] === byte) ||
    buffer.toString('ascii', 12, 16) !== 'IHDR'
  )
    throw new Error('evidence is not a PNG')
  const width = buffer.readUInt32BE(16)
  const height = buffer.readUInt32BE(20)
  if (width === 0 || height === 0) throw new Error('evidence PNG has zero dimensions')
  return {width, height}
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

export interface CapturedEvidence {
  context: {role: 'context'; path: string; alt: string; caption: string}
  crop: {role: 'crop'; path: string; alt: string; caption: string}
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
      : await buildCounterpart(
          {
            issueNumber: 1,
            fingerprint: candidateFingerprint(candidate),
            variantKey: candidateVariantKey(candidate),
            route: candidate.route,
            semanticTarget: candidate.semanticTarget,
            findingClass: candidate.findingClass,
            failureSignature: candidate.failureSignature,
            responsive: candidate.responsive,
            variant: candidate.variant,
            target: candidate.target,
            reproduction: candidate.reproduction,
          },
          counterpartReplay,
          counterpartCapture,
        )
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
  for (const candidate of bundle.candidates) {
    const candidateCounterpartReplay = options.counterpartReplay
    const candidateCounterpartCapture = options.counterpartCapture
    const result = await finalizeCandidate(
      candidate,
      () => options.replay(candidate),
      () => options.capture(candidate),
      candidateCounterpartReplay
        ? variant =>
            candidateCounterpartReplay(
              {
                issueNumber: 1,
                fingerprint: candidateFingerprint(candidate),
                variantKey: candidateVariantKey(candidate),
                route: candidate.route,
                semanticTarget: candidate.semanticTarget,
                findingClass: candidate.findingClass,
                failureSignature: candidate.failureSignature,
                responsive: candidate.responsive,
                variant,
                target: candidate.target,
                reproduction: candidate.reproduction,
              },
              variant,
            )
        : undefined,
      candidateCounterpartCapture
        ? variant =>
            candidateCounterpartCapture(
              {
                issueNumber: 1,
                fingerprint: candidateFingerprint(candidate),
                variantKey: candidateVariantKey(candidate),
                route: candidate.route,
                semanticTarget: candidate.semanticTarget,
                findingClass: candidate.findingClass,
                failureSignature: candidate.failureSignature,
                responsive: candidate.responsive,
                variant,
                target: candidate.target,
                reproduction: candidate.reproduction,
              },
              variant,
            )
        : undefined,
    )
    if (result.finding) findings.push(result.finding)
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
    if (result.finding) findings.push(result.finding)
    if (result.diagnostic) diagnostics.push(result.diagnostic)
    if (result.validation) validations.push(result.validation)
  }
  const manifestInput =
    bundle.runKind === 'scheduled'
      ? {
          version: 1 as const,
          runId: bundle.runId,
          generatedAt: bundle.generatedAt,
          runKind: 'scheduled' as const,
          rotatingPresetId: bundle.rotatingPresetId as AuditPresetId,
          findings,
          validations,
        }
      : {
          version: 1 as const,
          runId: bundle.runId,
          generatedAt: bundle.generatedAt,
          runKind: 'manual' as const,
          issueNumber: bundle.issueNumber as number,
          findings,
          validations,
        }
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
  validatePng(context)
  validatePng(crop)
  const label = identity
    ? `${identity.route} ${identity.viewport} ${identity.theme.kind === 'mode' ? identity.theme.mode : identity.theme.presetId} ${identity.semanticTarget}`
    : metadata
  return {
    context: {
      role: 'context',
      path: contextName,
      alt: `${label} context ${identity?.observedResult ?? 'failure'}`,
      caption: `${label} context role observed ${identity?.observedResult ?? 'failure'}`,
    },
    crop: {
      role: 'crop',
      path: cropName,
      alt: `${label} crop ${identity?.observedResult ?? 'failure'}`,
      caption: `${label} crop role observed ${identity?.observedResult ?? 'failure'}`,
    },
  }
}
