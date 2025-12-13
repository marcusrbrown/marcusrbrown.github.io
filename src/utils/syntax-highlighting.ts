// mrbro.dev/src/utils/syntax-highlighting.ts

import type {BundledLanguage, BundledTheme, Highlighter} from 'shiki'
import type {ResolvedThemeMode} from '../types/theme'
// Vite define in vite.config.ts
declare const __GITHUB_PAGES__: boolean
const isPagesEnv = __GITHUB_PAGES__ !== undefined && __GITHUB_PAGES__ === true

let highlighterInstance: Highlighter | null = null
let currentThemeMode: ResolvedThemeMode = 'light'

/**
 * Theme mappings between our theme system and Shiki themes
 */
const SHIKI_THEME_MAP: Record<ResolvedThemeMode, BundledTheme> = {
  light: 'github-light',
  dark: 'github-dark',
} as const

/**
 * Common programming languages for syntax highlighting
 */
const SUPPORTED_LANGUAGES: BundledLanguage[] = [
  'typescript',
  'javascript',
  'tsx',
  'jsx',
  'json',
  'css',
  'html',
  'markdown',
]

/**
 * Initialize the Shiki highlighter with theme-aware configuration
 */
export const initializeHighlighter = async (): Promise<Highlighter> => {
  if (highlighterInstance) {
    return highlighterInstance
  }

  try {
    const {createHighlighter} = await import('shiki')
    highlighterInstance = await createHighlighter({
      themes: [SHIKI_THEME_MAP.light, SHIKI_THEME_MAP.dark],
      langs: SUPPORTED_LANGUAGES,
    })

    return highlighterInstance
  } catch (error) {
    console.error('Failed to initialize syntax highlighter:', error)
    throw new Error('Syntax highlighting not available')
  }
}

/**
 * Update the current theme mode for syntax highlighting
 */
export const updateHighlighterTheme = (themeMode: ResolvedThemeMode): void => {
  currentThemeMode = themeMode
}

/**
 * Escape HTML characters to prevent XSS
 */
const escapeHtml = (text: string): string => {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

/**
 * Highlight code with current theme
 */
export const highlightCode = async (
  code: string,
  language: BundledLanguage = 'typescript',
  options: {
    theme?: ResolvedThemeMode
    removeBackground?: boolean
  } = {},
): Promise<string> => {
  const {theme = currentThemeMode, removeBackground = false} = options

  try {
    if (isPagesEnv) {
      const plain = `<pre><code>${escapeHtml(code)}</code></pre>`
      return removeBackground ? plain.replaceAll(/style="[^"]*background[^"]*"/g, '') : plain
    }
    const highlighter = await initializeHighlighter()

    const html = highlighter.codeToHtml(code, {
      lang: language,
      theme: SHIKI_THEME_MAP[theme],
    })

    // Remove background if requested (useful for custom theming)
    if (removeBackground) {
      return html.replaceAll(/style="[^"]*background[^"]*"/g, '')
    }

    return html
  } catch (error) {
    console.warn(`Failed to highlight code for language "${language}":`, error)
    // Fallback to plain code block
    return `<pre><code>${escapeHtml(code)}</code></pre>`
  }
}

/**
 * Get supported languages for syntax highlighting
 */
export const getSupportedLanguages = (): readonly BundledLanguage[] => {
  return SUPPORTED_LANGUAGES
}

/**
 * Check if a language is supported
 */
export const isLanguageSupported = (language: string): language is BundledLanguage => {
  return SUPPORTED_LANGUAGES.includes(language as BundledLanguage)
}

/**
 * Clean up highlighter instance (useful for testing)
 */
export const cleanupHighlighter = (): void => {
  highlighterInstance = null
}
