import {createHash} from 'node:crypto'
import {lstatSync, readFileSync, realpathSync, statSync} from 'node:fs'
import {isAbsolute, join, relative, sep} from 'node:path'

import {
  parseAuditManifest,
  type AuditManifest,
  type EvidenceReference,
  type Finding,
  type ValidationClean,
} from './contract'
import {computeEvidenceIntegrity, validatePng} from './evidence'
import {
  addIssueComment,
  createIssue,
  getIssue,
  getIssueCloseEvents,
  getIssueComments,
  GhRunnerError,
  listLabeledIssues,
  patchIssueBodyFresh,
  setIssueState,
  type GhRunner,
  type GitHubIssue,
  type GitHubIssueComment,
  type GitHubRepository,
} from './github-runner'
import {findingFingerprint, operationKey, variantKey} from './identity'
import {
  ISSUE_LEDGER_END,
  ISSUE_LEDGER_START,
  parseIssueLedger,
  renderIssueLedger,
  type IssueLedger,
  type LedgerOperation,
  type LedgerTransition,
  type LedgerVariant,
} from './issue-ledger'
import {
  evidenceAssetName,
  getOrCreateEvidenceRelease,
  inspectEvidenceRelease,
  listEvidenceAssets,
  planEvidenceAsset,
  publishEvidenceAsset,
  type EvidenceAsset,
  type EvidenceAssetPlan,
  type EvidenceRelease,
  type PublicImageResult,
} from './release-evidence'

export type ReporterWriteMode = 'disabled' | 'manual-only' | 'enabled'

export interface ReporterDependencies {
  readonly artifactRoot: string
  readonly repository: GitHubRepository
  readonly runner: GhRunner
  readonly verifyPublicImage: (url: string) => Promise<PublicImageResult>
  readonly workflowRunUrl: string
  readonly writeMode?: ReporterWriteMode
  readonly now?: () => Date
  readonly reporterActor: string
}

export type ReporterOperationKind =
  'release-create' | 'asset-upload' | 'asset-delete' | 'issue-create' | 'body-update' | 'comment' | 'transition'

export interface ReporterOperation {
  readonly kind: ReporterOperationKind
  readonly key: string
  readonly fingerprint?: string
  readonly variantKey?: string
  readonly assetName?: string
  readonly transition?: 'reopen' | 'close'
}

export type ReporterStatus = 'success' | 'warning' | 'failure'

export type ReporterDiagnosticCode =
  | 'writes-disabled'
  | 'manual-only'
  | 'suppressed'
  | 'infrastructure'
  | 'artifact'
  | 'planning'
  | 'asset-verification'
  | 'transport'
  | 'drift'
  | 'mutation'
  | 'contract'

export type ReporterDiagnosticSeverity = 'warning' | 'failure'

export interface ReporterDiagnostic {
  readonly code: ReporterDiagnosticCode
  readonly severity: ReporterDiagnosticSeverity
  readonly message: string
}

export interface ReporterOutcome {
  readonly status: ReporterStatus
  readonly diagnosticDetails: readonly ReporterDiagnostic[]
}

export interface ReporterResult extends ReporterOutcome {
  readonly manifest: AuditManifest
  readonly operations: readonly ReporterOperation[]
  readonly diagnostics: readonly string[]
  readonly writeCount: number
  readonly issueNumbers: readonly number[]
}

export interface ReporterDecision extends ReporterOutcome {
  readonly validated: ValidatedReporterArtifact
  readonly operations: readonly ReporterOperation[]
  readonly diagnostics: readonly string[]
  readonly permittedFindings: readonly Finding[]
  readonly permittedValidations: readonly ValidationClean[]
  readonly executionPlan: ReporterPlan
}

export interface ValidatedReporterArtifact {
  readonly manifest: AuditManifest
  readonly evidence: ReadonlyMap<string, Uint8Array>
}

export class ReporterError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ReporterError'
  }
}

export const classifyReporterError = (
  error: unknown,
): {readonly status: 'failure'; readonly diagnostic: ReporterDiagnostic} => ({
  status: 'failure',
  diagnostic: {
    code: 'contract',
    severity: 'failure',
    message: error instanceof Error ? error.message : 'reporter failed',
  },
})

const MAX_ARTIFACT_FILES = 400
const MAX_ASSET_BYTES = 5_000_000
const MAX_COMMENT_TEXT = 2_000
const LABEL = 'visual-audit'
const SUPPRESSED_LABEL = 'visual-audit-suppressed'
const REPORTER_WARNING_CODES: ReadonlySet<ReporterDiagnosticCode> = new Set([
  'writes-disabled',
  'manual-only',
  'suppressed',
  'infrastructure',
])

const diagnosticSeverity = (code: ReporterDiagnosticCode): ReporterDiagnosticSeverity =>
  REPORTER_WARNING_CODES.has(code) ? 'warning' : 'failure'

const diagnosticMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback

const diagnosticCodeForError = (
  error: unknown,
  fallback: Extract<ReporterDiagnosticCode, 'planning' | 'transport' | 'mutation'>,
): ReporterDiagnosticCode => {
  if (error instanceof GhRunnerError) return 'transport'
  const message = diagnosticMessage(error, '')
  if (message.includes('drift')) return 'drift'
  if (message === 'suppressed recurrence: human issue resolution is authoritative') return 'suppressed'
  return fallback
}

const addDiagnostic = (
  diagnostics: string[],
  diagnosticDetails: ReporterDiagnostic[],
  code: ReporterDiagnosticCode,
  message: string,
): void => {
  diagnostics.push(message)
  diagnosticDetails.push({code, severity: diagnosticSeverity(code), message})
}

const statusFromDiagnostics = (diagnosticDetails: readonly ReporterDiagnostic[]): ReporterStatus => {
  if (diagnosticDetails.some(diagnostic => diagnostic.severity === 'failure')) return 'failure'
  return diagnosticDetails.length > 0 ? 'warning' : 'success'
}

const safeRelativePath = (value: string): boolean => {
  if (value.length === 0 || value.length > 500 || isAbsolute(value) || value.includes('\\')) return false
  const parts = value.split('/')
  return parts.every(part => part.length > 0 && part !== '.' && part !== '..')
}

const evidenceRefs = (manifest: AuditManifest): EvidenceReference[] => {
  const refs: EvidenceReference[] = []
  for (const finding of manifest.findings) {
    refs.push(...finding.evidence)
    if (finding.responsive !== 'not-applicable') refs.push(...finding.counterpart.evidence)
  }
  for (const validation of manifest.validations) if (validation.status === 'clean') refs.push(...validation.evidence)
  return refs
}

const hashOutsideLedger = (body: string): string => {
  const start = body.indexOf(ISSUE_LEDGER_START)
  const end = body.indexOf(ISSUE_LEDGER_END)
  const outside =
    start !== -1 && end > start ? `${body.slice(0, start)}${body.slice(end + ISSUE_LEDGER_END.length)}` : body
  return createHash('sha256').update(outside).digest('hex')
}

const escapeMarkdown = (value: string): string => {
  const escaped = [...value]
    .filter(character => {
      const code = character.codePointAt(0) ?? 0
      return code > 0x1f && code !== 0x7f
    })
    .join('')
    .split('')
    .map(character => ('\\`*_{}[]()#+.!|<>'.includes(character) ? `\\${character}` : character))
    .join('')
  const bounded = escaped.slice(0, MAX_COMMENT_TEXT)
  return bounded.endsWith('\\') ? bounded.slice(0, -1) : bounded
}

const issueFingerprint = (finding: Finding): string => findingFingerprint(finding)
const findingVariant = (finding: Finding): string => variantKey(finding.variant)
const nowIso = (clock: () => Date): string => {
  const value = clock().toISOString()
  if (!Number.isFinite(Date.parse(value))) throw new ReporterError('invalid reporter clock')
  return value
}

const validateReporterActor = (actor: string): void => {
  if (
    typeof actor !== 'string' ||
    actor.trim().length === 0 ||
    actor.length > 100 ||
    [...actor].some(character => {
      const code = character.codePointAt(0) ?? 0
      return code <= 0x1f || code === 0x7f
    })
  )
    throw new ReporterError('invalid reporter actor')
}

const validateWorkflowRunUrl = (url: string, repository: GitHubRepository): void => {
  try {
    const parsed = new URL(url)
    if (
      parsed.protocol !== 'https:' ||
      parsed.hostname !== 'github.com' ||
      parsed.port !== '' ||
      parsed.username !== '' ||
      parsed.password !== '' ||
      parsed.search ||
      parsed.hash ||
      !new RegExp(`^/${repository.owner}/${repository.repo}/actions/runs/[1-9][0-9]*$`).test(parsed.pathname)
    )
      throw new Error('invalid')
  } catch {
    throw new ReporterError('workflow run URL is not the current repository Actions run')
  }
}

