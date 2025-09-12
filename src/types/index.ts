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
  imageUrl?: string
}

export interface BlogPost {
  id: string
  title: string
  summary: string
  date: string
  url: string
}

export interface GitHubRepository {
  id: number
  name: string
  full_name: string
  description: string | null
  html_url: string
  homepage: string | null
  language: string | null
  stargazers_count: number
  topics: string[]
  updated_at: string
}

export interface GitHubLabel {
  id: number
  name: string
  color: string
  description: string | null
}

export interface GitHubIssue {
  id: number
  number: number
  title: string
  body: string | null
  html_url: string
  created_at: string
  updated_at: string
  labels: GitHubLabel[]
  state: 'open' | 'closed'
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
