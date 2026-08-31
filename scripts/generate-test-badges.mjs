#!/usr/bin/env node

/**
 * Test Badge Generation Script
 *
 * Generates comprehensive testing badges for README.md including:
 * - Unit test coverage (from Vitest/Istanbul V8 coverage)
 * - E2E test status (from Playwright test results)
 * - Visual regression test status
 * - Accessibility compliance score
 * - Performance score (from Lighthouse CI)
 * - Bundle size metrics
 * - CI/CD pipeline status
 */

import {existsSync, promises as fs} from 'node:fs'
import {dirname, join, resolve} from 'node:path'
import process from 'node:process'
import {fileURLToPath} from 'node:url'

// Get current directory
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = join(__dirname, '..')

// Configuration
const CONFIG = {
  coverage: {
    summaryFile: join(projectRoot, 'coverage/coverage-summary.json'),
    thresholds: {
      excellent: 95,
      good: 85,
      warning: 70,
      error: 50,
    },
  },
  badges: {
    outputDir: join(projectRoot, 'badges'),
    shieldsBaseUrl: 'https://img.shields.io/badge',
  },
  colors: {
    excellent: 'brightgreen',
    good: 'green',
    warning: 'yellow',
    error: 'red',
    critical: 'critical',
  },
}

/**
 * Get badge color based on percentage and thresholds
 */
function getBadgeColor(percentage, thresholds = CONFIG.coverage.thresholds) {
  if (percentage >= thresholds.excellent) return CONFIG.colors.excellent
  if (percentage >= thresholds.good) return CONFIG.colors.good
  if (percentage >= thresholds.warning) return CONFIG.colors.warning
  if (percentage >= thresholds.error) return CONFIG.colors.error
  return CONFIG.colors.critical
}

/**
 * Format percentage for display
 */
function formatPercentage(value) {
  return Math.round(value * 100) / 100
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
  } catch {
    return defaultValue
  }
}

/**
 * Read a JSON file while preserving the distinction between missing and invalid data.
 */
async function readJsonFile(filePath) {
  if (!existsSync(filePath)) return {status: 'missing'}

  try {
    return {status: 'valid', value: JSON.parse(await fs.readFile(filePath, 'utf8'))}
  } catch {
    return {status: 'error'}
  }
}

/**
 * Decide whether a Playwright project belongs to the requested suite.
 */
function isProjectInSuite(projectName, suite) {
  if (typeof projectName !== 'string') return false
  return suite === 'visual'
    ? projectName.toLowerCase().includes('visual')
    : !/visual|accessibility|performance/i.test(projectName)
}

/**
 * Derive one test's outcome from its actual attempts.
 * A test that passes only after a failed retry is treated as flaky and non-green.
 */
function getTestOutcome(test) {
  const results = Array.isArray(test?.results) ? test.results : []
  const statuses = results.map(result => result?.status)

  if (statuses.length === 0 || statuses.every(status => status === 'skipped')) return 'skipped'
  if (statuses.includes('passed') && statuses.some(status => status !== 'passed')) return 'flaky'
  if (statuses.every(status => status === 'passed')) return 'passed'
  return 'failed'
}

/**
 * Parse only tests belonging to one Playwright suite.
 */
function parsePlaywrightReport(report, suite) {
  if (!report || !Array.isArray(report.suites)) return null

  const counts = {total: 0, passed: 0, failed: 0, skipped: 0, flaky: 0}
  const collectTests = currentSuite => {
    for (const spec of currentSuite?.specs || []) {
      for (const test of spec.tests || []) {
        if (!isProjectInSuite(test.projectName, suite)) continue

        const outcome = getTestOutcome(test)
        counts.total += 1
        counts[outcome] += 1
      }
    }
    for (const childSuite of currentSuite?.suites || []) collectTests(childSuite)
  }

  for (const currentSuite of report.suites) collectTests(currentSuite)
  if (counts.total === 0) return null

  const failures = counts.failed + counts.flaky
  return {
    ...counts,
    status: counts.passed === 0 && counts.skipped === counts.total ? 'not run' : failures > 0 ? 'failing' : 'passing',
  }
}

/**
 * Find and parse the Playwright JSON report used by the E2E and visual jobs.
 */
