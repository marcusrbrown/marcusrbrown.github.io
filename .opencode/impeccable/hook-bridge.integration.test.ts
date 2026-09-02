/**
 * Integration coverage for the real `node:child_process` subprocess runner.
 * Exercises actual child processes via ephemeral fixture scripts written to
 * a temp dir at test runtime — no fixture files are tracked in the repo.
 */
import {randomUUID} from 'node:crypto'
import {mkdirSync, mkdtempSync, readFileSync as readFileSyncTop, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

import {afterEach, describe, expect, it} from 'vitest'

import {buildHookPayload, createHook, createSpawnRunner, HOOK_SCRIPT_RELATIVE_PATH} from './hook-bridge.ts'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

let tmpDir: string | undefined

function worktree(): string {
  tmpDir ??= mkdtempSync(join(tmpdir(), 'impeccable-bridge-'))
  return tmpDir
}

function fixture(script: string): string {
  const path = join(worktree(), `${randomUUID()}.mjs`)
  writeFileSync(path, script, 'utf-8')
  return path
}

afterEach(() => {
  if (tmpDir) {
    rmSync(tmpDir, {recursive: true, force: true})
    tmpDir = undefined
  }
})

const payload = buildHookPayload({
  tool: 'edit',
  args: {filePath: '/repo/src/App.tsx'},
  cwd: '/repo',
  sessionID: 'sess-1',
})

describe('createSpawnRunner', () => {
  it('resolves quiet-clean: exit 0, empty stdout, empty stderr', async () => {
    const scriptPath = fixture('process.exit(0);\n')
    const runner = createSpawnRunner({scriptPath})
    const result = await runner(payload, {worktree: worktree()})
    expect(result).toEqual({stdout: '', stderr: '', exitCode: 0})
  })

  it('returns the well-formed Claude PostToolUse envelope on stdout', async () => {
    const envelope = JSON.stringify({
      hookSpecificOutput: {hookEventName: 'PostToolUse', additionalContext: 'found: gradient-text'},
    })
    // No trailing process.exit(): writes to a pipe are async, and exiting
    // immediately after a write can truncate it before the OS pipe flushes.
    const scriptPath = fixture(`process.stdout.write(${JSON.stringify(envelope)});\n`)
    const runner = createSpawnRunner({scriptPath})
    const result = await runner(payload, {worktree: worktree()})
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe(envelope)
    expect(result.stderr).toBe('')
  })

  it('surfaces a nonzero exit code', async () => {
    const scriptPath = fixture('process.exit(3);\n')
    const runner = createSpawnRunner({scriptPath})
    const result = await runner(payload, {worktree: worktree()})
    expect(result.exitCode).toBe(3)
  })

  it('surfaces malformed non-empty stdout as-is (parsing is the bridge/createHook layer\'s job)', async () => {
    const scriptPath = fixture('process.stdout.write("not json");\nprocess.exit(0);\n')
    const runner = createSpawnRunner({scriptPath})
    const result = await runner(payload, {worktree: worktree()})
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe('not json')
  })

  it('surfaces stderr-only output alongside an exit-0, empty-stdout child', async () => {
    const scriptPath = fixture('process.stderr.write("diagnostic noise");\nprocess.exit(0);\n')
    const runner = createSpawnRunner({scriptPath})
    const result = await runner(payload, {worktree: worktree()})
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe('')
    expect(result.stderr).toContain('diagnostic noise')
  })

  it('treats output exceeding the bounded capture size as a non-zero-exit anomaly, never buffering unbounded output', async () => {
    const scriptPath = fixture('process.stdout.write("x".repeat(200));\nprocess.exit(0);\n')
    const runner = createSpawnRunner({scriptPath, maxOutputBytes: 64})
    const result = await runner(payload, {worktree: worktree()})
    expect(result.exitCode).not.toBe(0)
    expect(result.stdout.length).toBeLessThan(200)
  })

  it('spawns with harness=claude and quiet=1 set, and both depth env vars stripped', async () => {
    const scriptPath = fixture(
      [
        'process.stdout.write(JSON.stringify({',
        '  harness: process.env.IMPECCABLE_HOOK_HARNESS,',
        '  quiet: process.env.IMPECCABLE_HOOK_QUIET,',
        '  impeccableDepth: process.env.IMPECCABLE_HOOK_DEPTH ?? null,',
        '  claudeDepth: process.env.CLAUDE_HOOK_DEPTH ?? null,',
        '}));',
        'process.exit(0);',
      ].join('\n'),
    )
    const runner = createSpawnRunner({scriptPath})
    const prevEnv = {IMPECCABLE_HOOK_DEPTH: process.env.IMPECCABLE_HOOK_DEPTH, CLAUDE_HOOK_DEPTH: process.env.CLAUDE_HOOK_DEPTH}
    process.env.IMPECCABLE_HOOK_DEPTH = '1'
    process.env.CLAUDE_HOOK_DEPTH = '1'
    try {
      const result = await runner(payload, {worktree: worktree()})
      expect(JSON.parse(result.stdout)).toEqual({
        harness: 'claude',
        quiet: '1',
        impeccableDepth: null,
        claudeDepth: null,
      })
    } finally {
      process.env.IMPECCABLE_HOOK_DEPTH = prevEnv.IMPECCABLE_HOOK_DEPTH
      process.env.CLAUDE_HOOK_DEPTH = prevEnv.CLAUDE_HOOK_DEPTH
    }
  })

  it('sends the payload over stdin without cross-contaminating stdout/stderr', async () => {
    const scriptPath = fixture(
      [
        'const chunks = [];',
        'for await (const chunk of process.stdin) chunks.push(chunk);',
        'const body = Buffer.concat(chunks).toString("utf-8");',
        'const parsed = JSON.parse(body);',
        'process.stderr.write("stderr-marker");',
        'process.stdout.write(JSON.stringify({toolFromStdin: parsed.tool_name}));',
      ].join('\n'),
    )
    const runner = createSpawnRunner({scriptPath})
    const result = await runner(payload, {worktree: worktree()})
    expect(JSON.parse(result.stdout)).toEqual({toolFromStdin: 'edit'})
    expect(result.stderr).toBe('stderr-marker')
  })

  it('resolves to a nonzero exit when node runs but the script file does not exist (MODULE_NOT_FOUND, not a spawn failure)', async () => {
    const runner = createSpawnRunner({scriptPath: join(tmpdir(), `does-not-exist-${randomUUID()}.mjs`)})
    const result = await runner(payload, {worktree: worktree()})
    expect(result.exitCode).not.toBe(0)
  })

  it('resolves to exit -1 via the child_process error event when the node executable itself does not exist', async () => {
    const scriptPath = fixture('process.exit(0);\n')
    const runner = createSpawnRunner({scriptPath, nodeExecutable: `/does-not-exist-${randomUUID()}/node`})
    const result = await runner(payload, {worktree: worktree()})
    expect(result.exitCode).toBe(-1)
  })

  it('captures actual UTF-8 bytes, never decoded string length, against maxOutputBytes', async () => {
    // 'é' is 1 UTF-16 code unit (string.length) but 2 UTF-8 bytes — a
    // length-based cap would let ~2x the intended byte budget through.
    const scriptPath = fixture(`process.stdout.write('é'.repeat(50));\n`)
    const runner = createSpawnRunner({scriptPath, maxOutputBytes: 20})
    const result = await runner(payload, {worktree: worktree()})
    expect(result.exitCode).not.toBe(0)
    expect(Buffer.byteLength(result.stdout, 'utf-8')).toBeLessThanOrEqual(20)
  })

  it('never re-expands a split multibyte UTF-8 character past the byte cap when the cap lands mid-character', async () => {
    // 21 is odd and 'é' is 2 bytes, so the 21-byte prefix of 50 'é's ends
    // mid-character (10 full chars + 1 dangling lead byte). A naive
    // Buffer.toString('utf-8') on that slice replaces the dangling byte
    // with U+FFFD (3 bytes), re-expanding the result past the 21-byte cap
    // instead of staying within it.
    const scriptPath = fixture(`process.stdout.write('é'.repeat(50));\n`)
    const runner = createSpawnRunner({scriptPath, maxOutputBytes: 21})
    const result = await runner(payload, {worktree: worktree()})
    expect(result.exitCode).not.toBe(0)
    expect(Buffer.byteLength(result.stdout, 'utf-8')).toBeLessThanOrEqual(21)
  })

  it('classifies a child that catches SIGTERM and exits 0 with empty output as an anomaly, not quiet-clean, when the hard timer already fired', async () => {
    const pidFile = join(tmpdir(), `impeccable-pid-${randomUUID()}.txt`)
    const markerFile = join(tmpdir(), `impeccable-sigterm-marker-${randomUUID()}.txt`)
    const scriptPath = fixture(
      [
        `import {writeFileSync} from 'node:fs';`,
        `writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));`,
        // Handles SIGTERM by exiting cleanly — this must NOT be mistaken
        // for a normal quiet-clean run once the hard timer has fired.
        // Writes a marker before exiting so the test can prove the graceful
        // handler branch actually ran, rather than passing incidentally via
        // SIGKILL (which would never execute this handler at all).
        `process.on('SIGTERM', () => { writeFileSync(${JSON.stringify(markerFile)}, 'graceful'); process.exit(0); });`,
        `setInterval(() => {}, 1000);`, // stay alive until signaled
      ].join('\n'),
    )
    const runner = createSpawnRunner({scriptPath, timeoutMs: 500, killGraceMs: 100})
    const result = await runner(payload, {worktree: worktree()})

    expect(result.exitCode).not.toBe(0)
    expect(result.stdout).toBe('')
    expect(result.stderr).toBe('')

    const {readFileSync, existsSync} = await import('node:fs')
    // Proves the graceful SIGTERM handler ran (not that SIGKILL happened to
    // also produce a dead process) — the marker only exists if the handler
    // itself executed before the process exited.
    expect(existsSync(markerFile)).toBe(true)
    rmSync(markerFile, {force: true})

    const pid = Number(readFileSync(pidFile, 'utf-8'))
    expect(() => process.kill(pid, 0)).toThrow()
    rmSync(pidFile, {force: true})
  })

  it('escalates SIGTERM to SIGKILL on timeout and confirms the process is gone/reaped', async () => {
    const pidFile = join(tmpdir(), `impeccable-pid-${randomUUID()}.txt`)
    const scriptPath = fixture(
      [
        `import {writeFileSync} from 'node:fs';`,
        `writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));`,
        `process.on('SIGTERM', () => {});`, // ignore the graceful signal
        `setInterval(() => {}, 1000);`, // stay alive
      ].join('\n'),
    )
    // Allow cold Node startup and PID-file creation under contention; this test
    // is about SIGKILL/reaping, not making startup latency part of the fixture.
    const runner = createSpawnRunner({scriptPath, timeoutMs: 1000, killGraceMs: 100})
    const start = Date.now()
    const result = await runner(payload, {worktree: worktree()})
    const elapsedMs = Date.now() - start

    expect(result.exitCode).not.toBe(0)
    // Bounded: hard timeout + grace + slack, well under the bridge-level deadline.
    expect(elapsedMs).toBeLessThan(2000)

    const {readFileSync} = await import('node:fs')
    const pid = Number(readFileSync(pidFile, 'utf-8'))
    expect(() => process.kill(pid, 0)).toThrow()
    rmSync(pidFile, {force: true})
  }, 15_000)
})

describe('createSpawnRunner + createHook end-to-end', () => {
  it('appends only additionalContext to tool output for a real child producing the Claude envelope', async () => {
    const envelope = JSON.stringify({
      hookSpecificOutput: {hookEventName: 'PostToolUse', additionalContext: 'found: gradient-text at L3'},
    })
    const scriptPath = fixture(`process.stdout.write(${JSON.stringify(envelope)});\nprocess.exit(0);\n`)
    const hook = createHook({runDetector: createSpawnRunner({scriptPath}), worktree: worktree()})
    const output = {title: 't', output: 'ok', metadata: {}}
    await hook({tool: 'edit', sessionID: 's', callID: 'c', args: {filePath: '/repo/src/App.tsx'}}, output)
    expect(output.output).toContain('found: gradient-text at L3')
    expect(output.output).not.toContain('hookSpecificOutput')
  })

  it('never invokes the runner and leaves output untouched when no path is extractable', async () => {
    let invoked = false
    const scriptPath = fixture('process.exit(0);\n')
    const baseRunner = createSpawnRunner({scriptPath})
    const hook = createHook({
      runDetector: async (p, o) => {
        invoked = true
        return baseRunner(p, o)
      },
      worktree: worktree(),
    })
    const output = {title: 't', output: 'ok', metadata: {}}
    await hook({tool: 'edit', sessionID: 's', callID: 'c', args: {}}, output)
    expect(invoked).toBe(false)
    expect(output.output).toBe('ok')
  })

  it('does not resolve while a SIGTERM-resistant child is still alive (composition race)', async () => {
    const pidFile = join(tmpdir(), `impeccable-pid-${randomUUID()}.txt`)
    const scriptPath = fixture(
      [
        `import {writeFileSync} from 'node:fs';`,
        `writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));`,
        `process.on('SIGTERM', () => {});`, // ignore the graceful signal
        `setInterval(() => {}, 1000);`, // stay alive
      ].join('\n'),
    )
    const runner = createSpawnRunner({scriptPath, timeoutMs: 1000, killGraceMs: 100})
    const hook = createHook({runDetector: runner, worktree: worktree()})
    const output = {title: 't', output: 'ok', metadata: {}}

    await hook({tool: 'edit', sessionID: 's', callID: 'c', args: {filePath: '/repo/src/App.tsx'}}, output)

    const {readFileSync} = await import('node:fs')
    const pid = Number(readFileSync(pidFile, 'utf-8'))
    // The hook promise must not resolve until the real child is confirmed
    // gone/reaped — a resolved promise with the process still alive is the
    // exact composition race under test.
    expect(() => process.kill(pid, 0)).toThrow()
    rmSync(pidFile, {force: true})
  })
})

describe('withMoveToScanMarkers + real vendor hook.mjs', () => {
  it('scans the Move-to destination (not the pre-move path) for a detectable finding via the real vendor hook script', async () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'impeccable-move-target-'))
    writeFileSync(join(projectDir, 'package.json'), '{}', 'utf-8')
    mkdirSync(join(projectDir, 'new'), {recursive: true})
    // Destination-only: old path never exists on disk, proving the scan
    // must come from the Move-to marker, not incidental file presence.
    const destRelative = 'new/name.tsx'
    writeFileSync(
      join(projectDir, destRelative),
      // Detector's regex engine matches per-line: background-clip:text and
      // "gradient" must appear on the same line to register as a finding.
      '.gradient-heading { background-clip: text; background-image: linear-gradient(red, blue); }\n',
      'utf-8',
    )

    const patchText = [
      '*** Begin Patch',
      '*** Update File: old/name.tsx',
      `*** Move to: ${destRelative}`,
      '*** End Patch',
    ].join('\n')

    const sessionID = `move-target-${randomUUID()}`
    const hookPayload = buildHookPayload({tool: 'apply_patch', args: {patchText}, cwd: projectDir, sessionID})

    const scriptPath = join(REPO_ROOT, HOOK_SCRIPT_RELATIVE_PATH)
    const runner = createSpawnRunner({scriptPath})
    const result = await runner(hookPayload, {worktree: projectDir})

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('additionalContext')
    expect(result.stdout).not.toContain('old/name.tsx')

    const cacheRaw = JSON.parse(readFileSyncTop(join(projectDir, '.impeccable', 'hook.cache.json'), 'utf-8')) as {
      sessions?: Record<string, {files?: Record<string, unknown>}>
    }
    const sessionCache = cacheRaw.sessions?.[sessionID]
    expect(sessionCache).toBeDefined()
    const cachedFiles = Object.keys(sessionCache?.files ?? {})
    expect(cachedFiles.some(f => f.endsWith(destRelative))).toBe(true)

    rmSync(projectDir, {recursive: true, force: true})
  })
})

