/**
 * ThemeCustomizer Component
 *
 * Advanced theme creation interface with HSL color controls, real-time preview,
 * theme validation, save/export/import functionality, and theme library management.
 * Follows compound component pattern for modularity.
 */

import type {ColorValue, HSLColor, ResolvedThemeMode, Theme, ThemeColors} from '../types'
import {useCallback, useMemo, useRef, useState} from 'react'
import {useTheme} from '../hooks/UseTheme'
import {copyThemeToClipboard, exportTheme, importTheme, validateThemeFile} from '../utils/theme-export'
import {loadSavedThemes, removeThemeFromLibrary, saveThemeToLibrary} from '../utils/theme-storage'
import {rgbToHsl, validateTheme, validateThemeAccessibility} from '../utils/theme-validation'
import PresetThemeGallery from './PresetThemeGallery'
import ThemePreview from './ThemePreview'

interface ParsedColor {
  type: 'hsl' | 'rgb' | 'hex' | 'other'
  value: HSLColor | {r: number; g: number; b: number} | string
}

/**
 * Simple color parsing utility
 */
const parseColor = (color: ColorValue): ParsedColor => {
  const colorStr = color.toString().trim().toLowerCase()

  // HSL pattern
  const hslMatch = colorStr.match(/^hsl\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%\s*\)$/)
  if (hslMatch && hslMatch[1] && hslMatch[2] && hslMatch[3]) {
    return {
      type: 'hsl',
      value: {
        h: Number.parseInt(hslMatch[1], 10),
        s: Number.parseInt(hslMatch[2], 10),
        l: Number.parseInt(hslMatch[3], 10),
      },
    }
  }

  // RGB pattern
  const rgbMatch = colorStr.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/)
  if (rgbMatch && rgbMatch[1] && rgbMatch[2] && rgbMatch[3]) {
    return {
      type: 'rgb',
      value: {
        r: Number.parseInt(rgbMatch[1], 10),
        g: Number.parseInt(rgbMatch[2], 10),
        b: Number.parseInt(rgbMatch[3], 10),
      },
    }
  }

  // Hex pattern
  if (/^#[0-9a-f]{3,8}$/i.test(colorStr)) {
    return {
      type: 'hex',
      value: colorStr,
    }
  }

  return {
    type: 'other',
    value: colorStr,
  }
}

/**
 * Simple color validation utility
 */
const validateColor = (color: string): boolean => {
  const colorStr = color.trim().toLowerCase()

  // Check common patterns
  const patterns = [
    /^#[0-9a-f]{3}$/i,
    /^#[0-9a-f]{6}$/i,
    /^#[0-9a-f]{8}$/i,
    /^hsl\(\s*\d+\s*,\s*\d+%\s*,\s*\d+%\s*\)$/,
    /^hsla\(\s*\d+\s*,\s*\d+%\s*,\s*\d+%\s*,\s*[01](?:\.\d+)?\s*\)$/,
    /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/,
    /^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*[01](?:\.\d+)?\s*\)$/,
  ]

  return (
    patterns.some(pattern => pattern.test(colorStr)) || ['transparent', 'currentcolor', 'inherit'].includes(colorStr)
  )
}

interface ThemeCustomizerProps {
  className?: string
  onThemeChange?: (theme: Theme) => void
  onClose?: () => void
  showLibrary?: boolean
}

interface SavedThemeCardProps {
  theme: Theme
  onLoad: (theme: Theme) => void
  onDelete: (themeId: string) => void
  onExport: (theme: Theme) => void
}

interface ColorSectionProps {
  title: string
  colors: {
    key: keyof ThemeColors
    label: string
    description?: string
  }[]
  themeColors: ThemeColors
  onColorChange: (key: keyof ThemeColors, color: ColorValue) => void
}

interface ColorInputProps {
  label: string
  description?: string
  value: ColorValue
  onChange: (color: ColorValue) => void
}

interface HSLSliderProps {
  label: string
  value: number
  min: number
  max: number
  unit?: string
  onChange: (value: number) => void
}

/**
 * HSL Slider component for individual H, S, L value control
 */
