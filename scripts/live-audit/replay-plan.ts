import type {IssueLedger} from './issue-ledger'

import {Buffer} from 'node:buffer'
import {
  isAuditAssertionForFindingClass,
  isAuditPresetId,
  isAuditRoute,
  parseAuditActions,
  parseAuditAssertion,
  parseTargetDescriptor,
  parseThemeSelection,
  type AuditManifest,
  type AuditPresetId,
  type AuditRoute,
  type AuditVariant,
  type FindingClass,
} from './contract'
import {
  AUDIT_ORIGIN,
  buildActiveReplayRequests,
  buildCoreMatrix,
  chooseRotatingPreset,
  type ActiveVariantReplayRequest,
  type CoreMatrixState,
} from './evidence'
import {findingFingerprint, variantKey} from './identity'

export const REPLAY_PLAN_VERSION = 1
export const REPLAY_PLAN_CRON = '30 3 * * *'
export const REPLAY_PLAN_CRONS = ['30 3 * * *', '30 15 * * *'] as const
export type ReplayPlanCron = (typeof REPLAY_PLAN_CRONS)[number]
export const MAX_REPLAY_PLAN_BYTES = 256_000
export const MAX_REPLAY_PLAN_REPRODUCTION = 20

export type {ActiveVariantReplayRequest}
export {buildActiveReplayRequests}

export interface ReplayPlanBuildInput {
  runId: string
  generatedAt: string
  exploration: {steps: number; durationMs: number}
  cron?: ReplayPlanCron
  activeLedgers: readonly {issueNumber: number; ledger: IssueLedger}[]
}

export interface ReplayPlanCommon {
  version: typeof REPLAY_PLAN_VERSION
  runId: string
  origin: typeof AUDIT_ORIGIN
  generatedAt: string
  exploration: {steps: number; durationMs: number}
  coreMatrix: CoreMatrixState[]
  activeRequests: ActiveVariantReplayRequest[]
}

export interface ScheduledReplayPlan extends ReplayPlanCommon {
  runKind: 'scheduled'
  cron: ReplayPlanCron
  rotatingPresetId: NonNullable<AuditManifest['rotatingPresetId']>
  issueNumbers: number[]
}

export interface ManualReplayPlan extends ReplayPlanCommon {
  runKind: 'manual'
  issueNumber: number
}

export type ReplayPlan = ScheduledReplayPlan | ManualReplayPlan

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}
const safeText = (value: unknown, max = 2_000): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= max &&
  [...value].every(character => {
    const code = character.codePointAt(0) ?? 0
    return code > 0x1f && code !== 0x7f
  })
