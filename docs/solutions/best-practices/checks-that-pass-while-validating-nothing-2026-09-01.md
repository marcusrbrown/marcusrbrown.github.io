---
title: Checks that pass while validating nothing
date: 2026-09-01
category: best-practices
module: CI quality gates and test reporting
problem_type: best_practice
component: development_workflow
severity: high
applies_when:
  - "Adding or reviewing CI gates, test dashboards, performance metrics, coverage commands, or published quality badges"
  - "A check can pass without producing or consuming the evidence it claims to validate"
  - "Local and CI results differ for the same commit and command"
tags:
  - silent-failure
  - github-actions
  - playwright
  - lighthouse-ci
  - coverage
  - test-reporting
  - performance
  - validation
---

# Checks that pass while validating nothing

## Context

The performance, coverage, test-reporting, and cleanup work around issues #300–#326 exposed one recurring defect class: a check reported success even though its precondition, input, measurement, comparison, or failure path was absent. The defect appeared in eleven cases across the same body of work, including configuration that never loaded, tests that never ran, reports that were never read, baselines that were never restored, and public badges that claimed values derived from directory existence alone.

The common failure is not merely a bad assertion. It is a broken evidence chain:

```text
intended check
  -> executable step
  -> correct input and scope
  -> non-empty parsed evidence
  -> meaningful measurement
  -> comparison against a reachable gate
  -> non-zero failure propagation
  -> report whose status matches the evidence
```

Any missing link can leave a green check that validates nothing.

## Guidance

### Treat absence as a first-class result

Missing data is not the same as zero failures. A validator that finds no reports, a dashboard with no test artifacts, or a regression check without a baseline must return an explicit non-green state such as `not-run`, `incomplete`, `unknown`, or `error`. It must not fall through to `passed`, `excellent`, or a compliance claim.

This distinction now appears in the repository's reporting code:

```js
if (hasFailures) return "failed"
if (hasMissingData) return "incomplete"
return "passed"
```

`test-dashboard.mjs` uses this ordering in `determineOverallStatus`. `performance-dashboard.ts` records collection failures before generating its summary instead of starting from an unconditional successful status. `generate-test-badges.mjs` returns `not run`, `not tested`, `unknown`, or `error` when the corresponding evidence is absent or invalid.

### Remove suppression before diagnosing the check

`continue-on-error` hides absence as effectively as it hides failure. Issues #300–#303 surfaced only after suppressed performance steps were made observable: the Lighthouse config was not being loaded, the referenced Playwright projects did not exist, and the theme-switching suite had nine genuine failures. A suppressed step is indistinguishable from a step that did nothing unless its artifacts and exit status are checked independently.

Use suppression only for a deliberately non-blocking diagnostic or notification path, and make that policy visible in the step name and summary. Do not use it to make an unverified gate appear stable.

### Prove a gate by making the measured value trip it

A threshold is not proven because the assertion code exists or because a threshold below the normal range produces a failure. That proves only that the assertion mechanism can fail. The meaningful test is to inject a controlled degradation and raise the measured value until the shipped threshold trips.

The first threshold implementation in PR #332 used a 100ms modal-open limit against a 12.40ms observed maximum. That could not catch the intended regression. The final limits were 20ms for modal open and 1ms for synthetic interaction delay; controlled 47ms and 3.10ms measurements failed against those shipped limits. The test in `tests/performance/theme-switching.spec.ts` now keeps the gate on the metric and threshold together.

### Challenge the metric's semantics before tuning its threshold

Near-zero variance is often evidence that a metric is measuring a constant. Smooth-scroll duration varied only 0.20ms across eight mobile runs because it primarily reflected the browser's fixed animation duration. It was retained as an observation, not promoted to a gate.

Implausible cross-environment divergence is another measurement warning. The scroll frame-drop result in #326 was about 30 times better on mobile than desktop, even though mobile emulation was the constrained profile. The test was counting gaps between coalesced scroll events, not animation frames. The current test names and logs the workload as smooth-scroll duration instead of presenting event timing as dropped frames.

Also install observers before the event they measure. The LCP observer in `tests/performance/theme-switching.spec.ts` is installed with `addInitScript` before `page.goto()` and uses buffered delivery; attaching it after navigation would miss the page's actual largest paint.

