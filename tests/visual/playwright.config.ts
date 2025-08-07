import process from 'node:process'

import {defineConfig} from '@playwright/test'

/**
 * Visual regression testing configuration for Playwright
 * Optimized for screenshot comparison and baseline generation
 * @see https://playwright.dev/docs/test-snapshots
 */
export default defineConfig({
  testDir: '.',

  // Enable parallel execution for faster visual testing
  fullyParallel: true,

  // Higher retry count for visual tests due to potential rendering variations
  retries: process.env['CI'] ? 3 : 1,

  // Single worker for consistent rendering
  workers: 1,

  // Optimized timeout for faster feedback (20s is sufficient for visual tests)
  timeout: 20000,

  // Configure separate output directories to avoid conflicts
  outputDir: '../../test-results/visual',

  // Reporter configuration for visual test results
  reporter: [
    ['html', {outputFolder: '../../playwright-report-visual'}],
    ['json', {outputFile: '../../test-results/visual-results.json'}],
    ...(process.env['CI'] ? [['github'] as const] : []),
  ],

  // Visual testing specific settings
  use: {
    // Base URL for visual tests
    baseURL: process.env['CI'] ? 'https://mrbro.dev' : 'http://localhost:4173',

    // Always take screenshots for visual tests
    screenshot: 'on',

    // Disable video for visual tests (screenshots are sufficient)
    video: 'off',

    // Enable trace for debugging visual test failures
    trace: 'retain-on-failure',
  },

  // Visual snapshot configuration
  // Expect configuration for visual tests
  expect: {
    // Global timeout for assertions
    timeout: 10000,

    toHaveScreenshot: {
      // Threshold configuration for different test scenarios
      threshold: 0.12, // Base threshold for most screenshots

      // Animation handling
      animations: 'disabled',

      // Caret (cursor) handling
      caret: 'hide',
    },
  },

  // Enhanced test configuration for visual regression
  metadata: {
    'visual-test-thresholds': {
      components: 0.08, // Stricter for isolated components
      pages: 0.12, // Standard for full pages
      responsive: 0.15, // More lenient for responsive breakpoints
      themes: 0.1, // Moderate for theme variations
    },
  },

  // Project configurations for different visual test scenarios
  projects: [
    // Desktop visual tests - Primary baseline
    {
      name: 'visual-desktop-chromium',
      use: {
        browserName: 'chromium',
        viewport: {width: 1440, height: 900},
        deviceScaleFactor: 1,
      },
    },

    // Mobile visual tests
    {
      name: 'visual-mobile-chromium',
      use: {
        browserName: 'chromium',
        viewport: {width: 375, height: 667},
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },

    // Tablet visual tests
    {
      name: 'visual-tablet-chromium',
      use: {
        browserName: 'chromium',
        viewport: {width: 768, height: 1024},
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },

    // Large desktop visual tests
    {
      name: 'visual-xlarge-chromium',
      use: {
        browserName: 'chromium',
        viewport: {width: 1920, height: 1080},
        deviceScaleFactor: 1,
      },
    },
  ],

  // Web server configuration (inherit from main config)
  webServer: process.env['CI']
    ? undefined
    : {
        command: 'pnpm preview',
        port: 4173,
        reuseExistingServer: true,
      },
})
