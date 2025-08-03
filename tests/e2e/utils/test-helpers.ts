import type {Page} from '@playwright/test'
import process from 'node:process'

/**
 * Utility functions for E2E tests
 * Provides reusable test utilities and helpers
 */

/**
 * Wait for network to be idle with custom timeout
 */
export async function waitForNetworkIdle(page: Page, timeout = 5000): Promise<void> {
  await page.waitForLoadState('networkidle', {timeout})
}

/**
 * Set viewport to specific size with error handling
 */
export async function setViewportSafely(page: Page, size: {width: number; height: number}): Promise<void> {
  try {
    await page.setViewportSize(size)
    // Small delay to allow CSS to adjust
    await page.waitForTimeout(100)
  } catch (error) {
    console.warn(`Failed to set viewport to ${size.width}x${size.height}:`, error)
  }
}

/**
 * Check if element exists and is visible
 */
export async function isElementVisibleSafely(page: Page, selector: string): Promise<boolean> {
  try {
    const element = page.locator(selector)
    const isVisible = await element.isVisible()
    return isVisible
  } catch {
    return false
  }
}

/**
 * Get computed style property safely
 */
export async function getComputedStyleProperty(page: Page, selector: string, property: string): Promise<string | null> {
  try {
    return await page.evaluate(
      ({selector, property}) => {
        const element = document.querySelector(selector)
        if (!element) return null
        return window.getComputedStyle(element).getPropertyValue(property)
      },
      {selector, property},
    )
  } catch {
    return null
  }
}

/**
 * Get CSS custom property value
 */
export async function getCSSCustomProperty(page: Page, propertyName: string): Promise<string | null> {
  try {
    return await page.evaluate(prop => {
      return getComputedStyle(document.documentElement).getPropertyValue(prop).trim()
    }, propertyName)
  } catch {
    return null
  }
}

/**
 * Wait for CSS transition to complete
 */
export async function waitForTransition(page: Page, duration = 300): Promise<void> {
  await page.waitForTimeout(duration)
}

/**
 * Check if theme is applied correctly
 */
export async function verifyThemeApplication(page: Page, expectedTheme: 'light' | 'dark' | 'system'): Promise<boolean> {
  try {
    const actualTheme = await page.getAttribute('html', 'data-theme')
    return actualTheme === expectedTheme
  } catch {
    return false
  }
}

/**
 * Take screenshot with timestamp
 */
export async function takeTimestampedScreenshot(page: Page, name: string): Promise<Uint8Array> {
  const timestamp = new Date().toISOString().replaceAll(/[:.]/g, '-')
  return await page.screenshot({
    path: `test-results/${name}-${timestamp}.png`,
    fullPage: true,
  })
}

/**
 * Check accessibility landmarks
 */
export async function checkAccessibilityLandmarks(page: Page): Promise<{
  hasHeader: boolean
  hasMain: boolean
  hasFooter: boolean
  hasNav: boolean
}> {
  const [hasHeader, hasMain, hasFooter, hasNav] = await Promise.all([
    isElementVisibleSafely(page, 'header'),
    isElementVisibleSafely(page, 'main'),
    isElementVisibleSafely(page, 'footer'),
    isElementVisibleSafely(page, 'nav'),
  ])

  return {hasHeader, hasMain, hasFooter, hasNav}
}

/**
 * Get element dimensions safely
 */
export async function getElementDimensions(
  page: Page,
  selector: string,
): Promise<{width: number; height: number} | null> {
  try {
    const element = page.locator(selector)
    const box = await element.boundingBox()
    return box ? {width: box.width, height: box.height} : null
  } catch {
    return null
  }
}

/**
 * Check if element meets minimum touch target size
 */
export async function checkTouchTargetSize(page: Page, selector: string, minSize = 44): Promise<boolean> {
  const dimensions = await getElementDimensions(page, selector)
  if (!dimensions) return false

  return dimensions.width >= minSize && dimensions.height >= minSize
}

/**
 * Wait for font to load
 */
export async function waitForFontsToLoad(page: Page): Promise<void> {
  await page.evaluate(async () => {
    return document.fonts.ready
  })
}

/**
 * Get all links in navigation
 */
export async function getNavigationLinks(page: Page): Promise<string[]> {
  try {
    const links = await page.locator('nav a').allTextContents()
    return links.filter(link => link.trim().length > 0)
  } catch {
    return []
  }
}

/**
 * Check if page has loading indicators
 */
export async function hasLoadingIndicators(page: Page): Promise<boolean> {
  const loadingSelectors = ['[data-testid="loading"]', '.loading', '.spinner', '[aria-label*="loading"]']

  for (const selector of loadingSelectors) {
    if (await isElementVisibleSafely(page, selector)) {
      return true
    }
  }

  return false
}

/**
 * Wait for all loading indicators to disappear
 */
export async function waitForLoadingToComplete(page: Page, timeout = 10000): Promise<void> {
  const startTime = Date.now()

  while (Date.now() - startTime < timeout) {
    if (!(await hasLoadingIndicators(page))) {
      return
    }
    await page.waitForTimeout(100)
  }
}

/**
 * Simulate slow network conditions
 */
export async function simulateSlowNetwork(page: Page): Promise<void> {
  await page.route('**/*', async route => {
    // Add delay to simulate slow network
    await new Promise(resolve => setTimeout(resolve, 100))
    await route.continue()
  })
}

/**
 * Check for console errors
 */
export async function getConsoleErrors(page: Page): Promise<string[]> {
  const errors: string[] = []

  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text())
    }
  })

  return errors
}

/**
 * Mock GitHub API responses for testing
 */
export async function mockGitHubAPI(
  page: Page,
  mockData: {repositories?: unknown[]; issues?: unknown[]},
): Promise<void> {
  // Mock repositories endpoint
  if (mockData.repositories) {
    await page.route('**/api.github.com/users/*/repos*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockData.repositories),
      })
    })
  }

  // Mock issues endpoint (for blog posts)
  if (mockData.issues) {
    await page.route('**/api.github.com/repos/*/issues*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockData.issues),
      })
    })
  }
}

/**
 * Test helper to run a function with retries
 */
export async function retryOperation<T>(operation: () => Promise<T>, maxRetries = 3, delay = 1000): Promise<T> {
  let lastError: Error | undefined

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error as Error
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  throw lastError || new Error('Operation failed after retries')
}

/**
 * Generate test report data
 */
export function generateTestMetadata(testName: string): {
  testName: string
  timestamp: string
  userAgent: string
} {
  return {
    testName,
    timestamp: new Date().toISOString(),
    userAgent: process.env['USER_AGENT'] || 'unknown',
  }
}
