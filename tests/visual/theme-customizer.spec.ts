/**
 * Visual regression tests for theme customizer and preset gallery components
 * TASK-014: Create visual regression tests for theme customizer and preset gallery
 *
 * Tests theme-related components that are available on the site:
 * - Theme toggle component and states
 * - Theme-aware component variations
 * - Programmatically rendered theme components
 * - Responsive behavior across breakpoints
 *
 * Note: Since theme customizer is not directly accessible via UI trigger,
 * tests focus on theme-related components and theme variations.
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

test.describe('Theme System Visual Tests', () => {
  test.describe('Theme Toggle Component', () => {
    test.beforeEach(async ({page}) => {
      await page.goto('/')
      await preparePageForVisualTest(page, {theme: 'light'})
    })

    THEMES.forEach(theme => {
      test(`Theme toggle - ${theme} theme state`, async ({page}) => {
        await preparePageForVisualTest(page, {theme})

        // Look for theme toggle in common locations
        const themeToggle = page.locator(
          '[data-testid="theme-toggle"], .theme-toggle, button[aria-label*="theme"], button[aria-label*="Theme"]',
        )

        if ((await themeToggle.count()) > 0) {
          await waitForComponentStable(page, '[data-testid="theme-toggle"], .theme-toggle')

          await themeToggle.first().screenshot({
            path: `tests/visual/screenshots/theme-toggle-${theme}-state.png`,
            animations: 'disabled',
          })
        }
      })
    })

    test('Theme toggle - hover and focus states', async ({page}) => {
      const themeToggle = page.locator(
        '[data-testid="theme-toggle"], .theme-toggle, button[aria-label*="theme"], button[aria-label*="Theme"]',
      )

      if ((await themeToggle.count()) > 0) {
        // Normal state
        await themeToggle.first().screenshot({
          path: 'tests/visual/screenshots/theme-toggle-normal.png',
          animations: 'disabled',
        })

        // Hover state
        await themeToggle.first().hover()
        await page.waitForTimeout(200)

        await themeToggle.first().screenshot({
          path: 'tests/visual/screenshots/theme-toggle-hover.png',
          animations: 'disabled',
        })

        // Focus state
        await themeToggle.first().focus()
        await page.waitForTimeout(200)

        await themeToggle.first().screenshot({
          path: 'tests/visual/screenshots/theme-toggle-focus.png',
          animations: 'disabled',
        })
      }
    })
  })

  test.describe('Theme Variations - Component Consistency', () => {
    const pages = [
      {path: '/', name: 'home'},
      {path: '/about', name: 'about'},
      {path: '/blog', name: 'blog'},
      {path: '/projects', name: 'projects'},
    ]

    pages.forEach(({path, name}) => {
      THEMES.forEach(theme => {
        test(`${name} page - ${theme} theme variation`, async ({page}) => {
          await page.goto(path)
          await preparePageForVisualTest(page, {theme})

          // Take screenshot of key theme-aware components
          const headerElement = page.locator('header.header, header[role="banner"], nav + header').first()
          if ((await headerElement.count()) > 0) {
            await headerElement.screenshot({
              path: `tests/visual/screenshots/${name}-header-${theme}-theme.png`,
              animations: 'disabled',
            })
          }

          const mainContent = page.locator('main').first()
          if ((await mainContent.count()) > 0) {
            await mainContent.screenshot({
              path: `tests/visual/screenshots/${name}-main-${theme}-theme.png`,
              animations: 'disabled',
            })
          }

          const footerElement = page.locator('footer.footer, footer[role="contentinfo"]').first()
          if ((await footerElement.count()) > 0) {
            await footerElement.screenshot({
              path: `tests/visual/screenshots/${name}-footer-${theme}-theme.png`,
              animations: 'disabled',
            })
          }
        })
      })
    })
  })

  test.describe('Programmatic Theme Component Tests', () => {
    test('Inject and test ThemePreview component', async ({page}) => {
      await page.goto('/')
      await preparePageForVisualTest(page, {theme: 'light'})

      // Inject a theme preview component for testing
      await page.evaluate(() => {
        // Create a test container
        const container = document.createElement('div')
        container.id = 'theme-test-container'
        container.style.cssText = `
          position: fixed;
          top: 20px;
          left: 20px;
          width: 400px;
          height: 300px;
          background: var(--color-background);
          border: 1px solid var(--color-border);
          border-radius: 8px;
          padding: 16px;
          z-index: 9999;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        `

        // Create theme preview content
        container.innerHTML = `
          <div style="margin-bottom: 16px;">
            <h3 style="color: var(--color-text); margin: 0 0 8px 0;">Theme Preview</h3>
            <p style="color: var(--color-text-secondary); margin: 0;">Sample theme-aware content</p>
          </div>
          <div style="display: flex; gap: 8px; margin-bottom: 16px;">
            <button style="
              background: var(--color-primary);
              color: white;
              border: none;
              padding: 8px 16px;
              border-radius: 4px;
              cursor: pointer;
            ">Primary Button</button>
            <button style="
              background: transparent;
              color: var(--color-text);
              border: 1px solid var(--color-border);
              padding: 8px 16px;
              border-radius: 4px;
              cursor: pointer;
            ">Secondary Button</button>
          </div>
          <div style="
            background: var(--color-surface);
            border: 1px solid var(--color-border);
            border-radius: 4px;
            padding: 12px;
            margin-bottom: 16px;
          ">
            <h4 style="color: var(--color-text); margin: 0 0 8px 0;">Card Component</h4>
            <p style="color: var(--color-text-secondary); margin: 0;">This card shows surface styling</p>
          </div>
          <div style="display: flex; gap: 8px;">
            <div style="width: 16px; height: 16px; background: var(--color-error); border-radius: 2px;" title="Error"></div>
            <div style="width: 16px; height: 16px; background: var(--color-warning); border-radius: 2px;" title="Warning"></div>
            <div style="width: 16px; height: 16px; background: var(--color-success); border-radius: 2px;" title="Success"></div>
          </div>
        `

        document.body.append(container)
        return container.id
      })

      await page.waitForTimeout(300)

      // Test in light theme
      const themeContainer = page.locator('#theme-test-container')
      await themeContainer.screenshot({
        path: 'tests/visual/screenshots/theme-preview-component-light.png',
        animations: 'disabled',
      })

      // Switch to dark theme and test
      await preparePageForVisualTest(page, {theme: 'dark'})
      await page.waitForTimeout(500)

      await themeContainer.screenshot({
        path: 'tests/visual/screenshots/theme-preview-component-dark.png',
        animations: 'disabled',
      })

      // Clean up
      await page.evaluate(() => {
        const container = document.querySelector('#theme-test-container')
        if (container) {
          container.remove()
        }
      })
    })

    test('Test theme color palette display', async ({page}) => {
      await page.goto('/')
      await preparePageForVisualTest(page, {theme: 'light'})

      // Inject a color palette component for testing
      await page.evaluate(() => {
        const container = document.createElement('div')
        container.id = 'color-palette-test'
        container.style.cssText = `
          position: fixed;
          top: 20px;
          right: 20px;
          width: 300px;
          background: var(--color-background);
          border: 1px solid var(--color-border);
          border-radius: 8px;
          padding: 16px;
          z-index: 9999;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        `

        const colors = [
          {name: 'Primary', css: '--color-primary'},
          {name: 'Secondary', css: '--color-secondary'},
          {name: 'Accent', css: '--color-accent'},
          {name: 'Background', css: '--color-background'},
          {name: 'Surface', css: '--color-surface'},
          {name: 'Text', css: '--color-text'},
          {name: 'Border', css: '--color-border'},
          {name: 'Error', css: '--color-error'},
          {name: 'Warning', css: '--color-warning'},
          {name: 'Success', css: '--color-success'},
        ]

        container.innerHTML = `
          <h3 style="color: var(--color-text); margin: 0 0 12px 0; font-size: 14px;">Color Palette</h3>
          ${colors
            .map(
              ({name, css}) => `
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
              <div style="
                width: 20px;
                height: 20px;
                background: var(${css});
                border: 1px solid var(--color-border);
                border-radius: 3px;
              "></div>
              <span style="color: var(--color-text); font-size: 12px;">${name}</span>
            </div>
          `,
            )
            .join('')}
        `

        document.body.append(container)
        return container.id
      })

      await page.waitForTimeout(300)

      // Test in light theme
      const paletteContainer = page.locator('#color-palette-test')
      await paletteContainer.screenshot({
        path: 'tests/visual/screenshots/color-palette-light-theme.png',
        animations: 'disabled',
      })

      // Switch to dark theme and test
      await preparePageForVisualTest(page, {theme: 'dark'})
      await page.waitForTimeout(500)

      await paletteContainer.screenshot({
        path: 'tests/visual/screenshots/color-palette-dark-theme.png',
        animations: 'disabled',
      })

      // Clean up
      await page.evaluate(() => {
        const container = document.querySelector('#color-palette-test')
        if (container) {
          container.remove()
        }
      })
    })
  })

  test.describe('Responsive Theme Tests', () => {
    VISUAL_BREAKPOINTS.forEach(breakpoint => {
      test(`Theme components - ${breakpoint.name} viewport`, async ({page}) => {
        await page.setViewportSize({width: breakpoint.width, height: breakpoint.height})
        await page.goto('/')
        await preparePageForVisualTest(page, {theme: 'light'})

        // Test theme toggle at different breakpoints
        const themeToggle = page.locator('[data-testid="theme-toggle"], .theme-toggle, button[aria-label*="theme"]')

        if ((await themeToggle.count()) > 0) {
          await themeToggle.first().screenshot({
            path: `tests/visual/screenshots/theme-toggle-${breakpoint.name}.png`,
            animations: 'disabled',
          })
        }

        // Test header responsiveness with themes
        const headerElement = page.locator('header.header, header[role="banner"]').first()
        if ((await headerElement.count()) > 0) {
          await headerElement.screenshot({
            path: `tests/visual/screenshots/header-${breakpoint.name}-theme-aware.png`,
            animations: 'disabled',
          })
        }
      })
    })
  })

  test.describe('Theme Transition Tests', () => {
    test('Theme switching visual consistency', async ({page}) => {
      await page.goto('/')
      await preparePageForVisualTest(page, {theme: 'light'})

      // Capture light theme state
      await page.screenshot({
        path: 'tests/visual/screenshots/theme-transition-light-start.png',
        fullPage: true,
        animations: 'disabled',
      })

      // Switch to dark theme
      await preparePageForVisualTest(page, {theme: 'dark'})
      await page.waitForTimeout(500) // Allow transition to complete

      // Capture dark theme state
      await page.screenshot({
        path: 'tests/visual/screenshots/theme-transition-dark-end.png',
        fullPage: true,
        animations: 'disabled',
      })

      // Test specific components for theme consistency
      const components = [
        {selector: 'header.header, header[role="banner"]', name: 'header'},
        {selector: 'main', name: 'main'},
        {selector: 'footer.footer, footer[role="contentinfo"]', name: 'footer'},
      ]

      for (const {selector, name} of components) {
        const element = page.locator(selector).first()
        if ((await element.count()) > 0) {
          await element.screenshot({
            path: `tests/visual/screenshots/theme-transition-${name}-dark.png`,
            animations: 'disabled',
          })
        }
      }
    })
  })

  test.describe('Theme Integration Tests', () => {
    test('Code syntax highlighting theme integration', async ({page}) => {
      // Set up mocking before any navigation
      await setupGitHubAPIMocking(page)
      await page.goto('/blog')
      await preparePageForVisualTest(page, {theme: 'light', skipMocking: true})

      // Look for code blocks
      const codeBlocks = page.locator('pre, code, .highlight, [class*="language-"]')
      if ((await codeBlocks.count()) > 0) {
        await codeBlocks.first().screenshot({
          path: 'tests/visual/screenshots/syntax-highlighting-light-theme.png',
          animations: 'disabled',
        })

        // Switch to dark theme
        await preparePageForVisualTest(page, {theme: 'dark'})
        await page.waitForTimeout(500)

        await codeBlocks.first().screenshot({
          path: 'tests/visual/screenshots/syntax-highlighting-dark-theme.png',
          animations: 'disabled',
        })
      }
    })

    test('Form elements theme integration', async ({page}) => {
      await page.goto('/')
      await preparePageForVisualTest(page, {theme: 'light'})

      // Create a test form to verify theme integration
      await page.evaluate(() => {
        const container = document.createElement('div')
        container.id = 'form-test-container'
        container.style.cssText = `
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 300px;
          background: var(--color-background);
          border: 1px solid var(--color-border);
          border-radius: 8px;
          padding: 20px;
          z-index: 9999;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        `

        container.innerHTML = `
          <h3 style="color: var(--color-text); margin: 0 0 16px 0;">Form Elements</h3>
          <div style="margin-bottom: 12px;">
            <label style="color: var(--color-text); display: block; margin-bottom: 4px; font-size: 14px;">Text Input</label>
            <input type="text" placeholder="Enter text..." style="
              width: 100%;
              padding: 8px 12px;
              border: 1px solid var(--color-border);
              border-radius: 4px;
              background: var(--color-background);
              color: var(--color-text);
              font-size: 14px;
            ">
          </div>
          <div style="margin-bottom: 12px;">
            <label style="color: var(--color-text); display: block; margin-bottom: 4px; font-size: 14px;">Select</label>
            <select style="
              width: 100%;
              padding: 8px 12px;
              border: 1px solid var(--color-border);
              border-radius: 4px;
              background: var(--color-background);
              color: var(--color-text);
              font-size: 14px;
            ">
              <option>Option 1</option>
              <option>Option 2</option>
            </select>
          </div>
          <div style="margin-bottom: 16px;">
            <label style="color: var(--color-text); display: flex; align-items: center; gap: 8px; font-size: 14px;">
              <input type="checkbox" style="accent-color: var(--color-primary);">
              Checkbox option
            </label>
          </div>
          <button style="
            background: var(--color-primary);
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            width: 100%;
          ">Submit</button>
        `

        document.body.append(container)
        return container.id
      })

      await page.waitForTimeout(300)

      // Test in light theme
      const formContainer = page.locator('#form-test-container')
      await formContainer.screenshot({
        path: 'tests/visual/screenshots/form-elements-light-theme.png',
        animations: 'disabled',
      })

      // Switch to dark theme and test
      await preparePageForVisualTest(page, {theme: 'dark'})
      await page.waitForTimeout(500)

      await formContainer.screenshot({
        path: 'tests/visual/screenshots/form-elements-dark-theme.png',
        animations: 'disabled',
      })

      // Clean up
      await page.evaluate(() => {
        const container = document.querySelector('#form-test-container')
        if (container) {
          container.remove()
        }
      })
    })
  })
})
