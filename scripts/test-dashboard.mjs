#!/usr/bin/env node

/**
 * Test Dashboard Data Aggregation Script
 *
 * Aggregates test results from multiple test suites and generates comprehensive dashboard data:
 * - Unit test coverage from Vitest
 * - E2E test results from Playwright
 * - Visual regression test status
 * - Accessibility compliance metrics
 * - Performance scores from Lighthouse CI
 * - Historical trend tracking
 */

import {existsSync, promises as fs} from 'node:fs'
import {dirname, join} from 'node:path'
import process from 'node:process'
import {fileURLToPath} from 'node:url'

// Get current directory
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = join(__dirname, '..')

// Configuration
const CONFIG = {
  input: {
    coverage: join(projectRoot, 'coverage/coverage-summary.json'),
    e2eResults: join(projectRoot, 'test-results'),
    playwrightReport: join(projectRoot, 'playwright-report'),
    visualArtifacts: join(projectRoot, 'tests/visual'),
    accessibilityReports: join(projectRoot, 'accessibility-reports'),
    lighthouseReports: join(projectRoot, '.lighthouseci'),
    buildHistory: join(projectRoot, 'build-history.json'),
  },
  output: {
    dashboardDir: join(projectRoot, 'test-dashboard'),
    dataFile: join(projectRoot, 'test-dashboard/dashboard-data.json'),
    historyFile: join(projectRoot, 'test-dashboard/test-history.json'),
    summaryFile: join(projectRoot, 'test-dashboard/test-summary.json'),
  },
  retention: {
    maxHistoryEntries: 100, // Keep last 100 test runs
    maxDays: 30, // Keep data for last 30 days
  },
}

/**
 * Get current timestamp in ISO format
 */
function getCurrentTimestamp() {
  return new Date().toISOString()
}

/**
 * Load JSON file safely with error handling
 */
async function loadJsonFile(filePath, defaultValue = null) {
  try {
    if (!existsSync(filePath)) {
      return defaultValue
    }
    const content = await fs.readFile(filePath, 'utf8')
    return JSON.parse(content)
  } catch (error) {
    console.warn(`⚠️  Failed to load ${filePath}:`, error.message)
    return defaultValue
  }
}

/**
 * Save JSON file with pretty formatting
 */
async function saveJsonFile(filePath, data) {
  try {
    await fs.mkdir(dirname(filePath), {recursive: true})
    await fs.writeFile(filePath, JSON.stringify(data, null, 2))
    console.log(`✅ Saved ${filePath}`)
  } catch (error) {
    console.error(`❌ Failed to save ${filePath}:`, error.message)
  }
}

/**
 * Parse unit test coverage data from Vitest
 */
async function parseUnitTestData() {
  const coverage = await loadJsonFile(CONFIG.input.coverage, {})

  if (!coverage.total) {
    return {
      status: 'not-run',
      coverage: {statements: 0, branches: 0, functions: 0, lines: 0},
      passed: 0,
      failed: 0,
      total: 0,
    }
  }

  const totals = coverage.total
  return {
    status: 'completed',
    coverage: {
      statements: Math.round(totals.statements.pct * 100) / 100,
      branches: Math.round(totals.branches.pct * 100) / 100,
      functions: Math.round(totals.functions.pct * 100) / 100,
      lines: Math.round(totals.lines.pct * 100) / 100,
    },
    passed: totals.statements.covered || 0,
    failed: (totals.statements.total || 0) - (totals.statements.covered || 0),
    total: totals.statements.total || 0,
  }
}

/**
 * Parse E2E test results from Playwright
 */
