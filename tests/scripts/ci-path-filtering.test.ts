import {spawnSync} from 'node:child_process'
import {mkdtempSync, readFileSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, describe, expect, it} from 'vitest'
import {parse as parseYaml} from 'yaml'

import {SCRIPT_CONFIG} from '../../scripts/branch-protection-config'

interface WorkflowStep {
  name?: string
  id?: string
  if?: string
  run?: string
  uses?: string
}

interface WorkflowJob {
  name?: string
  if?: string
  strategy?: {matrix?: Record<string, unknown>}
  steps: WorkflowStep[]
}

interface Workflow {
  name: string
  jobs: Record<string, WorkflowJob>
}

const WORKFLOW_RELATIVE_PATHS = {
  ci: '.github/workflows/ci.yaml',
  e2e: '.github/workflows/e2e-tests.yaml',
  performance: '.github/workflows/performance.yaml',
} as const

const readRepoFile = (relativePath: string): string => readFileSync(join(process.cwd(), relativePath), 'utf8')

const loadWorkflow = (relativePath: string): Workflow => parseYaml(readRepoFile(relativePath)) as Workflow

interface GateStepRef {
  workflow: string
  jobId: string
  step: WorkflowStep
}

// A gate step is one whose id starts with "gate" — covers "gate-unit-tests" and
// "gate-build-typecheck" in ci.yaml, and "gate" in e2e-tests.yaml and performance.yaml.
// Identifying by id (rather than by name text) survives cosmetic step-name edits.
const collectGateSteps = (): GateStepRef[] => {
  const gateSteps: GateStepRef[] = []
  for (const [workflow, relativePath] of Object.entries(WORKFLOW_RELATIVE_PATHS)) {
    const parsed = loadWorkflow(relativePath)
    for (const [jobId, job] of Object.entries(parsed.jobs)) {
      for (const step of job.steps) {
        if (step.id?.startsWith('gate')) gateSteps.push({workflow, jobId, step})
      }
    }
  }
  return gateSteps
}

// A job/step is "filter-keyed" if its condition references a filter- or gate-derived output.
// A job `if:` can only reach the `needs.<job>.outputs.*` context (the `steps.*` context is
// unavailable at job scope), so this pattern is what a filter-keyed job `if:` always looks like.
const FILTER_KEYED_JOB_IF =
  /needs\.[\w-]+\.outputs\.(run-unit-tests|run-build-typecheck|e2e|visual|accessibility|run)\b/

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, {force: true, recursive: true})
})

