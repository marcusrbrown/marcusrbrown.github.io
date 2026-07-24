import {Buffer} from 'node:buffer'

import {
  isAuditAssertionForFindingClass,
  isAuditRoute,
  parseAuditAssertion,
  parseTargetDescriptor,
  parseThemeSelection,
  type AuditAssertion,
  type AuditRoute,
  type AuditThemeSelection,
  type AuditViewport,
  type Finding,
  type FindingClass,
  type TargetDescriptor,
} from './contract'
import {findingFingerprint} from './identity'

export const ISSUE_LEDGER_START = '<!-- live-audit-ledger:v1 -->'
export const ISSUE_LEDGER_END = '<!-- /live-audit-ledger -->'
export const MAX_LEDGER_BYTES = 32_000
export const MAX_LEDGER_TEXT = 2_000

export type LedgerCheckpoint =
  'validate' | 'asset' | 'issue' | 'evidence' | 'initial-create' | 'transition' | 'transition-pending'
export type LedgerTransitionSource = 'reporter' | 'human'
export type LedgerTransition =
  | {kind: 'open'; source: LedgerTransitionSource}
  | {kind: 'closed' | 'reopened'; source: 'human'}
  | {kind: 'closed'; source: 'reporter'; operationKey: string; completedAt: string}
  | {kind: 'reopened'; source: 'reporter'; operationKey: string; completedAt: string}
  | {
      kind: 'reopened'
      source: 'reporter'
      operationKey: string
      completedAt: string
      previousCloseOperationKey: string
      previousCloseCompletedAt: string
    }
  | {
      kind: 'closed-pending-reopen'
      source: 'reporter'
      operationKey: string
      completedAt: string
      reopenOperationKey: string
    }

export interface LedgerVariant {
  key: string
  viewport: AuditViewport
  theme: AuditThemeSelection
  state: string
  cleanCount: number
}
export interface LedgerReplay {
  variantKey: string
  target: TargetDescriptor
  assertion: AuditAssertion
  reproduction: string[]
}
export type LedgerOperation =
  | {key: string; checkpoint: Exclude<LedgerCheckpoint, 'transition-pending'>; completedAt: string}
  | {key: string; checkpoint: 'transition-pending'}
export interface IssueLedger {
  version: 1
  fingerprint: string
  route: AuditRoute
  semanticTarget: string
  findingClass: FindingClass
  assertion: AuditAssertion
  responsive: Finding['responsive']
  failureSignature: string
  variants: LedgerVariant[]
  replay: LedgerReplay[]
  operations: LedgerOperation[]
  transition: LedgerTransition
}
export interface ParsedIssueLedger {
  ledger: IssueLedger
  humanBody: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => {
  const actual = Object.keys(value).sort()
  return actual.length === keys.length && actual.every((key, index) => key === [...keys].sort()[index])
}
const isSafeText = (value: unknown, maxLength = MAX_LEDGER_TEXT): value is string => {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength) return false
  return [...value].every(character => {
    const code = character.codePointAt(0) ?? 0
    return code > 0x1f && code !== 0x7f
  })
}
const isDateTime = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
  Number.isFinite(Date.parse(value))

