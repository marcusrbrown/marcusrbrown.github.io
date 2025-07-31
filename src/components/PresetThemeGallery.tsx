/**
 * PresetThemeGallery Component
 *
 * Displays a curated collection of popular preset themes in a responsive grid layout.
 * Users can preview themes, see color palettes, and apply themes with a single click.
 * Includes filtering by mode (light/dark) and search functionality.
 */

import type {Theme} from '../types'
import {useCallback, useMemo, useState} from 'react'
import {useTheme} from '../hooks/UseTheme'
import {getPresetThemes, getPresetThemesByMode, searchPresetThemes} from '../utils/preset-themes'

interface PresetThemeCardProps {
  theme: Theme
  isActive: boolean
  onApply: (theme: Theme) => void
  onPreview: (theme: Theme | null) => void
}

/**
 * Individual preset theme card component
 */
const PresetThemeCard = ({theme, isActive, onApply, onPreview}: PresetThemeCardProps) => {
  const handleMouseEnter = useCallback(() => {
    onPreview(theme)
  }, [theme, onPreview])

  const handleMouseLeave = useCallback(() => {
    onPreview(null)
  }, [onPreview])

  const handleApply = useCallback(() => {
    onApply(theme)
  }, [theme, onApply])

  return (
    <div
      className={`preset-theme-card ${isActive ? 'active' : ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      role="button"
      tabIndex={0}
      onClick={handleApply}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleApply()
        }
      }}
      aria-label={`Apply ${theme.name} theme`}
    >
      <div className="preset-theme-header">
        <h3 className="preset-theme-name">{theme.name}</h3>
        <span className={`preset-theme-mode mode-${theme.mode}`}>{theme.mode}</span>
      </div>

      {theme.description && <p className="preset-theme-description">{theme.description}</p>}

      {/* Color palette preview */}
      <div className="preset-theme-colors">
        <div
          className="color-swatch"
          style={{backgroundColor: theme.colors.primary}}
          title={`Primary: ${theme.colors.primary}`}
        />
        <div
          className="color-swatch"
          style={{backgroundColor: theme.colors.secondary}}
          title={`Secondary: ${theme.colors.secondary}`}
        />
        <div
          className="color-swatch"
          style={{backgroundColor: theme.colors.accent}}
          title={`Accent: ${theme.colors.accent}`}
        />
        <div
          className="color-swatch"
          style={{backgroundColor: theme.colors.background}}
          title={`Background: ${theme.colors.background}`}
        />
        <div
          className="color-swatch"
          style={{backgroundColor: theme.colors.surface}}
          title={`Surface: ${theme.colors.surface}`}
        />
      </div>

      {/* Theme metadata */}
      <div className="preset-theme-meta">
        {theme.author && <span className="theme-author">by {theme.author}</span>}
        {theme.tags && (
          <div className="theme-tags">
            {theme.tags.slice(0, 3).map(tag => (
              <span key={tag} className="theme-tag">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {isActive && (
        <div className="active-indicator">
          <span>Active</span>
        </div>
      )}
    </div>
  )
}

interface PresetThemeGalleryProps {
  onThemeApply?: (theme: Theme) => void
  className?: string
}

/**
 * Main preset theme gallery component
 */
export const PresetThemeGallery = ({onThemeApply, className = ''}: PresetThemeGalleryProps) => {
  const {currentTheme, setCustomTheme} = useTheme()
  const [searchQuery, setSearchQuery] = useState('')
  const [modeFilter, setModeFilter] = useState<'all' | 'light' | 'dark'>('all')
  const [previewTheme, setPreviewTheme] = useState<Theme | null>(null)

  // Get all preset themes
  const allPresetThemes = useMemo(() => getPresetThemes(), [])

  // Filter themes based on search and mode filter
  const filteredThemes = useMemo(() => {
    let themes = allPresetThemes

    // Apply search filter
    if (searchQuery.trim()) {
      themes = searchPresetThemes(searchQuery.trim())
    }

    // Apply mode filter
    if (modeFilter !== 'all') {
      themes = getPresetThemesByMode(modeFilter)
    }

    // If both filters are applied, combine them
    if (searchQuery.trim() && modeFilter !== 'all') {
      themes = searchPresetThemes(searchQuery.trim()).filter(theme => theme.mode === modeFilter)
    }

    return themes
  }, [allPresetThemes, searchQuery, modeFilter])

  // Handle theme application
  const handleApplyTheme = useCallback(
    (theme: Theme) => {
      setCustomTheme(theme)
      onThemeApply?.(theme)
    },
    [setCustomTheme, onThemeApply],
  )

  // Handle theme preview
  const handlePreviewTheme = useCallback((theme: Theme | null) => {
    setPreviewTheme(theme)
  }, [])

  // Check if a theme is currently active
  const isThemeActive = useCallback(
    (theme: Theme) => {
      return currentTheme.id === theme.id
    },
    [currentTheme],
  )

  return (
    <div className={`preset-theme-gallery ${className}`}>
      <div className="gallery-header">
        <h2>Preset Theme Gallery</h2>
        <p>Choose from a curated collection of popular color schemes</p>
      </div>

      {/* Filters and search */}
      <div className="gallery-controls">
        <div className="search-control">
          <input
            type="text"
            placeholder="Search themes..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="theme-search-input"
            aria-label="Search preset themes"
          />
        </div>

        <div className="mode-filter">
          <label htmlFor="mode-filter">Mode:</label>
          <select
            id="mode-filter"
            value={modeFilter}
            onChange={e => setModeFilter(e.target.value as 'all' | 'light' | 'dark')}
            className="mode-filter-select"
          >
            <option value="all">All Themes</option>
            <option value="light">Light Themes</option>
            <option value="dark">Dark Themes</option>
          </select>
        </div>
      </div>

      {/* Theme grid */}
      <div className="preset-themes-grid">
        {filteredThemes.length > 0 ? (
          filteredThemes.map(theme => (
            <PresetThemeCard
              key={theme.id}
              theme={theme}
              isActive={isThemeActive(theme)}
              onApply={handleApplyTheme}
              onPreview={handlePreviewTheme}
            />
          ))
        ) : (
          <div className="no-themes-message">
            <p>No themes found matching your criteria.</p>
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="clear-search-btn">
                Clear search
              </button>
            )}
          </div>
        )}
      </div>

      {/* Preview section */}
      {previewTheme && (
        <div className="theme-preview-section">
          <h3>Preview: {previewTheme.name}</h3>
          {/* Theme preview could be enhanced with actual component previews */}
          <div className="preview-colors">
            {Object.entries(previewTheme.colors).map(([key, value]) => (
              <div key={key} className="preview-color-item">
                <div className="preview-color-swatch" style={{backgroundColor: value}} />
                <span className="preview-color-label">
                  {key}: {value}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default PresetThemeGallery
