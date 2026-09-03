/**
 * Pure, Node-testable core of the Impeccable OpenCode bridge.
 *
 * Mirrors `.github/hooks/impeccable.json`: after a file-mutating tool call,
 * pipe a hook.mjs-shaped event to `.agents/skills/impeccable/scripts/hook.mjs`
 * over stdin and surface any findings back to the agent in the same turn.
 *
 * Advisory only — never blocks a tool call. Fail-loud: bridge/parse failures
 * emit a one-time warning per session instead of silently doing nothing.
 *
 * This module must NOT import from `@opencode-ai/plugin` and must NOT use Bun
 * `$` — the OpenCode plugin loader iterates a plugin module's exports and
 * treats each as a candidate plugin factory, so `.opencode/impeccable/plugin.ts`
 * must export ONLY the plugin factory. Everything else lives here.
 *
 */

import {spawn} from 'node:child_process'
import {StringDecoder} from 'node:string_decoder'

/**
 * The value `hook.mjs`'s `resolveHarness()` reads via the `IMPECCABLE_HOOK_HARNESS`
 * env override. Our payload is claude-shaped
 * (`tool_name`/`tool_input.file_path`/`tool_input.command`), and
 * `normalizeHookEvent(event, cwd, 'claude')` passes claude-harness events
 * through UNCHANGED (hook-lib.mjs: `if (harness !== 'cursor') return event`).
 * 'github' would instead route through `normalizeGitHubEvent`, which expects
 * camelCase `toolName`/`toolArgs` and would only work by incidental spread of
 * our pre-set `tool_input` — silently dropping apply_patch multi-file parsing.
 */
export const IMPECCABLE_HOOK_HARNESS = 'claude'

/** Absolute-worktree-relative path to the shared hook script, matching `.github/hooks/impeccable.json`. */
export const HOOK_SCRIPT_RELATIVE_PATH = '.agents/skills/impeccable/scripts/hook.mjs'

/** Matches the Copilot hook's `timeoutSec: 5`. */
export const DETECTOR_TIMEOUT_MS = 5000

const MUTATING_BASE_TOOLS = new Set(['edit', 'write', 'apply_patch'])
const MUTATING_SUFFIX_RE = /_(edit|write|apply_patch)$/

/** True for bare (`edit`/`write`/`apply_patch`) and MCP-namespaced-suffixed (`aft_edit`, `x_write`, …) mutating tool names. */
export function isMutatingTool(tool: string): boolean {
  if (typeof tool !== 'string' || !tool) return false
  if (MUTATING_BASE_TOOLS.has(tool)) return true
  return MUTATING_SUFFIX_RE.test(tool)
}

const APPLY_PATCH_FILE_LINE_RE = /^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/gm
const APPLY_PATCH_MOVE_TO_RE = /^\*\*\* Move to: (.+)$/gm
const APPLY_PATCH_ADD_OR_UPDATE_RE = /^\*\*\* (?:Add File|Update File): (.+)$/gm

function parseApplyPatchPaths(patchText: string): string[] {
  const out: string[] = []
  for (const match of patchText.matchAll(APPLY_PATCH_FILE_LINE_RE)) {
    const p = (match[1] ?? '').trim()
    if (p && !out.includes(p)) out.push(p)
  }
  return out
}

/**
 * The vendor `hook.mjs` parser (`.agents/skills/impeccable/scripts/hook-lib.mjs`
 * `parseApplyPatchPaths`) only recognizes `*** Add File:` / `*** Update File:`
 * markers, not `*** Move to:`, so a rename's destination is silently never
 * scanned. Vendor code is not modified — instead this appends a synthetic
 * `*** Update File: <dest>` marker per unique Move-to destination not already
 * covered by an Add/Update marker, so the vendor parser picks it up. The
 * original patch text is preserved verbatim; markers are appended, not
 * inserted inline, to avoid perturbing patch parsing elsewhere.
 */
