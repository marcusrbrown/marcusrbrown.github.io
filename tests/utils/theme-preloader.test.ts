import {afterEach, beforeEach, describe, expect, it, vi, type MockedFunction} from 'vitest'
import {
  generateMinimalThemePreloaderScript,
  generateThemePreloaderScript,
  preloadTheme,
} from '../../src/utils/theme-preloader'

// Mock localStorage
const mockLocalStorage = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      store = {}
    }),
  }
})()

// Mock matchMedia
const mockMatchMedia = vi.fn()

// Mock document.documentElement
const mockDocumentElement = {
  style: {
    setProperty: vi.fn(),
  },
  dataset: {} as Record<string, string>,
  setAttribute: vi.fn(),
}

describe('Theme Preloader', () => {
  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks()
    mockLocalStorage.clear()

    // Reset mock functions
    mockDocumentElement.style.setProperty.mockClear()
    mockDocumentElement.setAttribute.mockClear()
    mockDocumentElement.dataset = {}

    // Setup global mocks with stubGlobal for better isolation
    vi.stubGlobal('localStorage', mockLocalStorage)

    // Ensure matchMedia returns a proper mock object
    mockMatchMedia.mockReturnValue({
      matches: false,
      media: '',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })

    vi.stubGlobal('window', {
      localStorage: mockLocalStorage,
      matchMedia: mockMatchMedia,
    })
    vi.stubGlobal('document', {
      documentElement: mockDocumentElement,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  describe('preloadTheme', () => {
    it('should apply light theme when no saved preference exists', () => {
      // Setup: No saved theme mode, system preference is light
      mockMatchMedia.mockReturnValue({matches: false})

      preloadTheme()

      // Verify light theme colors are applied
      expect(mockDocumentElement.style.setProperty).toHaveBeenCalledWith('--color-primary', '#2563eb')
      expect(mockDocumentElement.style.setProperty).toHaveBeenCalledWith('--color-background', '#ffffff')
      expect(mockDocumentElement.style.setProperty).toHaveBeenCalledWith('--color-text', '#0f172a')
      expect(mockDocumentElement.dataset['theme']).toBe('light')
    })

    it('should apply dark theme when system preference is dark', () => {
      // Setup: No saved theme mode, system preference is dark
      mockMatchMedia.mockReturnValue({matches: true})

      preloadTheme()

      // Verify dark theme colors are applied
      expect(mockDocumentElement.style.setProperty).toHaveBeenCalledWith('--color-primary', '#3b82f6')
      expect(mockDocumentElement.style.setProperty).toHaveBeenCalledWith('--color-background', '#0f172a')
      expect(mockDocumentElement.style.setProperty).toHaveBeenCalledWith('--color-text', '#f1f5f9')
      expect(mockDocumentElement.dataset['theme']).toBe('dark')
    })

    it('should apply light theme when saved theme mode is light', () => {
      // Setup: Saved theme mode is light
      mockLocalStorage.setItem('mrbro-dev-theme-mode', 'light')

      preloadTheme()

      // Verify light theme colors are applied
      expect(mockDocumentElement.style.setProperty).toHaveBeenCalledWith('--color-primary', '#2563eb')
      expect(mockDocumentElement.style.setProperty).toHaveBeenCalledWith('--color-background', '#ffffff')
      expect(mockDocumentElement.dataset['theme']).toBe('light')
    })

    it('should apply dark theme when saved theme mode is dark', () => {
      // Setup: Saved theme mode is dark
      mockLocalStorage.setItem('mrbro-dev-theme-mode', 'dark')

      preloadTheme()

      // Verify dark theme colors are applied
      expect(mockDocumentElement.style.setProperty).toHaveBeenCalledWith('--color-primary', '#3b82f6')
      expect(mockDocumentElement.style.setProperty).toHaveBeenCalledWith('--color-background', '#0f172a')
      expect(mockDocumentElement.dataset['theme']).toBe('dark')
    })

    it('should apply custom theme when available', () => {
      // Setup: Custom theme in localStorage
      const customTheme = {
        id: 'custom-theme',
        name: 'Custom',
        mode: 'light',
        colors: {
          primary: '#ff0000',
          secondary: '#00ff00',
          accent: '#0000ff',
          background: '#ffffff',
          surface: '#f0f0f0',
          text: '#000000',
          textSecondary: '#666666',
          border: '#cccccc',
          error: '#ff0000',
          warning: '#ffaa00',
          success: '#00ff00',
        },
      }
      mockLocalStorage.setItem('mrbro-dev-custom-theme', JSON.stringify(customTheme))

      preloadTheme()

      // Verify custom theme colors are applied
      expect(mockDocumentElement.style.setProperty).toHaveBeenCalledWith('--color-primary', '#ff0000')
      expect(mockDocumentElement.style.setProperty).toHaveBeenCalledWith('--color-secondary', '#00ff00')
      expect(mockDocumentElement.style.setProperty).toHaveBeenCalledWith('--color-accent', '#0000ff')
      expect(mockDocumentElement.dataset['theme']).toBe('light')
    })

    it('should fall back to light theme on localStorage error', () => {
      // Setup: localStorage throws an error
      ;(mockLocalStorage.getItem as MockedFunction<typeof mockLocalStorage.getItem>).mockImplementation(() => {
        throw new Error('localStorage error')
      })

      preloadTheme()

      // Verify light theme is applied as fallback
      expect(mockDocumentElement.style.setProperty).toHaveBeenCalledWith('--color-primary', '#2563eb')
      expect(mockDocumentElement.style.setProperty).toHaveBeenCalledWith('--color-background', '#ffffff')
      expect(mockDocumentElement.dataset['theme']).toBe('light')
    })

    it('should handle invalid JSON in custom theme gracefully', () => {
      // Setup: Invalid JSON in custom theme
      mockLocalStorage.setItem('mrbro-dev-custom-theme', 'invalid-json')
      mockLocalStorage.setItem('mrbro-dev-theme-mode', 'dark')

      preloadTheme()

      // Verify falls back to saved theme mode (dark)
      expect(mockDocumentElement.style.setProperty).toHaveBeenCalledWith('--color-primary', '#3b82f6')
      expect(mockDocumentElement.style.setProperty).toHaveBeenCalledWith('--color-background', '#0f172a')
      expect(mockDocumentElement.dataset['theme']).toBe('dark')
    })

    it('should handle missing matchMedia gracefully', () => {
      // Setup: matchMedia is not available
      Object.defineProperty(window, 'matchMedia', {
        value: undefined,
        writable: true,
      })

      preloadTheme()

      // Verify falls back to light theme
      expect(mockDocumentElement.style.setProperty).toHaveBeenCalledWith('--color-primary', '#2563eb')
      expect(mockDocumentElement.style.setProperty).toHaveBeenCalledWith('--color-background', '#ffffff')
      expect(mockDocumentElement.dataset['theme']).toBe('light')
    })
  })

  describe('generateThemePreloaderScript', () => {
    it('should generate a valid JavaScript function', () => {
      const script = generateThemePreloaderScript()

      expect(script).toContain('DEFAULT_LIGHT_THEME')
      expect(script).toContain('DEFAULT_DARK_THEME')
      expect(script).toContain('preloadTheme()')
      expect(script).toContain('mrbro-dev-theme-mode')
      expect(script).toContain('mrbro-dev-custom-theme')
    })

    it('should be a self-contained script', () => {
      const script = generateThemePreloaderScript()

      // Should start with an IIFE
      expect(script).toMatch(/^\s*\(function\(\)\s*\{/)
      // Should end with execution
      expect(script).toContain('preloadTheme();')
      expect(script).toMatch(/\}\)\(\);\s*$/)
    })
  })

  describe('generateMinimalThemePreloaderScript', () => {
    it('should generate a minimal JavaScript function', () => {
      const script = generateMinimalThemePreloaderScript()

      expect(script).toContain('mrbro-dev-theme-mode')
      expect(script).toContain('prefers-color-scheme: dark')
      expect(script).toContain('--color-primary')
      expect(script).toContain('--color-background')
    })

    it('should be smaller than the full script', () => {
      const fullScript = generateThemePreloaderScript()
      const minimalScript = generateMinimalThemePreloaderScript()

      expect(minimalScript.length).toBeLessThan(fullScript.length)
    })

    it('should be a self-contained script', () => {
      const script = generateMinimalThemePreloaderScript()

      // Should start with an IIFE
      expect(script).toMatch(/^\s*\(function\(\)\s*\{/)
      // Should end with execution
      expect(script).toMatch(/\}\)\(\);\s*$/)
    })
  })

  describe('FOUC Prevention Integration', () => {
    it('should apply all necessary CSS custom properties', () => {
      preloadTheme()

      // Verify all theme color custom properties are set
      const expectedProperties = [
        '--color-primary',
        '--color-secondary',
        '--color-accent',
        '--color-background',
        '--color-surface',
        '--color-text',
        '--color-text-secondary',
        '--color-border',
        '--color-error',
        '--color-warning',
        '--color-success',
      ]

      expectedProperties.forEach(property => {
        expect(mockDocumentElement.style.setProperty).toHaveBeenCalledWith(property, expect.any(String))
      })
    })

    it('should set theme data attribute for CSS selectors', () => {
      preloadTheme()

      expect(mockDocumentElement.dataset['theme']).toMatch(/^(light|dark)$/)
    })

    it('should work in server-side rendering environment', () => {
      // Setup: Simulate SSR environment
      Object.defineProperty(window, 'localStorage', {
        value: undefined,
        writable: true,
      })

      // Should not throw an error
      expect(() => preloadTheme()).not.toThrow()
    })
  })
})
