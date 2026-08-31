#!/usr/bin/env node

/**
 * Performance budget validation script
 * Validates bundle/resource budgets and Lighthouse report inputs.
 * Lighthouse owns Lighthouse-metric thresholds through its own assertions.
 */

import {existsSync, readFileSync} from 'node:fs'
import {readdir} from 'node:fs/promises'
import {join} from 'node:path'
import process from 'node:process'

// Import performance configuration
import {defaultPerformanceConfig, type PerformanceTestConfig} from '../tests/performance/config.ts'

interface BudgetViolation {
  metric: string
  message: string
  actual: string | number
  expected: string | number
}

interface BudgetWarning {
  category: string
  message: string
}

interface LighthouseResult {
  url?: string
  requestedUrl?: string
  finalUrl?: string
  categories: {
    performance: {
      score: number
    }
  }
  audits: Record<
    string,
    | {
        numericValue?: number
      }
    | undefined
  >
}

/**
 * Resolve the Lighthouse report directory for the current performance run.
 */
export const resolveLighthouseReportsPath = (environment: NodeJS.ProcessEnv = process.env): string =>
  environment.LHCI_REPORTS_DIR ??
  (environment.DEVICE_TYPE ? `./lhci-reports-${environment.DEVICE_TYPE}` : './lhci-reports')

/**
 * Identify a parsed JSON value as a Lighthouse result rather than an LHCI metadata file.
 */
export const isLighthouseResult = (value: unknown): value is LighthouseResult => {
  if (typeof value !== 'object' || value === null) return false

  const result = value as Record<string, unknown>
  const categories = result.categories
  const performance =
    typeof categories === 'object' && categories !== null
      ? (categories as Record<string, unknown>).performance
      : undefined
  const audits = result.audits

  return (
    (typeof result.url === 'string' ||
      typeof result.requestedUrl === 'string' ||
      typeof result.finalUrl === 'string') &&
    typeof performance === 'object' &&
    performance !== null &&
    typeof (performance as Record<string, unknown>).score === 'number' &&
    typeof audits === 'object' &&
    audits !== null
  )
}

/**
 * Read only actual Lighthouse result files from an LHCI output directory.
 */
