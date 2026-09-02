/**
 * @vitest-environment happy-dom
 */

import type {ThemeExportData} from '../../src/types'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {
  getValidationDetails,
  isValidTheme,
  isValidThemeExportData,
  sanitizeThemeData,
  THEME_EXPORT_VERSION,
  validateThemeExportData,
  validateThemeSchema,
} from '../../src/utils/schema-validation'

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

    it('should reject unknown fields and name them in the errors', () => {
      const dataWithUnknownField = {
        ...validThemeExportData,
        maliciousField: 'should be rejected',
      }

      const result = validateThemeExportData(dataWithUnknownField)

      expect(result.isValid).toBe(false)
      expect(result.errors.some(error => error.includes('maliciousField'))).toBe(true)
    })

    it('should not mutate input data', () => {
      const dataWithUnknownField = {
        ...validThemeExportData,
        maliciousField: 'should remain untouched',
      }
      const before = JSON.stringify(dataWithUnknownField)

      validateThemeExportData(dataWithUnknownField)

      expect(JSON.stringify(dataWithUnknownField)).toBe(before)
    })

    it('should reject data missing required version', () => {
      const invalidData = {
        ...validThemeExportData,
      }
      delete (invalidData as Record<string, unknown>).version

      const result = validateThemeExportData(invalidData)

      expect(result.isValid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors.some(error => error.includes('version'))).toBe(true)
    })

    it('should reject data missing required theme', () => {
      const invalidData = {
        ...validThemeExportData,
      }
      delete (invalidData as Record<string, unknown>).theme

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
          mode: 'invalid-mode' as unknown as 'dark',
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
      expect(validateThemeExportData('string' as unknown).isValid).toBe(false)
      expect(validateThemeExportData(123 as unknown).isValid).toBe(false)
      expect(validateThemeExportData([] as unknown).isValid).toBe(false)
    })
  })

  describe('validateThemeSchema', () => {
    it('should validate a valid theme object', () => {
      const result = validateThemeSchema(validThemeExportData.theme)
      expect(result.isValid).toBe(true)
    })

    it('should reject a theme with missing required fields', () => {
      const result = validateThemeSchema({id: 'only-id'})
      expect(result.isValid).toBe(false)
    })

    it('should reject null', () => {
      expect(validateThemeSchema(null).isValid).toBe(false)
    })

    it('should reject a theme with invalid color format', () => {
      const result = validateThemeSchema({
        ...validThemeExportData.theme,
        colors: {...validThemeExportData.theme.colors, primary: 123},
      })
      expect(result.isValid).toBe(false)
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
      expect((result as unknown as Record<string, unknown>)?.extraProperty).toBeUndefined()
      expect(
        (result as unknown as {theme?: {colors?: Record<string, unknown>}})?.theme?.colors?.extraColor,
      ).toBeUndefined()
    })

    it('should strip unknown fields while preserving schema-defined values', () => {
      const dataWithExtra = {
        ...validThemeExportData,
        extraProperty: 'should be removed',
      }

      const result = sanitizeThemeData(dataWithExtra)

      expect(result).toEqual(validThemeExportData)
    })

    it('should not mutate its input while sanitizing', () => {
      const dataWithExtra = {
        ...validThemeExportData,
        extraProperty: 'should be removed',
      }
      const before = JSON.stringify(dataWithExtra)

      sanitizeThemeData(dataWithExtra)

      expect(JSON.stringify(dataWithExtra)).toBe(before)
    })

    it('should handle null or undefined input', () => {
      expect(sanitizeThemeData(null)).toBeNull()
      expect(sanitizeThemeData(undefined)).toBeNull()
    })
  })

  describe('getValidationDetails', () => {
    it('should return isValid true and sanitizedData for valid input', () => {
      const result = getValidationDetails(validThemeExportData)
      expect(result.isValid).toBe(true)
      expect(result.sanitizedData).not.toBeNull()
    })

    it('should return isValid false and no sanitizedData for invalid input', () => {
      const result = getValidationDetails({not: 'valid'})
      expect(result.isValid).toBe(false)
      expect(result.sanitizedData).toBeNull()
    })

    it('should emit a warning when theme description is missing', () => {
      const result = getValidationDetails(validThemeExportData)
      expect(result.warnings.some(w => w.includes('description'))).toBe(true)
    })

    it('should emit a warning when theme author is missing', () => {
      const result = getValidationDetails(validThemeExportData)
      expect(result.warnings.some(w => w.includes('author'))).toBe(true)
    })

    it('should emit a warning when theme version is missing', () => {
      const result = getValidationDetails(validThemeExportData)
      expect(result.warnings.some(w => w.includes('version'))).toBe(true)
    })

    it('should not emit optional-field warnings when all optional fields are present', () => {
      const fullData: ThemeExportData = {
        ...validThemeExportData,
        theme: {
          ...validThemeExportData.theme,
          description: 'A nice theme',
          author: 'Test Author',
          version: '1.0.0',
        },
      }
      const result = getValidationDetails(fullData)
      expect(result.warnings).toHaveLength(0)
    })
  })

  describe('isValidThemeExportData', () => {
    it('should return true for valid ThemeExportData', () => {
      expect(isValidThemeExportData(validThemeExportData)).toBe(true)
    })

    it('should return false for invalid data', () => {
      expect(isValidThemeExportData({invalid: true})).toBe(false)
    })

    it('should return false for null', () => {
      expect(isValidThemeExportData(null)).toBe(false)
    })
  })

  describe('isValidTheme', () => {
    it('should return true for a valid theme object', () => {
      expect(isValidTheme(validThemeExportData.theme)).toBe(true)
    })

    it('should return false for an invalid theme', () => {
      expect(isValidTheme({id: 'no-colors'})).toBe(false)
    })

    it('should return false for null', () => {
      expect(isValidTheme(null)).toBe(false)
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
