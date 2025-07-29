/**
 * Theme System Type Definitions
 *
 * Comprehensive TypeScript interfaces for the mrbro.dev theme system.
 * Supports light/dark themes, system preference detection, custom theme creation,
 * and advanced features like color customization and accessibility validation.
 */

// Core theme mode types
export type ThemeMode = 'light' | 'dark' | 'system'

/**
 * Base theme mode excluding 'system' for actual theme definitions
 * System mode resolves to either 'light' or 'dark' at runtime
 */
export type ResolvedThemeMode = Exclude<ThemeMode, 'system'>

/**
 * System preference detection result
 */
export type SystemPreference = 'light' | 'dark'

/**
 * Color values for theme customization
 * Supports hex, hsl, rgb, and named colors
 */
export type ColorValue = string

/**
 * HSL color representation for theme customization
 */
export interface HSLColor {
  /** Hue value (0-360) */
  h: number
  /** Saturation percentage (0-100) */
  s: number
  /** Lightness percentage (0-100) */
  l: number
  /** Optional alpha value (0-1) */
  a?: number
}

/**
 * RGB color representation
 */
export interface RGBColor {
  /** Red value (0-255) */
  r: number
  /** Green value (0-255) */
  g: number
  /** Blue value (0-255) */
  b: number
  /** Optional alpha value (0-1) */
  a?: number
}

/**
 * Color contrast validation result
 */
export interface ColorContrastResult {
  /** Contrast ratio value */
  ratio: number
  /** Whether it meets WCAG AA standards (4.5:1) */
  meetsAA: boolean
  /** Whether it meets WCAG AAA standards (7:1) */
  meetsAAA: boolean
  /** Grade assigned (AAA, AA, or Fail) */
  grade: 'AAA' | 'AA' | 'Fail'
}

/**
 * Core color palette for themes
 * All themes must implement these colors for consistency
 */
export interface ThemeColors {
  /** Primary brand color for buttons, links, and key UI elements */
  primary: ColorValue
  /** Secondary color for supporting elements */
  secondary: ColorValue
  /** Accent color for highlights and call-to-action elements */
  accent: ColorValue
  /** Main background color for the application */
  background: ColorValue
  /** Surface color for cards, modals, and elevated content */
  surface: ColorValue
  /** Primary text color for headings and body content */
  text: ColorValue
  /** Secondary text color for supporting text and descriptions */
  textSecondary: ColorValue
  /** Border color for dividers, inputs, and component boundaries */
  border: ColorValue
  /** Error state color for warnings and error messages */
  error: ColorValue
  /** Warning state color for caution indicators */
  warning: ColorValue
  /** Success state color for confirmations and positive feedback */
  success: ColorValue
}

/**
 * Extended color palette for advanced theming
 * Optional colors that can be customized for enhanced themes
 */
export interface ExtendedThemeColors extends ThemeColors {
  /** Information state color for informational messages */
  info?: ColorValue
  /** Muted color for disabled or inactive elements */
  muted?: ColorValue
  /** Hover state color for interactive elements */
  hover?: ColorValue
  /** Focus state color for keyboard navigation */
  focus?: ColorValue
  /** Selection color for text highlighting */
  selection?: ColorValue
}

/**
 * Theme metadata and configuration
 */
export interface ThemeMetadata {
  /** Unique identifier for the theme */
  id: string
  /** Human-readable theme name */
  name: string
  /** Theme description for display in theme selector */
  description?: string
  /** Theme author information */
  author?: string
  /** Theme version for compatibility tracking */
  version?: string
  /** Tags for categorizing themes */
  tags?: string[]
  /** Whether this theme is built-in or user-created */
  isBuiltIn?: boolean
  /** Creation timestamp */
  createdAt?: string
  /** Last modification timestamp */
  updatedAt?: string
}

/**
 * Core theme definition
 * Represents a complete theme configuration
 */
export interface Theme extends ThemeMetadata {
  /** Resolved theme mode (light or dark) */
  mode: ResolvedThemeMode
  /** Color palette for the theme */
  colors: ThemeColors
}

/**
 * Extended theme definition with additional customization options
 */
export interface ExtendedTheme extends ThemeMetadata {
  /** Resolved theme mode (light or dark) */
  mode: ResolvedThemeMode
  /** Extended color palette with optional colors */
  colors: ExtendedThemeColors
  /** Custom CSS properties for advanced styling */
  customProperties?: Record<string, ColorValue>
  /** Typography settings */
  typography?: ThemeTypography
  /** Spacing and layout settings */
  spacing?: ThemeSpacing
  /** Animation and transition settings */
  animations?: ThemeAnimations
}

