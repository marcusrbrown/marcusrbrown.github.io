import {describe, expect, it} from 'vitest'
import {
  authorizeManualRoute,
  parseLiveAuditEvent,
  type LiveAuditEventRoute,
  type ManualCandidateRoute,
} from '../../scripts/live-audit/route-event'

const validCommentEvent = (overrides: Record<string, unknown> = {}): Record<string, unknown> => {
  const {comment: commentOverride, issue: issueOverride, ...eventOverrides} = overrides
  const mergeObject = (defaults: Record<string, unknown>, override: unknown): unknown =>
    override === undefined
      ? defaults
      : typeof override === 'object' && override !== null && !Array.isArray(override)
        ? {...defaults, ...override}
        : override
  return {
    action: 'created',
    issue: mergeObject({number: 42}, issueOverride),
    comment: mergeObject(
      {
        body: '@fro-bot validate #42',
        author_association: 'MEMBER',
        user: {login: 'alice', type: 'User'},
      },
      commentOverride,
    ),
    ...eventOverrides,
  }
}

const manualCandidate = (): ManualCandidateRoute => ({
  kind: 'manual-candidate',
  issueNumber: 42,
  actor: 'alice',
  authorAssociation: 'MEMBER',
})

const workflowDispatchEvent = (mode: string, schedule?: unknown): Record<string, unknown> => ({
  inputs: {
    mode,
    ...(schedule === undefined ? {} : {'live-audit-slot': schedule}),
  },
})