const fileForEvidence = (root: string, reference: EvidenceReference): Uint8Array => {
  if (!safeRelativePath(reference.path)) throw new ReporterError('evidence path is unsafe')
  let rootReal: string
  let candidateReal: string
  try {
    rootReal = realpathSync(root)
    candidateReal = realpathSync(join(rootReal, reference.path))
  } catch {
    throw new ReporterError('evidence file is missing or unreadable')
  }
  const escape = relative(rootReal, candidateReal)
  if (escape === '..' || escape.startsWith(`..${sep}`) || isAbsolute(escape))
    throw new ReporterError('evidence path escapes artifact root')
  try {
    const link = lstatSync(join(rootReal, reference.path))
    const stat = statSync(join(rootReal, reference.path))
    if (!link.isFile() || !stat.isFile() || link.isSymbolicLink() || stat.nlink !== 1)
      throw new ReporterError('evidence entry is not a private regular file')
    if (stat.size <= 0 || stat.size > MAX_ASSET_BYTES)
      throw new ReporterError('evidence file size is outside the bounded artifact limit')
    const bytes = readFileSync(join(rootReal, reference.path))
    const afterLink = lstatSync(join(rootReal, reference.path))
    const afterStat = statSync(join(rootReal, reference.path))
    if (
      !afterLink.isFile() ||
      !afterStat.isFile() ||
      afterLink.isSymbolicLink() ||
      afterStat.nlink !== 1 ||
      afterLink.dev !== link.dev ||
      afterLink.ino !== link.ino ||
      afterStat.dev !== stat.dev ||
      afterStat.ino !== stat.ino ||
      afterStat.size !== stat.size ||
      bytes.byteLength !== afterStat.size
    )
      throw new ReporterError('evidence file changed during read')
    const dimensions = validatePng(bytes, MAX_ASSET_BYTES)
    const actual = computeEvidenceIntegrity(reference.path, bytes)
    if (
      actual.path !== reference.integrity.path ||
      actual.sha256 !== reference.integrity.sha256 ||
      actual.width !== reference.integrity.width ||
      actual.height !== reference.integrity.height ||
      actual.bytes !== reference.integrity.bytes ||
      dimensions.width !== reference.integrity.width ||
      dimensions.height !== reference.integrity.height
    )
      throw new ReporterError('evidence bytes do not match manifest integrity metadata')
    return bytes
  } catch (error) {
    if (error instanceof ReporterError) throw error
    throw new ReporterError(error instanceof Error ? error.message : 'evidence PNG is invalid')
  }
}

const assertManifestTerminals = (manifest: AuditManifest): void => {
  const outcomes = new Map<string, 'finding' | 'clean' | 'infrastructure-error'>()
  const add = (key: string, outcome: 'finding' | 'clean' | 'infrastructure-error', duplicateMessage: string): void => {
    const previous = outcomes.get(key)
    if (previous !== undefined) {
      if (previous === outcome) throw new ReporterError(duplicateMessage)
      throw new ReporterError('conflicting terminal outcomes for the same fingerprint and variant')
    }
    outcomes.set(key, outcome)
  }
  for (const finding of manifest.findings)
    add(`${issueFingerprint(finding)}:${findingVariant(finding)}`, 'finding', 'duplicate finding terminal outcome')
  for (const validation of manifest.validations)
    add(`${validation.fingerprint}:${validation.variantKey}`, validation.status, 'duplicate terminal validation')
  if (manifest.runKind === 'manual') {
    for (const validation of manifest.validations)
      if (validation.issueNumber !== manifest.issueNumber)
        throw new ReporterError('manual operation targets an issue other than the enclosing manual issue')
  }
}

export const validateReporterArtifact = (input: {
  readonly manifest: unknown
  readonly artifactRoot: string
}): ValidatedReporterArtifact => {
  const manifest = parseAuditManifest(input.manifest)
  assertManifestTerminals(manifest)
  let rootStat: ReturnType<typeof lstatSync>
  try {
    rootStat = lstatSync(input.artifactRoot)
  } catch {
    throw new ReporterError('artifact root is unavailable')
  }
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink())
    throw new ReporterError('artifact root is not a private directory')
  const refs = evidenceRefs(manifest)
  if (refs.length > MAX_ARTIFACT_FILES) throw new ReporterError('artifact contains too many evidence files')
  const evidence = new Map<string, Uint8Array>()
  for (const reference of refs) {
    if (evidence.has(reference.path)) throw new ReporterError('duplicate evidence path')
    evidence.set(reference.path, fileForEvidence(input.artifactRoot, reference))
  }
  return {manifest, evidence}
}

const addOperation = (ledger: IssueLedger, operation: LedgerOperation): IssueLedger =>
  ledger.operations.some(item => item.key === operation.key)
    ? ledger
    : {...ledger, operations: [...ledger.operations, operation]}

const hasRunOperation = (
  ledger: IssueLedger,
  runId: string,
  fingerprint: string,
  variant: string,
  kind: string,
): boolean => {
  const key = operationKey(runId, fingerprint, variant, kind)
  return ledger.operations.some(item => item.key === key)
}

const transitionOperation = (runId: string, fingerprint: string, variant: string): string =>
  operationKey(runId, fingerprint, variant, 'transition')

const reconcilePendingReopen = (ledger: IssueLedger, completedAt: string): IssueLedger => {
  if (ledger.transition.kind !== 'closed-pending-reopen') return ledger
  const pendingTransition = ledger.transition
  const pendingOperation = ledger.operations.find(
    operation =>
      operation.checkpoint === 'transition-pending' && operation.key === pendingTransition.reopenOperationKey,
  )
  if (!pendingOperation) throw new ReporterError('pending reopen checkpoint is missing')
  const reopenedOperation = {
    key: pendingTransition.reopenOperationKey,
    checkpoint: 'transition' as const,
    completedAt,
  }
  const operations = ledger.operations.filter(operation => operation.key !== pendingTransition.reopenOperationKey)
  return {
    ...ledger,
    transition: {
      kind: 'reopened',
      source: 'reporter',
      operationKey: reopenedOperation.key,
      completedAt: reopenedOperation.completedAt,
      previousCloseOperationKey: pendingTransition.operationKey,
      previousCloseCompletedAt: pendingTransition.completedAt,
    },
    operations: [...operations.filter(operation => operation.checkpoint !== 'transition'), reopenedOperation],
  }
}

const withReporterTransition = (
  ledger: IssueLedger,
  kind: 'closed' | 'reopened',
  operationKeyValue: string,
  completedAt: string,
): IssueLedger => {
  const existingOperation = ledger.operations.find(
    operation => operation.checkpoint === 'transition' && operation.key === operationKeyValue,
  )
  if (existingOperation) {
    if (existingOperation.checkpoint !== 'transition')
      throw new ReporterError('reporter transition operation is pending and cannot be replaced')
    if (
      ledger.transition.source !== 'reporter' ||
      ledger.transition.kind !== kind ||
      ledger.transition.completedAt !== existingOperation.completedAt
    )
      throw new ReporterError('reporter transition operation is already committed with different provenance')
    return ledger
  }
  const transition: LedgerTransition =
    kind === 'closed'
      ? {kind, source: 'reporter', operationKey: operationKeyValue, completedAt}
      : {kind, source: 'reporter', operationKey: operationKeyValue, completedAt}
  const reconciled =
    ledger.transition.kind === 'closed-pending-reopen' && kind === 'closed'
      ? reconcilePendingReopen(ledger, completedAt)
      : ledger
  const baseOperations = reconciled.operations.filter(operation => operation.checkpoint !== 'transition')
  return addOperation(
    {...reconciled, transition, operations: baseOperations},
    {key: operationKeyValue, checkpoint: 'transition', completedAt},
  )
}

const withPendingReopen = (ledger: IssueLedger, reopenOperationKey: string): IssueLedger => {
  if (ledger.transition.kind === 'closed-pending-reopen') {
    if (ledger.transition.reopenOperationKey !== reopenOperationKey)
      throw new ReporterError('pending reopen operation does not match the persisted ledger')
    return ledger
  }
  if (ledger.transition.kind !== 'closed' || ledger.transition.source !== 'reporter')
    throw new ReporterError('reporter close provenance is unavailable for reopen')
  if (ledger.operations.some(operation => operation.key === reopenOperationKey))
    throw new ReporterError('reopen operation key is already used by another ledger checkpoint')
  return {
    ...ledger,
    transition: {
      kind: 'closed-pending-reopen',
      source: 'reporter',
      operationKey: ledger.transition.operationKey,
      completedAt: ledger.transition.completedAt,
      reopenOperationKey,
    },
    operations: [...ledger.operations, {key: reopenOperationKey, checkpoint: 'transition-pending'}],
  }
}

