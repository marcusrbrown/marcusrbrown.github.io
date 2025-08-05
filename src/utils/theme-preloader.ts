import type {Theme, ThemeMode} from '../types'

/**
 * FOUC Prevention Theme Preloader
 *
 * This utility provides functions to prevent Flash of Unstyled Content (FOUC)
 * by applying theme colors immediately before React loads and hydrates.
 */

// Default theme definitions (duplicated here to avoid imports in inline script)
const DEFAULT_LIGHT_THEME = {
  id: 'default-light',
  name: 'Light',
  mode: 'light' as const,
  colors: {
    primary: '#2563eb',
    secondary: '#64748b',
    accent: '#0ea5e9',
    background: '#ffffff',
    surface: '#f8fafc',
    text: '#0f172a',
    textSecondary: '#64748b',
    border: '#e2e8f0',
    error: '#dc2626',
    warning: '#d97706',
    success: '#16a34a',
  },
}

const DEFAULT_DARK_THEME = {
  id: 'default-dark',
  name: 'Dark',
  mode: 'dark' as const,
  colors: {
    primary: '#3b82f6',
    secondary: '#94a3b8',
    accent: '#0ea5e9',
    background: '#0f172a',
    surface: '#1e293b',
    text: '#f1f5f9',
    textSecondary: '#94a3b8',
    border: '#334155',
    error: '#ef4444',
    warning: '#f59e0b',
    success: '#22c55e',
  },
}

// Storage keys (must match theme-storage.ts)
const STORAGE_KEYS = {
  THEME_MODE: 'mrbro-dev-theme-mode',
  CUSTOM_THEME: 'mrbro-dev-custom-theme',
} as const

/**
 * Applies theme colors to CSS custom properties
 * Optimized for speed - no validation to minimize script size
 */
const applyThemeColors = (theme: Theme): void => {
  const root = document.documentElement
  const {colors} = theme

  // Apply CSS custom properties directly
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
  root.dataset['theme'] = theme.mode
}

/**
 * Detects system color scheme preference
 */
const getSystemPreference = (): 'light' | 'dark' => {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return 'light'
  }

  try {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    return mediaQuery?.matches ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

/**
 * Safely parses JSON from localStorage
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
 * Loads and applies the current theme before React hydration
 * This function should be called in an inline script in the HTML head
 */
export const preloadTheme = (): void => {
  try {
    // Early return if not in browser environment
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return
    }

    let currentTheme: Theme

    // Try to load custom theme first
    const customThemeJson = localStorage.getItem(STORAGE_KEYS.CUSTOM_THEME)
    const customTheme = safeParse<Theme>(customThemeJson)

    if (customTheme && customTheme.colors) {
      // Use custom theme if available and valid
      currentTheme = customTheme
    } else {
      // Determine theme mode
      const savedThemeMode = localStorage.getItem(STORAGE_KEYS.THEME_MODE) as ThemeMode | null
      const themeMode: ThemeMode =
        savedThemeMode && ['light', 'dark', 'system'].includes(savedThemeMode) ? savedThemeMode : 'system'

      // Resolve actual theme based on mode
      const resolvedMode = themeMode === 'system' ? getSystemPreference() : themeMode
      currentTheme = resolvedMode === 'dark' ? DEFAULT_DARK_THEME : DEFAULT_LIGHT_THEME
    }

    // Apply theme immediately
    applyThemeColors(currentTheme)
  } catch (error) {
    // Silently fall back to light theme on any error
    console.warn('Theme preloader failed, falling back to light theme:', error)
    applyThemeColors(DEFAULT_LIGHT_THEME)
  }
}

/**
 * Generates the inline script code for theme preloading
 * This can be injected into the HTML head as a script tag
 */
