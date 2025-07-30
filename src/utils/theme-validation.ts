/**
 * Theme Validation and Sanitization Utilities
 *
 * Comprehensive validation and sanitization utilities for the theme system.
 * Includes color validation, WCAG contrast checking, security sanitization,
 * and robust theme schema validation.
 */

import type {
  ColorContrastResult,
  ColorValue,
  ExtendedThemeColors,
  HSLColor,
  ResolvedThemeMode,
  RGBColor,
  Theme,
  ThemeColors,
  ThemeMetadata,
} from '../types'

// Color format validation patterns
const COLOR_PATTERNS = {
  HEX_3: /^#[\da-f]{3}$/i,
  HEX_6: /^#[\da-f]{6}$/i,
  HEX_8: /^#[\da-f]{8}$/i,
  HSL: /^hsl\(\s*\d+\s*,\s*\d+%\s*,\s*\d+%\s*\)$/,
  HSLA: /^hsla\(\s*\d+\s*,\s*\d+%\s*,\s*\d+%\s*,\s*(?:0(?:\.\d+)?|1(?:\.0+)?)\s*\)$/,
  RGB: /^rgb\(\s*(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\s*,\s*(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\s*,\s*(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\s*\)$/,
  RGBA: /^rgba\(\s*(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\s*,\s*(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\s*,\s*(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\s*,\s*(?:0(?:\.\d+)?|1(?:\.0+)?)\s*\)$/,
} as const

// CSS named colors (subset for security)
const SAFE_NAMED_COLORS = new Set([
  'black',
  'white',
  'red',
  'green',
  'blue',
  'yellow',
  'cyan',
  'magenta',
  'gray',
  'grey',
  'transparent',
  'currentcolor', // Note: CSS is case-insensitive but we normalize to lowercase
])

/**
 * Validates if a string is a valid color value
 */
export const isValidColorValue = (value: unknown): value is ColorValue => {
  if (typeof value !== 'string') return false

  const trimmed = value.trim().toLowerCase()

  // Check hex patterns
  if (COLOR_PATTERNS.HEX_3.test(trimmed) || COLOR_PATTERNS.HEX_6.test(trimmed) || COLOR_PATTERNS.HEX_8.test(trimmed)) {
    return true
  }

  // Check HSL patterns
  if (COLOR_PATTERNS.HSL.test(trimmed) || COLOR_PATTERNS.HSLA.test(trimmed)) {
    return true
  }

  // Check RGB patterns
  if (COLOR_PATTERNS.RGB.test(trimmed) || COLOR_PATTERNS.RGBA.test(trimmed)) {
    return true
  }

  // Check safe named colors
  if (SAFE_NAMED_COLORS.has(trimmed)) {
    return true
  }

  return false
}

/**
 * Sanitizes a color value to prevent XSS and ensure valid format
 */
export const sanitizeColorValue = (value: unknown): ColorValue | null => {
  if (!isValidColorValue(value)) return null

  const trimmed = value.trim()

  // Remove any potentially dangerous characters
  const sanitized = trimmed.replaceAll(/[<>'"\\()]/g, '')

  // Re-validate after sanitization
  if (!isValidColorValue(sanitized)) return null

  return sanitized
}

/**
 * Converts hex color to RGB
 */
export const hexToRgb = (hex: string): RGBColor | null => {
  const sanitized = sanitizeColorValue(hex)
  if (!sanitized || !sanitized.startsWith('#')) return null

  let cleanHex = sanitized.slice(1)

  // Convert 3-digit hex to 6-digit
  if (cleanHex.length === 3) {
    cleanHex = cleanHex
      .split('')
      .map(char => char + char)
      .join('')
  }

  if (cleanHex.length !== 6) return null

  const r = Number.parseInt(cleanHex.slice(0, 2), 16)
  const g = Number.parseInt(cleanHex.slice(2, 4), 16)
  const b = Number.parseInt(cleanHex.slice(4, 6), 16)

  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null

  return {r, g, b}
}

/**
 * Converts RGB to hex color
 */
export const rgbToHex = (rgb: RGBColor): string => {
  const toHex = (n: number): string => {
    const hex = Math.round(Math.max(0, Math.min(255, n))).toString(16)
    return hex.length === 1 ? `0${hex}` : hex
  }

  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`
}

/**
 * Converts HSL to RGB
 */
export const hslToRgb = (hsl: HSLColor): RGBColor => {
  const h = Math.max(0, Math.min(360, hsl.h)) / 360
  const s = Math.max(0, Math.min(100, hsl.s)) / 100
  const l = Math.max(0, Math.min(100, hsl.l)) / 100

  const hue2rgb = (p: number, q: number, t: number): number => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }

  let r: number, g: number, b: number

  if (s === 0) {
    r = g = b = l // achromatic
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue2rgb(p, q, h + 1 / 3)
    g = hue2rgb(p, q, h)
    b = hue2rgb(p, q, h - 1 / 3)
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  }
}

/**
 * Converts RGB to HSL
 */
export const rgbToHsl = (rgb: RGBColor): HSLColor => {
  const r = rgb.r / 255
  const g = rgb.g / 255
  const b = rgb.b / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h: number, s: number
  const l = (max + min) / 2

  if (max === min) {
    h = s = 0 // achromatic
  } else {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0)
        break
      case g:
        h = (b - r) / d + 2
        break
      case b:
        h = (r - g) / d + 4
        break
      default:
        h = 0
    }
    h /= 6
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  }
}

/**
 * Calculates relative luminance of a color for contrast calculations
 */
export const getRelativeLuminance = (rgb: RGBColor): number => {
  const sRGBToLinear = (value: number): number => {
    const normalized = value / 255
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
  }

  return 0.2126 * sRGBToLinear(rgb.r) + 0.7152 * sRGBToLinear(rgb.g) + 0.0722 * sRGBToLinear(rgb.b)
}

/**
 * Calculates color contrast ratio between two colors
 */
export const getContrastRatio = (color1: ColorValue, color2: ColorValue): number => {
  const rgb1 = hexToRgb(color1) || {r: 0, g: 0, b: 0}
  const rgb2 = hexToRgb(color2) || {r: 255, g: 255, b: 255}

  const lum1 = getRelativeLuminance(rgb1)
  const lum2 = getRelativeLuminance(rgb2)

  const lighter = Math.max(lum1, lum2)
  const darker = Math.min(lum1, lum2)

  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Validates color contrast according to WCAG guidelines
 */
export const validateColorContrast = (foreground: ColorValue, background: ColorValue): ColorContrastResult => {
  const ratio = getContrastRatio(foreground, background)

  return {
    ratio: Math.round(ratio * 100) / 100,
    meetsAA: ratio >= 4.5,
    meetsAAA: ratio >= 7,
    grade: ratio >= 7 ? 'AAA' : ratio >= 4.5 ? 'AA' : 'Fail',
  }
}

/**
 * Validates theme colors object
 */
export const validateThemeColors = (colors: unknown): colors is ThemeColors => {
  if (!colors || typeof colors !== 'object') return false

  const requiredColors = [
    'primary',
    'secondary',
    'accent',
    'background',
    'surface',
    'text',
    'textSecondary',
    'border',
    'error',
    'warning',
    'success',
  ]

  for (const colorKey of requiredColors) {
    const colorValue = (colors as Record<string, unknown>)[colorKey]
    if (!isValidColorValue(colorValue)) return false
  }

  return true
}

/**
 * Validates extended theme colors
 */
export const validateExtendedThemeColors = (colors: unknown): colors is ExtendedThemeColors => {
  if (!validateThemeColors(colors)) return false

  const optionalColors = ['info', 'muted', 'hover', 'focus', 'selection']
  const colorObj = colors as unknown as Record<string, unknown>

  for (const colorKey of optionalColors) {
    if (colorKey in colorObj && !isValidColorValue(colorObj[colorKey])) {
      return false
    }
  }

  return true
}

/**
 * Validates theme metadata
 */
export const validateThemeMetadata = (metadata: unknown): metadata is ThemeMetadata => {
  if (!metadata || typeof metadata !== 'object') return false

  const meta = metadata as Record<string, unknown>

  // Required fields
  if (!meta['id'] || typeof meta['id'] !== 'string' || String(meta['id']).trim().length === 0) return false
  if (!meta['name'] || typeof meta['name'] !== 'string' || String(meta['name']).trim().length === 0) return false

  // Optional fields validation
  if (meta['description'] !== undefined && typeof meta['description'] !== 'string') return false
  if (meta['author'] !== undefined && typeof meta['author'] !== 'string') return false
  if (meta['version'] !== undefined && typeof meta['version'] !== 'string') return false
  if (meta['isBuiltIn'] !== undefined && typeof meta['isBuiltIn'] !== 'boolean') return false
  if (meta['createdAt'] !== undefined && typeof meta['createdAt'] !== 'string') return false
  if (meta['updatedAt'] !== undefined && typeof meta['updatedAt'] !== 'string') return false

  // Tags validation
  if (meta['tags'] !== undefined) {
    if (!Array.isArray(meta['tags'])) return false
    if (!(meta['tags'] as unknown[]).every(tag => typeof tag === 'string')) return false
  }

  return true
}

/**
 * Validates resolved theme mode
 */
export const isValidResolvedThemeMode = (mode: unknown): mode is ResolvedThemeMode => {
  return typeof mode === 'string' && ['light', 'dark'].includes(mode)
}

/**
 * Validates complete theme object
 */
export const validateTheme = (theme: unknown): theme is Theme => {
  if (!theme || typeof theme !== 'object') return false

  const themeObj = theme as Record<string, unknown>

  // Validate metadata
  if (!validateThemeMetadata(themeObj)) return false

  // Validate mode
  if (!isValidResolvedThemeMode(themeObj['mode'])) return false

  // Validate colors
  if (!validateThemeColors(themeObj['colors'])) return false

  return true
}

/**
 * Sanitizes and validates a complete theme object
 */
export const sanitizeTheme = (theme: unknown): Theme | null => {
  if (!validateTheme(theme)) return null

  const validated = theme

  // Sanitize all color values
  const sanitizedColors: Record<string, ColorValue> = {}
  for (const [key, value] of Object.entries(validated.colors)) {
    const sanitized = sanitizeColorValue(value)
    if (!sanitized) return null
    sanitizedColors[key] = sanitized
  }

  // Sanitize strings to prevent XSS
  const sanitizeString = (str: string): string => {
    return str.replaceAll(/[<>'"\\()]/g, '').trim()
  }

  return {
    ...validated,
    id: sanitizeString(validated.id),
    name: sanitizeString(validated.name),
    description: validated.description ? sanitizeString(validated.description) : undefined,
    author: validated.author ? sanitizeString(validated.author) : undefined,
    version: validated.version ? sanitizeString(validated.version) : undefined,
    tags: validated.tags?.map(sanitizeString),
    colors: sanitizedColors as unknown as ThemeColors,
  }
}

/**
 * Validates theme accessibility by checking color contrasts
 */
export const validateThemeAccessibility = (
  theme: Theme,
): {
  isAccessible: boolean
  issues: {pair: [string, string]; contrast: ColorContrastResult}[]
} => {
  const issues: {pair: [string, string]; contrast: ColorContrastResult}[] = []

  // Check critical color combinations
  const criticalPairs: [keyof ThemeColors, keyof ThemeColors][] = [
    ['text', 'background'],
    ['textSecondary', 'background'],
    ['text', 'surface'],
    ['textSecondary', 'surface'],
  ]

  for (const [foregroundKey, backgroundKey] of criticalPairs) {
    const contrast = validateColorContrast(theme.colors[foregroundKey], theme.colors[backgroundKey])
    if (!contrast.meetsAA) {
      issues.push({
        pair: [foregroundKey, backgroundKey],
        contrast,
      })
    }
  }

  return {
    isAccessible: issues.length === 0,
    issues,
  }
}

/**
 * Creates a validated theme with fallbacks for invalid values
 */
export const createValidatedTheme = (
  input: Partial<Theme>,
  fallbackTheme: Theme,
): {theme: Theme; warnings: string[]} => {
  const warnings: string[] = []

  // Start with fallback and override with valid values from input
  const theme: Theme = {...fallbackTheme}

  // Validate and apply metadata
  if (input.id && typeof input.id === 'string' && input.id.trim().length > 0) {
    theme.id = input.id.trim()
  } else {
    warnings.push('Invalid or missing theme ID, using fallback')
  }

  if (input.name && typeof input.name === 'string' && input.name.trim().length > 0) {
    theme.name = input.name.trim()
  } else {
    warnings.push('Invalid or missing theme name, using fallback')
  }

  // Validate and apply colors
  if (validateThemeColors(input.colors)) {
    const sanitizedColors: Record<string, ColorValue> = {}
    for (const [key, value] of Object.entries(input.colors)) {
      const sanitized = sanitizeColorValue(value)
      if (sanitized) {
        sanitizedColors[key] = sanitized
      } else {
        warnings.push(`Invalid color value for ${key}, using fallback`)
        sanitizedColors[key] = fallbackTheme.colors[key as keyof ThemeColors]
      }
    }
    theme.colors = sanitizedColors as unknown as ThemeColors
  } else {
    warnings.push('Invalid colors object, using fallback colors')
  }

  // Validate mode
  if (isValidResolvedThemeMode(input.mode)) {
    theme.mode = input.mode
  } else {
    warnings.push('Invalid theme mode, using fallback')
  }

  return {theme, warnings}
}
