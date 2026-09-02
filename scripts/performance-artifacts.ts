#!/usr/bin/env tsx

/**
 * Performance artifact manager
 * Manages collection, storage, and cleanup of performance testing artifacts
 */

import type {BuildAnalysis} from './analyze-build.js'

import {existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync} from 'node:fs'
import {basename, join} from 'node:path'
import process from 'node:process'

const REQUIRED_ARTIFACT_COUNTS = {
  lighthouse: 1,
  bundles: 1,
} as const

interface LighthouseArtifactSource {
  device: string
  path: string
}

export const resolveLighthouseArtifactSources = (
  environment: NodeJS.ProcessEnv = process.env,
  args: readonly string[] = process.argv.slice(2),
): LighthouseArtifactSource[] => {
  const explicitSource = args.find(argument => argument.startsWith('--source='))?.slice('--source='.length)
  if (explicitSource) {
    return [{device: environment.DEVICE_TYPE ?? 'custom', path: explicitSource}]
  }

  if (environment.LHCI_REPORTS_DIR) {
    return [{device: environment.DEVICE_TYPE ?? 'default', path: environment.LHCI_REPORTS_DIR}]
  }

  if (environment.DEVICE_TYPE) {
    return [{device: environment.DEVICE_TYPE, path: `./lhci-reports-${environment.DEVICE_TYPE}`}]
  }

  if (existsSync('./lhci-reports')) return [{device: 'default', path: './lhci-reports'}]

  return [
    {device: 'desktop', path: './lhci-reports-desktop'},
    {device: 'mobile', path: './lhci-reports-mobile'},
  ]
}

interface ArtifactInfo {
  file: string
  category: string
  type: string
  size: number
  path: string
}

interface RunManifest {
  runId: string
  timestamp: string
  commit: string
  branch: string
  artifacts: ArtifactInfo[]
  totalSize: number
  environment: {
    node: string
    platform: string
    arch: string
    ci: boolean
  }
}

interface GlobalManifest {
  version: string
  lastUpdated: string
  totalRuns: number
  totalSize: number
  runs: {
    runId: string
    timestamp: string
    commit: string
    branch: string
    artifactCount: number
    totalSize: number
  }[]
}

/**
 * Performance artifact management
 */
class PerformanceArtifactManager {
  private readonly artifactsDir = './performance-artifacts'
  private readonly maxArtifacts = Number.parseInt(process.env.MAX_PERFORMANCE_ARTIFACTS || '50', 10)
  private readonly retentionDays = Number.parseInt(process.env.ARTIFACT_RETENTION_DAYS || '30', 10)
  private readonly allowEmpty = process.argv.includes('--allow-empty')

  /**
   * Initialize artifact management
   */
  async initialize(): Promise<boolean> {
    console.log('🗂️ Initializing performance artifact manager...\n')

    try {
      // Ensure artifacts directory exists
      this.ensureDirectoryExists(this.artifactsDir)

      // Create subdirectories
      const subdirs = ['lighthouse', 'bundles', 'screenshots', 'reports', 'history']
      for (const subdir of subdirs) {
        this.ensureDirectoryExists(join(this.artifactsDir, subdir))
      }

      console.log('✅ Artifact directories initialized')
      return true
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('❌ Failed to initialize artifact manager:', errorMessage)
      return false
    }
  }

  /**
   * Collect all performance artifacts from current run
   */
  async collectArtifacts(): Promise<string> {
    console.log('📦 Collecting performance artifacts...\n')

    const timestamp = new Date().toISOString().replaceAll(/[:.]/g, '-')
    const commit = process.env.GITHUB_SHA?.slice(0, 7) || 'local'
    const runId = `${timestamp}-${commit}`

    try {
      // Collect Lighthouse reports
      await this.collectLighthouseReports(runId)

      // Collect bundle analysis
      await this.collectBundleAnalysis(runId)

      // Collect performance screenshots
      await this.collectScreenshots(runId)

      // Collect dashboard data
      await this.collectDashboardData(runId)

      const artifacts = this.scanArtifacts(runId)
      if (!this.allowEmpty) this.validateRequiredArtifacts(artifacts)

      // Generate artifact manifest
      await this.generateManifest(runId)

      // Cleanup old artifacts
      await this.cleanupOldArtifacts()

      console.log(`✅ Artifacts collected successfully for run: ${runId}`)
      console.log(`📁 Artifacts location: ${this.artifactsDir}/`)

      return runId
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('❌ Failed to collect artifacts:', errorMessage)
      throw error
    }
  }

