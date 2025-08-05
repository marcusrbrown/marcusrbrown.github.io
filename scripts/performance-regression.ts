#!/usr/bin/env node

/**
 * Performance regression detection with threshold alerts
 * Compares current performance metrics against historical baselines
 */

import {existsSync, readFileSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import process from 'node:process'

// Import performance configuration
import {defaultPerformanceConfig, type PerformanceTestConfig} from '../tests/performance/config.ts'

interface RegressionItem {
  metric: string
  current: string | number
  baseline: string | number
  change: number // Always a number for comparisons
  unit: string
  severity?: 'high' | 'medium' | 'low'
}

interface WarningItem {
  metric: string
  current: string | number
  baseline: string | number
  change: number // Always a number for comparisons
  unit: string
}

interface ImprovementItem {
  metric: string
  current: string | number
  baseline: string | number
  change: number // Always a number for comparisons
  unit: string
}

interface Thresholds {
  performanceScore: number
  lcp: number
  fid: number
  cls: number
  bundleSize: number
  warningThresholds: {
    performanceScore: number
    lcp: number
    fid: number
    cls: number
    bundleSize: number
  }
  [key: string]: any // Allow dynamic key access
}

interface LighthouseMetrics {
  performanceScore: number
  lcp: number
  fid: number
  cls: number
  fcp: number
  tti: number
  tbt: number
  accessibilityScore: number
  bestPracticesScore: number
  seoScore: number
  [key: string]: number // Allow dynamic key access
}

interface BundleMetrics {
  totalSize: number
  jsSize: number
  cssSize: number
  fileCount: number
}

/**
 * Performance regression detector
 */
class PerformanceRegressionDetector {
  private baselinePath: string
  private thresholds: Thresholds
  private regressions: RegressionItem[] = []
  private warnings: WarningItem[] = []
  private improvements: ImprovementItem[] = []

  constructor(_config: PerformanceTestConfig = defaultPerformanceConfig) {
    this.baselinePath = './performance-baseline.json'
    this.thresholds = {
      // Regression thresholds (percentage increase that triggers alert)
      performanceScore: 5, // 5% decrease in performance score
      lcp: 10, // 10% increase in LCP
      fid: 15, // 15% increase in FID
      cls: 20, // 20% increase in CLS
      bundleSize: 5, // 5% increase in bundle size
      // Warning thresholds (smaller changes that warrant attention)
      warningThresholds: {
        performanceScore: 2, // 2% decrease
        lcp: 5, // 5% increase
        fid: 10, // 10% increase
        cls: 10, // 10% increase
        bundleSize: 2, // 2% increase
      },
    }
    this.regressions = []
    this.warnings = []
    this.improvements = []
  }

  /**
   * Detect performance regressions
   */
  async detectRegressions() {
    console.log('🔍 Detecting performance regressions...\n')

    // Load current performance data
    const currentMetrics = await this.loadCurrentMetrics()
    if (!currentMetrics) {
      console.log('❌ No current performance data found. Run performance tests first.')
      process.exit(1)
    }

    // Load baseline metrics
    const baselineMetrics = this.loadBaselineMetrics()
    if (!baselineMetrics) {
      console.log('📊 No baseline found. Setting current metrics as baseline.')
      this.saveBaseline(currentMetrics)
      this.generateReport(currentMetrics, null)
      return
    }

    // Compare metrics
    this.compareMetrics(currentMetrics, baselineMetrics)

    // Generate comprehensive report
    this.generateReport(currentMetrics, baselineMetrics)

    // Update baseline if no regressions (or forced update)
    if (this.regressions.length === 0 || process.env['UPDATE_BASELINE'] === 'true') {
      this.saveBaseline(currentMetrics)
      console.log('✅ Baseline updated with current metrics')
    }

    // Exit with appropriate code
    const exitCode = this.regressions.length > 0 ? 1 : 0
    console.log(`\n${this.regressions.length === 0 ? '✅' : '❌'} Performance regression detection complete`)
    process.exit(exitCode)
  }

  /**
   * Load current performance metrics from Lighthouse and bundle analysis
   */
  async loadCurrentMetrics() {
    const metrics = {
      timestamp: new Date().toISOString(),
      lighthouse: {},
      bundle: {},
      commit: process.env['GITHUB_SHA'] || 'local',
    }

    // Load Lighthouse results
    const lhciResults = await this.loadLighthouseResults()
    if (lhciResults) {
      metrics.lighthouse = lhciResults
    }

    // Load bundle analysis
    const bundleAnalysis = await this.loadBundleAnalysis()
    if (bundleAnalysis) {
      metrics.bundle = bundleAnalysis
    }

    return Object.keys(metrics.lighthouse).length > 0 || Object.keys(metrics.bundle).length > 0 ? metrics : null
  }

  /**
   * Load Lighthouse CI results
   */
  async loadLighthouseResults(): Promise<Record<string, LighthouseMetrics> | null> {
    const results: Record<string, LighthouseMetrics> = {}

    for (const device of ['desktop', 'mobile']) {
      const reportsDir = `./lhci-reports-${device}`
      if (!existsSync(reportsDir)) continue

      try {
        const fs = await import('node:fs/promises')
        const files = await fs.readdir(reportsDir)
        const jsonFiles = files.filter(f => f.endsWith('.json') && !f.includes('manifest'))

        if (jsonFiles.length === 0) continue

        // Use the most recent report
        const latestFile = jsonFiles.sort().pop()
        if (!latestFile) continue

        const reportPath = join(reportsDir, latestFile)
        const report = JSON.parse(readFileSync(reportPath, 'utf8'))

        results[device] = {
          performanceScore: report.categories.performance.score * 100,
          lcp: report.audits['largest-contentful-paint']?.numericValue || 0,
          fid: report.audits['first-input-delay']?.numericValue || 0,
          cls: report.audits['cumulative-layout-shift']?.numericValue || 0,
          fcp: report.audits['first-contentful-paint']?.numericValue || 0,
          tti: report.audits.interactive?.numericValue || 0,
          tbt: report.audits['total-blocking-time']?.numericValue || 0,
          accessibilityScore: report.categories.accessibility.score * 100,
          bestPracticesScore: report.categories['best-practices'].score * 100,
          seoScore: report.categories.seo.score * 100,
        }
      } catch (error: unknown) {
        console.warn(
          `⚠️ Failed to load ${device} Lighthouse results:`,
          error instanceof Error ? error.message : 'Unknown error',
        )
      }
    }

    return Object.keys(results).length > 0 ? results : null
  }

  /**
   * Load bundle analysis results
   */
  async loadBundleAnalysis(): Promise<BundleMetrics | null> {
    const distPath = './dist'
    if (!existsSync(distPath)) return null

    try {
      // Simulate build analysis (in real implementation, this would import the actual analysis)
      const files = await this.getAllFiles(distPath)
      let totalSize = 0
      let jsSize = 0
      let cssSize = 0

      for (const file of files) {
        const stats = await import('node:fs/promises').then(async fs => fs.stat(file))
        const size = stats.size
        const ext = file.split('.').pop()?.toLowerCase()

        totalSize += size
        if (ext === 'js' || ext === 'mjs') jsSize += size
        if (ext === 'css') cssSize += size
      }

      return {
        totalSize,
        jsSize,
        cssSize,
        fileCount: files.length,
      }
    } catch (error: unknown) {
      console.warn('⚠️ Failed to load bundle analysis:', error instanceof Error ? error.message : 'Unknown error')
      return null
    }
  }

  /**
   * Load baseline metrics
   */
  loadBaselineMetrics() {
    if (!existsSync(this.baselinePath)) return null

    try {
      return JSON.parse(readFileSync(this.baselinePath, 'utf8'))
    } catch (error: unknown) {
      console.warn('⚠️ Failed to load baseline metrics:', error instanceof Error ? error.message : 'Unknown error')
      return null
    }
  }

  /**
   * Save baseline metrics
   */
  saveBaseline(metrics: any): void {
    try {
      writeFileSync(this.baselinePath, JSON.stringify(metrics, null, 2))
      console.log(`💾 Baseline saved to ${this.baselinePath}`)
    } catch (error: unknown) {
      console.error('❌ Failed to save baseline:', error instanceof Error ? error.message : 'Unknown error')
    }
  }

  /**
   * Compare current metrics against baseline
   */
  compareMetrics(current: any, baseline: any): void {
    console.log('📊 Comparing performance metrics...\n')

    // Compare Lighthouse metrics
    for (const device of ['desktop', 'mobile']) {
      if (current.lighthouse[device] && baseline.lighthouse[device]) {
        this.compareLighthouseMetrics(current.lighthouse[device], baseline.lighthouse[device], device)
      }
    }

    // Compare bundle metrics
    if (current.bundle && baseline.bundle) {
      this.compareBundleMetrics(current.bundle, baseline.bundle)
    }
  }

  /**
   * Compare Lighthouse metrics for a device
   */
  compareLighthouseMetrics(current: LighthouseMetrics, baseline: LighthouseMetrics, device: string): void {
    const metrics = [
      {key: 'performanceScore', name: 'Performance Score', unit: '%', reverse: true},
      {key: 'lcp', name: 'LCP', unit: 'ms'},
      {key: 'fid', name: 'FID', unit: 'ms'},
      {key: 'cls', name: 'CLS', unit: ''},
      {key: 'accessibilityScore', name: 'Accessibility Score', unit: '%', reverse: true},
    ]

    for (const metric of metrics) {
      const currentValue = current[metric.key]
      const baselineValue = baseline[metric.key]

      if (currentValue === undefined || baselineValue === undefined) continue

      const change = metric.reverse
        ? ((baselineValue - currentValue) / baselineValue) * 100 // For scores, decrease is bad
        : ((currentValue - baselineValue) / baselineValue) * 100 // For timings, increase is bad

      const isRegression = Math.abs(change) > this.thresholds[metric.key as keyof typeof this.thresholds]
      const isWarning =
        Math.abs(change) >
        this.thresholds.warningThresholds[metric.key as keyof typeof this.thresholds.warningThresholds]
      const isImprovement = metric.reverse ? change < -2 : change < -2 // 2% improvement threshold

      if (isRegression && (metric.reverse ? change > 0 : change > 0)) {
        this.regressions.push({
          metric: `${metric.name} (${device})`,
          current: currentValue,
          baseline: baselineValue,
          change: Math.round(change * 10) / 10,
          unit: metric.unit,
          severity: 'high',
        })
      } else if (isWarning && (metric.reverse ? change > 0 : change > 0)) {
        this.warnings.push({
          metric: `${metric.name} (${device})`,
          current: currentValue,
          baseline: baselineValue,
          change: Math.round(change * 10) / 10,
          unit: metric.unit,
        })
      } else if (isImprovement) {
        this.improvements.push({
          metric: `${metric.name} (${device})`,
          current: currentValue,
          baseline: baselineValue,
          change: Math.round(Math.abs(change) * 10) / 10,
          unit: metric.unit,
        })
      }
    }
  }

  /**
   * Compare bundle metrics
   */
  compareBundleMetrics(current: BundleMetrics, baseline: BundleMetrics): void {
    const metrics = [
      {key: 'totalSize', name: 'Total Bundle Size'},
      {key: 'jsSize', name: 'JavaScript Bundle Size'},
      {key: 'cssSize', name: 'CSS Bundle Size'},
    ]

    for (const metric of metrics) {
      const currentValue = current[metric.key as keyof BundleMetrics]
      const baselineValue = baseline[metric.key as keyof BundleMetrics]

      if (currentValue === undefined || baselineValue === undefined) continue

      const change = ((currentValue - baselineValue) / baselineValue) * 100

      if (change > this.thresholds.bundleSize) {
        this.regressions.push({
          metric: metric.name,
          current: this.formatBytes(currentValue),
          baseline: this.formatBytes(baselineValue),
          change: Math.round(change * 10) / 10,
          unit: '%',
          severity: 'medium',
        })
      } else if (change > this.thresholds.warningThresholds.bundleSize) {
        this.warnings.push({
          metric: metric.name,
          current: this.formatBytes(currentValue),
          baseline: this.formatBytes(baselineValue),
          change: Math.round(change * 10) / 10,
          unit: '%',
        })
      } else if (change < -2) {
        this.improvements.push({
          metric: metric.name,
          current: this.formatBytes(currentValue),
          baseline: this.formatBytes(baselineValue),
          change: Math.round(Math.abs(change) * 10) / 10,
          unit: '%',
        })
      }
    }
  }

  /**
   * Generate comprehensive regression report
   */
  generateReport(current: any, baseline: any): void {
    console.log('📈 Performance Regression Report')
    console.log('='.repeat(60))
    console.log(`Timestamp: ${current.timestamp}`)
    console.log(`Commit: ${current.commit}`)
    if (baseline) {
      console.log(`Baseline: ${baseline.timestamp}`)
    }
    console.log('')

    // Regressions
    if (this.regressions.length > 0) {
      console.log('🚨 PERFORMANCE REGRESSIONS DETECTED:')
      this.regressions.forEach(r => {
        console.log(
          `  ❌ ${r.metric}: ${r.current}${r.unit} → was ${r.baseline}${r.unit} (${r.change > 0 ? '+' : ''}${r.change}% change)`,
        )
      })
      console.log('')
    }

    // Warnings
    if (this.warnings.length > 0) {
      console.log('⚠️  PERFORMANCE WARNINGS:')
      this.warnings.forEach(w => {
        console.log(
          `  ⚠️  ${w.metric}: ${w.current}${w.unit} → was ${w.baseline}${w.unit} (${w.change > 0 ? '+' : ''}${w.change}% change)`,
        )
      })
      console.log('')
    }

    // Improvements
    if (this.improvements.length > 0) {
      console.log('✨ PERFORMANCE IMPROVEMENTS:')
      this.improvements.forEach(i => {
        console.log(`  ✅ ${i.metric}: ${i.current}${i.unit} → was ${i.baseline}${i.unit} (${i.change}% improvement)`)
      })
      console.log('')
    }

    if (this.regressions.length === 0 && this.warnings.length === 0 && this.improvements.length === 0) {
      console.log('✅ No significant performance changes detected')
      console.log('')
    }

    // Generate GitHub Actions summary
    this.generateGitHubSummary(current, baseline)
  }

  /**
   * Generate GitHub Actions step summary
   */
  generateGitHubSummary(current: any, baseline: any): void {
    if (!process.env['GITHUB_STEP_SUMMARY']) return

    let summary = '## 📊 Performance Regression Analysis\n\n'
    summary += `**Analysis Date:** ${current.timestamp}\n`
    summary += `**Commit:** ${current.commit}\n`
    if (baseline) {
      summary += `**Baseline:** ${baseline.timestamp}\n`
    }
    summary += '\n'

    if (this.regressions.length > 0) {
      summary += '### 🚨 Regressions Detected\n\n'
      summary += '| Metric | Current | Baseline | Change |\n'
      summary += '|--------|---------|----------|--------|\n'
      this.regressions.forEach(r => {
        summary += `| ${r.metric} | ${r.current}${r.unit} | ${r.baseline}${r.unit} | ${r.change > 0 ? '+' : ''}${r.change}% |\n`
      })
      summary += '\n'
    }

    if (this.warnings.length > 0) {
      summary += '### ⚠️ Performance Warnings\n\n'
      summary += '| Metric | Current | Baseline | Change |\n'
      summary += '|--------|---------|----------|--------|\n'
      this.warnings.forEach(w => {
        summary += `| ${w.metric} | ${w.current}${w.unit} | ${w.baseline}${w.unit} | ${w.change > 0 ? '+' : ''}${w.change}% |\n`
      })
      summary += '\n'
    }

    if (this.improvements.length > 0) {
      summary += '### ✨ Performance Improvements\n\n'
      summary += '| Metric | Current | Baseline | Improvement |\n'
      summary += '|--------|---------|----------|-------------|\n'
      this.improvements.forEach(i => {
        summary += `| ${i.metric} | ${i.current}${i.unit} | ${i.baseline}${i.unit} | ${i.change}% |\n`
      })
      summary += '\n'
    }

    if (this.regressions.length === 0 && this.warnings.length === 0 && this.improvements.length === 0) {
      summary += '✅ **No significant performance changes detected**\n\n'
    }

    // Append to GitHub Actions step summary
    if (process.env['GITHUB_STEP_SUMMARY']) {
      writeFileSync(process.env['GITHUB_STEP_SUMMARY'], summary, {flag: 'a'})
    }
  }

  /**
   * Utility functions
   */
  async getAllFiles(dir: string, files: string[] = []): Promise<string[]> {
    const fs = await import('node:fs/promises')
    const dirFiles = await fs.readdir(dir)

    for (const file of dirFiles) {
      const filePath = join(dir, file)
      const stats = await fs.stat(filePath)

      if (stats.isDirectory()) {
        await this.getAllFiles(filePath, files)
      } else {
        files.push(filePath)
      }
    }

    return files
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${Number.parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`
  }
}

// Run regression detection if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const detector = new PerformanceRegressionDetector()
  await detector.detectRegressions()
}

export {PerformanceRegressionDetector}
