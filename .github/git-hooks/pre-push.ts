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
