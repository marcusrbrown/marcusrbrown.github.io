import {spawnSync} from 'node:child_process'
import {chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join, resolve} from 'node:path'
import {describe, expect, it} from 'vitest'

const hookPath = resolve(process.cwd(), '.github/git-hooks/pre-push.ts')

const readMarkers = (markerPath: string) => {
  try {
    return readFileSync(markerPath, 'utf8').trim().split('\n')
  } catch {
    return []
  }
}

const runHook = (failChecks: readonly string[] = [], extraEnv: Record<string, string | undefined> = {}) => {
  const directory = mkdtempSync(join(tmpdir(), 'pre-push-hook-'))
  const binDirectory = join(directory, 'bin')
  const markerPath = join(directory, 'markers.log')
  const pnpmPath = join(binDirectory, 'pnpm')

  try {
    mkdirSync(binDirectory)
    const fakePnpmScript = String.raw`#!/usr/bin/env node
import {appendFileSync} from 'node:fs'

const check = process.argv[3]
const markerPath = process.env.PRE_PUSH_MARKERS
const failChecks = new Set((process.env.PRE_PUSH_FAIL_CHECKS ?? '').split(',').filter(Boolean))
if (markerPath === undefined || check === undefined) {
  process.exit(2)
}
if (check === 'test' && (process.argv.includes('--') || process.argv.some(arg => arg.startsWith('--maxWorkers')))) {
  process.exit(3)
}

appendFileSync(markerPath, check + ':start\n')
await new Promise(resolve => setTimeout(resolve, check === 'test' ? 100 : 10))
if (failChecks.has(check)) {
  process.exit(1)
}
appendFileSync(markerPath, check + ':end\n')
`
    writeFileSync(pnpmPath, fakePnpmScript, {mode: 0o755})
    chmodSync(pnpmPath, 0o755)

    const env: Record<string, string | undefined> = {
      ...process.env,
      PATH: `${binDirectory}:${process.env.PATH ?? ''}`,
      PRE_PUSH_FAIL_CHECKS: failChecks.join(','),
      PRE_PUSH_MARKERS: markerPath,
    }

    // Scrub CI signals by default so a test of the hook's normal path is deterministic
    // regardless of the ambient environment running this suite — GitHub Actions sets both
    // CI=true and GITHUB_ACTIONS=true, which would otherwise silently divert every call into
    // the CI-bypass path. Tests exercising that path opt in explicitly via extraEnv.
    delete env.CI
    delete env.GITHUB_ACTIONS

    Object.assign(env, extraEnv)

    for (const [key, value] of Object.entries(extraEnv)) {
      if (value === undefined) {
        delete env[key]
      }
    }

    const result = spawnSync(process.execPath, [hookPath], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env,
    })

    return {
      markers: readMarkers(markerPath),
      output: `${String(result.stdout ?? '')}${String(result.stderr ?? '')}`,
      status: result.status,
    }
  } finally {
    rmSync(directory, {recursive: true, force: true})
  }
}

describe('pre-push hook scheduling', () => {
  it('runs tests in isolation before starting lint and build', () => {
    const result = runHook()
    const markerIndex = (marker: string) => result.markers.indexOf(marker)

    expect(result.status).toBe(0)
    expect(markerIndex('test:end')).toBeLessThan(markerIndex('lint:start'))
    expect(markerIndex('test:end')).toBeLessThan(markerIndex('build:start'))
    expect(markerIndex('lint:start')).toBeLessThan(markerIndex('lint:end'))
    expect(markerIndex('build:start')).toBeLessThan(markerIndex('build:end'))
  })
})

describe('pre-push hook failure attribution', () => {
  it('reports parallel check failures under their own labels', () => {
    const result = runHook(['lint', 'build'])

    expect(result.status).toBe(1)
    expect(result.output).toContain('[pre-push] lint: lint exited with code 1')
    expect(result.output).toContain('[pre-push] build: build exited with code 1')
    expect(result.output).not.toContain('[pre-push] test:')
  })

  it('reports an isolated test failure under the test label', () => {
    const result = runHook(['test'])

    expect(result.status).toBe(1)
    expect(result.output).toContain('[pre-push] test: test exited with code 1')
    expect(result.output).not.toContain('[pre-push] lint:')
    expect(result.output).not.toContain('[pre-push] build:')
  })
})

describe('pre-push hook CI bypass', () => {
  it('skips all checks and exits 0 when CI is set', () => {
    const result = runHook([], {CI: 'true'})

    expect(result.status).toBe(0)
    expect(result.markers).toEqual([])
    expect(result.output).toContain('[pre-push] skipping checks: running in CI')
  })

  it('skips all checks and exits 0 when GITHUB_ACTIONS is set', () => {
    const result = runHook([], {GITHUB_ACTIONS: 'true'})

    expect(result.status).toBe(0)
    expect(result.markers).toEqual([])
    expect(result.output).toContain('[pre-push] skipping checks: running in CI')
  })

  it('runs checks as normal and fails the push when CI is not set', () => {
    const result = runHook(['test'])

    expect(result.status).toBe(1)
    expect(result.output).toContain('[pre-push] test: test exited with code 1')
    expect(result.output).not.toContain('[pre-push] skipping checks')
  })
})