const ledgerForFinding = (
  finding: Finding,
  runId: string,
  clock: string,
  existing?: IssueLedger,
  reopen = false,
): IssueLedger => {
  const fingerprint = issueFingerprint(finding)
  const key = findingVariant(finding)
  const counterpartData = finding.responsive === 'not-applicable' ? undefined : finding.counterpart
  const counterpart = counterpartData?.result.status === 'failure' ? counterpartData.variant : undefined
  const counterpartKey = counterpart ? variantKey(counterpart) : undefined
  const initial: LedgerVariant = {
    key,
    viewport: finding.variant.viewport,
    theme: finding.variant.theme,
    state: finding.variant.state,
    cleanCount: 0,
  }
  const base = existing ?? {
    version: 1 as const,
    fingerprint,
    route: finding.route,
    semanticTarget: finding.semanticTarget,
    findingClass: finding.findingClass,
    assertion: finding.assertion,
    actions: finding.actions,
    responsive: finding.responsive,
    failureSignature: finding.failureSignature,
    variants: [initial],
    replay: [
      {
        variantKey: key,
        target: finding.target,
        assertion: finding.assertion,
        actions: finding.actions,
        reproduction: finding.reproduction,
      },
    ],
    operations: [],
    transition: {kind: 'open' as const, source: 'reporter' as const},
  }
  let variants = base.variants.map(item => {
    if (item.key === key || (counterpartKey !== undefined && item.key === counterpartKey))
      return {...item, cleanCount: 0}
    return item
  })
  if (!variants.some(item => item.key === key)) variants = [...variants, initial]
  if (counterpart && counterpartKey && !variants.some(item => item.key === counterpartKey))
    variants = [
      ...variants,
      {
        ...initial,
        key: counterpartKey,
        viewport: counterpart.viewport,
        theme: counterpart.theme,
        state: counterpart.state,
      },
    ]
  let replay = base.replay.map(item => {
    if (item.variantKey === key)
      return {
        ...item,
        target: finding.target,
        assertion: finding.assertion,
        actions: finding.actions,
        reproduction: finding.reproduction,
      }
    if (counterpartKey !== undefined && item.variantKey === counterpartKey)
      return {
        ...item,
        target: counterpartData?.target ?? finding.target,
        assertion: finding.assertion,
        actions: finding.actions,
        reproduction: finding.reproduction,
      }
    return item
  })
  if (!replay.some(item => item.variantKey === key))
    replay = [
      ...replay,
      {
        variantKey: key,
        target: finding.target,
        assertion: finding.assertion,
        actions: finding.actions,
        reproduction: finding.reproduction,
      },
    ]
  if (counterpart && counterpartKey && !replay.some(item => item.variantKey === counterpartKey))
    replay = [
      ...replay,
      {
        variantKey: counterpartKey,
        target: counterpartData?.target ?? finding.target,
        assertion: finding.assertion,
        actions: finding.actions,
        reproduction: finding.reproduction,
      },
    ]
  let result: IssueLedger = {...base, actions: finding.actions, variants, replay}
  const reportKey = operationKey(runId, fingerprint, key, 'report')
  result = addOperation(result, {key: reportKey, checkpoint: 'evidence', completedAt: clock})
  if (!reopen) result = reconcilePendingReopen(result, clock)
  if (reopen) {
    const reopenOperationKey = transitionOperation(runId, fingerprint, key)
    result = withPendingReopen(result, reopenOperationKey)
  }
  return result
}

const assertValidationIdentity = (ledger: IssueLedger, validation: ValidationClean): void => {
  const active = ledger.variants.find(variant => variant.key === validation.variantKey)
  const replay = ledger.replay.find(item => item.variantKey === validation.variantKey)
  if (
    ledger.fingerprint !== validation.fingerprint ||
    ledger.route !== validation.route ||
    ledger.semanticTarget !== validation.semanticTarget ||
    ledger.findingClass !== validation.findingClass ||
    ledger.failureSignature !== validation.failureSignature ||
    !active ||
    variantKey(validation.variant) !== active.key ||
    !replay ||
    JSON.stringify(replay.target) !== JSON.stringify(validation.target)
  )
    throw new ReporterError('validation identity does not match issue ledger')
}

const assertTransitionProvenance = (ledger: IssueLedger): void => {
  const transition = ledger.transition
  if (transition.source !== 'reporter') return
  if (transition.kind === 'closed-pending-reopen') {
    const closeOperation = ledger.operations.find(
      item => item.checkpoint === 'transition' && item.key === transition.operationKey,
    )
    const reopenOperation = ledger.operations.find(
      item => item.checkpoint === 'transition-pending' && item.key === transition.reopenOperationKey,
    )
    if (
      !closeOperation ||
      closeOperation.checkpoint !== 'transition' ||
      closeOperation.completedAt !== transition.completedAt ||
      !reopenOperation
    )
      throw new ReporterError('reporter pending reopen provenance is missing or tampered')
    return
  }
  if (transition.kind !== 'closed' && transition.kind !== 'reopened') return
  const operation = ledger.operations.find(
    item => item.checkpoint === 'transition' && item.key === transition.operationKey,
  )
  if (!operation || operation.checkpoint !== 'transition' || operation.completedAt !== transition.completedAt)
    throw new ReporterError('reporter transition provenance is missing or tampered')
}

const assertClosedReporterAuthority = async (
  issue: GitHubIssue,
  ledger: IssueLedger,
  comments: readonly GitHubIssueComment[],
  deps: ReporterDependencies,
): Promise<void> => {
  assertTransitionProvenance(ledger)
  if (
    (ledger.transition.kind !== 'closed' && ledger.transition.kind !== 'closed-pending-reopen') ||
    ledger.transition.source !== 'reporter' ||
    issue.state !== 'closed' ||
    issue.stateReason !== 'completed'
  )
    throw new ReporterError('suppressed recurrence: human issue resolution is authoritative')
  const transition = ledger.transition
  const marker = comments.find(
    comment =>
      comment.actor === deps.reporterActor &&
      comment.body.split('\n').includes(`<!-- live-audit-transition:${transition.operationKey} -->`) &&
      Number.isFinite(Date.parse(comment.createdAt)),
  )
  if (!marker) throw new ReporterError('suppressed recurrence: reporter transition marker is unavailable')
  const markerAt = Date.parse(marker.createdAt)
  let events
  try {
    events = await getIssueCloseEvents(deps.runner, deps.repository, issue.number)
  } catch {
    throw new ReporterError('suppressed recurrence: close provenance is unavailable')
  }
  if (events.some(event => !Number.isFinite(Date.parse(event.createdAt))))
    throw new ReporterError('suppressed recurrence: close provenance is unavailable')
  const latest = [...events].sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt)).at(-1)
  if (!latest || latest.event !== 'closed' || latest.actor !== deps.reporterActor)
    throw new ReporterError('suppressed recurrence: close actor is not the reporter')
  if (
    events.some(event => event.actor !== deps.reporterActor) ||
    events.some(event => Date.parse(event.createdAt) >= markerAt && event.event === 'reopened') ||
    Date.parse(latest.createdAt) < markerAt
  )
    throw new ReporterError('suppressed recurrence: lifecycle provenance is stale or ambiguous')
}

const assessIssueAuthority = async (issue: GitHubIssue, deps: ReporterDependencies): Promise<void> => {
  if (issue.state === 'open') return
  if (!issue.body) throw new ReporterError('suppressed recurrence: issue ledger is absent')
  let ledger: IssueLedger
  try {
    ledger = parseIssueLedger(issue.body).ledger
    assertTransitionProvenance(ledger)
  } catch {
    throw new ReporterError('suppressed recurrence: issue ledger is malformed')
  }
  const comments = await getIssueComments(deps.runner, deps.repository, issue.number)
  await assertClosedReporterAuthority(issue, ledger, comments, deps)
}

const listReporterIssueSnapshots = async (
  runner: GhRunner,
  repository: GitHubRepository,
): Promise<readonly GitHubIssue[]> => {
  const [visible, suppressed] = await Promise.all([
    listLabeledIssues(runner, repository, LABEL),
    listLabeledIssues(runner, repository, SUPPRESSED_LABEL),
  ])
  const byNumber = new Map<number, GitHubIssue>()
  for (const issue of [...visible, ...suppressed]) byNumber.set(issue.number, issue)
  return [...byNumber.values()]
}

const assertIssueIdentity = (issue: GitHubIssue, fingerprint: string, variant: string): IssueLedger => {
  if (!issue.body) throw new ReporterError('issue ledger is absent')
  const ledger = parseIssueLedger(issue.body).ledger
  if (ledger.fingerprint !== fingerprint || !ledger.variants.some(item => item.key === variant))
    throw new ReporterError('issue identity does not match decision snapshot')
  return ledger
}

const assertFindingIdentity = (issue: GitHubIssue, fingerprint: string): IssueLedger => {
  if (!issue.body) throw new ReporterError('issue ledger is absent')
  const ledger = parseIssueLedger(issue.body).ledger
  if (ledger.fingerprint !== fingerprint) throw new ReporterError('issue identity does not match decision snapshot')
  return ledger
}

const isReporterMarker = (comments: readonly GitHubIssueComment[], operation: string, actor: string): boolean =>
  comments.some(comment => comment.actor === actor && comment.body.includes(`live-audit-operation:${operation}`))

const expectedReleaseUrl = (repository: GitHubRepository, assetName: string): string =>
  `https://github.com/${repository.owner}/${repository.repo}/releases/download/live-audit-evidence/${assetName}`

const assertVerifiedReleaseUrl = (url: string, repository: GitHubRepository, assetName: string): void => {
  if (url !== expectedReleaseUrl(repository, assetName))
    throw new ReporterError('evidence URL is not a verified repository release URL')
}

interface PlannedAsset {
  readonly reference: EvidenceReference
  readonly bytes: Uint8Array
  readonly assetName: string
  readonly plan: EvidenceAssetPlan | 'upload'
  readonly assetVariantKey: string
}