async function parseE2ETestData() {
  try {
    // Look for Playwright report JSON
    const reportPath = join(CONFIG.input.playwrightReport, 'results.json')
    const reportData = await loadJsonFile(reportPath)

    if (!reportData) {
      // Try to analyze test-results directory structure
      if (existsSync(CONFIG.input.e2eResults)) {
        const files = await fs.readdir(CONFIG.input.e2eResults)
        const hasResults = files.some(file => file.endsWith('.json') || file.includes('test-results'))

        return {
          status: hasResults ? 'completed' : 'not-run',
          passed: 0,
          failed: 0,
          skipped: 0,
          total: 0,
          browsers: [],
          duration: 0,
        }
      }

      return {
        status: 'not-run',
        passed: 0,
        failed: 0,
        skipped: 0,
        total: 0,
        browsers: [],
        duration: 0,
      }
    }

    // Parse Playwright report data (structure varies by version)
    const stats = reportData.stats || {}
    return {
      status: stats.failed > 0 ? 'failed' : 'passed',
      passed: stats.passed || 0,
      failed: stats.failed || 0,
      skipped: stats.skipped || 0,
      total: (stats.passed || 0) + (stats.failed || 0) + (stats.skipped || 0),
      browsers: ['chromium', 'firefox', 'webkit'], // Default browsers
      duration: stats.duration || 0,
    }
  } catch (error) {
    console.warn('⚠️  Failed to parse E2E test data:', error.message)
    return {
      status: 'error',
      passed: 0,
      failed: 0,
      skipped: 0,
      total: 0,
      browsers: [],
      duration: 0,
    }
  }
}

/**
 * Parse visual regression test data
 */
async function parseVisualTestData() {
  try {
    const visualDir = CONFIG.input.visualArtifacts
    if (!existsSync(visualDir)) {
      return {status: 'not-run', totalTests: 0, passed: 0, failed: 0, baselines: 0}
    }

    const files = await fs.readdir(visualDir, {recursive: true})
    const diffFiles = files.filter(file => file.includes('-diff.png'))
    const baselineFiles = files.filter(
      file => file.endsWith('.png') && !file.includes('-actual') && !file.includes('-diff'),
    )

    return {
      status: diffFiles.length > 0 ? 'failed' : 'passed',
      totalTests: baselineFiles.length,
      passed: baselineFiles.length - diffFiles.length,
      failed: diffFiles.length,
      baselines: baselineFiles.length,
    }
  } catch (error) {
    console.warn('⚠️  Failed to parse visual test data:', error.message)
    return {status: 'error', totalTests: 0, passed: 0, failed: 0, baselines: 0}
  }
}

/**
 * Parse accessibility test data from axe-core results
 */
async function parseAccessibilityData() {
  try {
    const a11yDir = CONFIG.input.accessibilityReports
    if (!existsSync(a11yDir)) {
      return {status: 'not-run', violations: 0, passes: 0, incomplete: 0, inapplicable: 0}
    }

    // Look for axe-core report files
    const files = await fs.readdir(a11yDir)
    const reportFiles = files.filter(file => file.includes('axe') && file.endsWith('.json'))

    if (reportFiles.length === 0) {
      return {status: 'not-run', violations: 0, passes: 0, incomplete: 0, inapplicable: 0}
    }

    let totalViolations = 0
    let totalPasses = 0
    let totalIncomplete = 0
    let totalInapplicable = 0

    for (const file of reportFiles) {
      const reportPath = join(a11yDir, file)
      const report = await loadJsonFile(reportPath, {})

      if (report.violations) {
        totalViolations += report.violations.length
      }
      if (report.passes) {
        totalPasses += report.passes.length
      }
      if (report.incomplete) {
        totalIncomplete += report.incomplete.length
      }
      if (report.inapplicable) {
        totalInapplicable += report.inapplicable.length
      }
    }

    return {
      status: totalViolations > 0 ? 'failed' : 'passed',
      violations: totalViolations,
      passes: totalPasses,
      incomplete: totalIncomplete,
      inapplicable: totalInapplicable,
    }
  } catch (error) {
    console.warn('⚠️  Failed to parse accessibility data:', error.message)
    return {status: 'error', violations: 0, passes: 0, incomplete: 0, inapplicable: 0}
  }
}

/**
 * Parse performance data from Lighthouse CI
 */
