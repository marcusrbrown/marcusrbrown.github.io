#!/usr/bin/env node
/**
 * Test Artifact Management Script
 *
 * This script manages test result artifacts, implements retention policies,
 * and provides cleanup automation for the comprehensive testing suite.
 */

import {execSync} from 'node:child_process'
import {existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync} from 'node:fs'
import {join, resolve} from 'node:path'
import process from 'node:process'

// Artifact management configuration
const ARTIFACT_CONFIG = {
  // Base directories for artifacts
  baseDir: process.cwd(),
  artifactDirs: {
    coverage: 'coverage',
    testResults: 'test-results',
    playwrightReport: 'playwright-report',
    badges: 'badges',
    testDashboard: 'test-dashboard',
    performance: 'lighthouse-reports',
  },

  // Retention policies (in days)
  retentionPolicies: {
    coverage: 30, // Unit test coverage reports
    testResults: 30, // Playwright test results
    playwrightReport: 7, // Playwright HTML reports
    badges: 90, // Badge generation data
    testDashboard: 90, // Test dashboard data
    performance: 90, // Performance test results
    visualBaselines: -1, // Visual regression baselines (permanent)
  },

  // Size limits (in MB)
  sizeLimits: {
    total: 500, // Total artifact storage limit
    coverage: 50, // Coverage reports limit
    testResults: 200, // Test results limit
    playwrightReport: 100, // Playwright reports limit
    performance: 100, // Performance reports limit
  },

  // Artifact patterns to preserve
  preservePatterns: [
    '**/baseline-*.png', // Visual regression baselines
    '**/test-summary.json', // Summary files
    '**/badges.json', // Badge data
    '**/latest-*', // Latest result files
  ],
}

/**
 * Get directory size in MB
 */
function getDirectorySize(dirPath) {
  if (!existsSync(dirPath)) return 0

  let totalSize = 0

  function calculateSize(currentPath) {
    const stats = statSync(currentPath)

    if (stats.isDirectory()) {
      const files = readdirSync(currentPath)
      for (const file of files) {
        calculateSize(join(currentPath, file))
      }
    } else {
      totalSize += stats.size
    }
  }

  calculateSize(dirPath)
  return totalSize / (1024 * 1024) // Convert to MB
}

/**
 * Get file age in days
 */
function getFileAge(filePath) {
  const stats = statSync(filePath)
  const now = new Date()
  const ageInMs = now.getTime() - stats.mtime.getTime()
  return Math.floor(ageInMs / (1000 * 60 * 60 * 24))
}

/**
 * Check if file matches preserve patterns
 */
function shouldPreserveFile(filePath) {
  return ARTIFACT_CONFIG.preservePatterns.some(pattern => {
    // Simple glob pattern matching
    const regex = new RegExp(pattern.replaceAll('*', '.*'))
    return regex.test(filePath)
  })
}

/**
 * Clean up old artifacts based on retention policies
 */
function cleanupOldArtifacts() {
  console.log('🧹 Starting artifact cleanup...')

  let totalCleaned = 0
  let totalFiles = 0

  for (const [type, retentionDays] of Object.entries(ARTIFACT_CONFIG.retentionPolicies)) {
    if (retentionDays === -1) continue // Skip permanent artifacts

    const dirPath = resolve(ARTIFACT_CONFIG.baseDir, ARTIFACT_CONFIG.artifactDirs[type] || type)
    if (!existsSync(dirPath)) continue

    console.log(`📂 Cleaning ${type} artifacts (retention: ${retentionDays} days)...`)

    function cleanDirectory(currentPath) {
      const files = readdirSync(currentPath, {withFileTypes: true})

      for (const file of files) {
        const filePath = join(currentPath, file.name)

        if (file.isDirectory()) {
          cleanDirectory(filePath)

          // Remove empty directories
          try {
            const remainingFiles = readdirSync(filePath)
            if (remainingFiles.length === 0) {
              unlinkSync(filePath)
              console.log(`  🗑️  Removed empty directory: ${filePath}`)
            }
          } catch {
            // Directory not empty or other error, skip
          }
        } else {
          totalFiles++
          const age = getFileAge(filePath)

          if (age > retentionDays && !shouldPreserveFile(filePath)) {
            try {
              unlinkSync(filePath)
              totalCleaned++
              console.log(`  🗑️  Removed old file: ${file.name} (${age} days old)`)
            } catch (error) {
              console.warn(`  ⚠️  Could not remove ${file.name}: ${error.message}`)
            }
          }
        }
      }
    }

    cleanDirectory(dirPath)
  }

  console.log(`✅ Cleanup complete: ${totalCleaned}/${totalFiles} files removed`)
  return {totalCleaned, totalFiles}
}

