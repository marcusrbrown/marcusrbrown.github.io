/**
 * Baseline screenshot generation for all theme variations
 * Generates visual regression baselines for light, dark, and custom themes
 */

import {test} from '@playwright/test'

import {preparePageForVisualTest, setThemeMode, waitForComponentStable, type ThemeMode} from './utils'

const THEME_VARIATIONS: ThemeMode[] = ['light', 'dark', 'system']

// Custom theme configurations for testing
const CUSTOM_THEME_PRESETS = [
  {
    name: 'high-contrast',
    colors: {
      primary: '#ff0000',
      secondary: '#00ff00',
      accent: '#0000ff',
      background: '#ffffff',
      surface: '#f0f0f0',
      text: '#000000',
    },
  },
  {
    name: 'dark-blue',
    colors: {
      primary: '#1e3a8a',
      secondary: '#3b82f6',
      accent: '#60a5fa',
      background: '#1e1e1e',
      surface: '#2a2a2a',
      text: '#ffffff',
    },
  },
]

test.describe('Theme Baseline Screenshots', () => {
  test.describe('Page-Level Theme Baselines', () => {
    const pages = [
      {path: '/', name: 'home'},
      {path: '/about', name: 'about'},
      {path: '/projects', name: 'projects'},
      {path: '/blog', name: 'blog'},
    ]

    THEME_VARIATIONS.forEach(theme => {
      pages.forEach(({path, name}) => {
        test(`${name} page - ${theme} theme baseline`, async ({page}) => {
          await page.goto(path)
          await preparePageForVisualTest(page, {theme})

          // Wait for page content to load
          await page.waitForLoadState('networkidle')
          await page.waitForTimeout(1000) // Additional wait for any lazy loading

          // Take full page screenshot
          await page.screenshot({
            path: `tests/visual/screenshots/baseline-${name}-page-${theme}-theme.png`,
            fullPage: true,
            animations: 'disabled',
          })
        })
      })
    })
  })

  test.describe('Component-Level Theme Baselines', () => {
    const components = [
      {
        selector: 'header.header',
        name: 'header',
        page: '/',
      },
      {
        selector: 'footer.footer',
        name: 'footer',
        page: '/',
        scrollIntoView: true,
      },
      {
        selector: '#hero.hero-section',
        name: 'hero-section',
        page: '/',
      },
      {
        selector: '#skills.skills-showcase',
        name: 'skills-showcase',
        page: '/',
        scrollIntoView: true,
      },
      {
        selector: '.project-gallery',
        name: 'project-gallery',
        page: '/projects',
      },
      {
        selector: '.project-card',
        name: 'project-card',
        page: '/projects',
        takeFirst: true,
      },
    ]

    THEME_VARIATIONS.forEach(theme => {
      components.forEach(({selector, name, page: pagePath, scrollIntoView, takeFirst}) => {
        test(`${name} component - ${theme} theme baseline`, async ({page}) => {
          await page.goto(pagePath)
          await preparePageForVisualTest(page, {theme})

          // Wait for component to be available
          const componentLocator = takeFirst ? page.locator(selector).first() : page.locator(selector)

          // Check if component exists
          const componentCount = await componentLocator.count()
          if (componentCount === 0) {
            // Skip if component doesn't exist on this page
            test.skip(true, `Component ${name} not found on ${pagePath}`)
            return
          }

          if (scrollIntoView) {
            await componentLocator.scrollIntoViewIfNeeded()
          }

          await waitForComponentStable(page, selector)

          // Take component screenshot
          await componentLocator.screenshot({
            path: `tests/visual/screenshots/baseline-${name}-${theme}-theme.png`,
            animations: 'disabled',
          })
        })
      })
    })
  })

  test.describe('Responsive Theme Baselines', () => {
    const breakpoints = [
      {name: 'mobile', width: 375, height: 667},
      {name: 'tablet', width: 768, height: 1024},
      {name: 'desktop', width: 1024, height: 768},
      {name: 'large-desktop', width: 1440, height: 900},
    ]

    THEME_VARIATIONS.forEach(theme => {
      breakpoints.forEach(({name, width, height}) => {
        test(`Home page - ${theme} theme - ${name} baseline`, async ({page}) => {
          await page.setViewportSize({width, height})
          await page.goto('/')
          await preparePageForVisualTest(page, {theme})

          // Wait for responsive layout to settle
          await page.waitForTimeout(500)

          // Take full page screenshot
          await page.screenshot({
            path: `tests/visual/screenshots/baseline-home-${theme}-${name}.png`,
            fullPage: true,
            animations: 'disabled',
          })
        })
      })
    })
  })

  test.describe('Custom Theme Baselines', () => {
    CUSTOM_THEME_PRESETS.forEach(({name: presetName, colors}) => {
      test(`Custom theme baseline - ${presetName}`, async ({page}) => {
        await page.goto('/')

        // Apply custom theme via JavaScript
        await page.evaluate(themeColors => {
          // Set custom theme colors
          const root = document.documentElement
          Object.entries(themeColors).forEach(([key, value]) => {
            root.style.setProperty(`--color-${key}`, value)
          })

          // Set theme mode to custom
          document.documentElement.dataset['theme'] = 'custom'
          localStorage.setItem('theme-mode', 'custom')
          localStorage.setItem('custom-theme', JSON.stringify(themeColors))
        }, colors)

        await preparePageForVisualTest(page, {theme: 'light', waitForContent: true})

        // Take full page screenshot
        await page.screenshot({
          path: `tests/visual/screenshots/baseline-custom-theme-${presetName}.png`,
          fullPage: true,
          animations: 'disabled',
        })

        // Also capture key components with the custom theme
        const keyComponents = [
          'header.header, header[role="banner"], nav + header, header:first-of-type',
          '[data-testid="hero-section"], .hero-section, [class*="hero"], main > section:first-child',
        ]

        for (const selector of keyComponents) {
          const component = page.locator(selector).first()
          if ((await component.count()) > 0) {
            const componentName = selector.includes('header') ? 'header' : 'hero'
            await component.screenshot({
              path: `tests/visual/screenshots/baseline-${componentName}-custom-${presetName}.png`,
              animations: 'disabled',
            })
          }
        }
      })
    })
  })

  test.describe('Theme Transition Baselines', () => {
    test('Theme switching transitions', async ({page}) => {
      await page.goto('/')

      // Start with light theme
      await preparePageForVisualTest(page, {theme: 'light'})

      // Capture initial state
      await page.screenshot({
        path: 'tests/visual/screenshots/baseline-theme-transition-light-start.png',
        fullPage: true,
        animations: 'disabled',
      })

      // Switch to dark theme
      await setThemeMode(page, 'dark')
      await page.waitForTimeout(300) // Wait for theme transition

      // Capture dark theme state
      await page.screenshot({
        path: 'tests/visual/screenshots/baseline-theme-transition-dark-end.png',
        fullPage: true,
        animations: 'disabled',
      })

      // Test system theme if available
      await setThemeMode(page, 'system')
      await page.waitForTimeout(300)

      await page.screenshot({
        path: 'tests/visual/screenshots/baseline-theme-transition-system.png',
        fullPage: true,
        animations: 'disabled',
      })
    })
  })

  test.describe('Interactive State Baselines', () => {
    test('Button and link hover states - light theme', async ({page}) => {
      await page.goto('/')
      await preparePageForVisualTest(page, {theme: 'light'})

      // Find and hover over interactive elements
      const interactiveElements = [
        '[data-testid="theme-toggle"]',
        'nav a:first-child',
        'button:first-of-type',
        '.btn, .button, [class*="button"]',
      ]

      for (const selector of interactiveElements) {
        const element = page.locator(selector).first()
        if ((await element.count()) > 0) {
          await element.hover()
          await page.waitForTimeout(100)

          const selectorName = selector.replaceAll(/\W/g, '-')
          await element.screenshot({
            path: `tests/visual/screenshots/baseline-hover-${selectorName}-light.png`,
            animations: 'disabled',
          })
        }
      }
    })

    test('Focus states - light theme', async ({page}) => {
      await page.goto('/')
      await preparePageForVisualTest(page, {theme: 'light'})

      // Test keyboard focus states
      const focusableElements = [
        '[data-testid="theme-toggle"]',
        'nav a:first-child',
        'button:first-of-type',
        'input:first-of-type',
      ]

      for (const selector of focusableElements) {
        const element = page.locator(selector).first()
        if ((await element.count()) > 0) {
          await element.focus()
          await page.waitForTimeout(100)

          const selectorName = selector.replaceAll(/\W/g, '-')
          await element.screenshot({
            path: `tests/visual/screenshots/baseline-focus-${selectorName}-light.png`,
            animations: 'disabled',
          })
        }
      }
    })
  })
})
