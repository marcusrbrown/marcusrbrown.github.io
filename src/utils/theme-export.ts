/**
 * Theme Export/Import Utilities
 *
 * Utilities for exporting themes to JSON files and importing themes from JSON files.
 * Includes JSON schema validation, error handling, and proper browser file handling.
 */

import type {Theme, ThemeExportData} from '../types'
import {sanitizeThemeData, validateThemeExportData} from './schema-validation'
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
 * Imports a theme from a JSON file with JSON schema validation
 */
export const importTheme = async (file: File): Promise<Theme> => {
  try {
    const content = await file.text()
    const rawData = JSON.parse(content)

    // First validate against JSON schema
    const schemaValidation = validateThemeExportData(rawData)
    if (!schemaValidation.isValid) {
      throw new Error(`Schema validation failed: ${schemaValidation.errors.join(', ')}`)
    }

    // Sanitize using schema validation
    const sanitizedData = sanitizeThemeData(rawData)
    if (!sanitizedData) {
      throw new Error('Failed to sanitize theme data')
    }

    const exportData = sanitizedData

    // Additional validation using existing validation functions for compatibility
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
 * Validates a theme file before import with detailed error reporting
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
 * Validates theme content with detailed schema validation
 */
export const validateThemeContent = async (
  file: File,
): Promise<{
  isValid: boolean
  errors: string[]
  warnings: string[]
}> => {
  try {
    const content = await file.text()
    const rawData = JSON.parse(content)

    // Use schema validation for detailed results
    const validation = validateThemeExportData(rawData)

    return {
      isValid: validation.isValid,
      errors: validation.errors,
      warnings: validation.warnings,
    }
  } catch (error) {
    return {
      isValid: false,
      errors: [error instanceof Error ? error.message : 'Failed to parse JSON'],
      warnings: [],
    }
  }
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
 * Imports theme from clipboard text with JSON schema validation
 */
export const importThemeFromClipboard = async (): Promise<Theme> => {
  try {
    const text = await navigator.clipboard.readText()
    const rawData = JSON.parse(text)

    // First validate against JSON schema
    const schemaValidation = validateThemeExportData(rawData)
    if (!schemaValidation.isValid) {
      throw new Error(`Schema validation failed: ${schemaValidation.errors.join(', ')}`)
    }

    // Sanitize using schema validation
    const sanitizedData = sanitizeThemeData(rawData)
    if (!sanitizedData) {
      throw new Error('Failed to sanitize theme data')
    }

    const exportData = sanitizedData

    // Additional validation using existing validation functions for compatibility
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
