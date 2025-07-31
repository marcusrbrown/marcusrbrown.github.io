import type {Theme, ThemeMode} from '../types'
import {sanitizeTheme} from './theme-validation'

// Storage keys for localStorage
const STORAGE_KEYS = {
  THEME_MODE: 'mrbro-dev-theme-mode',
  CUSTOM_THEME: 'mrbro-dev-custom-theme',
  SAVED_THEMES: 'mrbro-dev-saved-themes',
} as const

// Fallback values when storage fails or data is invalid
const FALLBACK_THEME_MODE: ThemeMode = 'system'

/**
 * Validates if a value is a valid ThemeMode
 */
const isValidThemeMode = (value: unknown): value is ThemeMode => {
  return typeof value === 'string' && ['light', 'dark', 'system'].includes(value)
}

/**
 * Safely parses JSON with error handling
 */
const safeParse = <T>(value: string | null): T | null => {
  if (!value) return null

  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

/**
 * Safely writes to localStorage with quota exceeded handling
 */
const safeSetItem = (key: string, value: string): boolean => {
  try {
    localStorage.setItem(key, value)
    return true
  } catch (error) {
    // Handle quota exceeded or other localStorage errors
    console.warn(`Failed to save to localStorage (${key}):`, error)

    // Attempt to clear old theme data to make space
    try {
      localStorage.removeItem(STORAGE_KEYS.CUSTOM_THEME)
      localStorage.setItem(key, value)
      return true
    } catch {
      // If still failing, clear all theme storage and try once more
      try {
        localStorage.removeItem(STORAGE_KEYS.THEME_MODE)
        localStorage.removeItem(STORAGE_KEYS.CUSTOM_THEME)
        localStorage.setItem(key, value)
        return true
      } catch {
        console.error('Failed to save theme data even after clearing storage')
        return false
      }
    }
  }
}

/**
 * Safely reads from localStorage with error handling
 */
const safeGetItem = (key: string): string | null => {
  try {
    return localStorage.getItem(key)
  } catch (error) {
    console.warn(`Failed to read from localStorage (${key}):`, error)
    return null
  }
}

/**
 * Saves theme mode to localStorage
 */
export const saveThemeMode = (mode: ThemeMode): boolean => {
  if (!isValidThemeMode(mode)) {
    console.warn('Invalid theme mode provided:', mode)
    return false
  }

  return safeSetItem(STORAGE_KEYS.THEME_MODE, JSON.stringify(mode))
}

/**
 * Loads theme mode from localStorage with validation
 */
export const loadThemeMode = (): ThemeMode => {
  const stored = safeGetItem(STORAGE_KEYS.THEME_MODE)
  const parsed = safeParse<ThemeMode>(stored)

  if (parsed && isValidThemeMode(parsed)) {
    return parsed
  }

  return FALLBACK_THEME_MODE
}

/**
 * Saves custom theme to localStorage
 */
export const saveCustomTheme = (theme: Theme): boolean => {
  // Use comprehensive validation from theme-validation utilities
  const sanitized = sanitizeTheme(theme)
  if (!sanitized) {
    console.warn('Invalid theme provided for storage:', theme)
    return false
  }

  return safeSetItem(STORAGE_KEYS.CUSTOM_THEME, JSON.stringify(sanitized))
}

/**
 * Loads custom theme from localStorage with validation
 */
export const loadCustomTheme = (): Theme | null => {
  const stored = safeGetItem(STORAGE_KEYS.CUSTOM_THEME)
  const parsed = safeParse<Theme>(stored)

  if (parsed) {
    // Use comprehensive validation and sanitization
    return sanitizeTheme(parsed)
  }

  return null
}

/**
 * Removes custom theme from localStorage
 */
export const removeCustomTheme = (): boolean => {
  try {
    localStorage.removeItem(STORAGE_KEYS.CUSTOM_THEME)
    return true
  } catch (error) {
    console.warn('Failed to remove custom theme from localStorage:', error)
    return false
  }
}

/**
 * Clears all theme-related data from localStorage
 */
export const clearThemeStorage = (): boolean => {
  try {
    localStorage.removeItem(STORAGE_KEYS.THEME_MODE)
    localStorage.removeItem(STORAGE_KEYS.CUSTOM_THEME)
    return true
  } catch (error) {
    console.warn('Failed to clear theme storage:', error)
    return false
  }
}

/**
 * Gets storage usage information for theme data
 */
export const getThemeStorageInfo = () => {
  const themeModeData = safeGetItem(STORAGE_KEYS.THEME_MODE)
  const customThemeData = safeGetItem(STORAGE_KEYS.CUSTOM_THEME)
  const savedThemesData = safeGetItem(STORAGE_KEYS.SAVED_THEMES)

  return {
    themeModeSize: themeModeData ? new Blob([themeModeData]).size : 0,
    customThemeSize: customThemeData ? new Blob([customThemeData]).size : 0,
    savedThemesSize: savedThemesData ? new Blob([savedThemesData]).size : 0,
    totalSize:
      (themeModeData ? new Blob([themeModeData]).size : 0) +
      (customThemeData ? new Blob([customThemeData]).size : 0) +
      (savedThemesData ? new Blob([savedThemesData]).size : 0),
    hasThemeMode: !!themeModeData,
    hasCustomTheme: !!customThemeData,
    hasSavedThemes: !!savedThemesData,
  }
}

/**
 * Loads all saved themes from localStorage
 */
export const loadSavedThemes = (): Theme[] => {
  const stored = safeGetItem(STORAGE_KEYS.SAVED_THEMES)
  const parsed = safeParse<Theme[]>(stored)

  if (Array.isArray(parsed)) {
    // Validate and sanitize each theme
    return parsed.map(theme => sanitizeTheme(theme)).filter((theme): theme is Theme => theme !== null)
  }

  return []
}

/**
 * Saves a theme to the user's theme library
 */
export const saveThemeToLibrary = (theme: Theme): boolean => {
  const sanitized = sanitizeTheme(theme)
  if (!sanitized) {
    console.warn('Invalid theme provided for library storage:', theme)
    return false
  }

  const savedThemes = loadSavedThemes()
  const existingIndex = savedThemes.findIndex(t => t.id === sanitized.id)

  if (existingIndex === -1) {
    // Add new theme
    savedThemes.push(sanitized)
  } else {
    // Update existing theme
    savedThemes[existingIndex] = sanitized
  }

  return safeSetItem(STORAGE_KEYS.SAVED_THEMES, JSON.stringify(savedThemes))
}

/**
 * Removes a theme from the user's theme library
 */
export const removeThemeFromLibrary = (themeId: string): boolean => {
  const savedThemes = loadSavedThemes()
  const filteredThemes = savedThemes.filter(theme => theme.id !== themeId)

  if (filteredThemes.length === savedThemes.length) {
    // Theme not found
    return false
  }

  return safeSetItem(STORAGE_KEYS.SAVED_THEMES, JSON.stringify(filteredThemes))
}

/**
 * Clears all saved themes from localStorage
 */
export const clearSavedThemes = (): boolean => {
  try {
    localStorage.removeItem(STORAGE_KEYS.SAVED_THEMES)
    return true
  } catch (error) {
    console.warn('Failed to clear saved themes from localStorage:', error)
    return false
  }
}
