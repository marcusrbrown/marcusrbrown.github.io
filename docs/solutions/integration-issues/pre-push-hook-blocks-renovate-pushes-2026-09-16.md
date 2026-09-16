---
title: A developer git hook ran inside bot automation and blocked Renovate for two months
date: 2026-09-16
category: integration-issues
module: Renovate dependency automation
problem_type: integration_issue
component: development_workflow
severity: high
symptoms:
  - "Renovate created 83 PRs historically, then none between 2026-07-19 and 2026-09-14"
  - "Scheduled Renovate runs ended `cancelled` after exactly 30 minutes"
  - "`[pre-push] test: test exited with code 1` followed by `error: failed to push some refs` in Renovate's own logs"
  - "`Branch renovate/all-minor-patch creation is disabled because dependencyDashboardApproval=true`"
root_cause: config_error
resolution_type: code_fix
related_components:
  - ".github/git-hooks/pre-push.ts"
  - ".github/renovate.json5"
  - ".github/workflows/renovate.yaml"
tags:
  - renovate
  - git-hooks
  - github-actions
  - local-vs-ci
  - dependency-automation
---

# A developer git hook ran inside bot automation and blocked Renovate for two months

## Problem

Renovate built update branches correctly and then threw them away on every run, because the repository's own `pre-push` hook was executing inside Renovate's container and failing.

Two smaller configuration faults compounded it: the repo overrode its own preset's package grouping, and the workflow had no periodic trigger.

## Symptoms

Renovate created 83 PRs historically and then none between 2026-07-19 and 2026-09-14. Every scheduled run ended `cancelled` after exactly 30 minutes — a timeout, not contention.

From run `35044703631`:

```
. prepare: [INFO] Successfully set the pre-push with command: node .github/git-hooks/pre-push.ts
DEBUG: Platform-native commit: unknown error
  "commands": ["push","--force","origin","refs/renovate/branches/renovate/bfra.me-prettier-config-0.x",...]
FAIL .opencode/impeccable/hook-bridge.integration.test.ts  Error: Test timed out in 5000ms.
node:events:505  throw er; // Unhandled 'error' event
Error: connect ECONNREFUSED 127.0.0.1:3000
[pre-push] test: test exited with code 1
error: failed to push some refs
```

