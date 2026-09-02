import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {parse as parseYaml} from 'yaml'

interface PerformanceWorkflow {
  jobs: Record<
    string,
    {
      steps: {
        name?: string
        run?: string
        'continue-on-error'?: boolean
      }[]
    }
  >
}

const loadWorkflow = (): PerformanceWorkflow =>
  parseYaml(readFileSync(join(process.cwd(), '.github/workflows/performance.yaml'), 'utf8')) as PerformanceWorkflow

describe('performance workflow evidence propagation', () => {
  it('does not suppress required artifact collection failures', () => {
    const workflow = loadWorkflow()
    const auditSteps = workflow.jobs['performance-audit']?.steps ?? []
    const collectionStep = auditSteps.find(step => step.name === 'Collect performance artifacts')

    expect(collectionStep).toBeDefined()
    expect(collectionStep?.['continue-on-error']).toBeUndefined()
  })

  it('does not mask summary-lane artifact collection failures', () => {
    const workflow = loadWorkflow()
    const summarySteps = workflow.jobs['performance-summary']?.steps ?? []
    const summaryStep = summarySteps.find(step => step.run?.includes('test:performance:artifacts'))

    expect(summaryStep?.run).toBeDefined()
    expect(summaryStep?.run).not.toContain('test:performance:artifacts ||')
  })
})
