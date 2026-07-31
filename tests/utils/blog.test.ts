import type {BlogPostFull} from '../../src/types'
import {readFileSync} from 'node:fs'
import {dirname, join, resolve} from 'node:path'
import {describe, expect, it} from 'vitest'
import {
  detectSlugCollisions,
  isPathSafeSlug,
  isSlugResolutionError,
  resolveSlug,
  slugify,
  toBlogPostMeta,
} from '../../src/utils/blog'

const PROJECT_ROOT = resolve(__dirname, '../..')

/** Extracts static and dynamic import/export/re-export module specifiers from a TS/TSX source file. */
const extractSpecifiers = (source: string): string[] => {
  const specifiers: string[] = []
  const patterns = [
    /\b(?:import|export)[\s\S]*?from\s+['"]([^'"]+)['"]/g,
    /\bimport\s+['"]([^'"]+)['"]/g,
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (match[1]) specifiers.push(match[1])
    }
  }
  return specifiers
}

/** Resolves a relative import specifier to a file on disk (project convention: no barrel/index files). */
const resolveRelative = (fromFile: string, specifier: string): string | null => {
  const base = resolve(dirname(fromFile), specifier)
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`]) {
    try {
      readFileSync(candidate, 'utf8')
      return candidate
    } catch {
      continue
    }
  }
  return null
}

/**
 * Walks the first-party (relative-import-only) module graph reachable from `entry`,
 * collecting every bare (non-relative) package specifier encountered anywhere in that
 * graph. This proves whether a package is statically reachable from a given entry
 * point without needing to run a full bundler build — the fastest, most precise
 * executable signal for "does importing this module pull in a package that uses
 * `new Function` (blocked by a strict `script-src` CSP with no `unsafe-eval`)".
 */
const collectBarePackageImports = (entry: string): Set<string> => {
  const visited = new Set<string>()
  const bareImports = new Set<string>()
  const stack = [entry]

  while (stack.length > 0) {
    const file = stack.pop()
    if (!file || visited.has(file)) continue
    visited.add(file)

    const source = readFileSync(file, 'utf8')
    for (const specifier of extractSpecifiers(source)) {
      if (specifier.startsWith('.')) {
        const resolved = resolveRelative(file, specifier)
        if (resolved) stack.push(resolved)
      } else {
        bareImports.add(specifier)
      }
    }
  }

  return bareImports
}

describe('src/utils/blog.ts module boundary (browser entry safety)', () => {
  it('does not statically reach ajv/ajv-formats — those use `new Function`, blocked by strict-CSP script-src with no unsafe-eval', () => {
    const entry = join(PROJECT_ROOT, 'src/utils/blog.ts')
    const bareImports = collectBarePackageImports(entry)

    expect(bareImports.has('ajv')).toBe(false)
    expect(bareImports.has('ajv-formats')).toBe(false)
  })
})

describe('blog utilities', () => {
  describe('slugify', () => {
    it('produces a URL-safe slug from unicode/punctuation titles', () => {
      expect(slugify('Café: A Résumé & Étude!')).toBe('cafe-a-resume-etude')
      expect(slugify('  Leading and trailing  ')).toBe('leading-and-trailing')
      expect(slugify('Multiple---Hyphens')).toBe('multiple-hyphens')
    })
  })

  describe('isPathSafeSlug', () => {
    it('rejects path traversal, slashes, empty strings, and reserved names', () => {
      expect(isPathSafeSlug('../escape')).toBe(false)
      expect(isPathSafeSlug('a/b')).toBe(false)
      expect(isPathSafeSlug('.')).toBe(false)
      expect(isPathSafeSlug('..')).toBe(false)
      expect(isPathSafeSlug('%2e%2e')).toBe(false)
      expect(isPathSafeSlug('a/./b')).toBe(false)
      expect(isPathSafeSlug('')).toBe(false)
      expect(isPathSafeSlug('blog')).toBe(false)
    })

    it('accepts normal slugs', () => {
      expect(isPathSafeSlug('hello-world')).toBe(true)
    })
  })

  describe('resolveSlug', () => {
    it('derives a slug from the title when no explicit slug is given', () => {
      const result = resolveSlug({title: 'Hello World'})
      expect(result).toBe('hello-world')
    })

    it('lets an explicit slug field win over the derived title slug', () => {
      const result = resolveSlug({title: 'Hello World', slug: 'custom-slug'})
      expect(result).toBe('custom-slug')
    })

    it('returns an error for a path-unsafe explicit slug', () => {
      const result = resolveSlug({title: 'Whatever', slug: '../escape'})
      expect(isSlugResolutionError(result)).toBe(true)
      if (isSlugResolutionError(result)) {
        expect(result.slug).toBe('../escape')
        expect(result.reason).toContain('../escape')
      }
    })

    it('returns an error for a reserved slug derived from the title', () => {
      const result = resolveSlug({title: 'Blog'})
      expect(isSlugResolutionError(result)).toBe(true)
    })
  })

  describe('detectSlugCollisions', () => {
    it('reports no collisions for unique slugs', () => {
      const collisions = detectSlugCollisions([
        {slug: 'post-one', identifier: 'gist-1'},
        {slug: 'post-two', identifier: 'gist-2'},
      ])
      expect(collisions).toEqual([])
    })

    it('names both posts sharing a duplicate slug', () => {
      const collisions = detectSlugCollisions([
        {slug: 'post-one', identifier: 'gist-1'},
        {slug: 'post-one', identifier: 'gist-2'},
        {slug: 'post-two', identifier: 'gist-3'},
      ])
      expect(collisions).toEqual([{slug: 'post-one', identifiers: ['gist-1', 'gist-2']}])
    })
  })

  describe('toBlogPostMeta', () => {
    it('narrows a full post down to card-facing meta', () => {
      const post: BlogPostFull = {
        slug: 'hello-world',
        frontmatter: {
          title: 'Hello World',
          date: '2026-07-17',
          summary: 'A short summary.',
          tags: ['tag-a', 'tag-b'],
        },
        html: '<p>Body</p>',
        gistId: 'gist-1',
        gistUrl: 'https://gist.github.com/marcusrbrown/gist-1',
        gistUpdatedAt: '2026-07-17T00:00:00.000Z',
      }

      expect(toBlogPostMeta(post)).toEqual({
        slug: 'hello-world',
        title: 'Hello World',
        date: '2026-07-17',
        summary: 'A short summary.',
        tags: ['tag-a', 'tag-b'],
      })
    })
  })
})
