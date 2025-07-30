/**
 * ThemeCustomizer Component
 *
 * Advanced theme creation interface with HSL color controls, real-time preview,
 * and theme validation. Follows compound component pattern for modularity.
 */

import type {ColorValue, HSLColor, ResolvedThemeMode, Theme, ThemeColors} from '../types'
import {useCallback, useMemo, useState} from 'react'
import {useTheme} from '../hooks/UseTheme'
import {rgbToHsl, validateTheme} from '../utils/theme-validation'

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
export const ThemeCustomizer: React.FC<ThemeCustomizerProps> = ({className = '', onThemeChange, onClose}) => {
  const {currentTheme, setCustomTheme} = useTheme()

  // Local theme state for editing
  const [editingTheme, setEditingTheme] = useState<Theme>(() => ({
    ...currentTheme,
    id: `custom-${Date.now()}`,
    name: `Custom ${currentTheme.mode.charAt(0).toUpperCase() + currentTheme.mode.slice(1)}`,
    isBuiltIn: false,
  }))

  const [themeMode, setThemeMode] = useState<ResolvedThemeMode>(currentTheme.mode)
  const [themeName, setThemeName] = useState(editingTheme.name)

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
      </div>

      <footer className="theme-customizer__actions">
        <button
          type="button"
          className="theme-customizer__action theme-customizer__action--secondary"
          onClick={handleReset}
        >
          Reset
        </button>
        <button
          type="button"
          className="theme-customizer__action theme-customizer__action--primary"
          onClick={handleApplyTheme}
        >
          Apply Theme
        </button>
      </footer>
    </div>
  )
}

export default ThemeCustomizer