async function getPlaywrightReportStatus(root, suite) {
  const reportPaths = [join(root, 'test-results/results.json'), join(root, 'playwright-report/results.json')]
  const artifactRoot = join(root, 'test-artifacts')
  if (existsSync(artifactRoot)) {
    const artifactFiles = await fs.readdir(artifactRoot, {recursive: true})
    reportPaths.push(
      ...artifactFiles.filter(file => file.endsWith('results.json')).map(file => join(artifactRoot, file)),
    )
  }

  const uniqueReportPaths = [...new Set(reportPaths)]
  const combined = {total: 0, passed: 0, failed: 0, skipped: 0, flaky: 0}
  let foundReport = false

  for (const reportPath of uniqueReportPaths) {
    const result = await readJsonFile(reportPath)
    if (result.status === 'missing') continue

    if (result.status === 'error') return 'error'
    const parsed = parsePlaywrightReport(result.value, suite)
    if (!parsed) continue

    foundReport = true
    for (const key of Object.keys(combined)) combined[key] += parsed[key]
  }

  if (!foundReport) return 'not run'

  const failures = combined.failed + combined.flaky
  if (combined.passed === 0 && combined.skipped === combined.total) return 'not run'
  const status = failures > 0 ? 'failing' : 'passing'
  return `${status} (${combined.passed}/${combined.total})`
}

/**
 * Parse a Lighthouse report and return its performance score.
 */
async function getLighthouseScore(root) {
  const lighthouseDir = join(root, '.lighthouseci')
  if (!existsSync(lighthouseDir)) return {status: 'missing'}

  const files = await fs.readdir(lighthouseDir)
  const reportFiles = files
    .filter(file => file.endsWith('.json') && file !== 'manifest.json' && file !== 'assertion-results.json')
    .sort()
  const latestReport = reportFiles.at(-1)
  if (!latestReport) return {status: 'missing'}

  const result = await readJsonFile(join(lighthouseDir, latestReport))
  if (result.status !== 'valid') return {status: 'error'}

  const score = result.value?.categories?.performance?.score
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 1) return {status: 'error'}

  return {status: 'valid', score: Math.round(score * 100)}
}

/**
 * Parse the build-analysis history written by scripts/analyze-build.ts.
 */
async function getBundleSize(root) {
  const result = await readJsonFile(join(root, 'build-history.json'))
  if (result.status === 'missing') return {status: 'missing'}
  if (result.status === 'error') return {status: 'error'}

  const builds = Array.isArray(result.value) ? result.value : result.value?.builds
  const latestBuild = builds?.at(-1)
  const totalSize = latestBuild?.totalSize
  if (!Array.isArray(builds) || typeof totalSize !== 'number' || !Number.isFinite(totalSize) || totalSize <= 0) {
    return {status: 'error'}
  }

  return {status: 'valid', totalSize}
}

/**
 * Parse axe-core report files and derive an accessibility status.
 */
async function getAccessibilityStatus(root) {
  const accessibilityDir = join(root, 'accessibility-reports')
  if (!existsSync(accessibilityDir)) return 'not tested'

  const files = (await fs.readdir(accessibilityDir)).filter(file => file.includes('axe') && file.endsWith('.json'))
  if (files.length === 0) return 'not tested'

  let violations = 0
  let incomplete = 0
  for (const file of files) {
    const result = await readJsonFile(join(accessibilityDir, file))
    if (result.status !== 'valid') return 'error'

    const report = result.value
    if (!Array.isArray(report?.violations) || !Array.isArray(report?.incomplete)) return 'error'
    violations += report.violations.length
    incomplete += report.incomplete.length
  }

  if (violations > 0) return `${violations} violations`
  if (incomplete > 0) return 'incomplete'
  return 'AA compliant'
}

/**
 * Generate shield.io compatible badge URL
 */
function generateBadgeUrl(label, message, color, style = 'flat') {
  const encodedLabel = encodeURIComponent(label)
  const encodedMessage = encodeURIComponent(message)
  return `${CONFIG.badges.shieldsBaseUrl}/${encodedLabel}-${encodedMessage}-${color}?style=${style}`
}

/**
 * Generate coverage badge data from Vitest coverage summary
 */
async function generateCoverageBadges() {
  const badges = {}

  try {
    if (!existsSync(CONFIG.coverage.summaryFile)) {
      console.warn('⚠️  Coverage summary file not found. Run tests with coverage first.')
      return {
        unitTests: generateBadgeUrl('unit tests', 'not run', 'lightgrey'),
        statements: generateBadgeUrl('statements', 'not run', 'lightgrey'),
        branches: generateBadgeUrl('branches', 'not run', 'lightgrey'),
        functions: generateBadgeUrl('functions', 'not run', 'lightgrey'),
        lines: generateBadgeUrl('lines', 'not run', 'lightgrey'),
      }
    }

    const coverageData = JSON.parse(await fs.readFile(CONFIG.coverage.summaryFile, 'utf8'))
    const totals = coverageData.total

    // Overall coverage badge (using statements as primary metric)
    const overallPercentage = formatPercentage(totals.statements.pct)
    const overallColor = getBadgeColor(overallPercentage)
    badges.unitTests = generateBadgeUrl('unit tests', `${overallPercentage}%`, overallColor)

    // Individual metric badges
    const metrics = ['statements', 'branches', 'functions', 'lines']
    for (const metric of metrics) {
      const percentage = formatPercentage(totals[metric].pct)
      const color = getBadgeColor(percentage)
      badges[metric] = generateBadgeUrl(metric, `${percentage}%`, color)
    }

    console.log('✅ Generated coverage badges')
    return badges
  } catch (error) {
    console.error('❌ Error generating coverage badges:', error)
    return {
      unitTests: generateBadgeUrl('unit tests', 'error', 'red'),
      statements: generateBadgeUrl('statements', 'error', 'red'),
      branches: generateBadgeUrl('branches', 'error', 'red'),
      functions: generateBadgeUrl('functions', 'error', 'red'),
      lines: generateBadgeUrl('lines', 'error', 'red'),
    }
  }
}

