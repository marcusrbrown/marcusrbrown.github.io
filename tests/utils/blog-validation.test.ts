import type {BlogFrontmatter} from '../../src/types'
import {describe, expect, it} from 'vitest'
import {isValidBlogFrontmatter, validateBlogFrontmatter} from '../../src/utils/blog-validation'

describe('blog-validation utilities', () => {
  const validFrontmatter: BlogFrontmatter = {
    title: 'Hello World',
    date: '2026-07-17',
    summary: 'A short summary of the post.',
  }

  describe('validateBlogFrontmatter / isValidBlogFrontmatter', () => {
    it('accepts valid frontmatter', () => {
      const result = validateBlogFrontmatter(validFrontmatter)
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value).toEqual(validFrontmatter)
      expect(isValidBlogFrontmatter(validFrontmatter)).toBe(true)
    })

    it('rejects frontmatter missing title, date, and summary', () => {
      const result = validateBlogFrontmatter({})
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.errors.some(e => e.includes('title'))).toBe(true)
        expect(result.errors.some(e => e.includes('date'))).toBe(true)
        expect(result.errors.some(e => e.includes('summary'))).toBe(true)
      }
    })

    it('rejects a malformed date string without crashing', () => {
      const result = validateBlogFrontmatter({
        title: 'Post',
        date: 'not-a-date',
        summary: 'Summary',
      })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.errors.some(e => e.toLowerCase().includes('date'))).toBe(true)
    })

    it('rejects non-object input without crashing', () => {
      expect(validateBlogFrontmatter(null).ok).toBe(false)
      expect(validateBlogFrontmatter('nope').ok).toBe(false)
      expect(validateBlogFrontmatter(42).ok).toBe(false)
    })
  })
})
