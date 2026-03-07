#!/usr/bin/env tsx

import process from 'node:process'

interface GitHubIssue {
  readonly number: number
  readonly title: string
  readonly body: string | null
  readonly html_url: string
  readonly pull_request?: object
}

interface GitHubComment {
  readonly user: {
    readonly login: string
  }
}

interface RecommendedCheck {
  readonly title: string
  readonly details: string
}

interface ScriptEnvironment {
  readonly owner: string
  readonly repo: string
  readonly token: string
  readonly ref: string
  readonly watchlistIssueNumber: number
}

const WATCHLIST_TITLE_PREFIX = 'Regression Watchlist'
const FOLLOW_UP_PREFIX = 'Follow-up'
const RECOMMENDED_CHECKS_SECTION_PATTERN = /## Recommended Follow-up Checks([\s\S]*?)(?:\n## |\n---|$)/
const COMMENTS_PER_PAGE = 100
const HTTP_UNPROCESSABLE_ENTITY = 422

export const parseRecommendedFollowUpChecks = (body: string): RecommendedCheck[] => {
  const sectionMatch = body.match(RECOMMENDED_CHECKS_SECTION_PATTERN)
  if (!sectionMatch) {
    return []
  }

  const section = sectionMatch[1] ?? ''
  const checks: RecommendedCheck[] = []
  const listItemPrefix = /^\d+\.\s+\*\*/
  const separator = '** — '

  for (const line of section.split('\n')) {
    const normalizedLine = line.trimStart()
    if (!listItemPrefix.test(normalizedLine)) {
      continue
    }

    const withoutPrefix = normalizedLine.replace(listItemPrefix, '')
    const separatorIndex = withoutPrefix.indexOf(separator)
    if (separatorIndex === -1) {
      continue
    }

    checks.push({
      title: withoutPrefix.slice(0, separatorIndex).trim(),
      details: withoutPrefix.slice(separatorIndex + separator.length).trim(),
    })
  }

  return checks
}

export const buildFollowUpTitle = (watchlistIssueNumber: number, checkTitle: string): string =>
  `${FOLLOW_UP_PREFIX}: ${checkTitle} (watchlist #${watchlistIssueNumber})`

const getEnvironment = (): ScriptEnvironment => {
  const repository = process.env.GITHUB_REPOSITORY
  const token = process.env.GITHUB_TOKEN
  const issueNumber = process.env.WATCHLIST_ISSUE_NUMBER
  const ref = process.env.GITHUB_REF_NAME ?? 'main'

  if (!repository || !token || !issueNumber) {
    throw new Error('Missing required environment variables: GITHUB_REPOSITORY, GITHUB_TOKEN, WATCHLIST_ISSUE_NUMBER')
  }

  const [owner, repo] = repository.split('/')
  if (!owner || !repo) {
    throw new Error(`Invalid repository format: "${repository}"`)
  }

  const watchlistIssueNumber = Number.parseInt(issueNumber, 10)
  if (Number.isNaN(watchlistIssueNumber) || watchlistIssueNumber <= 0) {
    throw new Error(`Invalid WATCHLIST_ISSUE_NUMBER value: "${issueNumber}"`)
  }

  return {owner, repo, token, ref, watchlistIssueNumber}
}

const createGitHubClient = (environment: ScriptEnvironment) => {
  const request = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
    const response = await fetch(`https://api.github.com${path}`, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${environment.token}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.headers ?? {}),
      },
    })

    if (!response.ok) {
      const errorBody = await response.text()
      throw new Error(`GitHub API request failed (${response.status} ${response.statusText}): ${errorBody}`)
    }

    if (response.status === 204) {
      return null as T
    }

    return (await response.json()) as T
  }

  return {request}
}

const getExistingFollowUpIssue = (
  allIssues: readonly GitHubIssue[],
  watchlistIssueNumber: number,
  checkTitle: string,
): GitHubIssue | undefined => {
  const title = buildFollowUpTitle(watchlistIssueNumber, checkTitle)
  return allIssues.find(issue => issue.pull_request === undefined && issue.title === title)
}

