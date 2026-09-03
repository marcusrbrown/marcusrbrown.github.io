import {spawnSync} from 'node:child_process'
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join, resolve} from 'node:path'
import {afterEach, describe, expect, it} from 'vitest'
import {
  isLighthouseResult,
  readLighthouseReports,
  resolveLighthouseReportsPath,
} from '../../scripts/performance-budgets'

const temporaryDirectories: string[] = []
const budgetValidatorScript = resolve(process.cwd(), 'scripts/performance-budgets.ts')
const tsxLoader = resolve(process.cwd(), 'node_modules/tsx/dist/loader.mjs')

// Measure the validator process directly; pnpm's package-manager startup was
// the variable part of these assertions under parallel load.
const runBudgetValidator = (reportsPath: string, cwd = process.cwd()): ReturnType<typeof spawnSync> =>
  spawnSync(process.execPath, ['--import', tsxLoader, budgetValidatorScript], {
    cwd,
    encoding: 'utf8',
    env: {...process.env, LHCI_REPORTS_DIR: reportsPath},
  })

const createReportsDirectory = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'performance-budgets-test-'))
  temporaryDirectories.push(directory)
  return directory
}

const createBuildDirectory = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'performance-budgets-build-'))
  temporaryDirectories.push(directory)
  mkdirSync(join(directory, 'dist'), {recursive: true})
  writeFileSync(join(directory, 'dist', 'index.html'), '<!doctype html>')
  writeFileSync(join(directory, 'dist', 'main.js'), 'console.log(1)')
  return directory
}

const lighthouseReport = {
  requestedUrl: 'http://localhost:4173/',
  categories: {performance: {score: 0.99}},
  audits: {
    'largest-contentful-paint': {numericValue: 1000},
    'cumulative-layout-shift': {numericValue: 0.01},
  },
}

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

describe('Lighthouse budget validation failures', () => {
  it('exits nonzero when the reports path cannot be read', () => {
    const directory = createReportsDirectory()
    const reportsPath = join(directory, 'not-a-directory')
    writeFileSync(reportsPath, 'not a directory')

    const result = runBudgetValidator(reportsPath)
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`

    expect(result.status).toBe(1)
    expect(output).toContain(reportsPath)
  })

  it('exits nonzero when Lighthouse is valid but the build output is absent', () => {
    const directory = createReportsDirectory()
    const projectDirectory = mkdtempSync(join(tmpdir(), 'performance-budgets-project-'))
    temporaryDirectories.push(projectDirectory)
    writeFileSync(join(directory, 'valid-report.json'), JSON.stringify(lighthouseReport))

    const result = runBudgetValidator(directory, projectDirectory)
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`

    expect(result.status).toBe(1)
    expect(output).toContain('Bundle validation')
    expect(output).toMatch(/dist|build output/i)
  })

  it('exits nonzero when Lighthouse is valid but the build output is empty', () => {
    const directory = createReportsDirectory()
    const projectDirectory = mkdtempSync(join(tmpdir(), 'performance-budgets-project-'))
    temporaryDirectories.push(projectDirectory)
    mkdirSync(join(projectDirectory, 'dist'))
    writeFileSync(join(directory, 'valid-report.json'), JSON.stringify(lighthouseReport))

    const result = runBudgetValidator(directory, projectDirectory)
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`

    expect(result.status).toBe(1)
    expect(output).toMatch(/empty|unreadable|build output/i)
  })

  it('exits nonzero when Lighthouse is valid but the build output is unreadable', () => {
    const directory = createReportsDirectory()
    const projectDirectory = mkdtempSync(join(tmpdir(), 'performance-budgets-project-'))
    temporaryDirectories.push(projectDirectory)
    writeFileSync(join(projectDirectory, 'dist'), 'not a directory')
    writeFileSync(join(directory, 'valid-report.json'), JSON.stringify(lighthouseReport))

    const result = runBudgetValidator(directory, projectDirectory)
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`

    expect(result.status).toBe(1)
    expect(output).toMatch(/unreadable|build output|dist/i)
  })

  it('exits nonzero when a report is malformed even if another report is valid', () => {
    const directory = createReportsDirectory()
    writeFileSync(join(directory, 'valid-report.json'), JSON.stringify(lighthouseReport))
    writeFileSync(join(directory, 'malformed-report.json'), '{')

    const result = runBudgetValidator(directory)
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`

    expect(result.status).toBe(1)
    expect(output).toContain(join(directory, 'malformed-report.json'))
  })

  it('exits nonzero when a report has an invalid URL', () => {
    const directory = createReportsDirectory()
    writeFileSync(join(directory, 'valid-report.json'), JSON.stringify(lighthouseReport))
    writeFileSync(
      join(directory, 'invalid-url-report.json'),
      JSON.stringify({...lighthouseReport, requestedUrl: 'not a URL'}),
    )

    const result = runBudgetValidator(directory)
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`

    expect(result.status).toBe(1)
    expect(output).toContain('not a URL')
  })

  it('exits zero and reports Lighthouse metrics as informational when all reports are valid', () => {
    const directory = createReportsDirectory()
    const projectDirectory = createBuildDirectory()
    writeFileSync(join(directory, 'manifest.json'), JSON.stringify([{url: 'metadata'}]))
    writeFileSync(join(directory, 'valid-report.json'), JSON.stringify(lighthouseReport))

    const result = runBudgetValidator(directory, projectDirectory)
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`

    expect(result.status).toBe(0)
    expect(output).toContain('metrics informational; LHCI owns metric thresholds')
    expect(output).toContain('Performance Score: 99.0%')
    expect(output).toContain('LCP: 1000ms')
    expect(output).toContain('CLS: 0.010')
  })

  it('does not fail on Lighthouse metric values that LHCI owns', () => {
    const directory = createReportsDirectory()
    const projectDirectory = createBuildDirectory()
    writeFileSync(
      join(directory, 'slow-report.json'),
      JSON.stringify({
        ...lighthouseReport,
        categories: {performance: {score: 0.5}},
        audits: {
          'largest-contentful-paint': {numericValue: 5000},
          'cumulative-layout-shift': {numericValue: 0.5},
        },
      }),
    )

    const result = runBudgetValidator(directory, projectDirectory)
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`

    expect(result.status).toBe(0)
    expect(output).toContain('Performance Score: 50.0%')
    expect(output).toContain('LCP: 5000ms')
    expect(output).toContain('CLS: 0.500')
    expect(output).not.toContain('below budget')
    expect(output).not.toContain('exceeds')
  })
})
