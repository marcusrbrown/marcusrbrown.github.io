/**
 * Accessibility utility functions for keyboard navigation and ARIA support
 *
 * This module provides reusable utilities to enhance keyboard accessibility
 * across theme-related components, following WCAG 2.1 AA guidelines.
 */

/**
 * Standard keyboard event handler for buttons and interactive elements
 * Triggers the provided action on Enter or Space key press
 *
 * @param event - Keyboard event from React
 * @param action - Function to execute when Enter or Space is pressed
 */
export const handleButtonKeyDown = (event: React.KeyboardEvent, action: () => void): void => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    action()
  }
}

/**
 * Keyboard navigation handler for tab interfaces
 * Supports arrow key navigation between tabs
 *
 * @param event - Keyboard event from React
 * @param currentTab - Currently active tab
 * @param tabs - Array of available tab identifiers
 * @param onTabChange - Callback function to handle tab changes
 * @param tabContainerRef - Ref to the tab container for focus management
 */
export const handleTabNavigation = <T extends string>(
  event: React.KeyboardEvent,
  currentTab: T,
  tabs: readonly T[],
  onTabChange: (tab: T) => void,
  tabContainerRef?: React.RefObject<HTMLElement>,
): void => {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault()
    const currentIndex = tabs.indexOf(currentTab)
    let newIndex: number

    if (event.key === 'ArrowLeft') {
      newIndex = currentIndex === 0 ? tabs.length - 1 : currentIndex - 1
    } else {
      newIndex = currentIndex === tabs.length - 1 ? 0 : currentIndex + 1
    }

    const newTab = tabs[newIndex]
    if (newTab) {
      onTabChange(newTab)

      // Focus the new tab button
      if (tabContainerRef?.current) {
        const tabButtons = tabContainerRef.current.querySelectorAll('[role="tab"]')
        if (tabButtons?.[newIndex]) {
          ;(tabButtons[newIndex] as HTMLElement).focus()
        }
      }
    }
  }
}

/**
 * Escape key handler for modal dialogs and overlay components
 * Closes the component when Escape is pressed
 *
 * @param event - Keyboard event from React
 * @param onClose - Function to call when escape is pressed
 */
export const handleEscapeKey = (event: React.KeyboardEvent, onClose?: () => void): void => {
  if (event.key === 'Escape' && onClose) {
    event.preventDefault()
    onClose()
  }
}

/**
 * Focus management utility for modal dialogs
 * Sets focus to the modal container when opened
 *
 * @param modalRef - Ref to the modal container element
 */
export const focusModal = (modalRef: React.RefObject<HTMLElement>): void => {
  if (modalRef.current) {
    modalRef.current.focus()
  }
}

/**
 * Creates ARIA label for theme-related actions
 * Generates consistent, descriptive labels for screen readers
 *
 * @param action - The action being performed (e.g., 'apply', 'save', 'export')
 * @param themeName - Name of the theme being acted upon
 * @param additionalInfo - Optional additional context
 */
export const createThemeActionLabel = (action: string, themeName?: string, additionalInfo?: string): string => {
  const baseLabel = themeName ? `${action} ${themeName} theme` : `${action} theme`
  return additionalInfo ? `${baseLabel} ${additionalInfo}` : baseLabel
}

/**
 * Keyboard shortcut handler for theme customizer actions
 * Handles common keyboard shortcuts (Ctrl+S, Ctrl+E, etc.)
 *
 * @param event - Keyboard event from React
 * @param shortcuts - Map of key combinations to handler functions
 */
export const handleKeyboardShortcuts = (event: React.KeyboardEvent, shortcuts: Record<string, () => void>): void => {
  if (event.ctrlKey || event.metaKey) {
    const handler = shortcuts[event.key]
    if (handler) {
      event.preventDefault()
      handler()
    }
  }
}

/**
 * ARIA live region announcement utility
 * Announces status messages to screen readers
 *
 * @param message - Message to announce
 * @param priority - Priority level ('polite' or 'assertive')
 */
