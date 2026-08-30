import {spawnSync} from 'node:child_process'
import {chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join, resolve} from 'node:path'
import {describe, expect, it} from 'vitest'

const hookPath = resolve(process.cwd(), '.github/git-hooks/pre-push.ts')

describe('pre-push hook scheduling', () => {
  it('runs tests in isolation before starting lint and build', () => {
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
if (markerPath === undefined || check === undefined) {
  process.exit(2)
}
if (check === 'test' && !process.argv.includes('--maxWorkers=2')) {
  process.exit(3)
}

appendFileSync(markerPath, check + ':start\n')
await new Promise(resolve => setTimeout(resolve, check === 'test' ? 100 : 10))
appendFileSync(markerPath, check + ':end\n')
`
      writeFileSync(pnpmPath, fakePnpmScript, {mode: 0o755})
      chmodSync(pnpmPath, 0o755)

      const result = spawnSync(process.execPath, [hookPath], {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${binDirectory}:${process.env.PATH ?? ''}`,
          PRE_PUSH_MARKERS: markerPath,
        },
      })

      expect(result.status).toBe(0)
      const markers = readFileSync(markerPath, 'utf8').trim().split('\n')
      const markerIndex = (marker: string) => markers.indexOf(marker)
      expect(markerIndex('test:end')).toBeLessThan(markerIndex('lint:start'))
      expect(markerIndex('test:end')).toBeLessThan(markerIndex('build:start'))
      expect(markerIndex('lint:start')).toBeLessThan(markerIndex('lint:end'))
      expect(markerIndex('build:start')).toBeLessThan(markerIndex('build:end'))
    } finally {
      rmSync(directory, {recursive: true, force: true})
    }
  })
})
