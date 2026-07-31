/**
 * Blog content model utilities.
 *
 * Pure, browser-safe slug helpers (derivation, path-safety rejection, collision
 * detection) and card-facing meta narrowing shared by the refresh script, prerender
 * script, and client-side blog pages. Ajv-backed frontmatter validation lives in
 * `src/utils/blog-validation.ts` — a Node/build-time-only module — because Ajv's
 * `ajv.compile()` runs `new Function` at module scope, which a strict `script-src`
 * CSP with no `unsafe-eval` blocks in the browser. This module must not import
 * `ajv`/`ajv-formats`, directly or transitively (see the module-boundary regression
 * test in `tests/utils/blog.test.ts`).
 */

import type {BlogFrontmatter, BlogPostFull} from '../types'

/** Route segments reserved by the app shell; a derived/explicit slug may not collide with these. */
export const RESERVED_SLUGS: readonly string[] = ['blog']

/**
 * Converts a title into a URL-safe slug: lowercased, unicode-normalized (diacritics
 * stripped), non-alphanumeric runs collapsed to single hyphens, leading/trailing
 * hyphens trimmed.
 */
export const slugify = (title: string): string => {
  return title
    .normalize('NFKD')
    .replaceAll(/[\u0300-\u036F]/g, '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
}

/**
 * Rejects slugs that are unsafe as a filesystem/route path segment: empty, dot/encoded
 * segments, separators, normalization changes, or a reserved app route collision.
 */
export const isPathSafeSlug = (slug: string): boolean => {
  if (slug.length === 0 || slug === '.' || slug === '..') {
    return false
  }
  if (slug.includes('/') || slug.includes('\\') || /%2e|%2f/i.test(slug)) {
    return false
  }
  const segments = slug.split('/')
  if (segments.some(segment => segment === '.' || segment === '..') || slug.normalize() !== slug) {
    return false
  }
  try {
    if (new URL(`https://example.test/${slug}`).pathname !== `/${slug}`) {
      return false
    }
  } catch {
    return false
  }
  if (RESERVED_SLUGS.includes(slug)) {
    return false
  }
  return true
}

export interface SlugResolutionError {
  slug: string
  reason: string
}

/**
 * Resolves the slug for a post: an explicit `frontmatter.slug` wins over a derived
 * slug from the title. Returns an error (rather than throwing) when the resolved
 * slug is path-unsafe, so callers can aggregate validation failures.
 */
export const resolveSlug = (frontmatter: Pick<BlogFrontmatter, 'slug' | 'title'>): string | SlugResolutionError => {
  const candidate = frontmatter.slug && frontmatter.slug.length > 0 ? frontmatter.slug : slugify(frontmatter.title)

  if (!isPathSafeSlug(candidate)) {
    return {slug: candidate, reason: `Slug "${candidate}" is not a valid path segment`}
  }

  return candidate
}

export const isSlugResolutionError = (value: string | SlugResolutionError): value is SlugResolutionError => {
  return typeof value !== 'string'
}

export interface SlugCollision {
  slug: string
  /** Identifiers (e.g. gist IDs or slugs) of the posts sharing this slug. */
  identifiers: string[]
}

/**
 * Detects slug collisions across a set of posts. Each entry must carry a `slug` and
 * an `identifier` used to name the conflicting posts in error output.
 */
export const detectSlugCollisions = (entries: {slug: string; identifier: string}[]): SlugCollision[] => {
  const bySlug = new Map<string, string[]>()

  for (const entry of entries) {
    const identifiers = bySlug.get(entry.slug) ?? []
    identifiers.push(entry.identifier)
    bySlug.set(entry.slug, identifiers)
  }

  const collisions: SlugCollision[] = []
  for (const [slug, identifiers] of bySlug) {
    if (identifiers.length > 1) {
      collisions.push({slug, identifiers})
    }
  }

  return collisions
}

/** Narrows a full snapshot post down to the card-facing meta subset. */
export const toBlogPostMeta = (post: BlogPostFull) => {
  return {
    slug: post.slug,
    title: post.frontmatter.title,
    date: post.frontmatter.date,
    summary: post.frontmatter.summary,
    tags: post.frontmatter.tags,
  }
}
