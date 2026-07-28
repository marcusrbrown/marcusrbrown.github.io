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

/** Curated blog post frontmatter, validated against `blog-frontmatter.schema.json`. */
export interface BlogFrontmatter {
  title: string
  date: string
  summary: string
  slug?: string
  tags?: string[]
  /** Markdown file name to use as the post source when a gist has multiple. */
  source?: string
}

/** Card-facing subset of a blog post, used for list views and previews. */
export interface BlogPostMeta {
  slug: string
  title: string
  date: string
  summary: string
  tags?: string[]
}

/** Full blog post content, as stored in the committed snapshot. */
export interface BlogPostFull {
  slug: string
  frontmatter: BlogFrontmatter
  /** Sanitized, rendered HTML body. */
  html: string
  /** Gist ID; keys the slug registry so slugs remain stable across title edits. */
  gistId: string
  gistUrl: string
  gistUpdatedAt: string
  /** Markdown filename selected from the source gist. */
  sourceFilename?: string
}

/** Committed blog content snapshot; the refresh workflow is the sole writer. */
export interface BlogSnapshot {
  posts: BlogPostFull[]
  generatedAt: string
  /** Marker identifying the generator, e.g. `blog-refresh` script + version. */
  generator: string
}

/** Committed projects snapshot; the refresh workflow is the sole writer. */
export interface ProjectsSnapshot {
  projects: Project[]
  generatedAt: string
  /** Marker identifying the generator, e.g. `projects-refresh` script + version. */
  generator: string
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

// Re-export theme types from dedicated theme types file
export type {
  ActiveThemeChoice,
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
  ThemeSelection,
  ThemeSpacing,
  ThemeStorageConfig,
  ThemeTransitionOptions,
  ThemeTypography,
  ThemeValidationResult,
} from './theme'
