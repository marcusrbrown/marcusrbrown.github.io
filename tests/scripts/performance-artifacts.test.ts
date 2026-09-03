import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {PerformanceArtifactManager} from '../../scripts/performance-artifacts'

const temporaryDirectories: string[] = []

afterEach(() => {
  vi.unstubAllEnvs()
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, {force: true, recursive: true})
})

describe('performance artifact collection', () => {
  it('uses an explicit source argument for Lighthouse reports', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'performance-artifacts-source-test-'))
    temporaryDirectories.push(directory)
    const originalCwd = process.cwd()
    process.chdir(directory)
    mkdirSync('custom-reports')
    writeFileSync(join('custom-reports', 'report.json'), '{}')
    process.argv.push('--source=./custom-reports')

    try {
      const reports = await new PerformanceArtifactManager().collectLighthouseReports('source-test')
      expect(reports).toHaveLength(1)
    } finally {
      process.argv.pop()
      process.chdir(originalCwd)
    }
  })

  it('fails when the collection produces no required artifact categories', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'performance-artifacts-test-'))
    temporaryDirectories.push(directory)
    const originalCwd = process.cwd()
    process.chdir(directory)
    mkdirSync('dist')
    writeFileSync(join('dist', 'index.html'), '<!doctype html>')
    writeFileSync(join('dist', 'main.js'), 'console.log(1)')

    try {
      const manager = new PerformanceArtifactManager()
      await manager.initialize()

      await expect(manager.collectArtifacts()).rejects.toThrowError(/lighthouse|required artifact/i)
    } finally {
      process.chdir(originalCwd)
    }
  })
})