The block was frequent but not absolute — a vulnerability-alert branch did land on 2026-09-14 (#381) — which is consistent with the blocking failures being timing-sensitive tests rather than a deterministic stop.

## Root Cause

`postUpgradeTasks` runs an install inside Renovate's clone (`.github/renovate.json5`):

```json5
postUpgradeTasks: {
  commands: ['pnpm install', 'pnpm run build', 'pnpm run fix', 'pnpm run fix'],
  executionMode: 'branch',
}
```

`pnpm install` fires `prepare` (`package.json`), which is `simple-git-hooks`, which installs `.git/hooks/pre-push` — **into Renovate's clone at `/tmp/renovate/repos/github/…`**, not the developer's. Renovate's subsequent `git push --force origin refs/renovate/branches/<branch>` then ran the repo's full test suite as a push gate.

Two suites failed there: `.opencode/impeccable/hook-bridge.integration.test.ts` subprocess-lifecycle tests on 5s/15s budgets (#348 — closed against isolation measurements that a container does not reproduce), and an unhandled `ECONNREFUSED` throw from `tests/utils/analytics.test.ts` (#383). Renovate retried across ~23 branches and hit its job timeout.

The causal date is exact. `hook-bridge.integration.test.ts` arrived in PR #208 on 2026-07-19 — the same day Renovate's last ordinary PR landed.

**`pnpm install` inside a clone is not "just install."** Any tool that runs a package-manager install inside a repository checkout inherits that repo's lifecycle scripts, and `prepare` is where hook installers live.

### Secondary: the repo overrode its own preset

`.github/renovate.json5` extended `github>marcusrbrown/renovate-config#5.2.7` and then re-added `'group:allNonMajor'`. The preset already extends it, then appends:

```json5
{
  description: "Ungroup unstable (v0.x[.x]) packages so they are not grouped by presets such as `group:allNonMajor`.",
  matchCurrentVersion: "/^0\\./",
  groupName: null
}
```

`packageRules` precedence is last-match-wins per field, and later `extends` entries resolve after — so the re-add landed after the carve-out and re-grouped the 0.x packages. A transitive preset requires `dependencyDashboardApproval` for minor 0.x updates, and Renovate applies approval to the resulting **branch**, so one gated member held ~33 packages behind a single checkbox.

### Secondary: callers do not inherit reusable-workflow triggers

The upstream reusable workflow defines `cron: '0 * * * *'`, but a caller workflow does not inherit event triggers from it. The only full-scan path was `workflow_run` on Deploy completion, so a quiet `main` meant no scanning — a 12-day blind spot, observed directly.

## Solution

The hook exits before spawning anything when it is running in automation (`.github/git-hooks/pre-push.ts`):

```ts
const isRunningInCi = process.env.CI !== undefined || process.env.GITHUB_ACTIONS !== undefined

if (isRunningInCi) {
  console.log(
    '\n[pre-push] skipping checks: running in CI (CI or GITHUB_ACTIONS is set) — CI enforces the same checks as required status checks',
  )
  process.exit(0)
}
```

`CI` is the primary signal — Renovate's container receives it via `docker run --env CI`. `GITHUB_ACTIONS` is a second cheap check. Neither is set on a developer machine, so the hook is unchanged for its actual audience.

**The skip is loud** — it states what it skipped and why that is safe.

Plus: the redundant `'group:allNonMajor'` removed with a comment recording why it is absent, and `schedule: - cron: '17 * * * *'` added to the caller (hourly, offset off `:00` to avoid GitHub's peak-minute contention).

## Why This Works

`CI`/`GITHUB_ACTIONS` is the right boundary because it separates human pushes from automated clones without coupling the hook to Renovate specifically — the same fix covers any future tool that installs and pushes.

Nothing is lost by skipping: the branch's PR runs the same lint/test/build as required status checks. The hook was always belt-and-braces for local work, never the gate of record.

## Prevention

- **Treat any tool that runs a package-manager install inside a clone as hook-capable.** Assume `prepare` fires and installs hooks unless you have proven otherwise. This applies to Renovate `postUpgradeTasks`, Dependabot-style automation, and any CI step that installs before pushing.
- **A guard that can block a push must declare which environments it runs in.** If it only makes sense for humans, gate it on `CI` explicitly rather than relying on nobody else ever invoking git in a checkout.
- **Keep the bypass visible.** A silent skip converts this outage into one with no signal at all.
- **Test environment-sensitive behaviour with a scrubbed harness.** Default-delete the variables under test, then opt in per case:

  ```ts
  delete env.CI
  delete env.GITHUB_ACTIONS

  Object.assign(env, extraEnv)

  for (const [key, value] of Object.entries(extraEnv)) {
    if (value === undefined) {
      delete env[key]
    }
  }
  ```

  The second pass matters: without it `undefined` cannot mean "remove this variable", so a test could no longer assert the *absence* of a signal.

  Assert the *absence of work*, not just a zero exit:

  ```ts
  expect(result.markers).toEqual([])
  ```

  `markers` are written by stub executables on `PATH`, so an empty array proves nothing spawned. An exit-code-only assertion passes even when the checks ran and happened to succeed.
- **Run the CI-emulated form before pushing.** `CI=true pnpm test` is one command. This fix shipped with a full local suite passing and failed in Actions, because `runHook()` spread `...process.env` and three pre-existing tests silently took the new bypass path. Third instance in this repository after #320 and #363.
- **Do not re-add a preset rule the preset already extends.** Check whether the preset applies it and then deliberately carves exceptions out; re-adding it after silently discards the carve-out.
- **Define schedules on the caller.** Reusable-workflow `on:` triggers do not propagate.

## Verification

Confirmed by outcome, not inference. After the fix, one scan pushed four branches and auto-created #389, #390 and #391; `renovate/all-minor-patch` disappeared from the dashboard's pending-approval list; separate 0.x branches now exist (`renovate/bfra.me-prettier-config-0.x`, `renovate/bfra.me-tsconfig-0.x`, `renovate/eslint-plugin-react-refresh-0.x`). Before: zero branches pushed by ordinary scans for two months.

## Ruled Out

Both were plausible and wrong, which is why they are recorded:

- **`prConcurrentLimit: 5`** — the run logged `Open PR Count: 0`, and `prHourlyLimit: 0` means unlimited.
- **A `postUpgradeTasks` allowlist rejection** — all four commands match the allowlist the pinned reusable workflow injects.

## Related

- [Checks that pass while validating nothing](../best-practices/checks-that-pass-while-validating-nothing-2026-09-01.md) — the local-vs-CI divergence rule
- [Fixing a check that validates nothing](../best-practices/fixing-a-check-that-validates-nothing-2026-09-02.md) — a fix reproducing its own defect one layer down, as this one did in its test harness
- #348 — the subprocess-lifecycle timeouts that failed in the container
- #383 — the unhandled `ECONNREFUSED` that failed alongside them
- PRs #385 and #387
