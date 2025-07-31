import {afterEach, describe, expect, it, vi} from 'vitest'
import {
  cleanupThemeOptimizations,
  getOptimalPerformanceLevel,
  optimizeForThemeSwitch,
  preloadThemeAssets,
  resetPerformanceState,
  supportsHardwareAcceleration,
  type PerformanceOptimizationLevel,
} from '../../src/utils/theme-performance'

// Mock performance API
Object.defineProperty(window, 'performance', {
  writable: true,
  value: {
    now: vi.fn(() => Date.now()),
  },
})

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn((query: string) => ({
    matches: !query.includes('prefers-reduced-motion: reduce'),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock document.head for CSS preloading tests
Object.defineProperty(document, 'head', {
  writable: true,
  value: {
    append: vi.fn(),
    appendChild: vi.fn(),
    querySelector: vi.fn(() => null),
  },
})

// Mock document.body for test element tests
Object.defineProperty(document, 'body', {
  writable: true,
  value: {
    append: vi.fn(),
    appendChild: vi.fn(),
    removeChild: vi.fn(),
  },
})

describe('theme-performance utilities', () => {
  afterEach(() => {
    // Reset the performance state completely
    resetPerformanceState()

    // Clear all mocks
    vi.clearAllMocks()

    // Clear any pending timers
    vi.clearAllTimers()
  })

  describe('optimizeForThemeSwitch', () => {
    it('should add theme-switching class to document root', () => {
      optimizeForThemeSwitch('standard')

      expect(document.documentElement.classList.contains('theme-switching')).toBe(true)
    })

    it('should not optimize if already optimizing', () => {
      // First call should work
      optimizeForThemeSwitch('standard')
      const afterFirstCall = document.documentElement.className

      // Second call should not change anything
      optimizeForThemeSwitch('aggressive')
      const afterSecondCall = document.documentElement.className

      expect(afterFirstCall).toBe(afterSecondCall)
      expect(document.documentElement.classList.contains('theme-switching')).toBe(true)
    })

    it('should handle different optimization levels', () => {
      const levels: PerformanceOptimizationLevel[] = ['minimal', 'standard', 'aggressive']

      levels.forEach(level => {
        resetPerformanceState() // Reset internal state
        document.documentElement.className = '' // Reset DOM
        optimizeForThemeSwitch(level)
        expect(document.documentElement.classList.contains('theme-switching')).toBe(true)
      })
    })

    it('should schedule automatic cleanup', async () => {
      vi.useFakeTimers()

      optimizeForThemeSwitch('standard')
      expect(document.documentElement.classList.contains('theme-switching')).toBe(true)
      expect(document.documentElement.classList.contains('theme-switch-complete')).toBe(false)

      // Fast-forward to trigger cleanup
      vi.advanceTimersByTime(350)

      // Should have cleaned up by now
      expect(document.documentElement.classList.contains('theme-switching')).toBe(false)
      expect(document.documentElement.classList.contains('theme-switch-complete')).toBe(true)

      vi.useRealTimers()
    })
  })

  describe('cleanupThemeOptimizations', () => {
    it('should remove theme-switching class and add theme-switch-complete class', () => {
      // First optimize
      optimizeForThemeSwitch('standard')
      expect(document.documentElement.classList.contains('theme-switching')).toBe(true)

      // Then cleanup
      cleanupThemeOptimizations()
      expect(document.documentElement.classList.contains('theme-switching')).toBe(false)
      expect(document.documentElement.classList.contains('theme-switch-complete')).toBe(true)
    })

    it('should do nothing if not currently optimizing', () => {
      cleanupThemeOptimizations()

      expect(document.documentElement.classList.contains('theme-switching')).toBe(false)
      expect(document.documentElement.classList.contains('theme-switch-complete')).toBe(false)
    })

    it('should schedule final cleanup of complete class', async () => {
      vi.useFakeTimers()

      optimizeForThemeSwitch('standard')
      cleanupThemeOptimizations()

      expect(document.documentElement.classList.contains('theme-switch-complete')).toBe(true)

      // Fast-forward to trigger final cleanup
      vi.advanceTimersByTime(100)

      expect(document.documentElement.classList.contains('theme-switch-complete')).toBe(false)

      vi.useRealTimers()
    })
  })

  describe('supportsHardwareAcceleration', () => {
    it('should detect WebGL support', () => {
      // Mock canvas and WebGL context
      const mockCanvas = {
        getContext: vi.fn((type: string) => {
          if (type === 'webgl' || type === 'experimental-webgl') {
            return {} // Return truthy WebGL context
          }
          return null
        }),
      }

      vi.spyOn(document, 'createElement').mockReturnValue(mockCanvas as any)

      const result = supportsHardwareAcceleration()
      expect(result).toBe(true)
      expect(mockCanvas.getContext).toHaveBeenCalledWith('webgl')
    })

    it('should return false when WebGL is not supported', () => {
      const mockCanvas = {
        getContext: vi.fn(() => null),
      }

      vi.spyOn(document, 'createElement').mockReturnValue(mockCanvas as any)

      const result = supportsHardwareAcceleration()
      expect(result).toBe(false)
    })
  })

  describe('getOptimalPerformanceLevel', () => {
    it('should return minimal for reduced motion preference', () => {
      // Mock reduced motion preference
      vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
        matches: query.includes('prefers-reduced-motion: reduce'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))

      const level = getOptimalPerformanceLevel()
      expect(level).toBe('minimal')
    })

    it('should return minimal for devices without hardware acceleration', () => {
      // Mock no hardware acceleration
      const mockCanvas = {
        getContext: vi.fn(() => null),
      }
      vi.spyOn(document, 'createElement').mockReturnValue(mockCanvas as any)

      const level = getOptimalPerformanceLevel()
      expect(level).toBe('minimal')
    })

    it('should return standard for average devices', () => {
      // Mock hardware acceleration support
      const mockCanvas = {
        getContext: vi.fn(() => ({})),
      }
      vi.spyOn(document, 'createElement').mockReturnValue(mockCanvas as any)

      // Mock normal motion preference
      vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
        matches: !query.includes('prefers-reduced-motion: reduce') && !query.includes('min-resolution: 120dpi'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))

      const level = getOptimalPerformanceLevel()
      expect(level).toBe('standard')
    })

    it('should return aggressive for high-DPI displays', () => {
      // Mock hardware acceleration support
      const mockCanvas = {
        getContext: vi.fn(() => ({})),
      }
      vi.spyOn(document, 'createElement').mockReturnValue(mockCanvas as any)

      // Mock high-DPI display
      vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
        matches: query.includes('min-resolution: 120dpi'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))

      const level = getOptimalPerformanceLevel()
      expect(level).toBe('aggressive')
    })
  })

  describe('preloadThemeAssets', () => {
    it('should create preload link if not exists', () => {
      const mockLink = {
        rel: '',
        as: '',
        href: '',
      }

      const mockDiv = {
        className: '',
        style: {
          position: '',
          left: '',
          opacity: '',
        },
        remove: vi.fn(),
      }

      const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'link') return mockLink as any
        if (tag === 'div') return mockDiv as any
        return {} as any
      })
      const querySelectorSpy = vi.spyOn(document, 'querySelector').mockReturnValue(null)
      const appendSpy = vi.spyOn(document.head, 'append')

      preloadThemeAssets()

      expect(createElementSpy).toHaveBeenCalledWith('link')
      expect(mockLink.rel).toBe('preload')
      expect(mockLink.as).toBe('style')
      expect(mockLink.href).toBe('/src/styles/themes.css')
      expect(appendSpy).toHaveBeenCalledWith(mockLink)

      createElementSpy.mockRestore()
      querySelectorSpy.mockRestore()
      appendSpy.mockRestore()
    })

    it('should not create preload link if already exists', () => {
      const mockDiv = {
        className: '',
        style: {
          position: '',
          left: '',
          opacity: '',
        },
        remove: vi.fn(),
      }

      const querySelectorSpy = vi.spyOn(document, 'querySelector').mockReturnValue({} as any)
      const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'div') return mockDiv as any
        return {} as any
      })

      preloadThemeAssets()

      expect(createElementSpy).not.toHaveBeenCalledWith('link')

      querySelectorSpy.mockRestore()
      createElementSpy.mockRestore()
    })

    it('should create and remove test element for style caching', () => {
      vi.useFakeTimers()

      const mockElement = {
        className: '',
        style: {
          position: '',
          left: '',
          opacity: '',
        },
        remove: vi.fn(),
      }

      const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'div') return mockElement as any
        return {rel: '', as: '', href: ''} as any
      })

      const appendSpy = vi.spyOn(document.body, 'append')

      preloadThemeAssets()

      expect(mockElement.className).toBe('theme-switching theme-switch-complete')
      expect(mockElement.style.position).toBe('absolute')
      expect(mockElement.style.left).toBe('-9999px')
      expect(mockElement.style.opacity).toBe('0')
      expect(appendSpy).toHaveBeenCalledWith(mockElement)

      // Fast-forward to trigger element removal
      vi.advanceTimersByTime(10)

      expect(mockElement.remove).toHaveBeenCalled()

      createElementSpy.mockRestore()
      appendSpy.mockRestore()
      vi.useRealTimers()
    })
  })
})