const HSLSlider: React.FC<HSLSliderProps> = ({label, value, min, max, unit = '', onChange}) => {
  return (
    <div className="hsl-slider">
      <label className="hsl-slider__label">
        {label}: {value}
        {unit}
      </label>
      <input
        type="range"
        className="hsl-slider__input"
        min={min}
        max={max}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        aria-label={`${label} value`}
      />
    </div>
  )
}

/**
 * Color input component with HSL controls and validation
 */
const ColorInput: React.FC<ColorInputProps> = ({label, description, value, onChange}) => {
  const [hslValues, setHslValues] = useState<HSLColor>(() => {
    const parsed = parseColor(value)
    if (parsed.type === 'hsl') {
      return parsed.value as HSLColor
    }
    if (parsed.type === 'rgb') {
      return rgbToHsl(parsed.value as any)
    }
    // Fallback for hex or other formats
    return {h: 0, s: 50, l: 50}
  })

  const [showHSLControls, setShowHSLControls] = useState(false)
  const [textValue, setTextValue] = useState(value)
  const [isValid, setIsValid] = useState(true)

  // Convert HSL to color string
  const hslToColorValue = useCallback((hsl: HSLColor): ColorValue => {
    return `hsl(${Math.round(hsl.h)}, ${Math.round(hsl.s)}%, ${Math.round(hsl.l)}%)`
  }, [])

  // Handle HSL slider changes
  const handleHSLChange = useCallback(
    (component: 'h' | 's' | 'l', newValue: number) => {
      const newHSL = {...hslValues, [component]: newValue}
      setHslValues(newHSL)
      const colorValue = hslToColorValue(newHSL)
      setTextValue(colorValue)
      onChange(colorValue)
    },
    [hslValues, hslToColorValue, onChange],
  )

  // Handle text input changes
  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value
      setTextValue(newValue)

      const valid = validateColor(newValue)
      setIsValid(valid)

      if (valid) {
        onChange(newValue)

        // Update HSL values if possible
        const parsed = parseColor(newValue)
        if (parsed.type === 'hsl') {
          setHslValues(parsed.value as HSLColor)
        } else if (parsed.type === 'rgb') {
          setHslValues(rgbToHsl(parsed.value as any))
        }
      }
    },
    [onChange],
  )

  // Color preview style
  const previewStyle = useMemo(
    () => ({
      backgroundColor: isValid ? textValue : '#cccccc',
    }),
    [textValue, isValid],
  )

  return (
    <div className="color-input">
      <div className="color-input__header">
        <label className="color-input__label">{label}</label>
        {description && <span className="color-input__description">{description}</span>}
      </div>

      <div className="color-input__controls">
        <div className="color-input__preview" style={previewStyle} />

        <input
          type="text"
          className={`color-input__text ${isValid ? '' : 'color-input__text--invalid'}`}
          value={textValue}
          onChange={handleTextChange}
          placeholder="e.g., #ffffff, hsl(0, 100%, 50%)"
          aria-label={`${label} color value`}
        />

        <button
          type="button"
          className="color-input__toggle"
          onClick={() => setShowHSLControls(!showHSLControls)}
          aria-expanded={showHSLControls}
          aria-label={`${showHSLControls ? 'Hide' : 'Show'} HSL controls`}
        >
          HSL
        </button>
      </div>

      {!isValid && (
        <div className="color-input__error">
          Invalid color format. Use hex (#ffffff), hsl(), rgb(), or named colors.
        </div>
      )}

      {showHSLControls && (
        <div className="color-input__hsl-controls">
          <HSLSlider
            label="Hue"
            value={hslValues.h}
            min={0}
            max={360}
            unit="°"
            onChange={value => handleHSLChange('h', value)}
          />
          <HSLSlider
            label="Saturation"
            value={hslValues.s}
            min={0}
            max={100}
            unit="%"
            onChange={value => handleHSLChange('s', value)}
          />
          <HSLSlider
            label="Lightness"
            value={hslValues.l}
            min={0}
            max={100}
            unit="%"
            onChange={value => handleHSLChange('l', value)}
          />
        </div>
      )}
    </div>
  )
}

/**
 * Saved theme card component for the theme library
 */
