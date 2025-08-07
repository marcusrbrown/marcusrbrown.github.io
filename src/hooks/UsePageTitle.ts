// mrbro.dev/src/hooks/UsePageTitle.ts

import {useEffect} from 'react'

/**
 * Custom hook to set page title dynamically
 *
 * @param title - The specific page title
 * @param suffix - Optional suffix (defaults to site name)
 */
export const usePageTitle = (title: string, suffix = 'Marcus R. Brown - Developer Portfolio & Blog'): void => {
  useEffect(() => {
    const fullTitle = title ? `${title} | ${suffix}` : suffix
    document.title = fullTitle
  }, [title, suffix])
}

/**
 * Set page title directly without hook (for use in components where hooks aren't appropriate)
 */
export const setPageTitle = (title: string, suffix = 'Marcus R. Brown - Developer Portfolio & Blog'): void => {
  const fullTitle = title ? `${title} | ${suffix}` : suffix
  document.title = fullTitle
}
