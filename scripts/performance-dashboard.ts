#!/usr/bin/env tsx

/**
 * Performance dashboard data collection and reporting
 * Aggregates Lighthouse CI results, bundle analysis, and historical data
 */

import {existsSync, readFileSync, writeFileSync} from 'node:fs'
import {readdir} from 'node:fs/promises'
import process from 'node:process'

interface LighthouseReport {
  categories: {
    performance: {score: number}
    accessibility: {score: number}
    'best-practices': {score: number}
    seo: {score: number}
  }
  audits: {
    'largest-contentful-paint'?: {numericValue: number}
    'first-input-delay'?: {numericValue: number}
    'cumulative-layout-shift'?: {numericValue: number}
  }
}

interface DeviceScores {
  performance: number
  accessibility: number
  bestPractices: number
  seo: number
}

interface DeviceMetrics {
  lcp: number
  fid: number
  cls: number
}

interface DeviceData {
  scores: DeviceScores
  metrics: DeviceMetrics
  budgetStatus?: {
    passed: boolean
    violations: string[]
  }
}

interface BundleData {
  timestamp: string
  sizes: {
    total: number
    javascript: number
    css: number
    html: number
  }
  fileCount: number
  budgetStatus?: {
    passed: boolean
    violations?: unknown[]
  }
  largestAssets: {
    file: string
    size: number
  }[]
}

interface TrendChange {
  change: number
  direction: 'increased' | 'decreased' | 'stable'
  previous: number
  current: number
}

interface TrendData {
  bundleSize: {
    total: TrendChange
    javascript: TrendChange
    css: TrendChange
  }
  fileCount: TrendChange
  period: {
    from: string
    to: string
  }
}

interface SummaryData {
  overallStatus: string
  scores: Record<string, number>
  issues: string[]
  achievements: string[]
}

interface DashboardData {
  generated: string
  commit: string
  branch: string
  lighthouse: Record<string, DeviceData>
  bundle: BundleData
  trends: TrendData
  summary: SummaryData
}

interface HistoryEntry {
  timestamp: string
  totalSize: number
  jsSize: number
  cssSize: number
  fileCount: number
  commit: string
  budgetPassed: boolean
}

/**
 * Performance dashboard generator
 */
class PerformanceDashboard {
  private reportPath = './performance-dashboard.json'
  private historyPath = './performance-history.json'
  private data: DashboardData = {
    generated: new Date().toISOString(),
    commit: process.env['GITHUB_SHA'] || 'local',
    branch: process.env['GITHUB_REF_NAME'] || 'local',
    lighthouse: {},
    bundle: {
      timestamp: '',
      sizes: {total: 0, javascript: 0, css: 0, html: 0},
      fileCount: 0,
      largestAssets: [],
    },
    trends: {
      bundleSize: {
        total: {change: 0, direction: 'stable', previous: 0, current: 0},
        javascript: {change: 0, direction: 'stable', previous: 0, current: 0},
        css: {change: 0, direction: 'stable', previous: 0, current: 0},
      },
      fileCount: {change: 0, direction: 'stable', previous: 0, current: 0},
      period: {from: '', to: ''},
    },
    summary: {
      overallStatus: 'excellent',
      scores: {},
      issues: [],
      achievements: [],
    },
  }

