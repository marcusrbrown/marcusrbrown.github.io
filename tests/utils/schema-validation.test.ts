/**
 * @vitest-environment happy-dom
 */

import type {ThemeExportData} from '../../src/types'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {sanitizeThemeData, THEME_EXPORT_VERSION, validateThemeExportData} from '../../src/utils/schema-validation'

describe('schema-validation utilities', () => {
  const validThemeExportData: ThemeExportData = {
    version: '1.0',
    theme: {
      id: 'test-theme',
      name: 'Test Theme',
      mode: 'dark',
      colors: {
        primary: '#2563eb',
        secondary: '#64748b',
        background: '#0f172a',
        surface: '#1e293b',
        text: '#f8fafc',
        textSecondary: '#cbd5e1',
        border: '#334155',
        accent: '#0ea5e9',
        success: '#10b981',
        warning: '#f59e0b',
        error: '#ef4444',
      },
    },
    exportedAt: '2025-01-01T00:00:00.000Z',
    exportedBy: 'mrbro.dev Theme Customizer',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('validateThemeExportData', () => {
    it('should validate correct theme export data', () => {
      const result = validateThemeExportData(validThemeExportData)

      expect(result.isValid).toBe(true)
      expect(result.errors).toEqual([])
    })

    it('should reject data missing required version', () => {
      const invalidData = {
        ...validThemeExportData,
      }
      delete (invalidData as any).version

      const result = validateThemeExportData(invalidData)

      expect(result.isValid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors.some(error => error.includes('version'))).toBe(true)
    })

    it('should reject data missing required theme', () => {
      const invalidData = {
        ...validThemeExportData,
      }
      delete (invalidData as any).theme

      const result = validateThemeExportData(invalidData)

      expect(result.isValid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors.some(error => error.includes('theme'))).toBe(true)
    })

    it('should reject theme with invalid mode', () => {
      const invalidData = {
        ...validThemeExportData,
        theme: {
          ...validThemeExportData.theme,
          mode: 'invalid-mode' as any,
        },
      }

      const result = validateThemeExportData(invalidData)

      expect(result.isValid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('should reject theme missing required colors', () => {
      const invalidData = {
        ...validThemeExportData,
        theme: {
          ...validThemeExportData.theme,
          colors: {
            primary: '#2563eb',
            // Missing other required colors
          },
        },
      }

      const result = validateThemeExportData(invalidData)

      expect(result.isValid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('should reject data with invalid exportedAt format', () => {
      const invalidData = {
        ...validThemeExportData,
        exportedAt: 'not-a-date',
      }

      const result = validateThemeExportData(invalidData)

      expect(result.isValid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('should handle null or undefined input', () => {
      expect(validateThemeExportData(null).isValid).toBe(false)
      expect(validateThemeExportData(undefined).isValid).toBe(false)
    })

    it('should handle non-object input', () => {
      expect(validateThemeExportData('string' as any).isValid).toBe(false)
      expect(validateThemeExportData(123 as any).isValid).toBe(false)
      expect(validateThemeExportData([] as any).isValid).toBe(false)
    })
  })

  describe('sanitizeThemeData', () => {
    it('should return sanitized data for valid input', () => {
      const result = sanitizeThemeData(validThemeExportData)

      expect(result).toEqual(validThemeExportData)
    })

    it('should return null for invalid input', () => {
      const invalidData = {
        version: '1.0.0',
        // Missing required theme property
      }

      const result = sanitizeThemeData(invalidData)

      expect(result).toBeNull()
    })

    it('should remove additional properties', () => {
      const dataWithExtra = {
        ...validThemeExportData,
        extraProperty: 'should be removed',
        theme: {
          ...validThemeExportData.theme,
          colors: {
            ...validThemeExportData.theme.colors,
            extraColor: '#extra',
          },
        },
      }

      const result = sanitizeThemeData(dataWithExtra)

      expect(result).toBeDefined()
      expect((result as any)?.extraProperty).toBeUndefined()
      expect((result as any)?.theme?.colors?.extraColor).toBeUndefined()
    })

    it('should handle null or undefined input', () => {
      expect(sanitizeThemeData(null)).toBeNull()
      expect(sanitizeThemeData(undefined)).toBeNull()
    })
  })

  describe('formatValidationErrors', () => {
    it('should handle validation errors correctly', () => {
      const invalidData = {
        version: 123, // Should be string
        theme: {
          id: 'test',
          name: 'Test',
          mode: 'dark',
          colors: {
            primary: 123, // Should be string
            secondary: '#64748b',
            background: '#0f172a',
            surface: '#1e293b',
            text: '#f8fafc',
            textSecondary: '#cbd5e1',
            border: '#334155',
            accent: '#0ea5e9',
            success: '#10b981',
            warning: '#f59e0b',
            error: '#ef4444',
          },
        },
        exportedAt: '2025-01-01T00:00:00.000Z',
        exportedBy: 'test',
      }

      const result = validateThemeExportData(invalidData)

      expect(result.isValid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors[0]).toContain('version')
    })

    it('should handle empty errors array', () => {
      const result = validateThemeExportData(validThemeExportData)

      expect(result.errors).toEqual([])
    })

    it('should handle complex validation errors', () => {
      const invalidData = {
        version: '1.0',
        theme: {
          id: 'test',
          name: 'Test',
          mode: 'invalid-mode', // Invalid mode
          colors: {
            primary: '#2563eb',
            // Missing many required colors
          },
        },
        exportedAt: 'invalid-date',
        exportedBy: 'test',
      }

      const result = validateThemeExportData(invalidData)

      expect(result.isValid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors.some(error => error.includes('mode') || error.includes('colors'))).toBe(true)
    })
  })

  describe('constants', () => {
    it('should export correct theme export version', () => {
      expect(THEME_EXPORT_VERSION).toBe('1.0')
    })
  })

  describe('integration tests', () => {
    it('should validate, sanitize, and format errors in sequence', () => {
      const invalidData = {
        version: 123, // Should be string
        theme: {
          id: 'test',
          name: 'Test',
          mode: 'dark',
          colors: {
            primary: 123, // Should be string
            secondary: '#64748b',
            background: '#0f172a',
            surface: '#1e293b',
            text: '#f8fafc',
            textSecondary: '#cbd5e1',
            border: '#334155',
            accent: '#0ea5e9',
            success: '#10b981',
            warning: '#f59e0b',
            error: '#ef4444',
          },
        },
        exportedAt: '2025-01-01T00:00:00.000Z',
        exportedBy: 'test',
      }

      // Validate should fail
      const validation = validateThemeExportData(invalidData)
      expect(validation.isValid).toBe(false)
      expect(validation.errors.length).toBeGreaterThan(0)

      // Sanitize should return null for invalid data
      const sanitized = sanitizeThemeData(invalidData)
      expect(sanitized).toBeNull()
    })

    it('should handle complex nested validation errors', () => {
      const complexInvalidData = {
        version: '1.0',
        theme: {
          id: 'test',
          name: 'Test',
          mode: 'invalid',
          colors: {
            // Missing many required colors
            primary: '#2563eb',
          },
        },
        exportedAt: 'invalid-date',
        exportedBy: 'test',
      }

      const validation = validateThemeExportData(complexInvalidData)
      expect(validation.isValid).toBe(false)
      expect(validation.errors.length).toBeGreaterThan(1)

      // Should have errors for multiple missing properties
      const errorString = validation.errors.join(' ')
      expect(errorString).toContain('colors')
    })
  })
})
