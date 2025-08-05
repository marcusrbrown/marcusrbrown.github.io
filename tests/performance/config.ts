/**
 * Performance test configuration for Core Web Vitals monitoring
 * Integrates with Lighthouse CI for comprehensive performance testing
 */

export interface PerformanceTestConfig {
  // Core Web Vitals thresholds
  coreWebVitals: {
    desktop: CoreWebVitalsThresholds
    mobile: CoreWebVitalsThresholds
  }
  // Performance budgets
  budgets: PerformanceBudgets
  // Test scenarios
  scenarios: PerformanceScenario[]
}

export interface CoreWebVitalsThresholds {
  // Largest Contentful Paint - measures loading performance
  lcp: number // milliseconds
  // First Input Delay - measures interactivity
  fid: number // milliseconds
  // Cumulative Layout Shift - measures visual stability
  cls: number // score
  // Additional performance metrics
  fcp: number // First Contentful Paint
  si: number // Speed Index
  tti: number // Time to Interactive
  tbt: number // Total Blocking Time
}

export interface PerformanceBudgets {
  // Resource size budgets
  javascript: number // bytes
  css: number // bytes
  images: number // bytes
  fonts: number // bytes
  total: number // bytes
  // Performance score budgets
  performanceScore: number // 0-1
  accessibilityScore: number // 0-1
  bestPracticesScore: number // 0-1
  seoScore: number // 0-1
}

export interface PerformanceScenario {
  name: string
  description: string
  url: string
  device: 'desktop' | 'mobile'
  network: 'fast' | 'slow' | 'offline'
  interactions?: PerformanceInteraction[]
}

export interface PerformanceInteraction {
  type: 'click' | 'scroll' | 'input' | 'navigation'
  selector?: string
  value?: string
  waitFor?: number
}

// Default performance configuration for mrbro.dev
export const defaultPerformanceConfig: PerformanceTestConfig = {
  coreWebVitals: {
    desktop: {
      lcp: 2000, // 2 seconds
      fid: 50, // 50 milliseconds
      cls: 0.05, // 0.05 score
      fcp: 1800, // 1.8 seconds
      si: 3400, // 3.4 seconds
      tti: 3800, // 3.8 seconds
      tbt: 200, // 200 milliseconds
    },
    mobile: {
      lcp: 2500, // 2.5 seconds
      fid: 100, // 100 milliseconds
      cls: 0.1, // 0.1 score
      fcp: 2200, // 2.2 seconds
      si: 4500, // 4.5 seconds
      tti: 5000, // 5 seconds
      tbt: 300, // 300 milliseconds
    },
  },
  budgets: {
    javascript: 512000, // 500KB
    css: 102400, // 100KB
    images: 1048576, // 1MB
    fonts: 204800, // 200KB
    total: 2097152, // 2MB
    performanceScore: 0.95, // 95%
    accessibilityScore: 0.95, // 95%
    bestPracticesScore: 0.9, // 90%
    seoScore: 0.95, // 95%
  },
  scenarios: [
    {
      name: 'Home Page Load',
      description: 'Initial page load performance for the landing page',
      url: '/',
      device: 'desktop',
      network: 'fast',
    },
    {
      name: 'Home Page Mobile',
      description: 'Mobile performance for the landing page',
      url: '/',
      device: 'mobile',
      network: 'fast',
    },
    {
      name: 'Theme Switch Performance',
      description: 'Performance impact of theme switching',
      url: '/',
      device: 'desktop',
      network: 'fast',
      interactions: [
        {
          type: 'click',
          selector: '[data-testid="theme-toggle"]',
          waitFor: 1000,
        },
      ],
    },
    {
      name: 'Project Gallery Load',
      description: 'Performance of projects page with images',
      url: '/projects',
      device: 'desktop',
      network: 'fast',
    },
    {
      name: 'Blog Page Performance',
      description: 'Blog page load with GitHub API content',
      url: '/blog',
      device: 'desktop',
      network: 'fast',
    },
    {
      name: 'About Page Performance',
      description: 'About page with career timeline and animations',
      url: '/about',
      device: 'desktop',
      network: 'fast',
    },
    {
      name: 'Slow Network Simulation',
      description: 'Home page performance on slow connection',
      url: '/',
      device: 'mobile',
      network: 'slow',
    },
  ],
}