interface ItemPlan {
  readonly kind: 'finding' | 'validation'
  readonly finding?: Finding
  readonly findings?: readonly Finding[]
  readonly validation?: ValidationClean
  readonly fingerprint: string
  readonly variantKey: string
  readonly issueSnapshot?: GitHubIssue
  readonly sourceLedger?: IssueLedger
  readonly expectedLedger: IssueLedger
  readonly sourceHumanHash: string
  readonly assets: readonly PlannedAsset[]
  readonly operations: readonly ReporterOperation[]
  readonly issueCreate: boolean
  readonly bodyUpdate: boolean
  readonly comment: boolean
  readonly transition?: 'reopen' | 'close'
  readonly issueNumber?: number
}

export interface ReporterPlan extends ReporterOutcome {
  readonly items: readonly ItemPlan[]
  readonly operations: readonly ReporterOperation[]
  readonly diagnostics: readonly string[]
  readonly diagnosticDetails: readonly ReporterDiagnostic[]
}

const makeOperation = (
  kind: ReporterOperationKind,
  key: string,
  fingerprint: string,
  variantKeyValue: string,
  assetName?: string,
  transition?: 'reopen' | 'close',
): ReporterOperation => ({
  kind,
  key,
  fingerprint,
  variantKey: variantKeyValue,
  ...(assetName ? {assetName} : {}),
  ...(transition ? {transition} : {}),
})

const orderEvidence = <T extends {reference: EvidenceReference}>(assets: readonly T[]): T[] =>
  [...assets].sort((left, right) => {
    const leftRole = left.reference.role === 'context' ? 0 : 1
    const rightRole = right.reference.role === 'context' ? 0 : 1
    return leftRole - rightRole || left.reference.path.localeCompare(right.reference.path)
  })

const targetSummary = (target: Finding['target']): string => {
  if (target.kind === 'role') return `role:${target.role}/${target.name}`
  if (target.kind === 'region') return `region:${target.x},${target.y},${target.width},${target.height}`
  return `${target.kind}:${target.value}`
}

const themeSummary = (theme: Finding['variant']['theme']): string => {
  return theme.kind === 'preset' ? `preset:${theme.presetId}` : `mode:${theme.mode}`
}

const counterpartEvidenceLabel = (finding: Finding, reference: EvidenceReference): string => {
  if (finding.responsive === 'not-applicable') return reference.caption
  const counterpart = finding.counterpart
  const result = counterpart.result.status === 'failure' ? 'Failure' : 'Clean'
  return `${result} counterpart — route=${finding.route} — viewport=${counterpart.variant.viewport} — theme=${themeSummary(counterpart.variant.theme)} — target=${targetSummary(counterpart.target)} — role=${reference.role}`
}

const primaryEvidenceLabel = (finding: Finding, reference: EvidenceReference): string => {
  const observed =
    finding.observations.find(observation => observation.status === 'failure')?.signature ?? finding.failureSignature
  return `Failure finding — route=${finding.route} — viewport=${finding.variant.viewport} — theme=${themeSummary(finding.variant.theme)} — target=${targetSummary(finding.target)} — observed=${observed} — role=${reference.role}`
}

const renderFindingText = (
  finding: Finding,
  assets: readonly {reference: EvidenceReference; url: string}[],
  workflowRunUrl: string,
  runKind: AuditManifest['runKind'],
): string => {
  const counterpart = finding.responsive === 'not-applicable' ? undefined : finding.counterpart
  const counterpartPaths = new Set(counterpart?.evidence.map(reference => reference.path) ?? [])
  const label = (reference: EvidenceReference): string =>
    counterpart && counterpartPaths.has(reference.path)
      ? counterpartEvidenceLabel(finding, reference)
      : primaryEvidenceLabel(finding, reference)
  return [
    '## Live audit finding',
    '',
    escapeMarkdown(finding.description),
    '',
    'Reproduction:',
    ...finding.reproduction.map(step => `- ${escapeMarkdown(step)}`),
    '',
    ...assets.map(
      asset => `![${escapeMarkdown(label(asset.reference))}](${asset.url}) — ${escapeMarkdown(label(asset.reference))}`,
    ),
    '',
    runKind === 'manual'
      ? `This is a manual replay. Workflow run: ${workflowRunUrl}`
      : `This is scheduled replay 1 of 2. Workflow run: ${workflowRunUrl}`,
  ].join('\n')
}

const renderFindingComment = (
  finding: Finding,
  assets: readonly {reference: EvidenceReference; url: string}[],
  operation: string,
  workflowRunUrl: string,
  runKind: AuditManifest['runKind'],
  transitionKey?: string,
): string => {
  const counterpart = finding.responsive === 'not-applicable' ? undefined : finding.counterpart
  const counterpartPaths = new Set(counterpart?.evidence.map(reference => reference.path) ?? [])
  return [
    `<!-- live-audit-operation:${operation} -->`,
    ...(transitionKey ? [`<!-- live-audit-transition:${transitionKey} -->`] : []),
    `<!-- live-audit-run:${operationKey(operation, operation, operation, 'marker')} -->`,
    '',
    'Reporter evidence for a repeat finding.',
    '',
    ...assets.map(asset => {
      const counterpartReference = counterpart && counterpartPaths.has(asset.reference.path)
      const caption = counterpartReference
        ? counterpartEvidenceLabel(finding, asset.reference)
        : primaryEvidenceLabel(finding, asset.reference)
      const alt = caption
      return `![${escapeMarkdown(alt)}](${asset.url}) — ${escapeMarkdown(caption)}`
    }),
    '',
    runKind === 'manual'
      ? `Manual replay evidence. Workflow run: ${workflowRunUrl}`
      : `Scheduled replay 1 of 2 evidence. Workflow run: ${workflowRunUrl}`,
  ].join('\n')
}

const renderValidationComment = (
  assets: readonly {reference: EvidenceReference; url: string}[],
  operation: string,
  workflowRunUrl: string,
  runKind: AuditManifest['runKind'],
  transitionKey?: string,
  scheduledClosed = false,
): string =>
  [
    `<!-- live-audit-operation:${operation} -->`,
    ...(transitionKey ? [`<!-- live-audit-transition:${transitionKey} -->`] : []),
    `<!-- live-audit-run:${operationKey(operation, operation, operation, 'marker')} -->`,
    '',
    ...orderEvidence(assets).map(
      asset => `![${escapeMarkdown(asset.reference.alt)}](${asset.url}) — ${escapeMarkdown(asset.reference.caption)}`,
    ),
    '',
    runKind === 'manual'
      ? `Manual replay validation. Workflow run: ${workflowRunUrl}`
      : scheduledClosed
        ? `Scheduled replay validation (two scheduled replays). Workflow run: ${workflowRunUrl}`
        : `First scheduled replay validation. Workflow run: ${workflowRunUrl}`,
  ].join('\n')

const assetsForFinding = (
  finding: Finding,
  assets: readonly {reference: EvidenceReference; url: string; assetVariantKey: string}[],
): {reference: EvidenceReference; url: string}[] => {
  const primary = orderEvidence(assets.filter(asset => asset.assetVariantKey === findingVariant(finding)))
  const counterpart =
    finding.responsive === 'not-applicable'
      ? []
      : orderEvidence(assets.filter(asset => asset.assetVariantKey === variantKey(finding.counterpart.variant)))
  return [...primary, ...counterpart].map(({reference, url}) => ({reference, url}))
}

const renderFindingGroupText = (
  findings: readonly Finding[],
  assets: readonly {reference: EvidenceReference; url: string; assetVariantKey: string}[],
  workflowRunUrl: string,
  runKind: AuditManifest['runKind'],
): string =>
  findings
    .map(finding => renderFindingText(finding, assetsForFinding(finding, assets), workflowRunUrl, runKind))
    .join('\n\n')

const renderFindingGroupComment = (
  findings: readonly Finding[],
  assets: readonly {reference: EvidenceReference; url: string; assetVariantKey: string}[],
  operation: string,
  workflowRunUrl: string,
  runKind: AuditManifest['runKind'],
  transitionKey?: string,
): string =>
  findings
    .map(finding =>
      renderFindingComment(
        finding,
        assetsForFinding(finding, assets),
        operation,
        workflowRunUrl,
        runKind,
        transitionKey,
      ),
    )
    .join('\n\n')

const validationLedger = (
  ledger: IssueLedger,
  validation: ValidationClean,
  runId: string,
  clock: string,
  threshold: number,
  currentRunVariants: ReadonlySet<string>,
  blockedByFinding: boolean,
): IssueLedger => {
  const reconciledLedger = reconcilePendingReopen(ledger, clock)
  assertValidationIdentity(reconciledLedger, validation)
  const operation = operationKey(runId, validation.fingerprint, validation.variantKey, 'validate')
  const operationAlreadyRecorded = reconciledLedger.operations.some(item => item.key === operation)
  const variants = operationAlreadyRecorded
    ? reconciledLedger.variants
    : reconciledLedger.variants.map(variant =>
        variant.key === validation.variantKey
          ? {...variant, cleanCount: Math.min(threshold, variant.cleanCount + 1)}
          : variant,
      )
  const completeCurrentRun = variants.every(variant => currentRunVariants.has(variant.key))
  const shouldClose =
    !blockedByFinding && variants.every(variant => variant.cleanCount >= threshold) && completeCurrentRun
  if (
    operationAlreadyRecorded &&
    shouldClose &&
    (reconciledLedger.transition.kind !== 'closed' || reconciledLedger.transition.source !== 'reporter')
  )
    throw new ReporterError('validation close provenance is missing from the persisted ledger')
  let next: IssueLedger = addOperation(
    {
      ...reconciledLedger,
      actions: validation.actions,
      variants,
      replay: reconciledLedger.replay.map(item =>
        item.variantKey === validation.variantKey ? {...item, actions: validation.actions} : item,
      ),
    },
    {key: operation, checkpoint: 'evidence', completedAt: clock},
  )
  if (shouldClose && next.transition.kind !== 'closed')
    next = withReporterTransition(
      next,
      'closed',
      transitionOperation(runId, validation.fingerprint, validation.variantKey),
      clock,
    )
  return next
}

