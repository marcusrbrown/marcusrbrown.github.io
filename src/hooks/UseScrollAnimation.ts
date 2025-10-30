import {useCallback, useEffect, useRef, useState} from 'react'
import {prefersReducedMotion} from '../utils/accessibility'

/**
 * Animation states for scroll-triggered animations
 */
export type AnimationState = 'idle' | 'entering' | 'visible' | 'exiting'

/**
 * Configuration options for scroll animations
 */
export interface ScrollAnimationOptions {
  /** Threshold for triggering animation (0.0 to 1.0) */
  threshold?: number
  /** Root margin for intersection observer */
  rootMargin?: string
  /** Trigger once or repeatedly */
  triggerOnce?: boolean
  /** Delay before animation starts (ms) */
  delay?: number
  /** Whether animation should respect reduced motion preferences */
  respectReducedMotion?: boolean
}

/**
 * Return type for UseScrollAnimation hook
 */
export interface UseScrollAnimationReturn<T extends HTMLElement = HTMLElement> {
  /** Ref to attach to the element to be animated */
  ref: React.RefObject<T | null>
  /** Current animation state */
  animationState: AnimationState
  /** Whether element is currently in viewport */
  isInView: boolean
  /** Function to manually trigger animation */
  triggerAnimation: () => void
  /** Function to reset animation state */
  resetAnimation: () => void
}

/**
 * Default configuration for scroll animations
 */
const DEFAULT_OPTIONS: Required<ScrollAnimationOptions> = {
  threshold: 0.1,
  rootMargin: '0px 0px -50px 0px',
  triggerOnce: true,
  delay: 0,
  respectReducedMotion: true,
}

/**
 * Custom hook for scroll-triggered animations with accessibility support
 *
 * Provides smooth scroll-triggered animations that respect user's motion preferences
 * and integrate seamlessly with the existing theme system.
 *
 * Features:
 * - Intersection Observer based triggering
 * - Automatic reduced motion support
 * - Configurable thresholds and delays
 * - Manual trigger capabilities
 * - TypeScript strict mode compliant
 *
 * @param options - Configuration options for the animation
 * @returns Object with ref, animation state, and control functions
 */
