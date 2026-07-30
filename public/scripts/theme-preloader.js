// Enhanced preloader script with custom theme support.
// Prevents flash of unstyled content (FOUC) by applying theme before React loads.
;(function () {
  try {
    var root = document.documentElement
    var currentTheme = null

    // Add theme-preload class to disable transitions on initial load
    root.classList.add('theme-preload')

    // Helper to safely parse JSON from localStorage
    function safeParse(value) {
      if (!value) return null
      try {
        return JSON.parse(value)
      } catch (e) {
        return null
      }
    }

    // Helper to apply theme colors to CSS custom properties
    function applyTheme(theme) {
      var colors = theme.colors
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
      root.setAttribute('data-theme', theme.mode)
    }

    // Default themes
    var DEFAULT_LIGHT = {
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
        success: '#16a34a',
      },
    }

    var DEFAULT_DARK = {
      mode: 'dark',
      colors: {
        primary: '#1d4ed8',
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

    // Try to load custom theme first
    var customThemeJson = localStorage.getItem('mrbro-dev-custom-theme')
    var customTheme = safeParse(customThemeJson)

    if (customTheme && customTheme.colors) {
      // Use custom theme if available and valid
      currentTheme = customTheme
    } else {
      // Determine theme mode
      var mode = localStorage.getItem('mrbro-dev-theme-mode')
      mode = safeParse(mode) || 'system'

      // Resolve actual theme based on mode
      var isDark =
        mode === 'system'
          ? window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
          : mode === 'dark'

      currentTheme = isDark ? DEFAULT_DARK : DEFAULT_LIGHT
    }

    // Apply theme immediately
    applyTheme(currentTheme)
  } catch (e) {
    // Silent fallback - CSS will handle default styling
  }
})()