const mentionFroBotForTriage = async (
  request: <T>(path: string, init?: RequestInit) => Promise<T>,
  owner: string,
  repo: string,
  issueNumber: number,
  watchlistIssueNumber: number,
): Promise<boolean> => {
  await request(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
    method: 'POST',
    body: JSON.stringify({
      body: `@fro-bot please triage this follow-up issue from #${watchlistIssueNumber}.`,
    }),
  })

  const comments = await request<GitHubComment[]>(
    `/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=${COMMENTS_PER_PAGE}`,
  )

  return comments.some(comment => comment.user.login === 'fro-bot')
}

const dispatchFroBotWorkflow = async (
  request: <T>(path: string, init?: RequestInit) => Promise<T>,
  owner: string,
  repo: string,
  ref: string,
  issueNumbers: readonly number[],
): Promise<void> => {
  const uniqueIssueNumbers = [...new Set(issueNumbers)]
  if (uniqueIssueNumbers.length === 0) {
    return
  }

  const issueList = uniqueIssueNumbers.map(issueNumber => `#${issueNumber}`).join(', ')
  const prompt = `Please triage regression watchlist follow-up issues ${issueList} in ${owner}/${repo}.`

  await request(`/repos/${owner}/${repo}/actions/workflows/fro-bot.yaml/dispatches`, {
    method: 'POST',
    body: JSON.stringify({
      ref,
      inputs: {
        prompt,
      },
    }),
  })
}

const createFollowUpIssue = async (
  request: <T>(path: string, init?: RequestInit) => Promise<T>,
  owner: string,
  repo: string,
  watchlistIssue: GitHubIssue,
  check: RecommendedCheck,
): Promise<GitHubIssue> => {
  const title = buildFollowUpTitle(watchlistIssue.number, check.title)
  const body = [
    `Parent watchlist: #${watchlistIssue.number}`,
    '',
    `Source check: ${check.details}`,
    '',
    '## Requested actions',
    '- [ ] Investigate and implement the follow-up work',
    '- [ ] Add/adjust tests as needed',
    '- [ ] Post validation evidence in this issue',
  ].join('\n')

  try {
    return await request<GitHubIssue>(`/repos/${owner}/${repo}/issues`, {
      method: 'POST',
      body: JSON.stringify({
        title,
        body,
        assignees: ['copilot'],
      }),
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    if (!errorMessage.includes(`${HTTP_UNPROCESSABLE_ENTITY}`)) {
      throw error
    }

    const fallbackBody = `${body}\n\n_Assignment to @copilot failed automatically; please assign manually if needed._`
    return request<GitHubIssue>(`/repos/${owner}/${repo}/issues`, {
      method: 'POST',
      body: JSON.stringify({
        title,
        body: fallbackBody,
      }),
    })
  }
}

export const run = async (): Promise<void> => {
  const environment = getEnvironment()
  const {request} = createGitHubClient(environment)

  const watchlistIssue = await request<GitHubIssue>(
    `/repos/${environment.owner}/${environment.repo}/issues/${environment.watchlistIssueNumber}`,
  )

  if (!watchlistIssue.title.startsWith(WATCHLIST_TITLE_PREFIX)) {
    console.log(`Issue #${watchlistIssue.number} is not a regression watchlist issue. Skipping.`)
    return
  }

  const checks = parseRecommendedFollowUpChecks(watchlistIssue.body ?? '')
  if (checks.length === 0) {
    throw new Error(`Issue #${watchlistIssue.number} does not contain any recommended follow-up checks.`)
  }

  const allIssues = await request<GitHubIssue[]>(
    `/repos/${environment.owner}/${environment.repo}/issues?state=all&per_page=100`,
  )

  const triageNeedsDispatch: number[] = []

  for (const check of checks) {
    const existingIssue = getExistingFollowUpIssue(allIssues, watchlistIssue.number, check.title)
    const followUpIssue =
      existingIssue ?? (await createFollowUpIssue(request, environment.owner, environment.repo, watchlistIssue, check))

    const hasFroBotTriage = await mentionFroBotForTriage(
      request,
      environment.owner,
      environment.repo,
      followUpIssue.number,
      watchlistIssue.number,
    )

    if (!hasFroBotTriage) {
      triageNeedsDispatch.push(followUpIssue.number)
    }
  }

  await dispatchFroBotWorkflow(request, environment.owner, environment.repo, environment.ref, triageNeedsDispatch)
}

const toFileUrl = (filePath: string): string => new URL(`file://${filePath}`).href

if (process.argv[1] && import.meta.url === toFileUrl(process.argv[1])) {
  run().catch(error => {
    console.error(error)
    process.exit(1)
  })
}