  /**
   * Collect Lighthouse CI reports
   */
  async collectLighthouseReports(runId: string): Promise<ArtifactInfo[]> {
    console.log('🚀 Collecting Lighthouse reports...')

    const sources = resolveLighthouseArtifactSources()
    const reportsCollected: ArtifactInfo[] = []

    for (const source of sources) {
      const {device, path: sourceDir} = source
      console.log(`  ℹ️ Lighthouse report source for ${device}: ${sourceDir}`)
      if (!existsSync(sourceDir)) {
        console.log(`  ⚠️ No ${device} reports found`)
        continue
      }

      try {
        const targetDir = join(this.artifactsDir, 'lighthouse', runId, device)
        this.ensureDirectoryExists(targetDir)

        // Copy all JSON reports
        const files = readdirSync(sourceDir)
        const jsonFiles = files.filter(f => f.endsWith('.json') && f !== 'manifest.json')

        for (const file of jsonFiles) {
          const sourcePath = join(sourceDir, file)
          const targetPath = join(targetDir, file)

          const content = readFileSync(sourcePath, 'utf8')
          writeFileSync(targetPath, content)

          const stats = statSync(sourcePath)
          reportsCollected.push({
            file,
            category: 'lighthouse',
            type: 'data',
            size: stats.size,
            path: targetPath,
          })
        }

        console.log(`  ✅ Collected ${jsonFiles.length} ${device} reports`)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.log(`  ❌ Failed to collect ${device} reports:`, errorMessage)
      }
    }

    return reportsCollected
  }