export const announceToScreenReader = (message: string, priority: 'polite' | 'assertive' = 'polite'): void => {
  const announcement = document.createElement('div')
  announcement.setAttribute('aria-live', priority)
  announcement.setAttribute('aria-atomic', 'true')
  announcement.className = 'sr-only'
  announcement.textContent = message

  document.body.append(announcement)

  // Remove after announcement
  setTimeout(() => {
    announcement.remove()
  }, 1000)
}

/**
 * Focus trap utility for modal dialogs
 * Keeps focus within the modal container
 *
 * @param event - Keyboard event from React
 * @param containerRef - Ref to the container element
 */
export const trapFocus = (event: React.KeyboardEvent, containerRef: React.RefObject<HTMLElement>): void => {
  if (event.key === 'Tab' && containerRef.current) {
    const focusableElements = Array.from(
      containerRef.current.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
    )

    const firstElement = focusableElements[0]
    const lastElement = focusableElements.at(-1)

    if (!firstElement || !lastElement) return

    if (event.shiftKey) {
      // Shift + Tab - going backwards
      if (document.activeElement === firstElement) {
        event.preventDefault()
        ;(lastElement as HTMLElement).focus()
      }
    } else if (document.activeElement === lastElement) {
      // Tab - going forwards
      event.preventDefault()
      ;(firstElement as HTMLElement).focus()
    }
  }
}

/**
 * Detects if the user prefers reduced motion
 * Checks the prefers-reduced-motion media query
 *
 * @returns true if user prefers reduced motion, false otherwise
 */
export const prefersReducedMotion = (): boolean => {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return false
  }

  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/**
 * Creates a listener for reduced motion preference changes
 * Useful for responding to system settings changes
 *
 * @param callback - Function to call when preference changes
 * @returns Cleanup function to remove the listener
 */
export const onReducedMotionChange = (callback: (prefersReduced: boolean) => void): (() => void) => {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return () => {} // No-op cleanup for SSR
  }

  try {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')

    const handleChange = (event: MediaQueryListEvent) => {
      callback(event.matches)
    }

    mediaQuery.addEventListener('change', handleChange)

    return () => {
      mediaQuery.removeEventListener('change', handleChange)
    }
  } catch {
    return () => {} // No-op cleanup if matchMedia fails
  }
}

/**
 * Applies or removes reduced motion styles to an element
 * Useful for dynamically controlling animations based on user preference
 *
 * @param element - DOM element to modify
 * @param reduce - Whether to reduce motion (defaults to user preference)
 */
export const applyReducedMotion = (element: HTMLElement, reduce?: boolean): void => {
  const shouldReduce = reduce ?? prefersReducedMotion()

  if (shouldReduce) {
    element.style.animationDuration = '0.01ms'
    element.style.animationIterationCount = '1'
    element.style.transitionDuration = '0.01ms'
    element.style.transitionDelay = '0ms'
    element.classList.add('reduce-motion')
  } else {
    element.style.removeProperty('animation-duration')
    element.style.removeProperty('animation-iteration-count')
    element.style.removeProperty('transition-duration')
    element.style.removeProperty('transition-delay')
    element.classList.remove('reduce-motion')
  }
}

/**
 * Gets safe animation duration based on reduced motion preference
 * Returns minimal duration for reduced motion, normal duration otherwise
 *
 * @param normalDuration - Normal animation duration in milliseconds
 * @param reducedDuration - Reduced animation duration in milliseconds (defaults to 0.01ms)
 * @returns Safe duration to use for animations
 */
export const getSafeAnimationDuration = (normalDuration: number, reducedDuration = 0.01): number => {
  return prefersReducedMotion() ? reducedDuration : normalDuration
}

/**
 * Creates CSS transition property string that respects reduced motion
 * Automatically adjusts transitions based on user preference
 *
 * @param transitions - Array of transition definitions
 * @returns CSS transition string that respects reduced motion preference
 */
export const createAccessibleTransition = (
  transitions: {
    property: string
    duration: number
    timingFunction?: string
    delay?: number
  }[],
): string => {
  if (prefersReducedMotion()) {
    // Return minimal transitions for reduced motion
    return transitions.map(t => `${t.property} 0.01ms linear 0ms`).join(', ')
  }

  // Return normal transitions
  return transitions
    .map(t => `${t.property} ${t.duration}ms ${t.timingFunction || 'ease'} ${t.delay || 0}ms`)
    .join(', ')
}
