/**
 * Responsive visual regression tests
 * Tests UI consistency across different viewport sizes and breakpoints
 */

import {test} from '@playwright/test'

import {
  preparePageForVisualTest,
  setupGitHubAPIMocking,
  VISUAL_BREAKPOINTS,
  waitForComponentStable,
  type ThemeMode,
} from './utils'

const THEMES: ThemeMode[] = ['light', 'dark']

test.describe('Responsive Visual Regression', () => {
  test.describe('Full Page Responsive Tests', () => {
    const pages = [
      {path: '/', name: 'home'},
      {path: '/about', name: 'about'},
      {path: '/projects', name: 'projects'},
      {path: '/blog', name: 'blog'},
    ]

    VISUAL_BREAKPOINTS.forEach(({name, width, height, isMobile}) => {
      THEMES.forEach(theme => {
        pages.forEach(({path, name: pageName}) => {
          test(`${pageName} page - ${name} (${width}x${height}) - ${theme} theme`, async ({page}) => {
            // Set viewport with proper mobile settings
            await page.setViewportSize({width, height})

            if (isMobile) {
              await page.emulateMedia({
                media: 'screen',
                colorScheme: theme === 'dark' ? 'dark' : 'light',
              })
            }

            await page.goto(path)
            await preparePageForVisualTest(page, {theme})

            // Wait for responsive layout to settle
            await page.waitForTimeout(1000)

            // Take full page screenshot
            await page.screenshot({
              path: `tests/visual/screenshots/responsive-${pageName}-${name}-${theme}.png`,
              fullPage: true,
              animations: 'disabled',
            })
          })
        })
      })
    })
  })

  test.describe('Component Responsive Tests', () => {
    const responsiveComponents = [
      {
        selector: 'header.header, header[role="banner"], nav + header, header:first-of-type',
        name: 'header',
        page: '/',
      },
      {
        selector: '[data-testid="hero-section"], .hero-section, [class*="hero"], main > section:first-child',
        name: 'hero-section',
        page: '/',
      },
      {
        selector: '[data-testid="project-gallery"], .project-gallery, [class*="project"]',
        name: 'project-gallery',
        page: '/projects',
      },
      {
        selector: '[data-testid="skills-showcase"], .skills-showcase, [class*="skills"]',
        name: 'skills-showcase',
        page: '/',
        scrollIntoView: true,
      },
      {
        selector: 'footer.footer, footer[role="contentinfo"], footer:last-of-type',
        name: 'footer',
        page: '/',
        scrollIntoView: true,
      },
    ]

    VISUAL_BREAKPOINTS.forEach(({name: breakpointName, width, height, isMobile}) => {
      responsiveComponents.forEach(({selector, name: componentName, page: pagePath, scrollIntoView}) => {
        test(`${componentName} - ${breakpointName} (${width}x${height}) - light theme`, async ({page}) => {
          await page.setViewportSize({width, height})

          if (isMobile) {
            await page.emulateMedia({media: 'screen', colorScheme: 'light'})
          }

          await page.goto(pagePath)
          await preparePageForVisualTest(page, {theme: 'light'})

          // Wait for component to be available
          const component = page.locator(selector).first()
          const componentCount = await component.count()

          if (componentCount === 0) {
            test.skip(true, `Component ${componentName} not found on ${pagePath}`)
            return
          }

          if (scrollIntoView) {
            await component.scrollIntoViewIfNeeded()
          }

          await waitForComponentStable(page, selector)

          // Wait for responsive layout changes to settle
          await page.waitForTimeout(500)

          await component.screenshot({
            path: `tests/visual/screenshots/responsive-${componentName}-${breakpointName}.png`,
            animations: 'disabled',
          })
        })
      })
    })
  })

  test.describe('Navigation Responsive Behavior', () => {
    test('Header navigation - Mobile vs Desktop', async ({page}) => {
      await page.goto('/')

      // Test desktop navigation
      await page.setViewportSize({width: 1440, height: 900})
      await preparePageForVisualTest(page, {theme: 'light'})

      const header = page.locator('header.header, header[role="banner"], nav + header, header:first-of-type').first()
      await waitForComponentStable(page, 'header.header, header[role="banner"], nav + header, header:first-of-type')

      await header.screenshot({
        path: 'tests/visual/screenshots/navigation-desktop-expanded.png',
        animations: 'disabled',
      })

      // Test mobile navigation (collapsed)
      await page.setViewportSize({width: 375, height: 667})
      await page.waitForTimeout(500) // Allow layout to adjust

      await header.screenshot({
        path: 'tests/visual/screenshots/navigation-mobile-collapsed.png',
        animations: 'disabled',
      })

      // Test mobile navigation menu if it has a toggle
      const mobileMenuToggle = page
        .locator('[data-testid="mobile-menu-toggle"], .menu-toggle, .hamburger, button[aria-label*="menu"]')
        .first()

      if ((await mobileMenuToggle.count()) > 0) {
        await mobileMenuToggle.click()
        await page.waitForTimeout(300) // Wait for menu animation

        await page.screenshot({
          path: 'tests/visual/screenshots/navigation-mobile-expanded.png',
          fullPage: true,
          animations: 'disabled',
        })
      }
    })

    test('Theme toggle - Mobile vs Desktop positioning', async ({page}) => {
      await page.goto('/')

      const themeToggle = page.locator('[data-testid="theme-toggle"]').first()

      if ((await themeToggle.count()) === 0) {
        test.skip(true, 'Theme toggle not found')
        return
      }

      // Desktop theme toggle
      await page.setViewportSize({width: 1440, height: 900})
      await preparePageForVisualTest(page, {theme: 'light'})

      await themeToggle.screenshot({
        path: 'tests/visual/screenshots/theme-toggle-desktop-position.png',
        animations: 'disabled',
      })

      // Mobile theme toggle
      await page.setViewportSize({width: 375, height: 667})
      await page.waitForTimeout(500)

      await themeToggle.screenshot({
        path: 'tests/visual/screenshots/theme-toggle-mobile-position.png',
        animations: 'disabled',
      })
    })
  })

  test.describe('Content Layout Responsive Tests', () => {
    test('Text content reflow - Article/Blog layout', async ({page}) => {
      // Set up mocking before any navigation
      await setupGitHubAPIMocking(page)
      await page.goto('/blog')
      await preparePageForVisualTest(page, {theme: 'light', skipMocking: true})

      const breakpoints = [
        {name: 'mobile', width: 375, height: 667},
        {name: 'tablet', width: 768, height: 1024},
        {name: 'desktop', width: 1024, height: 768},
      ]

      for (const {name, width, height} of breakpoints) {
        await page.setViewportSize({width, height})
        await page.waitForTimeout(500)

        // Look for article content
        const articleContent = page.locator('article, .article, .blog-post, .post-content, main').first()

        if ((await articleContent.count()) > 0) {
          await articleContent.screenshot({
            path: `tests/visual/screenshots/content-reflow-${name}.png`,
            animations: 'disabled',
          })
        }
      }
    })

    test('Card grid layouts - Projects page', async ({page}) => {
      // Set up mocking before any navigation
      await setupGitHubAPIMocking(page)
      await page.goto('/projects')
      await preparePageForVisualTest(page, {theme: 'light', skipMocking: true})

      const projectGrid = page
        .locator('[data-testid="project-gallery"], .project-gallery, .project-grid, .projects-container')
        .first()

      if ((await projectGrid.count()) === 0) {
        test.skip(true, 'Project grid not found')
        return
      }

      const breakpoints = [
        {name: 'mobile', width: 375, height: 667},
        {name: 'tablet', width: 768, height: 1024},
        {name: 'desktop', width: 1024, height: 768},
        {name: 'large', width: 1440, height: 900},
      ]

      for (const {name, width, height} of breakpoints) {
        await page.setViewportSize({width, height})
        await page.waitForTimeout(500)

        await projectGrid.screenshot({
          path: `tests/visual/screenshots/project-grid-${name}.png`,
          animations: 'disabled',
        })
      }
    })
  })

  test.describe('Interactive Elements Responsive Tests', () => {
    test('Button sizing and spacing across breakpoints', async ({page}) => {
      await page.goto('/')
      await preparePageForVisualTest(page, {theme: 'light'})

      const buttons = page.locator('button, .btn, .button, [role="button"]')
      const buttonCount = await buttons.count()

      if (buttonCount === 0) {
        test.skip(true, 'No buttons found for testing')
        return
      }

      const breakpoints = [375, 768, 1024, 1440]

      for (const width of breakpoints) {
        await page.setViewportSize({width, height: 900})
        await page.waitForTimeout(300)

        // Test first few buttons
        const maxButtons = Math.min(3, buttonCount)
        for (let i = 0; i < maxButtons; i++) {
          const button = buttons.nth(i)
          if (await button.isVisible()) {
            await button.screenshot({
              path: `tests/visual/screenshots/button-${i}-${width}px.png`,
              animations: 'disabled',
            })
          }
        }
      }
    })

    test('Form elements responsive behavior', async ({page}) => {
      // Look for forms on any page
      const pagesWithForms = ['/', '/about', '/contact', '/blog']

      for (const pagePath of pagesWithForms) {
        await page.goto(pagePath)
        await preparePageForVisualTest(page, {theme: 'light'})

        const forms = page.locator('form, .form, [class*="form"]')
        const formCount = await forms.count()

        if (formCount > 0) {
          const form = forms.first()

          const breakpoints = [
            {name: 'mobile', width: 375},
            {name: 'tablet', width: 768},
            {name: 'desktop', width: 1024},
          ]

          for (const {name, width} of breakpoints) {
            await page.setViewportSize({width, height: 900})
            await page.waitForTimeout(300)

            await form.screenshot({
              path: `tests/visual/screenshots/form-${name}-${pagePath.replace('/', 'home')}.png`,
              animations: 'disabled',
            })
          }

          break // Found a form, no need to check other pages
        }
      }
    })
  })

  test.describe('Edge Case Responsive Tests', () => {
    test('Very small screens - 320px width', async ({page}) => {
      await page.setViewportSize({width: 320, height: 568})
      await page.goto('/')
      await preparePageForVisualTest(page, {theme: 'light'})

      await page.screenshot({
        path: 'tests/visual/screenshots/edge-case-320px-width.png',
        fullPage: true,
        animations: 'disabled',
      })
    })

    test('Very wide screens - 2560px width', async ({page}) => {
      await page.setViewportSize({width: 2560, height: 1440})
      await page.goto('/')
      await preparePageForVisualTest(page, {theme: 'light'})

      await page.screenshot({
        path: 'tests/visual/screenshots/edge-case-2560px-width.png',
        fullPage: true,
        animations: 'disabled',
      })
    })

    test('Landscape mobile orientation', async ({page}) => {
      await page.setViewportSize({width: 667, height: 375})
      await page.emulateMedia({media: 'screen'})

      await page.goto('/')
      await preparePageForVisualTest(page, {theme: 'light'})

      await page.screenshot({
        path: 'tests/visual/screenshots/mobile-landscape-orientation.png',
        fullPage: true,
        animations: 'disabled',
      })
    })
  })
})