export const useScrollAnimation = <T extends HTMLElement = HTMLElement>(
  options: ScrollAnimationOptions = {},
): UseScrollAnimationReturn<T> => {
  const config = {...DEFAULT_OPTIONS, ...options}

  const [animationState, setAnimationState] = useState<AnimationState>('idle')
  const [isInView, setIsInView] = useState(false)
  const [hasTriggered, setHasTriggered] = useState(false)

  const elementRef = useRef<T>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const shouldReduceMotion = config.respectReducedMotion && prefersReducedMotion()

  /**
   * Triggers the animation sequence
   */
  const triggerAnimation = useCallback(() => {
    if (shouldReduceMotion) {
      // For reduced motion, immediately set to visible state
      setAnimationState('visible')
      return
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    setAnimationState('entering')

    // Apply delay if specified
    if (config.delay > 0) {
      timeoutRef.current = setTimeout(() => {
        setAnimationState('visible')
      }, config.delay)
    } else {
      // Use requestAnimationFrame for smooth transition
      requestAnimationFrame(() => {
        setAnimationState('visible')
      })
    }
  }, [config.delay, shouldReduceMotion])

  /**
   * Resets animation to initial state
   */
  const resetAnimation = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }

    setAnimationState('idle')
    setHasTriggered(false)
  }, [])

  /**
   * Handles intersection observer callback
   */
  const handleIntersection = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const entry = entries[0]
      if (!entry) return

      const inView = entry.isIntersecting

      setIsInView(inView)

      if (inView && (!hasTriggered || !config.triggerOnce)) {
        triggerAnimation()
        setHasTriggered(true)
      } else if (!inView && !config.triggerOnce && animationState === 'visible') {
        // Exit animation for non-trigger-once scenarios
        setAnimationState('exiting')

        // Reset to idle after brief delay
        setTimeout(() => {
          setAnimationState('idle')
        }, 150)
      }
    },
    [animationState, config.triggerOnce, hasTriggered, triggerAnimation],
  )

  /**
   * Set up intersection observer
   */
  useEffect(() => {
    const element = elementRef.current

    if (!element || typeof window === 'undefined') {
      return
    }

    // Check if IntersectionObserver is supported
    if (!('IntersectionObserver' in window)) {
      // Fallback: immediately trigger animation for unsupported browsers
      // Use setTimeout to avoid synchronous setState in effect
      const timeoutId = setTimeout(() => triggerAnimation(), 0)
      return () => clearTimeout(timeoutId)
    }

    observerRef.current = new IntersectionObserver(handleIntersection, {
      threshold: config.threshold,
      rootMargin: config.rootMargin,
    })

    observerRef.current.observe(element)

    // IMPORTANT: Check if element is already in view when observer starts
    // IntersectionObserver only triggers on threshold crossings, not initial state
    requestAnimationFrame(() => {
      if (observerRef.current) {
        const rect = element.getBoundingClientRect()
        const windowHeight = window.innerHeight || document.documentElement.clientHeight

        // Parse rootMargin to get top margin (simplified - assumes format like "100px 0px")
        const rootMarginStr = config.rootMargin || '0px'
        const topMargin = Number.parseInt(rootMarginStr.split(' ')[0] || '0') || 0

        // Check if element is already in view considering threshold and rootMargin
        const elementTop = rect.top
        const elementBottom = rect.bottom
        const effectiveViewportTop = -topMargin
        const effectiveViewportBottom = windowHeight + topMargin

        // Calculate if enough of the element is visible based on threshold
        const elementHeight = rect.height
        const visibleHeight =
          Math.min(elementBottom, effectiveViewportBottom) - Math.max(elementTop, effectiveViewportTop)
        const visibleRatio = Math.max(0, visibleHeight) / elementHeight

        if (visibleRatio >= config.threshold) {
          // Element is already in view, trigger animation
          setIsInView(true)
          if (!hasTriggered || !config.triggerOnce) {
            triggerAnimation()
            setHasTriggered(true)
          }
        }
      }
    })

    // Cleanup function
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
        observerRef.current = null
      }

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
  }, [config.rootMargin, config.threshold, handleIntersection, triggerAnimation])

  /**
   * Handle reduced motion preference changes
   */
  useEffect(() => {
    if (shouldReduceMotion && animationState !== 'idle') {
      // If reduced motion is preferred and animation is active,
      // immediately set to visible state (use setTimeout to avoid sync setState)
      const timeoutId = setTimeout(() => setAnimationState('visible'), 0)
      return () => clearTimeout(timeoutId)
    }
    return undefined
  }, [shouldReduceMotion, animationState])

  return {
    ref: elementRef,
    animationState,
    isInView,
    triggerAnimation,
    resetAnimation,
  }
}

/**
 * Utility function to generate CSS classes based on animation state
 * Helps with consistent class naming patterns across components
 *
 * @param state - Current animation state
 * @param baseClass - Base CSS class name
 * @returns Space-separated string of CSS classes
 */
export const getAnimationClasses = (state: AnimationState, baseClass = 'animate'): string => {
  const classes = [baseClass]

  switch (state) {
    case 'entering':
      classes.push(`${baseClass}--entering`)
      break
    case 'visible':
      classes.push(`${baseClass}--visible`)
      break
    case 'exiting':
      classes.push(`${baseClass}--exiting`)
      break
    default:
      classes.push(`${baseClass}--idle`)
  }

  return classes.join(' ')
}

/**
 * Utility function for creating staggered animations
 * Useful for animating lists or groups of elements with delays
 *
 * @param index - Index of the element in the group
 * @param baseDelay - Base delay in milliseconds
 * @param increment - Delay increment per element
 * @returns Delay value for the specific element
 */
export const getStaggerDelay = (index: number, baseDelay = 0, increment = 100): number => {
  return baseDelay + index * increment
}
