/**
 * Tests for WCAG 2.1 AA contrast validation implementation
 */

import type {Theme} from '../../src/types'
import {describe, expect, it} from 'vitest'

import {validateColorContrast, validateThemeAccessibility} from '../../src/utils/theme-validation'

describe('WCAG 2.1 AA Contrast Validation', () => {
  const accessibleTheme: Theme = {
    id: 'accessible-theme',
    name: 'Accessible Theme',
    mode: 'light',
    colors: {
      primary: '#2563eb',
      secondary: '#64748b',
      accent: '#0ea5e9',
      background: '#ffffff',
      surface: '#f8fafc',
      text: '#0f172a', // High contrast on white
      textSecondary: '#475569', // Good contrast on white
      border: '#e2e8f0',
      error: '#dc2626',
      warning: '#d97706',
      success: '#16a34a',
    },
  }

  const inaccessibleTheme: Theme = {
    ...accessibleTheme,
    colors: {
      ...accessibleTheme.colors,
      text: '#cccccc', // Low contrast on white background
      textSecondary: '#e0e0e0', // Very low contrast
    },
  }

  it('should validate accessible theme as meeting WCAG AA standards', () => {
    const result = validateThemeAccessibility(accessibleTheme)

    expect(result.isAccessible).toBe(true)
    expect(result.issues).toHaveLength(0)
  })

  it('should identify inaccessible theme as having contrast issues', () => {
    const result = validateThemeAccessibility(inaccessibleTheme)

    expect(result.isAccessible).toBe(false)
    expect(result.issues.length).toBeGreaterThan(0)

    // Should identify text on background issues
    const textOnBackgroundIssue = result.issues.find(
      issue => issue.pair[0] === 'text' && issue.pair[1] === 'background',
    )
    expect(textOnBackgroundIssue).toBeDefined()
    expect(textOnBackgroundIssue?.contrast.meetsAA).toBe(false)
  })

  it('should calculate correct contrast ratios', () => {
    // High contrast: black on white
    const highContrast = validateColorContrast('#000000', '#ffffff')
    expect(highContrast.ratio).toBe(21) // Maximum contrast
    expect(highContrast.meetsAA).toBe(true)
    expect(highContrast.meetsAAA).toBe(true)
    expect(highContrast.grade).toBe('AAA')

    // Low contrast: light gray on white
    const lowContrast = validateColorContrast('#cccccc', '#ffffff')
    expect(lowContrast.ratio).toBeLessThan(4.5)
    expect(lowContrast.meetsAA).toBe(false)
    expect(lowContrast.grade).toBe('Fail')
  })

  it('should check all critical color combinations', () => {
    const result = validateThemeAccessibility(inaccessibleTheme)

    // Should check text on background
    const textOnBackground = result.issues.find(issue => issue.pair[0] === 'text' && issue.pair[1] === 'background')
    expect(textOnBackground).toBeDefined()

    // Should check text on surface
    const textOnSurface = result.issues.find(issue => issue.pair[0] === 'text' && issue.pair[1] === 'surface')
    expect(textOnSurface).toBeDefined()
  })
})
