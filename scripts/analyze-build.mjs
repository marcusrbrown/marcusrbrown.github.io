#!/usr/bin/env node

import {readdirSync, statSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import process from 'node:process'

/**
 * Analyze build output for size and performance metrics
 */
function analyzeBuildOutput() {
  const distPath = './dist'

  try {
    const files = getAllFiles(distPath)
    const analysis = {
      totalSize: 0,
      fileCount: 0,
      jsSize: 0,
      cssSize: 0,
      htmlSize: 0,
      assets: [],
      timestamp: new Date().toISOString(),
    }

    files.forEach(file => {
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
    })

    // Sort assets by size (largest first)
    analysis.assets.sort((a, b) => b.sizeBytes - a.sizeBytes)

    console.log('📦 Build Analysis Report')
    console.log('========================')
    console.log(`Total files: ${analysis.fileCount}`)
    console.log(`Total size: ${formatBytes(analysis.totalSize)}`)
    console.log(`JavaScript: ${formatBytes(analysis.jsSize)}`)
    console.log(`CSS: ${formatBytes(analysis.cssSize)}`)
    console.log(`HTML: ${formatBytes(analysis.htmlSize)}`)
    console.log('')
    console.log('📊 Largest Assets:')
    analysis.assets.slice(0, 10).forEach(asset => {
      console.log(`  ${asset.file.padEnd(30)} ${asset.size}`)
    })

    // Performance warnings
    console.log('')
    if (analysis.jsSize > 500 * 1024) {
      console.log('⚠️  JavaScript bundle size is large (>500KB)')
    }
    if (analysis.totalSize > 2 * 1024 * 1024) {
      console.log('⚠️  Total bundle size is very large (>2MB)')
    }
    if (analysis.jsSize < 100 * 1024) {
      console.log('✅ JavaScript bundle size is optimal (<100KB)')
    }

    // Generate GitHub Actions job summary
    if (process.env.GITHUB_ACTIONS) {
      generateJobSummary(analysis)
    }

    return analysis
  } catch (error) {
    console.error('❌ Build analysis failed:', error.message)
    process.exit(1)
  }
}

/**
 * Generate GitHub Actions job summary with markdown formatting
 */
function generateJobSummary(analysis) {
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
| **Build Time** | ${analysis.timestamp.split('T')[1].split('.')[0]} UTC |

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
`

  // Write to GitHub Actions step summary
  console.log(
    `::notice title=Bundle Analysis::Bundle size: ${formatBytes(analysis.totalSize)} (${analysis.fileCount} files)`,
  )

  // Append to GitHub Actions step summary
  if (process.env.GITHUB_STEP_SUMMARY) {
    writeFileSync(process.env.GITHUB_STEP_SUMMARY, summary, {flag: 'a'})
  }
}

/**
 * Get performance status messages with icons
 */
function getPerformanceStatus(analysis) {
  const statuses = []

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

function getAllFiles(dir, files = []) {
  const dirFiles = readdirSync(dir)

  dirFiles.forEach(file => {
    const filePath = join(dir, file)
    const stats = statSync(filePath)

    if (stats.isDirectory()) {
      getAllFiles(filePath, files)
    } else {
      files.push(filePath)
    }
  })

  return files
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B'

  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${Number.parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`
}

// Run analysis
analyzeBuildOutput()
