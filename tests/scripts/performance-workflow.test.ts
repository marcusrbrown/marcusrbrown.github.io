import {spawnSync} from 'node:child_process'
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, describe, expect, it} from 'vitest'
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

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, {force: true, recursive: true})
})

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

  it('allows the summary collector to omit unavailable build evidence only explicitly', () => {
    const workflow = loadWorkflow()
    const summarySteps = workflow.jobs['performance-summary']?.steps ?? []
    const summaryStep = summarySteps.find(step => step.run?.includes('test:performance:artifacts'))

    expect(summaryStep?.run).toContain('pnpm run test:performance:artifacts -- --allow-empty')

    const directory = mkdtempSync(join(tmpdir(), 'performance-workflow-summary-'))
    temporaryDirectories.push(directory)
    mkdirSync(join(directory, 'lhci-reports-desktop'))
    writeFileSync(join(directory, 'lhci-reports-desktop', 'report.json'), '{}')

    const result = spawnSync(
      process.execPath,
      [
        '--import',
        join(process.cwd(), 'node_modules/tsx/dist/loader.mjs'),
        join(process.cwd(), 'scripts/performance-artifacts.ts'),
        '--allow-empty',
      ],
      {
        cwd: directory,
        encoding: 'utf8',
        env: process.env,
      },
    )

    expect(result.status).toBe(0)
  })
})
