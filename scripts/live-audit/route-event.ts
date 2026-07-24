import type {GitHubPermission} from './github-runner'

export const LIVE_AUDIT_SCHEDULES = ['30 3 * * *', '30 15 * * *'] as const
export type LiveAuditSchedule = (typeof LIVE_AUDIT_SCHEDULES)[number]

export type LiveAuditIgnoredReason =
  | 'unsupported-event'
  | 'unsupported-schedule'
  | 'invalid-event'
  | 'unsupported-action'
  | 'pull-request'
  | 'not-validation-command'
  | 'invalid-issue-number'
  | 'issue-number-mismatch'
  | 'bot-actor'
  | 'untrusted-association'

export type LiveAuditEventRoute =
  | {readonly kind: 'ignored'; readonly reason: LiveAuditIgnoredReason}
  | {readonly kind: 'scheduled'; readonly schedule: LiveAuditSchedule}
  | {
      readonly kind: 'manual-candidate'
      readonly issueNumber: number
      readonly actor: string
      readonly authorAssociation: string
    }

export type ManualCandidateRoute = Extract<LiveAuditEventRoute, {kind: 'manual-candidate'}>

export type LiveAuditPermission = GitHubPermission | 'none'

export type ManualAuthorizationRoute =
  | {readonly kind: 'manual'; readonly issueNumber: number; readonly actor: string}
  | {readonly kind: 'rejected'; readonly reason: 'insufficient-permission'}

const MANUAL_VALIDATION = /^@fro-bot validate #([1-9]\d*)$/
const TRUSTED_ASSOCIATIONS = new Set(['OWNER', 'MEMBER', 'COLLABORATOR'])
const WRITE_PERMISSIONS = new Set<LiveAuditPermission>(['write', 'maintain', 'admin'])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const ignored = (reason: LiveAuditIgnoredReason): LiveAuditEventRoute => ({kind: 'ignored', reason})

const parseSchedule = (event: unknown): LiveAuditEventRoute => {
  if (!isRecord(event) || typeof event.schedule !== 'string') return ignored('invalid-event')
  const schedule = LIVE_AUDIT_SCHEDULES.find(value => value === event.schedule)
  if (!schedule) return ignored('unsupported-schedule')
  return {kind: 'scheduled', schedule}
}

const parseWorkflowDispatch = (event: unknown): LiveAuditEventRoute => {
  if (!isRecord(event) || !isRecord(event.inputs)) return ignored('unsupported-event')
  if (event.inputs.mode !== 'live-audit') return ignored('unsupported-event')
  if (!Object.prototype.hasOwnProperty.call(event.inputs, 'live-audit-slot')) return ignored('invalid-event')
  return parseSchedule({schedule: event.inputs['live-audit-slot']})
}

const isBotActor = (actor: string, user: Record<string, unknown>): boolean =>
  actor === 'fro-bot' || actor.endsWith('[bot]') || user.type === 'Bot'

const parseManualCandidate = (event: Record<string, unknown>): LiveAuditEventRoute => {
  if (event.action !== 'created') return ignored('unsupported-action')
  const issue = event.issue
  const comment = event.comment
  if (!isRecord(issue) || !isRecord(comment)) return ignored('invalid-event')
  if (issue.pull_request !== undefined && issue.pull_request !== null) return ignored('pull-request')
  if (typeof issue.number !== 'number' || !Number.isSafeInteger(issue.number) || issue.number < 1)
    return ignored('invalid-issue-number')
  if (typeof comment.body !== 'string') return ignored('invalid-event')
  const match = MANUAL_VALIDATION.exec(comment.body)
  if (!match) return ignored('not-validation-command')
  const capturedNumber = Number(match[1])
  if (!Number.isSafeInteger(capturedNumber) || capturedNumber < 1) return ignored('invalid-issue-number')
  if (capturedNumber !== issue.number) return ignored('issue-number-mismatch')
  const user = comment.user
  if (!isRecord(user) || typeof user.login !== 'string' || user.login.length === 0) return ignored('invalid-event')
  if (isBotActor(user.login, user)) return ignored('bot-actor')
  if (typeof comment.author_association !== 'string') return ignored('invalid-event')
  if (!TRUSTED_ASSOCIATIONS.has(comment.author_association)) return ignored('untrusted-association')
  return {
    kind: 'manual-candidate',
    issueNumber: issue.number,
    actor: user.login,
    authorAssociation: comment.author_association,
  }
}

export const parseLiveAuditEvent = (eventName: string, event: unknown): LiveAuditEventRoute => {
  if (eventName === 'schedule') return parseSchedule(event)
  if (eventName === 'workflow_dispatch') return parseWorkflowDispatch(event)
  if (eventName !== 'issue_comment') return ignored('unsupported-event')
  if (!isRecord(event)) return ignored('invalid-event')
  return parseManualCandidate(event)
}

export const authorizeManualRoute = (
  route: ManualCandidateRoute,
  permission: LiveAuditPermission,
): ManualAuthorizationRoute => {
  if (!WRITE_PERMISSIONS.has(permission)) return {kind: 'rejected', reason: 'insufficient-permission'}
  return {kind: 'manual', issueNumber: route.issueNumber, actor: route.actor}
}
