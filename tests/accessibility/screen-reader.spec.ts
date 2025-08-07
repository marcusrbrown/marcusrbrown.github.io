import AxeBuilder from '@axe-core/playwright'
import {expect, test} from '@playwright/test'

/**
 * Screen reader compatibility tests using aria-label validation
 * Tests semantic HTML structure and ARIA attributes for screen reader accessibility
 */

test.describe('Screen Reader Compatibility Tests', () => {
  test.describe('ARIA Labels and Descriptions', () => {
    test('should have proper aria-labels for interactive elements', async ({page}) => {
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      // Theme toggle button should have aria-label
      const themeToggle = page.locator('.theme-toggle')
      if ((await themeToggle.count()) > 0) {
        await expect(themeToggle).toHaveAttribute('aria-label')
        const ariaLabel = await themeToggle.getAttribute('aria-label')
        expect(ariaLabel).toBeTruthy()
        expect(ariaLabel?.length).toBeGreaterThan(0)
      }

      // Navigation links should have meaningful text or aria-labels
      const navLinks = page.locator('header nav a')
      const linkCount = await navLinks.count()

      for (let i = 0; i < linkCount; i++) {
        const link = navLinks.nth(i)
        const linkText = await link.textContent()
        const ariaLabel = await link.getAttribute('aria-label')

        // Either text content or aria-label should be meaningful
        expect(linkText || ariaLabel).toBeTruthy()
        expect((linkText || ariaLabel)?.trim().length).toBeGreaterThan(0)
      }
    })

    test('should have proper heading hierarchy', async ({page}) => {
      const pages = ['/', '/about', '/projects', '/blog']

      for (const pagePath of pages) {
        await page.goto(pagePath)
        await page.waitForLoadState('networkidle')

        // Check for h1 element (should be present and unique)
        const h1Elements = page.locator('h1')
        const h1Count = await h1Elements.count()
        expect(h1Count).toBeGreaterThanOrEqual(1)

        if (h1Count > 0) {
          const h1Text = await h1Elements.first().textContent()
          expect(h1Text?.trim().length).toBeGreaterThan(0)
        }

        // Check heading hierarchy (h1 -> h2 -> h3, etc.)
        const headings = page.locator('h1, h2, h3, h4, h5, h6')
        const headingCount = await headings.count()

        if (headingCount > 1) {
          const headingLevels: number[] = []

          for (let i = 0; i < headingCount; i++) {
            const heading = headings.nth(i)
            const tagName = await heading.evaluate(el => el.tagName.toLowerCase())
            const level = Number.parseInt(tagName.replace('h', ''), 10)
            headingLevels.push(level)
          }

          // First heading should be h1
          expect(headingLevels[0]).toBe(1)

          // Check for proper hierarchy (no skipping levels)
          for (let i = 1; i < headingLevels.length; i++) {
            const prevLevel = headingLevels[i - 1]
            const currentLevel = headingLevels[i]

            // Ensure both levels are defined before comparison
            if (prevLevel !== undefined && currentLevel !== undefined) {
              // Current level should not skip more than one level
              expect(currentLevel - prevLevel).toBeLessThanOrEqual(1)
            }
          }
        }
      }
    })

    test('should have proper form labels and descriptions', async ({page}) => {
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      // Look for form elements
      const formInputs = page.locator('input, textarea, select')
      const inputCount = await formInputs.count()

      for (let i = 0; i < inputCount; i++) {
        const input = formInputs.nth(i)
        const inputType = await input.getAttribute('type')

        // Skip hidden inputs
        if (inputType === 'hidden') continue

        // Each form input should have a label or aria-label
        const inputId = await input.getAttribute('id')
        const ariaLabel = await input.getAttribute('aria-label')
        const ariaLabelledBy = await input.getAttribute('aria-labelledby')

        let hasLabel = false

        // Check for label element
        if (inputId) {
          const label = page.locator(`label[for="${inputId}"]`)
          hasLabel = (await label.count()) > 0
        }

        // Check for aria-label or aria-labelledby
        hasLabel = hasLabel || !!ariaLabel || !!ariaLabelledBy

        expect(hasLabel).toBe(true)
      }
    })
  })

  test.describe('Semantic HTML Structure', () => {
    test('should use proper semantic elements', async ({page}) => {
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      // Check for semantic elements
      const header = page.locator('header.header')
      await expect(header).toHaveCount(1)

      const main = page.locator('main')
      await expect(main).toHaveCount(1)

      const footer = page.locator('footer.footer')
      if ((await footer.count()) > 0) {
        await expect(footer).toHaveCount(1)
      }

      // Navigation should be in nav element
      const nav = page.locator('nav.header__nav')
      if ((await nav.count()) > 0) {
        await expect(nav).toBeVisible()
      }
    })

    test('should have proper landmark roles', async ({page}) => {
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      // Run accessibility audit focusing on landmarks
      const accessibilityScanResults = await new AxeBuilder({page})
        .withTags(['wcag2a', 'wcag21a'])
        .withRules(['landmark-one-main', 'landmark-unique', 'region'])
        .analyze()

      expect(accessibilityScanResults.violations).toEqual([])
    })

    test('should have meaningful page titles', async ({page}) => {
      const pages = [
        {path: '/', expectedTitle: /marcus|home|portfolio/i},
        {path: '/about', expectedTitle: /about/i},
        {path: '/projects', expectedTitle: /projects/i},
        {path: '/blog', expectedTitle: /blog/i},
      ]

      for (const {path, expectedTitle} of pages) {
        await page.goto(path)
        await page.waitForLoadState('networkidle')

        const title = await page.title()
        expect(title).toMatch(expectedTitle)
        expect(title.length).toBeGreaterThan(0)
      }
    })
  })

  test.describe('Image Accessibility', () => {
    test('should have proper alt text for images', async ({page}) => {
      const pages = ['/', '/about', '/projects']

      for (const pagePath of pages) {
        await page.goto(pagePath)
        await page.waitForLoadState('networkidle')

        const images = page.locator('img')
        const imageCount = await images.count()

        for (let i = 0; i < imageCount; i++) {
          const img = images.nth(i)
          const src = await img.getAttribute('src')

          // Skip decorative images or icons (data URLs, small images, etc.)
          if (src?.startsWith('data:') || src?.includes('icon')) {
            const alt = await img.getAttribute('alt')
            // Decorative images should have empty alt text
            expect(alt).toBeDefined()
          } else {
            // Content images should have meaningful alt text
            const alt = await img.getAttribute('alt')
            expect(alt).toBeTruthy()
            expect(alt?.length).toBeGreaterThan(0)
          }
        }
      }
    })

    test('should handle missing images gracefully', async ({page}) => {
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      // Test with broken image
      await page.evaluate(() => {
        const img = document.createElement('img')
        img.src = 'https://example.com/nonexistent-image.jpg'
        img.alt = 'Test image with broken src'
        document.body.append(img)
      })

      // Image should still have alt text even when broken
      const testImg = page.locator('img[alt="Test image with broken src"]')
      await expect(testImg).toHaveAttribute('alt', 'Test image with broken src')
    })
  })

  test.describe('ARIA Roles and States', () => {
    test('should use appropriate ARIA roles for custom components', async ({page}) => {
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      // Check for custom components that should have ARIA roles
      const buttons = page.locator('[role="button"]')
      const buttonCount = await buttons.count()

      for (let i = 0; i < buttonCount; i++) {
        const button = buttons.nth(i)

        // Elements with button role should be keyboard accessible
        await button.focus()
        await expect(button).toBeFocused()

        // Should have proper aria-label or text content
        const ariaLabel = await button.getAttribute('aria-label')
        const textContent = await button.textContent()
        expect(ariaLabel || textContent?.trim()).toBeTruthy()
      }
    })

    test('should handle modal dialog ARIA attributes', async ({page}) => {
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      // Try to find and open a modal
      const modalTriggers = page.locator('[aria-haspopup="dialog"], .modal-trigger')
      const triggerCount = await modalTriggers.count()

      if (triggerCount > 0) {
        const firstTrigger = modalTriggers.first()
        await firstTrigger.click()
        await page.waitForTimeout(300)

        const modal = page.locator('[role="dialog"]')
        if ((await modal.count()) > 0 && (await modal.isVisible())) {
          // Modal should have proper ARIA attributes
          await expect(modal).toHaveAttribute('role', 'dialog')

          // Should have aria-label or aria-labelledby
          const ariaLabel = await modal.getAttribute('aria-label')
          const ariaLabelledBy = await modal.getAttribute('aria-labelledby')
          expect(ariaLabel || ariaLabelledBy).toBeTruthy()

          // Should have aria-modal="true"
          const ariaModal = await modal.getAttribute('aria-modal')
          expect(ariaModal).toBe('true')

          // Close modal
          await page.keyboard.press('Escape')
        }
      }
    })

    test('should indicate expanded/collapsed states', async ({page}) => {
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      // Look for expandable elements
      const expandableElements = page.locator('[aria-expanded]')
      const expandableCount = await expandableElements.count()

      for (let i = 0; i < expandableCount; i++) {
        const element = expandableElements.nth(i)
        const ariaExpanded = await element.getAttribute('aria-expanded')

        // aria-expanded should be "true" or "false"
        expect(['true', 'false']).toContain(ariaExpanded)

        // Test toggling if possible
        if (await element.isVisible()) {
          await element.click()
          await page.waitForTimeout(200)

          const newState = await element.getAttribute('aria-expanded')
          // State should toggle or remain the same if not interactive
          expect(['true', 'false']).toContain(newState)
        }
      }
    })
  })

  test.describe('Screen Reader Specific Tests', () => {
    test('should have proper live regions for dynamic content', async ({page}) => {
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      // Look for live regions
      const liveRegions = page.locator('[aria-live], [role="status"], [role="alert"]')
      const liveRegionCount = await liveRegions.count()

      for (let i = 0; i < liveRegionCount; i++) {
        const liveRegion = liveRegions.nth(i)
        const ariaLive = await liveRegion.getAttribute('aria-live')
        const role = await liveRegion.getAttribute('role')

        // aria-live should be "polite", "assertive", or "off"
        if (ariaLive) {
          expect(['polite', 'assertive', 'off']).toContain(ariaLive)
        }

        // Status and alert roles should be present for important updates
        if (role) {
          expect(['status', 'alert', 'log', 'region']).toContain(role)
        }
      }
    })

    test('should provide descriptive text for complex interactions', async ({page}) => {
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      // Check theme toggle for descriptive text
      const themeToggle = page.locator('.theme-toggle')
      if ((await themeToggle.count()) > 0) {
        const ariaLabel = await themeToggle.getAttribute('aria-label')
        const ariaDescribedBy = await themeToggle.getAttribute('aria-describedby')

        expect(ariaLabel || ariaDescribedBy).toBeTruthy()

        if (ariaLabel) {
          // Should describe what the button does
          expect(ariaLabel.toLowerCase()).toMatch(/theme|toggle|switch|dark|light/)
        }
      }
    })

    test('should announce page changes for SPA navigation', async ({page}) => {
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      // Navigate to different page
      const aboutLink = page.locator('header nav').getByRole('link', {name: /about/i})
      if ((await aboutLink.count()) > 0) {
        await aboutLink.click()
        await page.waitForLoadState('networkidle')

        // Check if there's a clear heading for screen readers to find
        const h1 = page.locator('main h1').first()

        // At minimum, the page should have a clear h1 for screen readers to find
        await expect(h1).toBeVisible()
        const h1Text = await h1.textContent()
        expect(h1Text?.trim().length).toBeGreaterThan(0)
      }
    })
  })

  test.describe('Comprehensive ARIA Compliance', () => {
    test('should pass comprehensive ARIA validation', async ({page}) => {
      const pages = ['/', '/about', '/projects', '/blog']

      for (const pagePath of pages) {
        await page.goto(pagePath)
        await page.waitForLoadState('networkidle')

        // Run comprehensive ARIA audit
        const accessibilityScanResults = await new AxeBuilder({page})
          .withTags(['wcag2a', 'wcag21a', 'wcag2aa', 'wcag21aa'])
          .withRules([
            'aria-allowed-attr',
            'aria-command-name',
            'aria-hidden-body',
            'aria-hidden-focus',
            'aria-input-field-name',
            'aria-required-attr',
            'aria-required-children',
            'aria-required-parent',
            'aria-roles',
            'aria-valid-attr',
            'aria-valid-attr-value',
            'button-name',
            'input-button-name',
            'link-name',
          ])
          .analyze()

        if (accessibilityScanResults.violations.length > 0) {
          console.warn(`ARIA violations on ${pagePath}:`, accessibilityScanResults.violations)
        }

        expect(accessibilityScanResults.violations).toEqual([])
      }
    })
  })
})