const issueSnapshotEqual = (left: GitHubIssue, right: GitHubIssue): boolean =>
  left.number === right.number &&
  left.state === right.state &&
  left.stateReason === right.stateReason &&
  JSON.stringify([...left.labels].sort()) === JSON.stringify([...right.labels].sort()) &&
  hashOutsideLedger(left.body ?? '') === hashOutsideLedger(right.body ?? '') &&
  (left.body ? parseIssueLedger(left.body).ledger : undefined) !== undefined &&
  (right.body ? parseIssueLedger(right.body).ledger : undefined) !== undefined &&
  JSON.stringify(left.body ? parseIssueLedger(left.body).ledger : undefined) ===
    JSON.stringify(right.body ? parseIssueLedger(right.body).ledger : undefined)

const evidenceAssetEqual = (left: EvidenceAsset, right: EvidenceAsset): boolean =>
  left.id === right.id &&
  left.name === right.name &&
  left.state === right.state &&
  left.size === right.size &&
  left.contentType === right.contentType &&
  left.digest === right.digest &&
  left.browserDownloadUrl === right.browserDownloadUrl

const assetPlanEqual = (planned: EvidenceAssetPlan | 'upload', fresh: EvidenceAssetPlan): boolean => {
  if (planned === 'upload') return fresh.kind === 'upload'
  if (planned.kind !== fresh.kind) return false
  if (planned.kind === 'upload' || fresh.kind === 'upload') return true
  if (planned.kind === 'error' || fresh.kind === 'error') return false
  return evidenceAssetEqual(planned.asset, fresh.asset)
}

const findReporterIssuesFromListed = (issues: readonly GitHubIssue[], fingerprint: string): GitHubIssue | undefined => {
  const matches: GitHubIssue[] = []
  for (const issue of issues) {
    if (!issue.body) throw new ReporterError('matching reporter issue ledger is absent')
    try {
      if (parseIssueLedger(issue.body).ledger.fingerprint === fingerprint) matches.push(issue)
    } catch {
      throw new ReporterError('matching reporter issue ledger is malformed')
    }
  }
  if (matches.length > 1) throw new ReporterError('multiple reporter issues match one fingerprint')
  return matches[0]
}

