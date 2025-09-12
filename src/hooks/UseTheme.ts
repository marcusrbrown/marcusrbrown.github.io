import type {Theme, ThemeMode} from '../types'
import {useCallback, useEffect, useState} from 'react'
import {useThemeContext} from '../contexts/ThemeContext'

export interface UseThemeReturn {
  // Current theme data
  currentTheme: Theme
  themeMode: ThemeMode
  availableThemes: Theme[]
  systemPreference: 'light' | 'dark'

  // Theme state checks
  isDarkMode: boolean
  isLightMode: boolean
  isSystemMode: boolean
  isSystemDark: boolean
  isSystemLight: boolean

  // Theme actions
  setThemeMode: (mode: ThemeMode) => void
  setCustomTheme: (theme: Theme) => void
  toggleTheme: () => void
  switchToLight: () => void
  switchToDark: () => void
  switchToSystem: () => void

  // Utilities
  getEffectiveThemeMode: () => 'light' | 'dark'
  isCustomTheme: boolean
}

/**
 * Custom hook for managing theme state and operations
 *
 * Provides a comprehensive interface for theme management including:
 * - System preference detection via prefers-color-scheme
 * - Theme mode switching (light, dark, system)
 * - Custom theme support
 * - Utility methods for theme state checks
 *
 * @returns UseThemeReturn object with theme data and controls
 */
export const useTheme = (): UseThemeReturn => {
  const {currentTheme, themeMode, availableThemes, systemPreference, setThemeMode, setCustomTheme} = useThemeContext()

  // Track whether a custom theme is currently active
  const [isCustomTheme, setIsCustomTheme] = useState(false)

  useEffect(() => {
    const isCustom = !availableThemes.some(theme => theme.id === currentTheme.id)
    setIsCustomTheme(isCustom)
  }, [currentTheme, availableThemes])

  const isDarkMode = currentTheme.mode === 'dark'
  const isLightMode = currentTheme.mode === 'light'
  const isSystemMode = themeMode === 'system'
  const isSystemDark = systemPreference === 'dark'
  const isSystemLight = systemPreference === 'light'

  /**
   * Get the effective theme mode (resolves 'system' to actual preference)
   */
  const getEffectiveThemeMode = useCallback((): 'light' | 'dark' => {
    if (themeMode === 'system') {
      return systemPreference
    }
    return themeMode
  }, [themeMode, systemPreference])

  /**
   * Toggle between light and dark modes
   * If currently in system mode, switches to opposite of system preference
   */
  const toggleTheme = useCallback(() => {
    const effectiveMode = getEffectiveThemeMode()
    setThemeMode(effectiveMode === 'dark' ? 'light' : 'dark')
  }, [getEffectiveThemeMode, setThemeMode])

  /**
   * Switch to light mode explicitly
   */
  const switchToLight = useCallback(() => {
    setThemeMode('light')
  }, [setThemeMode])

  /**
   * Switch to dark mode explicitly
   */
  const switchToDark = useCallback(() => {
    setThemeMode('dark')
  }, [setThemeMode])

  /**
   * Switch to system preference mode
   */
  const switchToSystem = useCallback(() => {
    setThemeMode('system')
  }, [setThemeMode])

  return {
    // Current theme data
    currentTheme,
    themeMode,
    availableThemes,
    systemPreference,

    // Theme state checks
    isDarkMode,
    isLightMode,
    isSystemMode,
    isSystemDark,
    isSystemLight,

    // Theme actions
    setThemeMode,
    setCustomTheme,
    toggleTheme,
    switchToLight,
    switchToDark,
    switchToSystem,

    // Utilities
    getEffectiveThemeMode,
    isCustomTheme,
  }
}
