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
const errorFormatters: Record<string, (error: ErrorObject, path: string) => string> = {
  required: (error, path) => {
    const missingProperty = error.params?.['missingProperty']
    return `Missing required property: ${path}.${missingProperty}`
  },
  type: (error, path) => {
    const expectedType = error.params?.['type']
    return `Invalid type at ${path}: expected ${expectedType}, got ${typeof error.data}`
  },
  format: (error, path) => {
    const format = error.params?.['format']
    return `Invalid format at ${path}: expected ${format} format`
  },
  pattern: (error, path) => {
    const pattern = error.params?.['pattern']
    return `Invalid pattern at ${path}: must match pattern ${pattern}`
  },
  enum: (error, path) => {
    const allowedValues = error.params?.['allowedValues']
    return `Invalid value at ${path}: must be one of ${allowedValues?.join(', ')}`
  },
  minLength: (error, path) => {
    const minLength = error.params?.['limit']
    return `Value too short at ${path}: minimum length is ${minLength}`
  },
  maxLength: (error, path) => {
    const maxLength = error.params?.['limit']
    return `Value too long at ${path}: maximum length is ${maxLength}`
  },
  minimum: (error, path) => {
    const minimum = error.params?.['limit']
    return `Value too small at ${path}: minimum value is ${minimum}`
  },
  maximum: (error, path) => {
    const maximum = error.params?.['limit']
    return `Value too large at ${path}: maximum value is ${maximum}`
  },
  additionalProperties: (error, path) => {
    const additionalProperty = error.params?.['additionalProperty']
    return `Unexpected property at ${path}: ${additionalProperty} is not allowed`
  },
  oneOf: (_, path) => {
    return `Invalid value at ${path}: must match exactly one of the allowed formats`
  },
}

const formatValidationErrors = (errors: ErrorObject[]): string[] => {
  return errors.map(error => {
    const path = error.instancePath || 'root'
    const message = error.message || 'validation failed'
    const formatter = errorFormatters[error.keyword]
    if (formatter) {
      return formatter(error, path)
    }
    return `Validation error at ${path}: ${message}`
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
    version: THEME_EXPORT_VERSION,
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
 * Validates color value format specifically using the main schema validation.
 * Defers to Ajv and the schema's ColorValue definition.
 */
export const validateColorFormat = (color: unknown): boolean => {
  // Use Ajv to validate the color against the ColorValue definition in the main schema
  const colorSchema = themeSchema.definitions?.ColorValue
  if (!colorSchema) {
    // If no definition is found, fallback to a basic string check
    return typeof color === 'string'
  }

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
  // Validate once and reuse results
  const isValid = validateThemeExport(data)
  const errors = validateThemeExport.errors || []

  // Only sanitize if valid
  const sanitizedData = isValid ? (JSON.parse(JSON.stringify(data)) as ThemeExportData) : null

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
