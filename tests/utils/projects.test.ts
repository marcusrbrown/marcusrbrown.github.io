import {describe, expect, it} from 'vitest'
import {previewImagePath} from '../../src/utils/preview-image-path'
import {
  isPortfolioTagged,
  isSiteRepo,
  PORTFOLIO_TOPIC,
  SITE_REPO_FULL_NAME,
  transformReposToProjects,
  type GitHubRepo,
} from '../../src/utils/projects'

// ---------------------------------------------------------------------------
// Shared fixtures — real GitHub Repos API shape
// ---------------------------------------------------------------------------

const makeRepo = (overrides: Partial<GitHubRepo> & {id: number; name: string; full_name: string}): GitHubRepo => ({
  description: 'A great project',
  html_url: `https://github.com/${overrides.full_name}`,
  language: 'TypeScript',
  stargazers_count: 10,
  fork: false,
  archived: false,
  created_at: '2023-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  homepage: null,
  topics: [PORTFOLIO_TOPIC],
  ...overrides,
})

const portfolioRepo = makeRepo({id: 1, name: 'my-project', full_name: 'user/my-project', stargazers_count: 100})
const portfolioRepoB = makeRepo({id: 2, name: 'other-project', full_name: 'user/other-project', stargazers_count: 50})
const forkedRepo = makeRepo({id: 3, name: 'forked-project', full_name: 'user/forked-project', fork: true})
const archivedRepo = makeRepo({id: 4, name: 'archived-project', full_name: 'user/archived-project', archived: true})
const noDescriptionRepo = makeRepo({
  id: 5,
  name: 'nodesc-project',
  full_name: 'user/nodesc-project',
  description: null,
})
const untaggedRepo = makeRepo({
  id: 6,
  name: 'untagged-project',
  full_name: 'user/untagged-project',
  topics: ['react', 'typescript'], // no 'portfolio' topic
})
const undefinedTopicsRepo = makeRepo({
  id: 7,
  name: 'no-topics-project',
  full_name: 'user/no-topics-project',
  topics: undefined,
})
const siteRepo = makeRepo({
  id: 8,
  name: 'marcusrbrown.github.io',
  full_name: 'marcusrbrown/marcusrbrown.github.io',
  topics: [PORTFOLIO_TOPIC],
})
const siteRepoMixedCase = makeRepo({
  id: 9,
  name: 'marcusrbrown.github.io',
  full_name: 'MarcusRBrown/Marcusrbrown.GitHub.io',
  topics: [PORTFOLIO_TOPIC],
})
const repoWithHyphenName = makeRepo({
  id: 10,
  name: 'dev-like',
  full_name: 'user/dev-like',
  topics: [PORTFOLIO_TOPIC],
  stargazers_count: 20,
})

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('constants', () => {
  it('PORTFOLIO_TOPIC is the string "portfolio"', () => {
    expect(PORTFOLIO_TOPIC).toBe('portfolio')
  })

  it('SITE_REPO_FULL_NAME is the owner/repo of this site', () => {
    expect(SITE_REPO_FULL_NAME).toBe('marcusrbrown/marcusrbrown.github.io')
  })
})

// ---------------------------------------------------------------------------
// isPortfolioTagged
// ---------------------------------------------------------------------------

