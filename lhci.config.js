// Lighthouse CI Configuration
// Performance testing with Core Web Vitals monitoring for mrbro.dev

export default {
  ci: {
    collect: {
      // URLs to audit - using localhost for CI builds
      url: [
        'http://localhost:4173/',
        'http://localhost:4173/about',
        'http://localhost:4173/blog',
        'http://localhost:4173/projects',
      ],
      // Build the project before auditing
      startServerCommand: 'pnpm run preview',
      startServerReadyPattern: 'Local:.*http://localhost:4173',
      startServerReadyTimeout: 30000,
      // Number of runs per URL for reliability
      numberOfRuns: 3,
      // Additional Lighthouse settings
      settings: {
        // Chrome flags for CI environment
        chromeFlags: '--no-sandbox --headless --disable-gpu --disable-dev-shm-usage',
        // Preset configuration for performance focus
        preset: 'desktop',
        // Skip certain audits that aren't relevant for our static site
        skipAudits: ['uses-http2', 'redirects-http', 'uses-long-cache-ttl'],
        // Emulate mobile and desktop
        emulatedFormFactor: 'desktop',
        throttling: {
          rttMs: 40,
          throughputKbps: 10240,
          cpuSlowdownMultiplier: 1,
          requestLatencyMs: 0,
          downloadThroughputKbps: 0,
          uploadThroughputKbps: 0,
        },
      },
    },
    upload: {
      // Store results in GitHub Actions artifacts
      target: 'filesystem',
      outputDir: './lhci-reports',
      // Report format
      reportFilenamePattern: '%%PATHNAME%%-%%DATETIME%%-report.%%EXTENSION%%',
    },
    assert: {
      // Performance budgets and thresholds
      assertions: {
        // Core Web Vitals - Desktop targets
        'largest-contentful-paint': ['error', {maxNumericValue: 2000}],
        'first-input-delay': ['error', {maxNumericValue: 50}],
        'cumulative-layout-shift': ['error', {maxNumericValue: 0.05}],

        // Additional performance metrics
        'first-contentful-paint': ['error', {maxNumericValue: 1800}],
        'speed-index': ['error', {maxNumericValue: 3400}],
        interactive: ['error', {maxNumericValue: 3800}],
        'total-blocking-time': ['error', {maxNumericValue: 200}],

        // Overall scores
        'categories:performance': ['error', {minScore: 0.95}],
        'categories:accessibility': ['error', {minScore: 0.95}],
        'categories:best-practices': ['error', {minScore: 0.9}],
        'categories:seo': ['error', {minScore: 0.95}],

        // Resource budgets
        'resource-summary:script:size': ['error', {maxNumericValue: 512000}], // 500KB JS
        'resource-summary:stylesheet:size': ['error', {maxNumericValue: 102400}], // 100KB CSS
        'resource-summary:total:size': ['error', {maxNumericValue: 2097152}], // 2MB total
        'resource-summary:image:size': ['error', {maxNumericValue: 1048576}], // 1MB images

        // Best practices
        'uses-text-compression': 'error',
        'unused-css-rules': 'off', // May have false positives with CSS-in-JS
        'unused-javascript': 'warn',
        'modern-image-formats': 'warn',
        'offscreen-images': 'warn',
      },
    },
    server: {
      // Optional: LHCI server configuration for historical data
      // Can be configured later for advanced tracking
    },
  },
}
