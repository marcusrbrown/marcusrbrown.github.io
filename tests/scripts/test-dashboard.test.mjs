import {describe, expect, it} from 'vitest'
import {determineOverallStatus} from '../../scripts/test-dashboard.mjs'

const suite = status => ({status})

describe('test dashboard aggregate status', () => {
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
