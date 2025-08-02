export interface Project {
  id: string
  title: string
  description: string
  url: string
  language: string
  stars: number
  homepage?: string | null
  topics?: string[]
  lastUpdated?: string
}

export interface BlogPost {
  id: string
  title: string
  summary: string
  date: string
  url: string
}

// Re-export theme types from dedicated theme types file
export type {
  ColorContrastResult,
  ColorValue,
  ExtendedTheme,
  ExtendedThemeColors,
  HSLColor,
  ResolvedThemeMode,
  RGBColor,
  SystemPreference,
  Theme,
  ThemeAnimations,
  ThemeColors,
  ThemeContextValue,
  ThemeCustomizationOptions,
  ThemeExportData,
  ThemeMetadata,
  ThemeMode,
  ThemePerformanceMetrics,
  ThemePreset,
  ThemeSpacing,
  ThemeStorageConfig,
  ThemeTransitionOptions,
  ThemeTypography,
  ThemeValidationResult,
} from './theme'
