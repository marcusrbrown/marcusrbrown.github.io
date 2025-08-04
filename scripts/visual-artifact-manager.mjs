#!/usr/bin/env node

/**
 * Visual Test Artifact Manager
 *
 * Provides comprehensive management of visual regression test artifacts including:
 * - Cleanup of old screenshots and diff images
 * - Storage optimization and compression
 * - Artifact retention policies
 * - CI/CD integration utilities
 */

import {existsSync, promises as fs, statSync} from 'node:fs'
import {dirname, join, relative} from 'node:path'
import process from 'node:process'
import {fileURLToPath} from 'node:url'

// Get current directory
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = join(__dirname, '..')

// Configuration
const CONFIG = {
  // Artifact directories to manage
  directories: [
    'test-results',
    'playwright-report',
    'tests/visual/**/*-actual.png',
    'tests/visual/**/*-diff.png',
    'tests/visual/**/*-expected.png',
  ],

  // Retention policies (in days)
  retentionPolicy: {
    screenshots: 30, // Keep baseline screenshots for 30 days
    diffs: 7, // Keep diff images for 7 days
    reports: 14, // Keep test reports for 14 days
    actualImages: 3, // Keep actual (failed) images for 3 days
  },

  // Size thresholds for warnings (in MB)
  sizeThresholds: {
    warning: 100, // Warn if artifacts exceed 100MB
    critical: 500, // Critical if artifacts exceed 500MB
  },

  // File patterns to clean
  patterns: {
    screenshots: ['**/*-actual.png', '**/*-diff.png'],
    reports: ['**/index.html', '**/*.json'],
    logs: ['**/*.log', '**/*.trace'],
  },
}

/**
 * Get file age in days
 */
function getFileAgeDays(filePath) {
  const stats = statSync(filePath)
  const now = new Date()
  const ageMs = now.getTime() - stats.mtime.getTime()
  return Math.floor(ageMs / (1000 * 60 * 60 * 24))
}

/**
 * Get directory size in bytes
 */
async function getDirectorySize(dirPath) {
  if (!existsSync(dirPath)) return 0

  let totalSize = 0
  const files = await fs.readdir(dirPath, {recursive: true, withFileTypes: true})

  for (const file of files) {
    if (file.isFile()) {
      const filePath = join(file.path || dirPath, file.name)
      const stats = await fs.stat(filePath)
      totalSize += stats.size
    }
  }

  return totalSize
}

/**
 * Format bytes to human-readable format
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`
}

/**
 * Clean old artifacts based on retention policy
 */
async function cleanOldArtifacts(dryRun = false) {
  const results = {
    deletedFiles: 0,
    freedSpace: 0,
    errors: [],
  }

  console.log(`🧹 Starting artifact cleanup ${dryRun ? '(DRY RUN)' : ''}...`)

  // Clean test results directory
  const testResultsDir = join(projectRoot, 'test-results')
  if (existsSync(testResultsDir)) {
    const files = await fs.readdir(testResultsDir, {recursive: true, withFileTypes: true})

    for (const file of files) {
      if (file.isFile()) {
        const filePath = join(file.path || testResultsDir, file.name)
        const ageInDays = getFileAgeDays(filePath)
        const stats = await fs.stat(filePath)

        // Apply retention policy based on file type
        let shouldDelete = false
        if (file.name.includes('-actual.png') && ageInDays > CONFIG.retentionPolicy.actualImages) {
          shouldDelete = true
        } else if (file.name.includes('-diff.png') && ageInDays > CONFIG.retentionPolicy.diffs) {
          shouldDelete = true
        } else if (file.name.endsWith('.html') && ageInDays > CONFIG.retentionPolicy.reports) {
          shouldDelete = true
        }

        if (shouldDelete) {
          try {
            if (!dryRun) {
              await fs.unlink(filePath)
            }
            results.deletedFiles++
            results.freedSpace += stats.size
            console.log(
              `  ✅ ${dryRun ? 'Would delete' : 'Deleted'}: ${relative(projectRoot, filePath)} (${formatBytes(stats.size)}, ${ageInDays}d old)`,
            )
          } catch (error) {
            results.errors.push(`Failed to delete ${filePath}: ${error.message}`)
            console.error(`  ❌ Error deleting ${filePath}:`, error.message)
          }
        }
      }
    }
  }

  // Clean playwright report directory
  const reportDir = join(projectRoot, 'playwright-report')
  if (existsSync(reportDir)) {
    const ageInDays = getFileAgeDays(reportDir)
    if (ageInDays > CONFIG.retentionPolicy.reports) {
      try {
        if (!dryRun) {
          await fs.rm(reportDir, {recursive: true, force: true})
        }
        const dirSize = await getDirectorySize(reportDir)
        results.freedSpace += dirSize
        console.log(
          `  ✅ ${dryRun ? 'Would delete' : 'Deleted'}: playwright-report/ (${formatBytes(dirSize)}, ${ageInDays}d old)`,
        )
      } catch (error) {
        results.errors.push(`Failed to delete playwright-report: ${error.message}`)
        console.error(`  ❌ Error deleting playwright-report:`, error.message)
      }
    }
  }

  return results
}

/**
 * Analyze artifact storage usage
 */