const createPlan = async (
  input: {readonly manifest: AuditManifest; readonly validated: ValidatedReporterArtifact} & ReporterDependencies,
): Promise<{
  items: ItemPlan[]
  operations: ReporterOperation[]
  diagnostics: string[]
  diagnosticDetails: ReporterDiagnostic[]
  status: ReporterStatus
}> => {
  const {manifest, validated} = input
  const diagnostics: string[] = []
  const diagnosticDetails: ReporterDiagnostic[] = []
  const items: ItemPlan[] = []
  const allFindingsByFingerprint = new Map<string, Finding>()
  for (const finding of manifest.findings) allFindingsByFingerprint.set(issueFingerprint(finding), finding)
  const findingGroups = new Map<string, Finding[]>()
  for (const finding of manifest.findings) {
    const fingerprint = issueFingerprint(finding)
    const group = findingGroups.get(fingerprint) ?? []
    group.push(finding)
    findingGroups.set(fingerprint, group)
  }
  const orderedFindingGroups = [...findingGroups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, group]) => group.sort((left, right) => findingVariant(left).localeCompare(findingVariant(right))))

  const findingIssues = new Map<string, GitHubIssue>()
  let listedIssues: readonly GitHubIssue[] | undefined
  const loadFindingIssue = async (fingerprint: string): Promise<GitHubIssue | undefined> => {
    if (!listedIssues) listedIssues = await listReporterIssueSnapshots(input.runner, input.repository)
    if (!findingIssues.has(fingerprint)) {
      const matching = findReporterIssuesFromListed(listedIssues, fingerprint)
      if (matching) findingIssues.set(fingerprint, matching)
    }
    return findingIssues.get(fingerprint)
  }

  const assetRefs = evidenceRefs(manifest)
  let release: EvidenceRelease | undefined
  let releaseMissing = false
  let releaseAssets: readonly EvidenceAsset[] = []
  if (assetRefs.length > 0) {
    const inspected = await inspectEvidenceRelease(input.runner, input.repository)
    if (inspected.status === 'found') {
      release = inspected.release
      releaseAssets = await listEvidenceAssets(input.runner, input.repository, release)
    } else releaseMissing = true
  }

  const virtualIssues = new Map<number, GitHubIssue>()
  const virtualLedgers = new Map<number, IssueLedger>()
  const virtualComments = new Map<number, readonly GitHubIssueComment[]>()
  const allCleanVariants = new Map<string, Set<string>>()
  const orderedValidations = [...manifest.validations].sort(
    (left, right) =>
      left.fingerprint.localeCompare(right.fingerprint) || left.variantKey.localeCompare(right.variantKey),
  )
  for (const validation of orderedValidations) {
    if (validation.status !== 'clean') continue
    const set = allCleanVariants.get(validation.fingerprint) ?? new Set<string>()
    set.add(validation.variantKey)
    allCleanVariants.set(validation.fingerprint, set)
  }

  for (const group of orderedFindingGroups) {
    const finding = group[0]
    if (!finding) continue
    const fingerprint = issueFingerprint(finding)
    const variant = findingVariant(finding)
    try {
      let issue = await loadFindingIssue(fingerprint)
      if (manifest.runKind === 'manual' && issue && issue.number !== manifest.issueNumber)
        throw new ReporterError('manual finding targets an issue other than the enclosing manual issue')
      if (manifest.runKind === 'manual' && !issue)
        throw new ReporterError('manual finding has no enclosing reporter issue')
      if (issue?.labels.includes(SUPPRESSED_LABEL)) {
        addDiagnostic(diagnostics, diagnosticDetails, 'suppressed', 'reporter issue is explicitly suppressed')
        continue
      }
      if (issue && virtualIssues.has(issue.number)) issue = virtualIssues.get(issue.number)
      let ledger: IssueLedger | undefined
      let comments: readonly GitHubIssueComment[] = []
      let sourceHumanHash = hashOutsideLedger('')
      if (issue) {
        ledger = virtualLedgers.get(issue.number) ?? assertFindingIdentity(issue, fingerprint)
        if (!virtualLedgers.has(issue.number)) await assessIssueAuthority(issue, input)
        comments =
          virtualComments.get(issue.number) ?? (await getIssueComments(input.runner, input.repository, issue.number))
        sourceHumanHash = hashOutsideLedger(issue.body ?? '')
      }
      const reportOp = operationKey(manifest.runId, fingerprint, variant, 'report')
      const groupReportOp = operationKey(manifest.runId, fingerprint, 'group', 'report')
      const initialCreateOp = operationKey(manifest.runId, fingerprint, 'group', 'initial-create')
      const reopen = issue?.state === 'closed'
      if (issue && reopen) await assessIssueAuthority(issue, input)
      let expectedLedger = ledgerForFinding(
        finding,
        manifest.runId,
        nowIso(input.now ?? (() => new Date())),
        ledger,
        reopen,
      )
      for (const sibling of group.slice(1))
        expectedLedger = ledgerForFinding(
          sibling,
          manifest.runId,
          nowIso(input.now ?? (() => new Date())),
          expectedLedger,
        )
      if (!issue)
        expectedLedger = addOperation(expectedLedger, {
          key: initialCreateOp,
          checkpoint: 'initial-create',
          completedAt: nowIso(input.now ?? (() => new Date())),
        })
      const bodyUpdate = Boolean(
        issue &&
        group.some(
          item =>
            !hasRunOperation(ledger ?? expectedLedger, manifest.runId, fingerprint, findingVariant(item), 'report'),
        ),
      )
      const refs = orderEvidence(
        group.flatMap(item => {
          const itemVariant = findingVariant(item)
          return item.responsive === 'not-applicable'
            ? item.evidence.map(reference => ({
                reference,
                assetVariantKey: itemVariant,
                operationKey: operationKey(manifest.runId, fingerprint, itemVariant, 'report'),
              }))
            : [
                ...item.evidence.map(reference => ({
                  reference,
                  assetVariantKey: itemVariant,
                  operationKey: operationKey(manifest.runId, fingerprint, itemVariant, 'report'),
                })),
                ...item.counterpart.evidence.map(reference => ({
                  reference,
                  assetVariantKey: variantKey(item.counterpart.variant),
                  operationKey: operationKey(manifest.runId, fingerprint, itemVariant, 'report'),
                })),
              ]
        }),
      )
      const assets: PlannedAsset[] = []
      let itemError: string | undefined
      for (const refItem of refs) {
        const {reference, assetVariantKey, operationKey: assetOperationKey} = refItem
        const bytes = validated.evidence.get(reference.path)
        if (!bytes) throw new ReporterError('evidence bytes disappeared')
        const assetName = evidenceAssetName({
          operationKey: assetOperationKey,
          fingerprint,
          variantKey: assetVariantKey,
          role: reference.role,
          bytes,
        })
        let plan: EvidenceAssetPlan | 'upload'
        if (releaseMissing) plan = 'upload'
        else if (release) {
          plan = await planEvidenceAsset({
            repository: input.repository,
            release,
            assets: releaseAssets,
            assetName,
            expectedBytes: bytes,
            verifyPublicImage: input.verifyPublicImage,
          })
        } else {
          throw new ReporterError('evidence release state is unavailable')
        }
        if (typeof plan !== 'string' && plan.kind === 'error') {
          itemError = `asset planning failed: ${plan.reason}`
          break
        }
        assets.push({reference, bytes, assetName, plan, assetVariantKey})
      }
      if (itemError) {
        addDiagnostic(diagnostics, diagnosticDetails, 'asset-verification', itemError)
        continue
      }
      const comment = Boolean(
        issue &&
        !ledger?.operations.some(
          operation => operation.checkpoint === 'initial-create' && operation.key === initialCreateOp,
        ) &&
        !isReporterMarker(comments, groupReportOp, input.reporterActor),
      )
      const transition = reopen ? 'reopen' : undefined
      const operations: ReporterOperation[] = []
      for (const asset of assets) {
        if (asset.plan === 'upload' || asset.plan.kind === 'upload')
          operations.push(
            makeOperation(
              'asset-upload',
              operationKey(manifest.runId, fingerprint, asset.assetVariantKey, 'asset-upload'),
              fingerprint,
              asset.assetVariantKey,
              asset.assetName,
            ),
          )
        else if (asset.plan.kind === 'replace') {
          operations.push(
            makeOperation(
              'asset-delete',
              operationKey(manifest.runId, fingerprint, asset.assetVariantKey, 'asset-delete'),
              fingerprint,
              asset.assetVariantKey,
              asset.assetName,
            ),
          )
          operations.push(
            makeOperation(
              'asset-upload',
              operationKey(manifest.runId, fingerprint, asset.assetVariantKey, 'asset-upload'),
              fingerprint,
              asset.assetVariantKey,
              asset.assetName,
            ),
          )
        }
      }
      if (!issue) operations.push(makeOperation('issue-create', groupReportOp, fingerprint, variant))
      else if (bodyUpdate) operations.push(makeOperation('body-update', reportOp, fingerprint, variant))
      if (comment) operations.push(makeOperation('comment', groupReportOp, fingerprint, variant))
      if (transition)
        operations.push(
          makeOperation(
            'transition',
            transitionOperation(manifest.runId, fingerprint, variant),
            fingerprint,
            variant,
            undefined,
            transition,
          ),
        )
      const item: ItemPlan = {
        kind: 'finding',
        finding,
        findings: group,
        fingerprint,
        variantKey: variant,
        issueSnapshot: issue,
        sourceLedger: ledger,
        expectedLedger,
        sourceHumanHash,
        assets,
        operations,
        issueCreate: !issue,
        bodyUpdate,
        comment,
        transition,
        issueNumber: issue?.number,
      }
      items.push(item)
      if (issue) {
        const nextBody = `${parseIssueLedger(issue.body ?? '').humanBody}${renderIssueLedger(expectedLedger)}`
        const nextIssue = {...issue, body: nextBody}
        virtualIssues.set(issue.number, nextIssue)
        virtualLedgers.set(issue.number, expectedLedger)
        virtualComments.set(issue.number, comments)
      }
    } catch (error) {
      const message = diagnosticMessage(error, 'finding preflight failed')
      addDiagnostic(diagnostics, diagnosticDetails, diagnosticCodeForError(error, 'planning'), message)
    }
  }

  for (const validation of orderedValidations) {
    if (validation.status !== 'clean') {
      addDiagnostic(diagnostics, diagnosticDetails, 'infrastructure', validation.diagnostic)
      continue
    }
    const fingerprint = validation.fingerprint
    const variant = validation.variantKey
    try {
      let issue = await getIssue(input.runner, input.repository, validation.issueNumber)
      if (manifest.runKind === 'manual' && issue.number !== manifest.issueNumber)
        throw new ReporterError('manual validation targets an issue other than the enclosing manual issue')
      if (issue.labels.includes(SUPPRESSED_LABEL)) {
        addDiagnostic(diagnostics, diagnosticDetails, 'suppressed', 'reporter issue is explicitly suppressed')
        continue
      }
      if (virtualIssues.has(issue.number)) issue = virtualIssues.get(issue.number) as GitHubIssue
      const sourceLedger = virtualLedgers.get(issue.number) ?? assertIssueIdentity(issue, fingerprint, variant)
      if (!virtualLedgers.has(issue.number)) await assessIssueAuthority(issue, input)
      const comments =
        virtualComments.get(issue.number) ?? (await getIssueComments(input.runner, input.repository, issue.number))
      const sourceHumanHash = hashOutsideLedger(issue.body ?? '')
      const validateOp = operationKey(manifest.runId, fingerprint, variant, 'validate')
      const currentRunVariants = allCleanVariants.get(fingerprint) ?? new Set<string>()
      const expectedLedger = validationLedger(
        sourceLedger,
        validation,
        manifest.runId,
        nowIso(input.now ?? (() => new Date())),
        manifest.runKind === 'manual' ? 1 : 2,
        currentRunVariants,
        true,
      )
      const bodyUpdate = !hasRunOperation(sourceLedger, manifest.runId, fingerprint, variant, 'validate')
      const assets: PlannedAsset[] = []
      let itemError: string | undefined
      for (const reference of validation.evidence) {
        const bytes = validated.evidence.get(reference.path)
        if (!bytes) throw new ReporterError('validation evidence bytes disappeared')
        const assetName = evidenceAssetName({
          operationKey: validateOp,
          fingerprint,
          variantKey: variant,
          role: reference.role,
          bytes,
        })
        let plan: EvidenceAssetPlan | 'upload'
        if (releaseMissing) plan = 'upload'
        else if (release) {
          plan = await planEvidenceAsset({
            repository: input.repository,
            release,
            assets: releaseAssets,
            assetName,
            expectedBytes: bytes,
            verifyPublicImage: input.verifyPublicImage,
          })
        } else {
          throw new ReporterError('evidence release state is unavailable')
        }
        if (typeof plan !== 'string' && plan.kind === 'error') {
          itemError = `asset planning failed: ${plan.reason}`
          break
        }
        assets.push({reference, bytes, assetName, plan, assetVariantKey: variant})
      }
      if (itemError) {
        addDiagnostic(diagnostics, diagnosticDetails, 'asset-verification', itemError)
        continue
      }
      const comment = !isReporterMarker(comments, validateOp, input.reporterActor)
      const transition =
        expectedLedger.transition.source === 'reporter' &&
        expectedLedger.transition.kind === 'closed' &&
        issue.state === 'open'
          ? 'close'
          : undefined
      const operations: ReporterOperation[] = []
      for (const asset of assets) {
        if (asset.plan === 'upload' || asset.plan.kind === 'upload')
          operations.push(makeOperation('asset-upload', validateOp, fingerprint, variant, asset.assetName))
        else if (asset.plan.kind === 'replace') {
          operations.push(makeOperation('asset-delete', validateOp, fingerprint, variant, asset.assetName))
          operations.push(makeOperation('asset-upload', validateOp, fingerprint, variant, asset.assetName))
        }
      }
      if (bodyUpdate) operations.push(makeOperation('body-update', validateOp, fingerprint, variant))
      if (comment) operations.push(makeOperation('comment', validateOp, fingerprint, variant))
      if (transition)
        operations.push(
          makeOperation(
            'transition',
            transitionOperation(manifest.runId, fingerprint, variant),
            fingerprint,
            variant,
            undefined,
            transition,
          ),
        )
      items.push({
        kind: 'validation',
        validation,
        fingerprint,
        variantKey: variant,
        issueSnapshot: issue,
        sourceLedger,
        expectedLedger,
        sourceHumanHash,
        assets,
        operations,
        issueCreate: false,
        bodyUpdate,
        comment,
        transition,
        issueNumber: issue.number,
      })
      const nextBody = `${parseIssueLedger(issue.body ?? '').humanBody}${renderIssueLedger(expectedLedger)}`
      virtualIssues.set(issue.number, {
        ...issue,
        body: nextBody,
        state: transition === 'close' ? 'closed' : issue.state,
        stateReason: transition === 'close' ? 'completed' : issue.stateReason,
      })
      virtualLedgers.set(issue.number, expectedLedger)
      virtualComments.set(issue.number, comments)
    } catch (error) {
      const message = diagnosticMessage(error, 'validation preflight failed')
      addDiagnostic(diagnostics, diagnosticDetails, diagnosticCodeForError(error, 'planning'), message)
    }
  }

  const cleanValidationKeys = new Map<string, Set<string>>()
  for (const validation of manifest.validations) {
    if (validation.status !== 'clean') continue
    const keys = cleanValidationKeys.get(validation.fingerprint) ?? new Set<string>()
    keys.add(validation.variantKey)
    cleanValidationKeys.set(validation.fingerprint, keys)
  }
  for (const [fingerprint, expectedKeys] of cleanValidationKeys) {
    if (allFindingsByFingerprint.has(fingerprint)) continue
    const eligibleItems = items.filter(item => item.kind === 'validation' && item.fingerprint === fingerprint)
    const eligibleKeys = new Set(eligibleItems.map(item => item.variantKey))
    if (eligibleKeys.size !== expectedKeys.size || [...expectedKeys].some(key => !eligibleKeys.has(key))) continue
    const candidate = eligibleItems.at(-1)
    if (!candidate) continue
    if (
      !candidate.expectedLedger.variants.every(
        variant => variant.cleanCount >= (manifest.runKind === 'manual' ? 1 : 2),
      ) ||
      !candidate.expectedLedger.variants.every(variant => eligibleKeys.has(variant.key))
    )
      continue
    if (candidate.expectedLedger.transition.kind === 'closed') continue
    const transitionKey = transitionOperation(manifest.runId, fingerprint, candidate.variantKey)
    const closedLedger = withReporterTransition(
      candidate.expectedLedger,
      'closed',
      transitionKey,
      nowIso(input.now ?? (() => new Date())),
    )
    const transition = makeOperation('transition', transitionKey, fingerprint, candidate.variantKey, undefined, 'close')
    const index = items.indexOf(candidate)
    items[index] = {
      ...candidate,
      expectedLedger: closedLedger,
      transition: 'close',
      operations: [...candidate.operations, transition],
    }
  }

  const operations: ReporterOperation[] = []
  const needsRelease = items.some(item =>
    item.assets.some(asset => asset.plan === 'upload' || asset.plan.kind === 'upload' || asset.plan.kind === 'replace'),
  )
  if (releaseMissing && needsRelease)
    operations.push({kind: 'release-create', key: operationKey(manifest.runId, 'release', 'release', 'create')})
  for (const item of items) operations.push(...item.operations)
  return {items, operations, diagnostics, diagnosticDetails, status: statusFromDiagnostics(diagnosticDetails)}
}