describe('live-audit event routing', () => {
  it('routes both exact scheduled cron values', () => {
    expect(parseLiveAuditEvent('schedule', {schedule: '30 3 * * *'})).toEqual({
      kind: 'scheduled',
      schedule: '30 3 * * *',
    })
    expect(parseLiveAuditEvent('schedule', {schedule: '30 15 * * *'})).toEqual({
      kind: 'scheduled',
      schedule: '30 15 * * *',
    })
  })

  it('ignores unsupported schedule slots and event names', () => {
    expect(parseLiveAuditEvent('schedule', {schedule: '0 0 * * *'})).toEqual({
      kind: 'ignored',
      reason: 'unsupported-schedule',
    })
    expect(parseLiveAuditEvent('workflow_dispatch', {})).toEqual({
      kind: 'ignored',
      reason: 'unsupported-event',
    })
  })

  it.each(['30 3 * * *', '30 15 * * *'])('routes live-audit workflow dispatch slot %s', schedule => {
    expect(parseLiveAuditEvent('workflow_dispatch', workflowDispatchEvent('live-audit', schedule))).toEqual({
      kind: 'scheduled',
      schedule,
    })
  })

  it('rejects invalid or missing live-audit workflow dispatch slots', () => {
    expect(parseLiveAuditEvent('workflow_dispatch', workflowDispatchEvent('live-audit', '0 0 * * *'))).toEqual({
      kind: 'ignored',
      reason: 'unsupported-schedule',
    })
    expect(parseLiveAuditEvent('workflow_dispatch', workflowDispatchEvent('live-audit'))).toEqual({
      kind: 'ignored',
      reason: 'invalid-event',
    })
  })

  it.each(['review', 'maintenance', 'autoheal'])('keeps generic dispatch mode %s outside live-audit routing', mode => {
    expect(parseLiveAuditEvent('workflow_dispatch', workflowDispatchEvent(mode, '30 3 * * *'))).toEqual({
      kind: 'ignored',
      reason: 'unsupported-event',
    })
  })

  it('routes only an exact trusted manual validation comment on a non-PR issue', () => {
    expect(parseLiveAuditEvent('issue_comment', validCommentEvent())).toEqual({
      kind: 'manual-candidate',
      issueNumber: 42,
      actor: 'alice',
      authorAssociation: 'MEMBER',
    })
    expect(
      parseLiveAuditEvent(
        'issue_comment',
        validCommentEvent({issue: {pull_request: {url: 'https://github.com/example/repo/pull/42'}}}),
      ),
    ).toEqual({kind: 'ignored', reason: 'pull-request'})
  })

  it('ignores ordinary trusted bot mentions because generic routing owns them', () => {
    const route = parseLiveAuditEvent(
      'issue_comment',
      validCommentEvent({comment: {body: '@fro-bot please review this'}}),
    )
    expect(route).toEqual({kind: 'ignored', reason: 'not-validation-command'})
  })

  it.each([
    '@fro-bot validate #42 now',
    ' @fro-bot validate #42',
    '@fro-bot validate #42 ',
    'before @fro-bot validate #42',
    '@fro-bot validate #0',
    '@fro-bot validate #01',
  ])('does not route malformed or non-exact validation body %s', body => {
    const route = parseLiveAuditEvent('issue_comment', validCommentEvent({comment: {body}}))
    expect(route.kind).toBe('ignored')
    expect((route as Extract<LiveAuditEventRoute, {kind: 'ignored'}>).reason).toBe('not-validation-command')
  })

  it('rejects an exact validation command with an unsafe captured number', () => {
    expect(
      parseLiveAuditEvent('issue_comment', validCommentEvent({comment: {body: '@fro-bot validate #9007199254740992'}})),
    ).toEqual({kind: 'ignored', reason: 'invalid-issue-number'})
  })

  it('ignores a validation command whose number disagrees with the issue', () => {
    expect(parseLiveAuditEvent('issue_comment', validCommentEvent({comment: {body: '@fro-bot validate #43'}}))).toEqual(
      {kind: 'ignored', reason: 'issue-number-mismatch'},
    )
  })

  it('ignores review and discussion comments even when they contain the exact command', () => {
    expect(parseLiveAuditEvent('pull_request_review_comment', validCommentEvent())).toEqual({
      kind: 'ignored',
      reason: 'unsupported-event',
    })
    expect(parseLiveAuditEvent('discussion_comment', validCommentEvent())).toEqual({
      kind: 'ignored',
      reason: 'unsupported-event',
    })
  })

  it.each([
    {login: 'fro-bot', type: 'User'},
    {login: 'alice[bot]', type: 'User'},
    {login: 'alice', type: 'Bot'},
  ])('ignores bot actors %j', user => {
    expect(parseLiveAuditEvent('issue_comment', validCommentEvent({comment: {user}}))).toEqual({
      kind: 'ignored',
      reason: 'bot-actor',
    })
  })

  it.each(['NONE', 'CONTRIBUTOR', 'COLLABORATOR-ish', ''])('ignores untrusted associations %s', authorAssociation => {
    expect(
      parseLiveAuditEvent('issue_comment', validCommentEvent({comment: {author_association: authorAssociation}})),
    ).toEqual({kind: 'ignored', reason: 'untrusted-association'})
  })

  it('ignores malformed, deleted, or missing event fields without leaking comment prose', () => {
    const cases: readonly [string, unknown, 'invalid-event' | 'invalid-issue-number'][] = [
      ['missing event', undefined, 'invalid-event'],
      ['missing issue', validCommentEvent({issue: null}), 'invalid-event'],
      ['missing comment', validCommentEvent({comment: null}), 'invalid-event'],
      ['deleted issue number', validCommentEvent({issue: {number: null}}), 'invalid-issue-number'],
      ['string issue number', validCommentEvent({issue: {number: '42'}}), 'invalid-issue-number'],
      ['missing actor', validCommentEvent({comment: {user: null}}), 'invalid-event'],
      ['missing association', validCommentEvent({comment: {author_association: undefined}}), 'invalid-event'],
      ['non-string body', validCommentEvent({comment: {body: 42}}), 'invalid-event'],
    ]
    for (const [_label, event, reason] of cases) {
      const route = parseLiveAuditEvent('issue_comment', event)
      expect(route).toEqual({kind: 'ignored', reason})
      expect(JSON.stringify(route)).not.toContain('@fro-bot')
    }
  })

  it('rejects every non-writing repository permission', () => {
    for (const permission of ['read', 'triage', 'none'] as const)
      expect(authorizeManualRoute(manualCandidate(), permission)).toEqual({
        kind: 'rejected',
        reason: 'insufficient-permission',
      })
  })

  it('authorizes only current write-capable permissions', () => {
    for (const permission of ['write', 'maintain', 'admin'] as const)
      expect(authorizeManualRoute(manualCandidate(), permission)).toEqual({
        kind: 'manual',
        issueNumber: 42,
        actor: 'alice',
      })
  })

  it('uses current permission as final authorization, not author_association', () => {
    expect(authorizeManualRoute({...manualCandidate(), authorAssociation: 'NONE'}, 'write')).toEqual({
      kind: 'manual',
      issueNumber: 42,
      actor: 'alice',
    })
  })
})
