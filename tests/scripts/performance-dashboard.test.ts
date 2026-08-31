import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {PerformanceDashboard} from '../../scripts/performance-dashboard'

describe('PerformanceDashboard', () => {
  it('does not report excellent when Lighthouse data is absent', () => {
    const dashboard = new PerformanceDashboard()

    dashboard.generateSummary()

    expect(dashboard.getSummary().overallStatus).toBe('incomplete')
    expect(dashboard.getSummary().issues).toContain('No Lighthouse data was collected')
  })

  it('does not report success when bundle analysis throws after Lighthouse succeeds', async () => {
    const originalCwd = process.cwd()
    const directory = await mkdtemp(join(tmpdir(), 'mrbro-performance-dashboard-'))
    const report = {
      categories: {
        performance: {score: 0.99},
        accessibility: {score: 0.99},
        'best-practices': {score: 0.99},
        seo: {score: 0.99},
      },
      audits: {},
    }

    try {
      process.chdir(directory)
      await mkdir('dist')
      for (const device of ['desktop', 'mobile']) {
        await mkdir(`lhci-reports-${device}`)
        await writeFile(join(`lhci-reports-${device}`, 'report.json'), JSON.stringify(report))
      }

      const dashboard = new PerformanceDashboard()
      await dashboard.collectLighthouseData()
      await dashboard.collectBundleData(() => {
        throw new Error('analyzer failed')
      })
      dashboard.generateSummary()

      expect(dashboard.getSummary().overallStatus).toBe('incomplete')
      expect(dashboard.getSummary().issues).toContain('bundle: analyzer failed')
    } finally {
      process.chdir(originalCwd)
      await rm(directory, {recursive: true, force: true})
    }
  })
})