/**
 * Check artifact storage usage against limits
 */
function checkStorageLimits() {
  console.log('📊 Checking artifact storage usage...')

  const usage = {}
  let totalSize = 0

  for (const [type, dirName] of Object.entries(ARTIFACT_CONFIG.artifactDirs)) {
    const dirPath = resolve(ARTIFACT_CONFIG.baseDir, dirName)
    const size = getDirectorySize(dirPath)
    usage[type] = size
    totalSize += size

    const limit = ARTIFACT_CONFIG.sizeLimits[type]
    const status = limit && size > limit ? '❌' : '✅'

    console.log(`  ${status} ${type}: ${size.toFixed(2)} MB${limit ? ` / ${limit} MB` : ''}`)
  }

  usage.total = totalSize
  const totalLimit = ARTIFACT_CONFIG.sizeLimits.total
  const totalStatus = totalSize > totalLimit ? '❌' : '✅'

  console.log(`  ${totalStatus} Total: ${totalSize.toFixed(2)} MB / ${totalLimit} MB`)

  return usage
}

/**
 * Archive important artifacts
 */
function archiveArtifacts() {
  console.log('📦 Archiving important artifacts...')

  const archiveDir = resolve(ARTIFACT_CONFIG.baseDir, 'archived-artifacts')
  if (!existsSync(archiveDir)) {
    mkdirSync(archiveDir, {recursive: true})
  }

  const timestamp = new Date().toISOString().replaceAll(/[:.]/g, '-')

  // Archive latest test results
  const archivePaths = ['test-dashboard/test-summary.json', 'badges/badges.json', 'coverage/coverage-summary.json']

  for (const relativePath of archivePaths) {
    const sourcePath = resolve(ARTIFACT_CONFIG.baseDir, relativePath)
    if (existsSync(sourcePath)) {
      const archivePath = resolve(archiveDir, `${timestamp}-${relativePath.replaceAll(/[/\\]/g, '-')}`)

      try {
        const content = readFileSync(sourcePath, 'utf8')
        writeFileSync(archivePath, content)
        console.log(`  📦 Archived: ${relativePath}`)
      } catch (error) {
        console.warn(`  ⚠️  Could not archive ${relativePath}: ${error.message}`)
      }
    }
  }
}

/**
 * Generate artifact management report
 */
function generateReport() {
  console.log('📋 Generating artifact management report...')

  const usage = checkStorageLimits()
  const report = {
    timestamp: new Date().toISOString(),
    storage: usage,
    limits: ARTIFACT_CONFIG.sizeLimits,
    retentionPolicies: ARTIFACT_CONFIG.retentionPolicies,
    recommendations: [],
  }

  // Generate recommendations
  for (const [type, size] of Object.entries(usage)) {
    const limit = ARTIFACT_CONFIG.sizeLimits[type]
    if (limit && size > limit * 0.8) {
      report.recommendations.push({
        type: 'storage',
        severity: size > limit ? 'high' : 'medium',
        message: `${type} storage usage is ${size > limit ? 'over' : 'approaching'} limit (${size.toFixed(2)}/${limit} MB)`,
        suggestion: 'Consider running cleanup or adjusting retention policies',
      })
    }
  }

  if (usage.total > ARTIFACT_CONFIG.sizeLimits.total * 0.9) {
    report.recommendations.push({
      type: 'storage',
      severity: 'high',
      message: `Total storage usage is approaching limit (${usage.total.toFixed(2)}/${ARTIFACT_CONFIG.sizeLimits.total} MB)`,
      suggestion: 'Run artifact cleanup or increase storage limits',
    })
  }

  // Save report
  const reportPath = resolve(ARTIFACT_CONFIG.baseDir, 'test-dashboard', 'artifact-report.json')
  if (!existsSync(resolve(ARTIFACT_CONFIG.baseDir, 'test-dashboard'))) {
    mkdirSync(resolve(ARTIFACT_CONFIG.baseDir, 'test-dashboard'), {recursive: true})
  }

  writeFileSync(reportPath, JSON.stringify(report, null, 2))
  console.log(`📋 Report saved to: ${reportPath}`)

  return report
}