/**
 * Generate E2E test status badge from Playwright results
 */
async function generateE2EBadges(root = projectRoot) {
  try {
    const [e2eStatus, visualStatus] = await Promise.all([
      getPlaywrightReportStatus(root, 'e2e'),
      getPlaywrightReportStatus(root, 'visual'),
    ])
    const e2eColor = e2eStatus.startsWith('passing')
      ? CONFIG.colors.excellent
      : e2eStatus.startsWith('failing')
        ? CONFIG.colors.error
        : 'lightgrey'
    const visualColor = visualStatus.startsWith('passing')
      ? CONFIG.colors.excellent
      : visualStatus.startsWith('failing')
        ? CONFIG.colors.error
        : 'lightgrey'

    return {
      e2eTests: generateBadgeUrl('e2e tests', e2eStatus, e2eColor),
      visualTests: generateBadgeUrl('visual tests', visualStatus, visualColor),
    }
  } catch (error) {
    console.error('❌ Error generating E2E badges:', error)
    return {
      e2eTests: generateBadgeUrl('e2e tests', 'error', 'red'),
      visualTests: generateBadgeUrl('visual tests', 'error', 'red'),
    }
  }
}

/**
 * Generate accessibility badge from axe-core results
 */
async function generateAccessibilityBadges(root = projectRoot) {
  try {
    const status = await getAccessibilityStatus(root)
    const color =
      status === 'AA compliant'
        ? CONFIG.colors.excellent
        : status.includes('violations') || status === 'error'
          ? CONFIG.colors.error
          : 'lightgrey'
    return {
      accessibility: generateBadgeUrl('accessibility', status, color),
    }
  } catch (error) {
    console.error('❌ Error generating accessibility badges:', error)
    return {
      accessibility: generateBadgeUrl('accessibility', 'error', 'red'),
    }
  }
}

/**
 * Generate performance badges from Lighthouse CI results
 */
async function generatePerformanceBadges(root = projectRoot) {
  try {
    const [lighthouse, bundle] = await Promise.all([getLighthouseScore(root), getBundleSize(root)])
    const performanceStatus =
      lighthouse.status === 'valid' ? `${lighthouse.score}/100` : lighthouse.status === 'error' ? 'error' : 'not run'
    const bundleStatus =
      bundle.status === 'valid'
        ? `${Math.round(bundle.totalSize / 1024)}KB`
        : bundle.status === 'error'
          ? 'error'
          : 'unknown'

    return {
      performance: generateBadgeUrl(
        'lighthouse',
        performanceStatus,
        lighthouse.status === 'valid'
          ? getBadgeColor(lighthouse.score)
          : lighthouse.status === 'error'
            ? CONFIG.colors.error
            : 'lightgrey',
      ),
      bundleSize: generateBadgeUrl(
        'bundle size',
        bundleStatus,
        bundle.status === 'valid' ? CONFIG.colors.good : bundle.status === 'error' ? CONFIG.colors.error : 'lightgrey',
      ),
    }
  } catch (error) {
    console.error('❌ Error generating performance badges:', error)
    return {
      performance: generateBadgeUrl('lighthouse', 'error', 'red'),
      bundleSize: generateBadgeUrl('bundle size', 'error', 'red'),
    }
  }
}

/**
 * Generate CI/CD status badge
 */
