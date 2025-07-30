/**
 * Tests for theme validation and sanitization utilities
 */

import type {Theme, ThemeColors} from '../../src/types'
import {describe, expect, it} from 'vitest'
import {
  createValidatedTheme,
  getContrastRatio,
  hexToRgb,
  hslToRgb,
  isValidColorValue,
  rgbToHex,
  rgbToHsl,
  sanitizeColorValue,
  sanitizeTheme,
  validateColorContrast,
  validateTheme,
  validateThemeAccessibility,
  validateThemeColors,
  validateThemeMetadata,
} from '../../src/utils/theme-validation'

describe('Color Value Validation', () => {
  it('should validate hex colors correctly', () => {
    expect(isValidColorValue('#fff')).toBe(true)
    expect(isValidColorValue('#ffffff')).toBe(true)
    expect(isValidColorValue('#FF00FF00')).toBe(true)
    expect(isValidColorValue('#invalid')).toBe(false)
    expect(isValidColorValue('#gg')).toBe(false)
  })

  it('should validate RGB colors correctly', () => {
    expect(isValidColorValue('rgb(255, 255, 255)')).toBe(true)
    expect(isValidColorValue('rgba(255, 255, 255, 0.5)')).toBe(true)
    expect(isValidColorValue('rgb(256, 255, 255)')).toBe(false) // Out of range
    expect(isValidColorValue('rgb(0, 0, 0)')).toBe(true)
    expect(isValidColorValue('rgb(100, 150, 200)')).toBe(true)
  })

  it('should validate HSL colors correctly', () => {
    expect(isValidColorValue('hsl(0, 100%, 50%)')).toBe(true)
    expect(isValidColorValue('hsla(0, 100%, 50%, 0.5)')).toBe(true)
    expect(isValidColorValue('hsl(invalid)')).toBe(false)
  })

  it('should validate named colors correctly', () => {
    expect(isValidColorValue('red')).toBe(true)
    expect(isValidColorValue('transparent')).toBe(true)
    expect(isValidColorValue('currentColor')).toBe(true) // Case insensitive
    expect(isValidColorValue('currentcolor')).toBe(true) // Normalized to lowercase
    expect(isValidColorValue('invalidcolor')).toBe(false)
  })

  it('should sanitize potentially dangerous color values', () => {
    expect(sanitizeColorValue('#fff')).toBe('#fff')
    expect(sanitizeColorValue('<script>alert("xss")</script>')).toBe(null)
    expect(sanitizeColorValue('#ff<>ff')).toBe(null) // Should fail validation after sanitization
  })
})

describe('Color Conversion', () => {
  it('should convert hex to RGB correctly', () => {
    const rgb = hexToRgb('#ff0000')
    expect(rgb).toEqual({r: 255, g: 0, b: 0})

    const rgb3 = hexToRgb('#f00')
    expect(rgb3).toEqual({r: 255, g: 0, b: 0})

    expect(hexToRgb('invalid')).toBe(null)
  })

  it('should convert RGB to hex correctly', () => {
    const hex = rgbToHex({r: 255, g: 0, b: 0})
    expect(hex).toBe('#ff0000')

    // Should clamp values
    const hexClamped = rgbToHex({r: 300, g: -10, b: 128})
    expect(hexClamped).toBe('#ff0080')
  })

  it('should convert HSL to RGB correctly', () => {
    const rgb = hslToRgb({h: 0, s: 100, l: 50})
    expect(rgb).toEqual({r: 255, g: 0, b: 0})

    const rgbGray = hslToRgb({h: 0, s: 0, l: 50})
    expect(rgbGray).toEqual({r: 128, g: 128, b: 128})
  })

  it('should convert RGB to HSL correctly', () => {
    const hsl = rgbToHsl({r: 255, g: 0, b: 0})
    expect(hsl.h).toBe(0)
    expect(hsl.s).toBe(100)
    expect(hsl.l).toBe(50)
  })
})

describe('Color Contrast Validation', () => {
  it('should calculate contrast ratio correctly', () => {
    const ratio = getContrastRatio('#000000', '#ffffff')
    expect(ratio).toBe(21) // Maximum contrast

    const lowContrast = getContrastRatio('#888888', '#999999')
    expect(lowContrast).toBeLessThan(4.5)
  })

  it('should validate WCAG contrast standards', () => {
    const highContrast = validateColorContrast('#000000', '#ffffff')
    expect(highContrast.meetsAA).toBe(true)
    expect(highContrast.meetsAAA).toBe(true)
    expect(highContrast.grade).toBe('AAA')

    const lowContrast = validateColorContrast('#888888', '#999999')
    expect(lowContrast.meetsAA).toBe(false)
    expect(lowContrast.grade).toBe('Fail')
  })
})

