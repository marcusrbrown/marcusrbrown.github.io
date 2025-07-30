import type {ReactNode} from 'react'
import {act, renderHook} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {ThemeProvider} from '../../src/contexts/ThemeContext'
import {useTheme} from '../../src/hooks/UseTheme'

// Mock matchMedia for testing system preference detection
const mockMatchMedia = vi.fn()

// Mock localStorage for testing
const localStorageMock = (() => {
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

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: mockMatchMedia,
  })

  Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
    writable: true,
  })
})

afterEach(() => {
  vi.clearAllMocks()
  localStorageMock.clear()
})

const wrapper = ({children}: {children: ReactNode}) => <ThemeProvider>{children}</ThemeProvider>

describe('useTheme', () => {
  describe('initialization', () => {
    it('should initialize with system preference light', () => {
      mockMatchMedia.mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })

      const {result} = renderHook(() => useTheme(), {wrapper})

      expect(result.current.themeMode).toBe('system')
      expect(result.current.systemPreference).toBe('light')
      expect(result.current.isSystemLight).toBe(true)
      expect(result.current.isSystemDark).toBe(false)
      expect(result.current.isSystemMode).toBe(true)
    })

    it('should initialize with system preference dark', () => {
      mockMatchMedia.mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })

      const {result} = renderHook(() => useTheme(), {wrapper})

      expect(result.current.systemPreference).toBe('dark')
      expect(result.current.isSystemDark).toBe(true)
      expect(result.current.isSystemLight).toBe(false)
    })
  })

  describe('theme state checks', () => {
    beforeEach(() => {
      mockMatchMedia.mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })
    })

    it('should correctly identify light mode', () => {
      const {result} = renderHook(() => useTheme(), {wrapper})

      act(() => {
        result.current.switchToLight()
      })

      expect(result.current.isLightMode).toBe(true)
      expect(result.current.isDarkMode).toBe(false)
      expect(result.current.isSystemMode).toBe(false)
    })

    it('should correctly identify dark mode', () => {
      const {result} = renderHook(() => useTheme(), {wrapper})

      act(() => {
        result.current.switchToDark()
      })

      expect(result.current.isDarkMode).toBe(true)
      expect(result.current.isLightMode).toBe(false)
      expect(result.current.isSystemMode).toBe(false)
    })

    it('should correctly identify system mode', () => {
      const {result} = renderHook(() => useTheme(), {wrapper})

      act(() => {
        result.current.switchToSystem()
      })

      expect(result.current.isSystemMode).toBe(true)
    })
  })

  describe('theme switching', () => {
    beforeEach(() => {
      mockMatchMedia.mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })
    })

    it('should switch to light mode', () => {
      const {result} = renderHook(() => useTheme(), {wrapper})

      act(() => {
        result.current.switchToLight()
      })

      expect(result.current.themeMode).toBe('light')
      expect(result.current.isLightMode).toBe(true)
    })

    it('should switch to dark mode', () => {
      const {result} = renderHook(() => useTheme(), {wrapper})

      act(() => {
        result.current.switchToDark()
      })

      expect(result.current.themeMode).toBe('dark')
      expect(result.current.isDarkMode).toBe(true)
    })

    it('should switch to system mode', () => {
      const {result} = renderHook(() => useTheme(), {wrapper})

      act(() => {
        result.current.switchToLight()
      })

      act(() => {
        result.current.switchToSystem()
      })

      expect(result.current.themeMode).toBe('system')
      expect(result.current.isSystemMode).toBe(true)
    })
  })

  describe('theme toggling', () => {
    beforeEach(() => {
      mockMatchMedia.mockReturnValue({
        matches: false, // System preference is light
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })
    })

    it('should toggle from light to dark', () => {
      const {result} = renderHook(() => useTheme(), {wrapper})

      act(() => {
        result.current.switchToLight()
      })

      act(() => {
        result.current.toggleTheme()
      })

      expect(result.current.themeMode).toBe('dark')
      expect(result.current.isDarkMode).toBe(true)
    })

    it('should toggle from dark to light', () => {
      const {result} = renderHook(() => useTheme(), {wrapper})

      act(() => {
        result.current.switchToDark()
      })

      act(() => {
        result.current.toggleTheme()
      })

      expect(result.current.themeMode).toBe('light')
      expect(result.current.isLightMode).toBe(true)
    })

    it('should toggle from system mode based on system preference', () => {
      const {result} = renderHook(() => useTheme(), {wrapper})

      // Start in system mode (light preference)
      expect(result.current.isSystemMode).toBe(true)
      expect(result.current.isSystemLight).toBe(true)

      act(() => {
        result.current.toggleTheme()
      })

      // Should switch to dark mode
      expect(result.current.themeMode).toBe('dark')
      expect(result.current.isDarkMode).toBe(true)
    })
  })

  describe('getEffectiveThemeMode', () => {
    it('should return system preference when in system mode', () => {
      mockMatchMedia.mockReturnValue({
        matches: true, // Dark preference
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })

      const {result} = renderHook(() => useTheme(), {wrapper})

      expect(result.current.getEffectiveThemeMode()).toBe('dark')
    })

    it('should return explicit mode when not in system mode', () => {
      mockMatchMedia.mockReturnValue({
        matches: true, // Dark preference
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })

      const {result} = renderHook(() => useTheme(), {wrapper})

      act(() => {
        result.current.switchToLight()
      })

      expect(result.current.getEffectiveThemeMode()).toBe('light')
    })
  })

  describe('custom themes', () => {
    beforeEach(() => {
      mockMatchMedia.mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })
    })

    it('should detect when no custom theme is active', () => {
      const {result} = renderHook(() => useTheme(), {wrapper})

      expect(result.current.isCustomTheme).toBe(false)
    })

    it('should detect when custom theme is active', () => {
      const {result} = renderHook(() => useTheme(), {wrapper})

      const customTheme = {
        id: 'custom-theme',
        name: 'Custom Theme',
        mode: 'dark' as const,
        colors: {
          primary: '#ff0000',
          secondary: '#00ff00',
          accent: '#0000ff',
          background: '#000000',
          surface: '#111111',
          text: '#ffffff',
          textSecondary: '#cccccc',
          border: '#333333',
          error: '#ff4444',
          warning: '#ffaa00',
          success: '#44ff44',
        },
      }

      act(() => {
        result.current.setCustomTheme(customTheme)
      })

      expect(result.current.isCustomTheme).toBe(true)
      expect(result.current.currentTheme.id).toBe('custom-theme')
    })
  })

  describe('available themes', () => {
    beforeEach(() => {
      mockMatchMedia.mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })
    })

    it('should provide available themes', () => {
      const {result} = renderHook(() => useTheme(), {wrapper})

      expect(result.current.availableThemes).toHaveLength(2)
      expect(result.current.availableThemes[0]?.id).toBe('default-light')
      expect(result.current.availableThemes[1]?.id).toBe('default-dark')
    })
  })
})
