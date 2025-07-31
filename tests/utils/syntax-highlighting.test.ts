// mrbro.dev/tests/utils/syntax-highlighting.test.ts

import {afterEach, describe, expect, it} from 'vitest'
import {
  cleanupHighlighter,
  getSupportedLanguages,
  highlightCode,
  isLanguageSupported,
} from '../../src/utils/syntax-highlighting'

describe('syntax-highlighting utilities', () => {
  afterEach(() => {
    cleanupHighlighter()
  })

  describe('getSupportedLanguages', () => {
    it('should return an array of supported languages', () => {
      const languages = getSupportedLanguages()
      expect(languages).toBeInstanceOf(Array)
      expect(languages.length).toBeGreaterThan(0)
      expect(languages).toContain('typescript')
      expect(languages).toContain('javascript')
      expect(languages).toContain('json')
    })
  })

  describe('isLanguageSupported', () => {
    it('should return true for supported languages', () => {
      expect(isLanguageSupported('typescript')).toBe(true)
      expect(isLanguageSupported('javascript')).toBe(true)
      expect(isLanguageSupported('json')).toBe(true)
    })

    it('should return false for unsupported languages', () => {
      expect(isLanguageSupported('made-up-language')).toBe(false)
      expect(isLanguageSupported('')).toBe(false)
    })
  })

  describe('highlightCode', () => {
    it('should highlight simple TypeScript code', async () => {
      const code = 'const message: string = "Hello, World!"'
      const result = await highlightCode(code, 'typescript')

      expect(result).toContain('<pre')
      expect(result).toContain('<code')
      expect(result).toContain('const')
      expect(result).toContain('string')
      expect(result).toContain('Hello, World!')
    })

    it('should handle empty code', async () => {
      const result = await highlightCode('', 'typescript')
      expect(result).toContain('<pre')
      expect(result).toContain('<code')
    })

    it('should fall back to TypeScript for unsupported languages', async () => {
      const code = 'console.log("test")'
      const result = await highlightCode(code, 'unsupported-language' as any)

      expect(result).toContain('<pre')
      expect(result).toContain('<code')
      expect(result).toContain('console')
    })

    it('should respect theme parameter', async () => {
      const code = 'const test = true'
      const lightResult = await highlightCode(code, 'typescript', {theme: 'light'})
      const darkResult = await highlightCode(code, 'typescript', {theme: 'dark'})

      expect(lightResult).toContain('<pre')
      expect(darkResult).toContain('<pre')
      // Both should contain the code but may have different styling
      expect(lightResult).toContain('const')
      expect(darkResult).toContain('const')
    })

    it('should remove background when requested', async () => {
      const code = 'const test = true'
      const result = await highlightCode(code, 'typescript', {removeBackground: true})

      expect(result).toContain('<pre')
      expect(result).not.toMatch(/style="[^"]*background[^"]*"/)
    })
  })
})