describe('Theme Validation', () => {
  const validColors: ThemeColors = {
    primary: '#2563eb',
    secondary: '#64748b',
    accent: '#f59e0b',
    background: '#ffffff',
    surface: '#f8fafc',
    text: '#1e293b',
    textSecondary: '#64748b',
    border: '#e2e8f0',
    error: '#dc2626',
    warning: '#f59e0b',
    success: '#16a34a',
  }

  const validTheme: Theme = {
    id: 'test-theme',
    name: 'Test Theme',
    mode: 'light',
    colors: validColors,
  }

  it('should validate theme colors correctly', () => {
    expect(validateThemeColors(validColors)).toBe(true)
    expect(validateThemeColors({primary: '#invalid'})).toBe(false)
    expect(validateThemeColors(null)).toBe(false)
  })

  it('should validate theme metadata correctly', () => {
    const validMetadata = {
      id: 'test',
      name: 'Test Theme',
      description: 'A test theme',
      author: 'Test Author',
    }

    expect(validateThemeMetadata(validMetadata)).toBe(true)
    expect(validateThemeMetadata({id: '', name: 'Test'})).toBe(false) // Empty ID
    expect(validateThemeMetadata({id: 'test'})).toBe(false) // Missing name
  })

  it('should validate complete theme correctly', () => {
    expect(validateTheme(validTheme)).toBe(true)
    expect(validateTheme({...validTheme, mode: 'invalid'})).toBe(false)
    expect(validateTheme({...validTheme, colors: null})).toBe(false)
  })

  it('should sanitize theme correctly', () => {
    const unsafeTheme = {
      ...validTheme,
      name: 'Test<script>alert("xss")</script>Theme',
      description: 'A theme with <dangerous> content',
    }

    const sanitized = sanitizeTheme(unsafeTheme)
    expect(sanitized).not.toBe(null)
    expect(sanitized?.name).toBe('Testscriptalertxss/scriptTheme')
    expect(sanitized?.description).toBe('A theme with dangerous content')
  })

  it('should reject invalid themes during sanitization', () => {
    const invalidTheme = {
      id: 'test',
      name: 'Test',
      mode: 'light',
      colors: {primary: 'invalid-color'},
    }

    expect(sanitizeTheme(invalidTheme)).toBe(null)
  })
})

describe('Theme Accessibility Validation', () => {
  const accessibleTheme: Theme = {
    id: 'accessible-theme',
    name: 'Accessible Theme',
    mode: 'light',
    colors: {
      primary: '#2563eb',
      secondary: '#64748b',
      accent: '#f59e0b',
      background: '#ffffff',
      surface: '#f8fafc',
      text: '#1e293b', // High contrast with background
      textSecondary: '#475569', // Good contrast with background
      border: '#e2e8f0',
      error: '#dc2626',
      warning: '#f59e0b',
      success: '#16a34a',
    },
  }

  const inaccessibleTheme: Theme = {
    ...accessibleTheme,
    colors: {
      ...accessibleTheme.colors,
      text: '#cccccc', // Low contrast with white background
    },
  }

  it('should identify accessible themes', () => {
    const result = validateThemeAccessibility(accessibleTheme)
    expect(result.isAccessible).toBe(true)
    expect(result.issues).toHaveLength(0)
  })

  it('should identify accessibility issues', () => {
    const result = validateThemeAccessibility(inaccessibleTheme)
    expect(result.isAccessible).toBe(false)
    expect(result.issues.length).toBeGreaterThan(0)
  })
})

describe('Theme Creation with Validation', () => {
  const fallbackTheme: Theme = {
    id: 'fallback',
    name: 'Fallback Theme',
    mode: 'light',
    colors: {
      primary: '#000000',
      secondary: '#666666',
      accent: '#0066cc',
      background: '#ffffff',
      surface: '#f5f5f5',
      text: '#000000',
      textSecondary: '#666666',
      border: '#cccccc',
      error: '#cc0000',
      warning: '#ff6600',
      success: '#00cc00',
    },
  }

  it('should create validated theme with valid input', () => {
    const input = {
      id: 'new-theme',
      name: 'New Theme',
      mode: 'dark' as const,
      colors: {
        primary: '#3b82f6',
        secondary: '#6b7280',
        accent: '#10b981',
        background: '#111827',
        surface: '#1f2937',
        text: '#f9fafb',
        textSecondary: '#d1d5db',
        border: '#374151',
        error: '#ef4444',
        warning: '#f59e0b',
        success: '#10b981',
      },
    }

    const {theme, warnings} = createValidatedTheme(input, fallbackTheme)
    expect(theme.id).toBe('new-theme')
    expect(theme.name).toBe('New Theme')
    expect(warnings).toHaveLength(0)
  })

  it('should use fallbacks for invalid values', () => {
    const input = {
      id: '', // Invalid empty ID
      name: 'Valid Name',
      colors: {
        primary: 'invalid-color',
        secondary: '#666666',
        accent: '#0066cc',
        background: '#ffffff',
        surface: '#f5f5f5',
        text: '#000000',
        textSecondary: '#666666',
        border: '#cccccc',
        error: '#cc0000',
        warning: '#ff6600',
        success: '#00cc00',
      },
    }

    const {theme, warnings} = createValidatedTheme(input, fallbackTheme)
    expect(theme.id).toBe('fallback') // Should use fallback
    expect(theme.name).toBe('Valid Name') // Should use valid input
    expect(warnings.length).toBeGreaterThan(0)
    expect(warnings).toContain('Invalid or missing theme ID, using fallback')
  })
})
