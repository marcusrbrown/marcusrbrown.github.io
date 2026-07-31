import type {ReactNode} from 'react'
import {act, renderHook} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {ThemeProvider} from '../../src/contexts/ThemeContext'
import {useTheme} from '../../src/hooks/UseTheme'
import {trackUmamiEvent} from '../../src/utils/analytics'
import {presetThemes} from '../../src/utils/preset-themes'

vi.mock('../../src/utils/analytics', () => ({
  analytics: {
    trackThemeChange: vi.fn(),
  },
  trackUmamiEvent: vi.fn(),
}))

const mockTrackUmamiEvent = vi.mocked(trackUmamiEvent)

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
  mockTrackUmamiEvent.mockReset()
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

const getFirstPreset = () => {
  const preset = presetThemes[0]
  if (!preset) {
    throw new Error('Expected preset catalog to contain at least one theme')
  }
  return preset
}

const getPreset = (id: string) => {
  const preset = presetThemes.find(theme => theme.id === id)
  if (!preset) {
    throw new Error(`Expected preset catalog to contain ${id}`)
  }
  return preset
}

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

    it('clears an active preset when selecting a mode and removes its storage', () => {
      const {result} = renderHook(() => useTheme(), {wrapper})

      act(() => {
        result.current.setCustomTheme(getFirstPreset())
      })
      const setItemCallCount = localStorageMock.setItem.mock.calls.length

      act(() => {
        result.current.setActiveTheme({type: 'mode', mode: 'dark'})
      })

      expect(result.current.currentTheme.id).toBe('default-dark')
      expect(result.current.activeThemeChoice).toEqual({type: 'mode', mode: 'dark'})
      expect(localStorage.getItem('mrbro-dev-custom-theme')).toBeNull()
      expect(localStorageMock.setItem.mock.calls.length).toBe(setItemCallCount + 1)
      const lastSetCall = localStorageMock.setItem.mock.invocationCallOrder.at(-1)
      const lastRemoveCall = localStorageMock.removeItem.mock.invocationCallOrder.at(-1)
      expect(lastSetCall).toBeDefined()
      expect(lastRemoveCall).toBeDefined()
      expect(lastSetCall ?? Infinity).toBeLessThan(lastRemoveCall ?? -Infinity)
    })

    it('updates a custom theme from a custom-theme storage event', () => {
      const {result} = renderHook(() => useTheme(), {wrapper})
      const customTheme = {
        id: 'storage-custom-theme',
        name: 'Storage Custom Theme',
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
        localStorage.setItem('mrbro-dev-custom-theme', JSON.stringify(customTheme))
        window.dispatchEvent(new StorageEvent('storage', {key: 'mrbro-dev-custom-theme'}))
      })

      expect(result.current.currentTheme).toEqual(customTheme)
      expect(result.current.activeThemeChoice).toEqual({type: 'legacy-custom', theme: customTheme})
    })

    it('preserves a preset when generic setThemeMode changes mode', () => {
      const {result} = renderHook(() => useTheme(), {wrapper})
      const preset = getFirstPreset()

      act(() => {
        result.current.setCustomTheme(preset)
        result.current.setThemeMode('dark')
      })

      expect(result.current.currentTheme).toBe(preset)
      expect(result.current.activeThemeChoice).toEqual({type: 'preset', theme: preset})
    })

    it('clears a preset in setActiveTheme mode selection after saving mode', () => {
      const {result} = renderHook(() => useTheme(), {wrapper})
      const preset = getFirstPreset()

      act(() => {
        result.current.setCustomTheme(preset)
      })
      const setItemCallCount = localStorageMock.setItem.mock.calls.length

      act(() => {
        result.current.setActiveTheme({type: 'mode', mode: 'dark'})
      })

      expect(result.current.currentTheme.id).toBe('default-dark')
      expect(localStorage.getItem('mrbro-dev-custom-theme')).toBeNull()
      expect(localStorageMock.setItem.mock.calls.length).toBe(setItemCallCount + 1)
      const lastSetCall = localStorageMock.setItem.mock.invocationCallOrder.at(-1)
      const lastRemoveCall = localStorageMock.removeItem.mock.invocationCallOrder.at(-1)
      expect(lastSetCall).toBeDefined()
      expect(lastRemoveCall).toBeDefined()
      expect(lastSetCall ?? Infinity).toBeLessThan(lastRemoveCall ?? -Infinity)
    })

    it('applies and persists a preset through setActiveTheme', () => {
      const {result} = renderHook(() => useTheme(), {wrapper})
      const preset = getFirstPreset()

      act(() => {
        result.current.setActiveTheme({type: 'preset', theme: preset})
      })

      expect(result.current.currentTheme).toBe(preset)
      expect(result.current.activeThemeChoice).toEqual({type: 'preset', theme: preset})
      expect(JSON.parse(localStorage.getItem('mrbro-dev-custom-theme') ?? '{}')).toEqual(preset)
    })

    it('retains custom semantics for recognized presets', () => {
      const {result} = renderHook(() => useTheme(), {wrapper})
      const preset = getFirstPreset()

      act(() => {
        result.current.setCustomTheme(preset)
      })

      expect(result.current.isCustomTheme).toBe(true)
      expect(result.current.activeThemeChoice).toEqual({type: 'preset', theme: preset})
    })

    it('treats a custom theme colliding with a built-in ID as legacy custom', () => {
      const {result} = renderHook(() => useTheme(), {wrapper})
      const collidingTheme = {...getFirstPreset(), id: 'default-light', name: 'Colliding Custom'}

      act(() => {
        result.current.setCustomTheme(collidingTheme)
      })

      expect(result.current.activeThemeChoice).toEqual({type: 'legacy-custom', theme: collidingTheme})
      expect(result.current.isCustomTheme).toBe(true)

      act(() => {
        result.current.setActiveTheme({type: 'mode', mode: 'light'})
      })

      expect(result.current.currentTheme.id).toBe('default-light')
      expect(result.current.activeCustomTheme).toBeNull()
    })

    it('requires matching preset data before classifying a same-ID custom as a preset', () => {
      const {result} = renderHook(() => useTheme(), {wrapper})
      const canonicalPreset = getPreset('dracula')
      const alteredCustom = {
        ...canonicalPreset,
        name: 'Altered Dracula',
        colors: {...canonicalPreset.colors, primary: '#123456'},
      }

      act(() => {
        result.current.setCustomTheme(alteredCustom)
      })

      expect(result.current.activeThemeChoice).toEqual({type: 'legacy-custom', theme: alteredCustom})

      act(() => {
        result.current.setActiveTheme({type: 'preset', theme: canonicalPreset})
      })

      expect(result.current.currentTheme).toBe(canonicalPreset)
      expect(result.current.activeThemeChoice).toEqual({type: 'preset', theme: canonicalPreset})
    })

    it('carries the resolved active custom theme object for a preset choice', () => {
      const {result} = renderHook(() => useTheme(), {wrapper})
      const preset = getFirstPreset()

      act(() => {
        result.current.setActiveTheme({type: 'preset', theme: preset})
      })

      expect(result.current.activeThemeChoice).toEqual({type: 'preset', theme: result.current.activeCustomTheme})
    })

    it('restores a persisted preset over a dormant mode after reload', () => {
      const preset = getFirstPreset()
      localStorage.setItem('mrbro-dev-theme-mode', JSON.stringify('dark'))
      localStorage.setItem('mrbro-dev-custom-theme', JSON.stringify(preset))

      const {result, unmount} = renderHook(() => useTheme(), {wrapper})

      expect(result.current.currentTheme.id).toBe(preset.id)
      expect(result.current.activeThemeChoice).toEqual({type: 'preset', theme: preset})

      unmount()
      const reloaded = renderHook(() => useTheme(), {wrapper})
      expect(reloaded.result.current.currentTheme.id).toBe(preset.id)
      expect(reloaded.result.current.activeThemeChoice).toEqual({type: 'preset', theme: preset})
    })

    it('derives recognized presets separately from legacy custom themes', () => {
      const {result} = renderHook(() => useTheme(), {wrapper})

      act(() => {
        result.current.setCustomTheme(getFirstPreset())
      })

      expect(result.current.activeThemeChoice).toEqual({type: 'preset', theme: getFirstPreset()})
      expect(result.current.isCustomTheme).toBe(true)
    })

    it('preserves an unrecognized custom theme as legacy custom state', () => {
      const {result} = renderHook(() => useTheme(), {wrapper})
      const legacyTheme = {
        id: 'legacy-theme',
        name: 'Legacy Theme',
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
        result.current.setCustomTheme(legacyTheme)
      })

      expect(result.current.activeThemeChoice).toEqual({type: 'legacy-custom', theme: legacyTheme})
      expect(result.current.isCustomTheme).toBe(true)
    })
  })

  describe('theme analytics boundary', () => {
    beforeEach(() => {
      mockMatchMedia.mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })
    })

    it.each(['light', 'dark', 'system'] as const)('emits one exact mode event for %s selection', mode => {
      const {result} = renderHook(() => useTheme(), {wrapper})
      const initialMode = mode === 'light' ? 'dark' : 'light'

      act(() => {
        result.current.setActiveTheme({type: 'mode', mode: initialMode})
      })
      mockTrackUmamiEvent.mockClear()

      act(() => {
        result.current.setActiveTheme({type: 'mode', mode})
      })

      expect(mockTrackUmamiEvent).toHaveBeenCalledTimes(1)
      expect(mockTrackUmamiEvent).toHaveBeenCalledWith('theme_change', {kind: 'mode', value: mode})
    })

    it('suppresses a direct reselect of the active stored mode', () => {
      const {result} = renderHook(() => useTheme(), {wrapper})

      act(() => {
        result.current.setActiveTheme({type: 'mode', mode: 'system'})
      })

      expect(mockTrackUmamiEvent).not.toHaveBeenCalled()
    })

    it('emits when a custom theme is active even if mode selection matches the stored mode', () => {
      const {result} = renderHook(() => useTheme(), {wrapper})
      const preset = getFirstPreset()

      act(() => {
        result.current.setThemeMode('dark')
        result.current.setCustomTheme(preset)
      })
      mockTrackUmamiEvent.mockClear()

      act(() => {
        result.current.setActiveTheme({type: 'mode', mode: 'dark'})
      })

      expect(mockTrackUmamiEvent).toHaveBeenCalledExactlyOnceWith('theme_change', {
        kind: 'mode',
        value: 'dark',
      })
    })

    it('emits one exact preset event using the canonical preset ID', () => {
      const {result} = renderHook(() => useTheme(), {wrapper})
      const preset = getFirstPreset()

      act(() => {
        result.current.setActiveTheme({type: 'preset', theme: preset})
      })

      expect(mockTrackUmamiEvent).toHaveBeenCalledTimes(1)
      expect(mockTrackUmamiEvent).toHaveBeenCalledWith('theme_change', {kind: 'preset', value: preset.id})
    })

    it('suppresses a direct reselect of the active preset ID', () => {
      const {result} = renderHook(() => useTheme(), {wrapper})
      const preset = getFirstPreset()

      act(() => {
        result.current.setActiveTheme({type: 'preset', theme: preset})
      })
      mockTrackUmamiEvent.mockClear()

      act(() => {
        result.current.setActiveTheme({type: 'preset', theme: preset})
      })

      expect(mockTrackUmamiEvent).not.toHaveBeenCalled()
      expect(result.current.currentTheme.id).toBe(preset.id)
    })

    it('suppresses analytics for direct custom theme selection', () => {
      const {result} = renderHook(() => useTheme(), {wrapper})
      const customTheme = {...getFirstPreset(), id: 'custom-theme', name: 'Custom Theme'}

      act(() => {
        result.current.setCustomTheme(customTheme)
      })

      expect(mockTrackUmamiEvent).not.toHaveBeenCalled()
    })

    it('emits only at the active-theme boundary when mode selection clears a custom theme', () => {
      const {result} = renderHook(() => useTheme(), {wrapper})
      const preset = getFirstPreset()

      act(() => {
        result.current.setCustomTheme(preset)
      })
      mockTrackUmamiEvent.mockClear()

      act(() => {
        result.current.setActiveTheme({type: 'mode', mode: 'dark'})
      })

      expect(mockTrackUmamiEvent).toHaveBeenCalledTimes(1)
      expect(mockTrackUmamiEvent).toHaveBeenCalledWith('theme_change', {kind: 'mode', value: 'dark'})
    })

    it('does not emit during initialization or storage hydration', () => {
      const preset = getFirstPreset()
      localStorage.setItem('mrbro-dev-theme-mode', JSON.stringify('dark'))
      localStorage.setItem('mrbro-dev-custom-theme', JSON.stringify(preset))

      const {result} = renderHook(() => useTheme(), {wrapper})
      expect(result.current.currentTheme.id).toBe(preset.id)
      expect(mockTrackUmamiEvent).not.toHaveBeenCalled()

      act(() => {
        localStorage.setItem('mrbro-dev-theme-mode', JSON.stringify('light'))
        localStorage.setItem('mrbro-dev-custom-theme', '')
        window.dispatchEvent(new StorageEvent('storage', {key: 'mrbro-dev-custom-theme'}))
      })

      expect(result.current.themeMode).toBe('light')
      expect(mockTrackUmamiEvent).not.toHaveBeenCalled()
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

// ---- Additional ThemeContext coverage: reduced-motion and cross-tab sync ----
describe('ThemeContext — reduced-motion and cross-tab sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorageMock.clear()

    mockMatchMedia.mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })

    Object.defineProperty(window, 'matchMedia', {writable: true, value: mockMatchMedia})
    Object.defineProperty(window, 'localStorage', {value: localStorageMock, writable: true})
  })

  it('should change theme mode even when reduced motion is preferred', () => {
    // prefersReducedMotion is mocked via matchMedia
    mockMatchMedia.mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))

    const {result} = renderHook(() => useTheme(), {wrapper})

    act(() => {
      result.current.setThemeMode('dark')
    })

    expect(result.current.themeMode).toBe('dark')
  })

  it('should update systemPreference when matchMedia fires change event', () => {
    // Store the handler registered via addEventListener
    const registeredHandlers: ((e: MediaQueryListEvent) => void)[] = []
    mockMatchMedia.mockReturnValue({
      matches: false,
      addEventListener: (_event: string, handler: (e: MediaQueryListEvent) => void) => {
        registeredHandlers.push(handler)
      },
      removeEventListener: vi.fn(),
    })

    const {result} = renderHook(() => useTheme(), {wrapper})
    // The useEffect has registered a change handler
    expect(registeredHandlers.length).toBeGreaterThan(0)

    act(() => {
      registeredHandlers.forEach(h => h({matches: true} as unknown as MediaQueryListEvent))
    })

    expect(result.current.systemPreference).toBe('dark')
  })

  it('should sync theme mode from cross-tab storage event', () => {
    const {result} = renderHook(() => useTheme(), {wrapper})
    const initialMode = result.current.themeMode

    act(() => {
      localStorage.setItem('mrbro-dev-theme-mode', JSON.stringify('dark'))
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'mrbro-dev-theme-mode',
          newValue: JSON.stringify('dark'),
        }),
      )
    })

    expect(result.current.themeMode).toBe('dark')
    expect(result.current.themeMode).not.toBe(initialMode)
  })

  it('should handle cross-tab storage event for custom theme key', () => {
    const {result} = renderHook(() => useTheme(), {wrapper})
    const initialMode = result.current.themeMode

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'mrbro-dev-custom-theme',
          newValue: null,
        }),
      )
    })

    expect(result.current.themeMode).toBe(initialMode)
    expect(result.current.isCustomTheme).toBe(false)
  })

  it('should converge on the persisted custom-over-mode pair regardless of event key', () => {
    const preset = getFirstPreset()
    localStorage.setItem('mrbro-dev-theme-mode', JSON.stringify('dark'))
    localStorage.setItem('mrbro-dev-custom-theme', JSON.stringify(preset))
    const {result} = renderHook(() => useTheme(), {wrapper})

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', {key: 'mrbro-dev-theme-mode'}))
    })

    expect(result.current.activeThemeChoice).toEqual({type: 'preset', theme: preset})

    act(() => {
      localStorage.setItem('mrbro-dev-theme-mode', JSON.stringify('light'))
      localStorage.setItem('mrbro-dev-custom-theme', '')
      window.dispatchEvent(new StorageEvent('storage', {key: 'mrbro-dev-custom-theme'}))
    })

    expect(result.current.activeThemeChoice).toEqual({type: 'mode', mode: 'light'})
  })

  it('should ignore storage events for unrelated keys', () => {
    const {result} = renderHook(() => useTheme(), {wrapper})
    const initialMode = result.current.themeMode

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', {key: 'unrelated-key', newValue: 'value'}))
    })

    expect(result.current.themeMode).toBe(initialMode)
  })

  it('should ignore storage events with no key', () => {
    const {result} = renderHook(() => useTheme(), {wrapper})
    const initialMode = result.current.themeMode

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', {key: null}))
    })

    expect(result.current.themeMode).toBe(initialMode)
  })
})