export const generateThemePreloaderScript = (): string => {
  // Create a self-contained script that includes all necessary code
  const script = `
(function() {
  'use strict';

  // Default theme definitions
  var DEFAULT_LIGHT_THEME = {
    id: 'default-light',
    name: 'Light',
    mode: 'light',
    colors: {
      primary: '#2563eb',
      secondary: '#64748b',
      accent: '#0ea5e9',
      background: '#ffffff',
      surface: '#f8fafc',
      text: '#0f172a',
      textSecondary: '#64748b',
      border: '#e2e8f0',
      error: '#dc2626',
      warning: '#d97706',
      success: '#16a34a'
    }
  };

  var DEFAULT_DARK_THEME = {
    id: 'default-dark',
    name: 'Dark',
    mode: 'dark',
    colors: {
      primary: '#3b82f6',
      secondary: '#94a3b8',
      accent: '#0ea5e9',
      background: '#0f172a',
      surface: '#1e293b',
      text: '#f1f5f9',
      textSecondary: '#94a3b8',
      border: '#334155',
      error: '#ef4444',
      warning: '#f59e0b',
      success: '#22c55e'
    }
  };

  // Storage keys
  var STORAGE_KEYS = {
    THEME_MODE: 'mrbro-dev-theme-mode',
    CUSTOM_THEME: 'mrbro-dev-custom-theme'
  };

  // Apply theme colors to CSS custom properties
  function applyThemeColors(theme) {
    var root = document.documentElement;
    var colors = theme.colors;

    root.style.setProperty('--color-primary', colors.primary);
    root.style.setProperty('--color-secondary', colors.secondary);
    root.style.setProperty('--color-accent', colors.accent);
    root.style.setProperty('--color-background', colors.background);
    root.style.setProperty('--color-surface', colors.surface);
    root.style.setProperty('--color-text', colors.text);
    root.style.setProperty('--color-text-secondary', colors.textSecondary);
    root.style.setProperty('--color-border', colors.border);
    root.style.setProperty('--color-error', colors.error);
    root.style.setProperty('--color-warning', colors.warning);
    root.style.setProperty('--color-success', colors.success);

    root.setAttribute('data-theme', theme.mode);
  }

  // Get system color scheme preference
  function getSystemPreference() {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return 'light';
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  // Safely parse JSON
  function safeParse(value) {
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch (e) {
      return null;
    }
  }

  // Main preload function
  function preloadTheme() {
    try {
      if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
        return;
      }

      var currentTheme;

      // Try to load custom theme first
      var customThemeJson = localStorage.getItem(STORAGE_KEYS.CUSTOM_THEME);
      var customTheme = safeParse(customThemeJson);

      if (customTheme && customTheme.colors) {
        currentTheme = customTheme;
      } else {
        // Determine theme mode
        var savedThemeMode = localStorage.getItem(STORAGE_KEYS.THEME_MODE);
        var themeMode = savedThemeMode && ['light', 'dark', 'system'].indexOf(savedThemeMode) !== -1
          ? savedThemeMode
          : 'system';

        // Resolve actual theme based on mode
        var resolvedMode = themeMode === 'system' ? getSystemPreference() : themeMode;
        currentTheme = resolvedMode === 'dark' ? DEFAULT_DARK_THEME : DEFAULT_LIGHT_THEME;
      }

      // Apply theme immediately
      applyThemeColors(currentTheme);

    } catch (error) {
      // Silently fall back to light theme on any error
      console.warn && console.warn('Theme preloader failed, falling back to light theme:', error);
      applyThemeColors(DEFAULT_LIGHT_THEME);
    }
  }

  // Execute immediately
  preloadTheme();
})();
`.trim()

  return script
}

/**
 * Alternative: Generate a minimal inline script for critical path optimization
 * This version only handles the most common case (light/dark/system) without custom themes
 */
export const generateMinimalThemePreloaderScript = (): string => {
  const script = `
(function(){
  try {
    var mode = localStorage.getItem('mrbro-dev-theme-mode') || 'system';
    var isDark = mode === 'system' ? (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) : mode === 'dark';
    var root = document.documentElement;
    if (isDark) {
      root.style.setProperty('--color-primary', '#3b82f6');
      root.style.setProperty('--color-background', '#0f172a');
      root.style.setProperty('--color-surface', '#1e293b');
      root.style.setProperty('--color-text', '#f1f5f9');
      root.style.setProperty('--color-text-secondary', '#94a3b8');
      root.style.setProperty('--color-border', '#334155');
      root.setAttribute('data-theme', 'dark');
    } else {
      root.style.setProperty('--color-primary', '#2563eb');
      root.style.setProperty('--color-background', '#ffffff');
      root.style.setProperty('--color-surface', '#f8fafc');
      root.style.setProperty('--color-text', '#0f172a');
      root.style.setProperty('--color-text-secondary', '#64748b');
      root.style.setProperty('--color-border', '#e2e8f0');
      root.setAttribute('data-theme', 'light');
    }
  } catch(e) {}
})();
`.trim()

  return script
}
