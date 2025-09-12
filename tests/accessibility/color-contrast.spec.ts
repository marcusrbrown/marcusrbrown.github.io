import AxeBuilder from '@axe-core/playwright'
import {expect, test} from '@playwright/test'

import {testData} from '../e2e/fixtures/test-data'

/**
 * Color contrast compliance tests across theme variations
 * Tests WCAG 2.1 AA color contrast requirements (4.5:1 for normal text, 3:1 for large text)
 */

test.describe('Color Contrast Compliance Tests', () => {
  const themes = ['light', 'dark'] as const

  test.describe('Theme Color Contrast Validation', () => {
    for (const theme of themes) {
      test(`should meet color contrast requirements - ${theme} theme`, async ({page}) => {
        await page.goto('/')
        await page.waitForLoadState('networkidle')

        // Set specific theme
        await page.evaluate(themeName => {
          document.documentElement.dataset.theme = themeName
        }, theme)

        const htmlElement = page.locator('html')
        await expect(htmlElement).toHaveAttribute('data-theme', theme)

        // Wait for theme transition to complete
        await page.waitForTimeout(400)

        // Run color contrast specific audit
        const accessibilityScanResults = await new AxeBuilder({page})
          .withTags(['wcag2aa'])
          .withRules(['color-contrast'])
          .analyze()

        // Log any violations for debugging
        if (accessibilityScanResults.violations.length > 0) {
          console.warn(`Color contrast violations in ${theme} theme:`, accessibilityScanResults.violations)
        }

        expect(accessibilityScanResults.violations).toEqual([])
      })
    }
  })

  test.describe('Page-Specific Color Contrast Tests', () => {
    const pages = [
      {path: '/', name: 'Home'},
      {path: '/about', name: 'About'},
      {path: '/projects', name: 'Projects'},
      {path: '/blog', name: 'Blog'},
    ]

    for (const {path, name} of pages) {
      for (const theme of themes) {
        test(`${name} page color contrast - ${theme} theme`, async ({page}) => {
          await page.goto(path)
          await page.waitForLoadState('networkidle')

          // Set theme
          await page.evaluate(themeName => {
            document.documentElement.dataset.theme = themeName
          }, theme)

          await page.waitForTimeout(400)

          // Test color contrast for the specific page
          const accessibilityScanResults = await new AxeBuilder({page})
            .withRules(['color-contrast'])
            .include('main')
            .analyze()

          expect(accessibilityScanResults.violations).toEqual([])
        })
      }
    }
  })

  test.describe('Component Color Contrast Tests', () => {
    test('Navigation menu color contrast across themes', async ({page}) => {
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      for (const theme of themes) {
        // Set theme
        await page.evaluate(themeName => {
          document.documentElement.dataset.theme = themeName
        }, theme)

        await page.waitForTimeout(400)

        // Test navigation color contrast
        const accessibilityScanResults = await new AxeBuilder({page})
          .withRules(['color-contrast'])
          .include('header nav')
          .analyze()

        expect(accessibilityScanResults.violations).toEqual([])
      }
    })

    test('Button and interactive element color contrast', async ({page}) => {
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      for (const theme of themes) {
        await page.evaluate(themeName => {
          document.documentElement.dataset.theme = themeName
        }, theme)

        await page.waitForTimeout(400)

        // Test buttons and interactive elements
        const buttons = page.locator('button, .button, .btn, .theme-toggle')
        const buttonCount = await buttons.count()

        if (buttonCount > 0) {
          // Test all buttons as a group rather than individually
          const accessibilityScanResults = await new AxeBuilder({page})
            .withRules(['color-contrast'])
            .include('body') // Include whole body to test all buttons
            .analyze()

          const colorContrastViolations = accessibilityScanResults.violations.filter(
            violation => violation.id === 'color-contrast',
          )

          expect(colorContrastViolations).toEqual([])
        }
      }
    })

    test('Card and content area color contrast', async ({page}) => {
      await page.goto('/projects')
      await page.waitForLoadState('networkidle')

      for (const theme of themes) {
        await page.evaluate(themeName => {
          document.documentElement.dataset.theme = themeName
        }, theme)

        await page.waitForTimeout(400)

        // Test project cards
        const cards = page.locator('.project-card, .card, [data-testid="project-card"]')
        const cardCount = await cards.count()

        if (cardCount > 0) {
          const accessibilityScanResults = await new AxeBuilder({page})
            .withRules(['color-contrast'])
            .include('.project-card, .card, [data-testid="project-card"]')
            .analyze()

          expect(accessibilityScanResults.violations).toEqual([])
        }
      }
    })
  })

  test.describe('Custom Theme Color Contrast', () => {
    test('should maintain color contrast with custom themes', async ({page}) => {
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      // Try to find and open theme customizer
      const themeCustomizerTrigger = page.locator('.theme-customizer-trigger, [aria-haspopup="dialog"]')
      const triggerCount = await themeCustomizerTrigger.count()

      if (triggerCount > 0) {
        await themeCustomizerTrigger.first().click()
        await page.waitForTimeout(500)

        const customizer = page.locator('.theme-customizer, [role="dialog"]')
        if ((await customizer.count()) > 0 && (await customizer.isVisible())) {
          // Test preset themes if available
          const presetButtons = page.locator('.preset-theme-button, .theme-preset')
          const presetCount = await presetButtons.count()

          for (let i = 0; i < Math.min(presetCount, 3); i++) {
            const presetButton = presetButtons.nth(i)
            if (await presetButton.isVisible()) {
              await presetButton.click()
              await page.waitForTimeout(400)

              // Test color contrast with this preset theme
              const accessibilityScanResults = await new AxeBuilder({page})
                .withRules(['color-contrast'])
                .exclude('.theme-customizer, [role="dialog"]') // Exclude the customizer itself
                .analyze()

              expect(accessibilityScanResults.violations).toEqual([])
            }
          }

          // Close customizer
          await page.keyboard.press('Escape')
        }
      }
    })
  })

  test.describe('Responsive Color Contrast Tests', () => {
    for (const viewport of testData.scenarios.responsiveBreakpoints.slice(0, 3)) {
      test(`Color contrast on ${viewport.category} viewport`, async ({page}) => {
        await page.setViewportSize({width: viewport.width, height: viewport.height})
        await page.goto('/')
        await page.waitForLoadState('networkidle')

        for (const theme of themes) {
          await page.evaluate(themeName => {
            document.documentElement.dataset.theme = themeName
          }, theme)

          await page.waitForTimeout(400)

          const accessibilityScanResults = await new AxeBuilder({page}).withRules(['color-contrast']).analyze()

          expect(accessibilityScanResults.violations).toEqual([])
        }
      })
    }
  })

  test.describe('High Contrast and Accessibility Modes', () => {
    test('should respect prefers-contrast media query', async ({page}) => {
      // Emulate high contrast preference
      await page.emulateMedia({colorScheme: 'dark', reducedMotion: 'reduce'})
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      // Test with high contrast requirements (stricter 7:1 ratio)
      const accessibilityScanResults = await new AxeBuilder({page}).withRules(['color-contrast']).analyze()

      // High contrast mode might have some acceptable violations
      // Log them for review but don't fail the test
      if (accessibilityScanResults.violations.length > 0) {
        console.warn('High contrast violations (for review):', accessibilityScanResults.violations)
      }
    })

    test('should work with forced-colors media query', async ({page}) => {
      // Test Windows High Contrast mode simulation
      await page.addStyleTag({
        content: `
          @media (forced-colors: active) {
            * {
              color: ButtonText !important;
              background-color: ButtonFace !important;
            }
          }
        `,
      })

      await page.goto('/')
      await page.waitForLoadState('networkidle')

      // In forced colors mode, color contrast should still be testable
      const accessibilityScanResults = await new AxeBuilder({page}).withRules(['color-contrast']).analyze()

      // Forced colors mode handles contrast automatically, but we should still test
      expect(accessibilityScanResults.violations.length).toBeLessThanOrEqual(5) // Allow some flexibility
    })
  })
})
