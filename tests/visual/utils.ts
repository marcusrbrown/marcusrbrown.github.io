import type {Page, TestInfo} from '@playwright/test'

/**
 * Visual test thresholds for different test scenarios
 */
export const VISUAL_THRESHOLDS = {
  components: 0.08, // Stricter for isolated components
  pages: 0.12, // Standard for full pages
  responsive: 0.15, // More lenient for responsive breakpoints
  themes: 0.1, // Moderate for theme variations
} as const

/**
 * Get appropriate threshold for test type
 */
export function getThreshold(testType: keyof typeof VISUAL_THRESHOLDS): number {
  return VISUAL_THRESHOLDS[testType]
}

/**
 * Utility functions for visual regression testing
 * Provides consistent setup and helpers for screenshot comparisons
 */

/**
 * Theme modes available for visual testing
 */
export type ThemeMode = 'light' | 'dark' | 'system'

/**
 * Responsive breakpoints for visual testing
 */
export interface ResponsiveBreakpoint {
  name: string
  width: number
  height: number
  deviceScaleFactor?: number
  isMobile?: boolean
}

export const VISUAL_BREAKPOINTS: ResponsiveBreakpoint[] = [
  {
    name: 'mobile',
    width: 375,
    height: 667,
    deviceScaleFactor: 2,
    isMobile: true,
  },
  {
    name: 'tablet',
    width: 768,
    height: 1024,
    deviceScaleFactor: 2,
    isMobile: true,
  },
  {
    name: 'desktop',
    width: 1024,
    height: 768,
    deviceScaleFactor: 1,
  },
  {
    name: 'large-desktop',
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
  },
]

/**
 * Prepare page for consistent visual testing
 * - Sets theme mode
 * - Waits for content to load
 * - Disables animations
 * - Hides dynamic elements
 */