  /**
   * Generate comprehensive performance dashboard
   */
  async generateDashboard(): Promise<void> {
    console.log('📊 Generating performance dashboard...\n')

    try {
      // Collect Lighthouse CI data
      await this.collectLighthouseData()

      // Collect bundle analysis data
      await this.collectBundleData()

      // Generate trend analysis
      this.generateTrendAnalysis()

      // Generate summary metrics
      this.generateSummary()

      // Save dashboard data
      this.saveDashboard()

      // Generate reports
      this.generateMarkdownReport()
      this.generateBadgeData()

      console.log('✅ Performance dashboard generated successfully')
      console.log(`📄 Dashboard data: ${this.reportPath}`)
      console.log(`📈 Markdown report: ./performance-report.md`)
      console.log(`🏆 Badge data: ./performance-badges.json`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('❌ Failed to generate performance dashboard:', errorMessage)
      process.exit(1)
    }
  }

  /**
   * Collect Lighthouse CI results
   */
  async collectLighthouseData(): Promise<void> {
    console.log('🚀 Collecting Lighthouse CI data...')

    const devices = ['desktop', 'mobile']

    for (const device of devices) {
      const reportsDir = `./lhci-reports-${device}`
      if (!existsSync(reportsDir)) {
        console.log(`  ⚠️ No ${device} Lighthouse reports found`)
        continue
      }

      try {
        const files = await readdir(reportsDir)
        const jsonFiles = files.filter(f => f.endsWith('.json'))

        if (jsonFiles.length === 0) {
          console.log(`  ⚠️ No JSON reports found for ${device}`)
          continue
        }

        // Take the most recent report
        const latestReport = jsonFiles.sort().pop()
        if (!latestReport) continue

        const reportPath = `${reportsDir}/${latestReport}`
        const reportData = readFileSync(reportPath, 'utf8')
        const report = JSON.parse(reportData) as LighthouseReport

        // Extract scores
        const scores: DeviceScores = {
          performance: Math.round(report.categories.performance.score * 100),
          accessibility: Math.round(report.categories.accessibility.score * 100),
          bestPractices: Math.round(report.categories['best-practices'].score * 100),
          seo: Math.round(report.categories.seo.score * 100),
        }

        // Extract metrics
        const metrics: DeviceMetrics = {
          lcp: report.audits['largest-contentful-paint']?.numericValue || 0,
          fid: report.audits['first-input-delay']?.numericValue || 0,
          cls: report.audits['cumulative-layout-shift']?.numericValue || 0,
        }

        // Evaluate budget status
        const budgetStatus = this.evaluateBudgetStatus(report, device)

        this.data.lighthouse[device] = {
          scores,
          metrics,
          budgetStatus,
        }

        console.log(`  ✅ Collected ${device} Lighthouse data`)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.log(`  ❌ Failed to collect ${device} data:`, errorMessage)
      }
    }
  }

  /**
   * Collect bundle analysis data
   */
  async collectBundleData(): Promise<void> {
    console.log('📦 Collecting bundle analysis data...')

    try {
      const {analyzeBuildOutput} = await import('./analyze-build.js')
      const analysis = analyzeBuildOutput(true)

      this.data.bundle = {
        timestamp: analysis.timestamp,
        sizes: {
          total: analysis.totalSize,
          javascript: analysis.jsSize,
          css: analysis.cssSize,
          html: analysis.htmlSize,
        },
        fileCount: analysis.fileCount,
        budgetStatus: analysis.budgetStatus,
        largestAssets: analysis.assets.slice(0, 5).map(asset => ({
          file: asset.file,
          size: asset.sizeBytes,
        })),
      }

      console.log('  ✅ Collected bundle analysis data')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.log('  ❌ Failed to collect bundle data:', errorMessage)
    }
  }

  /**
   * Generate trend analysis from historical data
   */
  generateTrendAnalysis(): void {
    console.log('📈 Generating trend analysis...')

    try {
      if (!existsSync('./build-history.json')) {
        console.log('  ⚠️ No build history found')
        return
      }

      const historyData = readFileSync('./build-history.json', 'utf8')
      const history = JSON.parse(historyData) as HistoryEntry[]
      if (history.length < 2) {
        console.log('  ⚠️ Insufficient history for trend analysis')
        return
      }

      const latest = history.at(-1)
      const previous = history.at(-2)

      if (!latest || !previous) {
        console.log('  ⚠️ Unable to access history entries')
        return
      }

      this.data.trends = {
        bundleSize: {
          total: this.calculateChange(previous.totalSize, latest.totalSize),
          javascript: this.calculateChange(previous.jsSize, latest.jsSize),
          css: this.calculateChange(previous.cssSize, latest.cssSize),
        },
        fileCount: this.calculateChange(previous.fileCount, latest.fileCount),
        period: {
          from: previous.timestamp,
          to: latest.timestamp,
        },
      }

      console.log('  ✅ Generated trend analysis')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.log('  ❌ Failed to generate trend analysis:', errorMessage)
    }
  }

  /**
   * Generate summary metrics
   */
  generateSummary(): void {
    console.log('📋 Generating performance summary...')

    const summary: SummaryData = {
      overallStatus: 'excellent',
      scores: {},
      issues: [],
      achievements: [],
    }

    // Aggregate Lighthouse scores
    if (this.data.lighthouse['desktop'] || this.data.lighthouse['mobile']) {
      const devices = Object.keys(this.data.lighthouse)
      summary.scores = devices.reduce(
        (acc, device) => {
          const deviceData = this.data.lighthouse[device]
          if (deviceData) {
            Object.entries(deviceData.scores).forEach(([metric, score]) => {
              if (!acc[metric]) acc[metric] = 0
              acc[metric] += score
            })
          }
          return acc
        },
        {} as Record<string, number>,
      )

      // Calculate average scores
      Object.keys(summary.scores).forEach(metric => {
        const score = summary.scores[metric]
        if (score !== undefined) {
          summary.scores[metric] = Math.round(score / devices.length)
        }
      })
    }

    // Check for issues
    if (this.data.bundle.budgetStatus && !this.data.bundle.budgetStatus.passed) {
      summary.issues.push('Bundle size budget violations')
      summary.overallStatus = 'warning'
    }

    const performanceScore = summary.scores['performance']
    if (performanceScore !== undefined && performanceScore < 90) {
      summary.issues.push('Performance score below 90%')
      summary.overallStatus = 'warning'
    }

    if (performanceScore !== undefined && performanceScore < 70) {
      summary.overallStatus = 'critical'
    }

    // Record achievements
    if (performanceScore !== undefined && performanceScore >= 95) {
      summary.achievements.push('Excellent performance score (95%+)')
    }

    if (this.data.bundle.budgetStatus && this.data.bundle.budgetStatus.passed) {
      summary.achievements.push('All performance budgets passed')
    }

    this.data.summary = summary
    console.log('  ✅ Generated performance summary')
  }

  /**
   * Evaluate budget status for Lighthouse results
   */
  evaluateBudgetStatus(report: LighthouseReport, device: string): {passed: boolean; violations: string[]} {
    const thresholds =
      device === 'mobile'
        ? {
            lcp: 2500,
            fid: 100,
            cls: 0.1,
            performance: 90,
          }
        : {
            lcp: 2000,
            fid: 50,
            cls: 0.05,
            performance: 95,
          }

    const violations: string[] = []
    const performanceScore = report.categories.performance.score * 100

    if (performanceScore < thresholds.performance) {
      violations.push(`Performance score ${performanceScore.toFixed(1)}% below ${thresholds.performance}%`)
    }

    const lcp = report.audits['largest-contentful-paint']?.numericValue
    if (lcp && lcp > thresholds.lcp) {
      violations.push(`LCP ${lcp.toFixed(0)}ms exceeds ${thresholds.lcp}ms`)
    }

    const fid = report.audits['first-input-delay']?.numericValue
    if (fid && fid > thresholds.fid) {
      violations.push(`FID ${fid.toFixed(0)}ms exceeds ${thresholds.fid}ms`)
    }

    const cls = report.audits['cumulative-layout-shift']?.numericValue
    if (cls && cls > thresholds.cls) {
      violations.push(`CLS ${cls.toFixed(3)} exceeds ${thresholds.cls}`)
    }

    return {
      passed: violations.length === 0,
      violations,
    }
  }

  /**
   * Calculate percentage change between two values
   */
  calculateChange(previous: number, current: number): TrendChange {
    if (previous === 0) return {change: 0, direction: 'stable', previous, current}
    const change = ((current - previous) / previous) * 100
    return {
      change: Math.round(change * 10) / 10,
      direction: change > 2 ? 'increased' : change < -2 ? 'decreased' : 'stable',
      previous,
      current,
    }
  }

  /**
   * Save dashboard data
   */
  saveDashboard(): void {
    try {
      writeFileSync(this.reportPath, JSON.stringify(this.data, null, 2))

      // Also save to history
      this.saveToHistory()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('❌ Failed to save dashboard:', errorMessage)
    }
  }

  /**
   * Save current data to history
   */
  saveToHistory(): void {
    try {
      let history: unknown[] = []

      if (existsSync(this.historyPath)) {
        try {
          const historyData = readFileSync(this.historyPath, 'utf8')
          history = JSON.parse(historyData) as unknown[]
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          console.warn('⚠️ Failed to load history:', errorMessage)
        }
      }

      const historyEntry = {
        timestamp: this.data.generated,
        commit: this.data.commit,
        scores: this.data.summary.scores,
        bundleSize: this.data.bundle.sizes?.total || 0,
        overallStatus: this.data.summary.overallStatus,
      }

      history.push(historyEntry)

      // Keep last 100 entries
      if (history.length > 100) {
        history = history.slice(-100)
      }

      writeFileSync(this.historyPath, JSON.stringify(history, null, 2))
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.warn('⚠️ Failed to save to history:', errorMessage)
    }
  }

  /**
   * Generate markdown report
   */
  generateMarkdownReport(): void {
    const report = `# 📊 Performance Dashboard Report

**Generated:** ${this.data.generated}
**Commit:** ${this.data.commit}
**Branch:** ${this.data.branch}

## 🏆 Overall Status: ${this.getStatusEmoji(this.data.summary.overallStatus)} ${this.data.summary.overallStatus.toUpperCase()}

## 📈 Performance Scores

${Object.keys(this.data.lighthouse)
  .map(device => {
    const deviceData = this.data.lighthouse[device]
    if (!deviceData) return ''

    return `
### ${device.charAt(0).toUpperCase() + device.slice(1)}

| Metric | Score | Status |
|--------|-------|--------|
| Performance | ${deviceData.scores.performance}% | ${this.getScoreStatus(deviceData.scores.performance)} |
| Accessibility | ${deviceData.scores.accessibility}% | ${this.getScoreStatus(deviceData.scores.accessibility)} |
| Best Practices | ${deviceData.scores.bestPractices}% | ${this.getScoreStatus(deviceData.scores.bestPractices)} |
| SEO | ${deviceData.scores.seo}% | ${this.getScoreStatus(deviceData.scores.seo)} |

#### Core Web Vitals
- **LCP:** ${(deviceData.metrics.lcp / 1000).toFixed(2)}s
- **FID:** ${deviceData.metrics.fid.toFixed(0)}ms
- **CLS:** ${deviceData.metrics.cls.toFixed(3)}
`
  })
  .join('\n')}

## 📦 Bundle Analysis

| Metric | Size | Status |
|--------|------|--------|
| Total Bundle | ${this.formatBytes(this.data.bundle.sizes?.total || 0)} | ${this.data.bundle.budgetStatus?.passed ? '✅' : '❌'} |
| JavaScript | ${this.formatBytes(this.data.bundle.sizes?.javascript || 0)} | ${this.getBundleStatus(this.data.bundle.sizes?.javascript || 0, 512000)} |
| CSS | ${this.formatBytes(this.data.bundle.sizes?.css || 0)} | ${this.getBundleStatus(this.data.bundle.sizes?.css || 0, 102400)} |

### Largest Assets
${this.data.bundle.largestAssets?.map(asset => `- ${asset.file}: ${this.formatBytes(asset.size)}`).join('\n') || 'No asset data available'}

${
  this.data.trends.bundleSize
    ? `
## 📊 Trends
- **Total Bundle:** ${this.getTrendEmoji(this.data.trends.bundleSize.total.direction)} ${this.data.trends.bundleSize.total.change}%
- **JavaScript:** ${this.getTrendEmoji(this.data.trends.bundleSize.javascript.direction)} ${this.data.trends.bundleSize.javascript.change}%
- **CSS:** ${this.getTrendEmoji(this.data.trends.bundleSize.css.direction)} ${this.data.trends.bundleSize.css.change}%
`
    : ''
}

## 🎯 Summary

${
  this.data.summary.achievements.length > 0
    ? `
### ✨ Achievements
${this.data.summary.achievements.map(achievement => `- ✅ ${achievement}`).join('\n')}
`
    : ''
}

${
  this.data.summary.issues.length > 0
    ? `
### ⚠️ Issues
${this.data.summary.issues.map(issue => `- ❌ ${issue}`).join('\n')}
`
    : ''
}

---
*Report generated by Performance Dashboard v1.0*
`

    writeFileSync('./performance-report.md', report)
  }

  /**
   * Generate badge data for shields.io
   */
  generateBadgeData(): void {
    const performanceScore = this.data.summary.scores['performance'] || 0
    const badgeData = {
      schemaVersion: 1,
      label: 'performance',
      message: `${performanceScore}%`,
      color: this.getScoreColor(performanceScore),
      namedLogo: 'lighthouse',
      logoColor: 'white',
    }

    const bundleBadge = {
      schemaVersion: 1,
      label: 'bundle size',
      message: this.formatBytes(this.data.bundle.sizes?.total || 0),
      color: this.data.bundle.budgetStatus?.passed ? 'green' : 'red',
      namedLogo: 'webpack',
    }

    const badges = {
      performance: badgeData,
      bundleSize: bundleBadge,
      generated: new Date().toISOString(),
    }

    writeFileSync('./performance-badges.json', JSON.stringify(badges, null, 2))
  }

  // Utility methods
  getStatusEmoji(status: string): string {
    const emojis: Record<string, string> = {
      excellent: '🟢',
      warning: '🟡',
      critical: '🔴',
    }
    return emojis[status] || '⚪'
  }

  getScoreStatus(score: number): string {
    if (score >= 90) return '🟢 Excellent'
    if (score >= 70) return '🟡 Good'
    return '🔴 Needs Improvement'
  }

  getScoreColor(score: number): string {
    if (score >= 90) return 'brightgreen'
    if (score >= 70) return 'yellow'
    return 'red'
  }

  getBundleStatus(size: number, budget: number): string {
    return size <= budget ? '✅' : '❌'
  }

  getTrendEmoji(direction: string): string {
    const emojis: Record<string, string> = {
      increased: '📈',
      decreased: '📉',
      stable: '➡️',
    }
    return emojis[direction] || '➡️'
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${Number.parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`
  }
}

// Run dashboard generation if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const dashboard = new PerformanceDashboard()
  await dashboard.generateDashboard()
}

export {PerformanceDashboard}