const dateTime = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value))
const parseDateTime = (value: unknown): string => {
  if (!dateTime(value)) throw new Error('invalid replay plan timestamp')
  return value
}
const parseCron = (value: unknown): ReplayPlanCron => {
  if (value !== REPLAY_PLAN_CRONS[0] && value !== REPLAY_PLAN_CRONS[1]) throw new Error('invalid replay plan schedule')
  return value
}
const positiveIssue = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0
const parsePositiveIssue = (value: unknown): number => {
  if (!positiveIssue(value)) throw new Error('invalid replay plan issue number')
  return value
}
const parseRoute = (value: unknown): AuditRoute => {
  if (typeof value !== 'string' || !isAuditRoute(value)) throw new Error('invalid replay plan route')
  return value
}
const parseFindingClass = (value: unknown): FindingClass => {
  if (
    value === 'broken-image' ||
    value === 'layout' ||
    value === 'overflow' ||
    value === 'visibility' ||
    value === 'hit-target' ||
    value === 'content'
  )
    return value
  throw new Error('invalid replay plan finding class')
}
const parseResponsive = (value: unknown): 'not-applicable' | 'required' | 'uncertain' => {
  if (value !== 'not-applicable' && value !== 'required' && value !== 'uncertain')
    throw new Error('invalid replay plan responsive classification')
  return value
}
const parseBoundedText = (value: unknown, max: number, label: string): string => {
  if (!safeText(value, max)) throw new Error(`invalid replay plan ${label}`)
  return value
}
const parseViewport = (value: unknown): 'desktop' | 'mobile' => {
  if (value !== 'desktop' && value !== 'mobile') throw new Error('invalid replay plan viewport')
  return value
}
const parsePresetId = (value: unknown): AuditPresetId => {
  if (typeof value !== 'string' || !isAuditPresetId(value)) throw new Error('invalid replay plan preset')
  return value
}
const parseExploration = (value: unknown): {steps: number; durationMs: number} => {
  if (!isRecord(value) || !exactKeys(value, ['steps', 'durationMs'])) throw new Error('invalid replay plan exploration')
  if (typeof value.steps !== 'number' || !Number.isInteger(value.steps) || value.steps < 0 || value.steps > 20)
    throw new Error('invalid replay plan exploration steps')
  if (
    typeof value.durationMs !== 'number' ||
    !Number.isInteger(value.durationMs) ||
    value.durationMs < 0 ||
    value.durationMs > 120_000
  )
    throw new Error('invalid replay plan exploration duration')
  return {steps: value.steps, durationMs: value.durationMs}
}
const sortedNumbers = (values: readonly number[]): number[] => [...values].sort((left, right) => left - right)
const parseIssueNumbers = (value: unknown): number[] => {
  if (!Array.isArray(value)) throw new Error('invalid replay plan issue list')
  return value.map(parsePositiveIssue)
}
const sortedRequests = (requests: readonly ActiveVariantReplayRequest[]): ActiveVariantReplayRequest[] =>
  [...requests].sort(
    (left, right) =>
      left.issueNumber - right.issueNumber ||
      left.fingerprint.localeCompare(right.fingerprint) ||
      left.variantKey.localeCompare(right.variantKey),
  )

const parseVariant = (value: unknown): AuditVariant => {
  if (!isRecord(value) || !exactKeys(value, ['viewport', 'theme', 'state']))
    throw new Error('invalid replay plan variant')
  return {
    viewport: parseViewport(value.viewport),
    theme: parseThemeSelection(value.theme),
    state: parseBoundedText(value.state, 100, 'variant state'),
  }
}

const parseRequest = (value: unknown): ActiveVariantReplayRequest => {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      'issueNumber',
      'fingerprint',
      'variantKey',
      'route',
      'semanticTarget',
      'findingClass',
      'assertion',
      'actions',
      'failureSignature',
      'responsive',
      'variant',
      'target',
      'reproduction',
    ])
  )
    throw new Error('invalid replay plan active request')

  const issueNumber = parsePositiveIssue(value.issueNumber)
  const fingerprint = parseBoundedText(value.fingerprint, 200, 'fingerprint')
  const requestVariantKey = parseBoundedText(value.variantKey, 200, 'variant key')
  const route = parseRoute(value.route)
  const semanticTarget = parseBoundedText(value.semanticTarget, 2_000, 'semantic target')
  const findingClass = parseFindingClass(value.findingClass)
  const failureSignature = parseBoundedText(value.failureSignature, 2_000, 'failure signature')
  const responsive = parseResponsive(value.responsive)
  if (!Array.isArray(value.reproduction) || value.reproduction.length > MAX_REPLAY_PLAN_REPRODUCTION)
    throw new Error('invalid replay plan reproduction')
  const reproduction = value.reproduction.map(item => parseBoundedText(item, 500, 'reproduction step'))
  const target = parseTargetDescriptor(value.target)
  const assertion = parseAuditAssertion(value.assertion)
  const actions = parseAuditActions(value.actions)
  const variant = parseVariant(value.variant)
  if (!isAuditAssertionForFindingClass(findingClass, assertion))
    throw new Error('replay plan assertion does not match finding class')
  if (findingFingerprint({route, semanticTarget, failureSignature}) !== fingerprint)
    throw new Error('replay plan fingerprint does not match request identity')
  if (variantKey(variant) !== requestVariantKey)
    throw new Error('replay plan variant key does not match request identity')
  return {
    issueNumber,
    fingerprint,
    variantKey: requestVariantKey,
    route,
    semanticTarget,
    findingClass,
    assertion,
    actions,
    failureSignature,
    responsive,
    variant,
    target,
    reproduction,
  }
}

