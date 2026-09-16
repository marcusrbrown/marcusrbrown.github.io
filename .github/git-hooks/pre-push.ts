import type {ChildProcess} from 'node:child_process'
import {spawn} from 'node:child_process'
import process from 'node:process'

interface Check {
  label: string
  args: string[]
}

interface CheckResult {
  check: Check
  result: PromiseSettledResult<void>
}

const isolatedChecks: readonly Check[] = [{label: 'test', args: ['run', 'test']}]
const parallelChecks: readonly Check[] = [
  {label: 'lint', args: ['run', 'lint']},
  {label: 'build', args: ['run', 'build']},
]

// Automated CI runners (GitHub Actions, Renovate's container) already enforce lint/test/build as
// required status checks on the pull request. Running the full suite again inside the pre-push
// hook there is redundant and, for long-running/self-hosted automation (e.g. Renovate), can exceed
// job timeouts and block every push. `CI` is the de facto standard signal every CI vendor sets;
// `GITHUB_ACTIONS` is checked too so a GitHub Actions job that only sets its own vendor var (and
// not the generic one, however unlikely) still skips. Local developer pushes never set either, so
// this does not weaken the hook for its intended audience.
const isRunningInCi = process.env.CI !== undefined || process.env.GITHUB_ACTIONS !== undefined

if (isRunningInCi) {
  // eslint-disable-next-line no-console
  console.log(
    '\n[pre-push] skipping checks: running in CI (CI or GITHUB_ACTIONS is set) — CI enforces the same checks as required status checks',
  )
  process.exit(0)
}

const activeChildren = new Set<ChildProcess>()

function forwardSignal(signal: NodeJS.Signals) {
  for (const child of activeChildren) {
    child.kill(signal)
  }

  process.exit(1)
}

process.on('SIGINT', () => forwardSignal('SIGINT'))
process.on('SIGTERM', () => forwardSignal('SIGTERM'))

function runCheck(label: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn('pnpm', [...args], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    })

    activeChildren.add(child)

    child.on('error', error => {
      activeChildren.delete(child)
      reject(new Error(`${label} failed to start: ${error.message}`))
    })

    child.on('close', code => {
      activeChildren.delete(child)

      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`${label} exited with code ${code ?? 'unknown'}`))
    })
  })
}

async function runChecks(checks: readonly Check[]): Promise<CheckResult[]> {
  return Promise.all(
    checks.map(async check => {
      const [result] = await Promise.allSettled([runCheck(check.label, check.args)])
      return {check, result}
    }),
  )
}

const results = [...(await runChecks(isolatedChecks)), ...(await runChecks(parallelChecks))]
const failedChecks = results.filter(({result}) => result.status === 'rejected')

if (failedChecks.length > 0) {
  for (const {check, result} of failedChecks) {
    if (result.status === 'rejected') {
      console.error(
        `\n[pre-push] ${check.label}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`,
      )
    }
  }

  process.exit(1)
}

// eslint-disable-next-line no-console
console.log('\n[pre-push] all checks passed')