### Verify the tool's success and failure artifacts

Absence of failure artifacts is not evidence that a suite did not run. Playwright writes `*-actual.png` and `*-diff.png` on visual failure, while a passing visual run writes stable baseline screenshots. The first version of the dashboard therefore classified a fully passing visual suite as `not-run`. `test-dashboard.mjs` now consumes the Playwright JSON report and treats screenshots as baselines, not execution evidence.

The artifact path is part of the contract too. PR #327 initially had the parser looking only at repository-root reports while the workflow downloaded reports below `test-artifacts/`. It also initially merged visual and accessibility artifacts even though both contained `test-results/results.json`, allowing one suite to overwrite the other before parsing. Keep each suite in an isolated destination and test the actual downloaded layout.

### Make scope and argument delivery observable

The same command can validate different things in different environments. Vitest 4 matches `coverage.include` against absolute paths with `contains: true`; the relative `src/**/*.{ts,tsx}` pattern therefore included unrelated files when the checkout path itself contained `/src/`. The anchored `path.resolve(process.cwd(), 'src/**/*.{ts,tsx}')` in `vite.config.ts` makes local and CI scope agree.

Arguments passed through package-manager scripts need the same treatment. #270 correctly identified `pnpm run test -- --coverage` as a silent argument-loss path. The repository's `package.json` now uses `pnpm run test --coverage`, and PR #327 verified delivery empirically by adding a file filter and confirming the measured file count dropped to one. A flag's appearance in a script is not proof that the underlying runner received it.

The boundary is wider than `package.json`. #338 found the same broken invocation inside an agent prompt in `.github/workflows/fro-bot.yaml`, where it had survived because the agent sometimes noticed and re-ran the correct form — model behaviour, not a guarantee. Anywhere a command is written as text and executed elsewhere is a place this defect can hide.

### Fail closed at every boundary

Useful boundary checks include:

- Load the configuration through the same mechanism as the tool. `lighthouserc.cjs` exports a top-level `ci` key, and `.github/workflows/performance.yaml` verifies that key before invoking LHCI.
- Resolve report paths from the workflow's device-specific environment. `performance-budgets.ts` uses `resolveLighthouseReportsPath`, rejects an empty report set, and filters out `manifest.json` rather than treating metadata as a Lighthouse result.
- Restore a real baseline before comparing. #317 found that `loadBaselineMetrics()` always returned `null` on clean runners, so the script saved a temporary baseline and returned without comparing anything. Missing-baseline policy may be an explicit skip, but it must be visible and distinct from a successful comparison.
- Fail when persistence fails. A baseline that was not saved cannot support the next run; warning and continuing converts a future missing comparison into a false success.
- Verify entrypoints and reachability. #321 removed a 2,602-line theme-authoring surface that had never been imported or rendered; its selector-based tests were also testing nothing. A complete implementation with no entry point is still a no-op.
- Parse evidence before publishing claims. #322 found hardcoded Lighthouse and bundle values, directory-existence-based E2E status, and an `AA compliant` fallback with no axe report. Public output must be derived from validated contents, never from a directory existing.

## Why This Matters

Green output is an assertion about reality, not a reward for reaching the end of a script. When a missing input becomes a passing value, the system loses the ability to distinguish "healthy" from "not executed." That is more dangerous than an ordinary failing test: a failure invites investigation, while a fabricated pass is copied into dashboards, README badges, review comments, and release decisions.

The recursive failures in PR #327 are especially important. The PR removed fabricated badges, then discovered that its own first implementation looked in the wrong artifact root, assigned report-wide Playwright statistics to individual suites, treated failure-only screenshots as proof of execution, and allowed two downloaded reports to overwrite one another. PR #332 found the same pattern in threshold validation: a gate was initially made impossible to trip and was "proved" by lowering the threshold below the observed floor. Fixes need the same evidence audit as the defects they remove.

That pattern held across a later audit of `scripts/`, `src/utils/`, `src/schemas/`, and test setup: every PR in the batch was caught in review reproducing its own defect one layer down. [Fixing a check that validates nothing](./fixing-a-check-that-validates-nothing-2026-09-02.md) covers the remediation mechanics — auditing a whole rule set rather than the reported instance, proving a gate can fail, and making a noisy gate observational without making it silent.