  /**
   * Collect bundle analysis data
   */
  async collectBundleAnalysis(runId: string): Promise<void> {
    console.log('📦 Collecting bundle analysis...')

    try {
      const targetDir = join(this.artifactsDir, 'bundles', runId)
      this.ensureDirectoryExists(targetDir)

      // Generate fresh analysis if enhanced script exists
      let analysisData: BuildAnalysis | undefined
      try {
        const {analyzeBuildOutput} = await import('./analyze-build.js')
        analysisData = analyzeBuildOutput(true)
      } catch {
        // Fallback to existing analysis files
        const existingFiles = ['build-analysis.json', 'bundle-analysis.json']
        for (const file of existingFiles) {
          if (existsSync(file)) {
            try {
              const content = readFileSync(file, 'utf8')
              analysisData = JSON.parse(content) as BuildAnalysis
              break
            } catch {
              continue
            }
          }
        }
      }

      if (analysisData) {
        const targetPath = join(targetDir, 'bundle-analysis.json')
        writeFileSync(targetPath, JSON.stringify(analysisData, null, 2))
        console.log('  ✅ Bundle analysis collected')
      } else {
        console.log('  ⚠️ No bundle analysis data found')
      }

      // Copy build history if exists
      if (existsSync('./build-history.json')) {
        const historyPath = join(targetDir, 'build-history.json')
        const content = readFileSync('./build-history.json', 'utf8')
        writeFileSync(historyPath, content)
        console.log('  ✅ Build history collected')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.log('  ❌ Failed to collect bundle analysis:', errorMessage)
    }
  }

  /**
   * Collect performance screenshots
   */
  async collectScreenshots(runId: string): Promise<void> {
    console.log('📸 Collecting performance screenshots...')

    try {
      const sourceDir = './test-results'
      if (!existsSync(sourceDir)) {
        console.log('  ⚠️ No test results directory found')
        return
      }

      const targetDir = join(this.artifactsDir, 'screenshots', runId)
      this.ensureDirectoryExists(targetDir)

      // Find all screenshot files
      const screenshotFiles = this.findFilesByExtension(sourceDir, ['.png', '.jpg', '.jpeg'])

      if (screenshotFiles.length === 0) {
        console.log('  ⚠️ No screenshots found')
        return
      }

      let copiedCount = 0
      for (const screenshot of screenshotFiles) {
        try {
          const relativePath = screenshot.replace(`${sourceDir}/`, '')
          const targetPath = join(targetDir, relativePath.replaceAll(/[/\\]/g, '_'))

          const content = readFileSync(screenshot)
          writeFileSync(targetPath, content)
          copiedCount++
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          console.log(`    ⚠️ Failed to copy ${screenshot}:`, errorMessage)
        }
      }

      console.log(`  ✅ Collected ${copiedCount} screenshots`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.log('  ❌ Failed to collect screenshots:', errorMessage)
    }
  }

  /**
   * Collect dashboard and report data
   */
  async collectDashboardData(runId: string): Promise<void> {
    console.log('📊 Collecting dashboard data...')

    try {
      const targetDir = join(this.artifactsDir, 'reports', runId)
      this.ensureDirectoryExists(targetDir)

      // Copy dashboard data files
      const dataFiles = [
        'performance-dashboard.json',
        'performance-report.md',
        'performance-badges.json',
        'performance-history.json',
      ]

      let copiedCount = 0
      for (const file of dataFiles) {
        if (existsSync(file)) {
          try {
            const targetPath = join(targetDir, file)
            const content = readFileSync(file, 'utf8')
            writeFileSync(targetPath, content)
            copiedCount++
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error'
            console.log(`    ⚠️ Failed to copy ${file}:`, errorMessage)
          }
        }
      }

      console.log(`  ✅ Collected ${copiedCount} dashboard files`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.log('  ❌ Failed to collect dashboard data:', errorMessage)
    }
  }

  /**
   * Generate artifact manifest
   */
  async generateManifest(runId: string): Promise<void> {
    console.log('📋 Generating artifact manifest...')

    try {
      const manifest: RunManifest = {
        runId,
        timestamp: new Date().toISOString(),
        commit: process.env.GITHUB_SHA || 'local',
        branch: process.env.GITHUB_REF_NAME || 'local',
        artifacts: this.scanArtifacts(runId),
        totalSize: 0,
        environment: {
          node: process.version,
          platform: process.platform,
          arch: process.arch,
          ci: Boolean(process.env.CI),
        },
      }

      // Calculate total size
      manifest.totalSize = manifest.artifacts.reduce((total, artifact) => total + artifact.size, 0)

      // Save manifest
      const manifestPath = join(this.artifactsDir, 'reports', runId, 'manifest.json')
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))

      // Update global manifest
      await this.updateGlobalManifest(manifest)

      console.log(`  ✅ Manifest generated (${this.formatBytes(manifest.totalSize)})`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.log('  ❌ Failed to generate manifest:', errorMessage)
    }
  }

  /**
   * Scan collected artifacts for manifest
   */
  scanArtifacts(runId: string): ArtifactInfo[] {
    const artifacts: ArtifactInfo[] = []
    const basePath = join(this.artifactsDir)

    const categories = ['lighthouse', 'bundles', 'screenshots', 'reports']
    for (const category of categories) {
      const categoryPath = join(basePath, category, runId)
      if (existsSync(categoryPath)) {
        const files = this.scanDirectory(categoryPath, categoryPath)
        for (const file of files) {
          artifacts.push({
            file: file.relativePath,
            category,
            type: this.getFileType(file.relativePath),
            size: file.size,
            path: file.fullPath,
          })
        }
      }
    }

    return artifacts
  }

  private validateRequiredArtifacts(artifacts: readonly ArtifactInfo[]): void {
    if (artifacts.length === 0) {
      throw new Error('No performance artifacts were collected')
    }

    for (const [category, minimum] of Object.entries(REQUIRED_ARTIFACT_COUNTS)) {
      const count = artifacts.filter(artifact => artifact.category === category).length
      if (count < minimum) {
        throw new Error(`Required artifact category ${category} is missing (expected at least ${minimum})`)
      }
    }
  }

  /**
   * Recursively scan directory for files
   */
  scanDirectory(dirPath: string, basePath: string): {relativePath: string; fullPath: string; size: number}[] {
    const files: {relativePath: string; fullPath: string; size: number}[] = []

    try {
      const items = readdirSync(dirPath)

      for (const item of items) {
        const itemPath = join(dirPath, item)
        const stat = statSync(itemPath)

        if (stat.isDirectory()) {
          files.push(...this.scanDirectory(itemPath, basePath))
        } else {
          files.push({
            relativePath: itemPath.replace(basePath, '').replace(/^\//, ''),
            fullPath: itemPath,
            size: stat.size,
          })
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.warn(`⚠️ Failed to scan directory ${dirPath}:`, errorMessage)
    }

    return files
  }

  /**
   * Update global manifest with all runs
   */
  async updateGlobalManifest(runManifest: RunManifest): Promise<void> {
    const globalManifestPath = join(this.artifactsDir, 'manifest.json')

    let globalManifest: GlobalManifest = {
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      totalRuns: 0,
      totalSize: 0,
      runs: [],
    }

    if (existsSync(globalManifestPath)) {
      try {
        const content = readFileSync(globalManifestPath, 'utf8')
        globalManifest = JSON.parse(content) as GlobalManifest
      } catch {
        console.warn('⚠️ Failed to read global manifest, creating new one')
      }
    }

    // Add current run
    globalManifest.runs.push({
      runId: runManifest.runId,
      timestamp: runManifest.timestamp,
      commit: runManifest.commit,
      branch: runManifest.branch,
      artifactCount: runManifest.artifacts.length,
      totalSize: runManifest.totalSize,
    })

    // Update totals
    globalManifest.totalRuns = globalManifest.runs.length
    globalManifest.totalSize = globalManifest.runs.reduce((total, run) => total + run.totalSize, 0)
    globalManifest.lastUpdated = new Date().toISOString()

    // Keep only recent runs in global manifest
    if (globalManifest.runs.length > this.maxArtifacts) {
      globalManifest.runs = globalManifest.runs.slice(-this.maxArtifacts)
    }

    writeFileSync(globalManifestPath, JSON.stringify(globalManifest, null, 2))
  }

  /**
   * Cleanup old artifacts based on retention policy
   */
  async cleanupOldArtifacts(): Promise<void> {
    console.log('🧹 Cleaning up old artifacts...')

    try {
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays)

      const categories = ['lighthouse', 'bundles', 'screenshots', 'reports']
      let deletedCount = 0

      for (const category of categories) {
        const categoryPath = join(this.artifactsDir, category)
        if (!existsSync(categoryPath)) continue

        const runDirs = readdirSync(categoryPath)

        for (const runDir of runDirs) {
          const runPath = join(categoryPath, runDir)
          const stat = statSync(runPath)

          if (stat.isDirectory() && stat.mtime < cutoffDate) {
            this.deleteDirectory(runPath)
            deletedCount++
          }
        }
      }

      if (deletedCount > 0) {
        console.log(`  ✅ Cleaned up ${deletedCount} old artifact directories`)
      } else {
        console.log('  ✅ No old artifacts to clean up')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.log('  ❌ Failed to cleanup artifacts:', errorMessage)
    }
  }

  /**
   * Utility methods
   */
  ensureDirectoryExists(dirPath: string): void {
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, {recursive: true})
    }
  }

  deleteDirectory(dirPath: string): void {
    rmSync(dirPath, {recursive: true, force: true})
  }

  findFilesByExtension(dir: string, extensions: string[]): string[] {
    const files: string[] = []

    try {
      const items = readdirSync(dir)

      for (const item of items) {
        const itemPath = join(dir, item)
        const stat = statSync(itemPath)

        if (stat.isDirectory()) {
          files.push(...this.findFilesByExtension(itemPath, extensions))
        } else if (extensions.some(ext => item.toLowerCase().endsWith(ext))) {
          files.push(itemPath)
        }
      }
    } catch {
      // Ignore errors for inaccessible directories
    }

    return files
  }

  getFileType(filename: string): string {
    const ext = basename(filename).split('.').pop()?.toLowerCase()
    const typeMap: Record<string, string> = {
      json: 'data',
      md: 'report',
      png: 'screenshot',
      jpg: 'screenshot',
      jpeg: 'screenshot',
      html: 'report',
      txt: 'log',
    }
    return typeMap[ext || ''] || 'unknown'
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${Number.parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const manager = new PerformanceArtifactManager()

  if (await manager.initialize()) {
    await manager.collectArtifacts()
  }
}

export {PerformanceArtifactManager}
export type {ArtifactInfo, GlobalManifest, RunManifest}
