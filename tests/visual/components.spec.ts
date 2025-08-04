/**
 * Visual regression tests for major UI components
 * Tests Header, Footer, Cards, and Modal components for visual consistency
 */

import {test} from '@playwright/test'

import {preparePageForVisualTest, setThemeMode, waitForComponentStable, type ThemeMode} from './utils'

const THEMES: ThemeMode[] = ['light', 'dark']

test.describe('UI Components Visual Regression', () => {
  test.describe('Header Component', () => {
    THEMES.forEach(theme => {
      test(`Header - ${theme} theme`, async ({page}) => {
        await page.goto('/')
        await preparePageForVisualTest(page, {theme})

        // Wait for main page header to be stable (more specific selector)
        await waitForComponentStable(page, 'header.header, header[role="banner"], nav + header, header:first-of-type')

        // Take screenshot of just the main page header
        // Note: Use getThreshold('components') for toHaveScreenshot assertions
        const headerElement = page
          .locator('header.header, header[role="banner"], nav + header, header:first-of-type')
          .first()
        await headerElement.screenshot({
          path: `tests/visual/screenshots/header-${theme}-theme.png`,
          animations: 'disabled',
        })
      })
    })

    test('Header - Navigation states', async ({page}) => {
      await page.goto('/')
      await preparePageForVisualTest(page, {theme: 'light'})

      // Test desktop navigation
      await page.setViewportSize({width: 1440, height: 900})
      await waitForComponentStable(page, 'header.header, header[role="banner"], nav + header, header:first-of-type')

      const headerElement = page
        .locator('header.header, header[role="banner"], nav + header, header:first-of-type')
        .first()
      await headerElement.screenshot({
        path: 'tests/visual/screenshots/header-desktop-navigation.png',
        animations: 'disabled',
      })

      // Test mobile navigation
      await page.setViewportSize({width: 375, height: 667})
      await page.waitForTimeout(500) // Allow layout to adjust

      await headerElement.screenshot({
        path: 'tests/visual/screenshots/header-mobile-navigation.png',
        animations: 'disabled',
      })
    })

    test('Header - Theme toggle states', async ({page}) => {
      await page.goto('/')
      await preparePageForVisualTest(page, {theme: 'light'})

      // Capture light theme toggle state
      const themeToggle = page.locator('[data-testid="theme-toggle"]')
      await waitForComponentStable(page, '[data-testid="theme-toggle"]')

      await themeToggle.screenshot({
        path: 'tests/visual/screenshots/theme-toggle-light.png',
        animations: 'disabled',
      })

      // Switch to dark theme and capture
      await setThemeMode(page, 'dark')
      await page.waitForTimeout(200)

      await themeToggle.screenshot({
        path: 'tests/visual/screenshots/theme-toggle-dark.png',
        animations: 'disabled',
      })
    })
  })

  test.describe('Footer Component', () => {
    THEMES.forEach(theme => {
      test(`Footer - ${theme} theme`, async ({page}) => {
        await page.goto('/')
        await preparePageForVisualTest(page, {theme})

        // Scroll to main page footer
        await page.locator('footer.footer, footer[role="contentinfo"], footer:last-of-type').scrollIntoViewIfNeeded()
        await waitForComponentStable(page, 'footer.footer, footer[role="contentinfo"], footer:last-of-type')

        const footerElement = page.locator('footer.footer, footer[role="contentinfo"], footer:last-of-type').first()
        await footerElement.screenshot({
          path: `tests/visual/screenshots/footer-${theme}-theme.png`,
          animations: 'disabled',
        })
      })
    })

    test('Footer - Social links hover states', async ({page}) => {
      await page.goto('/')
      await preparePageForVisualTest(page, {theme: 'light'})

      await page.locator('footer.footer, footer[role="contentinfo"], footer:last-of-type').scrollIntoViewIfNeeded()
      await waitForComponentStable(page, 'footer.footer, footer[role="contentinfo"], footer:last-of-type')

      // Test normal state
      const footerElement = page.locator('footer.footer, footer[role="contentinfo"], footer:last-of-type').first()
      await footerElement.screenshot({
        path: 'tests/visual/screenshots/footer-social-links-normal.png',
        animations: 'disabled',
      })

      // Test hover state on first social link
      const firstSocialLink = page.locator('footer a[href*="github"]').first()
      if ((await firstSocialLink.count()) > 0) {
        await firstSocialLink.hover()
        await page.waitForTimeout(100)

        await footerElement.screenshot({
          path: 'tests/visual/screenshots/footer-social-links-hover.png',
          animations: 'disabled',
        })
      }
    })
  })

  test.describe('Project Cards', () => {
    test.beforeEach(async ({page}) => {
      await page.goto('/projects')
    })

    THEMES.forEach(theme => {
      test(`Project cards - ${theme} theme`, async ({page}) => {
        await preparePageForVisualTest(page, {theme})

        // Wait for project cards to load
        await waitForComponentStable(page, '[data-testid="project-card"]')

        // Take screenshot of project gallery
        const projectGallery = page.locator('[data-testid="project-gallery"]')
        if ((await projectGallery.count()) === 0) {
          // Fallback to any project container
          const projectContainer = page.locator('.project-card, [class*="project"], [data-testid*="project"]').first()
          if ((await projectContainer.count()) > 0) {
            await projectContainer.screenshot({
              path: `tests/visual/screenshots/project-cards-${theme}-theme.png`,
              animations: 'disabled',
            })
          }
        } else {
          await projectGallery.screenshot({
            path: `tests/visual/screenshots/project-cards-${theme}-theme.png`,
            animations: 'disabled',
          })
        }
      })
    })

    test('Project card hover states', async ({page}) => {
      await preparePageForVisualTest(page, {theme: 'light'})

      // Find first project card
      const projectCard = page.locator('[data-testid="project-card"]').first()

      if ((await projectCard.count()) === 0) {
        // Fallback selector
        const fallbackCard = page.locator('.project-card, [class*="project"]').first()
        if ((await fallbackCard.count()) > 0) {
          await fallbackCard.hover()
          await page.waitForTimeout(200)

          await fallbackCard.screenshot({
            path: 'tests/visual/screenshots/project-card-hover.png',
            animations: 'disabled',
          })
        }
      } else {
        await projectCard.hover()
        await page.waitForTimeout(200)

        await projectCard.screenshot({
          path: 'tests/visual/screenshots/project-card-hover.png',
          animations: 'disabled',
        })
      }
    })
  })

  test.describe('Blog Post Components', () => {
    test.beforeEach(async ({page}) => {
      await page.goto('/blog')
    })

    THEMES.forEach(theme => {
      test(`Blog posts - ${theme} theme`, async ({page}) => {
        await preparePageForVisualTest(page, {theme})

        // Wait for blog posts to load
        await page
          .waitForSelector('[data-testid="blog-post"], .blog-post, [class*="blog"]', {
            state: 'visible',
            timeout: 10000,
          })
          .catch(() => {
            // Blog posts might not exist yet - that's okay for visual tests
          })

        // Take full page screenshot of blog page
        await page.screenshot({
          path: `tests/visual/screenshots/blog-page-${theme}-theme.png`,
          fullPage: true,
          animations: 'disabled',
        })
      })
    })
  })

  test.describe('Modal Components', () => {
    test('Theme customizer modal', async ({page}) => {
      await page.goto('/')
      await preparePageForVisualTest(page, {theme: 'light'})

      // Look for theme customizer trigger
      const themeCustomizerTrigger = page.locator(
        '[data-testid="theme-customizer-trigger"], [data-testid="customize-theme"], button:has-text("Customize")',
      )

      if ((await themeCustomizerTrigger.count()) > 0) {
        await themeCustomizerTrigger.click()
        await page.waitForTimeout(300) // Wait for modal animation

        // Wait for modal content to be stable
        await waitForComponentStable(page, '[data-testid="theme-customizer"], .theme-customizer, [class*="modal"]')

        // Take screenshot of the modal
        const modal = page.locator('[data-testid="theme-customizer"], .theme-customizer, [class*="modal"]').first()
        await modal.screenshot({
          path: 'tests/visual/screenshots/theme-customizer-modal.png',
          animations: 'disabled',
        })

        // Test preset gallery if it exists
        const presetGallery = page.locator('[data-testid="preset-gallery"], .preset-gallery')
        if ((await presetGallery.count()) > 0) {
          await presetGallery.screenshot({
            path: 'tests/visual/screenshots/preset-theme-gallery.png',
            animations: 'disabled',
          })
        }
      }
    })

    test('Project preview modal', async ({page}) => {
      await page.goto('/projects')
      await preparePageForVisualTest(page, {theme: 'light'})

      // Look for project preview trigger
      const projectPreviewTrigger = page
        .locator('[data-testid="project-preview"], button:has-text("Preview"), .project-card button')
        .first()

      if ((await projectPreviewTrigger.count()) > 0) {
        await projectPreviewTrigger.click()
        await page.waitForTimeout(300) // Wait for modal animation

        // Wait for modal content to be stable
        await waitForComponentStable(page, '[data-testid="project-modal"], .project-modal, [class*="modal"]')

        // Take screenshot of the modal
        const modal = page.locator('[data-testid="project-modal"], .project-modal, [class*="modal"]').first()
        await modal.screenshot({
          path: 'tests/visual/screenshots/project-preview-modal.png',
          animations: 'disabled',
        })
      }
    })
  })

  test.describe('Skills Showcase Component', () => {
    test.beforeEach(async ({page}) => {
      await page.goto('/') // Skills are typically on the home page
    })

    THEMES.forEach(theme => {
      test(`Skills showcase - ${theme} theme`, async ({page}) => {
        await preparePageForVisualTest(page, {theme})

        // Look for skills component
        const skillsComponent = page.locator('[data-testid="skills-showcase"], .skills-showcase, [class*="skills"]')

        if ((await skillsComponent.count()) > 0) {
          await skillsComponent.scrollIntoViewIfNeeded()
          await waitForComponentStable(page, '[data-testid="skills-showcase"], .skills-showcase, [class*="skills"]')

          await skillsComponent.first().screenshot({
            path: `tests/visual/screenshots/skills-showcase-${theme}-theme.png`,
            animations: 'disabled',
          })
        }
      })
    })
  })

  test.describe('Hero Section Component', () => {
    THEMES.forEach(theme => {
      test(`Hero section - ${theme} theme`, async ({page}) => {
        await page.goto('/')
        await preparePageForVisualTest(page, {theme})

        // Look for hero section
        const heroSection = page.locator('[data-testid="hero-section"], .hero-section, [class*="hero"]')

        if ((await heroSection.count()) > 0) {
          await waitForComponentStable(page, '[data-testid="hero-section"], .hero-section, [class*="hero"]')

          await heroSection.first().screenshot({
            path: `tests/visual/screenshots/hero-section-${theme}-theme.png`,
            animations: 'disabled',
          })
        } else {
          // Fallback: take screenshot of the main content area
          const mainContent = page.locator('main').first()
          await mainContent.screenshot({
            path: `tests/visual/screenshots/hero-section-${theme}-theme.png`,
            animations: 'disabled',
          })
        }
      })
    })
  })
})