function withMoveToScanMarkers(patchText: string): string {
  const alreadyCovered = new Set<string>()
  for (const match of patchText.matchAll(APPLY_PATCH_ADD_OR_UPDATE_RE)) {
    const p = (match[1] ?? '').trim()
    if (p) alreadyCovered.add(p)
  }

  const destinations: string[] = []
  for (const match of patchText.matchAll(APPLY_PATCH_MOVE_TO_RE)) {
    const p = (match[1] ?? '').trim()
    if (p && !alreadyCovered.has(p) && !destinations.includes(p)) destinations.push(p)
  }

  if (destinations.length === 0) return patchText

  const syntheticMarkers = destinations.map(p => `*** Update File: ${p}`).join('\n')
  return `${patchText}\n${syntheticMarkers}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Pulls the file path(s) a tool call touched from its args: `filePath` for edit/write, deduplicated patch marker lines for `apply_patch`. Returns `[]` for missing/malformed args. */
export function extractTouchedPaths(tool: string, args: unknown): string[] {
  if (!isRecord(args)) return []

  if (tool === 'apply_patch' || MUTATING_SUFFIX_RE.exec(tool)?.[1] === 'apply_patch') {
    const patchText = args.patchText
    if (typeof patchText === 'string' && patchText) return parseApplyPatchPaths(patchText)
    return []
  }

  const filePath = args.filePath
  if (typeof filePath === 'string' && filePath) return [filePath]
  return []
}

/** Strips an MCP namespace prefix (`aft_edit`→`edit`) so `tool_name` matches the bare form hook.mjs's `resolveTargetFiles` special-cases (`tool_name === 'apply_patch'` exactly). Passes bare names and non-mutating names through unchanged. */
export function bareToolName(tool: string): string {
  const match = MUTATING_SUFFIX_RE.exec(tool)
  return match?.[1] ?? tool
}

export interface BuildHookPayloadInput {
  tool: string
  args: unknown
  cwd: string
  sessionID: string
}

/**
 * Shapes the stdin JSON `hook.mjs` reads. `tool_name` is normalized to its
 * bare form. For `apply_patch` (bare or MCP-suffixed), `tool_input.command`
 * carries the raw patch text so hook.mjs's own `parseApplyPatchPaths` can
 * extract every touched file — hook.mjs only reads `tool_input.command` when
 * `tool_name === 'apply_patch'` exactly, so a `file_path`-only payload would
 * silently drop all but incidental files. For edit/write, `tool_input.file_path`
 * carries the first touched path. `session_id` preserves the OpenCode session
 * ID from the invoking tool-call context unchanged.
 */
export function buildHookPayload(input: BuildHookPayloadInput): {
  tool_name: string
  tool_input: {file_path: string} | {command: string}
  cwd: string
  session_id: string
} {
  const bareName = bareToolName(input.tool)

  let toolInput: {file_path: string} | {command: string}
  if (bareName === 'apply_patch') {
    const args = isRecord(input.args) ? input.args : {}
    const patchText = typeof args.patchText === 'string' ? args.patchText : ''
    toolInput = {command: withMoveToScanMarkers(patchText)}
  } else {
    const [firstPath] = extractTouchedPaths(input.tool, input.args)
    toolInput = {file_path: firstPath ?? ''}
  }

  return {
    tool_name: bareName,
    tool_input: toolInput,
    cwd: input.cwd,
    session_id: input.sessionID,
  }
}

export interface DetectorRunResult {
  stdout: string
  stderr: string
  exitCode: number
}

/** Injectable subprocess runner: given the hook payload and the worktree cwd, returns the detector's stdout/stderr/exitCode. `createSpawnRunner` below is the production implementation; tests inject fakes. */
export type DetectorRunner = (
  payload: ReturnType<typeof buildHookPayload>,
  opts: {worktree: string},
) => Promise<DetectorRunResult>

export interface CreateHookOptions {
  runDetector: DetectorRunner
  worktree: string
}

export interface CreateSpawnRunnerOptions {
  /** Absolute path to `hook.mjs` (or an ephemeral test fixture). */
  scriptPath: string
  /** Hard subprocess timeout. Defaults to `DETECTOR_TIMEOUT_MS`. */
  timeoutMs?: number
  /** Grace period between SIGTERM and SIGKILL on timeout. */
  killGraceMs?: number
  /** Bounded stdout/stderr capture size; overflow surfaces as a nonzero-exit anomaly. */
  maxOutputBytes?: number
  /** Node executable to spawn. Defaults to literal `node` (repo requires Node 24+); override only for tests. */
  nodeExecutable?: string
}

const DEFAULT_KILL_GRACE_MS = 2000
const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024
const DEFAULT_NODE_EXECUTABLE = 'node'

/**
 * Real `node:child_process.spawn` runner: `node <scriptPath>` (no shell,
 * literal `node` executable — not `process.execPath`, which under a Bun
 * host would spawn Bun instead of Node) with the payload piped over stdin,
 * cwd at the worktree. Sets harness=claude and quiet=1; strips inherited
 * depth env vars (hook.mjs manages depth for its own children — the bridge
 * is not a re-entrant tool call).
 *
 * Sole authority over the subprocess's timeout: SIGTERM, bounded grace
 * period, SIGKILL if still alive, resolves only on `close` (child confirmed
 * exited/reaped). Callers must not layer a second timeout on top of this.
 */
export function createSpawnRunner(options: CreateSpawnRunnerOptions): DetectorRunner {
  const timeoutMs = options.timeoutMs ?? DETECTOR_TIMEOUT_MS
  const killGraceMs = options.killGraceMs ?? DEFAULT_KILL_GRACE_MS
  const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES
  const nodeExecutable = options.nodeExecutable ?? DEFAULT_NODE_EXECUTABLE

  return (payload, opts) =>
    new Promise<DetectorRunResult>(resolve => {
      const env: NodeJS.ProcessEnv = {...process.env}
      delete env.IMPECCABLE_HOOK_DEPTH
      delete env.CLAUDE_HOOK_DEPTH
      env.IMPECCABLE_HOOK_HARNESS = IMPECCABLE_HOOK_HARNESS
      env.IMPECCABLE_HOOK_QUIET = '1'

      const child = spawn(nodeExecutable, [options.scriptPath], {
        cwd: opts.worktree,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      const stdoutChunks: Buffer[] = []
      const stderrChunks: Buffer[] = []
      let stdoutBytes = 0
      let stderrBytes = 0
      let overflowed = false
      let timedOut = false
      let settled = false
      let hardTimer: ReturnType<typeof setTimeout> | undefined
      let killTimer: ReturnType<typeof setTimeout> | undefined

      const cleanup = () => {
        if (hardTimer) clearTimeout(hardTimer)
        if (killTimer) clearTimeout(killTimer)
        child.stdout?.removeAllListeners()
        child.stderr?.removeAllListeners()
        child.removeAllListeners()
      }

      // Uses StringDecoder rather than Buffer#toString so a bounded slice
      // that lands mid-multibyte-character omits the trailing incomplete
      // bytes instead of re-expanding them into a U+FFFD replacement
      // character, which would push the decoded string back over the
      // configured maxOutputBytes cap. Deliberately never calls
      // decoder.end() — that flushes any still-pending incomplete
      // trailing bytes as a replacement character, which is exactly the
      // over-cap expansion this must avoid.
      const decode = (chunks: Buffer[]): string => {
        const decoder = new StringDecoder('utf-8')
        return chunks.map(chunk => decoder.write(chunk)).join('')
      }

      const finish = (exitCode: number) => {
        if (settled) return
        settled = true
        cleanup()
        // A child that exits via a handled SIGTERM after the hard timer
        // already fired must never read as quiet-clean — it ran past its
        // advisory budget, so its exit code is not trustworthy.
        resolve({stdout: decode(stdoutChunks), stderr: decode(stderrChunks), exitCode: timedOut ? -1 : exitCode})
      }

      child.on('error', () => {
        // Spawn failure (e.g. missing interpreter/binary): treat as a
        // nonzero-exit anomaly rather than hanging or throwing.
        finish(-1)
      })

      const appendBounded = (chunks: Buffer[], currentBytes: number, chunk: Buffer): number => {
        if (currentBytes >= maxOutputBytes) {
          overflowed = true
          return currentBytes
        }
        const remaining = maxOutputBytes - currentBytes
        if (chunk.length > remaining) {
          overflowed = true
          chunks.push(chunk.subarray(0, remaining))
          return maxOutputBytes
        }
        chunks.push(chunk)
        return currentBytes + chunk.length
      }

      child.stdout?.on('data', (chunk: Buffer) => {
        stdoutBytes = appendBounded(stdoutChunks, stdoutBytes, chunk)
      })
      child.stderr?.on('data', (chunk: Buffer) => {
        stderrBytes = appendBounded(stderrChunks, stderrBytes, chunk)
      })

      child.on('close', (code: number | null) => {
        finish(overflowed ? -1 : (code ?? -1))
      })

      hardTimer = setTimeout(() => {
        if (settled) return
        timedOut = true
        try {
          child.stdin?.end()
          child.kill('SIGTERM')
        } catch {
          // Process may have already exited between the timer firing and here.
        }
        killTimer = setTimeout(() => {
          if (settled) return
          try {
            child.kill('SIGKILL')
          } catch {
            // Already gone.
          }
        }, killGraceMs)
      }, timeoutMs)

      // A child that exits without reading stdin (e.g. a test fixture, or
      // hook.mjs after an early error) can trigger EPIPE on write — this is
      // not a spawn failure and must not crash the process.
      child.stdin?.on('error', () => {})

      try {
        child.stdin?.end(JSON.stringify(payload))
      } catch {
        // If stdin write fails the child's own error/close handlers resolve this promise.
      }
    })
}

const FEEDBACK_OPEN = '\n\n<impeccable_feedback>\n'
const FEEDBACK_CLOSE = '\n</impeccable_feedback>'

/**
 * Strictly extracts the human-readable feedback text from hook.mjs's stdout.
 * Accepts ONLY the nested Claude-harness `PostToolUse` envelope shape:
 * `{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"…"}}`
 * with a non-empty string `additionalContext`.
 *
 * Every other shape is a parse failure, not a successful parse: wrong event
 * name, missing nested envelope, empty/non-string `additionalContext`, a
 * top-level or foreign-harness shape (`additionalContext`/`additional_context`
 * outside `hookSpecificOutput`), non-JSON text, and empty/whitespace input all
 * return `null` so raw/malformed content never reaches model-visible output.
 */
export function extractFeedbackText(stdout: string): string | null {
  const trimmed = stdout.trim()
  if (!trimmed) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return null
  }

  if (!isRecord(parsed)) return null

  const hookSpecificOutput = parsed.hookSpecificOutput
  if (!isRecord(hookSpecificOutput)) return null
  if (hookSpecificOutput.hookEventName !== 'PostToolUse') return null

  const additionalContext = hookSpecificOutput.additionalContext
  if (typeof additionalContext !== 'string' || !additionalContext) return null

  return additionalContext
}

/**
 * Builds the `tool.execute.after` handler, with the subprocess runner
 * injected so all logic here is testable under Node.
 *
 * The runner (`DetectorRunner`) is the sole authority for its own timeout —
 * this function never races it with its own timer. A promise that never
 * settles hangs the tool call, by design: `createSpawnRunner`'s termination
 * lifecycle (SIGTERM → grace → SIGKILL → close/reap) always settles within
 * its bounded deadline, so a real runner never leaves this awaiting forever.
 * A test double that never resolves is a runner bug, not something this
 * layer should paper over with a second, racing timeout.
 *
 * Resolves the five R9 outcomes:
 *  (a) unextractable input — recognized mutating tool, no extractable path: runner never invoked and a warning is emitted.
 *  (b) quiet-clean — valid payload sent, exit 0, empty stdout, empty stderr: no output.
 *  (c) stderr-with-empty-stdout — exit 0 but non-empty stderr: anomaly, warn-once,
 *      stderr content never surfaced verbatim.
 *  (d) runner rejection (timeout/spawn failure signaled by the runner), non-zero exit,
 *      or malformed non-empty stdout: anomaly, warn-once.
 *  (e) bounded-capture overflow — a runner concern that surfaces here as an anomaly via (c)/(d).
 * The first anomaly of any kind in a given hook instance (= plugin process/startup)
 * produces a compact visible warning; subsequent anomalies in the same instance stay silent.
 */
export function createHook(options: CreateHookOptions) {
  let hasWarned = false

  return async function toolExecuteAfter(
    input: {tool: string; sessionID: string; callID: string; args: unknown},
    output: {title: string; output: string; metadata: unknown},
  ): Promise<void> {
    // Fail-loud: appends a one-time (per hook instance) non-blocking warning to
    // the tool's model-visible output. Never throws.
    const warnOnce = (message: string) => {
      if (hasWarned) return
      hasWarned = true
      try {
        output.output += `${FEEDBACK_OPEN}${message}${FEEDBACK_CLOSE}`
      } catch {
        // Fail-loud must never itself throw.
      }
    }

    try {
      if (!isMutatingTool(input.tool)) return

      const touchedPaths = extractTouchedPaths(input.tool, input.args)
      if (touchedPaths.length === 0) {
        warnOnce('[impeccable] design hook skipped recognized mutating tool with no extractable path')
        return
      }

      const payload = buildHookPayload({
        tool: input.tool,
        args: input.args,
        cwd: options.worktree,
        sessionID: input.sessionID,
      })

      let result: DetectorRunResult
      try {
        result = await options.runDetector(payload, {worktree: options.worktree})
      } catch (err) {
        // Covers timeout, spawn failure, or any other runner-signaled
        // anomaly the runner chose to reject with.
        warnOnce(`[impeccable] design hook bridge failed: ${err instanceof Error ? err.message : String(err)}`)
        return
      }

      if (result.exitCode !== 0) {
        warnOnce(`[impeccable] design hook did not run cleanly: exit ${result.exitCode}`)
        return
      }

      const stdout = result.stdout ?? ''
      const stderr = result.stderr ?? ''
      const trimmedStdout = stdout.trim()

      if (!trimmedStdout) {
        if (stderr.trim()) {
          // (c) exit 0, empty stdout, non-empty stderr: anomaly, not quiet-clean.
          // stderr is diagnostic-only and never surfaced verbatim.
          warnOnce('[impeccable] design hook produced unexpected diagnostic output')
        }
        return // (b) quiet-clean success — no visible output.
      }

      const feedback = extractFeedbackText(stdout)
      if (feedback === null) {
        // (d) non-empty malformed/unrecognized stdout is an anomaly.
        warnOnce('[impeccable] design hook returned unrecognized output')
        return
      }

      output.output += `${FEEDBACK_OPEN}${feedback}${FEEDBACK_CLOSE}`
    } catch (err) {
      warnOnce(`[impeccable] design hook bridge error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}