const parseCoreState = (value: unknown): CoreMatrixState => {
  if (!isRecord(value) || !exactKeys(value, ['route', 'viewport', 'theme', 'state']) || value.state !== 'core')
    throw new Error('invalid replay plan core matrix state')
  return {
    route: parseRoute(value.route),
    viewport: parseViewport(value.viewport),
    theme: parseThemeSelection(value.theme),
    state: 'core',
  }
}

const parseCommon = (value: Record<string, unknown>): ReplayPlanCommon => {
  if (
    value.version !== REPLAY_PLAN_VERSION ||
    value.origin !== AUDIT_ORIGIN ||
    !Array.isArray(value.coreMatrix) ||
    !Array.isArray(value.activeRequests)
  )
    throw new Error('invalid replay plan common metadata')
  const runId = parseBoundedText(value.runId, 200, 'run ID')
  const generatedAt = parseDateTime(value.generatedAt)
  const exploration = parseExploration(value.exploration)
  const coreMatrix = value.coreMatrix.map(parseCoreState)
  const activeRequests = sortedRequests(value.activeRequests.map(parseRequest))
  const seenExact = new Set<string>()
  const seenFingerprintVariant = new Set<string>()
  for (const request of activeRequests) {
    const exact = `${request.issueNumber}:${request.fingerprint}:${request.variantKey}`
    const fingerprintVariant = `${request.fingerprint}:${request.variantKey}`
    if (seenExact.has(exact) || seenFingerprintVariant.has(fingerprintVariant))
      throw new Error('duplicate replay plan active request')
    seenExact.add(exact)
    seenFingerprintVariant.add(fingerprintVariant)
  }
  return {
    version: REPLAY_PLAN_VERSION,
    runId,
    origin: AUDIT_ORIGIN,
    generatedAt,
    exploration,
    coreMatrix,
    activeRequests,
  }
}

export const parseReplayPlan = (input: unknown): ReplayPlan => {
  if (!isRecord(input) || typeof input.runKind !== 'string') throw new Error('invalid replay plan')
  if (input.runKind === 'scheduled') {
    if (
      !exactKeys(input, [
        'version',
        'runKind',
        'runId',
        'origin',
        'generatedAt',
        'exploration',
        'coreMatrix',
        'activeRequests',
        'cron',
        'rotatingPresetId',
        'issueNumbers',
      ])
    )
      throw new Error('invalid scheduled replay plan keys')
    const common = parseCommon(input)
    const cron = parseCron(input.cron)
    if (!Array.isArray(input.issueNumbers)) throw new Error('invalid scheduled replay plan schedule')
    const rotatingPresetId = parsePresetId(input.rotatingPresetId)
    const expectedPreset = chooseRotatingPreset(new Date(common.generatedAt))
    if (rotatingPresetId !== expectedPreset) throw new Error('scheduled replay plan preset mismatch')
    if (JSON.stringify(common.coreMatrix) !== JSON.stringify(buildCoreMatrix(rotatingPresetId)))
      throw new Error('scheduled replay plan matrix mismatch')
    const issueNumbers = sortedNumbers(parseIssueNumbers(input.issueNumbers))
    const expectedIssues = sortedNumbers([...new Set(common.activeRequests.map(request => request.issueNumber))])
    if (JSON.stringify(issueNumbers) !== JSON.stringify(expectedIssues))
      throw new Error('scheduled replay plan issue list mismatch')
    return {
      ...common,
      runKind: 'scheduled',
      cron,
      rotatingPresetId,
      issueNumbers,
    }
  }
  if (
    input.runKind !== 'manual' ||
    !exactKeys(input, [
      'version',
      'runKind',
      'runId',
      'origin',
      'generatedAt',
      'exploration',
      'coreMatrix',
      'activeRequests',
      'issueNumber',
    ])
  )
    throw new Error('invalid replay plan keys')
  const common = parseCommon(input)
  const issueNumber = parsePositiveIssue(input.issueNumber)
  if (common.coreMatrix.length !== 0 || common.activeRequests.length === 0)
    throw new Error('invalid manual replay plan')
  if (common.activeRequests.some(request => request.issueNumber !== issueNumber))
    throw new Error('manual replay plan crosses issues')
  return {...common, runKind: 'manual', issueNumber}
}