export const readLighthouseReports = async (reportsPath: string): Promise<LighthouseResult[]> => {
  if (!existsSync(reportsPath)) return []

  let files: string[]
  try {
    files = await readdir(reportsPath)
  } catch (error: unknown) {
    throw new Error(
      `Failed to read Lighthouse reports directory ${reportsPath}: ${error instanceof Error ? error.message : 'Unknown error'}`,
    )
  }

  const reports: LighthouseResult[] = []

  for (const file of files.filter(fileName => fileName.endsWith('.json') && fileName !== 'manifest.json')) {
    const reportPath = join(reportsPath, file)

    try {
      const value: unknown = JSON.parse(readFileSync(reportPath, 'utf8'))
      if (isLighthouseResult(value)) reports.push(value)
    } catch (error: unknown) {
      throw new Error(
        `Failed to read Lighthouse report ${reportPath}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  }

  return reports
}

/**
 * Performance budget validator
 */
class PerformanceBudgetValidator {
  private readonly config: PerformanceTestConfig
  private readonly violations: BudgetViolation[] = []
  private readonly warnings: BudgetWarning[] = []

  constructor(config: PerformanceTestConfig = defaultPerformanceConfig) {
    this.config = config
    this.violations = []
    this.warnings = []
  }

  /**
   * Validate all performance budgets
   */
  async validateAll() {
    console.log('🔍 Validating performance budgets...\n')

    // Validate bundle sizes
    await this.validateBundleSizes()

    // Validate Lighthouse results if available
    await this.validateLighthouseResults()

    // Generate summary report
    this.generateReport()

    // Exit with appropriate code
    process.exit(this.violations.length > 0 ? 1 : 0)
  }

  /**
   * Validate bundle size budgets
   */
  async validateBundleSizes() {
    const distPath = './dist'
    if (!existsSync(distPath)) {
      this.addWarning('Bundle validation', 'dist/ directory not found. Run build first.')
      return
    }

    try {
      // Use existing build analysis functionality
      const {analyzeBuildOutput} = await import('./analyze-build.js')
      const analysis = analyzeBuildOutput(true) // Get data without side effects

      console.log('📦 Bundle Size Validation:')

      // JavaScript budget
      if (analysis.jsSize > this.config.budgets.javascript) {
        this.addViolation(
          'JavaScript Bundle Size',
          `${this.formatBytes(analysis.jsSize)} exceeds budget of ${this.formatBytes(this.config.budgets.javascript)}`,
          analysis.jsSize,
          this.config.budgets.javascript,
        )
      } else {
        console.log(
          `  ✅ JavaScript: ${this.formatBytes(analysis.jsSize)} (within ${this.formatBytes(this.config.budgets.javascript)} budget)`,
        )
      }

      // CSS budget
      if (analysis.cssSize > this.config.budgets.css) {
        this.addViolation(
          'CSS Bundle Size',
          `${this.formatBytes(analysis.cssSize)} exceeds budget of ${this.formatBytes(this.config.budgets.css)}`,
          analysis.cssSize,
          this.config.budgets.css,
        )
      } else {
        console.log(
          `  ✅ CSS: ${this.formatBytes(analysis.cssSize)} (within ${this.formatBytes(this.config.budgets.css)} budget)`,
        )
      }

      // Total bundle budget
      if (analysis.totalSize > this.config.budgets.total) {
        this.addViolation(
          'Total Bundle Size',
          `${this.formatBytes(analysis.totalSize)} exceeds budget of ${this.formatBytes(this.config.budgets.total)}`,
          analysis.totalSize,
          this.config.budgets.total,
        )
      } else {
        console.log(
          `  ✅ Total: ${this.formatBytes(analysis.totalSize)} (within ${this.formatBytes(this.config.budgets.total)} budget)`,
        )
      }

      console.log()
    } catch (error: unknown) {
      this.addWarning(
        'Bundle validation',
        `Failed to analyze bundle: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  }

  /**
   * Validate Lighthouse performance results
   */
  async validateLighthouseResults() {
    const lhciReportsPath = resolveLighthouseReportsPath()

    try {
      console.log('🚀 Lighthouse Report Validation (metrics informational; LHCI owns metric thresholds):')

      let reports: LighthouseResult[]
      try {
        reports = await readLighthouseReports(lhciReportsPath)
      } catch (error: unknown) {
        this.addViolation(
          'Lighthouse validation',
          error instanceof Error ? error.message : `Failed to read Lighthouse reports in ${lhciReportsPath}`,
          'unreadable',
          'readable',
        )
        return
      }

      if (reports.length === 0) {
        this.addViolation(
          'Lighthouse validation',
          `No Lighthouse reports found in ${lhciReportsPath}. Run performance tests first.`,
          'none',
          'at least one report',
        )
        return
      }

      // Report each Lighthouse result. Metric gates belong to LHCI assertions.
      for (const report of reports) {
        try {
          this.reportLighthouseResult(report)
        } catch (error: unknown) {
          const reportUrl = report.url ?? report.finalUrl ?? report.requestedUrl ?? 'unknown URL'
          this.addViolation(
            'Lighthouse validation',
            `Failed to validate Lighthouse report for ${reportUrl}: ${error instanceof Error ? error.message : 'Unknown error'}`,
            reportUrl,
            'valid report',
          )
        }
      }

      console.log()
    } catch (error: unknown) {
      this.addViolation(
        'Lighthouse validation',
        `Failed to validate Lighthouse results in ${lhciReportsPath}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'unreadable',
        'readable',
      )
    }
  }

  /**
   * Report an individual Lighthouse result without duplicating LHCI metric gates.
   */
  reportLighthouseResult(result: LighthouseResult): void {
    const reportUrl = result.url ?? result.finalUrl ?? result.requestedUrl
    if (reportUrl === undefined) return

    const url = new URL(reportUrl).pathname

    console.log(`  📊 ${url}:`)

    const perfScore = result.categories.performance.score
    console.log(`    ℹ️  Performance Score: ${(perfScore * 100).toFixed(1)}%`)

    const lcp = result.audits['largest-contentful-paint']?.numericValue
    if (lcp !== undefined) console.log(`    ℹ️  LCP: ${lcp.toFixed(0)}ms`)

    const cls = result.audits['cumulative-layout-shift']?.numericValue
    if (cls !== undefined) console.log(`    ℹ️  CLS: ${cls.toFixed(3)}`)
  }

  /**
   * Add performance violation
   */
  addViolation(metric: string, message: string, actual: string | number, expected: string | number): void {
    this.violations.push({metric, message, actual, expected})
    console.log(`    ❌ ${metric}: ${message}`)
  }

  /**
   * Add performance warning
   */
  addWarning(category: string, message: string): void {
    this.warnings.push({category, message})
    console.log(`    ⚠️  ${category}: ${message}`)
  }

  /**
   * Generate performance budget report
   */
  generateReport() {
    console.log('📋 Performance Budget Summary:')
    console.log('='.repeat(50))

    if (this.violations.length === 0 && this.warnings.length === 0) {
      console.log('✅ All performance budgets passed!')
    } else {
      if (this.violations.length > 0) {
        console.log(`❌ ${this.violations.length} budget violations found:`)
        this.violations.forEach(v => {
          console.log(`   • ${v.metric}: ${v.message}`)
        })
        console.log()
      }

      if (this.warnings.length > 0) {
        console.log(`⚠️  ${this.warnings.length} warnings:`)
        this.warnings.forEach(w => {
          console.log(`   • ${w.category}: ${w.message}`)
        })
        console.log()
      }
    }

    // Performance recommendations
    if (this.violations.length > 0) {
      console.log('💡 Performance Recommendations:')
      const jsViolations = this.violations.filter(v => v.metric.includes('JavaScript'))

      if (jsViolations.length > 0) {
        console.log('   • Consider code splitting and tree shaking to reduce JavaScript bundle size')
        console.log('   • Use dynamic imports for non-critical functionality')
      }
    }

    console.log('='.repeat(50))
  }

  /**
   * Format bytes for display
   */
  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${Number.parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`
  }
}

// Run validation if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const validator = new PerformanceBudgetValidator()
  await validator.validateAll()
}

export {PerformanceBudgetValidator}
