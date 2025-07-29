import React from 'react'
import {useTheme} from '../hooks/UseTheme'

/**
 * ThemeToggle component provides an accessible interface for switching between theme modes
 *
 * Features:
 * - Cycles through light → dark → system preference modes
 * - Keyboard accessible (Enter/Space activation, focusable)
 * - Screen reader friendly with ARIA labels
 * - Visual indicators for current theme state
 * - WCAG 2.1 AA color contrast compliant
 */
const ThemeToggle: React.FC = () => {
  const {themeMode, isDarkMode, isLightMode, setThemeMode} = useTheme()

  const handleToggle = () => {
    // Cycle through themes: light → dark → system → light...
    if (isLightMode) {
      setThemeMode('dark')
    } else if (isDarkMode) {
      setThemeMode('system')
    } else {
      setThemeMode('light')
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent) => {
    // Activate on Enter or Space (standard accessibility pattern)
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleToggle()
    }
  }

  // Dynamic ARIA label based on current state and next action
  const getAriaLabel = (): string => {
    if (isLightMode) {
      return 'Switch to dark mode'
    } else if (isDarkMode) {
      return 'Switch to system theme preference'
    } else {
      return 'Switch to light mode'
    }
  }

  // Visual icon based on current theme mode
  const getThemeIcon = (): string => {
    if (isLightMode) {
      return '☀️' // Sun for light mode
    } else if (isDarkMode) {
      return '🌙' // Moon for dark mode
    } else {
      return '🖥️' // Computer for system mode
    }
  }

  // Screen reader friendly current state description
  const getCurrentThemeDescription = (): string => {
    if (isLightMode) {
      return 'Current theme: Light mode'
    } else if (isDarkMode) {
      return 'Current theme: Dark mode'
    } else {
      return 'Current theme: System preference'
    }
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      onKeyDown={handleKeyDown}
      className="theme-toggle"
      aria-label={getAriaLabel()}
      aria-describedby="theme-toggle-description"
      tabIndex={0}
    >
      <span className="theme-toggle__icon" aria-hidden="true">
        {getThemeIcon()}
      </span>
      <span className="theme-toggle__text">{themeMode.charAt(0).toUpperCase() + themeMode.slice(1)}</span>
      <span id="theme-toggle-description" className="sr-only" aria-live="polite">
        {getCurrentThemeDescription()}
      </span>
    </button>
  )
}

export default ThemeToggle
