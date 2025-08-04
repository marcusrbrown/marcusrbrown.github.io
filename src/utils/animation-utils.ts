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

/**
 * Performance optimization utilities
 */

/**
 * Check if browser supports modern animation features
 */
export const hasAnimationSupport = (): boolean => {
  if (typeof window === 'undefined') return false

  return (
    'requestAnimationFrame' in window && 'IntersectionObserver' in window && CSS.supports('transform', 'translateZ(0)')
  )
}

/**
 * Optimized animation frame scheduler with priority queue
 */
class AnimationScheduler {
  private highPriorityQueue: (() => void)[] = []
  private lowPriorityQueue: (() => void)[] = []
  private isScheduled = false

  private processQueue = () => {
    this.isScheduled = false

    // Process high priority animations first
    while (this.highPriorityQueue.length > 0) {
      const task = this.highPriorityQueue.shift()
      if (task) task()
    }

    // Process low priority animations if we have time budget
    const startTime = performance.now()
    while (this.lowPriorityQueue.length > 0 && performance.now() - startTime < 8) {
      const task = this.lowPriorityQueue.shift()
      if (task) task()
    }

    // Schedule next frame if there are remaining tasks
    if (this.lowPriorityQueue.length > 0) {
      this.scheduleFrame()
    }
  }

  private scheduleFrame = () => {
    if (!this.isScheduled) {
      this.isScheduled = true
      requestAnimationFrame(this.processQueue)
    }
  }

  schedule(task: () => void, priority: 'high' | 'low' = 'low') {
    if (priority === 'high') {
      this.highPriorityQueue.push(task)
    } else {
      this.lowPriorityQueue.push(task)
    }
    this.scheduleFrame()
  }

  clear() {
    this.highPriorityQueue.length = 0
    this.lowPriorityQueue.length = 0
    this.isScheduled = false
  }
}

export const animationScheduler = new AnimationScheduler()

/**
 * Enable hardware acceleration for an element
 */
export const enableHardwareAcceleration = (element: HTMLElement): void => {
  if (!element) return

  element.style.transform = element.style.transform || 'translateZ(0)'
  element.style.willChange = element.style.willChange || 'transform, opacity'
}

/**
 * Disable hardware acceleration to save memory
 */
export const disableHardwareAcceleration = (element: HTMLElement): void => {
  if (!element) return

  if (element.style.transform === 'translateZ(0)') {
    element.style.transform = ''
  }
  element.style.willChange = 'auto'
}

/**
 * Optimized intersection observer with built-in performance monitoring
 */
export const createOptimizedObserver = (
  callback: IntersectionObserverCallback,
  options: IntersectionObserverInit = {},
): IntersectionObserver => {
  const optimizedCallback: IntersectionObserverCallback = (entries, observer) => {
    // Batch process entries to reduce layout thrashing
    animationScheduler.schedule(() => {
      callback(entries, observer)
    }, 'low')
  }

  return new IntersectionObserver(optimizedCallback, {
    threshold: 0.1,
    rootMargin: '50px',
    ...options,
  })
}

/**
 * Layout shift prevention utilities
 */
export const layoutShiftPrevention = {
  /**
   * Reserve space for dynamic content to prevent layout shifts
   */
  reserveSpace: (element: HTMLElement, width?: number, height?: number): void => {
    if (width) element.style.minWidth = `${width}px`
    if (height) element.style.minHeight = `${height}px`
  },

  /**
   * Use transform instead of changing layout properties
   */
  animateWithTransform: (element: HTMLElement, from: number, to: number, duration = 300): void => {
    if (prefersReducedMotion()) {
      element.style.transform = `translateY(${to}px)`
      return
    }

    element.style.transform = `translateY(${from}px)`

    animationScheduler.schedule(() => {
      element.style.transition = `transform ${duration}ms cubic-bezier(0.16, 1, 0.3, 1)`
      element.style.transform = `translateY(${to}px)`

      setTimeout(() => {
        element.style.transition = ''
      }, duration)
    }, 'high')
  },

  /**
   * Preload images to prevent layout shifts
   */
  preloadImage: async (src: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.addEventListener('load', () => resolve())
      img.addEventListener('error', reject)
      img.src = src
    })
  },
}

/**
 * Performance monitoring for animations
 */
export const animationPerformance = {
  measureAnimationFrame: (name: string, callback: () => void): void => {
    if (typeof performance === 'undefined') {
      callback()
      return
    }

    performance.mark(`${name}-start`)
    callback()
    performance.mark(`${name}-end`)
    performance.measure(name, `${name}-start`, `${name}-end`)
  },

  logSlowAnimations: (threshold = 16): void => {
    if (typeof performance === 'undefined') return

    const measures = performance.getEntriesByType('measure')
    measures.forEach(measure => {
      if (measure.duration > threshold) {
        console.warn(`Slow animation detected: ${measure.name} took ${measure.duration.toFixed(2)}ms`)
      }
    })
  },
}

/**
 * Memory management for animations
 */
export const animationMemory = {
  cleanup: new Set<() => void>(),

  register: (cleanupFn: () => void): void => {
    animationMemory.cleanup.add(cleanupFn)
  },

  clearAll: (): void => {
    animationMemory.cleanup.forEach(fn => fn())
    animationMemory.cleanup.clear()
    animationScheduler.clear()
  },
}

/**
 * Auto-cleanup when page becomes hidden (for better performance)
 */
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      animationMemory.clearAll()
    }
  })
}

/**
 * Optimized CSS class utilities
 */
export const optimizedCSS = {
  /**
   * Add CSS class with performance optimization
   */
  addClass: (element: HTMLElement, className: string): void => {
    if (!element.classList.contains(className)) {
      animationScheduler.schedule(() => {
        element.classList.add(className)
      }, 'high')
    }
  },

  /**
   * Remove CSS class with performance optimization
   */
  removeClass: (element: HTMLElement, className: string): void => {
    if (element.classList.contains(className)) {
      animationScheduler.schedule(() => {
        element.classList.remove(className)
      }, 'low')
    }
  },

  /**
   * Toggle CSS class with performance optimization
   */
  toggleClass: (element: HTMLElement, className: string, force?: boolean): void => {
    animationScheduler.schedule(() => {
      element.classList.toggle(className, force)
    }, 'high')
  },
}
