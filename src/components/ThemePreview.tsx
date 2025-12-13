/**
 * ThemePreview Component
 *
 * Real-time preview of theme changes showing how the theme affects
 * various UI components including headers, cards, buttons, text, and status indicators.
 * Uses scoped CSS custom properties to avoid affecting the parent application.
 */

import type {Theme, ThemeColors} from '../types'
import {useMemo} from 'react'

interface ThemePreviewProps {
  theme: Theme
  className?: string
}

/**
 * Generate CSS custom properties object from theme colors
 */
const generateThemeCSSProperties = (colors: ThemeColors): React.CSSProperties => {
  return {
    '--color-primary': colors.primary,
    '--color-secondary': colors.secondary,
    '--color-accent': colors.accent,
    '--color-background': colors.background,
    '--color-surface': colors.surface,
    '--color-text': colors.text,
    '--color-textSecondary': colors.textSecondary,
    '--color-border': colors.border,
    '--color-error': colors.error,
    '--color-warning': colors.warning,
    '--color-success': colors.success,

    // Derived colors for better preview
    '--color-link': colors.primary,
    '--color-link-hover': colors.accent,
    '--color-header-bg': colors.surface,
    '--color-header-text': colors.text,
    '--color-card-bg': colors.surface,
    '--color-shadow': `${colors.text}20`, // 20% opacity

    // Transitions
    '--transition-theme': '0.2s ease',
    '--transition-theme-fast': '0.1s ease',
  } as React.CSSProperties
}

export const ThemePreview: React.FC<ThemePreviewProps> = ({theme, className = ''}) => {
  // Generate CSS custom properties from theme
  const themeStyles = useMemo(() => generateThemeCSSProperties(theme.colors), [theme.colors])

  return (
    <div className={`theme-preview ${className}`} style={themeStyles}>
      <div className="theme-preview__container">
        {/* Header Preview */}
        <header className="theme-preview__header">
          <div className="theme-preview__header-content">
            <h1 className="theme-preview__title">mrbro.dev</h1>
            <nav className="theme-preview__nav">
              <a href="#" className="theme-preview__nav-link">
                Home
              </a>
              <a href="#" className="theme-preview__nav-link">
                Blog
              </a>
              <a href="#" className="theme-preview__nav-link">
                Projects
              </a>
              <a href="#" className="theme-preview__nav-link">
                About
              </a>
            </nav>
          </div>
        </header>

        {/* Content Preview */}
        <main className="theme-preview__main">
          {/* Text Content */}
          <section className="theme-preview__section">
            <h2 className="theme-preview__heading">Welcome to My Portfolio</h2>
            <p className="theme-preview__text">
              This is a preview of how your custom theme will look across different elements.
            </p>
            <p className="theme-preview__text theme-preview__text--secondary">
              Secondary text provides supporting information and descriptions.
            </p>
          </section>

          {/* Button Previews */}
          <section className="theme-preview__section">
            <h3 className="theme-preview__subheading">Buttons & Links</h3>
            <div className="theme-preview__buttons">
              <button type="button" className="theme-preview__button theme-preview__button--primary">
                Primary Action
              </button>
              <button type="button" className="theme-preview__button theme-preview__button--secondary">
                Secondary Action
              </button>
              <a href="#" className="theme-preview__link">
                Sample Link
              </a>
            </div>
          </section>

          {/* Card Preview */}
          <section className="theme-preview__section">
            <h3 className="theme-preview__subheading">Project Card</h3>
            <div className="theme-preview__card">
              <h4 className="theme-preview__card-title">Sample Project</h4>
              <p className="theme-preview__card-description">
                This is how project cards will appear with your custom theme colors.
              </p>
              <a href="#" className="theme-preview__card-link">
                View Project
              </a>
            </div>
          </section>

          {/* Status Indicators */}
          <section className="theme-preview__section">
            <h3 className="theme-preview__subheading">Status Messages</h3>
            <div className="theme-preview__status-messages">
              <div className="theme-preview__status theme-preview__status--success">
                ✓ Success: Theme saved successfully!
              </div>
              <div className="theme-preview__status theme-preview__status--warning">
                ⚠ Warning: Consider color contrast ratios
              </div>
              <div className="theme-preview__status theme-preview__status--error">✗ Error: Invalid color format</div>
            </div>
          </section>

          {/* Code Block Preview */}
          <section className="theme-preview__section">
            <h3 className="theme-preview__subheading">Code Block</h3>
            <div className="theme-preview__code-block">
              <code className="theme-preview__code">
                <span className="theme-preview__code-keyword">const</span>{' '}
                <span className="theme-preview__code-variable">theme</span>{' '}
                <span className="theme-preview__code-operator">=</span>{' '}
                <span className="theme-preview__code-string">"{theme.name}"</span>
              </code>
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}

export default ThemePreview