export const serializeReplayPlan = (plan: ReplayPlan): string => {
  const parsed = parseReplayPlan(plan)
  const canonical =
    parsed.runKind === 'scheduled'
      ? {
          ...parsed,
          activeRequests: sortedRequests(parsed.activeRequests),
          issueNumbers: sortedNumbers(parsed.issueNumbers),
        }
      : {...parsed, activeRequests: sortedRequests(parsed.activeRequests)}
  const serialized = JSON.stringify(canonical)
  if (Buffer.byteLength(serialized, 'utf8') > MAX_REPLAY_PLAN_BYTES) throw new Error('replay plan exceeds byte limit')
  return serialized
}

export const replayPlanByteLength = (plan: ReplayPlan | string): number =>
  Buffer.byteLength(typeof plan === 'string' ? plan : serializeReplayPlan(plan), 'utf8')

export const parseReplayPlanJson = (input: string | Uint8Array): ReplayPlan => {
  const serialized = typeof input === 'string' ? input : Buffer.from(input).toString('utf8')
  if (Buffer.byteLength(serialized, 'utf8') > MAX_REPLAY_PLAN_BYTES) throw new Error('replay plan exceeds byte limit')
  try {
    return parseReplayPlan(JSON.parse(serialized))
  } catch (error) {
    if (error instanceof Error && error.message.includes('replay plan')) throw error
    throw new Error('invalid replay plan JSON')
  }
}

const commonPlan = (
  input: ReplayPlanBuildInput,
  activeRequests: ActiveVariantReplayRequest[],
  coreMatrix: CoreMatrixState[],
): ReplayPlanCommon => ({
  version: REPLAY_PLAN_VERSION,
  runId: input.runId,
  origin: AUDIT_ORIGIN,
  generatedAt: input.generatedAt,
  exploration: input.exploration,
  coreMatrix,
  activeRequests: sortedRequests(activeRequests),
})

export const buildScheduledReplayPlan = (input: ReplayPlanBuildInput): ScheduledReplayPlan => {
  const cron = input.cron ?? REPLAY_PLAN_CRON
  const presetId = chooseRotatingPreset(new Date(input.generatedAt))
  const activeRequests = input.activeLedgers.flatMap(({issueNumber, ledger}) =>
    buildActiveReplayRequests(issueNumber, ledger),
  )
  const issueNumbers = sortedNumbers([...new Set(activeRequests.map(request => request.issueNumber))])
  return parseReplayPlan({
    ...commonPlan(input, activeRequests, buildCoreMatrix(presetId)),
    runKind: 'scheduled',
    cron,
    rotatingPresetId: presetId,
    issueNumbers,
  }) as ScheduledReplayPlan
}

export const buildManualReplayPlan = (input: ReplayPlanBuildInput & {issueNumber: number}): ManualReplayPlan => {
  if (!positiveIssue(input.issueNumber)) throw new Error('invalid manual replay issue number')
  const activeRequests = input.activeLedgers.flatMap(({issueNumber, ledger}) =>
    buildActiveReplayRequests(issueNumber, ledger),
  )
  if (activeRequests.length === 0 || activeRequests.some(request => request.issueNumber !== input.issueNumber))
    throw new Error('manual replay plan requires active variants for one issue')
  return parseReplayPlan({
    ...commonPlan(input, activeRequests, []),
    runKind: 'manual',
    issueNumber: input.issueNumber,
  }) as ManualReplayPlan
}
