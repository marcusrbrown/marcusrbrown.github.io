/**
 * Animation utility functions for skills showcase and other interactive elements
 */

import {prefersReducedMotion} from './accessibility'

/**
 * Easing functions for smooth animations
 */
export const easingFunctions = {
  easeOutCubic: (t: number): number => 1 - (1 - t) ** 3,
  easeInOutCubic: (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  easeOutQuart: (t: number): number => 1 - (1 - t) ** 4,
  easeInOutBack: (t: number): number => {
    const c1 = 1.70158
    const c2 = c1 * 1.525
    return t < 0.5
      ? ((2 * t) ** 2 * ((c2 + 1) * 2 * t - c2)) / 2
      : ((2 * t - 2) ** 2 * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2
  },
}

/**
 * Configuration for staggered animations
 */
export interface StaggerConfig {
  /** Base delay in milliseconds */
  baseDelay?: number
  /** Delay increment between items in milliseconds */
  increment?: number
  /** Maximum delay to prevent excessive waiting */
  maxDelay?: number
}

/**
 * Generate staggered animation delays for a list of items
 */
export const createStaggeredDelays = (itemCount: number, config: StaggerConfig = {}): number[] => {
  const {baseDelay = 100, increment = 50, maxDelay = 800} = config

  return Array.from({length: itemCount}, (_, index) => {
    const delay = baseDelay + index * increment
    return Math.min(delay, maxDelay)
  })
}

/**
 * Animation configuration for proficiency indicators
 */
export interface ProficiencyAnimationConfig {
  /** Duration of the animation in milliseconds */
  duration?: number
  /** Delay before animation starts */
  delay?: number
  /** Easing function to use */
  easing?: keyof typeof easingFunctions
}

/**
 * Animate a proficiency value from 0 to target over time
 */
export const animateProficiency = (
  target: number,
  onProgress: (value: number) => void,
  config: ProficiencyAnimationConfig = {},
): (() => void) => {
  const {duration = 1000, delay = 0, easing = 'easeOutCubic'} = config
  const easingFn = easingFunctions[easing]

  // Handle reduced motion - immediately set to target value
  if (prefersReducedMotion()) {
    // Use setTimeout to match the async nature of requestAnimationFrame
    const timeoutId = setTimeout(
      () => {
        onProgress(target)
      },
      Math.max(delay, 0),
    )

    return () => {
      clearTimeout(timeoutId)
    }
  }

  let startTime: number | null = null
  let animationId: number

  const animate = (currentTime: number) => {
    if (!startTime) startTime = currentTime

    const elapsed = currentTime - startTime - delay

    if (elapsed < 0) {
      animationId = requestAnimationFrame(animate)
      return
    }

    const progress = Math.min(elapsed / duration, 1)
    const easedProgress = easingFn(progress)
    const currentValue = target * easedProgress

    onProgress(currentValue)

    if (progress < 1) {
      animationId = requestAnimationFrame(animate)
    }
  }

  animationId = requestAnimationFrame(animate)

  // Return cleanup function to cancel animation
  return () => {
    if (animationId) {
      cancelAnimationFrame(animationId)
    }
  }
}

/**
 * Create CSS animation delays for staggered reveals
 */
export const createCSSStaggerDelays = (itemCount: number, config: StaggerConfig = {}): string[] => {
  const delays = createStaggeredDelays(itemCount, config)
  return delays.map(delay => `${delay}ms`)
}

/**
 * Intersection observer options optimized for skill animations
 */
export const skillsObserverOptions = {
  threshold: 0.2,
  rootMargin: '0px 0px -100px 0px',
}

/**
 * Spring animation configuration for micro-interactions
 */
export interface SpringConfig {
  /** Tension/stiffness of the spring */
  tension?: number
  /** Friction/damping of the spring */
  friction?: number
  /** Mass of the animated object */
  mass?: number
}

/**
 * Create CSS transform values for spring-like hover effects
 */
export const createSpringTransform = (scale = 1.05, _config: SpringConfig = {}): string => {
  return `scale(${scale})`
}

/**
 * Debounce utility for performance optimization
 */
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number,
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout | null = null

  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}

/**
 * Get safe animation duration based on user preferences
 */
export const getSafeAnimationDuration = (duration: number): number => {
  return prefersReducedMotion() ? 0 : duration
}

/**
 * CSS custom properties for skill animations
 */
export const skillAnimationProperties = {
  '--skill-reveal-duration': '0.6s',
  '--skill-hover-duration': '0.2s',
  '--skill-proficiency-duration': '1.2s',
  '--skill-stagger-delay': '0.1s',
} as const