describe('plugin module and registration', () => {
  it('plugin.ts exports exactly one runtime export, and it is a function', async () => {
    const mod: Record<string, unknown> = await import('./plugin.ts')
    const exportNames = Object.keys(mod)
    expect(exportNames).toHaveLength(1)
    expect(typeof mod[exportNames[0]!]).toBe('function')
  })

  it('root opencode.json registers plugin.ts by the exact relative path', () => {
    const config = JSON.parse(readFileSyncTop(join(REPO_ROOT, 'opencode.json'), 'utf-8')) as {plugin?: unknown}
    expect(config.plugin).toEqual(['./.opencode/impeccable/plugin.ts'])
  })

  it('invoking the plugin factory with a representative PluginInput returns callable tool.execute.after, and it never invokes a subprocess for a non-mutating tool', async () => {
    const {ImpeccablePlugin} = await import('./plugin.ts')
    const wt = worktree()
    const input: Parameters<typeof ImpeccablePlugin>[0] = {
      client: {} as Parameters<typeof ImpeccablePlugin>[0]['client'],
      project: {} as Parameters<typeof ImpeccablePlugin>[0]['project'],
      directory: wt,
      worktree: wt,
      experimental_workspace: {register: () => {}},
      serverUrl: new URL('http://localhost:0'),
      $: (() => {}) as unknown as Parameters<typeof ImpeccablePlugin>[0]['$'],
    }

    const hooks = await ImpeccablePlugin(input)
    expect(typeof hooks['tool.execute.after']).toBe('function')

    const output = {title: 't', output: 'ok', metadata: {}}
    await hooks['tool.execute.after']?.({tool: 'read', sessionID: 's', callID: 'c', args: {}}, output)
    // A real subprocess would take non-trivial time and/or mutate output on
    // failure; for a non-mutating tool neither should happen — the bypass
    // fires before any runner (real or otherwise) is reached.
    expect(output.output).toBe('ok')
  })
})