/**
 * Typography configuration for themes
 */
export interface ThemeTypography {
  /** Font family for headings */
  headingFont?: string
  /** Font family for body text */
  bodyFont?: string
  /** Font family for monospace/code text */
  monospaceFont?: string
  /** Base font size */
  baseFontSize?: string
  /** Line height ratio */
  lineHeight?: number
}

/**
 * Spacing and layout configuration
 */
export interface ThemeSpacing {
  /** Base spacing unit */
  baseUnit?: string
  /** Container max width */
  containerMaxWidth?: string
  /** Border radius values */
  borderRadius?: {
    small?: string
    medium?: string
    large?: string
  }
}

/**
 * Animation and transition configuration
 */
export interface ThemeAnimations {
  /** Transition duration for theme switches */
  transitionDuration?: string
  /** Transition timing function */
  transitionTimingFunction?: string
  /** Whether to respect prefers-reduced-motion */
  respectReducedMotion?: boolean
}

/**
 * Theme context value for React Context
 * Provides theme state and manipulation functions
 */
export interface ThemeContextValue {
  /** Currently active theme */
  currentTheme: Theme
  /** Current theme mode setting */
  themeMode: ThemeMode
  /** List of available themes */
  availableThemes: Theme[]
  /** Detected system preference */
  systemPreference: SystemPreference
  /** Function to change theme mode */
  setThemeMode: (mode: ThemeMode) => void
  /** Function to apply a custom theme */
  setCustomTheme: (theme: Theme) => void
}

/**
 * Theme customization options for the theme editor
 */
export interface ThemeCustomizationOptions {
  /** Whether to allow color customization */
  allowColorCustomization?: boolean
  /** Whether to allow typography customization */
  allowTypographyCustomization?: boolean
  /** Whether to allow spacing customization */
  allowSpacingCustomization?: boolean
  /** Whether to allow animation customization */
  allowAnimationCustomization?: boolean
  /** Color format preference for the color picker */
  colorFormat?: 'hex' | 'hsl' | 'rgb'
}

/**
 * Theme validation result
 */
export interface ThemeValidationResult {
  /** Whether the theme is valid */
  isValid: boolean
  /** List of validation errors */
  errors: string[]
  /** List of validation warnings */
  warnings: string[]
  /** Color contrast validation results */
  colorContrast?: {
    textOnBackground: ColorContrastResult
    textOnSurface: ColorContrastResult
    textSecondaryOnBackground: ColorContrastResult
  }
}

/**
 * Theme export/import format
 */
export interface ThemeExportData {
  /** Export format version */
  version: string
  /** Exported theme data */
  theme: ExtendedTheme
  /** Export metadata */
  exportedAt: string
  /** Export source */
  exportedBy?: string
}

/**
 * Theme preset definition for theme gallery
 */
export interface ThemePreset {
  /** Preset identifier */
  id: string
  /** Preset name */
  name: string
  /** Preset description */
  description: string
  /** Preview image URL */
  previewUrl?: string
  /** Theme configuration */
  theme: Theme
  /** Preset category */
  category?: string
  /** Popularity score */
  popularity?: number
}

/**
 * Theme storage configuration
 */
export interface ThemeStorageConfig {
  /** Storage key prefix */
  keyPrefix?: string
  /** Whether to compress stored data */
  compress?: boolean
  /** Whether to encrypt stored data */
  encrypt?: boolean
  /** Maximum storage size in bytes */
  maxStorageSize?: number
}

/**
 * Theme transition options
 */
export interface ThemeTransitionOptions {
  /** Transition duration in milliseconds */
  duration?: number
  /** Transition easing function */
  easing?: string
  /** Whether to animate the transition */
  animate?: boolean
  /** Callback function called when transition starts */
  onTransitionStart?: () => void
  /** Callback function called when transition completes */
  onTransitionComplete?: () => void
}

/**
 * Theme performance metrics
 */
export interface ThemePerformanceMetrics {
  /** Theme switch duration in milliseconds */
  switchDuration: number
  /** Memory usage for theme data */
  memoryUsage: number
  /** Number of CSS custom properties updated */
  propertiesUpdated: number
  /** Timestamp of the measurement */
  timestamp: number
}
