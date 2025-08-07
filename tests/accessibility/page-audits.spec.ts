import AxeBuilder from '@axe-core/playwright'
import {expect, test} from '@playwright/test'

import {testData} from '../e2e/fixtures/test-data'

/**
 * Accessibility audit tests for all main pages
 * Tests WCAG 2.1 AA compliance using axe-core
 */

test.describe('Page Accessibility Audits', () => {
  const pages = [
    {path: '/', name: 'Home'},
    {path: '/about', name: 'About'},
    {path: '/projects', name: 'Projects'},
    {path: '/blog', name: 'Blog'},
  ]

  // Test each page for accessibility violations
  for (const {path, name} of pages) {
    test.describe(`${name} Page`, () => {
      test('should have no accessibility violations - light theme', async ({page}) => {
        await page.goto(path)

        // Wait for page to load completely
        await page.waitForLoadState('networkidle')

        // Ensure light theme is active
        const themeToggle = page.locator('.theme-toggle')

        // First check current theme and toggle if needed to get to light
        const htmlElement = page.locator('html')
        const currentTheme = await htmlElement.getAttribute('data-theme')
        if (currentTheme !== 'light') {
          await themeToggle.click()
          await page.waitForTimeout(500) // Wait for theme transition
        }
        await expect(htmlElement).toHaveAttribute('data-theme', 'light') // Run accessibility audit
        const accessibilityScanResults = await new AxeBuilder({page})
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()

        expect(accessibilityScanResults.violations).toEqual([])
      })

      test('should have no accessibility violations - dark theme', async ({page}) => {
        await page.goto(path)

        // Wait for page to load completely
        await page.waitForLoadState('networkidle')

        // Ensure dark theme is active
        const themeToggle = page.locator('.theme-toggle')
        const htmlElement = page.locator('html')

        // Click the theme toggle until we reach dark mode
        let attempts = 0
        const maxAttempts = 4 // light → dark → system → light → dark
        while (attempts < maxAttempts) {
          const currentTheme = await htmlElement.getAttribute('data-theme')
          if (currentTheme === 'dark') {
            break
          }
          await themeToggle.click({timeout: 5000})
          await page.waitForTimeout(1000) // Allow theme change to process
          attempts++
        }

        // Verify theme change completed successfully before proceeding
        await expect(htmlElement).toHaveAttribute('data-theme', 'dark', {timeout: 5000})

        // Run accessibility audit
        const accessibilityScanResults = await new AxeBuilder({page})
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()

        expect(accessibilityScanResults.violations).toEqual([])
      })

      test('should meet color contrast requirements across all themes', async ({page}) => {
        await page.goto(path)
        await page.waitForLoadState('networkidle')

        for (const theme of ['light', 'dark'] as const) {
          // Switch theme properly using the theme toggle button
          let currentTheme = await page.getAttribute('html', 'data-theme')
          let attempts = 0
          const maxAttempts = 5

          // Keep clicking until we reach the desired theme (handles the 3-state cycle)
          while (currentTheme !== theme && attempts < maxAttempts) {
            await page.click('[data-testid="theme-toggle"]')
            await page.waitForTimeout(500) // Wait for theme transition
            currentTheme = await page.getAttribute('html', 'data-theme')
            attempts++
          }

          // Wait for theme change to take effect
          const htmlElement = page.locator('html')
          await expect(htmlElement).toHaveAttribute('data-theme', theme, {timeout: 10000})

          // Additional wait for CSS transitions
          await page.waitForTimeout(500)

          // Run color contrast audit specifically
          const accessibilityScanResults = await new AxeBuilder({page}).withTags(['wcag2aa']).include('body').analyze()

          // Filter for color contrast violations
          const colorContrastViolations = accessibilityScanResults.violations.filter(
            violation => violation.id === 'color-contrast',
          )

          expect(colorContrastViolations).toEqual([])
        }
      })

      // Test responsive accessibility
      for (const viewport of testData.scenarios.responsiveBreakpoints.slice(0, 3)) {
        // Test mobile, tablet, desktop
        test(`should be accessible on ${viewport.category} viewport`, async ({page}) => {
          await page.setViewportSize({width: viewport.width, height: viewport.height})
          await page.goto(path)
          await page.waitForLoadState('networkidle')

          const accessibilityScanResults = await new AxeBuilder({page})
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
            .analyze()

          expect(accessibilityScanResults.violations).toEqual([])
        })
      }
    })
  }
})

test.describe('Component Accessibility Audits', () => {
  test('Navigation menu accessibility', async ({page}) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Focus on navigation
    const nav = page.locator('header.header nav')
    await expect(nav).toBeVisible()

    // Run accessibility audit on navigation
    const accessibilityScanResults = await new AxeBuilder({page})
      .include('header.header')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze()

    expect(accessibilityScanResults.violations).toEqual([])
  })

  test('Theme toggle button accessibility', async ({page}) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const themeToggle = page.locator('.theme-toggle')
    await expect(themeToggle).toBeVisible()

    // Check for proper ARIA attributes
    await expect(themeToggle).toHaveAttribute('aria-label')
    // HTML button elements have implicit role="button", no need to check for explicit role

    // Run accessibility audit on theme toggle
    const accessibilityScanResults = await new AxeBuilder({page})
      .include('.theme-toggle')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze()

    expect(accessibilityScanResults.violations).toEqual([])
  })

  test('Footer accessibility', async ({page}) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const footer = page.locator('footer.footer')
    await expect(footer).toBeVisible()

    // Run accessibility audit on footer
    const accessibilityScanResults = await new AxeBuilder({page})
      .include('footer.footer')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze()

    expect(accessibilityScanResults.violations).toEqual([])
  })
})
