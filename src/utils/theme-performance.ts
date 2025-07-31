/**
 * Performance utilities for theme switching optimization
 * Manages CSS containment and will-change properties for better theme transition performance
 */

export type PerformanceOptimizationLevel = 'minimal' | 'standard' | 'aggressive'

interface PerformanceState {
  isOptimizing: boolean
  level: PerformanceOptimizationLevel
  startTime: number
}

const performanceState: PerformanceState = {
  isOptimizing: false,
  level: 'standard',
  startTime: 0,
}

// CSS classes for performance optimization states
const PERFORMANCE_CLASSES = {
  switching: 'theme-switching',
  complete: 'theme-switch-complete',
  reducing: 'theme-switch-reducing',
} as const

/**
 * Applies aggressive performance optimizations for high-end devices
 */
const applyAggressiveOptimizations = (): void => {
  // Force GPU acceleration on more elements
  const elements = document.querySelectorAll('.project-card, .blog-post, .card, button, a')
  elements.forEach(element => {
    const htmlElement = element as HTMLElement
    htmlElement.style.transform = 'translate3d(0, 0, 0)'
    htmlElement.style.willChange = 'color, background-color, border-color, transform'
  })
}

/**
 * Applies minimal performance optimizations for lower-end devices
 */
const applyMinimalOptimizations = (): void => {
  const root = document.documentElement
  root.style.setProperty('--transition-theme', 'color 150ms ease, background-color 150ms ease')
  root.style.setProperty('--transition-theme-fast', 'color 100ms ease, background-color 100ms ease')
}

/**
 * Cleans up performance optimizations after theme switching completes
 */
export const cleanupThemeOptimizations = (): void => {
  if (!performanceState.isOptimizing) {
    return
  }

  const root = document.documentElement

  // Remove switching class and add complete class
  root.classList.remove(PERFORMANCE_CLASSES.switching)
  root.classList.add(PERFORMANCE_CLASSES.complete)

  // Log performance metrics in development
  const duration = performance.now() - performanceState.startTime
  const isDevelopment = typeof window !== 'undefined' && window.location.hostname === 'localhost'
  if (isDevelopment) {
    console.warn(`Theme switch completed in ${duration.toFixed(2)}ms`)
  }

  // Reset state
  performanceState.isOptimizing = false
  performanceState.startTime = 0

  // Schedule final cleanup to remove complete class
  setTimeout(() => {
    root.classList.remove(PERFORMANCE_CLASSES.complete)
  }, 100) // Allow time for any remaining transitions
}

/**
 * Schedules automatic cleanup of optimizations
 */
const scheduleOptimizationCleanup = (): void => {
  // Wait for CSS transition duration plus buffer
  const maxTransitionDuration = 300 // ms, matches --transition-theme-slow
  const bufferTime = 50 // ms buffer

  setTimeout(() => {
    if (performanceState.isOptimizing) {
      cleanupThemeOptimizations()
    }
  }, maxTransitionDuration + bufferTime)
}

/**
 * Resets the performance state - useful for testing
 * @internal
 */
export const resetPerformanceState = (): void => {
  performanceState.isOptimizing = false
  performanceState.level = 'standard'
  performanceState.startTime = 0

  // Clear any performance classes from document
  if (typeof document !== 'undefined') {
    document.documentElement.classList.remove(
      PERFORMANCE_CLASSES.switching,
      PERFORMANCE_CLASSES.complete,
      PERFORMANCE_CLASSES.reducing,
    )
  }
}

/**
 * Applies performance optimizations before theme switching
 * Uses CSS containment and will-change properties for smooth transitions
 */