const SavedThemeCard: React.FC<SavedThemeCardProps> = ({theme, onLoad, onDelete, onExport}) => {
  return (
    <div className="saved-theme-card">
      <div className="saved-theme-card__header">
        <h4 className="saved-theme-card__name">{theme.name}</h4>
        <span className="saved-theme-card__mode">{theme.mode}</span>
      </div>

      <div className="saved-theme-card__preview">
        <div
          className="saved-theme-card__color-preview"
          style={
            {
              '--preview-primary': theme.colors.primary,
              '--preview-background': theme.colors.background,
              '--preview-surface': theme.colors.surface,
              '--preview-text': theme.colors.text,
            } as React.CSSProperties
          }
        >
          <div className="saved-theme-card__color" style={{backgroundColor: theme.colors.primary}} title="Primary" />
          <div
            className="saved-theme-card__color"
            style={{backgroundColor: theme.colors.background}}
            title="Background"
          />
          <div className="saved-theme-card__color" style={{backgroundColor: theme.colors.surface}} title="Surface" />
          <div className="saved-theme-card__color" style={{backgroundColor: theme.colors.text}} title="Text" />
        </div>
      </div>

      <div className="saved-theme-card__actions">
        <button
          type="button"
          className="saved-theme-card__action saved-theme-card__action--primary"
          onClick={() => onLoad(theme)}
        >
          Load
        </button>
        <button
          type="button"
          className="saved-theme-card__action saved-theme-card__action--secondary"
          onClick={() => onExport(theme)}
        >
          Export
        </button>
        <button
          type="button"
          className="saved-theme-card__action saved-theme-card__action--danger"
          onClick={() => onDelete(theme.id)}
        >
          Delete
        </button>
      </div>
    </div>
  )
}

/**
 * Color section component grouping related colors
 */
const ColorSection: React.FC<ColorSectionProps> = ({title, colors, themeColors, onColorChange}) => {
  return (
    <section className="color-section">
      <h3 className="color-section__title">{title}</h3>
      <div className="color-section__colors">
        {colors.map(({key, label, description}) => (
          <ColorInput
            key={key}
            label={label}
            description={description}
            value={themeColors[key]}
            onChange={color => onColorChange(key, color)}
          />
        ))}
      </div>
    </section>
  )
}

/**
 * Main ThemeCustomizer component
 */
