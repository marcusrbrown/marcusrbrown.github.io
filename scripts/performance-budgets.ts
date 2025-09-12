#!/usr/bin/env node

/**
 * Performance budget validation script
 * Validates performance metrics against defined budgets and thresholds
 */

import {existsSync, readFileSync} from 'node:fs'
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
    const lhciReportsPath = './lhci-reports'
    if (!existsSync(lhciReportsPath)) {
      this.addWarning('Lighthouse validation', 'No Lighthouse reports found. Run performance tests first.')
      return
    }

    try {
      console.log('🚀 Performance Metrics Validation:')

      // Find latest Lighthouse results
      const fs = await import('node:fs/promises')
      const files = await fs.readdir(lhciReportsPath)
      const manifestFiles = files.filter(f => f.includes('manifest.json'))

      if (manifestFiles.length === 0) {
        this.addWarning('Lighthouse validation', 'No Lighthouse manifest files found')
        return
      }

      // Process each manifest (represents test run)
      for (const manifestFile of manifestFiles) {
        const manifestPath = join(lhciReportsPath, manifestFile)
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

        for (const result of manifest) {
          await this.validateLighthouseResult(result)
        }
      }

      console.log()
    } catch (error: unknown) {
      this.addWarning(
        'Lighthouse validation',
        `Failed to validate Lighthouse results: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  }

  /**
   * Validate individual Lighthouse result
   */
  async validateLighthouseResult(result: any): Promise<void> {
    const url = new URL(result.url).pathname
    const isDesktop = result.configSettings?.emulatedFormFactor === 'desktop'
    const thresholds = isDesktop ? this.config.coreWebVitals.desktop : this.config.coreWebVitals.mobile

    console.log(`  📊 ${url} (${isDesktop ? 'Desktop' : 'Mobile'}):`)

    // Performance Score
    const perfScore = result.categories.performance.score
    if (perfScore < this.config.budgets.performanceScore) {
      this.addViolation(
        `Performance Score (${url})`,
        `Score ${(perfScore * 100).toFixed(1)}% below budget ${this.config.budgets.performanceScore * 100}%`,
        perfScore * 100,
        this.config.budgets.performanceScore * 100,
      )
    } else {
      console.log(`    ✅ Performance Score: ${(perfScore * 100).toFixed(1)}%`)
    }

    // Core Web Vitals
    const lcp = result.audits['largest-contentful-paint']?.numericValue
    if (lcp && lcp > thresholds.lcp) {
      this.addViolation(
        `LCP (${url})`,
        `${lcp.toFixed(0)}ms exceeds ${thresholds.lcp}ms threshold`,
        lcp,
        thresholds.lcp,
      )
    } else if (lcp) {
      console.log(`    ✅ LCP: ${lcp.toFixed(0)}ms`)
    }

    const fid = result.audits['first-input-delay']?.numericValue
    if (fid && fid > thresholds.fid) {
      this.addViolation(
        `FID (${url})`,
        `${fid.toFixed(0)}ms exceeds ${thresholds.fid}ms threshold`,
        fid,
        thresholds.fid,
      )
    } else if (fid) {
      console.log(`    ✅ FID: ${fid.toFixed(0)}ms`)
    }

    const cls = result.audits['cumulative-layout-shift']?.numericValue
    if (cls && cls > thresholds.cls) {
      this.addViolation(`CLS (${url})`, `${cls.toFixed(3)} exceeds ${thresholds.cls} threshold`, cls, thresholds.cls)
    } else if (cls !== undefined) {
      console.log(`    ✅ CLS: ${cls.toFixed(3)}`)
    }
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
      const lcpViolations = this.violations.filter(v => v.metric.includes('LCP'))
      const clsViolations = this.violations.filter(v => v.metric.includes('CLS'))

      if (jsViolations.length > 0) {
        console.log('   • Consider code splitting and tree shaking to reduce JavaScript bundle size')
        console.log('   • Use dynamic imports for non-critical functionality')
      }

      if (lcpViolations.length > 0) {
        console.log('   • Optimize images and consider WebP format')
        console.log('   • Implement resource hints (preload, prefetch)')
        console.log('   • Optimize critical rendering path')
      }

      if (clsViolations.length > 0) {
        console.log('   • Set explicit dimensions for images and embeds')
        console.log('   • Reserve space for dynamic content')
        console.log('   • Avoid inserting content above existing content')
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
