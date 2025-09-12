import process from 'node:process'

import {defineConfig, devices} from '@playwright/test'

/**
 * Playwright configuration for comprehensive E2E testing
 * Supports multi-browser testing across responsive breakpoints
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests/e2e',

  // Run tests in files in parallel
  fullyParallel: true,

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Opt out of parallel tests on CI
  workers: process.env.CI ? 1 : undefined,

  // Reporter to use
  reporter: [
    ['html'],
    ['json', {outputFile: 'test-results/results.json'}],
    // Add GitHub Actions reporter on CI
    process.env.CI ? ['github'] : ['list'],
  ],

  // Shared settings for all the projects below
  use: {
    // Base URL to use in actions like `await page.goto('/')`
    baseURL: process.env.CI ? process.env.PLAYWRIGHT_BASE_URL : 'http://localhost:4173',

    // Take screenshot on failure
    screenshot: 'only-on-failure',

    // Record video on failure
    video: 'retain-on-failure',

    // Collect trace when retrying the failed test
    trace: 'on-first-retry',
  },

  // Configure projects for major browsers and responsive breakpoints
  projects: [
    {
      name: 'chromium-desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: {width: 1440, height: 900},
      },
    },

    {
      name: 'firefox-desktop',
      use: {
        ...devices['Desktop Firefox'],
        viewport: {width: 1440, height: 900},
      },
    },

    {
      name: 'webkit-desktop',
      use: {
        ...devices['Desktop Safari'],
        viewport: {width: 1440, height: 900},
      },
    },

    // Mobile Chrome
    {
      name: 'mobile-chrome',
      use: {
        ...devices['Pixel 5'],
      },
    },

    // Mobile Safari
    {
      name: 'mobile-safari',
      use: {
        ...devices['iPhone 12'],
      },
    },

    // Tablet testing
    {
      name: 'tablet-chrome',
      use: {
        ...devices['iPad Pro'],
      },
    },

    // Custom responsive breakpoints for theme testing
    {
      name: 'responsive-small',
      use: {
        ...devices['Desktop Chrome'],
        viewport: {width: 375, height: 667}, // Mobile
      },
    },

    {
      name: 'responsive-medium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: {width: 768, height: 1024}, // Tablet
      },
    },

    {
      name: 'responsive-large',
      use: {
        ...devices['Desktop Chrome'],
        viewport: {width: 1024, height: 768}, // Desktop
      },
    },

    {
      name: 'responsive-xlarge',
      use: {
        ...devices['Desktop Chrome'],
        viewport: {width: 1440, height: 900}, // Large Desktop
      },
    },

    // Accessibility testing project
    {
      name: 'accessibility',
      testDir: './tests/accessibility',
    },

    // Visual regression testing project
    {
      name: 'visual-tests',
      testDir: './tests/visual',
      use: {
        ...devices['Desktop Chrome'],
        viewport: {width: 1440, height: 900},
        // Visual tests need consistent rendering
        screenshot: 'on',
        video: 'off',
        trace: 'retain-on-failure',
      },
      // Visual comparison settings
      expect: {
        // Optimized timeout for CI performance
        timeout: process.env.CI ? 7500 : 5000,

        // Visual comparison settings optimized for cross-platform consistency
        toMatchSnapshot: {
          // Higher threshold for visual tests to handle cross-platform rendering differences
          threshold: 0.25,

          // Maximum different pixels allowed (helps with font rendering differences)
          maxDiffPixels: 2000,
        },
      },
    },
  ],

  // Run local dev server before starting the tests
  webServer: {
    command: 'pnpm preview',
    port: 4173,
    reuseExistingServer: !process.env.CI,
  },
})
