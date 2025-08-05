#!/usr/bin/env tsx

/**
 * Build analysis script with performance budget validation and historical tracking
 * Integrates with Lighthouse CI performance monitoring and provides comprehensive reporting
 */

import {existsSync, readdirSync, readFileSync, statSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import process from 'node:process'

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

/**
 * Analyze build output for size and performance metrics
 * Enhanced with performance budget validation and historical tracking
 */
function analyzeBuildOutput(returnDataOnly = false): BuildAnalysis {
  const distPath = './dist'

  try {
    const files = getAllFiles(distPath)
    const analysis: BuildAnalysis = {
      totalSize: 0,
      fileCount: 0,
      jsSize: 0,
      cssSize: 0,
      htmlSize: 0,
      assets: [],
      timestamp: new Date().toISOString(),
      // Performance budget status
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
        file: file.replace('./dist/', ''),
        size: formatBytes(size),
        sizeBytes: size,
      })
    }

    // Sort assets by size (largest first)
    analysis.assets.sort((a, b) => b.sizeBytes - a.sizeBytes)

    // Validate performance budgets
    validatePerformanceBudgets(analysis)

    // Save analysis for performance tracking
    saveAnalysisData(analysis)

    // Return data only if requested (for programmatic use)
    if (returnDataOnly) {
      return analysis
    }

    // Generate console output
    generateConsoleReport(analysis)

    // Generate GitHub Actions job summary
    if (process.env['GITHUB_ACTIONS']) {
      generateJobSummary(analysis)
    }

    return analysis
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('❌ Build analysis failed:', errorMessage)
    process.exit(1)
  }
}

/**
 * Validate performance budgets against current build
 */
function validatePerformanceBudgets(analysis: BuildAnalysis): void {
  // Performance budget thresholds (bytes)
  const budgets = {
    javascript: 512000, // 500KB
    css: 102400, // 100KB
    total: 2097152, // 2MB
    // Warning thresholds (80% of budget)
    warnings: {
      javascript: 409600, // 400KB
      css: 81920, // 80KB
      total: 1677721, // 1.6MB
    },
  }

  // Check JavaScript budget
  if (analysis.jsSize > budgets.javascript) {
    analysis.budgetStatus.passed = false
    analysis.budgetStatus.violations.push({
      metric: 'JavaScript Bundle Size',
      current: formatBytes(analysis.jsSize),
      budget: formatBytes(budgets.javascript),
      exceeded: formatBytes(analysis.jsSize - budgets.javascript),
    })
  } else if (analysis.jsSize > budgets.warnings.javascript) {
    analysis.budgetStatus.warnings.push({
      metric: 'JavaScript Bundle Size',
      current: formatBytes(analysis.jsSize),
      threshold: formatBytes(budgets.warnings.javascript),
      message: 'Approaching budget limit',
    })
  }

  // Check CSS budget
  if (analysis.cssSize > budgets.css) {
    analysis.budgetStatus.passed = false
    analysis.budgetStatus.violations.push({
      metric: 'CSS Bundle Size',
      current: formatBytes(analysis.cssSize),
      budget: formatBytes(budgets.css),
      exceeded: formatBytes(analysis.cssSize - budgets.css),
    })
  } else if (analysis.cssSize > budgets.warnings.css) {
    analysis.budgetStatus.warnings.push({
      metric: 'CSS Bundle Size',
      current: formatBytes(analysis.cssSize),
      threshold: formatBytes(budgets.warnings.css),
      message: 'Approaching budget limit',
    })
  }

  // Check total budget
  if (analysis.totalSize > budgets.total) {
    analysis.budgetStatus.passed = false
    analysis.budgetStatus.violations.push({
      metric: 'Total Bundle Size',
      current: formatBytes(analysis.totalSize),
      budget: formatBytes(budgets.total),
      exceeded: formatBytes(analysis.totalSize - budgets.total),
    })
  } else if (analysis.totalSize > budgets.warnings.total) {
    analysis.budgetStatus.warnings.push({
      metric: 'Total Bundle Size',
      current: formatBytes(analysis.totalSize),
      threshold: formatBytes(budgets.warnings.total),
      message: 'Approaching budget limit',
    })
  }
}