export const assertIssueLedger: (value: unknown) => asserts value is IssueLedger = (
  value: unknown,
): asserts value is IssueLedger => {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'version',
      'fingerprint',
      'route',
      'semanticTarget',
      'findingClass',
      'assertion',
      'responsive',
      'failureSignature',
      'variants',
      'replay',
      'operations',
      'transition',
    ]) ||
    value.version !== 1 ||
    !isSafeText(value.fingerprint, 200) ||
    typeof value.route !== 'string' ||
    !isAuditRoute(value.route) ||
    !isSafeText(value.semanticTarget, 200) ||
    !['broken-image', 'layout', 'overflow', 'visibility', 'hit-target', 'content'].includes(
      String(value.findingClass),
    ) ||
    !['not-applicable', 'required', 'uncertain'].includes(String(value.responsive)) ||
    !isSafeText(value.failureSignature)
  )
    throw new Error('invalid issue ledger envelope')
  if (
    findingFingerprint({
      route: value.route,
      semanticTarget: value.semanticTarget,
      failureSignature: value.failureSignature,
    }) !== value.fingerprint
  )
    throw new Error('issue ledger fingerprint does not match identity')
  if (
    !Array.isArray(value.variants) ||
    !Array.isArray(value.replay) ||
    !Array.isArray(value.operations) ||
    !isRecord(value.transition)
  )
    throw new Error('invalid issue ledger collections')
  const assertion = parseAuditAssertion(value.assertion)
  if (!isAuditAssertionForFindingClass(value.findingClass as FindingClass, assertion))
    throw new Error('issue ledger finding class does not match assertion')
  if (
    !isRecord(value.transition) ||
    !['open', 'closed', 'closed-pending-reopen', 'reopened'].includes(String(value.transition.kind)) ||
    !['reporter', 'human'].includes(String(value.transition.source))
  )
    throw new Error('invalid issue ledger transition')
  const transition = value.transition
  if (transition.kind === 'closed-pending-reopen' && transition.source !== 'reporter')
    throw new Error('pending reopen transition must be reporter-owned')
  const hasReporterProvenance =
    (transition.kind === 'closed' || transition.kind === 'reopened') && transition.source === 'reporter'
  const hasPendingReopen = transition.kind === 'closed-pending-reopen' && transition.source === 'reporter'
  if (hasReporterProvenance) {
    const hasPreviousClose =
      transition.kind === 'reopened' &&
      'previousCloseOperationKey' in transition &&
      'previousCloseCompletedAt' in transition
    if (hasPreviousClose) {
      if (
        !hasExactKeys(transition, [
          'kind',
          'source',
          'operationKey',
          'completedAt',
          'previousCloseOperationKey',
          'previousCloseCompletedAt',
        ]) ||
        !isSafeText(transition.operationKey) ||
        !isSafeText(transition.previousCloseOperationKey) ||
        transition.operationKey === transition.previousCloseOperationKey ||
        !isDateTime(transition.completedAt) ||
        !isDateTime(transition.previousCloseCompletedAt)
      )
        throw new Error('invalid issue ledger transition provenance')
    } else if (
      !hasExactKeys(transition, ['kind', 'source', 'operationKey', 'completedAt']) ||
      !isSafeText(transition.operationKey) ||
      !isDateTime(transition.completedAt)
    )
      throw new Error('invalid issue ledger transition provenance')
  } else if (hasPendingReopen) {
    if (
      !hasExactKeys(transition, ['kind', 'source', 'operationKey', 'completedAt', 'reopenOperationKey']) ||
      !isSafeText(transition.operationKey) ||
      !isSafeText(transition.reopenOperationKey) ||
      transition.operationKey === transition.reopenOperationKey ||
      !isDateTime(transition.completedAt)
    )
      throw new Error('invalid pending reporter transition provenance')
  } else if (!hasExactKeys(transition, ['kind', 'source'])) {
    throw new Error('invalid issue ledger transition')
  }
  const variantKeys = new Set<string>()
  for (const variant of value.variants) {
    if (
      !isRecord(variant) ||
      !hasExactKeys(variant, ['key', 'viewport', 'theme', 'state', 'cleanCount']) ||
      !isSafeText(variant.key, 200) ||
      variantKeys.has(variant.key) ||
      !['desktop', 'mobile'].includes(String(variant.viewport)) ||
      !isSafeText(variant.state, 200) ||
      !Number.isInteger(variant.cleanCount) ||
      Number(variant.cleanCount) < 0 ||
      Number(variant.cleanCount) > 2
    )
      throw new Error('invalid issue ledger variant')
    parseThemeSelection(variant.theme)
    variantKeys.add(variant.key)
  }
  const replayKeys = new Set<string>()
  for (const replay of value.replay) {
    if (
      !isRecord(replay) ||
      !hasExactKeys(replay, ['variantKey', 'target', 'assertion', 'reproduction']) ||
      !isSafeText(replay.variantKey, 200) ||
      !variantKeys.has(replay.variantKey) ||
      !Array.isArray(replay.reproduction) ||
      replay.reproduction.length === 0 ||
      replay.reproduction.length > 20 ||
      replay.reproduction.some(step => !isSafeText(step, 500))
    )
      throw new Error('invalid issue ledger replay')
    parseTargetDescriptor(replay.target)
    parseAuditAssertion(replay.assertion)
    const replayKey = replay.variantKey
    if (replayKeys.has(replayKey)) throw new Error('duplicate issue ledger replay')
    replayKeys.add(replayKey)
  }
  for (const variantKey of variantKeys) {
    if (!replayKeys.has(variantKey)) throw new Error('issue ledger variant is missing its replay')
  }
  const operationKeys = new Set<string>()
  const transitionOperations: LedgerOperation[] = []
  const pendingTransitionOperations: LedgerOperation[] = []
  for (const operation of value.operations) {
    if (
      !isRecord(operation) ||
      !isSafeText(operation.key, 200) ||
      operationKeys.has(operation.key) ||
      !['validate', 'asset', 'issue', 'evidence', 'initial-create', 'transition', 'transition-pending'].includes(
        String(operation.checkpoint),
      )
    )
      throw new Error('invalid issue ledger operation')
    if (operation.checkpoint === 'transition-pending') {
      if (!hasExactKeys(operation, ['key', 'checkpoint'])) throw new Error('invalid pending transition operation')
      pendingTransitionOperations.push(operation as unknown as LedgerOperation)
    } else {
      if (!hasExactKeys(operation, ['key', 'checkpoint', 'completedAt']) || !isDateTime(operation.completedAt))
        throw new Error('invalid issue ledger operation')
      if (operation.checkpoint === 'transition') transitionOperations.push(operation as unknown as LedgerOperation)
    }
    operationKeys.add(operation.key)
  }
  if (hasReporterProvenance) {
    const operation = transitionOperations[0]
    if (
      transitionOperations.length !== 1 ||
      !operation ||
      operation.checkpoint !== 'transition' ||
      operation.key !== transition.operationKey ||
      operation.completedAt !== transition.completedAt
    )
      throw new Error('issue ledger transition provenance does not match its operation')
    if (pendingTransitionOperations.length > 0) throw new Error('unexpected pending transition operation')
  } else if (hasPendingReopen) {
    const operation = transitionOperations[0]
    const pendingOperation = pendingTransitionOperations[0]
    if (
      transitionOperations.length !== 1 ||
      !operation ||
      operation.checkpoint !== 'transition' ||
      operation.key !== transition.operationKey ||
      operation.completedAt !== transition.completedAt ||
      pendingTransitionOperations.length !== 1 ||
      !pendingOperation ||
      pendingOperation.checkpoint !== 'transition-pending' ||
      pendingOperation.key !== transition.reopenOperationKey
    )
      throw new Error('pending reporter transition provenance does not match its operations')
  } else if (transitionOperations.length > 0 || pendingTransitionOperations.length > 0) {
    throw new Error('issue ledger has an orphan transition operation')
  }
}

