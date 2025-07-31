// mrbro.dev/src/hooks/UseSyntaxHighlighting.ts

import {useEffect} from 'react'
import {updateHighlighterTheme} from '../utils/syntax-highlighting'
import {useTheme} from './UseTheme'

/**
 * Hook to integrate syntax highlighting with the theme system
 * Automatically updates Shiki theme when the app theme changes
 */
export const useSyntaxHighlighting = (): void => {
  const {getEffectiveThemeMode} = useTheme()
  const effectiveThemeMode = getEffectiveThemeMode()

  useEffect(() => {
    // Update syntax highlighter theme when theme changes
    updateHighlighterTheme(effectiveThemeMode)
  }, [effectiveThemeMode])
}