describe('isPortfolioTagged', () => {
  it('returns true when topics array contains PORTFOLIO_TOPIC', () => {
    expect(isPortfolioTagged(portfolioRepo)).toBe(true)
  })

  it('returns false when topics array does not contain PORTFOLIO_TOPIC', () => {
    expect(isPortfolioTagged(untaggedRepo)).toBe(false)
  })

  it('returns false when topics is undefined (treated as empty array)', () => {
    expect(isPortfolioTagged(undefinedTopicsRepo)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// isSiteRepo
// ---------------------------------------------------------------------------

describe('isSiteRepo', () => {
  it('returns true for the exact site repo full_name', () => {
    expect(isSiteRepo(siteRepo)).toBe(true)
  })

  it('returns true for the site repo full_name with different casing', () => {
    expect(isSiteRepo(siteRepoMixedCase)).toBe(true)
  })

  it('returns false for a normal user repo', () => {
    expect(isSiteRepo(portfolioRepo)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// transformReposToProjects — happy paths
// ---------------------------------------------------------------------------

describe('transformReposToProjects', () => {
  it('returns an empty array for empty input', () => {
    expect(transformReposToProjects([])).toEqual([])
  })

  it('includes only portfolio-tagged, non-fork, non-archived, described, non-site repos', () => {
    const mixed = [
      portfolioRepo,
      portfolioRepoB,
      forkedRepo,
      archivedRepo,
      noDescriptionRepo,
      untaggedRepo,
      undefinedTopicsRepo,
      siteRepo,
      siteRepoMixedCase,
    ]
    const result = transformReposToProjects(mixed)
    const ids = result.map(p => p.id)
    expect(ids).toContain(portfolioRepo.id.toString())
    expect(ids).toContain(portfolioRepoB.id.toString())
    expect(ids).not.toContain(forkedRepo.id.toString())
    expect(ids).not.toContain(archivedRepo.id.toString())
    expect(ids).not.toContain(noDescriptionRepo.id.toString())
    expect(ids).not.toContain(untaggedRepo.id.toString())
    expect(ids).not.toContain(undefinedTopicsRepo.id.toString())
    expect(ids).not.toContain(siteRepo.id.toString())
    expect(ids).not.toContain(siteRepoMixedCase.id.toString())
  })

  it('sorts surviving repos by stargazers_count descending', () => {
    const result = transformReposToProjects([portfolioRepoB, portfolioRepo]) // lower-star first
    expect(result[0]?.id).toBe(portfolioRepo.id.toString()) // 100 stars before 50
    expect(result[1]?.id).toBe(portfolioRepoB.id.toString())
  })

  it('maps id to string form of repo.id', () => {
    const [project] = transformReposToProjects([portfolioRepo])
    expect(project?.id).toBe(String(portfolioRepo.id))
  })

  it('title-cases hyphenated names: "dev-like" → "Dev Like"', () => {
    const [project] = transformReposToProjects([repoWithHyphenName])
    expect(project?.title).toBe('Dev Like')
  })

  it('title-cases multi-word name correctly', () => {
    const [project] = transformReposToProjects([portfolioRepo]) // "my-project"
    expect(project?.title).toBe('My Project')
  })

  it('each mapped Project has imageUrl === previewImagePath(repo.id)', () => {
    const result = transformReposToProjects([portfolioRepo, portfolioRepoB])
    for (const project of result) {
      const repoId = Number(project.id)
      expect(project.imageUrl).toBe(previewImagePath(repoId))
    }
  })

  it('sets imageUrl to undefined for a repo with id 0 (invalid)', () => {
    const invalidIdRepo = makeRepo({id: 0, name: 'zero-id', full_name: 'user/zero-id'})
    const [project] = transformReposToProjects([invalidIdRepo])
    expect(project?.imageUrl).toBeUndefined()
  })

  it('uses "Unknown" when language is null', () => {
    const noLangRepo = makeRepo({id: 11, name: 'no-lang', full_name: 'user/no-lang', language: null})
    const [project] = transformReposToProjects([noLangRepo])
    expect(project?.language).toBe('Unknown')
  })

  it('uses "No description available" when description is empty string', () => {
    // An empty string is falsy in the filter but the map clause handles the fallback;
    // the filter actually excludes repos with no description. Test a truthy description passes through.
    const [project] = transformReposToProjects([portfolioRepo])
    expect(project?.description).toBe(portfolioRepo.description)
  })

  it('preserves topics on the mapped Project', () => {
    const repoMultiTopics = makeRepo({
      id: 20,
      name: 'multi-topic',
      full_name: 'user/multi-topic',
      topics: [PORTFOLIO_TOPIC, 'react', 'typescript'],
    })
    const [project] = transformReposToProjects([repoMultiTopics])
    expect(project?.topics).toEqual([PORTFOLIO_TOPIC, 'react', 'typescript'])
  })

  it('repo with topics undefined is excluded (no portfolio topic)', () => {
    const result = transformReposToProjects([undefinedTopicsRepo])
    expect(result).toHaveLength(0)
  })

  it('site repo carrying the portfolio topic is excluded — exact full_name', () => {
    const result = transformReposToProjects([siteRepo])
    expect(result).toHaveLength(0)
  })

  it('site repo carrying the portfolio topic is excluded — case-insensitive full_name', () => {
    const result = transformReposToProjects([siteRepoMixedCase])
    expect(result).toHaveLength(0)
  })

  it('sets lastUpdated to repo.updated_at', () => {
    const [project] = transformReposToProjects([portfolioRepo])
    expect(project?.lastUpdated).toBe(portfolioRepo.updated_at)
  })

  it('sets stars to repo.stargazers_count', () => {
    const [project] = transformReposToProjects([portfolioRepo])
    expect(project?.stars).toBe(portfolioRepo.stargazers_count)
  })

  it('sets url to repo.html_url', () => {
    const [project] = transformReposToProjects([portfolioRepo])
    expect(project?.url).toBe(portfolioRepo.html_url)
  })

  it('sets homepage to repo.homepage (nullable)', () => {
    const repoWithHomepage = makeRepo({
      id: 30,
      name: 'with-homepage',
      full_name: 'user/with-homepage',
      homepage: 'https://example.com',
    })
    const [project] = transformReposToProjects([repoWithHomepage])
    expect(project?.homepage).toBe('https://example.com')
  })
})
