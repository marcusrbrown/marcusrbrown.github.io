import type {Theme} from '../../src/types'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {
  clearThemeStorage,
  getThemeStorageInfo,
  loadCustomTheme,
  loadThemeMode,
  removeCustomTheme,
  saveCustomTheme,
  saveThemeMode,
} from '../../src/utils/theme-storage'

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
    get length() {
      return Object.keys(store).length
    },
    key: vi.fn((index: number) => Object.keys(store)[index] || null),
  }
})()

// Mock console methods to test error handling
const consoleMock = {
  warn: vi.fn(),
  error: vi.fn(),
}

beforeEach(() => {
  // Reset localStorage mock
  localStorageMock.clear()
  vi.clearAllMocks()

  // Set up mocks
  Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
    writable: true,
  })

  Object.defineProperty(console, 'warn', {
    value: consoleMock.warn,
    writable: true,
  })

  Object.defineProperty(console, 'error', {
    value: consoleMock.error,
    writable: true,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('theme-storage', () => {
  describe('Theme Mode Storage', () => {
    describe('saveThemeMode', () => {
      it('should save valid theme mode to localStorage', () => {
        const result = saveThemeMode('dark')

        expect(result).toBe(true)
        expect(localStorageMock.setItem).toHaveBeenCalledWith('mrbro-dev-theme-mode', JSON.stringify('dark'))
      })

      it('should handle all valid theme modes', () => {
        expect(saveThemeMode('light')).toBe(true)
        expect(saveThemeMode('dark')).toBe(true)
        expect(saveThemeMode('system')).toBe(true)
      })

      it('should reject invalid theme mode', () => {
        const result = saveThemeMode('invalid' as any)

        expect(result).toBe(false)
        expect(consoleMock.warn).toHaveBeenCalledWith('Invalid theme mode provided:', 'invalid')
        expect(localStorageMock.setItem).not.toHaveBeenCalled()
      })

      it('should handle localStorage quota exceeded error', () => {
        localStorageMock.setItem.mockImplementationOnce(() => {
          throw new DOMException('QuotaExceededError')
        })
        localStorageMock.setItem.mockImplementationOnce(() => {
          throw new DOMException('QuotaExceededError')
        })
        localStorageMock.setItem.mockImplementationOnce(() => {
          throw new DOMException('QuotaExceededError')
        })

        const result = saveThemeMode('dark')

        expect(result).toBe(false)
        expect(consoleMock.warn).toHaveBeenCalled()
        expect(consoleMock.error).toHaveBeenCalledWith('Failed to save theme data even after clearing storage')
      })

      it('should attempt cleanup and retry on storage error', () => {
        localStorageMock.setItem
          .mockImplementationOnce(() => {
            throw new DOMException('QuotaExceededError')
          })
          .mockImplementationOnce(() => {
            // Second call should succeed after cleanup
          })

        const result = saveThemeMode('dark')

        expect(result).toBe(true)
        expect(localStorageMock.removeItem).toHaveBeenCalledWith('mrbro-dev-custom-theme')
      })
    })

    describe('loadThemeMode', () => {
      it('should load valid theme mode from localStorage', () => {
        localStorageMock.setItem('mrbro-dev-theme-mode', JSON.stringify('dark'))

        const result = loadThemeMode()

        expect(result).toBe('dark')
      })

      it('should return fallback for non-existent data', () => {
        const result = loadThemeMode()

        expect(result).toBe('system')
      })

      it('should return fallback for invalid JSON', () => {
        localStorageMock.setItem('mrbro-dev-theme-mode', 'invalid-json')

        const result = loadThemeMode()

        expect(result).toBe('system')
      })

      it('should return fallback for invalid theme mode', () => {
        localStorageMock.setItem('mrbro-dev-theme-mode', JSON.stringify('invalid'))

        const result = loadThemeMode()

        expect(result).toBe('system')
      })

      it('should handle localStorage read error', () => {
        localStorageMock.getItem.mockImplementationOnce(() => {
          throw new Error('Storage error')
        })

        const result = loadThemeMode()

        expect(result).toBe('system')
        expect(consoleMock.warn).toHaveBeenCalled()
      })
    })
  })

  describe('Custom Theme Storage', () => {
    const validTheme: Theme = {
      id: 'test-theme',
      name: 'Test Theme',
      mode: 'dark',
      colors: {
        primary: '#3b82f6',
        secondary: '#94a3b8',
        accent: '#0ea5e9',
        background: '#0f172a',
        surface: '#1e293b',
        text: '#f1f5f9',
        textSecondary: '#94a3b8',
        border: '#334155',
        error: '#ef4444',
        warning: '#f59e0b',
        success: '#22c55e',
      },
    }

    describe('saveCustomTheme', () => {
      it('should save valid custom theme', () => {
        const result = saveCustomTheme(validTheme)

        expect(result).toBe(true)
        expect(localStorageMock.setItem).toHaveBeenCalledWith('mrbro-dev-custom-theme', JSON.stringify(validTheme))
      })

      it('should reject theme with missing id', () => {
        const invalidTheme = {...validTheme, id: undefined} as any

        const result = saveCustomTheme(invalidTheme)

        expect(result).toBe(false)
        expect(consoleMock.warn).toHaveBeenCalledWith('Invalid theme provided for storage:', invalidTheme)
      })

      it('should reject theme with invalid mode', () => {
        const invalidTheme = {...validTheme, mode: 'system'} as any

        const result = saveCustomTheme(invalidTheme)

        expect(result).toBe(false)
      })

      it('should reject theme with missing color properties', () => {
        const invalidTheme = {
          ...validTheme,
          colors: {...validTheme.colors, primary: undefined},
        } as any

        const result = saveCustomTheme(invalidTheme)

        expect(result).toBe(false)
      })

      it('should reject non-object input', () => {
        const result = saveCustomTheme('not-a-theme' as any)

        expect(result).toBe(false)
      })
    })

    describe('loadCustomTheme', () => {
      it('should load valid custom theme', () => {
        localStorageMock.setItem('mrbro-dev-custom-theme', JSON.stringify(validTheme))

        const result = loadCustomTheme()

        expect(result).toEqual(validTheme)
      })

      it('should return null for non-existent data', () => {
        const result = loadCustomTheme()

        expect(result).toBeNull()
      })

      it('should return null for invalid JSON', () => {
        localStorageMock.setItem('mrbro-dev-custom-theme', 'invalid-json')

        const result = loadCustomTheme()

        expect(result).toBeNull()
      })

      it('should return null for invalid theme data', () => {
        localStorageMock.setItem('mrbro-dev-custom-theme', JSON.stringify({invalid: 'theme'}))

        const result = loadCustomTheme()

        expect(result).toBeNull()
      })

      it('should handle localStorage read error', () => {
        localStorageMock.getItem.mockImplementationOnce(() => {
          throw new Error('Storage error')
        })

        const result = loadCustomTheme()

        expect(result).toBeNull()
        expect(consoleMock.warn).toHaveBeenCalled()
      })
    })

    describe('removeCustomTheme', () => {
      it('should remove custom theme from localStorage', () => {
        const result = removeCustomTheme()

        expect(result).toBe(true)
        expect(localStorageMock.removeItem).toHaveBeenCalledWith('mrbro-dev-custom-theme')
      })

      it('should handle localStorage remove error', () => {
        localStorageMock.removeItem.mockImplementationOnce(() => {
          throw new Error('Remove error')
        })

        const result = removeCustomTheme()

        expect(result).toBe(false)
        expect(consoleMock.warn).toHaveBeenCalled()
      })
    })
  })

  describe('Storage Management', () => {
    describe('clearThemeStorage', () => {
      it('should clear all theme storage', () => {
        const result = clearThemeStorage()

        expect(result).toBe(true)
        expect(localStorageMock.removeItem).toHaveBeenCalledWith('mrbro-dev-theme-mode')
        expect(localStorageMock.removeItem).toHaveBeenCalledWith('mrbro-dev-custom-theme')
      })

      it('should handle localStorage clear error', () => {
        localStorageMock.removeItem.mockImplementationOnce(() => {
          throw new Error('Clear error')
        })

        const result = clearThemeStorage()

        expect(result).toBe(false)
        expect(consoleMock.warn).toHaveBeenCalled()
      })
    })

    describe('getThemeStorageInfo', () => {
      it('should return storage info when data exists', () => {
        localStorageMock.setItem('mrbro-dev-theme-mode', JSON.stringify('dark'))
        localStorageMock.setItem('mrbro-dev-custom-theme', JSON.stringify({test: 'data'}))

        const info = getThemeStorageInfo()

        expect(info.hasThemeMode).toBe(true)
        expect(info.hasCustomTheme).toBe(true)
        expect(info.themeModeSize).toBeGreaterThan(0)
        expect(info.customThemeSize).toBeGreaterThan(0)
        expect(info.totalSize).toBe(info.themeModeSize + info.customThemeSize)
      })

      it('should return zero sizes when no data exists', () => {
        const info = getThemeStorageInfo()

        expect(info.hasThemeMode).toBe(false)
        expect(info.hasCustomTheme).toBe(false)
        expect(info.themeModeSize).toBe(0)
        expect(info.customThemeSize).toBe(0)
        expect(info.totalSize).toBe(0)
      })

      it('should handle localStorage read errors gracefully', () => {
        localStorageMock.getItem.mockImplementation(() => {
          throw new Error('Storage error')
        })

        const info = getThemeStorageInfo()

        expect(info.hasThemeMode).toBe(false)
        expect(info.hasCustomTheme).toBe(false)
        expect(info.totalSize).toBe(0)
      })
    })
  })
})