async function parsePerformanceData() {
  try {
    const lhciDir = CONFIG.input.lighthouseReports
    if (!existsSync(lhciDir)) {
      return {status: 'not-run', scores: {}, metrics: {}}
    }

    // Look for manifest.json or recent LH reports
    const manifestPath = join(lhciDir, 'manifest.json')
    const manifest = await loadJsonFile(manifestPath)

    if (!manifest || !manifest.length) {
      return {status: 'not-run', scores: {}, metrics: {}}
    }

    // Get the latest report
    const latestReport = manifest.at(-1)
    const reportPath = join(lhciDir, latestReport.jsonPath || `${latestReport.url.replaceAll(/[^a-z\d]/gi, '_')}.json`)
    const report = await loadJsonFile(reportPath)

    if (!report || !report.categories) {
      return {status: 'error', scores: {}, metrics: {}}
    }

    return {
      status: 'completed',
      scores: {
        performance: Math.round((report.categories.performance?.score || 0) * 100),
        accessibility: Math.round((report.categories.accessibility?.score || 0) * 100),
        bestPractices: Math.round((report.categories['best-practices']?.score || 0) * 100),
        seo: Math.round((report.categories.seo?.score || 0) * 100),
      },
      metrics: {
        lcp: report.audits?.['largest-contentful-paint']?.numericValue || 0,
        fid: report.audits?.['first-input-delay']?.numericValue || 0,
        cls: report.audits?.['cumulative-layout-shift']?.numericValue || 0,
      },
    }
  } catch (error) {
    console.warn('⚠️  Failed to parse performance data:', error.message)
    return {status: 'error', scores: {}, metrics: {}}
  }
}

/**
 * Parse build/bundle data
 */
async function parseBuildData() {
  try {
    const buildHistory = await loadJsonFile(CONFIG.input.buildHistory, {builds: []})

    if (!buildHistory.builds || buildHistory.builds.length === 0) {
      return {status: 'not-available', size: 0, files: 0}
    }

    const latestBuild = buildHistory.builds.at(-1)
    return {
      status: 'completed',
      size: latestBuild.totalSize || 0,
      files: latestBuild.fileCount || 0,
      jsSize: latestBuild.jsSize || 0,
      cssSize: latestBuild.cssSize || 0,
    }
  } catch (error) {
    console.warn('⚠️  Failed to parse build data:', error.message)
    return {status: 'error', size: 0, files: 0}
  }
}

/**
 * Calculate overall test health score
 */
function calculateHealthScore(testData) {
  let score = 0
  let weight = 0

  // Unit tests (weight: 25%)
  if (testData.unitTests.status === 'completed') {
    const avgCoverage =
      (testData.unitTests.coverage.statements +
        testData.unitTests.coverage.branches +
        testData.unitTests.coverage.functions +
        testData.unitTests.coverage.lines) /
      4
    score += avgCoverage * 0.25
    weight += 0.25
  }

  // E2E tests (weight: 30%)
  if (testData.e2eTests.status === 'passed') {
    score += 100 * 0.3
    weight += 0.3
  } else if (testData.e2eTests.status === 'completed') {
    const passRate = testData.e2eTests.total > 0 ? (testData.e2eTests.passed / testData.e2eTests.total) * 100 : 0
    score += passRate * 0.3
    weight += 0.3
  }

  // Visual tests (weight: 15%)
  if (testData.visualTests.status === 'passed') {
    score += 100 * 0.15
    weight += 0.15
  } else if (testData.visualTests.totalTests > 0) {
    const passRate = (testData.visualTests.passed / testData.visualTests.totalTests) * 100
    score += passRate * 0.15
    weight += 0.15
  }

  // Accessibility (weight: 20%)
  if (testData.accessibility.status === 'passed') {
    score += 100 * 0.2
    weight += 0.2
  }

  // Performance (weight: 10%)
  if (testData.performance.status === 'completed') {
    const avgScore = Object.values(testData.performance.scores).reduce((a, b) => a + b, 0) / 4
    score += avgScore * 0.1
    weight += 0.1
  }

  return weight > 0 ? Math.round(score / weight) : 0
}

/**
 * Generate comprehensive test dashboard data
 */