/**
 * Save analysis data for historical tracking
 */
function saveAnalysisData(analysis: BuildAnalysis): void {
  try {
    const historyFile = './build-history.json'
    let history: HistoryEntry[] = []

    // Load existing history
    if (existsSync(historyFile)) {
      try {
        const historyData = readFileSync(historyFile, 'utf8')
        history = JSON.parse(historyData) as HistoryEntry[]
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.warn('⚠️ Failed to load build history:', errorMessage)
      }
    }

    // Add current analysis (keep only essential data)
    const historyEntry: HistoryEntry = {
      timestamp: analysis.timestamp,
      totalSize: analysis.totalSize,
      jsSize: analysis.jsSize,
      cssSize: analysis.cssSize,
      fileCount: analysis.fileCount,
      commit: process.env['GITHUB_SHA'] || 'local',
      budgetPassed: analysis.budgetStatus.passed,
    }

    history.push(historyEntry)

    // Keep only last 50 entries to prevent file from growing too large
    if (history.length > 50) {
      history = history.slice(-50)
    }

    writeFileSync(historyFile, JSON.stringify(history, null, 2))
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.warn('⚠️ Failed to save build history:', errorMessage)
  }
}

/**
 * Generate console report
 */
function generateConsoleReport(analysis: BuildAnalysis): void {
  console.log('📦 Build Analysis Report')
  console.log('========================')
  console.log(`Total files: ${analysis.fileCount}`)
  console.log(`Total size: ${formatBytes(analysis.totalSize)}`)
  console.log(`JavaScript: ${formatBytes(analysis.jsSize)}`)
  console.log(`CSS: ${formatBytes(analysis.cssSize)}`)
  console.log(`HTML: ${formatBytes(analysis.htmlSize)}`)
  console.log('')

  // Performance budget status
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
  for (const asset of analysis.assets.slice(0, 10)) {
    console.log(`  ${asset.file.padEnd(30)} ${asset.size}`)
  }
  console.log('')
}

/**
 * Generate GitHub Actions job summary with markdown formatting
 */
function generateJobSummary(analysis: BuildAnalysis): void {
  const performanceStatus = getPerformanceStatus(analysis)

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
| **Build Time** | ${analysis.timestamp.split('T')[1]?.split('.')[0]} UTC |

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
  .slice(0, 10)
  .map(asset => `| \`${asset.file}\` | ${asset.size} |`)
  .join('\n')}

${analysis.assets.length > 10 ? `\n*Showing top 10 of ${analysis.assets.length} total files*` : ''}

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

  // Write to GitHub Actions step summary
  console.log(
    `::notice title=Bundle Analysis::Bundle size: ${formatBytes(analysis.totalSize)} (${analysis.fileCount} files)${analysis.budgetStatus.passed ? ' - All budgets passed' : ' - Budget violations detected'}`,
  )

  // Append to GitHub Actions step summary
  if (process.env['GITHUB_STEP_SUMMARY']) {
    writeFileSync(process.env['GITHUB_STEP_SUMMARY'], summary, {flag: 'a'})
  }
}

/**
 * Get performance status messages with icons
 */
function getPerformanceStatus(analysis: BuildAnalysis): PerformanceStatus[] {
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

function getAllFiles(dir: string, files: string[] = []): string[] {
  const dirFiles = readdirSync(dir)

  for (const file of dirFiles) {
    const filePath = join(dir, file)
    const stats = statSync(filePath)

    if (stats.isDirectory()) {
      getAllFiles(filePath, files)
    } else {
      files.push(filePath)
    }
  }

  return files
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'

  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${Number.parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`
}

// Run analysis if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  analyzeBuildOutput()
}

export {analyzeBuildOutput}
export type {AssetInfo, BudgetStatus, BuildAnalysis, HistoryEntry}