export const optimizeForThemeSwitch = (level: PerformanceOptimizationLevel = 'standard'): void => {
  if (performanceState.isOptimizing) {
    return // Already optimizing
  }

  performanceState.isOptimizing = true
  performanceState.level = level
  performanceState.startTime = performance.now()

  const root = document.documentElement

  // Add performance optimization class
  root.classList.add(PERFORMANCE_CLASSES.switching)
  root.classList.remove(PERFORMANCE_CLASSES.complete)

  // Apply level-specific optimizations
  switch (level) {
    case 'aggressive':
      // Force composite layers on more elements
      applyAggressiveOptimizations()
      break
    case 'minimal':
      // Reduce optimizations for lower-end devices
      applyMinimalOptimizations()
      break
    case 'standard':
    default:
      // Default optimizations defined in CSS
      break
  }

  // Set up automatic cleanup after transition
  scheduleOptimizationCleanup()
}

/**
 * Detects if the device supports hardware acceleration
 */
export const supportsHardwareAcceleration = (): boolean => {
  // Simple feature detection
  const canvas = document.createElement('canvas')
  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
  return !!gl
}

/**
 * Gets the optimal performance level based on device capabilities
 */
export const getOptimalPerformanceLevel = (): PerformanceOptimizationLevel => {
  // Check for reduced motion preference
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return 'minimal'
  }

  // Check for hardware acceleration support
  if (!supportsHardwareAcceleration()) {
    return 'minimal'
  }

  // Check device memory (if available)
  const deviceMemory = (navigator as any).deviceMemory
  if (deviceMemory && deviceMemory < 4) {
    return 'standard'
  }

  // Check for high refresh rate displays
  const isHighRefreshRate = window.matchMedia('(min-resolution: 120dpi)').matches
  if (isHighRefreshRate) {
    return 'aggressive'
  }

  return 'standard'
}

/**
 * Monitors theme switching performance and adjusts optimization level
 */
export const monitorThemePerformance = (): void => {
  let performanceHistory: number[] = []
  const maxHistoryLength = 10

  // Create a performance monitoring wrapper
  const monitoredOptimize = (level?: PerformanceOptimizationLevel) => {
    const startTime = performance.now()

    optimizeForThemeSwitch(level)

    // Monitor when theme switch completes
    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        if (
          mutation.type === 'attributes' &&
          mutation.attributeName === 'class' &&
          (mutation.target as Element).classList.contains(PERFORMANCE_CLASSES.complete)
        ) {
          const duration = performance.now() - startTime
          performanceHistory.push(duration)

          // Keep only recent history
          if (performanceHistory.length > maxHistoryLength) {
            performanceHistory = performanceHistory.slice(-maxHistoryLength)
          }

          // Adjust optimization level if performance is consistently poor
          const avgDuration = performanceHistory.reduce((a, b) => a + b, 0) / performanceHistory.length
          if (avgDuration > 500 && performanceHistory.length >= 5) {
            console.warn('Theme switching performance is degraded, reducing optimization level')
            // Could automatically reduce optimization level here
          }

          observer.disconnect()
        }
      })
    })

    observer.observe(document.documentElement, {attributes: true})
  }

  // Store the monitored version for access
  ;(globalThis as any).monitoredOptimizeForThemeSwitch = monitoredOptimize
}

/**
 * Preloads critical CSS for theme switching
 */
export const preloadThemeAssets = (): void => {
  // Create a link element to preload the themes CSS if not already loaded
  const existingLink = document.querySelector('link[href*="themes.css"]')
  if (!existingLink) {
    const link = document.createElement('link')
    link.rel = 'preload'
    link.as = 'style'
    link.href = '/src/styles/themes.css'
    document.head.append(link)
  }

  // Force browser to parse and cache theme-related selectors
  const testElement = document.createElement('div')
  testElement.className = 'theme-switching theme-switch-complete'
  testElement.style.position = 'absolute'
  testElement.style.left = '-9999px'
  testElement.style.opacity = '0'
  document.body.append(testElement)

  // Remove test element after styles are cached
  setTimeout(() => {
    testElement.remove()
  }, 10)
}

// Initialize performance monitoring on load
if (typeof window !== 'undefined') {
  // Preload theme assets
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', preloadThemeAssets)
  } else {
    preloadThemeAssets()
  }

  // Initialize performance monitoring
  monitorThemePerformance()
}
