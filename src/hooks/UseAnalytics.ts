/**
 * Analytics tracking hooks for React components
 * Provides convenient hooks for tracking interactions
 */

import type {ApprovedSectionName} from '../utils/analytics'
import {useCallback, useEffect, useRef} from 'react'
import {onUmamiTrackerReady, trackUmamiEvent, trackUmamiPageview} from '../utils/analytics'

/**
 * Hook for tracking section visibility
 */
export const useSectionTracking = <T extends HTMLElement = HTMLElement>(
  sectionName: ApprovedSectionName,
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
            trackUmamiEvent('section_view', {section: sectionName})
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
