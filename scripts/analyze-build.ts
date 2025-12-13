#!/usr/bin/env tsx

/**
 * Build analysis script with performance budget validation and historical tracking
 * Integrates with Lighthouse CI performance monitoring and provides comprehensive reporting
 */

import {existsSync, readdirSync, readFileSync, statSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import process from 'node:process'

const PERFORMANCE_BUDGETS = {
  javascript: 512_000,
  css: 102_400,
  total: 2_097_152,
  warnings: {
    javascript: 409_600,
    css: 81_920,
    total: 1_677_721,
  },
} as const

const BUILD_HISTORY_FILE = './build-history.json'
const BUILD_HISTORY_MAX_ENTRIES = 50
const DIST_PATH = './dist'
const TOP_ASSETS_COUNT = 10

interface BudgetViolation {
  metric: string
  current: string
  budget: string
  exceeded: string
}

interface BudgetWarning {
  metric: string
  current: string
  threshold: string
  message: string
}

interface BudgetStatus {
  passed: boolean
  violations: BudgetViolation[]
  warnings: BudgetWarning[]
}

interface AssetInfo {
  file: string
  size: string
  sizeBytes: number
}

interface BuildAnalysis {
  totalSize: number
  fileCount: number
  jsSize: number
  cssSize: number
  htmlSize: number
  assets: AssetInfo[]
  timestamp: string
  budgetStatus: BudgetStatus
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

interface PerformanceStatus {
  icon: string
  message: string
}

class BuildAnalyzer {
  private readonly distPath = DIST_PATH
  private readonly historyFile = BUILD_HISTORY_FILE
  private readonly maxHistoryEntries = BUILD_HISTORY_MAX_ENTRIES

  /**
   * Analyze build output for size and performance metrics
   * Enhanced with performance budget validation and historical tracking
   */
  analyze(returnDataOnly = false): BuildAnalysis {
    try {
      const analysis = this.collectBuildMetrics()
      this.validatePerformanceBudgets(analysis)
      this.saveAnalysisData(analysis)

      if (returnDataOnly) {
        return analysis
      }

      this.generateConsoleReport(analysis)

      if (process.env.GITHUB_ACTIONS) {
        this.generateJobSummary(analysis)
      }

      return analysis
    } catch (error) {
      console.error('❌ Build analysis failed:', this.getErrorMessage(error))
      process.exit(1)
    }
  }

  private collectBuildMetrics(): BuildAnalysis {
    const files = this.getAllFiles(this.distPath)
    const analysis: BuildAnalysis = {
      totalSize: 0,
      fileCount: 0,
      jsSize: 0,
      cssSize: 0,
      htmlSize: 0,
      assets: [],
      timestamp: new Date().toISOString(),
      budgetStatus: {
        passed: true,
        violations: [],
        warnings: [],
      },
    }

    for (const file of files) {
      const stats = statSync(file)
      const size = stats.size
      const ext = file.split('.').pop()?.toLowerCase()

      analysis.totalSize += size
      analysis.fileCount++

      if (ext === 'js' || ext === 'mjs') {
        analysis.jsSize += size
      } else if (ext === 'css') {
        analysis.cssSize += size
      } else if (ext === 'html') {
        analysis.htmlSize += size
      }

      analysis.assets.push({
        file: file.replace(`${this.distPath}/`, ''),
        size: formatBytes(size),
        sizeBytes: size,
      })
    }

    analysis.assets.sort((a, b) => b.sizeBytes - a.sizeBytes)

    return analysis
  }

  private validatePerformanceBudgets(analysis: BuildAnalysis): void {
    this.checkBudget(
      analysis,
      'JavaScript Bundle Size',
      analysis.jsSize,
      PERFORMANCE_BUDGETS.javascript,
      PERFORMANCE_BUDGETS.warnings.javascript,
    )

    this.checkBudget(
      analysis,
      'CSS Bundle Size',
      analysis.cssSize,
      PERFORMANCE_BUDGETS.css,
      PERFORMANCE_BUDGETS.warnings.css,
    )

    this.checkBudget(
      analysis,
      'Total Bundle Size',
      analysis.totalSize,
      PERFORMANCE_BUDGETS.total,
      PERFORMANCE_BUDGETS.warnings.total,
    )
  }

  private checkBudget(
    analysis: BuildAnalysis,
    metric: string,
    currentSize: number,
    budgetLimit: number,
    warningThreshold: number,
  ): void {
    if (currentSize > budgetLimit) {
      analysis.budgetStatus.passed = false
      analysis.budgetStatus.violations.push({
        metric,
        current: formatBytes(currentSize),
        budget: formatBytes(budgetLimit),
        exceeded: formatBytes(currentSize - budgetLimit),
      })
    } else if (currentSize > warningThreshold) {
      analysis.budgetStatus.warnings.push({
        metric,
        current: formatBytes(currentSize),
        threshold: formatBytes(warningThreshold),
        message: 'Approaching budget limit',
      })
    }
  }

  private saveAnalysisData(analysis: BuildAnalysis): void {
    try {
      let history = this.loadHistory()

      const historyEntry: HistoryEntry = {
        timestamp: analysis.timestamp,
        totalSize: analysis.totalSize,
        jsSize: analysis.jsSize,
        cssSize: analysis.cssSize,
        fileCount: analysis.fileCount,
        commit: process.env.GITHUB_SHA ?? 'local',
        budgetPassed: analysis.budgetStatus.passed,
      }

      history.push(historyEntry)

      if (history.length > this.maxHistoryEntries) {
        history = history.slice(-this.maxHistoryEntries)
      }

      writeFileSync(this.historyFile, JSON.stringify(history, null, 2))
    } catch (error) {
      console.warn('⚠️ Failed to save build history:', this.getErrorMessage(error))
    }
  }

  private loadHistory(): HistoryEntry[] {
    if (!existsSync(this.historyFile)) {
      return []
    }

    try {
      const historyData = readFileSync(this.historyFile, 'utf8')
      return JSON.parse(historyData) as HistoryEntry[]
    } catch (error) {
      console.warn('⚠️ Failed to load build history:', this.getErrorMessage(error))
      return []
    }
  }

  private generateConsoleReport(analysis: BuildAnalysis): void {
    console.log('📦 Build Analysis Report')
    console.log('========================')
    console.log(`Total files: ${analysis.fileCount}`)
    console.log(`Total size: ${formatBytes(analysis.totalSize)}`)
    console.log(`JavaScript: ${formatBytes(analysis.jsSize)}`)
    console.log(`CSS: ${formatBytes(analysis.cssSize)}`)
    console.log(`HTML: ${formatBytes(analysis.htmlSize)}`)
    console.log('')

    if (analysis.budgetStatus.violations.length > 0) {
      console.log('🚨 PERFORMANCE BUDGET VIOLATIONS:')
      for (const violation of analysis.budgetStatus.violations) {
        console.log(
          `  ❌ ${violation.metric}: ${violation.current} (budget: ${violation.budget}, exceeded by: ${violation.exceeded})`,
        )
      }
      console.log('')
    }

    if (analysis.budgetStatus.warnings.length > 0) {
      console.log('⚠️  PERFORMANCE BUDGET WARNINGS:')
      for (const warning of analysis.budgetStatus.warnings) {
        console.log(`  ⚠️  ${warning.metric}: ${warning.current} (${warning.message})`)
      }
      console.log('')
    }

    if (analysis.budgetStatus.passed && analysis.budgetStatus.warnings.length === 0) {
      console.log('✅ All performance budgets passed!')
      console.log('')
    }

    console.log('📊 Largest Assets:')
    for (const asset of analysis.assets.slice(0, TOP_ASSETS_COUNT)) {
      console.log(`  ${asset.file.padEnd(30)} ${asset.size}`)
    }
    console.log('')
  }

  private generateJobSummary(analysis: BuildAnalysis): void {
    const performanceStatus = this.getPerformanceStatus(analysis)

    const summary = `
# 📦 Build Analysis Report

## Bundle Overview

| Metric | Value |
|--------|-------|
| **Total Files** | ${analysis.fileCount} |
| **Total Size** | ${formatBytes(analysis.totalSize)} |
| **JavaScript** | ${formatBytes(analysis.jsSize)} |
| **CSS** | ${formatBytes(analysis.cssSize)} |
| **HTML** | ${formatBytes(analysis.htmlSize)} |
| **Build Time** | ${analysis.timestamp.split('T')[1]?.split('.')[0] ?? 'N/A'} UTC |

## Performance Budget Status

${analysis.budgetStatus.passed ? '✅ **All performance budgets passed!**' : '❌ **Performance budget violations detected**'}

${
  analysis.budgetStatus.violations.length > 0
    ? `
### 🚨 Budget Violations

| Metric | Current | Budget | Exceeded By |
|--------|---------|---------|-------------|
${analysis.budgetStatus.violations.map(v => `| ${v.metric} | ${v.current} | ${v.budget} | ${v.exceeded} |`).join('\n')}
`
    : ''
}

${
  analysis.budgetStatus.warnings.length > 0
    ? `
### ⚠️ Budget Warnings

| Metric | Current | Message |
|--------|---------|---------|
${analysis.budgetStatus.warnings.map(w => `| ${w.metric} | ${w.current} | ${w.message} |`).join('\n')}
`
    : ''
}

## Performance Status

${performanceStatus.map(status => `${status.icon} ${status.message}`).join('\n')}

## Largest Assets

| File | Size |
|------|------|
${analysis.assets
  .slice(0, TOP_ASSETS_COUNT)
  .map(asset => `| \`${asset.file}\` | ${asset.size} |`)
  .join('\n')}

${analysis.assets.length > TOP_ASSETS_COUNT ? `\n*Showing top ${TOP_ASSETS_COUNT} of ${analysis.assets.length} total files*` : ''}

## Bundle Composition

\`\`\`
JavaScript: ${formatBytes(analysis.jsSize)} (${((analysis.jsSize / analysis.totalSize) * 100).toFixed(1)}%)
CSS:        ${formatBytes(analysis.cssSize)} (${((analysis.cssSize / analysis.totalSize) * 100).toFixed(1)}%)
HTML:       ${formatBytes(analysis.htmlSize)} (${((analysis.htmlSize / analysis.totalSize) * 100).toFixed(1)}%)
Other:      ${formatBytes(analysis.totalSize - analysis.jsSize - analysis.cssSize - analysis.htmlSize)} (${(((analysis.totalSize - analysis.jsSize - analysis.cssSize - analysis.htmlSize) / analysis.totalSize) * 100).toFixed(1)}%)
\`\`\`

## Performance Recommendations

${
  analysis.budgetStatus.violations.length > 0
    ? `
💡 **Budget Optimization Suggestions:**
- Consider code splitting for large JavaScript bundles
- Use tree shaking to eliminate dead code
- Implement lazy loading for non-critical components
- Optimize images and use modern formats (WebP, AVIF)
- Consider using dynamic imports for feature-specific code
`
    : '✨ **Great job!** Your bundle sizes are within performance budgets.'
}
`

    console.log(
      `::notice title=Bundle Analysis::Bundle size: ${formatBytes(analysis.totalSize)} (${analysis.fileCount} files)${analysis.budgetStatus.passed ? ' - All budgets passed' : ' - Budget violations detected'}`,
    )

    if (process.env.GITHUB_STEP_SUMMARY) {
      writeFileSync(process.env.GITHUB_STEP_SUMMARY, summary, {flag: 'a'})
    }
  }

  private getPerformanceStatus(analysis: BuildAnalysis): PerformanceStatus[] {
    const statuses: PerformanceStatus[] = []

    if (analysis.jsSize > 500 * 1024) {
      statuses.push({
        icon: '⚠️',
        message: `JavaScript bundle size is large (${formatBytes(analysis.jsSize)} > 500KB)`,
      })
    } else if (analysis.jsSize < 100 * 1024) {
      statuses.push({
        icon: '✅',
        message: `JavaScript bundle size is optimal (${formatBytes(analysis.jsSize)} < 100KB)`,
      })
    } else {
      statuses.push({
        icon: '✅',
        message: `JavaScript bundle size is acceptable (${formatBytes(analysis.jsSize)})`,
      })
    }

    if (analysis.totalSize > 2 * 1024 * 1024) {
      statuses.push({
        icon: '⚠️',
        message: `Total bundle size is very large (${formatBytes(analysis.totalSize)} > 2MB)`,
      })
    } else if (analysis.totalSize > 1024 * 1024) {
      statuses.push({
        icon: '🔶',
        message: `Total bundle size is moderate (${formatBytes(analysis.totalSize)} > 1MB)`,
      })
    } else {
      statuses.push({
        icon: '✅',
        message: `Total bundle size is excellent (${formatBytes(analysis.totalSize)} < 1MB)`,
      })
    }

    return statuses
  }

  private getAllFiles(dir: string, files: string[] = []): string[] {
    const dirFiles = readdirSync(dir)

    for (const file of dirFiles) {
      const filePath = join(dir, file)
      const stats = statSync(filePath)

      if (stats.isDirectory()) {
        this.getAllFiles(filePath, files)
      } else {
        files.push(filePath)
      }
    }

    return files
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'

  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${Number.parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`
}

/**
 * Backward-compatible wrapper function for external callers
 * Maintains existing API for scripts that depend on this module
 */
function analyzeBuildOutput(returnDataOnly = false): BuildAnalysis {
  const analyzer = new BuildAnalyzer()
  return analyzer.analyze(returnDataOnly)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  analyzeBuildOutput()
}

export {analyzeBuildOutput}
export type {AssetInfo, BudgetStatus, BuildAnalysis, HistoryEntry}