async function analyzeStorage() {
  console.log('📊 Analyzing visual test artifact storage...')

  const analysis = {
    totalSize: 0,
    directories: {},
    warnings: [],
  }

  // Analyze each artifact directory
  const directories = ['test-results', 'playwright-report', 'coverage']

  for (const dir of directories) {
    const dirPath = join(projectRoot, dir)
    if (existsSync(dirPath)) {
      const size = await getDirectorySize(dirPath)
      analysis.directories[dir] = {
        size,
        formattedSize: formatBytes(size),
        exists: true,
      }
      analysis.totalSize += size
    } else {
      analysis.directories[dir] = {
        size: 0,
        formattedSize: '0 Bytes',
        exists: false,
      }
    }
  }

  // Check for size warnings
  const totalSizeMB = analysis.totalSize / (1024 * 1024)
  if (totalSizeMB > CONFIG.sizeThresholds.critical) {
    analysis.warnings.push(
      `🚨 CRITICAL: Total artifact size (${formatBytes(analysis.totalSize)}) exceeds ${CONFIG.sizeThresholds.critical}MB threshold`,
    )
  } else if (totalSizeMB > CONFIG.sizeThresholds.warning) {
    analysis.warnings.push(
      `⚠️  WARNING: Total artifact size (${formatBytes(analysis.totalSize)}) exceeds ${CONFIG.sizeThresholds.warning}MB threshold`,
    )
  }

  // Display results
  console.log('\n📈 Storage Analysis Results:')
  console.log(`Total Artifact Size: ${formatBytes(analysis.totalSize)}`)
  console.log('\nDirectory Breakdown:')

  for (const [dir, info] of Object.entries(analysis.directories)) {
    const status = info.exists ? '✅' : '⚪'
    console.log(`  ${status} ${dir}: ${info.formattedSize}`)
  }

  // Display warnings
  if (analysis.warnings.length > 0) {
    console.log('\n⚠️  Warnings:')
    for (const warning of analysis.warnings) {
      console.log(`  ${warning}`)
    }
  }

  return analysis
}

/**
 * Optimize storage by compressing artifacts
 */
async function optimizeStorage(dryRun = false) {
  console.log(`🗜️  Starting storage optimization ${dryRun ? '(DRY RUN)' : ''}...`)

  // For now, this is a placeholder for future optimization features
  // Could include: image compression, ZIP archiving of old reports, etc.

  console.log('  ℹ️  Storage optimization features coming in future updates')
  console.log('  ℹ️  Current optimization: Automatic cleanup of old artifacts')

  return {
    optimized: 0,
    savedSpace: 0,
  }
}

/**
 * Generate artifact management report
 */
async function generateReport() {
  console.log('📋 Generating artifact management report...')

  const analysis = await analyzeStorage()
  const timestamp = new Date().toISOString()

  const report = {
    timestamp,
    totalSize: analysis.totalSize,
    formattedTotalSize: formatBytes(analysis.totalSize),
    directories: analysis.directories,
    warnings: analysis.warnings,
    retentionPolicy: CONFIG.retentionPolicy,
    thresholds: CONFIG.sizeThresholds,
  }

  // Save report to file
  const reportPath = join(projectRoot, 'test-results', 'artifact-report.json')

  // Ensure directory exists
  await fs.mkdir(dirname(reportPath), {recursive: true})

  await fs.writeFile(reportPath, JSON.stringify(report, null, 2))
  console.log(`  ✅ Report saved to: ${relative(projectRoot, reportPath)}`)

  return report
}

/**
 * Main CLI interface
 */
async function main() {
  const args = process.argv.slice(2)
  const command = args[0] || 'analyze'
  const dryRun = args.includes('--dry-run')

  console.log('🎭 Visual Test Artifact Manager')
  console.log('===============================\n')

  try {
    switch (command) {
      case 'clean': {
        const results = await cleanOldArtifacts(dryRun)
        console.log(`\n✨ Cleanup Summary:`)
        console.log(`  Files ${dryRun ? 'would be' : ''} deleted: ${results.deletedFiles}`)
        console.log(`  Space ${dryRun ? 'would be' : ''} freed: ${formatBytes(results.freedSpace)}`)
        if (results.errors.length > 0) {
          console.log(`  Errors: ${results.errors.length}`)
        }
        break
      }

      case 'analyze': {
        await analyzeStorage()
        break
      }

      case 'optimize': {
        const results = await optimizeStorage(dryRun)
        console.log(`\n✨ Optimization Summary:`)
        console.log(`  Files optimized: ${results.optimized}`)
        console.log(`  Space saved: ${formatBytes(results.savedSpace)}`)
        break
      }

      case 'report': {
        const report = await generateReport()
        console.log(`\n📊 Report generated with ${Object.keys(report.directories).length} directories analyzed`)
        break
      }

      case 'help':
      default: {
        console.log('Available commands:')
        console.log('  analyze  - Analyze current artifact storage usage (default)')
        console.log('  clean    - Clean old artifacts based on retention policy')
        console.log('  optimize - Optimize storage (compress, archive, etc.)')
        console.log('  report   - Generate detailed artifact management report')
        console.log('  help     - Show this help message')
        console.log('\nOptions:')
        console.log('  --dry-run - Preview actions without making changes')
        console.log('\nExamples:')
        console.log('  pnpm visual:artifacts clean --dry-run')
        console.log('  pnpm visual:artifacts analyze')
        console.log('  pnpm visual:artifacts report')
        break
      }
    }
  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  await main()
}

export {analyzeStorage, cleanOldArtifacts, generateReport, optimizeStorage}
