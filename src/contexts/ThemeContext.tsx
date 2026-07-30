import type {Theme, ThemeContextValue, ThemeMode, ThemeSelection} from '../types'
import {useCallback, useEffect, useMemo, useState, type ReactNode} from 'react'
import {ThemeContext} from '../hooks/UseThemeContext'
import {prefersReducedMotion} from '../utils/accessibility'
import {trackUmamiEvent} from '../utils/analytics'
import {
  cleanupThemeOptimizations,
  getOptimalPerformanceLevel,
  optimizeForThemeSwitch,
  setupReducedMotionListener,
} from '../utils/theme-performance'
import {
  isThemeStorageKey,
  loadCustomTheme,
  loadThemeMode,
  removeCustomTheme,
  saveCustomTheme,
  saveThemeMode,
} from '../utils/theme-storage'

const defaultLightTheme: Theme = {
  id: 'default-light',
  name: 'Light',
  mode: 'light',
  colors: {
    primary: '#2563eb',
    secondary: '#4b5563',
    accent: '#0ea5e9',
    background: '#ffffff',
    surface: '#f8fafc',
    text: '#0f172a',
    textSecondary: '#4b5563',
    border: '#e2e8f0',
    error: '#dc2626',
    warning: '#d97706',
    success: '#16a34a',
  },
}

const defaultDarkTheme: Theme = {
  id: 'default-dark',
  name: 'Dark',
  mode: 'dark',
  colors: {
    primary: '#1d4ed8',
    secondary: '#cbd5e1',
    accent: '#0ea5e9',
    background: '#0f172a',
    surface: '#1e293b',
    text: '#f8fafc',
    textSecondary: '#cbd5e1',
    border: '#334155',
    error: '#ef4444',
    warning: '#f59e0b',
    success: '#22c55e',
  },
}

/**
 * Synchronously detects system color scheme preference
 * Used during initialization to prevent flash of incorrect theme
 */
const detectSystemPreference = (): 'light' | 'dark' => {
  // Return light as fallback for SSR or environments without matchMedia
  if (typeof window === 'undefined' || !window.matchMedia) {
    return 'light'
  }

  try {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    return mediaQuery.matches ? 'dark' : 'light'
  } catch {
    // Fallback if matchMedia fails for any reason
    return 'light'
  }
}

interface ThemeProviderProps {
  children: ReactNode
}