async function generateCIBadges() {
  try {
    // Try to read dashboard data for health score
    const dashboardDataFile = join(projectRoot, 'test-dashboard/dashboard-data.json')
    const dashboardData = await loadJsonFile(dashboardDataFile)

    if (dashboardData?.summary?.healthScore !== undefined) {
      const healthScore = dashboardData.summary.healthScore
      const color = getBadgeColor(healthScore)
      const dashboardStatus = dashboardData.summary.status
      const cicdStatus = dashboardStatus === 'passed' ? 'passing' : dashboardStatus === 'failed' ? 'failing' : 'not run'
      const cicdColor =
        dashboardStatus === 'passed'
          ? CONFIG.colors.excellent
          : dashboardStatus === 'failed'
            ? CONFIG.colors.error
            : 'lightgrey'

      return {
        cicd: generateBadgeUrl('CI/CD', cicdStatus, cicdColor),
        healthScore: generateBadgeUrl(
          'test health',
          dashboardStatus === 'passed' || dashboardStatus === 'failed' ? `${healthScore}%` : 'unknown',
          dashboardStatus === 'passed' || dashboardStatus === 'failed' ? color : 'lightgrey',
        ),
      }
    }

    return {
      cicd: generateBadgeUrl('CI/CD', 'not run', 'lightgrey'),
      healthScore: generateBadgeUrl('test health', 'unknown', 'lightgrey'),
    }
  } catch (error) {
    console.error('❌ Error generating CI badges:', error)
    return {
      cicd: generateBadgeUrl('CI/CD', 'error', 'red'),
      healthScore: generateBadgeUrl('test health', 'error', 'red'),
    }
  }
}

/**
 * Generate all badges and return badge data
 */
async function generateAllBadges() {
  console.log('🔄 Generating test badges...')

  const [coverage, e2e, accessibility, performance, ci] = await Promise.all([
    generateCoverageBadges(),
    generateE2EBadges(),
    generateAccessibilityBadges(),
    generatePerformanceBadges(),
    generateCIBadges(),
  ])

  const allBadges = {
    ...coverage,
    ...e2e,
    ...accessibility,
    ...performance,
    ...ci,
  }

  return allBadges
}

/**
 * Save badge URLs to JSON file for use by other tools
 */
async function saveBadgeData(badges) {
  try {
    // Ensure badges directory exists
    await fs.mkdir(CONFIG.badges.outputDir, {recursive: true})

    const badgeDataFile = join(CONFIG.badges.outputDir, 'badges.json')
    const badgeData = {
      generated: new Date().toISOString(),
      badges,
    }

    await fs.writeFile(badgeDataFile, JSON.stringify(badgeData, null, 2))
    console.log(`✅ Badge data saved to ${badgeDataFile}`)
  } catch (error) {
    console.error('❌ Error saving badge data:', error)
  }
}

/**
 * Generate markdown for README badges section
 */
function generateBadgeMarkdown(badges) {
  return `<!-- Testing Badges - Auto-generated by scripts/generate-test-badges.mjs -->
## Testing Status

[![Unit Tests](${badges.unitTests})](./coverage/index.html)
[![E2E Tests](${badges.e2eTests})](./playwright-report/index.html)
[![Visual Regression](${badges.visualTests})](./test-results/)
[![Accessibility](${badges.accessibility})](./test-results/)
[![Performance](${badges.performance})](https://lighthouse-dot-webdotdevsite.appspot.com//lh/html?url=https%3A%2F%2Fmrbro.dev)
[![Bundle Size](${badges.bundleSize})](./build-analysis/)
[![CI/CD](${badges.cicd})](../../actions)
[![Test Health](${badges.healthScore})](./test-dashboard/)

### Coverage Details
- **Statements**: ![Statements](${badges.statements})
- **Branches**: ![Branches](${badges.branches})
- **Functions**: ![Functions](${badges.functions})
- **Lines**: ![Lines](${badges.lines})

### Test Suite Status
- **Unit Tests**: Comprehensive test coverage with Vitest
- **E2E Tests**: Cross-browser testing with Playwright (Chromium, Firefox, WebKit)
- **Visual Regression**: Automated screenshot comparisons across themes
- **Accessibility**: WCAG 2.1 AA compliance testing with axe-core
- **Performance**: Lighthouse CI monitoring with Core Web Vitals
- **Bundle Analysis**: JavaScript bundle size tracking and optimization
`
}

/**
 * Main execution function
 */
async function main() {
  try {
    const badges = await generateAllBadges()
    await saveBadgeData(badges)

    // Output markdown for README
    const markdown = generateBadgeMarkdown(badges)
    console.log('\n📝 Badge Markdown for README.md:\n')
    console.log(markdown)

    console.log('\n✅ Badge generation completed successfully!')
  } catch (error) {
    console.error('❌ Badge generation failed:', error)
    process.exit(1)
  }
}

// CLI handling
if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  main()
}

export {
  generateAccessibilityBadges,
  generateAllBadges,
  generateBadgeMarkdown,
  generateCoverageBadges,
  generateE2EBadges,
  generatePerformanceBadges,
}
