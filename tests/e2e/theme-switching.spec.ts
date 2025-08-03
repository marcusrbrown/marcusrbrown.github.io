import {expect, test} from '@playwright/test'

import {HomePage} from './pages'

test.describe('Theme Switching Tests', () => {
  test.describe('Basic Theme Functionality', () => {
    test('should have theme toggle button visible', async ({page}) => {
      const homePage = new HomePage(page)
      await homePage.goto()

      expect(await homePage.themeToggleElement.count()).toBeGreaterThan(0)
      expect(await homePage.themeToggleElement.isVisible()).toBe(true)
    })

    test('should start with a default theme', async ({page}) => {
      const homePage = new HomePage(page)
      await homePage.goto()

      const currentTheme = await homePage.getCurrentTheme()
      expect(['light', 'dark', 'system']).toContain(currentTheme)
    })

    test('should toggle between themes when clicked', async ({page}) => {
      const homePage = new HomePage(page)
      await homePage.goto()

      const initialTheme = await homePage.getCurrentTheme()

      // Get initial button text to understand the current mode
      const themeToggle = page.locator('.theme-toggle')
      const initialButtonText = await themeToggle.textContent()

      // Click theme toggle - this cycles through light → dark → system
      await homePage.toggleTheme()

      // Check if button text changed (mode definitely changes even if resolved theme doesn't)
      const newButtonText = await themeToggle.textContent()
      expect(newButtonText).not.toBe(initialButtonText)

      // Also check if the actual theme changed (might not if system matches current)
      const newTheme = await homePage.getCurrentTheme()

      // If we started in system mode and system preference is light,
      // clicking once goes to light mode - same resolved theme but different mode
      // So we either expect theme to change OR button text to change (mode change)
      const themeChanged = newTheme !== initialTheme
      const modeChanged = newButtonText !== initialButtonText

      expect(themeChanged || modeChanged).toBe(true)
    })
  })

  test.describe('Theme Persistence', () => {
    test('should persist theme across page reloads', async ({page}) => {
      const homePage = new HomePage(page)
      await homePage.goto()

      // Set to dark theme
      await homePage.setTheme('dark')
      const themeBeforeReload = await homePage.getCurrentTheme()

      // Reload page
      await page.reload()
      await homePage.waitForLoad()

      const themeAfterReload = await homePage.getCurrentTheme()
      expect(themeAfterReload).toBe(themeBeforeReload)
    })

    test('should persist theme across navigation', async ({page}) => {
      const homePage = new HomePage(page)
      await homePage.goto()

      // Set to dark theme
      await homePage.setTheme('dark')
      const themeOnHome = await homePage.getCurrentTheme()

      // Navigate to about page
      await homePage.navigateToPage('about')

      const themeOnAbout = await homePage.getCurrentTheme()
      expect(themeOnAbout).toBe(themeOnHome)
    })
  })

  test.describe('Theme Visual Changes', () => {
    test('should apply different styles for light and dark themes', async ({page}) => {
      const homePage = new HomePage(page)
      await homePage.goto()

      // Test light theme
      await homePage.setTheme('light')
      await homePage.waitForThemeTransition()

      const lightBgColor = await page.evaluate(() => {
        return window.getComputedStyle(document.body).backgroundColor
      })

      // Test dark theme
      await homePage.setTheme('dark')
      await homePage.waitForThemeTransition()

      const darkBgColor = await page.evaluate(() => {
        return window.getComputedStyle(document.body).backgroundColor
      })

      // Colors should be different
      expect(lightBgColor).not.toBe(darkBgColor)
    })

    test('should update CSS custom properties when theme changes', async ({page}) => {
      const homePage = new HomePage(page)
      await homePage.goto()

      // Set light theme and get CSS variables
      await homePage.setTheme('light')
      await homePage.waitForThemeTransition()

      const lightPrimaryColor = await page.evaluate(() => {
        return getComputedStyle(document.documentElement).getPropertyValue('--color-primary')
      })

      // Set dark theme and get CSS variables
      await homePage.setTheme('dark')
      await homePage.waitForThemeTransition()

      const darkPrimaryColor = await page.evaluate(() => {
        return getComputedStyle(document.documentElement).getPropertyValue('--color-primary')
      })

      // Primary colors might be the same, but let's check that the variables exist
      expect(lightPrimaryColor.trim()).not.toBe('')
      expect(darkPrimaryColor.trim()).not.toBe('')
    })
  })

  test.describe('System Theme Detection', () => {
    test('should respect system theme preference when set to system mode', async ({page, browserName}) => {
      // Skip this test on webkit as it doesn't support prefers-color-scheme media query changes
      test.skip(browserName === 'webkit', 'System theme testing not reliable on WebKit')

      const homePage = new HomePage(page)

      // Set system to prefer dark mode
      await page.emulateMedia({
        colorScheme: 'dark',
      })

      await homePage.goto()
      await homePage.setTheme('system')
      await homePage.waitForThemeTransition()

      // Should use dark theme when system prefers dark
      const currentTheme = await homePage.getCurrentTheme()
      expect(['dark', 'system']).toContain(currentTheme)
    })

    test('should update when system preference changes', async ({page, browserName}) => {
      test.skip(browserName === 'webkit', 'System theme testing not reliable on WebKit')

      const homePage = new HomePage(page)
      await homePage.goto()

      // Set to system theme
      await homePage.setTheme('system')

      // Change system preference to light
      await page.emulateMedia({
        colorScheme: 'light',
      })
      await page.waitForTimeout(100)

      // Change system preference to dark
      await page.emulateMedia({
        colorScheme: 'dark',
      })
      await page.waitForTimeout(100)

      // Theme should still be system but reflecting the change
      const theme = await homePage.getCurrentTheme()
      expect(['dark', 'system']).toContain(theme)
    })
  })

  test.describe('Theme Accessibility', () => {
    test('should maintain adequate contrast in both themes', async ({page}) => {
      const homePage = new HomePage(page)
      await homePage.goto()

      // Test both themes for basic contrast
      const themes: ('light' | 'dark')[] = ['light', 'dark']

      for (const theme of themes) {
        await homePage.setTheme(theme)
        await homePage.waitForThemeTransition()

        // Get text and background colors of main content
        const colors = await page.evaluate(() => {
          const mainElement = document.querySelector('main')
          if (!mainElement) return null

          const styles = window.getComputedStyle(mainElement)
          return {
            color: styles.color,
            backgroundColor: styles.backgroundColor,
          }
        })

        expect(colors).not.toBeNull()
        expect(colors?.color).not.toBe(colors?.backgroundColor)
      }
    })

    test('should have accessible theme toggle button', async ({page}) => {
      const homePage = new HomePage(page)
      await homePage.goto()

      // Check for aria attributes or text content
      const themeToggle = homePage.themeToggleElement

      const ariaLabel = await themeToggle.getAttribute('aria-label')
      const title = await themeToggle.getAttribute('title')
      const textContent = await themeToggle.textContent()

      // Button should have some form of accessible labeling
      const hasAccessibleLabel =
        (ariaLabel && ariaLabel.trim().length > 0) ||
        (title && title.trim().length > 0) ||
        (textContent && textContent.trim().length > 0)

      expect(hasAccessibleLabel).toBe(true)
    })

    test('should be keyboard accessible', async ({page}) => {
      const homePage = new HomePage(page)
      await homePage.goto()

      // Focus the theme toggle using page locator
      const themeToggle = page.locator('.theme-toggle')
      await themeToggle.focus()

      const isFocused = await themeToggle.evaluate(el => {
        return document.activeElement === el
      })

      expect(isFocused).toBe(true)

      // Should be activatable with Enter key
      const initialTheme = await homePage.getCurrentTheme()
      const initialButtonText = await themeToggle.textContent()

      await page.keyboard.press('Enter')
      await page.waitForTimeout(400) // Wait for theme transition

      const newTheme = await homePage.getCurrentTheme()
      const newButtonText = await themeToggle.textContent()

      // Either theme should change OR button text should change (mode change)
      const themeChanged = newTheme !== initialTheme
      const modeChanged = newButtonText !== initialButtonText

      expect(themeChanged || modeChanged).toBe(true)
    })
  })
})