export async function preparePageForVisualTest(
  page: Page,
  options: {
    theme?: ThemeMode
    waitForContent?: boolean
    hideScrollbars?: boolean
  } = {},
): Promise<void> {
  const {theme = 'light', waitForContent = true, hideScrollbars = true} = options

  // Navigate to page if not already there
  if (page.url() === 'about:blank') {
    await page.goto('/')
  }

  // Set theme mode
  await setThemeMode(page, theme)

  // Wait for content to load
  if (waitForContent) {
    await page.waitForLoadState('networkidle')

    // Wait for any lazy-loaded content and theme to fully apply
    await page.waitForTimeout(1000)
  }

  // Wait an additional moment for theme CSS properties to be fully applied
  await page.waitForTimeout(300) // Disable animations for consistent screenshots
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
      }
    `,
  })

  // Hide scrollbars for consistent screenshots
  if (hideScrollbars) {
    await page.addStyleTag({
      content: `
        ::-webkit-scrollbar { display: none !important; }
        * { scrollbar-width: none !important; }
      `,
    })
  }

  // Hide focus outlines that might appear during automated testing
  await page.addStyleTag({
    content: `
      * { outline: none !important; }
    `,
  })
}

/**
 * Set theme mode on the page
 */
export async function setThemeMode(page: Page, theme: ThemeMode): Promise<void> {
  // Use the React theme system to properly set the theme
  await page.evaluate((themeMode: ThemeMode) => {
    // Try to access the theme context through React, but fallback to manual application
    const reactRoot = document.querySelector('#root')
    if (reactRoot && (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__) {
      // Try to find the theme context through React fiber (complex approach)
      try {
        // This is a complex approach - let's use a simpler method instead
      } catch {
        // Fallback to manual theme application
      }
    }

    // More reliable approach: manually apply the theme like the ThemeContext does
    const root = document.documentElement

    // Define theme colors (matching ThemeContext.tsx)
    const lightTheme = {
      primary: '#2563eb',
      secondary: '#64748b',
      accent: '#0ea5e9',
      background: '#ffffff',
      surface: '#f8fafc',
      text: '#0f172a',
      textSecondary: '#64748b',
      border: '#e2e8f0',
      error: '#dc2626',
      warning: '#d97706',
      success: '#16a34a',
    }

    const darkTheme = {
      primary: '#3b82f6',
      secondary: '#94a3b8',
      accent: '#0ea5e9',
      background: '#0f172a',
      surface: '#1e293b',
      text: '#f1f5f9',
      textSecondary: '#94a3b8',
      border: '#334155',
      error: '#ef4444',
      warning: '#f59e0b',
      success: '#22c55e',
    }

    // Determine which theme colors to use
    const colors = themeMode === 'dark' ? darkTheme : lightTheme

    // Apply CSS custom properties exactly like ThemeContext does
    root.style.setProperty('--color-primary', colors.primary)
    root.style.setProperty('--color-secondary', colors.secondary)
    root.style.setProperty('--color-accent', colors.accent)
    root.style.setProperty('--color-background', colors.background)
    root.style.setProperty('--color-surface', colors.surface)
    root.style.setProperty('--color-text', colors.text)
    root.style.setProperty('--color-text-secondary', colors.textSecondary)
    root.style.setProperty('--color-border', colors.border)
    root.style.setProperty('--color-error', colors.error)
    root.style.setProperty('--color-warning', colors.warning)
    root.style.setProperty('--color-success', colors.success)

    // Set the data-theme attribute
    root.dataset['theme'] = themeMode

    // Also save to localStorage so React picks it up
    localStorage.setItem('mrbro-dev-theme-mode', themeMode)

    // Trigger a storage event to notify React components
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'mrbro-dev-theme-mode',
        newValue: themeMode,
        storageArea: localStorage,
      }),
    )
  }, theme)

  // Wait longer for theme transition to complete and React to re-render
  await page.waitForTimeout(500)
}

/**
 * Generate screenshot name based on test context
 */
export function generateScreenshotName(
  testInfo: TestInfo,
  options: {
    theme?: ThemeMode
    breakpoint?: string
    component?: string
    suffix?: string
  } = {},
): string {
  const {theme, breakpoint, component, suffix} = options

  const parts = [testInfo.title.replaceAll(/\s+/g, '-').toLowerCase(), theme, breakpoint, component, suffix].filter(
    Boolean,
  )

  return `${parts.join('-')}.png`
}

/**
 * Take a full page screenshot with consistent options
 */
export async function takeVisualSnapshot(
  page: Page,
  testInfo: TestInfo,
  options: {
    theme?: ThemeMode
    breakpoint?: string
    component?: string
    suffix?: string
    fullPage?: boolean
    clip?: {x: number; y: number; width: number; height: number}
  } = {},
): Promise<void> {
  const {fullPage = true, clip} = options

  const screenshotName = generateScreenshotName(testInfo, options)

  await page.screenshot({
    path: `tests/visual/screenshots/${screenshotName}`,
    fullPage,
    clip,
    animations: 'disabled',
  })
}

/**
 * Wait for component to be stable and ready for visual testing
 */
export async function waitForComponentStable(page: Page, selector: string, timeout = 5000): Promise<void> {
  // Wait for element to be visible
  await page.waitForSelector(selector, {state: 'visible', timeout})

  // Wait for any potential loading states to complete
  await page.waitForFunction(
    sel => {
      const element = document.querySelector(sel)
      if (!element) return false

      // Check if element has any loading classes or attributes
      const htmlElement = element as HTMLElement
      const isLoading =
        element.classList.contains('loading') ||
        htmlElement.dataset['loading'] !== undefined ||
        element.querySelector('[data-loading]') !== null

      return !isLoading
    },
    selector,
    {timeout},
  )

  // Additional wait for any animations to settle
  await page.waitForTimeout(200)
}

/**
 * Hide dynamic elements that might cause visual test flakiness
 */
export async function hideDynamicElements(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      /* Hide elements that might change between runs */
      [data-testid="current-time"],
      .timestamp,
      .last-updated,
      .loading-spinner,
      .skeleton-loader {
        visibility: hidden !important;
      }
    `,
  })
}