const countOccurrences = (body: string, marker: string): number => body.split(marker).length - 1

export const renderIssueLedger = (ledger: IssueLedger): string => {
  assertIssueLedger(ledger)
  const rendered = `${ISSUE_LEDGER_START}\n${JSON.stringify(ledger)}\n${ISSUE_LEDGER_END}`
  if (Buffer.byteLength(rendered, 'utf8') > MAX_LEDGER_BYTES)
    throw new Error('issue ledger exceeds bounded body budget')
  return rendered
}

export const parseIssueLedger = (body: string): ParsedIssueLedger => {
  if (countOccurrences(body, ISSUE_LEDGER_START) !== 1 || countOccurrences(body, ISSUE_LEDGER_END) !== 1)
    throw new Error('issue body has duplicate or missing ledger sentinels')
  const start = body.indexOf(ISSUE_LEDGER_START)
  const end = body.indexOf(ISSUE_LEDGER_END)
  if (start === -1 || end === -1 || end < start) throw new Error('issue body has malformed ledger sentinel ordering')
  const machineBlock = body.slice(start, end + ISSUE_LEDGER_END.length)
  if (Buffer.byteLength(machineBlock, 'utf8') > MAX_LEDGER_BYTES)
    throw new Error('issue ledger exceeds bounded body budget')
  let value: unknown
  try {
    value = JSON.parse(body.slice(start + ISSUE_LEDGER_START.length, end).trim()) as unknown
  } catch {
    throw new Error('issue ledger JSON is malformed')
  }
  assertIssueLedger(value)
  return {ledger: value, humanBody: `${body.slice(0, start)}${body.slice(end + ISSUE_LEDGER_END.length)}`}
}
