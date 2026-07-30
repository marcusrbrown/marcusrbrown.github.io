/**
 * Analytics tracking hooks for React components
 * Provides convenient hooks for tracking interactions
 */

import {useCallback, useEffect, useRef} from 'react'
import {analytics, onUmamiTrackerReady, trackUmamiPageview} from '../utils/analytics'

/**
 * Hook for tracking section visibility
 */
export const useSectionTracking = <T extends HTMLElement = HTMLElement>(
  sectionName: string,
  threshold = 0.5,
): React.RefObject<T | null> => {
  const elementRef = useRef<T>(null)
  const hasTrackedRef = useRef(false)

  useEffect(() => {
    const element = elementRef.current
    if (!element) return

    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting && !hasTrackedRef.current) {
            analytics.trackSectionView(sectionName)
            hasTrackedRef.current = true
          }
        })
      },
      {threshold},
    )

    observer.observe(element)

    return () => {
      observer.disconnect()
    }
  }, [sectionName, threshold])

  return elementRef
}

/**
 * Makes React Router the single pageview source: observes the normalized
 * pathname only, dedupes consecutive identical pathnames, and allows a
 * later real return to a previously visited path (e.g.
 * `/about -> /projects -> /about` emits `/about` twice).
 *
 * If the tracker is unavailable, retains only the latest pending pathname
 * (never in the adapter or a persistent queue). Readiness registration is
 * scoped to one unavailable streak — it resets after every retry attempt so
 * a later unavailable streak can register again, without polling.
 */
export const usePageviewTracking = (pathname: string): void => {
  const lastAttemptedPathRef = useRef<string | null>(null)
  const pendingPathRef = useRef<string | null>(null)
  const readyRegisteredRef = useRef(false)

  const attemptSend = useCallback((path: string): void => {
    try {
      const outcome = trackUmamiPageview(path)

      if (outcome === 'unavailable') {
        pendingPathRef.current = path
        if (!readyRegisteredRef.current) {
          readyRegisteredRef.current = true
          onUmamiTrackerReady(() => {
            // Retry exactly once, inline — never re-enter attemptSend, since
            // onUmamiTrackerReady may invoke this callback synchronously
            // (e.g. a tracker call that keeps throwing), which would
            // otherwise recurse without bound.
            readyRegisteredRef.current = false
            const latestPending = pendingPathRef.current
            if (latestPending === null) return

            try {
              const retryOutcome = trackUmamiPageview(latestPending)
              if (retryOutcome === 'unavailable') {
                // Still unavailable: leave it pending for the next real
                // navigation or readiness opportunity — do not re-register
                // readiness from inside this callback.
                return
              }
            } catch {
              return
            }
            pendingPathRef.current = null
          })
        }
      } else {
        pendingPathRef.current = null
      }
    } catch {
      // The adapter never throws in practice; a failing tracker must never
      // block navigation or rendering.
    }
  }, [])

  useEffect(() => {
    if (lastAttemptedPathRef.current === pathname) return
    lastAttemptedPathRef.current = pathname
    attemptSend(pathname)
  }, [pathname, attemptSend])
}

/**
 * Hook for tracking contact interactions
 */
export const useContactTracking = () => {
  const trackContactClick = useCallback((method: string, label?: string) => {
    analytics.trackContactClick(method, label)
  }, [])

  const trackExternalLink = useCallback((url: string, source = 'contact') => {
    analytics.trackExternalLink(url, source)
  }, [])

  return {
    trackContactClick,
    trackExternalLink,
  }
}

/**
 * Hook for tracking project interactions
 */
export const useProjectTracking = () => {
  const trackProjectView = useCallback((projectId: string, source = 'gallery') => {
    analytics.trackProjectInteraction('view', projectId, source)
  }, [])

  const trackProjectClick = useCallback((projectId: string, source = 'gallery') => {
    analytics.trackProjectInteraction('click', projectId, source)
  }, [])

  const trackProjectHover = useCallback((projectId: string, source = 'gallery') => {
    analytics.trackProjectInteraction('hover', projectId, source)
  }, [])

  const trackProjectModal = useCallback((action: string, projectId: string) => {
    analytics.trackProjectInteraction(action, projectId, 'modal')
  }, [])

  return {
    trackProjectView,
    trackProjectClick,
    trackProjectHover,
    trackProjectModal,
  }
}

/**
 * Hook for tracking skill interactions
 */