// Performance test utilities
export const PerformanceTestUtils = {
  /**
   * Validate Core Web Vitals against thresholds
   */
  validateCoreWebVitals(results: LighthouseResults, thresholds: CoreWebVitalsThresholds): PerformanceValidationResult {
    const violations: PerformanceViolation[] = []
    const audits = results.audits

    const lcpAudit = audits['largest-contentful-paint']
    if (lcpAudit?.numericValue !== undefined && lcpAudit.numericValue > thresholds.lcp) {
      violations.push({
        metric: 'LCP',
        value: lcpAudit.numericValue,
        threshold: thresholds.lcp,
        message: `LCP ${lcpAudit.numericValue}ms exceeds threshold ${thresholds.lcp}ms`,
      })
    }

    const fidAudit = audits['first-input-delay']
    if (fidAudit?.numericValue !== undefined && fidAudit.numericValue > thresholds.fid) {
      violations.push({
        metric: 'FID',
        value: fidAudit.numericValue,
        threshold: thresholds.fid,
        message: `FID ${fidAudit.numericValue}ms exceeds threshold ${thresholds.fid}ms`,
      })
    }

    const clsAudit = audits['cumulative-layout-shift']
    if (clsAudit?.numericValue !== undefined && clsAudit.numericValue > thresholds.cls) {
      violations.push({
        metric: 'CLS',
        value: clsAudit.numericValue,
        threshold: thresholds.cls,
        message: `CLS ${clsAudit.numericValue} exceeds threshold ${thresholds.cls}`,
      })
    }

    return {
      passed: violations.length === 0,
      violations,
      summary: {
        lcp: audits['largest-contentful-paint']?.numericValue || 0,
        fid: audits['first-input-delay']?.numericValue || 0,
        cls: audits['cumulative-layout-shift']?.numericValue || 0,
      },
    }
  },

  /**
   * Generate performance report summary
   */
  generatePerformanceReport(results: LighthouseResults[], config: PerformanceTestConfig): PerformanceReport {
    const scenarios = results.map((result, index) => {
      const scenario = config.scenarios[index]
      if (!scenario) {
        throw new Error(`Missing scenario configuration for index ${index}`)
      }

      const validation = this.validateCoreWebVitals(
        result,
        scenario.device === 'mobile' ? config.coreWebVitals.mobile : config.coreWebVitals.desktop,
      )

      return {
        scenario: scenario.name,
        url: scenario.url,
        device: scenario.device,
        performance: {
          score: result.categories.performance.score * 100,
          lcp: result.audits['largest-contentful-paint']?.numericValue || 0,
          fid: result.audits['first-input-delay']?.numericValue || 0,
          cls: result.audits['cumulative-layout-shift']?.numericValue || 0,
          fcp: result.audits['first-contentful-paint']?.numericValue || 0,
          si: result.audits['speed-index']?.numericValue || 0,
          tti: result.audits['interactive']?.numericValue || 0,
          tbt: result.audits['total-blocking-time']?.numericValue || 0,
        },
        validation,
        timestamp: new Date().toISOString(),
      }
    })

    const overallPassed = scenarios.every(s => s.validation.passed)
    const totalViolations = scenarios.reduce((acc, s) => acc + s.validation.violations.length, 0)

    return {
      summary: {
        totalScenarios: scenarios.length,
        passedScenarios: scenarios.filter(s => s.validation.passed).length,
        overallPassed,
        totalViolations,
      },
      scenarios,
      timestamp: new Date().toISOString(),
    }
  },
}

// Type definitions for Lighthouse integration
export interface LighthouseResults {
  categories: {
    performance: {score: number}
    accessibility: {score: number}
    'best-practices': {score: number}
    seo: {score: number}
  }
  audits: {
    [key: string]: {
      numericValue?: number
      score?: number
      displayValue?: string
    }
  }
}

export interface PerformanceValidationResult {
  passed: boolean
  violations: PerformanceViolation[]
  summary: {
    lcp: number
    fid: number
    cls: number
  }
}

export interface PerformanceViolation {
  metric: string
  value: number
  threshold: number
  message: string
}

export interface PerformanceReport {
  summary: {
    totalScenarios: number
    passedScenarios: number
    overallPassed: boolean
    totalViolations: number
  }
  scenarios: PerformanceScenarioResult[]
  timestamp: string
}

export interface PerformanceScenarioResult {
  scenario: string
  url: string
  device: 'desktop' | 'mobile'
  performance: {
    score: number
    lcp: number
    fid: number
    cls: number
    fcp: number
    si: number
    tti: number
    tbt: number
  }
  validation: PerformanceValidationResult
  timestamp: string
}
