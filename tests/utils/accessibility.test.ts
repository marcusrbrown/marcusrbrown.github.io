/**
 * @vitest-environment happy-dom
 */

import {cleanup} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {
  announceToScreenReader,
  applyReducedMotion,
  createAccessibleTransition,
  createThemeActionLabel,
  getSafeAnimationDuration,
  handleButtonKeyDown,
  handleEscapeKey,
  handleKeyboardShortcuts,
  handleTabNavigation,
  onReducedMotionChange,
  prefersReducedMotion,
} from '../../src/utils/accessibility'

// Mock matchMedia for reduced motion tests
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn((query: string) => ({
    matches: query.includes('prefers-reduced-motion: reduce'),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

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

  describe('prefersReducedMotion', () => {
    it('should return true when reduced motion is preferred', () => {
      vi.mocked(window.matchMedia).mockReturnValue({
        matches: true,
        media: '(prefers-reduced-motion: reduce)',
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })

      expect(prefersReducedMotion()).toBe(true)
    })

    it('should return false when reduced motion is not preferred', () => {
      vi.mocked(window.matchMedia).mockReturnValue({
        matches: false,
        media: '(prefers-reduced-motion: reduce)',
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })

      expect(prefersReducedMotion()).toBe(false)
    })

    it('should return false when matchMedia is not available', () => {
      const originalMatchMedia = window.matchMedia
      ;(window as any).matchMedia = undefined

      expect(prefersReducedMotion()).toBe(false)

      window.matchMedia = originalMatchMedia
    })
  })

  describe('onReducedMotionChange', () => {
    it('should set up media query listener', () => {
      const mockCallback = vi.fn()
      const mockAddEventListener = vi.fn()
      const mockRemoveEventListener = vi.fn()

      vi.mocked(window.matchMedia).mockReturnValue({
        matches: false,
        media: '(prefers-reduced-motion: reduce)',
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: mockAddEventListener,
        removeEventListener: mockRemoveEventListener,
        dispatchEvent: vi.fn(),
      })

      const cleanup = onReducedMotionChange(mockCallback)

      expect(mockAddEventListener).toHaveBeenCalledWith('change', expect.any(Function))

      cleanup()
      expect(mockRemoveEventListener).toHaveBeenCalledWith('change', expect.any(Function))
    })

    it('should return no-op cleanup when matchMedia not available', () => {
      const originalMatchMedia = window.matchMedia
      ;(window as any).matchMedia = undefined

      const cleanup = onReducedMotionChange(vi.fn())
      expect(typeof cleanup).toBe('function')
      expect(() => cleanup()).not.toThrow()

      window.matchMedia = originalMatchMedia
    })
  })

  describe('applyReducedMotion', () => {
    it('should apply reduced motion styles when reduce is true', () => {
      const element = document.createElement('div')
      document.body.append(element)

      applyReducedMotion(element, true)

      expect(element.style.animationDuration).toBe('0.01ms')
      expect(element.style.animationIterationCount).toBe('1')
      expect(element.style.transitionDuration).toBe('0.01ms')
      expect(element.style.transitionDelay).toBe('0ms')
      expect(element.classList.contains('reduce-motion')).toBe(true)
    })

    it('should remove reduced motion styles when reduce is false', () => {
      const element = document.createElement('div')
      element.style.animationDuration = '0.01ms'
      element.classList.add('reduce-motion')
      document.body.append(element)

      applyReducedMotion(element, false)

      expect(element.style.animationDuration).toBe('')
      expect(element.classList.contains('reduce-motion')).toBe(false)
    })

    it('should use user preference when reduce parameter not provided', () => {
      const element = document.createElement('div')
      document.body.append(element)

      vi.mocked(window.matchMedia).mockReturnValue({
        matches: true,
        media: '(prefers-reduced-motion: reduce)',
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })

      applyReducedMotion(element)

      expect(element.classList.contains('reduce-motion')).toBe(true)
    })
  })

  describe('getSafeAnimationDuration', () => {
    it('should return reduced duration when reduced motion is preferred', () => {
      vi.mocked(window.matchMedia).mockReturnValue({
        matches: true,
        media: '(prefers-reduced-motion: reduce)',
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })

      expect(getSafeAnimationDuration(300)).toBe(0.01)
      expect(getSafeAnimationDuration(500, 1)).toBe(1)
    })

    it('should return normal duration when reduced motion is not preferred', () => {
      vi.mocked(window.matchMedia).mockReturnValue({
        matches: false,
        media: '(prefers-reduced-motion: reduce)',
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })

      expect(getSafeAnimationDuration(300)).toBe(300)
    })
  })

  describe('createAccessibleTransition', () => {
    it('should return minimal transitions for reduced motion', () => {
      vi.mocked(window.matchMedia).mockReturnValue({
        matches: true,
        media: '(prefers-reduced-motion: reduce)',
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })

      const transitions = [
        {property: 'color', duration: 300, timingFunction: 'ease-in-out'},
        {property: 'background-color', duration: 250},
      ]

      const result = createAccessibleTransition(transitions)
      expect(result).toBe('color 0.01ms linear 0ms, background-color 0.01ms linear 0ms')
    })

    it('should return normal transitions when reduced motion is not preferred', () => {
      vi.mocked(window.matchMedia).mockReturnValue({
        matches: false,
        media: '(prefers-reduced-motion: reduce)',
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })

      const transitions = [
        {property: 'color', duration: 300, timingFunction: 'ease-in-out', delay: 100},
        {property: 'background-color', duration: 250},
      ]

      const result = createAccessibleTransition(transitions)
      expect(result).toBe('color 300ms ease-in-out 100ms, background-color 250ms ease 0ms')
    })
  })
})