/**
 * Optimize artifact storage
 */
function optimizeStorage() {
  console.log('⚡ Optimizing artifact storage...')

  // Compress large files
  const compressionCommands = [
    String.raw`find coverage -name "*.html" -size +1M -exec gzip {} \;`,
    String.raw`find playwright-report -name "*.html" -size +500k -exec gzip {} \;`,
    String.raw`find test-results -name "*.json" -size +100k -exec gzip {} \;`,
  ]

  for (const cmd of compressionCommands) {
    try {
      execSync(cmd, {cwd: ARTIFACT_CONFIG.baseDir, stdio: 'pipe'})
      console.log(`  ⚡ Compressed files: ${cmd}`)
    } catch {
      // Command failed, likely no files to compress
    }
  }

  // Remove duplicate visual test artifacts
  try {
    const visualDir = resolve(ARTIFACT_CONFIG.baseDir, 'test-results')
    if (existsSync(visualDir)) {
      // Find and remove duplicate screenshots (keep only latest)
      execSync('find test-results -name "*-retry*" -delete', {
        cwd: ARTIFACT_CONFIG.baseDir,
        stdio: 'pipe',
      })
      console.log('  🗑️  Removed retry screenshots')
    }
  } catch {
    // No retry screenshots found
  }
}

/**
 * Main execution function
 */
async function main() {
  console.log('🗃️  Test Artifact Management Tool')
  console.log('==================================\n')

  const args = process.argv.slice(2)
  const command = args[0] || 'status'

  switch (command) {
    case 'status': {
      const usage = checkStorageLimits()
      console.log('\n📈 Storage Usage Summary:')
      console.log(`Total artifacts: ${usage.total.toFixed(2)} MB`)
      break
    }

    case 'cleanup': {
      const result = cleanupOldArtifacts()
      console.log(`\n📈 Cleanup Summary: ${result.totalCleaned} files removed`)
      break
    }

    case 'archive': {
      archiveArtifacts()
      break
    }

    case 'optimize': {
      optimizeStorage()
      checkStorageLimits()
      break
    }

    case 'report': {
      const report = generateReport()
      console.log('\n📋 Artifact Management Report:')
      console.log(JSON.stringify(report, null, 2))
      break
    }

    case 'full': {
      console.log('🔄 Running full artifact management...')
      archiveArtifacts()
      const cleanup = cleanupOldArtifacts()
      optimizeStorage()
      const usage = checkStorageLimits()
      const report = generateReport()

      console.log('\n📈 Full Management Summary:')
      console.log(`Files cleaned: ${cleanup.totalCleaned}`)
      console.log(`Storage used: ${usage.total.toFixed(2)} MB`)
      console.log(`Recommendations: ${report.recommendations.length}`)
      break
    }

    case 'help':
    default: {
      console.log('📖 Usage:')
      console.log('   pnpm run artifacts [command]')
      console.log('')
      console.log('📋 Commands:')
      console.log('   status      - Show current storage usage')
      console.log('   cleanup     - Clean up old artifacts based on retention policies')
      console.log('   archive     - Archive important test results')
      console.log('   optimize    - Optimize storage (compress, deduplicate)')
      console.log('   report      - Generate comprehensive artifact report')
      console.log('   full        - Run complete artifact management cycle')
      console.log('   help        - Show this help')
      console.log('')
      console.log('💡 Examples:')
      console.log('   pnpm run artifacts status')
      console.log('   pnpm run artifacts cleanup')
      console.log('   pnpm run artifacts full')
      break
    }
  }
}

// Execute main function
main().catch(error => {
  console.error('💥 Error:', error.message)
  process.exit(1)
})
