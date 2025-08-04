import {expect, test} from '@playwright/test'

/**
 * Keyboard navigation accessibility tests
 * Tests keyboard accessibility for interactive elements and focus management
 */

test.describe('Keyboard Navigation Tests', () => {
  test.describe('Basic Keyboard Navigation', () => {
    test('should allow tab navigation through header elements', async ({page}) => {
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      // Start from the top of the page
      await page.keyboard.press('Tab')

      // First focusable element should be in the header
      const focusedElement = page.locator(':focus')
      await expect(focusedElement).toBeVisible()

      // Tab through navigation links
      const navLinks = page.locator('header nav a')
      const navLinkCount = await navLinks.count()

      for (let i = 0; i < navLinkCount; i++) {
        const currentFocus = page.locator(':focus')
        await expect(currentFocus).toBeVisible()
        await page.keyboard.press('Tab')
      }
    })

    test('should focus theme toggle button and activate with keyboard', async ({page}) => {
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      // Find and focus the theme toggle
      const themeToggle = page.locator('.theme-toggle')
      await themeToggle.focus()

      // Verify it's focused
      await expect(themeToggle).toBeFocused()

      // Get initial theme
      const initialTheme = await page.locator('html').getAttribute('data-theme')

      // Activate with Enter key
      await page.keyboard.press('Enter')
      await page.waitForTimeout(400) // Wait for theme transition

      // Verify theme changed
      const newTheme = await page.locator('html').getAttribute('data-theme')
      expect(newTheme).not.toBe(initialTheme)

      // Test with Space key as well
      await themeToggle.focus()
      await page.keyboard.press('Space')
      await page.waitForTimeout(400)

      const finalTheme = await page.locator('html').getAttribute('data-theme')
      expect(finalTheme).not.toBe(newTheme)
    })

    test('should provide logical tab order across all pages', async ({page}) => {
      const pages = ['/', '/about', '/projects', '/blog']

      for (const pagePath of pages) {
        await page.goto(pagePath)
        await page.waitForLoadState('networkidle')

        // Start tabbing from the beginning
        await page.keyboard.press('Tab')

        const focusableElements = []
        let attempts = 0
        const maxAttempts = 20 // Prevent infinite loops

        while (attempts < maxAttempts) {
          const focusedElement = page.locator(':focus')
          const tagName = await focusedElement.evaluate(el => el?.tagName?.toLowerCase())

          if (tagName) {
            focusableElements.push(tagName)
          }

          await page.keyboard.press('Tab')
          attempts++

          // Break if we've cycled back to the beginning or no more focusable elements
          if (focusableElements.length > 1 && tagName === focusableElements[0]) {
            break
          }
        }

        // Ensure we found focusable elements
        expect(focusableElements.length).toBeGreaterThan(0)
      }
    })
  })

  test.describe('Navigation Link Keyboard Accessibility', () => {
    test('should navigate to pages using Enter key on navigation links', async ({page}) => {
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      // Find About link and navigate with keyboard
      const aboutLink = page.locator('header nav').getByRole('link', {name: /about/i})
      await aboutLink.focus()
      await expect(aboutLink).toBeFocused()

      await page.keyboard.press('Enter')
      await page.waitForLoadState('networkidle')

      // Verify we're on the About page
      await expect(page).toHaveURL(/.*\/about.*/)
    })

    test('should skip to main content with skip link', async ({page}) => {
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      // Press Tab to potentially reveal skip link
      await page.keyboard.press('Tab')

      // Look for skip link (might be visually hidden but accessible)
      const skipLink = page.locator('a[href="#main"], a[href="#main-content"], .skip-link')
      if ((await skipLink.count()) > 0) {
        await skipLink.focus()
        await expect(skipLink).toBeFocused()

        await page.keyboard.press('Enter')

        // Main content should be focused
        const mainContent = page.locator('main, #main, #main-content')
        await expect(mainContent).toBeFocused()
      }
    })
  })

  test.describe('Interactive Component Keyboard Tests', () => {
    test('should handle keyboard interaction with project cards', async ({page}) => {
      await page.goto('/projects')
      await page.waitForLoadState('networkidle')

      // Find project cards
      const projectCards = page.locator('.project-card, [data-testid="project-card"]')
      const cardCount = await projectCards.count()

      if (cardCount > 0) {
        // Focus first project card
        const firstCard = projectCards.first()
        await firstCard.focus()
        await expect(firstCard).toBeFocused()

        // If cards are clickable, test Enter key
        const isClickable = await firstCard.evaluate(el => {
          return el.tagName.toLowerCase() === 'a' || el.tagName.toLowerCase() === 'button' || el.hasAttribute('onclick')
        })

        if (isClickable) {
          await page.keyboard.press('Enter')
          // Should either navigate or open a modal/detail view
        }
      }
    })

    test('should handle Escape key to close modals', async ({page}) => {
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      // Look for elements that might open modals (theme customizer, project previews)
      const modalTriggers = page.locator('[aria-haspopup="dialog"], .modal-trigger, .theme-customizer-trigger')
      const triggerCount = await modalTriggers.count()

      if (triggerCount > 0) {
        const firstTrigger = modalTriggers.first()
        await firstTrigger.click()

        // Wait for potential modal to appear
        await page.waitForTimeout(300)

        // Look for modal
        const modal = page.locator('[role="dialog"], .modal, .theme-customizer')
        if ((await modal.count()) > 0 && (await modal.isVisible())) {
          // Press Escape to close
          await page.keyboard.press('Escape')
          await page.waitForTimeout(300)

          // Modal should be closed
          await expect(modal).not.toBeVisible()
        }
      }
    })
  })

  test.describe('Focus Management', () => {
    test('should maintain focus visibility throughout navigation', async ({page}) => {
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      // Tab through several elements and ensure focus is always visible
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('Tab')
        const focusedElement = page.locator(':focus')

        if ((await focusedElement.count()) > 0) {
          // Element should be visible and have focus styling
          await expect(focusedElement).toBeVisible()

          // Check if element has focus styling (outline, border, etc.)
          const hasVisibleFocus = await focusedElement.evaluate(el => {
            const computedStyle = window.getComputedStyle(el)
            return (
              computedStyle.outline !== 'none' ||
              computedStyle.outlineWidth !== '0px' ||
              computedStyle.border !== 'none' ||
              computedStyle.boxShadow !== 'none'
            )
          })

          expect(hasVisibleFocus).toBe(true)
        }
      }
    })

    test('should handle focus trap in modal dialogs', async ({page}) => {
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      // Try to find and open a modal
      const modalTriggers = page.locator('[aria-haspopup="dialog"], .modal-trigger, .theme-customizer-trigger')
      const triggerCount = await modalTriggers.count()

      if (triggerCount > 0) {
        const firstTrigger = modalTriggers.first()
        await firstTrigger.click()
        await page.waitForTimeout(300)

        const modal = page.locator('[role="dialog"], .modal, .theme-customizer')
        if ((await modal.count()) > 0 && (await modal.isVisible())) {
          // Tab through modal elements - focus should stay within modal
          await page.keyboard.press('Tab')

          // Continue tabbing and ensure focus stays within modal
          for (let i = 0; i < 10; i++) {
            const currentFocus = page.locator(':focus')
            const isInModal = await currentFocus.evaluate(
              (el, modalEl) => {
                return modalEl?.contains(el) ?? false
              },
              await modal.elementHandle(),
            )

            expect(isInModal).toBe(true)
            await page.keyboard.press('Tab')
          }
        }
      }
    })

    test('should return focus to trigger element after modal closes', async ({page}) => {
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      const modalTriggers = page.locator('[aria-haspopup="dialog"], .modal-trigger, .theme-customizer-trigger')
      const triggerCount = await modalTriggers.count()

      if (triggerCount > 0) {
        const firstTrigger = modalTriggers.first()

        // Focus and remember the trigger
        await firstTrigger.focus()
        await expect(firstTrigger).toBeFocused()

        // Open modal
        await firstTrigger.click()
        await page.waitForTimeout(300)

        const modal = page.locator('[role="dialog"], .modal, .theme-customizer')
        if ((await modal.count()) > 0 && (await modal.isVisible())) {
          // Close modal with Escape
          await page.keyboard.press('Escape')
          await page.waitForTimeout(300)

          // Focus should return to trigger
          await expect(firstTrigger).toBeFocused()
        }
      }
    })
  })
})