describe('CI path filtering invariants', () => {
  // Invariant 1: no job carries a filter-keyed top-level `if:`. Jobs must always run and
  // report a status — that is the entire reason step-level gating was chosen over job-level
  // gating.
  describe('invariant 1: no job carries a filter-keyed top-level if', () => {
    it('never gates an entire job on a filter- or gate-derived output', () => {
      for (const relativePath of Object.values(WORKFLOW_RELATIVE_PATHS)) {
        const workflow = loadWorkflow(relativePath)
        for (const job of Object.values(workflow.jobs)) {
          if (job.if === undefined) continue
          expect(job.if).not.toMatch(FILTER_KEYED_JOB_IF)
        }
      }
    })

    it('does not misclassify the pre-existing quality-gate always() condition', () => {
      const ci = loadWorkflow(WORKFLOW_RELATIVE_PATHS.ci)
      expect(ci.jobs['quality-gate']?.if).toBe('always()')
    })

    it('does not misclassify the pre-existing workflow_dispatch conditions on the three e2e suite jobs', () => {
      const e2e = loadWorkflow(WORKFLOW_RELATIVE_PATHS.e2e)
      for (const jobId of ['e2e-tests', 'visual-regression', 'accessibility-tests']) {
        const job = e2e.jobs[jobId]
        expect(job?.if).toBeDefined()
        expect(job?.if).toMatch(/workflow_dispatch/)
        expect(job?.if).not.toMatch(FILTER_KEYED_JOB_IF)
      }
    })
  })

  it('invariant 2: every category referenced by a workflow filter step exists in .github/filters.yaml', () => {
    const filterCategories = new Set(
      Object.keys(parseYaml(readRepoFile('.github/filters.yaml')) as Record<string, unknown>),
    )
    const referencedCategories = new Set<string>()

    for (const relativePath of Object.values(WORKFLOW_RELATIVE_PATHS)) {
      const raw = readRepoFile(relativePath)
      for (const match of raw.matchAll(/steps\.filter\.outputs\.([\w-]+)/g)) {
        const category = match[1]
        if (category) referencedCategories.add(category)
      }
    }

    // Sanity check the extraction itself found something — an empty set would make the
    // membership loop below vacuously true and prove nothing.
    expect(referencedCategories.size).toBeGreaterThan(0)

    for (const category of referencedCategories) {
      expect(filterCategories.has(category)).toBe(true)
    }
  })

  it('invariant 3: e2e-tests.yaml keeps download and run steps symmetrically gated for each suite', () => {
    const e2e = loadWorkflow(WORKFLOW_RELATIVE_PATHS.e2e)
    const suites = [
      {jobId: 'e2e-tests', runStepName: 'Run E2E tests'},
      {jobId: 'visual-regression', runStepName: 'Run visual regression tests'},
      {jobId: 'accessibility-tests', runStepName: 'Run accessibility tests'},
    ]

    for (const {jobId, runStepName} of suites) {
      const steps = e2e.jobs[jobId]?.steps ?? []
      const downloadStep = steps.find(step => step.name === 'Download build artifacts')
      const runStep = steps.find(step => step.name === runStepName)

      expect(downloadStep?.if).toBeDefined()
      expect(runStep?.if).toBeDefined()
      expect(downloadStep?.if).toBe(runStep?.if)
    }
  })

  it('invariant 4: every gate step fails closed on an unexpected filter value', () => {
    const gateSteps = collectGateSteps()
    // ci.yaml has 2 (gate-unit-tests, gate-build-typecheck), e2e-tests.yaml has 1 (gate),
    // performance.yaml has 1 (gate).
    expect(gateSteps.length).toBeGreaterThanOrEqual(4)

    for (const {step} of gateSteps) {
      expect(step.run).toBeDefined()
      expect(step.run).toMatch(/::error::/)
      expect(step.run).toMatch(/exit 1/)
    }
  })

  it('invariant 5: every gate step treats a non-pull_request event as run-everything', () => {
    const gateSteps = collectGateSteps()
    expect(gateSteps.length).toBeGreaterThanOrEqual(4)

    for (const {step} of gateSteps) {
      const run = step.run ?? ''
      const bypassIndex = run.search(/EVENT_NAME"\s*!=\s*['"]pull_request['"]/)
      expect(bypassIndex).toBeGreaterThanOrEqual(0)
      // The branch immediately following the bypass check must resolve to "run everything",
      // not fall through to the fail-closed branch.
      expect(run.slice(bypassIndex, bypassIndex + 200)).toMatch(/(run=true|RESULT='true')/)
    }
  })

  it('invariant 6: job names still cover the required status check contexts', () => {
    const ci = loadWorkflow(WORKFLOW_RELATIVE_PATHS.ci)
    const e2e = loadWorkflow(WORKFLOW_RELATIVE_PATHS.e2e)
    const performance = loadWorkflow(WORKFLOW_RELATIVE_PATHS.performance)
    const requiredChecks = new Set(SCRIPT_CONFIG.requiredChecks)

    for (const job of Object.values(ci.jobs)) {
      expect(job.name).toBeDefined()
      expect(requiredChecks.has(job.name ?? '')).toBe(true)
    }

    for (const jobId of ['setup', 'build-for-tests', 'test-summary', 'notification'] as const) {
      const job = e2e.jobs[jobId]
      expect(job?.name).toBeDefined()
      expect(requiredChecks.has(job?.name ?? '')).toBe(true)
    }

    // The matrixed e2e-tests job name must resolve to the one required browser context. A
    // RegExp (rather than a plain string) sidesteps the "looks like a forgotten template
    // literal" lint rule for `${{ matrix.browser }}`.
    const resolvedE2eName = e2e.jobs['e2e-tests']?.name?.replace(/\$\{\{ matrix\.browser \}\}/, 'chromium')
    expect(resolvedE2eName).toBe('E2E Tests (chromium)')
    expect(requiredChecks.has(resolvedE2eName ?? '')).toBe(true)

    expect(requiredChecks.has(performance.jobs['performance-summary']?.name ?? '')).toBe(true)
    expect(performance.jobs['performance-audit']?.name).toBe('Performance Audit')
    const devices = performance.jobs['performance-audit']?.strategy?.matrix?.device as string[] | undefined
    expect(devices).toEqual(['desktop', 'mobile'])
    for (const device of devices ?? []) {
      expect(requiredChecks.has(`Performance Audit (${device})`)).toBe(true)
    }
  })

  describe('invariant 7: performance.yaml lhci-reports consumers', () => {
    it('gates the step that throws without lighthouse evidence', () => {
      const performance = loadWorkflow(WORKFLOW_RELATIVE_PATHS.performance)
      const steps = performance.jobs['performance-audit']?.steps ?? []
      const collect = steps.find(step => step.name === 'Collect performance artifacts')

      expect(collect?.if).toBe("steps.gate.outputs.run == 'true'")
    })

    it('leaves the dashboard and report steps ungated because they degrade safely on their own', () => {
      const performance = loadWorkflow(WORKFLOW_RELATIVE_PATHS.performance)
      const steps = performance.jobs['performance-audit']?.steps ?? []
      const dashboard = steps.find(step => step.name === 'Generate performance dashboard')
      const report = steps.find(step => step.name === 'Generate performance report')

      expect(dashboard?.if).toBeUndefined()
      expect(report?.if).toBeUndefined()
      // The report step's degrade-safe check is visible directly in the workflow YAML, so it
      // can be asserted from the parsed step text alone.
      expect(report?.run).toMatch(/if \[ -d "lhci-reports-\$\{\{ matrix\.device \}\}" \]/)
    })

    // The dashboard step's degrade-safe behavior is NOT visible in the workflow YAML text — it
    // lives inside scripts/performance-dashboard.ts as an `existsSync` guard around each
    // `lhci-reports-<device>` read. A pure YAML-parsing assertion cannot prove that claim (the
    // step is just `run: pnpm run test:performance:dashboard` with no inline check), so this
    // test proves it empirically instead: it runs the exact command each step invokes, against
    // a directory containing none of the expected Lighthouse evidence, and asserts on the real
    // exit code. This mirrors Unit 4's manual trace as an automated, executable check instead
    // of a static-text pattern match that could pass without verifying real behavior.
    it('empirically proves the gated step throws and the ungated dashboard step does not', () => {
      const emptyDirectory = mkdtempSync(join(tmpdir(), 'ci-path-filtering-lhci-'))
      temporaryDirectories.push(emptyDirectory)

      const collectResult = spawnSync(
        process.execPath,
        [
          '--import',
          join(process.cwd(), 'node_modules/tsx/dist/loader.mjs'),
          join(process.cwd(), 'scripts/performance-artifacts.ts'),
        ],
        {
          cwd: emptyDirectory,
          encoding: 'utf8',
          env: {...process.env, DEVICE_TYPE: 'desktop'},
        },
      )
      expect(collectResult.status).not.toBe(0)
      expect(collectResult.stderr).toContain('No performance artifacts were collected')

      const dashboardResult = spawnSync(
        process.execPath,
        [
          '--import',
          join(process.cwd(), 'node_modules/tsx/dist/loader.mjs'),
          join(process.cwd(), 'scripts/performance-dashboard.ts'),
        ],
        {
          cwd: emptyDirectory,
          encoding: 'utf8',
          env: process.env,
        },
      )
      expect(dashboardResult.status).toBe(0)
    })
  })
})