## When to Apply

- When adding a CI step, first prove that the step runs and that its named inputs exist.
- When a validator returns success, confirm that it parsed at least one expected record and that the record contained the fields being checked.
- When a metric changes across browsers, devices, or checkout paths, investigate the measurement and matching semantics before interpreting the difference as product behavior.
- When publishing a badge or dashboard status, test missing, malformed, empty, passing, failing, and mixed-suite fixtures.
- When calibrating a threshold, use a controlled regression to demonstrate that the shipped value can fail for the defect it is meant to catch.
- When local and CI disagree on the same commit and command, treat the divergence as a bug in scope, inputs, environment, or argument delivery until explained.

## Examples

### A validator must reject an empty input set

```ts
const reports = await readLighthouseReports(resolveLighthouseReportsPath())

if (reports.length === 0) {
  addViolation("Lighthouse validation", "No Lighthouse reports found", "none", "at least one report")
  return
}
```

The old behavior read `./lhci-reports` while the workflow wrote `lhci-reports-<device>` (#302), then exited zero when it found nothing. The current behavior makes the path device-aware and turns an empty set into a violation.

### A dashboard must distinguish no data from a pass

```js
const hasMissingData = suiteStatuses.some(status => status === "not-run" || status === "not-available")

if (hasFailures) return "failed"
if (hasMissingData) return "incomplete"
return "passed"
```

The old `hasFailures ? 'failed' : 'passed'` expression made a run with zero artifacts report `passed`. The explicit `incomplete` state preserves the difference between "no failures observed" and "the suites completed successfully."

### A gate needs a reachable fault injection

```ts
expect(
  modalOpenTime,
  `Modal open performance regression: ${modalOpenTime.toFixed(2)}ms exceeded ${thresholds.modalOpen.toFixed(2)}ms`,
).toBeLessThan(thresholds.modalOpen)
```

The assertion is only half the verification. The test fixture or implementation must also be made deliberately slower, and the run must fail against the threshold that will ship. Lowering the threshold beneath normal measurements is a mechanism test, not evidence that the gate catches a real regression.

### A public badge needs an evidence state machine

```text
missing input       -> not run / not tested
malformed input     -> error
valid zero-test run -> not run
valid passing run   -> passing
valid failing run   -> failing
```

This is the contract now reflected by `generate-test-badges.mjs`: `readJsonFile` preserves missing versus invalid data, Playwright status is computed from suite-specific test attempts, and Lighthouse/bundle badges are built from parsed reports rather than hardcoded values.

## Related

- [ESM CLI exports `main()` but never invokes it](../logic-errors/tsx-esm-cli-exports-main-without-invoking-it-2026-07-26.md) — a directly analogous no-op that exits successfully.
- [Gist list API omits content, producing an empty snapshot](../integration-issues/gist-list-api-omits-content-snapshot-empty-2026-07-18.md) — fail-safe handling for missing or incomplete upstream evidence.
- #300–#303 — Lighthouse configuration, Playwright project selection, budget-validator input paths, and hidden theme-switching failures.
- #317 — regression detection without a restored baseline.
- #320 — path-dependent coverage scope; the fix is anchored in `vite.config.ts`.
- #321 — an unmounted theme-authoring surface and selector tests with no reachable target.
- #322 — fabricated public badges; PR #327 records the recursive reporting fixes and their verification.
- #323 — dashboards treating missing data and collection failures as success.
- #326 — observational performance metrics whose labels did not match what they measured.
- #270 — coverage flag lost through the package-manager script boundary. #309 is adjacent but distinct: its verified issue is concurrent pre-push checks making timing-sensitive tests flaky, not coverage argument loss. #348 later established that the pre-push fix was only half of it — the suites themselves paid package-manager startup cost on every subprocess spawn, which is what pushed fixed timeouts over the edge under load.
- [A guardrail that allowed every command it existed to block](../security/copilot-guardrail-contract-drift-2026-09-02.md) — the security-layer instance of this defect class, where the root cause was contract drift rather than absent evidence.
- PR #332 — evidence-based performance gates and fault-injection verification.
