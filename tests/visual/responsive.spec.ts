/**
 * Responsive visual regression tests
 * Tests layout correctness at mobile and desktop breakpoints.
 * Theme-specific rendering is covered by components.spec.ts.
 */

import {test} from '@playwright/test'

import {preparePageForVisualTest, waitForComponentStable} from './utils'

const BREAKPOINTS = [
  {name: 'mobile', width: 375, height: 667},
  {name: 'desktop', width: 1440, height: 900},
] as const

const PAGES = [
  {path: '/', name: 'home'},
  {path: '/about', name: 'about'},
  {path: '/projects', name: 'projects'},
  {path: '/blog', name: 'blog'},
  {path: '/privacy', name: 'privacy'},
] as const

test.describe('Responsive Layout', () => {
  BREAKPOINTS.forEach(({name: bpName, width, height}) => {
    PAGES.forEach(({path, name: pageName}) => {
      test(`${pageName} - ${bpName} (${width}x${height})`, async ({page}) => {
        await page.setViewportSize({width, height})
        await page.goto(path)
        await preparePageForVisualTest(page, {theme: 'light'})

        await page.screenshot({
          path: `tests/visual/screenshots/responsive-${pageName}-${bpName}.png`,
          fullPage: true,
          animations: 'disabled',
        })
      })
    })
  })

  test('Navigation - mobile vs desktop', async ({page}) => {
    await page.goto('/')

    // Desktop navigation
    await page.setViewportSize({width: 1440, height: 900})
    await preparePageForVisualTest(page, {theme: 'light'})

    const header = page.locator('header.header').first()
    await waitForComponentStable(page, 'header.header')

    await header.screenshot({
      path: 'tests/visual/screenshots/navigation-desktop-expanded.png',
      animations: 'disabled',
    })

    // Mobile navigation (collapsed)
    await page.setViewportSize({width: 375, height: 667})
    await page.waitForTimeout(300)

    await header.screenshot({
      path: 'tests/visual/screenshots/navigation-mobile-collapsed.png',
      animations: 'disabled',
    })
  })
})
