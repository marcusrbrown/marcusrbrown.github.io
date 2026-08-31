import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {determineOverallStatus, parseVisualTestData} from '../../scripts/test-dashboard.mjs'

const suite = status => ({status})

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
})
