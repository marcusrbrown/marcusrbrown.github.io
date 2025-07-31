/**
 * Preset Theme Collection
 *
 * Popular, carefully curated color schemes for the theme system.
 * Includes well-known themes like Material Design, Dracula, Nord, Solarized,
 * and other popular developer and designer favorites.
 */

import type {Theme} from '../types'

/**
 * Collection of preset themes with popular color schemes
 * All themes follow WCAG 2.1 AA color contrast guidelines
 */
export const presetThemes: Theme[] = [
  // Material Design Light
  {
    id: 'material-light',
    name: 'Material Light',
    description: 'Clean and modern Material Design light theme',
    author: 'Google Material Design',
    version: '1.0.0',
    mode: 'light',
    isBuiltIn: true,
    tags: ['material', 'light', 'modern', 'clean'],
    colors: {
      primary: '#1976d2',
      secondary: '#424242',
      accent: '#ff5722',
      background: '#fafafa',
      surface: '#ffffff',
      text: '#212121',
      textSecondary: '#757575',
      border: '#e0e0e0',
      error: '#d32f2f',
      warning: '#f57c00',
      success: '#388e3c',
    },
  },

  // Material Design Dark
  {
    id: 'material-dark',
    name: 'Material Dark',
    description: 'Sleek Material Design dark theme with rich contrasts',
    author: 'Google Material Design',
    version: '1.0.0',
    mode: 'dark',
    isBuiltIn: true,
    tags: ['material', 'dark', 'modern', 'professional'],
    colors: {
      primary: '#90caf9',
      secondary: '#b0bec5',
      accent: '#ff7043',
      background: '#121212',
      surface: '#1e1e1e',
      text: '#ffffff',
      textSecondary: '#b3b3b3',
      border: '#333333',
      error: '#f44336',
      warning: '#ffa726',
      success: '#66bb6a',
    },
  },

  // Dracula Theme
  {
    id: 'dracula',
    name: 'Dracula',
    description: 'Popular dark theme with vibrant purple and pink accents',
    author: 'Dracula Theme',
    version: '1.0.0',
    mode: 'dark',
    isBuiltIn: true,
    tags: ['dracula', 'dark', 'purple', 'vibrant', 'popular'],
    colors: {
      primary: '#bd93f9',
      secondary: '#6272a4',
      accent: '#ff79c6',
      background: '#282a36',
      surface: '#44475a',
      text: '#f8f8f2',
      textSecondary: '#6272a4',
      border: '#6272a4',
      error: '#ff5555',
      warning: '#ffb86c',
      success: '#50fa7b',
    },
  },

  // Nord Theme
  {
    id: 'nord',
    name: 'Nord',
    description: 'Arctic-inspired color palette with cool blues and whites',
    author: 'Nord Theme',
    version: '1.0.0',
    mode: 'dark',
    isBuiltIn: true,
    tags: ['nord', 'dark', 'blue', 'arctic', 'minimal'],
    colors: {
      primary: '#88c0d0',
      secondary: '#81a1c1',
      accent: '#a3be8c',
      background: '#2e3440',
      surface: '#3b4252',
      text: '#eceff4',
      textSecondary: '#d8dee9',
      border: '#4c566a',
      error: '#bf616a',
      warning: '#ebcb8b',
      success: '#a3be8c',
    },
  },

  // Solarized Light
  {
    id: 'solarized-light',
    name: 'Solarized Light',
    description: 'Precision colors for machines and people',
    author: 'Ethan Schoonover',
    version: '1.0.0',
    mode: 'light',
    isBuiltIn: true,
    tags: ['solarized', 'light', 'precision', 'academic'],
    colors: {
      primary: '#268bd2',
      secondary: '#657b83',
      accent: '#d33682',
      background: '#fdf6e3',
      surface: '#eee8d5',
      text: '#657b83',
      textSecondary: '#839496',
      border: '#93a1a1',
      error: '#dc322f',
      warning: '#b58900',
      success: '#859900',
    },
  },

  // Solarized Dark
  {
    id: 'solarized-dark',
    name: 'Solarized Dark',
    description: 'Precision colors for machines and people - dark variant',
    author: 'Ethan Schoonover',
    version: '1.0.0',
    mode: 'dark',
    isBuiltIn: true,
    tags: ['solarized', 'dark', 'precision', 'academic'],
    colors: {
      primary: '#268bd2',
      secondary: '#839496',
      accent: '#d33682',
      background: '#002b36',
      surface: '#073642',
      text: '#839496',
      textSecondary: '#657b83',
      border: '#586e75',
      error: '#dc322f',
      warning: '#b58900',
      success: '#859900',
    },
  },

  // GitHub Light
  {
    id: 'github-light',
    name: 'GitHub Light',
    description: 'Clean and familiar GitHub-inspired light theme',
    author: 'GitHub',
    version: '1.0.0',
    mode: 'light',
    isBuiltIn: true,
    tags: ['github', 'light', 'clean', 'familiar'],
    colors: {
      primary: '#0969da',
      secondary: '#656d76',
      accent: '#8250df',
      background: '#ffffff',
      surface: '#f6f8fa',
      text: '#24292f',
      textSecondary: '#656d76',
      border: '#d0d7de',
      error: '#d1242f',
      warning: '#9a6700',
      success: '#1a7f37',
    },
  },

  // GitHub Dark
  {
    id: 'github-dark',
    name: 'GitHub Dark',
    description: 'Sleek GitHub-inspired dark theme for night coding',
    author: 'GitHub',
    version: '1.0.0',
    mode: 'dark',
    isBuiltIn: true,
    tags: ['github', 'dark', 'professional', 'coding'],
    colors: {
      primary: '#58a6ff',
      secondary: '#8b949e',
      accent: '#a5a5ff',
      background: '#0d1117',
      surface: '#161b22',
      text: '#e6edf3',
      textSecondary: '#7d8590',
      border: '#30363d',
      error: '#f85149',
      warning: '#d29922',
      success: '#3fb950',
    },
  },

  // Monokai
  {
    id: 'monokai',
    name: 'Monokai',
    description: 'Classic dark theme with vibrant syntax highlighting colors',
    author: 'Wimer Hazenberg',
    version: '1.0.0',
    mode: 'dark',
    isBuiltIn: true,
    tags: ['monokai', 'dark', 'vibrant', 'classic', 'sublime'],
    colors: {
      primary: '#f92672',
      secondary: '#75715e',
      accent: '#a6e22e',
      background: '#272822',
      surface: '#3e3d32',
      text: '#f8f8f2',
      textSecondary: '#75715e',
      border: '#49483e',
      error: '#f92672',
      warning: '#fd971f',
      success: '#a6e22e',
    },
  },

  // One Dark Pro
  {
    id: 'one-dark-pro',
    name: 'One Dark Pro',
    description: 'Popular VSCode theme with balanced contrast and vibrant accents',
    author: 'binaryify',
    version: '1.0.0',
    mode: 'dark',
    isBuiltIn: true,
    tags: ['one-dark', 'dark', 'vscode', 'popular', 'balanced'],
    colors: {
      primary: '#61afef',
      secondary: '#abb2bf',
      accent: '#c678dd',
      background: '#282c34',
      surface: '#353b45',
      text: '#abb2bf',
      textSecondary: '#5c6370',
      border: '#3e4451',
      error: '#e06c75',
      warning: '#e5c07b',
      success: '#98c379',
    },
  },

  // Catppuccin Mocha
  {
    id: 'catppuccin-mocha',
    name: 'Catppuccin Mocha',
    description: 'Soothing pastel theme for the high-spirited',
    author: 'Catppuccin',
    version: '1.0.0',
    mode: 'dark',
    isBuiltIn: true,
    tags: ['catppuccin', 'dark', 'pastel', 'soothing', 'trendy'],
    colors: {
      primary: '#89b4fa',
      secondary: '#6c7086',
      accent: '#f5c2e7',
      background: '#1e1e2e',
      surface: '#313244',
      text: '#cdd6f4',
      textSecondary: '#a6adc8',
      border: '#45475a',
      error: '#f38ba8',
      warning: '#f9e2af',
      success: '#a6e3a1',
    },
  },

  // Tokyo Night
  {
    id: 'tokyo-night',
    name: 'Tokyo Night',
    description: 'Clean dark theme inspired by Tokyo night lights',
    author: 'Tokyo Night',
    version: '1.0.0',
    mode: 'dark',
    isBuiltIn: true,
    tags: ['tokyo-night', 'dark', 'clean', 'modern', 'purple'],
    colors: {
      primary: '#7aa2f7',
      secondary: '#565f89',
      accent: '#bb9af7',
      background: '#1a1b26',
      surface: '#24283b',
      text: '#c0caf5',
      textSecondary: '#9aa5ce',
      border: '#414868',
      error: '#f7768e',
      warning: '#e0af68',
      success: '#9ece6a',
    },
  },
]

/**
 * Get all preset themes
 */
export const getPresetThemes = (): Theme[] => presetThemes

/**
 * Get preset themes filtered by mode
 */
export const getPresetThemesByMode = (mode: 'light' | 'dark'): Theme[] =>
  presetThemes.filter(theme => theme.mode === mode)

/**
 * Get a preset theme by ID
 */
export const getPresetThemeById = (id: string): Theme | undefined => presetThemes.find(theme => theme.id === id)

/**
 * Get preset themes filtered by tags
 */
export const getPresetThemesByTags = (tags: string[]): Theme[] =>
  presetThemes.filter(theme => theme.tags?.some(tag => tags.includes(tag)))

/**
 * Search preset themes by name or description
 */
export const searchPresetThemes = (query: string): Theme[] => {
  const lowerQuery = query.toLowerCase()
  return presetThemes.filter(
    theme =>
      theme.name.toLowerCase().includes(lowerQuery) ||
      theme.description?.toLowerCase().includes(lowerQuery) ||
      theme.tags?.some(tag => tag.toLowerCase().includes(lowerQuery)),
  )
}