async function generateDashboardData() {
  console.log('🔄 Generating test dashboard data...')

  const timestamp = getCurrentTimestamp()

  // Parse all test data sources
  const [unitTests, e2eTests, visualTests, accessibility, performance, build] = await Promise.all([
    parseUnitTestData(),
    parseE2ETestData(),
    parseVisualTestData(),
    parseAccessibilityData(),
    parsePerformanceData(),
    parseBuildData(),
  ])

  // Create comprehensive dashboard data
  const dashboardData = {
    timestamp,
    runId: process.env.GITHUB_RUN_ID || `local-${Date.now()}`,
    branch: process.env.GITHUB_REF_NAME || 'local',
    commit: process.env.GITHUB_SHA || 'unknown',
    testSuites: {
      unitTests,
      e2eTests,
      visualTests,
      accessibility,
      performance,
      build,
    },
    summary: {
      healthScore: 0, // Will be calculated below
      totalTests: unitTests.total + e2eTests.total + visualTests.totalTests,
      passedTests: unitTests.passed + e2eTests.passed + visualTests.passed,
      failedTests: unitTests.failed + e2eTests.failed + visualTests.failed,
      status: 'unknown',
    },
  }

  // Calculate health score
  dashboardData.summary.healthScore = calculateHealthScore(dashboardData.testSuites)

  // Determine overall status
  const hasFailures =
    dashboardData.summary.failedTests > 0 || accessibility.violations > 0 || performance.status === 'error'

  dashboardData.summary.status = hasFailures ? 'failed' : 'passed'

  return dashboardData
}

/**
 * Update test history with retention policy
 */
async function updateTestHistory(newData) {
  const history = await loadJsonFile(CONFIG.output.historyFile, {entries: []})

  // Add new entry
  history.entries.push(newData)

  // Apply retention policy
  const now = new Date()
  const maxAge = new Date(now.getTime() - CONFIG.retention.maxDays * 24 * 60 * 60 * 1000)

  history.entries = history.entries
    .filter(entry => new Date(entry.timestamp) > maxAge)
    .slice(-CONFIG.retention.maxHistoryEntries)

  // Update metadata
  history.lastUpdated = getCurrentTimestamp()
  history.totalEntries = history.entries.length

  await saveJsonFile(CONFIG.output.historyFile, history)
  return history
}

/**
 * Generate test summary with trends
 */
async function generateTestSummary(currentData, history) {
  const previousEntry = history.entries.at(-2) // Get previous run

  const summary = {
    current: currentData.summary,
    trends: {},
    lastRun: previousEntry ? previousEntry.timestamp : null,
  }

  if (previousEntry) {
    // Calculate trends
    summary.trends = {
      healthScore: currentData.summary.healthScore - previousEntry.summary.healthScore,
      coverage: {
        statements:
          currentData.testSuites.unitTests.coverage.statements - previousEntry.testSuites.unitTests.coverage.statements,
      },
      performance:
        currentData.testSuites.performance.scores.performance -
        (previousEntry.testSuites.performance.scores?.performance || 0),
    }
  }

  await saveJsonFile(CONFIG.output.summaryFile, summary)
  return summary
}

/**
 * Main execution function
 */
async function main() {
  try {
    // Generate current dashboard data
    const dashboardData = await generateDashboardData()

    // Save dashboard data
    await saveJsonFile(CONFIG.output.dataFile, dashboardData)

    // Update history
    const history = await updateTestHistory(dashboardData)

    // Generate summary with trends
    const summary = await generateTestSummary(dashboardData, history)

    // Output summary to console
    console.log('\n📊 Test Dashboard Summary:')
    console.log(`🎯 Health Score: ${dashboardData.summary.healthScore}%`)
    console.log(`✅ Passed: ${dashboardData.summary.passedTests}`)
    console.log(`❌ Failed: ${dashboardData.summary.failedTests}`)
    console.log(`📈 Total: ${dashboardData.summary.totalTests}`)

    if (summary.trends.healthScore !== undefined) {
      const trend = summary.trends.healthScore > 0 ? '📈' : summary.trends.healthScore < 0 ? '📉' : '➡️'
      console.log(
        `${trend} Health Score Change: ${summary.trends.healthScore > 0 ? '+' : ''}${summary.trends.healthScore}%`,
      )
    }

    console.log('\n✅ Test dashboard data generation completed successfully!')

    // Return data for external use
    return {dashboardData, history, summary}
  } catch (error) {
    console.error('❌ Test dashboard generation failed:', error)
    process.exit(1)
  }
}

// CLI handling
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}

export {generateDashboardData, parseE2ETestData, parseUnitTestData, parseVisualTestData}
