/**
 * JSON Schema Validation Utilities
 *
 * Provides JSON schema-based validation for theme import/export functionality
 * using Ajv validator with proper error handling and security measures.
 */

import type {Theme, ThemeExportData, ThemeValidationResult} from '../types'
import Ajv, {type ErrorObject} from 'ajv'
import addFormats from 'ajv-formats'

import themeSchema from '../schemas/theme.schema.json'

// Theme export format version constant
export const THEME_EXPORT_VERSION = '1.0'

const SCHEMA_VALIDATOR_EXPORTER = 'schema-validator'

// Create Ajv instance with configuration
const ajv = new Ajv({
  allErrors: true, // Collect all validation errors
  verbose: true, // Include schema and data in errors
  strict: false, // Disable strict mode to avoid schema issues
  removeAdditional: true, // Remove additional properties not in schema
  useDefaults: true, // Use default values from schema
  coerceTypes: false, // Don't coerce types for security
})

// Add format validation (date-time, etc.)
addFormats(ajv)

// Compile the theme schema
const validateThemeExport = ajv.compile(themeSchema)

/**
 * Formats Ajv validation errors into human-readable messages
 */
const formatValidationErrors = (errors: ErrorObject[]): string[] => {
  return errors.map(error => {
    const path = error.instancePath || 'root'
    const message = error.message || 'validation failed'

    switch (error.keyword) {
      case 'required': {
        const missingProperty = error.params?.['missingProperty']
        return `Missing required property: ${path}.${missingProperty}`
      }
      case 'type': {
        const expectedType = error.params?.['type']
        return `Invalid type at ${path}: expected ${expectedType}, got ${typeof error.data}`
      }
      case 'format': {
        const format = error.params?.['format']
        return `Invalid format at ${path}: expected ${format} format`
      }
      case 'pattern': {
        const pattern = error.params?.['pattern']
        return `Invalid pattern at ${path}: must match pattern ${pattern}`
      }
      case 'enum': {
        const allowedValues = error.params?.['allowedValues']
        return `Invalid value at ${path}: must be one of ${allowedValues?.join(', ')}`
      }
      case 'minLength': {
        const minLength = error.params?.['limit']
        return `Value too short at ${path}: minimum length is ${minLength}`
      }
      case 'maxLength': {
        const maxLength = error.params?.['limit']
        return `Value too long at ${path}: maximum length is ${maxLength}`
      }
      case 'minimum': {
        const minimum = error.params?.['limit']
        return `Value too small at ${path}: minimum value is ${minimum}`
      }
      case 'maximum': {
        const maximum = error.params?.['limit']
        return `Value too large at ${path}: maximum value is ${maximum}`
      }
      case 'additionalProperties': {
        const additionalProperty = error.params?.['additionalProperty']
        return `Unexpected property at ${path}: ${additionalProperty} is not allowed`
      }
      case 'oneOf': {
        return `Invalid value at ${path}: must match exactly one of the allowed formats`
      }
      default: {
        return `Validation error at ${path}: ${message}`
      }
    }
  })
}

/**
 * Validates theme export data against JSON schema
 */
export const validateThemeExportData = (data: unknown): ThemeValidationResult => {
  const isValid = validateThemeExport(data)

  if (isValid) {
    return {
      isValid: true,
      errors: [],
      warnings: [],
    }
  }

  const errors = validateThemeExport.errors || []

  return {
    isValid: false,
    errors: formatValidationErrors(errors),
    warnings: [],
  }
}

/**
 * Validates a theme object against the schema
 */
export const validateThemeSchema = (theme: unknown): ThemeValidationResult => {
  // Create a mock export data structure for validation
  const exportData = {
    version: '1.0',
    theme,
    exportedAt: new Date().toISOString(),
    exportedBy: SCHEMA_VALIDATOR_EXPORTER,
  }

  return validateThemeExportData(exportData)
}

/**
 * Sanitizes theme data by removing invalid properties and coercing values
 */
export const sanitizeThemeData = (data: unknown): ThemeExportData | null => {
  try {
    // Create a deep copy to avoid modifying original
    const dataCopy = JSON.parse(JSON.stringify(data)) as ThemeExportData

    // Validate and sanitize using Ajv
    const isValid = validateThemeExport(dataCopy)

    if (isValid) {
      // After successful validation, we know the data matches ThemeExportData structure
      return dataCopy
    }

    return null
  } catch {
    return null
  }
}

/**
 * Validates color value format specifically
 * Uses the ColorValue definition from the imported theme schema for consistency.
 */
export const validateColorFormat = (color: unknown): boolean => {
  if (typeof color !== 'string') {
    return false
  }

  // Reference the ColorValue definition from the imported theme schema
  // Assumes themeSchema.definitions.ColorValue exists and matches the color validation requirements
  const colorSchema = themeSchema.definitions?.ColorValue ||
    // fallback to a basic string type if not defined
    {type: 'string'}

  colorSchema.oneOf = colorSchema.oneOf.map((item: any) => {
    if (item.pattern && item.pattern.includes('hsl')) {
      // Replace with stricter pattern for HSL/HSLA
      return {
        ...item,
        pattern: String.raw`^hsl\(\s*(?:360|3[0-5][0-9]|[12][0-9][0-9]|[1-9]?[0-9]|0)\s*,\s*(?:100|[1-9]?[0-9]|0)%\s*,\s*(?:100|[1-9]?[0-9]|0)%\s*\)$`,
      }
    }
    if (item.pattern && item.pattern.includes('hsla')) {
      return {
        ...item,
        pattern: String.raw`^hsla\(\s*(?:360|3[0-5][0-9]|[12][0-9][0-9]|[1-9]?[0-9]|0)\s*,\s*(?:100|[1-9]?[0-9]|0)%\s*,\s*(?:100|[1-9]?[0-9]|0)%\s*,\s*(?:0(?:\.[0-9]+)?|1(?:\.0+)?)\s*\)$`,
      }
    }
    return item
  })

  const validateColor = ajv.compile(colorSchema)
  return validateColor(color)
}

/**
 * Gets detailed validation information for debugging
 */
export const getValidationDetails = (
  data: unknown,
): {
  isValid: boolean
  errors: ErrorObject[]
  warnings: string[]
  sanitizedData: ThemeExportData | null
} => {
  const isValid = validateThemeExport(data)
  const errors = validateThemeExport.errors || []
  const sanitizedData = sanitizeThemeData(data)

  const warnings: string[] = []

  // Check for potential issues that aren't validation errors
  if (sanitizedData) {
    // Warn about missing optional fields
    if (!sanitizedData.theme.description) {
      warnings.push('Theme description is recommended for better user experience')
    }
    if (!sanitizedData.theme.author) {
      warnings.push('Theme author information is recommended')
    }
    if (!sanitizedData.theme.version) {
      warnings.push('Theme version is recommended for compatibility tracking')
    }
  }

  return {
    isValid,
    errors,
    warnings,
    sanitizedData,
  }
}

/**
 * Type guard to check if data is valid ThemeExportData
 */
export const isValidThemeExportData = (data: unknown): data is ThemeExportData => {
  return validateThemeExportData(data).isValid
}

/**
 * Type guard to check if data is valid Theme
 */
export const isValidTheme = (data: unknown): data is Theme => {
  return validateThemeSchema(data).isValid
}
