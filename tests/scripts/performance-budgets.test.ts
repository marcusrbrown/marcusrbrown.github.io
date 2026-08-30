import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, describe, expect, it} from 'vitest'
import {
  isLighthouseResult,
  readLighthouseReports,
  resolveLighthouseReportsPath,
} from '../../scripts/performance-budgets'

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, {force: true, recursive: true})
  }
})

describe('Lighthouse report discovery', () => {
  it('uses the explicit reports directory before the device-specific default', () => {
    expect(resolveLighthouseReportsPath({DEVICE_TYPE: 'mobile', LHCI_REPORTS_DIR: './custom-reports'})).toBe(
      './custom-reports',
    )
    expect(resolveLighthouseReportsPath({DEVICE_TYPE: 'mobile'})).toBe('./lhci-reports-mobile')
    expect(resolveLighthouseReportsPath({})).toBe('./lhci-reports')
  })

  it('only returns Lighthouse result JSON and skips manifests and other files', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'performance-budgets-test-'))
    temporaryDirectories.push(directory)

    writeFileSync(join(directory, 'manifest.json'), JSON.stringify([{url: 'manifest entry'}]))
    writeFileSync(join(directory, 'assertion-results.json'), JSON.stringify({assertions: []}))
    writeFileSync(join(directory, 'not-json.txt'), 'not a report')
    writeFileSync(
      join(directory, 'home-report.json'),
      JSON.stringify({
        requestedUrl: 'http://localhost:4173/',
        categories: {performance: {score: 0.99}},
        audits: {},
      }),
    )

    const reports = await readLighthouseReports(directory)

    expect(reports).toHaveLength(1)
    expect(reports[0]?.requestedUrl).toBe('http://localhost:4173/')
  })

  it('rejects JSON that does not have Lighthouse result fields', () => {
    expect(isLighthouseResult({url: 'http://localhost:4173/', categories: []})).toBe(false)
    expect(
      isLighthouseResult({
        url: 'http://localhost:4173/',
        categories: {performance: {score: 0.99}},
        audits: {},
      }),
    ).toBe(true)
  })
})
