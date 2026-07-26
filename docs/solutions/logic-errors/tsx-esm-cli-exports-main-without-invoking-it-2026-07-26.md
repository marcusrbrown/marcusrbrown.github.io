---
title: ESM CLI exports main() but never invokes it — runs clean, does nothing
date: 2026-07-26
category: logic-errors
module: live-audit finalizer CLI
problem_type: logic_error
component: tooling
symptoms:
  - "tsx script exits 0 but produces no output file"
  - "Downstream jq validation fails on a missing result file, not the script itself"
  - "Workflow step that consumes the missing artifact is skipped, surfacing only a generic error"
root_cause: logic_error
resolution_type: code_fix
severity: high
tags:
  - tsx
  - esm
  - cli
  - entrypoint
  - github-actions
  - silent-failure
---

# ESM CLI exports main() but never invokes it — runs clean, does nothing

## Problem

A CLI script (`scripts/live-audit/finalize-discovery.ts`) defined a complete `async function main()` — reading inputs, producing outputs — but the module had no top-level invocation of it. Running `tsx scripts/live-audit/finalize-discovery.ts <args>` defined the function and exited 0 without ever executing it, so no output file was written.

## Symptoms

- The `tsx` script exits 0 but produces no `finalization-result.json`.
- A later `jq` validation step fails on the missing file — pointing blame at the wrong step.
- The artifact-upload step is skipped because its input never appeared; the workflow surfaces only a generic exit code, not the real cause.
- Discovery logs show the earlier phase ran and validated its inputs — the gap is silent.

## What Didn't Work

- Reading the finalizer source top-to-bottom: `main()` looked complete and correct in isolation — the defect is the *absence* of a call, which is easy to miss.
- Blaming the `jq`/validation step: it fails truthfully on a missing file, but it is a downstream victim, not the cause.
- Assuming a non-zero exit would surface the problem: the process exits 0 because defining a function and reaching end-of-module is success.

## Solution

Add an ESM-correct direct-execution guard (the `require.main === module` equivalent) so the entry runs when invoked as a script, and keep `main` exported for tests:

```ts
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'

export const main = async (): Promise<void> => {
  await runFinalizeDiscovery({args: process.argv.slice(2)})
}

// Run only when executed directly (tsx/node entry), not when imported.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main()
```

This was landed test-first: a CLI regression test invokes the script through `tsx` with real args and asserts the output file exists. It failed (exit 0, no output) before the guard and passed after.

## Why This Works

In ESM there is no implicit entrypoint. Exporting `main` makes it importable but does not run it. The guard compares `import.meta.url` against the resolved `process.argv[1]` (the invoked file), so the module executes `main()` when run directly and stays side-effect-free when imported — the correct ESM analogue of CommonJS `require.main === module`.

## Prevention

- Every runnable ESM CLI needs an explicit direct-execution guard; exporting `main` is not enough.
- Add a CLI regression test that runs the script as a subprocess (through the real runner, e.g. `tsx`) and asserts its observable side effect — a written file, stdout, or exit behavior — not just that the function exists.
- Make consuming workflow steps fail loudly on a missing expected artifact (`if-no-files-found: error`) so a silent no-op surfaces at the producing step, not three steps later.
- Watch for the "exits 0 but produced nothing" signature — it usually means an entrypoint was defined but never called.

## Related Issues

- PR #221 — the fix documented here (also added lazy browser init so the CLI regression need not launch Chromium).