export const ThemeCustomizer: React.FC<ThemeCustomizerProps> = ({
  className = '',
  onThemeChange,
  onClose,
  showLibrary: _showLibrary = false,
}) => {
  const {currentTheme, setCustomTheme} = useTheme()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Local theme state for editing
  const [editingTheme, setEditingTheme] = useState<Theme>(() => ({
    ...currentTheme,
    id: `custom-${Date.now()}`,
    name: `Custom ${currentTheme.mode.charAt(0).toUpperCase() + currentTheme.mode.slice(1)}`,
    isBuiltIn: false,
  }))

  const [themeMode, setThemeMode] = useState<ResolvedThemeMode>(currentTheme.mode)
  const [themeName, setThemeName] = useState(editingTheme.name)
  const [savedThemes, setSavedThemes] = useState<Theme[]>(() => loadSavedThemes())
  const [activeTab, setActiveTab] = useState<'editor' | 'presets' | 'library'>('editor')
  const [notification, setNotification] = useState<{type: 'success' | 'error'; message: string} | null>(null)

  // Get accessibility validation results for the current theme
  const accessibilityResults = useMemo(() => {
    return validateThemeAccessibility(editingTheme)
  }, [editingTheme.colors])

  // Show notification temporarily
  const showNotification = useCallback((type: 'success' | 'error', message: string) => {
    setNotification({type, message})
    setTimeout(() => setNotification(null), 3000)
  }, [])

  // Handle color changes
  const handleColorChange = useCallback(
    (key: keyof ThemeColors, color: ColorValue) => {
      const updatedTheme = {
        ...editingTheme,
        colors: {
          ...editingTheme.colors,
          [key]: color,
        },
      }
      setEditingTheme(updatedTheme)
      onThemeChange?.(updatedTheme)
    },
    [editingTheme, onThemeChange],
  )

  // Handle theme mode change
  const handleThemeModeChange = useCallback(
    (mode: ResolvedThemeMode) => {
      setThemeMode(mode)
      const updatedTheme = {
        ...editingTheme,
        mode,
        id: `custom-${mode}-${Date.now()}`,
        name: `Custom ${mode.charAt(0).toUpperCase() + mode.slice(1)}`,
      }
      setEditingTheme(updatedTheme)
      onThemeChange?.(updatedTheme)
    },
    [editingTheme, onThemeChange],
  )

  // Handle theme name change
  const handleThemeNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const name = e.target.value
      setThemeName(name)
      const updatedTheme = {
        ...editingTheme,
        name,
      }
      setEditingTheme(updatedTheme)
    },
    [editingTheme],
  )

  // Apply theme
  const handleApplyTheme = useCallback(() => {
    const isValidTheme = validateTheme(editingTheme)
    if (isValidTheme) {
      setCustomTheme(editingTheme)
      onClose?.()
    } else {
      console.warn('Theme validation failed')
      // TODO: Show validation errors to user
    }
  }, [editingTheme, setCustomTheme, onClose])

  // Reset to current theme
  const handleReset = useCallback(() => {
    setEditingTheme({
      ...currentTheme,
      id: `custom-${Date.now()}`,
      name: `Custom ${currentTheme.mode.charAt(0).toUpperCase() + currentTheme.mode.slice(1)}`,
      isBuiltIn: false,
    })
    setThemeMode(currentTheme.mode)
    setThemeName(`Custom ${currentTheme.mode.charAt(0).toUpperCase() + currentTheme.mode.slice(1)}`)
  }, [currentTheme])

  // Save theme to library
  const handleSaveTheme = useCallback(() => {
    const isValidTheme = validateTheme(editingTheme)
    if (isValidTheme) {
      const themeToSave = {
        ...editingTheme,
        name: themeName,
        updatedAt: new Date().toISOString(),
      }

      const success = saveThemeToLibrary(themeToSave)
      if (success) {
        setSavedThemes(loadSavedThemes())
        showNotification('success', `Theme "${themeName}" saved successfully!`)
      } else {
        showNotification('error', 'Failed to save theme')
      }
    } else {
      showNotification('error', 'Theme validation failed')
    }
  }, [editingTheme, themeName, showNotification])

  // Export theme as JSON file
  const handleExportTheme = useCallback(
    (theme?: Theme) => {
      const themeToExport = theme || editingTheme
      try {
        exportTheme(themeToExport)
        showNotification('success', 'Theme exported successfully!')
      } catch {
        showNotification('error', 'Failed to export theme')
      }
    },
    [editingTheme, showNotification],
  )

  // Copy theme to clipboard
  const handleCopyTheme = useCallback(async () => {
    try {
      await copyThemeToClipboard(editingTheme)
      showNotification('success', 'Theme copied to clipboard!')
    } catch {
      showNotification('error', 'Failed to copy theme to clipboard')
    }
  }, [editingTheme, showNotification])

  // Import theme from file
  const handleImportTheme = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) return

      const errors = validateThemeFile(file)
      if (errors.length > 0) {
        showNotification('error', `Invalid file: ${errors.join(', ')}`)
        return
      }

      importTheme(file)
        .then(importedTheme => {
          setEditingTheme(importedTheme)
          setThemeMode(importedTheme.mode)
          setThemeName(importedTheme.name)
          showNotification('success', `Theme "${importedTheme.name}" imported successfully!`)
          onThemeChange?.(importedTheme)
        })
        .catch(error => {
          showNotification('error', `Import failed: ${error.message}`)
        })
        .finally(() => {
          // Reset file input
          if (fileInputRef.current) {
            fileInputRef.current.value = ''
          }
        })
    },
    [onThemeChange, showNotification],
  )

  // Load saved theme
  const handleLoadSavedTheme = useCallback(
    (theme: Theme) => {
      setEditingTheme(theme)
      setThemeMode(theme.mode)
      setThemeName(theme.name)
      onThemeChange?.(theme)
      showNotification('success', `Theme "${theme.name}" loaded!`)
    },
    [onThemeChange, showNotification],
  )

  // Delete saved theme
  const handleDeleteSavedTheme = useCallback(
    (themeId: string) => {
      const success = removeThemeFromLibrary(themeId)
      if (success) {
        setSavedThemes(loadSavedThemes())
        showNotification('success', 'Theme deleted successfully!')
      } else {
        showNotification('error', 'Failed to delete theme')
      }
    },
    [showNotification],
  )

  // Color sections configuration
  const colorSections = useMemo(
    () => [
      {
        title: 'Brand Colors',
        colors: [
          {
            key: 'primary' as keyof ThemeColors,
            label: 'Primary',
            description: 'Main brand color for buttons and links',
          },
          {key: 'secondary' as keyof ThemeColors, label: 'Secondary', description: 'Supporting brand color'},
          {key: 'accent' as keyof ThemeColors, label: 'Accent', description: 'Highlight and call-to-action color'},
        ],
      },
      {
        title: 'Background Colors',
        colors: [
          {key: 'background' as keyof ThemeColors, label: 'Background', description: 'Main page background'},
          {key: 'surface' as keyof ThemeColors, label: 'Surface', description: 'Cards and elevated content'},
        ],
      },
      {
        title: 'Text Colors',
        colors: [
          {key: 'text' as keyof ThemeColors, label: 'Text', description: 'Primary text color'},
          {
            key: 'textSecondary' as keyof ThemeColors,
            label: 'Secondary Text',
            description: 'Supporting text and descriptions',
          },
        ],
      },
      {
        title: 'Interface Colors',
        colors: [{key: 'border' as keyof ThemeColors, label: 'Border', description: 'Borders and dividers'}],
      },
      {
        title: 'Status Colors',
        colors: [
          {key: 'error' as keyof ThemeColors, label: 'Error', description: 'Error messages and warnings'},
          {key: 'warning' as keyof ThemeColors, label: 'Warning', description: 'Caution and attention'},
          {key: 'success' as keyof ThemeColors, label: 'Success', description: 'Success messages and confirmations'},
        ],
      },
    ],
    [],
  )

  return (
    <div className={`theme-customizer ${className}`}>
      <header className="theme-customizer__header">
        <h2 className="theme-customizer__title">Theme Customizer</h2>
        <div className="theme-customizer__tabs">
          <button
            type="button"
            className={`theme-customizer__tab ${activeTab === 'editor' ? 'theme-customizer__tab--active' : ''}`}
            onClick={() => setActiveTab('editor')}
          >
            Editor
          </button>
          <button
            type="button"
            className={`theme-customizer__tab ${activeTab === 'presets' ? 'theme-customizer__tab--active' : ''}`}
            onClick={() => setActiveTab('presets')}
          >
            Presets
          </button>
          <button
            type="button"
            className={`theme-customizer__tab ${activeTab === 'library' ? 'theme-customizer__tab--active' : ''}`}
            onClick={() => setActiveTab('library')}
          >
            Library ({savedThemes.length})
          </button>
        </div>
        {onClose && (
          <button
            type="button"
            className="theme-customizer__close"
            onClick={onClose}
            aria-label="Close theme customizer"
          >
            ×
          </button>
        )}
      </header>

      {notification && (
        <div className={`theme-customizer__notification theme-customizer__notification--${notification.type}`}>
          {notification.message}
        </div>
      )}

      <input ref={fileInputRef} type="file" accept=".json" onChange={handleImportTheme} style={{display: 'none'}} />

      {activeTab === 'editor' ? (
        <div className="theme-customizer__content">
          <section className="theme-customizer__metadata">
            <div className="theme-metadata">
              <label className="theme-metadata__label">
                Theme Name
                <input
                  type="text"
                  className="theme-metadata__input"
                  value={themeName}
                  onChange={handleThemeNameChange}
                  placeholder="Enter theme name"
                />
              </label>

              <fieldset className="theme-metadata__mode">
                <legend>Theme Mode</legend>
                <label className="theme-mode__option">
                  <input
                    type="radio"
                    name="themeMode"
                    value="light"
                    checked={themeMode === 'light'}
                    onChange={() => handleThemeModeChange('light')}
                  />
                  Light
                </label>
                <label className="theme-mode__option">
                  <input
                    type="radio"
                    name="themeMode"
                    value="dark"
                    checked={themeMode === 'dark'}
                    onChange={() => handleThemeModeChange('dark')}
                  />
                  Dark
                </label>
              </fieldset>
            </div>
          </section>

          <div className="theme-customizer__editor-layout">
            <div className="theme-customizer__sections">
              {colorSections.map(section => (
                <ColorSection
                  key={section.title}
                  title={section.title}
                  colors={section.colors}
                  themeColors={editingTheme.colors}
                  onColorChange={handleColorChange}
                />
              ))}
            </div>

            <aside className="theme-customizer__preview-panel">
              <h3 className="theme-customizer__preview-title">Live Preview</h3>
              <ThemePreview theme={editingTheme} className="theme-customizer__preview" />

              {/* Accessibility Status */}
              <div className="accessibility-status">
                <h4 className="accessibility-status__title">
                  Accessibility Status
                  {accessibilityResults.isAccessible ? (
                    <span className="accessibility-status__badge accessibility-status__badge--success">✓ WCAG AA</span>
                  ) : (
                    <span className="accessibility-status__badge accessibility-status__badge--warning">⚠ Issues</span>
                  )}
                </h4>

                {accessibilityResults.issues.length > 0 && (
                  <div className="accessibility-status__issues">
                    <p className="accessibility-status__warning">Color contrast issues found:</p>
                    <ul className="accessibility-status__issues-list">
                      {accessibilityResults.issues.map(({pair, contrast}, index) => (
                        <li key={index} className="accessibility-status__issue">
                          <strong>{pair[0]}</strong> on <strong>{pair[1]}</strong>: {contrast.ratio.toFixed(2)}:1
                          <span
                            className={`accessibility-status__grade accessibility-status__grade--${contrast.grade.toLowerCase()}`}
                          >
                            {contrast.grade}
                          </span>
                          {!contrast.meetsAA && (
                            <span className="accessibility-status__recommendation">(needs 4.5:1 for WCAG AA)</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {accessibilityResults.isAccessible && (
                  <p className="accessibility-status__success">
                    ✨ All color combinations meet WCAG 2.1 AA accessibility standards!
                  </p>
                )}
              </div>
            </aside>
          </div>
        </div>
      ) : activeTab === 'presets' ? (
        <div className="theme-customizer__presets">
          <PresetThemeGallery
            onThemeApply={theme => {
              setEditingTheme(theme)
              showNotification('success', 'Theme loaded from presets! You can now customize it or apply it directly.')
            }}
          />
        </div>
      ) : (
        <div className="theme-customizer__library">
          <div className="theme-library">
            <div className="theme-library__header">
              <h3 className="theme-library__title">Saved Themes</h3>
              <button type="button" className="theme-library__import" onClick={() => fileInputRef.current?.click()}>
                Import Theme
              </button>
            </div>

            {savedThemes.length === 0 ? (
              <div className="theme-library__empty">
                <p>No saved themes yet.</p>
                <p>Create and save themes from the Editor tab.</p>
              </div>
            ) : (
              <div className="theme-library__grid">
                {savedThemes.map(theme => (
                  <SavedThemeCard
                    key={theme.id}
                    theme={theme}
                    onLoad={handleLoadSavedTheme}
                    onDelete={handleDeleteSavedTheme}
                    onExport={handleExportTheme}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <footer className="theme-customizer__actions">
        {activeTab === 'editor' ? (
          <>
            <button
              type="button"
              className="theme-customizer__action theme-customizer__action--secondary"
              onClick={handleReset}
            >
              Reset
            </button>
            <button
              type="button"
              className="theme-customizer__action theme-customizer__action--secondary"
              onClick={handleSaveTheme}
            >
              Save Theme
            </button>
            <button
              type="button"
              className="theme-customizer__action theme-customizer__action--secondary"
              onClick={() => handleExportTheme()}
            >
              Export
            </button>
            <button
              type="button"
              className="theme-customizer__action theme-customizer__action--secondary"
              onClick={handleCopyTheme}
            >
              Copy JSON
            </button>
            <button
              type="button"
              className="theme-customizer__action theme-customizer__action--primary"
              onClick={handleApplyTheme}
            >
              Apply Theme
            </button>
          </>
        ) : activeTab === 'presets' ? (
          <button
            type="button"
            className="theme-customizer__action theme-customizer__action--secondary"
            onClick={() => setActiveTab('editor')}
          >
            Customize Selected Theme
          </button>
        ) : (
          <button
            type="button"
            className="theme-customizer__action theme-customizer__action--secondary"
            onClick={() => setActiveTab('editor')}
          >
            Back to Editor
          </button>
        )}
      </footer>
    </div>
  )
}

export default ThemeCustomizer
