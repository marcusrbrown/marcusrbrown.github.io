/**
 * Theme Export/Import Utilities
 *
 * Utilities for exporting themes to JSON files and importing themes from JSON files.
 * Includes validation, error handling, and proper browser file handling.
 */

import type {Theme, ThemeExportData} from '../types'
import {sanitizeTheme, validateTheme} from './theme-validation'

/**
 * Exports a theme as a downloadable JSON file
 */
export const exportTheme = (theme: Theme, filename?: string): void => {
  const sanitized = sanitizeTheme(theme)
  if (!sanitized) {
    throw new Error('Invalid theme provided for export')
  }

  const exportData: ThemeExportData = {
    version: '1.0',
    theme: {
      ...sanitized,
    },
    exportedAt: new Date().toISOString(),
    exportedBy: 'mrbro.dev Theme Customizer',
  }

  const jsonString = JSON.stringify(exportData, null, 2)
  const blob = new Blob([jsonString], {type: 'application/json'})
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = filename || `${sanitized.name.toLowerCase().replaceAll(/\s+/g, '-')}-theme.json`

  // Append to body, click, and remove
  document.body.append(link)
  link.click()
  link.remove()

  // Clean up the URL
  URL.revokeObjectURL(url)
}

/**
 * Imports a theme from a JSON file
 */
export const importTheme = async (file: File): Promise<Theme> => {
  try {
    const content = await file.text()
    const exportData = JSON.parse(content) as ThemeExportData

    // Validate the export data structure
    if (!exportData.theme) {
      throw new Error('Invalid theme file: missing theme data')
    }

    if (!exportData.version) {
      throw new Error('Invalid theme file: missing version information')
    }

    // Validate and sanitize the theme
    const sanitized = sanitizeTheme(exportData.theme)
    if (!sanitized) {
      throw new Error('Invalid theme data in file')
    }

    const isValid = validateTheme(sanitized)
    if (!isValid) {
      throw new Error('Theme validation failed')
    }

    return sanitized
  } catch (error) {
    throw error instanceof Error ? error : new Error('Failed to parse theme file')
  }
}

/**
 * Validates a file before import
 */
export const validateThemeFile = (file: File): string[] => {
  const errors: string[] = []

  // Check file type
  if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
    errors.push('File must be a JSON file')
  }

  // Check file size (max 1MB for themes)
  const maxSize = 1024 * 1024 // 1MB
  if (file.size > maxSize) {
    errors.push('File is too large (max 1MB)')
  }

  // Check file size (min size for valid JSON)
  if (file.size < 10) {
    errors.push('File is too small to be a valid theme')
  }

  return errors
}

/**
 * Creates a downloadable JSON string for a theme
 */
export const createThemeJSON = (theme: Theme): string => {
  const sanitized = sanitizeTheme(theme)
  if (!sanitized) {
    throw new Error('Invalid theme provided')
  }

  const exportData: ThemeExportData = {
    version: '1.0',
    theme: {
      ...sanitized,
    },
    exportedAt: new Date().toISOString(),
    exportedBy: 'mrbro.dev Theme Customizer',
  }

  return JSON.stringify(exportData, null, 2)
}

/**
 * Copies theme JSON to clipboard
 */
export const copyThemeToClipboard = async (theme: Theme): Promise<void> => {
  try {
    const json = createThemeJSON(theme)
    await navigator.clipboard.writeText(json)
  } catch {
    throw new Error('Failed to copy theme to clipboard')
  }
}

/**
 * Imports theme from clipboard text
 */
export const importThemeFromClipboard = async (): Promise<Theme> => {
  try {
    const text = await navigator.clipboard.readText()
    const exportData = JSON.parse(text) as ThemeExportData

    if (!exportData.theme) {
      throw new Error('Invalid theme data in clipboard')
    }

    const sanitized = sanitizeTheme(exportData.theme)
    if (!sanitized) {
      throw new Error('Invalid theme data')
    }

    const isValid = validateTheme(sanitized)
    if (!isValid) {
      throw new Error('Theme validation failed')
    }

    return sanitized
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Failed to import theme from clipboard')
  }
}
