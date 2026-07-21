import {describe, expect, it, vi} from 'vitest'

import {
  listLabeledIssues,
  type GhCommandResult,
  type GhRunner,
  type GitHubRepository,
} from '../../scripts/live-audit/github-runner'

const result = (stdout: string, exitCode = 0): GhCommandResult => ({stdout, stderr: '', exitCode})

const issuePayload = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  url: 'https://api.github.com/repos/example/repo/issues/204',
  repository_url: 'https://api.github.com/repos/example/repo',
  labels_url: 'https://api.github.com/repos/example/repo/issues/204/labels{/name}',
  comments_url: 'https://api.github.com/repos/example/repo/issues/204/comments',
  events_url: 'https://api.github.com/repos/example/repo/issues/204/events',
  html_url: 'https://github.com/example/repo/issues/204',
  id: 9001,
  node_id: 'I_kwDOExample',
  number: 204,
  title: 'Broken card',
  user: {login: 'maintainer', id: 1, node_id: 'U_kwDOExample', type: 'User'},
  labels: [
    {
      id: 1,
      node_id: 'LA_kwDOExample',
      url: 'https://api.github.com/repos/example/repo/labels/visual-audit',
      name: 'visual-audit',
      color: 'b60205',
      default: false,
    },
  ],
  state: 'open',
  locked: false,
  assignee: null,
  assignees: [],
  milestone: null,
  comments: 0,
  created_at: '2026-07-20T03:30:00Z',
  updated_at: '2026-07-20T03:30:00Z',
  closed_at: null,
  author_association: 'OWNER',
  active_lock_reason: null,
  body: 'human prose',
  state_reason: null,
  ...overrides,
})

const repository: GitHubRepository = {owner: 'example', repo: 'repo'}

const argsFromCall = (call: readonly unknown[]): readonly string[] => {
  const args = call[0]
  if (!Array.isArray(args) || !args.every(argument => typeof argument === 'string'))
    throw new Error('arguments missing')
  return args
}

describe('bounded repository issue enumeration', () => {
  it('lists newly created labeled issues without search indexing, excludes pull requests, and deduplicates states', async () => {
    const openIssue = issuePayload({number: 204})
    const duplicateOpenIssue = issuePayload({number: 204, updated_at: '2026-07-20T03:31:00Z'})
    const closedDuplicate = issuePayload({number: 204, state: 'closed', state_reason: 'completed'})
    const newlyListed = issuePayload({number: 205, title: 'Newly listed issue'})
    const wrongLabel = issuePayload({number: 206, labels: [{name: 'visual-audit-extra'}]})
    const pullRequest = issuePayload({
      number: 207,
      pull_request: {
        url: 'https://api.github.com/repos/example/repo/pulls/207',
        html_url: 'https://github.com/example/repo/pull/207',
        diff_url: 'https://github.com/example/repo/pull/207.diff',
        patch_url: 'https://github.com/example/repo/pull/207.patch',
      },
    })
    const run = vi.fn(async (args: readonly string[]): Promise<GhCommandResult> => {
      const endpoint = args[1]
      if (endpoint === 'repos/example/repo/issues?labels=visual-audit&state=open&per_page=100')
        return result(JSON.stringify([[openIssue], [duplicateOpenIssue, newlyListed, wrongLabel, pullRequest]]))
      if (endpoint === 'repos/example/repo/issues?labels=visual-audit&state=closed&per_page=100')
        return result(JSON.stringify([[closedDuplicate, issuePayload({number: 205, state: 'closed'})]]))
      throw new Error(`unexpected endpoint: ${endpoint}`)
    })

    const issues = await listLabeledIssues({run}, repository, 'visual-audit')

    expect(issues.map(issue => issue.number)).toEqual([204, 205])
    expect(issues[0]).toMatchObject({number: 204, state: 'open', updatedAt: '2026-07-20T03:30:00Z'})
    expect(issues[1]).toMatchObject({number: 205, title: 'Newly listed issue'})
    expect(run.mock.calls.map(argsFromCall)).toEqual([
      expect.arrayContaining([
        'api',
        'repos/example/repo/issues?labels=visual-audit&state=open&per_page=100',
        '--paginate',
        '--slurp',
      ]),
      expect.arrayContaining([
        'api',
        'repos/example/repo/issues?labels=visual-audit&state=closed&per_page=100',
        '--paginate',
        '--slurp',
      ]),
    ])
    expect(run.mock.calls.map(argsFromCall).every(args => !args.includes('search/issues'))).toBe(true)
  })

  it('rejects malformed issue pages and incomplete issue fields instead of returning partial results', async () => {
    const malformedResponses = [
      JSON.stringify({message: 'rate limited'}),
      JSON.stringify([[{number: 204, title: 'missing fields'}]]),
      JSON.stringify([[issuePayload({comments: '0'})]]),
      JSON.stringify([[issuePayload({labels: [{name: 42}]})]]),
    ]

    for (const payload of malformedResponses) {
      const runner: GhRunner = {run: vi.fn(async () => result(payload))}
      await expect(listLabeledIssues(runner, repository, 'visual-audit')).rejects.toThrow(
        /unexpected|malformed|truncated|shape/,
      )
    }
  })

  it('rejects excessive page and flattened result bounds', async () => {
    const tooManyPages = JSON.stringify(Array.from({length: 101}, () => []))
    const tooManyItems = JSON.stringify([Array.from({length: 1_001}, (_, index) => issuePayload({number: index + 1}))])

    await expect(
      listLabeledIssues({run: vi.fn(async () => result(tooManyPages))}, repository, 'visual-audit'),
    ).rejects.toThrow(/truncated|bounded/)
    await expect(
      listLabeledIssues({run: vi.fn(async () => result(tooManyItems))}, repository, 'visual-audit'),
    ).rejects.toThrow(/truncated|bounded/)
  })

  it('validates repository and label inputs before constructing an endpoint', async () => {
    const run = vi.fn(async () => result(JSON.stringify([[]])))

    await expect(listLabeledIssues({run}, {owner: 'bad/owner', repo: 'repo'}, 'visual-audit')).rejects.toThrow(
      /repository/,
    )
    await expect(listLabeledIssues({run}, repository, 'visual-audit&state=closed')).rejects.toThrow(/label/)
    expect(run).not.toHaveBeenCalled()
  })
})
