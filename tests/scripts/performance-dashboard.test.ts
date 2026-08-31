import {describe, expect, it} from 'vitest'
import {PerformanceDashboard} from '../../scripts/performance-dashboard'

describe('PerformanceDashboard', () => {
  it('does not report excellent when Lighthouse data is absent', () => {
    const dashboard = new PerformanceDashboard()

    dashboard.generateSummary()

    expect(dashboard.getSummary().overallStatus).toBe('incomplete')
    expect(dashboard.getSummary().issues).toContain('No Lighthouse data was collected')
  })
})
