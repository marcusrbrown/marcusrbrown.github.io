import AxeBuilder from '@axe-core/playwright'
import {expect, test, type Page} from '@playwright/test'

async function setThemeMode(page: Page, mode: 'light' | 'dark'): Promise<void> {
  await page.addInitScript(themeMode => {
    localStorage.removeItem('mrbro-dev-custom-theme')
    localStorage.setItem('mrbro-dev-theme-mode', JSON.stringify(themeMode))
  }, mode)
}

async function getColorContrastViolations(page: Page) {
  const results = await new AxeBuilder({page}).withRules(['color-contrast']).analyze()
  return results.violations.filter(violation => violation.id === 'color-contrast')
}

test.describe('Color contrast regressions', () => {
  test('home page has no color-contrast violations in light theme', async ({page}) => {
    await setThemeMode(page, 'light')
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const violations = await getColorContrastViolations(page)
    expect(violations).toEqual([])
  })

  test('home page has no color-contrast violations in dark theme', async ({page}) => {
    await setThemeMode(page, 'dark')
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const violations = await getColorContrastViolations(page)
    expect(violations).toEqual([])
  })

  test('projects page has no contrast violations in dark theme', async ({page}) => {
    // Projects render from a committed build-time snapshot — no runtime GitHub
    // API call, so there is no error/rate-limit fallback to audit. This checks
    // the real rendered projects surface (gallery or empty state) for contrast.
    await setThemeMode(page, 'dark')
    await page.goto('/projects')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', {name: 'All Projects'})).toBeVisible()

    const violations = await getColorContrastViolations(page)
    expect(violations).toEqual([])
  })
})
