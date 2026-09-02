import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {determineOverallStatus, parseVisualTestData} from '../../scripts/test-dashboard.mjs'
import * as dashboardScript from '../../scripts/test-dashboard.mjs'

const suite = status => ({status})
const validAxeReport = {
  violations: [],
  passes: [{id: 'color-contrast'}],
  incomplete: [],
  inapplicable: [],
}

describe('test dashboard aggregate status', () => {
  it('reports a passing visual run from stable screenshots and its Playwright report', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mrbro-visual-dashboard-'))
    const tests = Array.from({length: 41}, () => ({projectName: 'visual-tests', results: [{status: 'passed'}]}))

    try {
      await mkdir(join(root, 'tests/visual/screenshots'), {recursive: true})
      await mkdir(join(root, 'test-results'), {recursive: true})
      await writeFile(join(root, 'tests/visual/screenshots/header-light-theme.png'), 'stable screenshot')
      await writeFile(join(root, 'test-results/results.json'), JSON.stringify({suites: [{specs: [{tests}]}]}))

      await expect(parseVisualTestData(root)).resolves.toMatchObject({
        status: 'passed',
        totalTests: 41,
        passed: 41,
        failed: 0,
      })
    } finally {
      await rm(root, {recursive: true, force: true})
    }
  })

  it('reports a failing visual run from failed Playwright results', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mrbro-visual-dashboard-'))

    try {
      await mkdir(join(root, 'tests/visual/screenshots'), {recursive: true})
      await mkdir(join(root, 'test-results'), {recursive: true})
      await writeFile(join(root, 'tests/visual/screenshots/header-light-theme.png'), 'stable screenshot')
      await writeFile(
        join(root, 'test-results/results.json'),
        JSON.stringify({
          suites: [
            {
              specs: [
                {
                  tests: [
                    {projectName: 'visual-tests', results: [{status: 'passed'}]},
                    {projectName: 'visual-tests', results: [{status: 'failed'}]},
                  ],
                },
              ],
            },
          ],
        }),
      )

      await expect(parseVisualTestData(root)).resolves.toMatchObject({
        status: 'failed',
        totalTests: 2,
        passed: 1,
        failed: 1,
      })
    } finally {
      await rm(root, {recursive: true, force: true})
    }
  })

  it('reports not-run when no visual run evidence exists', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mrbro-visual-dashboard-'))

    try {
      await expect(parseVisualTestData(root)).resolves.toMatchObject({
        status: 'not-run',
        totalTests: 0,
      })
    } finally {
      await rm(root, {recursive: true, force: true})
    }
  })

  it('reports incomplete when all suites are not run', () => {
    const dashboardData = {
      unitTests: suite('not-run'),
      e2eTests: suite('not-run'),
      visualTests: suite('not-run'),
      accessibility: suite('not-run'),
      performance: suite('not-run'),
      build: suite('not-available'),
      summary: {failedTests: 0},
    }

    expect(determineOverallStatus(dashboardData)).toBe('incomplete')
  })

  it('keeps a parsed failure higher priority than incomplete data', () => {
    const dashboardData = {
      unitTests: suite('completed'),
      e2eTests: suite('failed'),
      visualTests: suite('not-run'),
      accessibility: {status: 'not-run', violations: 0},
      performance: suite('not-run'),
      build: suite('not-available'),
      summary: {failedTests: 1},
    }

    expect(determineOverallStatus(dashboardData)).toBe('failed')
  })

  it('reports a valid accessibility report as passing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mrbro-accessibility-dashboard-'))

    try {
      await mkdir(join(root, 'accessibility-reports'))
      await writeFile(join(root, 'accessibility-reports/axe-home.json'), JSON.stringify(validAxeReport))

      await expect(dashboardScript.parseAccessibilityData(root)).resolves.toMatchObject({
        status: 'passed',
        violations: 0,
        passes: 1,
      })
    } finally {
      await rm(root, {recursive: true, force: true})
    }
  })

  it.each([
    ['malformed JSON', '{'],
    ['an empty object', '{}'],
    ['a report missing violations', JSON.stringify({passes: [], incomplete: [], inapplicable: []})],
  ])('reports %s accessibility input as an error', async (_name, content) => {
    const root = await mkdtemp(join(tmpdir(), 'mrbro-accessibility-dashboard-'))

    try {
      await mkdir(join(root, 'accessibility-reports'))
      await writeFile(join(root, 'accessibility-reports/axe-home.json'), content)

      await expect(dashboardScript.parseAccessibilityData(root)).resolves.toMatchObject({status: 'error'})
    } finally {
      await rm(root, {recursive: true, force: true})
    }
  })

  it('distinguishes an empty accessibility report directory from invalid reports', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mrbro-accessibility-dashboard-'))

    try {
      await mkdir(join(root, 'accessibility-reports'))

      await expect(dashboardScript.parseAccessibilityData(root)).resolves.toMatchObject({status: 'not-run'})
    } finally {
      await rm(root, {recursive: true, force: true})
    }
  })

  it('reports an error when valid and invalid accessibility reports are mixed', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mrbro-accessibility-dashboard-'))

    try {
      await mkdir(join(root, 'accessibility-reports'))
      await writeFile(join(root, 'accessibility-reports/axe-home.json'), JSON.stringify(validAxeReport))
      await writeFile(join(root, 'accessibility-reports/axe-about.json'), '{}')

      await expect(dashboardScript.parseAccessibilityData(root)).resolves.toMatchObject({status: 'error'})
    } finally {
      await rm(root, {recursive: true, force: true})
    }
  })

  it('reads top-level build history arrays and reports their entry count', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mrbro-build-dashboard-'))

    try {
      await writeFile(
        join(root, 'build-history.json'),
        JSON.stringify([
          {totalSize: 100, fileCount: 2, jsSize: 80, cssSize: 20},
          {totalSize: 120, fileCount: 3, jsSize: 90, cssSize: 30},
        ]),
      )

      await expect(dashboardScript.parseBuildData(root)).resolves.toMatchObject({
        status: 'completed',
        entries: 2,
        size: 120,
        files: 3,
      })
    } finally {
      await rm(root, {recursive: true, force: true})
    }
  })

  it('rejects object-shaped build history data', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mrbro-build-dashboard-'))

    try {
      await writeFile(join(root, 'build-history.json'), JSON.stringify({builds: []}))

      await expect(dashboardScript.parseBuildData(root)).resolves.toMatchObject({status: 'error'})
    } finally {
      await rm(root, {recursive: true, force: true})
    }
  })

  it('propagates dashboard output write failures', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mrbro-dashboard-write-'))
    const blockedPath = join(root, 'dashboard-data.json')

    try {
      await mkdir(blockedPath)

      await expect(dashboardScript.saveJsonFile(blockedPath, {status: 'passed'})).rejects.toBeDefined()
    } finally {
      await rm(root, {recursive: true, force: true})
    }
  })
})