export const useSkillTracking = () => {
  const trackSkillHover = useCallback((skillName: string, category?: string) => {
    analytics.trackSkillInteraction('hover', skillName, category)
  }, [])

  const trackSkillClick = useCallback((skillName: string, category?: string) => {
    analytics.trackSkillInteraction('click', skillName, category)
  }, [])

  const trackSkillView = useCallback((skillName: string, category?: string) => {
    analytics.trackSkillInteraction('view', skillName, category)
  }, [])

  return {
    trackSkillHover,
    trackSkillClick,
    trackSkillView,
  }
}

/**
 * Hook for tracking navigation interactions
 */
export const useNavigationTracking = () => {
  const trackNavigation = useCallback((section: string, method = 'click') => {
    analytics.trackNavigation(section, method)
  }, [])

  const trackScrollToSection = useCallback((section: string) => {
    analytics.trackNavigation(section, 'scroll')
  }, [])

  return {
    trackNavigation,
    trackScrollToSection,
  }
}

/**
 * Hook for tracking theme interactions
 */
export const useThemeTracking = () => {
  const trackThemeChange = useCallback((from: string, to: string) => {
    analytics.trackThemeChange(from, to)
  }, [])

  const trackThemeToggle = useCallback((newTheme: string) => {
    analytics.track({
      category: 'Theme',
      action: 'toggle',
      label: newTheme,
      custom_parameters: {
        theme: newTheme,
      },
    })
  }, [])

  return {
    trackThemeChange,
    trackThemeToggle,
  }
}

/**
 * Hook for tracking error events
 */
export const useErrorTracking = () => {
  const trackError = useCallback((error: string, context = 'unknown') => {
    analytics.trackError(error, context)
  }, [])

  const trackApiError = useCallback((endpoint: string, error: string) => {
    analytics.trackError(`API: ${error}`, endpoint)
  }, [])

  return {
    trackError,
    trackApiError,
  }
}

/**
 * Hook for tracking search interactions
 */
export const useSearchTracking = () => {
  const trackSearch = useCallback((query: string, resultsCount: number) => {
    analytics.trackSearch(query, resultsCount)
  }, [])

  const trackSearchFilter = useCallback((filter: string, value: string) => {
    analytics.track({
      category: 'Search',
      action: 'filter',
      label: `${filter}:${value}`,
      custom_parameters: {
        filter_type: filter,
        filter_value: value,
      },
    })
  }, [])

  return {
    trackSearch,
    trackSearchFilter,
  }
}

/**
 * Hook for tracking performance metrics
 */
export const usePerformanceTracking = () => {
  const trackPageLoad = useCallback((loadTime: number) => {
    analytics.track({
      category: 'Performance',
      action: 'page_load',
      value: Math.round(loadTime),
      custom_parameters: {
        load_time: Math.round(loadTime),
      },
    })
  }, [])

  const trackImageLoad = useCallback((src: string, loadTime: number) => {
    analytics.track({
      category: 'Performance',
      action: 'image_load',
      label: src,
      value: Math.round(loadTime),
      custom_parameters: {
        image_src: src,
        load_time: Math.round(loadTime),
      },
    })
  }, [])

  const trackAnimation = useCallback((animationName: string, duration: number) => {
    analytics.track({
      category: 'Performance',
      action: 'animation',
      label: animationName,
      value: Math.round(duration),
      custom_parameters: {
        animation_name: animationName,
        duration: Math.round(duration),
      },
    })
  }, [])

  return {
    trackPageLoad,
    trackImageLoad,
    trackAnimation,
  }
}

/**
 * Hook for tracking download events
 */
export const useDownloadTracking = () => {
  const trackDownload = useCallback((filename: string, source = 'unknown') => {
    analytics.trackDownload(filename, source)
  }, [])

  const trackResumeDownload = useCallback((format: string) => {
    analytics.trackDownload(`resume.${format}`, 'resume_section')
  }, [])

  return {
    trackDownload,
    trackResumeDownload,
  }
}

/**
 * Combined hook for common tracking needs
 */
export const useAnalyticsTracking = () => {
  const contactTracking = useContactTracking()
  const projectTracking = useProjectTracking()
  const skillTracking = useSkillTracking()
  const navigationTracking = useNavigationTracking()
  const themeTracking = useThemeTracking()
  const errorTracking = useErrorTracking()
  const performanceTracking = usePerformanceTracking()
  const downloadTracking = useDownloadTracking()

  return {
    ...contactTracking,
    ...projectTracking,
    ...skillTracking,
    ...navigationTracking,
    ...themeTracking,
    ...errorTracking,
    ...performanceTracking,
    ...downloadTracking,
  }
}
