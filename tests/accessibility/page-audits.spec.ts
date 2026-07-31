import AxeBuilder from '@axe-core/playwright'
import {expect, test, type Page} from '@playwright/test'

import {testData} from '../e2e/fixtures/test-data'

async function setThemeMode(page: Page, mode: 'light' | 'dark'): Promise<void> {
  await page.addInitScript(themeMode => {
    localStorage.removeItem('mrbro-dev-custom-theme')
    localStorage.setItem('mrbro-dev-theme-mode', JSON.stringify(themeMode))
  }, mode)
}

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
    {path: '/blog/welcome-to-the-blog', name: 'Blog Post'},
    {path: '/blog/this-slug-does-not-exist', name: 'Blog Post Not Found'},
    {path: '/privacy', name: 'Privacy'},
  ]

  // Test each page for accessibility violations
  for (const {path, name} of pages) {
    test.describe(`${name} Page`, () => {
      test('should have no accessibility violations - light theme', async ({page}) => {
        await setThemeMode(page, 'light')
        await page.goto(path)

        await page.waitForLoadState('networkidle')
        const htmlElement = page.locator('html')
        await expect(htmlElement).toHaveAttribute('data-theme', 'light')

        const accessibilityScanResults = await new AxeBuilder({page})
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()

        expect(accessibilityScanResults.violations).toEqual([])
      })

      test('should have no accessibility violations - dark theme', async ({page}) => {
        await setThemeMode(page, 'dark')
        await page.goto(path)
        await page.waitForLoadState('networkidle')
        const htmlElement = page.locator('html')
        await expect(htmlElement).toHaveAttribute('data-theme', 'dark', {timeout: 5000})

        const accessibilityScanResults = await new AxeBuilder({page})
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()

        expect(accessibilityScanResults.violations).toEqual([])
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
  test('Page exposes the site header as its only banner landmark', async ({page}) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const banner = page.getByRole('banner')
    await expect(banner).toHaveCount(1)
    await expect(banner).toHaveClass(/header/)
    await expect(banner.getByRole('navigation', {name: 'Main navigation'})).toBeVisible()
  })

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
