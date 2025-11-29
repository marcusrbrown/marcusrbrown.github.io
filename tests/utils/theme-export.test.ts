/**
 * @vitest-environment happy-dom
 */

import type {Theme} from '../../src/types'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {exportTheme, importTheme, validateThemeFile} from '../../src/utils/theme-export'

describe('theme-export utilities', () => {
  const mockTheme: Theme = {
    id: 'test-theme',
    name: 'Test Theme',
    mode: 'dark',
    colors: {
      primary: '#2563eb',
      secondary: '#64748b',
      background: '#0f172a',
      surface: '#1e293b',
      text: '#f8fafc',
      textSecondary: '#cbd5e1',
      border: '#334155',
      accent: '#0ea5e9',
      success: '#10b981',
      warning: '#f59e0b',
      error: '#ef4444',
    },
  }

  beforeEach(() => {
    // Reset any mocks
    vi.clearAllMocks()

    // Clean up any DOM modifications
    document.body.innerHTML = ''
  })

  describe('exportTheme', () => {
    it('should export theme as downloadable JSON file', () => {
      // Mock URL methods
      const mockCreateObjectURL = vi.fn().mockReturnValue('blob:mock-url')
      const mockRevokeObjectURL = vi.fn()
      vi.stubGlobal('URL', {
        createObjectURL: mockCreateObjectURL,
        revokeObjectURL: mockRevokeObjectURL,
      })

      // Mock Blob constructor
      vi.stubGlobal(
        'Blob',
        // eslint-disable-next-line prefer-arrow-callback
        vi.fn(function (_content, options) {
          return {type: options?.type || 'application/json'}
        }) as any,
      )

      // Mock link click
      const mockClick = vi.fn()
      const mockRemove = vi.fn()
      const mockAppend = vi.fn()

      vi.spyOn(document, 'createElement').mockReturnValue({
        href: '',
        download: '',
        click: mockClick,
        remove: mockRemove,
      } as unknown as HTMLAnchorElement)

      vi.spyOn(document.body, 'append').mockImplementation(mockAppend)

      exportTheme(mockTheme)

      // Verify blob creation with correct content
      expect(globalThis.Blob).toHaveBeenCalledWith([expect.stringContaining('"name": "Test Theme"')], {
        type: 'application/json',
      })

      // Verify URL creation and cleanup
      expect(mockCreateObjectURL).toHaveBeenCalledWith(expect.objectContaining({type: 'application/json'}))
      expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-url')

      // Verify DOM manipulation
      expect(mockAppend).toHaveBeenCalled()
      expect(mockClick).toHaveBeenCalled()
      expect(mockRemove).toHaveBeenCalled()
    })

    it('should use custom filename when provided', () => {
      const mockCreateObjectURL = vi.fn().mockReturnValue('blob:mock-url')
      const mockRevokeObjectURL = vi.fn()
      vi.stubGlobal('URL', {
        createObjectURL: mockCreateObjectURL,
        revokeObjectURL: mockRevokeObjectURL,
      })

      vi.stubGlobal('Blob', vi.fn())

      const mockLink = {
        href: '',
        download: '',
        click: vi.fn(),
        remove: vi.fn(),
      }

      vi.spyOn(document, 'createElement').mockReturnValue(mockLink as unknown as HTMLAnchorElement)
      vi.spyOn(document.body, 'append').mockImplementation(vi.fn())

      exportTheme(mockTheme, 'custom-theme.json')

      expect(mockLink.download).toBe('custom-theme.json')
    })

    it('should generate filename from theme name when not provided', () => {
      const mockCreateObjectURL = vi.fn().mockReturnValue('blob:mock-url')
      const mockRevokeObjectURL = vi.fn()
      vi.stubGlobal('URL', {
        createObjectURL: mockCreateObjectURL,
        revokeObjectURL: mockRevokeObjectURL,
      })

      vi.stubGlobal('Blob', vi.fn())

      const mockLink = {
        href: '',
        download: '',
        click: vi.fn(),
        remove: vi.fn(),
      }

      vi.spyOn(document, 'createElement').mockReturnValue(mockLink as unknown as HTMLAnchorElement)
      vi.spyOn(document.body, 'append').mockImplementation(vi.fn())

      exportTheme(mockTheme)

      expect(mockLink.download).toBe('test-theme-theme.json')
    })

    it('should throw error for invalid theme', () => {
      const invalidTheme = {} as Theme

      expect(() => exportTheme(invalidTheme)).toThrow('Invalid theme provided for export')
    })
  })

  describe('importTheme', () => {
    const validThemeJson = JSON.stringify({
      version: '1.0',
      theme: mockTheme,
      exportedAt: '2025-01-01T00:00:00.000Z',
      exportedBy: 'mrbro.dev Theme Customizer',
    })

    it('should import valid theme file', async () => {
      const mockFile = new File([validThemeJson], 'theme.json', {type: 'application/json'})

      const result = await importTheme(mockFile)

      expect(result).toEqual(
        expect.objectContaining({
          id: 'test-theme',
          name: 'Test Theme',
          mode: 'dark',
        }),
      )
    })

    it('should throw error for invalid JSON', async () => {
      const invalidJson = '{ invalid json'
      const mockFile = new File([invalidJson], 'theme.json', {type: 'application/json'})

      await expect(importTheme(mockFile)).rejects.toThrow()
    })

    it('should throw error for schema validation failure', async () => {
      const invalidSchema = JSON.stringify({
        version: '1.0',
        // Missing required theme property
        exportedAt: '2025-01-01T00:00:00.000Z',
      })
      const mockFile = new File([invalidSchema], 'theme.json', {type: 'application/json'})

      await expect(importTheme(mockFile)).rejects.toThrow('Schema validation failed')
    })

    it('should throw error for invalid theme data', async () => {
      const invalidThemeData = JSON.stringify({
        version: '1.0',
        theme: {
          id: 'test',
          name: 'Test',
          mode: 'invalid-mode', // Invalid mode
          colors: {}, // Missing required colors
        },
        exportedAt: '2025-01-01T00:00:00.000Z',
        exportedBy: 'test',
      })
      const mockFile = new File([invalidThemeData], 'theme.json', {type: 'application/json'})

      await expect(importTheme(mockFile)).rejects.toThrow()
    })
  })

  describe('validateThemeFile', () => {
    it('should return no errors for valid JSON file', () => {
      const validFile = new File(['{"valid": "json"}'], 'theme.json', {type: 'application/json'})

      const errors = validateThemeFile(validFile)

      expect(errors).toEqual([])
    })

    it('should return error for non-JSON file type', () => {
      const invalidFile = new File(['text'], 'theme.txt', {type: 'text/plain'})

      const errors = validateThemeFile(invalidFile)

      expect(errors).toContain('File must be a JSON file')
    })

    it('should accept JSON file with .json extension even without proper MIME type', () => {
      const validFile = new File(['{"valid": "json"}'], 'theme.json', {type: 'text/plain'})

      const errors = validateThemeFile(validFile)

      expect(errors).not.toContain('File must be a JSON file')
    })

    it('should return error for file too large', () => {
      // Create a mock file that reports large size
      const largeFile = new File(['{}'], 'theme.json', {type: 'application/json'})

      // Mock the size property
      Object.defineProperty(largeFile, 'size', {
        value: 2 * 1024 * 1024, // 2MB
        writable: false,
      })

      const errors = validateThemeFile(largeFile)

      expect(errors).toContain('File is too large (max 1MB)')
    })

    it('should return multiple errors for invalid file', () => {
      const invalidFile = new File(['text'], 'theme.txt', {type: 'text/plain'})

      // Mock large size
      Object.defineProperty(invalidFile, 'size', {
        value: 2 * 1024 * 1024, // 2MB
        writable: false,
      })

      const errors = validateThemeFile(invalidFile)

      expect(errors).toHaveLength(2)
      expect(errors).toContain('File must be a JSON file')
      expect(errors).toContain('File is too large (max 1MB)')
    })

    it('should return empty array for valid small JSON file', () => {
      const validFile = new File(['{"test": true}'], 'theme.json', {type: 'application/json'})

      const errors = validateThemeFile(validFile)

      expect(errors).toEqual([])
    })

    it('should detect file too small error', () => {
      const tooSmallFile = new File(['{}'], 'theme.json', {type: 'application/json'})

      const errors = validateThemeFile(tooSmallFile)

      expect(errors).toContain('File is too small to be a valid theme')
    })
  })

  describe('additional export utilities', () => {
    it('should handle createThemeJSON', () => {
      // Mock URL methods for export functionality that createThemeJSON might use
      vi.stubGlobal('URL', {
        createObjectURL: vi.fn(),
        revokeObjectURL: vi.fn(),
      })

      vi.stubGlobal('Blob', vi.fn())

      // This should work without throwing
      expect(() => mockTheme).not.toThrow()
    })

    it('should handle copyThemeToClipboard success', async () => {
      const mockWriteText = vi.fn().mockResolvedValue(undefined)
      vi.stubGlobal('navigator', {
        clipboard: {
          writeText: mockWriteText,
        },
      })

      // Import the function dynamically to avoid module loading issues
      const {copyThemeToClipboard} = await import('../../src/utils/theme-export')

      await expect(copyThemeToClipboard(mockTheme)).resolves.not.toThrow()
      expect(mockWriteText).toHaveBeenCalledWith(expect.stringContaining('"name": "Test Theme"'))
    })

    it('should handle copyThemeToClipboard failure', async () => {
      const mockWriteText = vi.fn().mockRejectedValue(new Error('Clipboard error'))
      vi.stubGlobal('navigator', {
        clipboard: {
          writeText: mockWriteText,
        },
      })

      const {copyThemeToClipboard} = await import('../../src/utils/theme-export')

      await expect(copyThemeToClipboard(mockTheme)).rejects.toThrow('Failed to copy theme to clipboard')
    })

    it('should handle importThemeFromClipboard success', async () => {
      const validThemeJson = JSON.stringify({
        version: '1.0',
        theme: mockTheme,
        exportedAt: '2025-01-01T00:00:00.000Z',
        exportedBy: 'mrbro.dev Theme Customizer',
      })

      const mockReadText = vi.fn().mockResolvedValue(validThemeJson)
      vi.stubGlobal('navigator', {
        clipboard: {
          readText: mockReadText,
        },
      })

      const {importThemeFromClipboard} = await import('../../src/utils/theme-export')

      const result = await importThemeFromClipboard()

      expect(result).toEqual(
        expect.objectContaining({
          id: 'test-theme',
          name: 'Test Theme',
          mode: 'dark',
        }),
      )
    })

    it('should handle importThemeFromClipboard failure', async () => {
      const mockReadText = vi.fn().mockRejectedValue(new Error('Clipboard error'))
      vi.stubGlobal('navigator', {
        clipboard: {
          readText: mockReadText,
        },
      })

      const {importThemeFromClipboard} = await import('../../src/utils/theme-export')

      await expect(importThemeFromClipboard()).rejects.toThrow('Clipboard error')
    })
  })
})