export const decideAudit = async (
  input: {readonly manifest: unknown} & ReporterDependencies,
): Promise<ReporterDecision> => {
  validateReporterActor(input.reporterActor)
  validateWorkflowRunUrl(input.workflowRunUrl, input.repository)
  const validated = validateReporterArtifact({
    manifest: input.manifest,
    artifactRoot: input.artifactRoot,
  })
  const diagnostics: string[] = []
  const diagnosticDetails: ReporterDiagnostic[] = []
  let plan: ReporterPlan
  try {
    plan = await createPlan({...input, manifest: validated.manifest, validated})
    diagnostics.push(...plan.diagnostics)
    diagnosticDetails.push(...plan.diagnosticDetails)
  } catch (error) {
    const message = diagnosticMessage(error, 'reporter planning failed')
    addDiagnostic(diagnostics, diagnosticDetails, diagnosticCodeForError(error, 'planning'), message)
    plan = {
      items: [],
      operations: [],
      diagnostics: [],
      diagnosticDetails: [],
      status: 'failure',
    }
  }
  return {
    validated,
    operations: plan.operations,
    diagnostics: diagnostics.slice(0, 100),
    status: statusFromDiagnostics(diagnosticDetails),
    diagnosticDetails: diagnosticDetails.slice(0, 100),
    permittedFindings: plan.items.flatMap(item =>
      item.kind === 'finding' && item.operations.length > 0 ? [...(item.findings ?? [item.finding as Finding])] : [],
    ),
    permittedValidations: plan.items.flatMap(item =>
      item.kind === 'validation' && item.operations.length > 0 ? [item.validation as ValidationClean] : [],
    ),
    executionPlan: plan,
  }
}

