import {describe, expect, it, vi} from 'vitest'

import {
  getIssueCloseEvents,
  type GhCommandResult,
  type GhRunner,
  type GitHubRepository,
} from '../../scripts/live-audit/github-runner'

const result = (stdout: string, exitCode = 0): GhCommandResult => ({stdout, stderr: '', exitCode})
const repository: GitHubRepository = {owner: 'example', repo: 'repo'}

const lifecycleEvent = (
  event: 'closed' | 'reopened',
  createdAt: string,
  actor: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  id: 9,
  node_id: 'CE_kwDOExample',
  url: 'https://api.github.com/repos/example/repo/issues/events/9',
  actor: {login: actor, id: 1, node_id: 'U_kwDOExample', type: 'User'},
  event,
  commit_id: null,
  commit_url: null,
  created_at: createdAt,
  label: null,
  performed_via_github_app: null,
  ...overrides,
})

describe('bounded issue lifecycle transport', () => {
  it('retains an ordered closed-reopened-closed timeline and ignores unrelated events', async () => {
    const firstClose = lifecycleEvent('closed', '2026-07-20T03:30:00Z', 'reporter-bot', {id: 101})
    const reopen = lifecycleEvent('reopened', '2026-07-20T03:31:00Z', 'maintainer', {id: 102})
    const finalClose = lifecycleEvent('closed', '2026-07-20T03:32:00Z', 'reporter-bot', {id: 103})
    const unrelated = lifecycleEvent('closed', '2026-07-20T03:29:00Z', 'maintainer', {
      id: 104,
      event: 'labeled',
      label: {name: 'bug'},
    })
    const run = vi.fn(async (args: readonly string[]): Promise<GhCommandResult> => {
      expect(args).toEqual(['api', 'repos/example/repo/issues/204/events', '--paginate', '--slurp'])
      return result(
        JSON.stringify([
          [finalClose, unrelated],
          [reopen, firstClose],
        ]),
      )
    })

    await expect(getIssueCloseEvents({run}, repository, 204)).resolves.toEqual([
      {id: 101, event: 'closed', createdAt: '2026-07-20T03:30:00Z', actor: 'reporter-bot'},
      {id: 102, event: 'reopened', createdAt: '2026-07-20T03:31:00Z', actor: 'maintainer'},
      {id: 103, event: 'closed', createdAt: '2026-07-20T03:32:00Z', actor: 'reporter-bot'},
    ])
  })

  it('retains event IDs and sorts first by timestamp, then numeric ID', async () => {
    const earlier = lifecycleEvent('closed', '2026-07-20T03:30:00Z', 'reporter-bot', {id: 200})
    const sameTimestampHighId = lifecycleEvent('reopened', '2026-07-20T03:31:00Z', 'maintainer', {id: 22})
    const sameTimestampLowId = lifecycleEvent('closed', '2026-07-20T03:31:00Z', 'reporter-bot', {id: 11})
    const later = lifecycleEvent('closed', '2026-07-20T03:32:00Z', 'reporter-bot', {id: 1})
    const runner: GhRunner = {
      run: vi.fn(async () =>
        result(
          JSON.stringify([
            [later, sameTimestampHighId],
            [sameTimestampLowId, earlier],
          ]),
        ),
      ),
    }

    await expect(getIssueCloseEvents(runner, repository, 204)).resolves.toEqual([
      {id: 200, event: 'closed', createdAt: '2026-07-20T03:30:00Z', actor: 'reporter-bot'},
      {id: 11, event: 'closed', createdAt: '2026-07-20T03:31:00Z', actor: 'reporter-bot'},
      {id: 22, event: 'reopened', createdAt: '2026-07-20T03:31:00Z', actor: 'maintainer'},
      {id: 1, event: 'closed', createdAt: '2026-07-20T03:32:00Z', actor: 'reporter-bot'},
    ])
  })

  it('rejects malformed lifecycle entries instead of dropping them', async () => {
    const malformedEvents = [
      lifecycleEvent('closed', 'not-a-date', 'reporter-bot'),
      lifecycleEvent('reopened', '2026-07-20T03:31:00Z', 'reporter-bot', {actor: {login: 42}}),
      lifecycleEvent('closed', '2026-07-20T03:32:00Z', 'reporter-bot', {actor: undefined}),
      lifecycleEvent('closed', '2026-07-20T03:32:00Z', 'bad/actor'),
      lifecycleEvent('closed', '2026-07-20T03:32:00Z', 'reporter-bot', {id: undefined}),
      lifecycleEvent('closed', '2026-07-20T03:32:00Z', 'reporter-bot', {id: 0}),
      lifecycleEvent('closed', '2026-07-20T03:32:00Z', 'reporter-bot', {id: 1.5}),
    ]

    for (const malformedEvent of malformedEvents) {
      const runner: GhRunner = {run: vi.fn(async () => result(JSON.stringify([[malformedEvent]])))}
      await expect(getIssueCloseEvents(runner, repository, 204)).rejects.toThrow(/lifecycle|actor|timestamp|id/)
    }
  })

  it('rejects malformed and excessive paginated lifecycle payloads', async () => {
    await expect(
      getIssueCloseEvents({run: vi.fn(async () => result(JSON.stringify({message: 'incomplete'})))}, repository, 204),
    ).rejects.toThrow(/truncated|unexpected/)
    await expect(
      getIssueCloseEvents(
        {run: vi.fn(async () => result(JSON.stringify(Array.from({length: 101}, () => []))))},
        repository,
        204,
      ),
    ).rejects.toThrow(/truncated|unexpected/)
  })
})
