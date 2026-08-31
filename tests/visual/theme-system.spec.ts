/**
 * Visual regression tests for theme toggle and switching behavior.
 * Component-level theme variations are covered by components.spec.ts.
 */

import {test} from '@playwright/test'

import {preparePageForVisualTest, setThemeMode, waitForComponentStable, type ThemeMode} from './utils'

const THEMES: ThemeMode[] = ['light', 'dark']

test.describe('Theme System', () => {
  test.describe('Theme Toggle', () => {
    test.beforeEach(async ({page}) => {
      await page.goto('/')
      await preparePageForVisualTest(page, {theme: 'light'})
    })

    THEMES.forEach(theme => {
      test(`Toggle - ${theme} state`, async ({page}) => {
        await preparePageForVisualTest(page, {theme})

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
  })

  test.describe('Theme Transition', () => {
    test('Light to dark switching', async ({page}) => {
      await page.goto('/')
      await preparePageForVisualTest(page, {theme: 'light'})

      await page.screenshot({
        path: 'tests/visual/screenshots/theme-transition-light-start.png',
        fullPage: true,
        animations: 'disabled',
      })

      await setThemeMode(page, 'dark')
      await page.waitForTimeout(300)

      await page.screenshot({
        path: 'tests/visual/screenshots/theme-transition-dark-end.png',
        fullPage: true,
        animations: 'disabled',
      })
    })
  })
})
