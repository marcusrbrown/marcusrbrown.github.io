/**
 * @vitest-environment happy-dom
 */

import {cleanup} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {
  announceToScreenReader,
  createThemeActionLabel,
  handleButtonKeyDown,
  handleEscapeKey,
  handleKeyboardShortcuts,
  handleTabNavigation,
} from '../../src/utils/accessibility'

describe('accessibility utilities', () => {
  beforeEach(() => {
    // Clear any existing elements
    document.body.innerHTML = ''
  })

  afterEach(() => {
    cleanup()
    // Clean up any added elements
    document.body.innerHTML = ''
  })

  describe('handleButtonKeyDown', () => {
    it('should trigger action on Enter key', () => {
      const mockAction = vi.fn()
      const mockPreventDefault = vi.fn()
      const mockEvent = {
        key: 'Enter',
        preventDefault: mockPreventDefault,
      } as unknown as React.KeyboardEvent

      handleButtonKeyDown(mockEvent, mockAction)

      expect(mockPreventDefault).toHaveBeenCalled()
      expect(mockAction).toHaveBeenCalled()
    })

    it('should trigger action on Space key', () => {
      const mockAction = vi.fn()
      const mockPreventDefault = vi.fn()
      const mockEvent = {
        key: ' ',
        preventDefault: mockPreventDefault,
      } as unknown as React.KeyboardEvent

      handleButtonKeyDown(mockEvent, mockAction)

      expect(mockPreventDefault).toHaveBeenCalled()
      expect(mockAction).toHaveBeenCalled()
    })

    it('should not trigger action on other keys', () => {
      const mockAction = vi.fn()
      const mockPreventDefault = vi.fn()
      const mockEvent = {
        key: 'Tab',
        preventDefault: mockPreventDefault,
      } as unknown as React.KeyboardEvent

      handleButtonKeyDown(mockEvent, mockAction)

      expect(mockPreventDefault).not.toHaveBeenCalled()
      expect(mockAction).not.toHaveBeenCalled()
    })
  })

  describe('handleTabNavigation', () => {
    it('should navigate to next tab on ArrowRight', () => {
      const mockOnTabChange = vi.fn()
      const tabs = ['tab1', 'tab2', 'tab3'] as const
      const mockPreventDefault = vi.fn()
      const mockEvent = {
        key: 'ArrowRight',
        preventDefault: mockPreventDefault,
      } as unknown as React.KeyboardEvent

      handleTabNavigation(mockEvent, 'tab1', tabs, mockOnTabChange)

      expect(mockPreventDefault).toHaveBeenCalled()
      expect(mockOnTabChange).toHaveBeenCalledWith('tab2')
    })

    it('should navigate to previous tab on ArrowLeft', () => {
      const mockOnTabChange = vi.fn()
      const tabs = ['tab1', 'tab2', 'tab3'] as const
      const mockPreventDefault = vi.fn()
      const mockEvent = {
        key: 'ArrowLeft',
        preventDefault: mockPreventDefault,
      } as unknown as React.KeyboardEvent

      handleTabNavigation(mockEvent, 'tab2', tabs, mockOnTabChange)

      expect(mockPreventDefault).toHaveBeenCalled()
      expect(mockOnTabChange).toHaveBeenCalledWith('tab1')
    })

    it('should wrap around from first to last tab on ArrowLeft', () => {
      const mockOnTabChange = vi.fn()
      const tabs = ['tab1', 'tab2', 'tab3'] as const
      const mockPreventDefault = vi.fn()
      const mockEvent = {
        key: 'ArrowLeft',
        preventDefault: mockPreventDefault,
      } as unknown as React.KeyboardEvent

      handleTabNavigation(mockEvent, 'tab1', tabs, mockOnTabChange)

      expect(mockPreventDefault).toHaveBeenCalled()
      expect(mockOnTabChange).toHaveBeenCalledWith('tab3')
    })

    it('should wrap around from last to first tab on ArrowRight', () => {
      const mockOnTabChange = vi.fn()
      const tabs = ['tab1', 'tab2', 'tab3'] as const
      const mockPreventDefault = vi.fn()
      const mockEvent = {
        key: 'ArrowRight',
        preventDefault: mockPreventDefault,
      } as unknown as React.KeyboardEvent

      handleTabNavigation(mockEvent, 'tab3', tabs, mockOnTabChange)

      expect(mockPreventDefault).toHaveBeenCalled()
      expect(mockOnTabChange).toHaveBeenCalledWith('tab1')
    })
  })

  describe('handleEscapeKey', () => {
    it('should call onClose when Escape is pressed', () => {
      const mockOnClose = vi.fn()
      const mockPreventDefault = vi.fn()
      const mockEvent = {
        key: 'Escape',
        preventDefault: mockPreventDefault,
      } as unknown as React.KeyboardEvent

      handleEscapeKey(mockEvent, mockOnClose)

      expect(mockPreventDefault).toHaveBeenCalled()
      expect(mockOnClose).toHaveBeenCalled()
    })

    it('should not call onClose when other keys are pressed', () => {
      const mockOnClose = vi.fn()
      const mockPreventDefault = vi.fn()
      const mockEvent = {
        key: 'Enter',
        preventDefault: mockPreventDefault,
      } as unknown as React.KeyboardEvent

      handleEscapeKey(mockEvent, mockOnClose)

      expect(mockPreventDefault).not.toHaveBeenCalled()
      expect(mockOnClose).not.toHaveBeenCalled()
    })

    it('should handle undefined onClose gracefully', () => {
      const mockPreventDefault = vi.fn()
      const mockEvent = {
        key: 'Escape',
        preventDefault: mockPreventDefault,
      } as unknown as React.KeyboardEvent

      expect(() => handleEscapeKey(mockEvent)).not.toThrow()
      expect(mockPreventDefault).not.toHaveBeenCalled()
    })
  })

  describe('createThemeActionLabel', () => {
    it('should create label with theme name', () => {
      const label = createThemeActionLabel('apply', 'Dark Mode')
      expect(label).toBe('apply Dark Mode theme')
    })

    it('should create label without theme name', () => {
      const label = createThemeActionLabel('save')
      expect(label).toBe('save theme')
    })

    it('should create label with additional info', () => {
      const label = createThemeActionLabel('export', 'Custom Theme', 'as JSON file')
      expect(label).toBe('export Custom Theme theme as JSON file')
    })
  })

  describe('handleKeyboardShortcuts', () => {
    it('should handle Ctrl+S shortcut', () => {
      const mockSave = vi.fn()
      const shortcuts = {s: mockSave}
      const mockPreventDefault = vi.fn()
      const mockEvent = {
        key: 's',
        ctrlKey: true,
        metaKey: false,
        preventDefault: mockPreventDefault,
      } as unknown as React.KeyboardEvent

      handleKeyboardShortcuts(mockEvent, shortcuts)

      expect(mockPreventDefault).toHaveBeenCalled()
      expect(mockSave).toHaveBeenCalled()
    })

    it('should handle Cmd+S shortcut on Mac', () => {
      const mockSave = vi.fn()
      const shortcuts = {s: mockSave}
      const mockPreventDefault = vi.fn()
      const mockEvent = {
        key: 's',
        ctrlKey: false,
        metaKey: true,
        preventDefault: mockPreventDefault,
      } as unknown as React.KeyboardEvent

      handleKeyboardShortcuts(mockEvent, shortcuts)

      expect(mockPreventDefault).toHaveBeenCalled()
      expect(mockSave).toHaveBeenCalled()
    })

    it('should not handle shortcuts without modifier keys', () => {
      const mockSave = vi.fn()
      const shortcuts = {s: mockSave}
      const mockPreventDefault = vi.fn()
      const mockEvent = {
        key: 's',
        ctrlKey: false,
        metaKey: false,
        preventDefault: mockPreventDefault,
      } as unknown as React.KeyboardEvent

      handleKeyboardShortcuts(mockEvent, shortcuts)

      expect(mockPreventDefault).not.toHaveBeenCalled()
      expect(mockSave).not.toHaveBeenCalled()
    })
  })

  describe('announceToScreenReader', () => {
    it('should create and append announcement element', () => {
      announceToScreenReader('Test message')

      const announcement = document.querySelector('[aria-live="polite"]')
      expect(announcement).toBeTruthy()
      expect(announcement?.textContent).toBe('Test message')
      expect(announcement?.getAttribute('aria-atomic')).toBe('true')
      expect(announcement).toHaveClass('sr-only')
    })

    it('should use assertive priority when specified', () => {
      announceToScreenReader('Urgent message', 'assertive')

      const announcement = document.querySelector('[aria-live="assertive"]')
      expect(announcement).toBeTruthy()
      expect(announcement?.textContent).toBe('Urgent message')
    })

    it('should remove announcement after timeout', async () => {
      announceToScreenReader('Temporary message')

      expect(document.querySelector('[aria-live="polite"]')).toBeTruthy()

      // Wait for cleanup timeout
      await new Promise(resolve => setTimeout(resolve, 1100))

      expect(document.querySelector('[aria-live="polite"]')).toBeFalsy()
    })
  })
})
