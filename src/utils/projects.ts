/**
 * Portfolio project utilities.
 *
 * Defines the GitHub repo shape, curation constants, predicates, and the
 * repo→Project transform shared by the build-time generator script and the
 * runtime hook so the two cannot drift independently.
 */

import type {Project} from '../types'
import {previewImagePath} from './preview-image-path'

/** Full GitHub Repos API shape needed to produce a `Project`. */
export interface GitHubRepo {
  id: number
  name: string
  full_name: string
  description: string | null
  html_url: string
  language: string | null
  stargazers_count: number
  fork: boolean
  archived: boolean
  created_at: string
  updated_at: string
  homepage: string | null
  topics?: string[]
}

// Curation signal: only repos carrying this GitHub topic appear in the feed.
// Feature/unfeature a repo via `gh repo edit <repo> --add-topic portfolio`.
export const PORTFOLIO_TOPIC = 'portfolio'

// The site's own repo is excluded from its own feed even if tagged, matched
// by case-normalized `full_name` (not bare `name`, which breaks on rename or
// org move).
export const SITE_REPO_FULL_NAME = 'marcusrbrown/marcusrbrown.github.io'

/** Returns true when `repo` carries the portfolio curation topic. */
export const isPortfolioTagged = (repo: GitHubRepo): boolean => (repo.topics ?? []).includes(PORTFOLIO_TOPIC)

/** Returns true when `repo` is the site's own repository (excluded from its own feed). */
export const isSiteRepo = (repo: GitHubRepo): boolean => repo.full_name.toLowerCase() === SITE_REPO_FULL_NAME

/**
 * Filters and transforms a raw GitHub repo listing into portfolio `Project[]`.
 *
 * Behaviour (verbatim from `UseGitHub.ts`):
 * - Exclude: forks, archived, no-description, untagged, and the site repo itself.
 * - Sort: by `stargazers_count` descending.
 * - Map: produce a `Project` with `imageUrl` baked via `previewImagePath(repo.id)`.
 */
export const transformReposToProjects = (repos: GitHubRepo[]): Project[] =>
  repos
    .filter(repo => !repo.fork && !repo.archived && repo.description && isPortfolioTagged(repo) && !isSiteRepo(repo))
    .sort((a, b) => b.stargazers_count - a.stargazers_count)
    .map(repo => ({
      id: repo.id.toString(),
      title: repo.name
        .replaceAll('-', ' ')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' '),
      description: repo.description || 'No description available',
      url: repo.html_url,
      language: repo.language || 'Unknown',
      stars: repo.stargazers_count,
      homepage: repo.homepage,
      topics: repo.topics || [],
      lastUpdated: repo.updated_at,
      imageUrl: previewImagePath(repo.id),
    }))