export const ThemeProvider = ({children}: ThemeProviderProps) => {
  // Initialize theme mode from localStorage, fallback to 'system'
  const [themeModeValue, setThemeModeValue] = useState<ThemeMode>(() => loadThemeMode())

  // Initialize custom theme from localStorage if available
  const [customThemeValue, setCustomThemeValue] = useState<Theme | null>(() => loadCustomTheme())

  // Initialize system preference synchronously to prevent theme flash on startup
  const [systemPreference, setSystemPreference] = useState<'light' | 'dark'>(() => detectSystemPreference())

  // Remove theme-preload class after React hydration to enable transitions
  useEffect(() => {
    // Use requestAnimationFrame to ensure DOM is fully rendered
    requestAnimationFrame(() => {
      document.documentElement.classList.remove('theme-preload')
    })
  }, [])

  const availableThemes = useMemo(() => [defaultLightTheme, defaultDarkTheme], [])

  // Enhanced setThemeMode that persists to localStorage and optimizes performance
  const setThemeMode = useCallback(
    (mode: ThemeMode) => {
      // Skip animations entirely if user prefers reduced motion
      if (prefersReducedMotion()) {
        setThemeModeValue(mode)
        saveThemeMode(mode)
        return
      }

      // Optimize for theme switching performance
      const performanceLevel = getOptimalPerformanceLevel()
      optimizeForThemeSwitch(performanceLevel)

      setThemeModeValue(mode)
      saveThemeMode(mode)

      // Clean up performance optimizations after transition
      setTimeout(() => {
        cleanupThemeOptimizations()
      }, 350) // Slightly longer than max transition duration
    },
    [themeModeValue],
  )

  // Enhanced setCustomTheme that persists to localStorage and optimizes performance
  const setCustomTheme = useCallback((theme: Theme | null) => {
    // Skip animations entirely if user prefers reduced motion
    if (prefersReducedMotion()) {
      setCustomThemeValue(theme)
      if (theme) saveCustomTheme(theme)
      return
    }

    // Optimize for theme switching performance
    const performanceLevel = getOptimalPerformanceLevel()
    optimizeForThemeSwitch(performanceLevel)

    setCustomThemeValue(theme)
    if (theme) saveCustomTheme(theme)

    // Clean up performance optimizations after transition
    setTimeout(() => {
      cleanupThemeOptimizations()
    }, 350) // Slightly longer than max transition duration
  }, [])

  const setActiveTheme = useCallback(
    (selection: ThemeSelection) => {
      if (selection.type === 'mode') {
        const isNoOp = customThemeValue === null && selection.mode === themeModeValue
        if (!isNoOp) {
          trackUmamiEvent('theme_change', {kind: 'mode', value: selection.mode})
        }
        setThemeMode(selection.mode)
        setCustomTheme(null)
        removeCustomTheme()
        return
      }

      const isNoOp = customThemeValue?.id === selection.theme.id
      if (!isNoOp) {
        trackUmamiEvent('theme_change', {kind: 'preset', value: selection.theme.id})
      }
      setCustomTheme(selection.theme)
    },
    [customThemeValue, setCustomTheme, setThemeMode, themeModeValue],
  )

  // Detect system preference and listen for changes
  useEffect(() => {
    // Early return if running on server
    if (typeof window === 'undefined') return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const handleChange = (e: MediaQueryListEvent) => {
      setSystemPreference(e.matches ? 'dark' : 'light')
    }

    // Add event listener for changes
    mediaQuery.addEventListener('change', handleChange)

    return () => {
      mediaQuery.removeEventListener('change', handleChange)
    }
  }, [])

  // Listen for cross-tab theme changes via storage events
  useEffect(() => {
    // Early return if running on server
    if (typeof window === 'undefined') return

    const handleStorageChange = (e: StorageEvent) => {
      // Only handle theme-related storage changes
      if (!isThemeStorageKey(e.key)) return

      try {
        const newThemeMode = loadThemeMode()
        const newCustomTheme = loadCustomTheme()
        setThemeModeValue(newThemeMode)
        setCustomThemeValue(newCustomTheme)
      } catch (error) {
        console.warn('Error handling cross-tab theme sync:', error)
      }
    }

    // Add storage event listener for cross-tab synchronization
    window.addEventListener('storage', handleStorageChange)

    return () => {
      window.removeEventListener('storage', handleStorageChange)
    }
  }, [])

  // Set up reduced motion listener for dynamic preference changes
  useEffect(() => {
    // Early return if running on server
    if (typeof window === 'undefined') return

    // Set up the reduced motion listener which handles CSS property updates
    const cleanupReducedMotionListener = setupReducedMotionListener()

    return cleanupReducedMotionListener
  }, [])

  // Determine current theme based on mode and system preference
  const currentTheme: Theme = (() => {
    if (customThemeValue) {
      return customThemeValue
    }

    const targetMode = themeModeValue === 'system' ? systemPreference : themeModeValue
    return targetMode === 'dark' ? defaultDarkTheme : defaultLightTheme
  })()

  // Apply CSS custom properties when theme changes with performance optimizations
  useEffect(() => {
    const root = document.documentElement
    const {colors} = currentTheme

    // For reduced motion, skip the performance optimization classes
    const isReducedMotion = prefersReducedMotion()

    if (!isReducedMotion) {
      // Add theme switching class for performance optimization (only for normal motion)
      root.classList.add('theme-switching')
    }

    // Apply CSS custom properties
    root.style.setProperty('--color-primary', colors.primary)
    root.style.setProperty('--color-secondary', colors.secondary)
    root.style.setProperty('--color-accent', colors.accent)
    root.style.setProperty('--color-background', colors.background)
    root.style.setProperty('--color-surface', colors.surface)
    root.style.setProperty('--color-text', colors.text)
    root.style.setProperty('--color-text-secondary', colors.textSecondary)
    root.style.setProperty('--color-border', colors.border)
    root.style.setProperty('--color-error', colors.error)
    root.style.setProperty('--color-warning', colors.warning)
    root.style.setProperty('--color-success', colors.success)

    // Set data attribute for theme-specific styling
    root.dataset.theme = currentTheme.mode

    if (isReducedMotion) {
      // For reduced motion, clean up immediately without transitions
      return () => {
        // No cleanup needed for reduced motion
      }
    }

    // Clean up performance optimization class after transition (normal motion only)
    let completeTimer: ReturnType<typeof setTimeout>
    const cleanupTimer = setTimeout(() => {
      root.classList.remove('theme-switching')
      root.classList.add('theme-switch-complete')

      // Remove the complete class after a brief moment
      completeTimer = setTimeout(() => {
        root.classList.remove('theme-switch-complete')
      }, 50)
    }, 300) // Allow for the longest transition (300ms)

    return () => {
      clearTimeout(cleanupTimer)
      if (completeTimer) clearTimeout(completeTimer)
      root.classList.remove('theme-switching', 'theme-switch-complete')
    }
  }, [currentTheme])

  const contextValue: ThemeContextValue = useMemo(
    () => ({
      currentTheme,
      themeMode: themeModeValue,
      availableThemes,
      systemPreference,
      activeCustomTheme: customThemeValue,
      setThemeMode,
      setCustomTheme,
      setActiveTheme,
    }),
    [
      currentTheme,
      themeModeValue,
      availableThemes,
      systemPreference,
      customThemeValue,
      setThemeMode,
      setCustomTheme,
      setActiveTheme,
    ],
  )

  return <ThemeContext value={contextValue}>{children}</ThemeContext>
}