const executePlan = async (
  input: {readonly manifest: AuditManifest; readonly validated: ValidatedReporterArtifact} & ReporterDependencies,
  plan: ReporterPlan,
): Promise<{
  writeCount: number
  issueNumbers: number[]
  diagnostics: string[]
  diagnosticDetails: ReporterDiagnostic[]
}> => {
  const diagnostics = [...plan.diagnostics]
  const diagnosticDetails: ReporterDiagnostic[] = []
  const issueNumbers: number[] = []
  let writeCount = 0
  let release: EvidenceRelease | undefined
  const blockedItems = new Set<ItemPlan>()
  const authorityCheckedIssues = new Set<number>()
  for (const item of plan.items) {
    if (!item.issueSnapshot) continue
    if (authorityCheckedIssues.has(item.issueSnapshot.number)) continue
    authorityCheckedIssues.add(item.issueSnapshot.number)
    try {
      const fresh = await getIssue(input.runner, input.repository, item.issueSnapshot.number)
      if (!issueSnapshotEqual(fresh, item.issueSnapshot))
        throw new ReporterError('decision source state drift detected')
      await assessIssueAuthority(fresh, input)
    } catch (error) {
      blockedItems.add(item)
      const message = diagnosticMessage(error, 'reporter item authority preflight failed')
      addDiagnostic(diagnostics, diagnosticDetails, diagnosticCodeForError(error, 'transport'), message)
    }
  }
  const createItems = plan.items.filter(item => item.issueCreate && !blockedItems.has(item))
  if (createItems.length > 0) {
    try {
      const freshIssues = await listReporterIssueSnapshots(input.runner, input.repository)
      for (const item of createItems) {
        if (findReporterIssuesFromListed(freshIssues, item.fingerprint)) {
          blockedItems.add(item)
          addDiagnostic(
            diagnostics,
            diagnosticDetails,
            'drift',
            'issue creation race detected; matching issue appeared after planning',
          )
        }
      }
    } catch (error) {
      for (const item of createItems) blockedItems.add(item)
      const message = diagnosticMessage(error, 'issue creation race preflight failed')
      addDiagnostic(diagnostics, diagnosticDetails, diagnosticCodeForError(error, 'transport'), message)
    }
  }
  const releaseNeeded = plan.items.some(item => !blockedItems.has(item) && item.assets.length > 0)
  if (releaseNeeded) {
    try {
      const releaseCreatePlanned = plan.operations.some(operation => operation.kind === 'release-create')
      const currentRelease = await inspectEvidenceRelease(input.runner, input.repository)
      if (releaseCreatePlanned && currentRelease.status === 'found') {
        throw new ReporterError('evidence release state drifted after planning')
      }
      if (!releaseCreatePlanned && currentRelease.status === 'missing') {
        throw new ReporterError('evidence release disappeared after planning')
      }
      release = releaseCreatePlanned
        ? await getOrCreateEvidenceRelease(input.runner, input.repository)
        : currentRelease.status === 'found'
          ? currentRelease.release
          : undefined
      if (releaseCreatePlanned) writeCount += 1
    } catch (error) {
      const message = diagnosticMessage(error, 'evidence release mutation failed')
      addDiagnostic(diagnostics, diagnosticDetails, diagnosticCodeForError(error, 'transport'), message)
      return {writeCount, issueNumbers, diagnostics, diagnosticDetails}
    }
  }
  for (const item of plan.items) {
    if (item.operations.length === 0 || blockedItems.has(item)) continue
    let issue = item.issueSnapshot
    try {
      if (issue) {
        const fresh = await getIssue(input.runner, input.repository, issue.number)
        if (!issueSnapshotEqual(fresh, issue)) throw new ReporterError('decision source state drift detected')
        await assessIssueAuthority(fresh, input)
        issue = fresh
      }
      const published: {reference: EvidenceReference; url: string; assetVariantKey: string}[] = []
      for (const asset of item.assets) {
        if (!release) throw new ReporterError('evidence release was not planned')
        const freshAssets = await listEvidenceAssets(input.runner, input.repository, release)
        const freshPlan = await planEvidenceAsset({
          repository: input.repository,
          release,
          assets: freshAssets,
          assetName: asset.assetName,
          expectedBytes: asset.bytes,
          verifyPublicImage: input.verifyPublicImage,
        })
        if (!assetPlanEqual(asset.plan, freshPlan))
          throw new ReporterError('asset execution precondition drift detected')
        const op = item.operations.find(operation => operation.assetName === asset.assetName)
        if (!op) {
          const url =
            typeof asset.plan === 'string'
              ? expectedReleaseUrl(input.repository, asset.assetName)
              : asset.plan.kind === 'reuse'
                ? asset.plan.asset.browserDownloadUrl
                : expectedReleaseUrl(input.repository, asset.assetName)
          assertVerifiedReleaseUrl(url, input.repository, asset.assetName)
          published.push({reference: asset.reference, url, assetVariantKey: asset.assetVariantKey})
          continue
        }
        if (issue) {
          const fresh = await getIssue(input.runner, input.repository, issue.number)
          if (!issueSnapshotEqual(fresh, issue))
            throw new ReporterError('decision source state drift detected before asset mutation')
          await assessIssueAuthority(fresh, input)
        }
        const result = await publishEvidenceAsset({
          runner: input.runner,
          repository: input.repository,
          release,
          assetName: asset.assetName,
          expectedBytes: asset.bytes,
          verifyPublicImage: input.verifyPublicImage,
        })
        assertVerifiedReleaseUrl(result.asset.browserDownloadUrl, input.repository, asset.assetName)
        published.push({
          reference: asset.reference,
          url: result.asset.browserDownloadUrl,
          assetVariantKey: asset.assetVariantKey,
        })
        writeCount +=
          asset.plan !== 'upload' && asset.plan.kind === 'replace'
            ? 2
            : asset.plan === 'upload' || asset.plan.kind === 'upload'
              ? 1
              : 0
      }
      if (item.kind === 'finding') {
        const findings = item.findings ?? [item.finding as Finding]
        const finding = findings[0]
        if (!finding) throw new ReporterError('finding group is empty')
        const operation = operationKey(input.manifest.runId, item.fingerprint, 'group', 'report')
        if (item.issueCreate) {
          const body = `${renderFindingGroupText(findings, published, input.workflowRunUrl, input.manifest.runKind)}\n\n${renderIssueLedger(item.expectedLedger)}`
          issue = await createIssue(input.runner, input.repository, {
            title: `[visual-audit] ${escapeMarkdown(finding.failureSignature)}`,
            body,
            labels: ['fro-bot', LABEL],
          })
          writeCount += 1
        } else if (item.bodyUpdate && issue) {
          const expectedLedger = item.expectedLedger
          const source = item.issueSnapshot as GitHubIssue
          const expectedOutside = item.sourceHumanHash
          const updated = await patchIssueBodyFresh(input.runner, input.repository, issue.number, current => {
            if (
              current.state !== source.state ||
              current.stateReason !== source.stateReason ||
              hashOutsideLedger(current.body ?? '') !== expectedOutside
            )
              throw new ReporterError('issue body source drift detected')
            const parsed = parseIssueLedger(current.body ?? '')
            if (JSON.stringify(parsed.ledger) !== JSON.stringify(item.sourceLedger))
              throw new ReporterError('issue ledger source drift detected')
            return `${parsed.humanBody}${renderIssueLedger(expectedLedger)}`
          })
          const parsed = parseIssueLedger(updated.body ?? '')
          if (
            JSON.stringify(parsed.ledger) !== JSON.stringify(expectedLedger) ||
            hashOutsideLedger(updated.body ?? '') !== expectedOutside
          )
            throw new ReporterError('issue body drift detected')
          issue = updated
          writeCount += 1
        }
        if (!issue) throw new ReporterError('finding issue is unavailable after mutation')
        const beforeComment = await getIssue(input.runner, input.repository, issue.number)
        if (!issueSnapshotEqual(beforeComment, issue))
          throw new ReporterError('decision state drift detected before comment')
        const currentComments =
          item.comment || item.transition === 'reopen'
            ? await getIssueComments(input.runner, input.repository, issue.number)
            : []
        if (item.comment && !isReporterMarker(currentComments, operation, input.reporterActor)) {
          if (item.transition === 'reopen') {
            if (!item.sourceLedger) throw new ReporterError('reopen source ledger is unavailable')
            await assertClosedReporterAuthority(beforeComment, item.sourceLedger, currentComments, input)
          } else await assessIssueAuthority(beforeComment, input)
          await addIssueComment(
            input.runner,
            input.repository,
            issue.number,
            renderFindingGroupComment(
              findings,
              published,
              operation,
              input.workflowRunUrl,
              input.manifest.runKind,
              item.transition
                ? transitionOperation(input.manifest.runId, item.fingerprint, item.variantKey)
                : undefined,
            ),
          )
          writeCount += 1
        }
        if (item.transition) {
          const beforeTransition = await getIssue(input.runner, input.repository, issue.number)
          const ledger = assertIssueIdentity(beforeTransition, item.fingerprint, item.variantKey)
          if (JSON.stringify(ledger) !== JSON.stringify(item.expectedLedger))
            throw new ReporterError('issue ledger drift detected before transition')
          if (item.transition === 'reopen') {
            if (!item.sourceLedger) throw new ReporterError('reopen source ledger is unavailable')
            await assertClosedReporterAuthority(beforeTransition, item.sourceLedger, currentComments, input)
          } else if (beforeTransition.state !== 'open') throw new ReporterError('close state drift detected')
          await setIssueState(
            input.runner,
            input.repository,
            issue.number,
            item.transition === 'reopen' ? 'open' : 'closed',
            item.transition === 'reopen' ? 'reopened' : 'completed',
          )
          writeCount += 1
        }
      } else {
        const validation = item.validation as ValidationClean
        const operation = operationKey(input.manifest.runId, item.fingerprint, item.variantKey, 'validate')
        if (!issue) throw new ReporterError('validation issue is unavailable')
        if (item.bodyUpdate) {
          const source = item.issueSnapshot as GitHubIssue
          const updated = await patchIssueBodyFresh(input.runner, input.repository, issue.number, current => {
            if (
              current.state !== source.state ||
              current.stateReason !== source.stateReason ||
              hashOutsideLedger(current.body ?? '') !== item.sourceHumanHash
            )
              throw new ReporterError('issue body source drift detected')
            const parsed = parseIssueLedger(current.body ?? '')
            if (JSON.stringify(parsed.ledger) !== JSON.stringify(item.sourceLedger))
              throw new ReporterError('issue ledger source drift detected')
            return `${parsed.humanBody}${renderIssueLedger(item.expectedLedger)}`
          })
          const parsed = parseIssueLedger(updated.body ?? '')
          if (
            JSON.stringify(parsed.ledger) !== JSON.stringify(item.expectedLedger) ||
            hashOutsideLedger(updated.body ?? '') !== item.sourceHumanHash
          )
            throw new ReporterError('issue body drift detected')
          issue = updated
          writeCount += 1
        }
        const beforeComment = await getIssue(input.runner, input.repository, issue.number)
        assertValidationIdentity(assertIssueIdentity(beforeComment, item.fingerprint, item.variantKey), validation)
        const currentComments = item.comment ? await getIssueComments(input.runner, input.repository, issue.number) : []
        if (item.comment && !isReporterMarker(currentComments, operation, input.reporterActor)) {
          await assessIssueAuthority(beforeComment, input)
          await addIssueComment(
            input.runner,
            input.repository,
            issue.number,
            renderValidationComment(
              published,
              operation,
              input.workflowRunUrl,
              input.manifest.runKind,
              item.transition
                ? transitionOperation(input.manifest.runId, item.fingerprint, item.variantKey)
                : undefined,
              item.transition === 'close',
            ),
          )
          writeCount += 1
        }
        if (item.transition) {
          const beforeTransition = await getIssue(input.runner, input.repository, issue.number)
          const ledger = assertIssueIdentity(beforeTransition, item.fingerprint, item.variantKey)
          if (JSON.stringify(ledger) !== JSON.stringify(item.expectedLedger))
            throw new ReporterError('issue ledger drift detected before transition')
          if (beforeTransition.state !== 'open') throw new ReporterError('close state drift detected')
          await setIssueState(input.runner, input.repository, issue.number, 'closed', 'completed')
          writeCount += 1
        }
      }
      if (issue.number !== undefined) issueNumbers.push(issue.number)
    } catch (error) {
      const message = diagnosticMessage(error, 'reporter item mutation failed')
      addDiagnostic(diagnostics, diagnosticDetails, diagnosticCodeForError(error, 'mutation'), message)
    }
  }
  return {
    writeCount,
    issueNumbers,
    diagnostics: diagnostics.slice(0, 100),
    diagnosticDetails: diagnosticDetails.slice(0, 100),
  }
}

export const reportAudit = async (
  input: {readonly manifest: unknown} & ReporterDependencies,
): Promise<ReporterResult> => {
  const decision = await decideAudit(input)
  const plan = decision.executionPlan
  const mode = input.writeMode ?? 'disabled'
  if (mode === 'disabled' || (mode === 'manual-only' && decision.validated.manifest.runKind === 'scheduled')) {
    const modeDiagnostic: ReporterDiagnostic =
      mode === 'disabled'
        ? {code: 'writes-disabled', severity: 'warning', message: 'reporter writes disabled'}
        : {
            code: 'manual-only',
            severity: 'warning',
            message: 'reporter writes disabled for scheduled runs in manual-only mode',
          }
    return {
      manifest: decision.validated.manifest,
      operations: plan.operations,
      diagnostics: [...decision.diagnostics, ...plan.diagnostics, 'reporter writes disabled'].slice(0, 100),
      writeCount: 0,
      issueNumbers: [],
      status: statusFromDiagnostics([...decision.diagnosticDetails, modeDiagnostic]),
      diagnosticDetails: [...decision.diagnosticDetails, modeDiagnostic].slice(0, 100),
    }
  }
  const result = await executePlan(
    {...input, manifest: decision.validated.manifest, validated: decision.validated},
    plan,
  )
  const diagnosticDetails = [...decision.diagnosticDetails, ...result.diagnosticDetails].slice(0, 100)
  return {
    manifest: decision.validated.manifest,
    operations: plan.operations,
    diagnostics: [...decision.diagnostics, ...result.diagnostics].slice(0, 100),
    writeCount: result.writeCount,
    issueNumbers: result.issueNumbers,
    status: statusFromDiagnostics(diagnosticDetails),
    diagnosticDetails,
  }
}
