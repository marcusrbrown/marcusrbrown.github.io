export interface Project {
  id: string
  title: string
  description: string
  url: string
  language: string
  stars: number
}

export interface BlogPost {
  id: string
  title: string
  summary: string
  date: string
  url: string
}

export type ThemeMode = 'light' | 'dark' | 'system'

export interface ThemeColors {
  primary: string
  secondary: string
  accent: string
  background: string
  surface: string
  text: string
  textSecondary: string
  border: string
  error: string
  warning: string
  success: string
}

export interface Theme {
  id: string
  name: string
  mode: Exclude<ThemeMode, 'system'>
  colors: ThemeColors
}

export interface ThemeContextValue {
  currentTheme: Theme
  themeMode: ThemeMode
  availableThemes: Theme[]
  setThemeMode: (mode: ThemeMode) => void
  setCustomTheme: (theme: Theme) => void
  systemPreference: 'light' | 'dark'
}
