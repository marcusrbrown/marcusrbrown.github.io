---
title: 'refactor: Gate expensive CI steps on changed paths'
type: refactor
status: active
date: 2026-09-16
origin: docs/brainstorms/2026-09-16-ci-path-filtering-requirements.md
---

# refactor: Gate expensive CI steps on changed paths

## Overview

Classify a pull request's changed files with `dorny/paths-filter`, then gate the expensive **steps** in `ci.yaml`, `e2e-tests.yaml`, and `performance.yaml` on the resulting categories. Jobs keep running and keep reporting a status, so all seventeen required checks still conclude `success` and branch protection is untouched.

## Problem Frame

Every pull request runs the full matrix regardless of what changed. The two Lighthouse audits take roughly four minutes each, and the E2E chain builds before running three suites. A documentation change pays the same as a change to shipped code — PR #393 was docs-only and waited on browser tests and Lighthouse before it could merge.

## Requirements Trace

- R1. `.github/filters.yaml` defines anchored path categories matching this repo's layout (origin R1).
- R2. The filter runs once per workflow in the existing `setup` job for `ci.yaml` and `e2e-tests.yaml`, publishing `contains()`-derived outputs; `performance-audit` runs its own filter step. `pull-requests: read` is added to the top-level `permissions` block of `ci.yaml` and `e2e-tests.yaml`. `performance.yaml` needs no such change: `performance-audit` already declares job-level `pull-requests: write`, and a job-level block replaces rather than merges with the top-level one, so a top-level grant would be dead configuration there (origin R2).
- R3. Gating is applied to steps, never jobs. No job carrying a required status check gains a top-level `if:`, and no workflow uses workflow-level `paths:` (origin R3).
- R4. An unexpected or missing filter value fails the step loudly rather than skipping (origin R4).
- R5. Lint and the dependency audit stay ungated (origin R5).
- R6. Categories cover every shipped and CI-critical input, including the ones the origin document missed (origin R6, extended by flow analysis).
- R7. Gating a build step never leaves a downstream step consuming a missing artifact.

## Scope Boundaries

- Branch protection is unchanged. The seventeen required contexts stay, and no job `name:` is altered.
- No aggregator changes. `quality-gate`, `performance-summary`, and `test-summary` keep their current strict `needs.*.result` handling, because nothing they depend on will skip.
- `deploy.yaml`, `blog-refresh.yaml`, `fro-bot.yaml`, and `renovate.yaml` are out of scope.
- No change to what any test asserts.
- The dependency audit stays ungated. It is roughly 30 seconds and the only mechanism that detects advisories published against unchanged dependencies — `extract-zip` is transitive with no patched release, so Renovate cannot raise a PR for it.

### Deferred to Separate Tasks

- Wiring `actionlint` into CI: research found it is not currently run by any workflow or test, only available locally. Worth doing, but not part of this change.

## Context & Research

### Relevant Code and Patterns

- `.github/workflows/ci.yaml` — jobs `setup` (`Setup and Cache`), `lint`, `test`, `build`, `type-check`, `validate`, `quality-gate`. Top-level `permissions: contents: read`. `setup` already publishes `node-version` and `cache-hit`.
- `.github/workflows/e2e-tests.yaml` — `setup` → `build-for-tests` → three suites → `test-summary` → `notification`. Top-level `permissions` includes `contents`, `actions`, `pages`. `build-for-tests` uploads artifact `build-artifacts-e2e`; three downstream jobs download it.
- `.github/workflows/performance.yaml` — `performance-audit` matrixed over desktop/mobile, then `performance-summary`. No `setup` job.
- `.github/workflows/blog-refresh.yaml` — the repo's only existing classify-then-gate pattern, using `git status --porcelain` on a fixed path set and gating later steps on `steps.diff.outputs.changed`. Different mechanism, publication flow rather than PR filtering, but the same shape.

Precedent from other local repos:

- `bfra-me/renovate-action` — `.github/filters.yaml` anchored categories, `setup` job publishing `contains(steps.filter.outputs.changes, '<name>')` outputs.
- `marcusrbrown/systematic` — step-level gating with an always-running job, plus the fail-loudly gate step this plan adopts for R4.

### Institutional Learnings

- `docs/solutions/best-practices/checks-that-pass-while-validating-nothing-2026-09-01.md` — "`continue-on-error` hides absence as effectively as it hides failure." A suppressed step is indistinguishable from one that did nothing. This plan's suppression must stay observable.
- `docs/solutions/best-practices/fixing-a-check-that-validates-nothing-2026-09-02.md` — "Scope permissiveness to a named case, never a blanket mask." The filter is a named, bounded condition; it must not become a general mask.
- `docs/solutions/integration-issues/pre-push-hook-blocks-renovate-pushes-2026-09-16.md` — local-versus-CI divergence must be reproduced before trusting a local pass. A path filter behaves differently depending on the PR diff and base ref, so local verification alone is insufficient.

## Prior-Art Survey

```json
{
  "schema_version": 2,
  "verdict": "build-new-within-scope",
  "scope": ".github/workflows/, .github/actions/, tests/scripts/",
  "freshness": {
    "vcs_reference": "8baa7197",
    "scope_baseline": "main@8baa7197"
  },
  "budget": {
    "max_search_passes": 3,
    "max_candidate_inspections": 6,
    "exhausted": false
  },
  "candidates": [
    {
      "path_or_symbol": ".github/workflows/blog-refresh.yaml",
      "description": "Classifies a fixed path set with git status --porcelain and gates later publication steps on steps.diff.outputs.changed.",
      "disposition": "insufficient",
      "insufficiency_reason": "Operates on the working tree after a content refresh, not on a pull request diff, and covers three hardcoded paths rather than a category taxonomy."
    },
    {
      "path_or_symbol": ".github/workflows/copilot-setup-steps.yaml",
      "description": "Workflow-level paths: trigger restricting the workflow to edits of itself.",
      "disposition": "insufficient",
      "insufficiency_reason": "Workflow-level path triggers leave required checks pending, which is the failure mode this plan exists to avoid."
    },
    {
      "path_or_symbol": "dorny/paths-filter usage anywhere in this repository",
      "description": "Searched .github/ for dorny/paths-filter and for a step-level gate; neither exists.",
      "disposition": "insufficient",
      "insufficiency_reason": "No existing path-classification mechanism to reuse or extend. The pattern exists only in sibling repositories, which are not importable."
    }
  ]
}
```

## Key Technical Decisions

- **Gate steps, not jobs.** Jobs always run and report a status, so the required contexts always conclude `success`. This also removes the skip-provenance problem: GitHub reports the same `skipped` string whether a job was filtered deliberately or skipped because an upstream job was skipped, so an aggregator tolerating `skipped` could green a PR where nothing ran. Nothing skips, so nothing is ambiguous. Cost is runner spin-up plus `setup` per job against four-minute Lighthouse jobs.
- **Do not use `added|modified:` prefixes on source or test categories.** The precedent uses them, but a deletion or rename then evaluates false — move a component out of `src/` and type-check and unit tests skip while the imports it left behind are broken. Plain path matching for source, tests, and scripts; `added|modified:` only where a deleted file cannot break anything.
- **Grant `pull-requests: read` at workflow level, not job level.** All three workflows already declare top-level `permissions`, and a job-level block replaces rather than merges, so adding one to `setup` would silently drop `contents: read` plus `actions: read` and `pages: read` in `e2e-tests.yaml`.
- **Filter inside `performance-audit` rather than adding a `setup` job to `performance.yaml`.** A new job would sit in front of the matrix-expanded required contexts and add another failure surface before them. The filter re-runs per matrix leg, which is cheap.
- **Bypass gating on every non-`pull_request` event.** `performance.yaml` also triggers on `push` and `schedule`, and all three support `workflow_dispatch`, where no diff exists. The gate resolves to run-everything for those.
- **Fail loudly on an unexpected filter value.** A silent skip on a missing value would recreate the defect class the institutional learnings above exist to eliminate.

## Open Questions

### Resolved During Planning

- Does gating `build-for-tests`'s build step break the downstream suites? Yes — `build-artifacts-e2e` is uploaded once and downloaded by three jobs, so an ungated download crashes on artifact-not-found. Resolved by R7 and Unit 3's OR-union approach.
- Is there existing path-filtering prior art here to extend? No. Verified absent; the pattern exists only in sibling repos.
- Is `actionlint` available as a verification gate? Only locally, not wired into CI. Use it locally and compare against an `origin/main` baseline.

### Deferred to Implementation

- The exact glob list per category: the plan fixes the taxonomy and its rules, but the precise patterns are best settled while editing the files with the real tree in view.
- Whether `tests/scripts/**` belongs in the unit-test category alone or also in build: those tests parse workflow YAML and exercise repo scripts, so the answer depends on what each spec actually imports.

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification.*

```
PR diff ──> dorny/paths-filter (in setup, or in performance-audit)
              │
              ├─ outputs: app / build-config / automation / test-config
              │           unit-tests / e2e / visual / accessibility / performance
              │
              ▼
         gate step  ──> run=true|false, or hard error on an unexpected value
              │
              ▼
   expensive steps carry `if: <gate or event bypass>`
   job itself has NO top-level `if:` ──> always reports a status
```

Category intent, derived from the coverage analysis:

| Category | Covers | Gates |
|---|---|---|
| `app` | `src/**`, `public/**`, `index.html`, `.gitattributes` | build, type-check, unit tests, all browser suites, Lighthouse |
| `build-config` | dependency manifests, `vite.config.ts`, `tsconfig*.json`, `.opencode/tsconfig.json`, `.opencode/package.json`, `.github/actions/setup/**` | same as `app` |
| `automation` | `scripts/**` | same as `app` — scripts orchestrate build and validation |
| `test-config` | `playwright.config.ts`, `lighthouserc.cjs`, `tests/fixtures/**`, `tests/setup.ts` | browser suites and Lighthouse |
| `unit-tests` | `tests/components/**`, `tests/hooks/**`, `tests/utils/**`, `tests/pages/**`, `tests/types/**`, `tests/scripts/**` | unit tests |
| `e2e` / `visual` / `accessibility` / `performance` | the matching `tests/<suite>/**` | that suite only |

`docs/**` and the root markdown files map to no category, which is the point.

## Implementation Units

- [ ] **Unit 1: Add the filter taxonomy**

**Goal:** A single `.github/filters.yaml` defining every category, with no workflow consuming it yet.

**Requirements:** R1, R6

**Dependencies:** None

**Files:**
- Create: `.github/filters.yaml`

**Approach:**
- Use YAML anchors so shared path sets are declared once, following `bfra-me/renovate-action/.github/filters.yaml`.
- Plain path matching for `app`, `automation`, and every `tests/**` category. No `added|modified:` prefix on those.
- Include the inputs the origin document missed: `scripts/**`, `.opencode/tsconfig.json`, `.opencode/package.json`, `.github/actions/setup/**`, each `tests/<suite>/**`, `src/data/*-snapshot.json`, and `public/project-previews/**`.

**Patterns to follow:**
- `bfra-me/renovate-action/.github/filters.yaml` for anchor style and category naming.

**Test scenarios:**
- Happy path: the file parses as YAML and every anchor resolves.
- Edge case: every category name referenced by a later unit exists in this file.

**Verification:**
- The file parses, and a manual read confirms each repo top-level directory maps to at least one category or is deliberately uncovered.

- [ ] **Unit 2: Gate `ci.yaml`**

**Goal:** Type-check, unit tests, and build steps run only when their categories match.

**Requirements:** R2, R3, R4, R5

**Dependencies:** Unit 1

**Files:**
- Modify: `.github/workflows/ci.yaml`

**Approach:**
- Add the filter step plus the fail-loudly gate to the existing `setup` job; publish outputs alongside the existing `node-version` and `cache-hit`.
- Add `pull-requests: read` to the existing top-level `permissions` block.
- Gate `Run tests with coverage`, `Build project`, `Analyze build output`, `Check build output`, and `Run TypeScript compiler`.
- Leave `Run ESLint` and the `validate` job's steps ungated per R5.
- Do not add a top-level `if:` to any job, and do not rename any job.

**Patterns to follow:**
- `marcusrbrown/systematic/.github/workflows/main.yaml` for the gate step and its unexpected-value error.

**Test scenarios:**
- Happy path: parsing `ci.yaml`, the five named steps each carry an `if:` referencing a `setup` output.
- Happy path: the `lint` job's ESLint step and the `validate` job's steps carry no gating `if:`.
- Edge case: no job in the file has a top-level `if:` keyed to a filter output.
- Error path: the gate step's script exits non-zero when the filter value is neither `true` nor `false`.
- Edge case: job `name:` values still match the seven required contexts.

**Verification:**
- `pnpm test tests/scripts/` passes, `actionlint .github/workflows/ci.yaml` reports no new diagnostics against the `origin/main` baseline, and the YAML parses.

- [ ] **Unit 3: Gate `e2e-tests.yaml` with artifact symmetry**

**Goal:** Browser suites skip their work on unrelated PRs without any job crashing on a missing artifact.

**Requirements:** R2, R3, R4, R6, R7

**Dependencies:** Unit 1

**Files:**
- Modify: `.github/workflows/e2e-tests.yaml`

**Approach:**
- Add the filter and gate to the existing `setup` job; publish per-suite outputs (`e2e`, `visual`, `accessibility`) plus the shared ones.
- Gate `build-for-tests`'s build and upload steps on the **OR-union** of the three suite categories, so the artifact exists whenever any suite will consume it.
- In each suite job, gate both the `Download build artifacts` step and the run step on that suite's own category. Both must be gated or neither.
- Add `pull-requests: read` to the existing top-level `permissions`.
- Leave `test-summary` and `notification` ungated — they are reporters, and #327 already made their scripts report `not run` on absent evidence rather than fabricating a pass.

**Patterns to follow:**
- `marcusrbrown/systematic/.github/workflows/main.yaml` for the gate step.

**Test scenarios:**
- Happy path: the build and upload steps in `build-for-tests` carry an `if:` referencing all three suite outputs.
- Integration: for each suite job, the download step and the run step carry the same gating condition — this is the artifact-symmetry invariant, and asserting it prevents the crash described in R7.
- Edge case: `test-summary` and `notification` carry no filter gating.
- Edge case: the artifact name `build-artifacts-e2e` still matches between the single upload and all three downloads.

**Verification:**
- `pnpm test tests/scripts/` passes, `actionlint` reports no new diagnostics, and the YAML parses.

- [ ] **Unit 4: Gate `performance.yaml`**

**Goal:** Lighthouse work skips on unrelated PRs while still running on `push`, `schedule`, and `workflow_dispatch`.

**Requirements:** R2, R3, R4

**Dependencies:** Unit 1

**Files:**
- Modify: `.github/workflows/performance.yaml`

**Approach:**
- Add the filter and gate steps inside `performance-audit`, before its expensive steps. They re-run per matrix leg, which is acceptable and avoids a new job in front of required contexts.
- Gate the build, bundle analysis, LHCI setup/config/verify/run, budget validation, baseline restore, regression check, and theme-switching steps. Also gate `Collect performance artifacts`: the audit lane invokes it without `--allow-empty`, so `validateRequiredArtifacts()` throws once the LHCI run and build are skipped, which would fail every filtered PR.
- The gate must resolve to run-everything for `push`, `schedule`, and `workflow_dispatch`, since `performance.yaml` triggers on all of them and a dispatch has no diff.
- Do not weaken the evidence contract this file already carries: the dashboard step propagates failure and the `jq` metrics step surfaces stderr as a `::warning::` while exiting 0. Leave both intact.

**Patterns to follow:**
- The existing fail-closed shape in `performance.yaml` as of `8baa7197`, and the gate step from `systematic`.

**Test scenarios:**
- Happy path: each expensive step in `performance-audit` carries an `if:` referencing the gate output.
- Edge case: the gate script yields run-everything when the event is `push`, `schedule`, or `workflow_dispatch`.
- Error path: the existing no-mask assertions in `tests/scripts/performance-workflow.test.ts` still pass, proving the evidence contract survived.
- Edge case: `performance-summary` carries no filter gating, and the matrix job names still expand to `Performance Audit (desktop)` and `Performance Audit (mobile)`.

**Verification:**
- `pnpm test tests/scripts/performance-workflow.test.ts` passes including its pre-existing no-mask cases, `actionlint` reports no new diagnostics, and the YAML parses.

- [ ] **Unit 5: Assert the invariants that keep this honest**

**Goal:** A regression test suite that fails if a future edit reintroduces job-level gating, breaks artifact symmetry, or renames a required context.

**Requirements:** R3, R4, R7

**Dependencies:** Units 2, 3, 4

**Files:**
- Create: `tests/scripts/ci-path-filtering.test.ts`
- Modify: `tests/scripts/performance-workflow.test.ts` if a performance-specific assertion fits better there

**Approach:**
- Parse all three workflows with the `yaml` package, matching the existing style in `tests/scripts/performance-workflow.test.ts`.
- Assert the invariants rather than the exact glob list, so the tests do not become a copy of `.github/filters.yaml` that must be updated in lockstep.

**Patterns to follow:**
- `tests/scripts/performance-workflow.test.ts` for YAML parsing and assertion style.
- `tests/scripts/configure-branch-protection.test.ts`, which already pins the seventeen required contexts.

**Test scenarios:**
- Happy path: every category referenced by any workflow `if:` exists in `.github/filters.yaml`.
- Edge case: no job in any of the three workflows has a top-level `if:` referencing a filter output — this is the invariant that keeps required checks from reporting `skipped`.
- Integration: in `e2e-tests.yaml`, each suite's download and run steps share the same gating condition.
- Error path: every gate step includes the unexpected-value branch that exits non-zero.
- Edge case: the job `name:` values across all three workflows still cover the required contexts pinned by `configure-branch-protection.test.ts`.

**Verification:**
- The new tests fail when an invariant is deliberately violated locally, then pass once reverted. `pnpm test` and `CI=true pnpm test` both pass.

## System-Wide Impact

- **Interaction graph:** `setup` gains outputs consumed by later jobs in `ci.yaml` and `e2e-tests.yaml`. `performance-audit` becomes self-contained. `quality-gate`, `performance-summary`, `test-summary`, and `notification` are untouched.
- **Error propagation:** The gate step is the only new failure point and fails closed. A filter step failure makes the gate's value unset, which the unexpected-value branch turns into a hard error rather than a skip.
- **State lifecycle risks:** The `build-artifacts-e2e` upload/download pairing is the one place where gating one step can break another. Unit 3's symmetry rule addresses it and Unit 5 asserts it.
- **API surface parity:** None — no runtime code changes.
- **Integration coverage:** Step-level gating cannot be fully proven by YAML assertions alone. A real docs-only PR and a real source PR are needed to confirm behaviour end to end.
- **Unchanged invariants:** The seventeen required contexts, every job `name:`, all aggregator logic, and the `performance.yaml` evidence contract from #314, #363, and #366.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| A category glob drifts from the repo layout and a change silently skips its validation | Unit 5 asserts referenced categories exist; the taxonomy maps directories rather than individual files so new files inherit coverage |
| A future contributor adds a job-level `if:` and reintroduces `skipped` required checks | Unit 5 asserts no job has a filter-keyed top-level `if:` |
| A rename or deletion evaluates false and skips validation | No `added|modified:` prefixes on source, test, or script categories |
| Local verification passes while CI behaves differently, since the filter depends on the PR diff and base ref | Verify on a real docs-only PR and a real source-touching PR before considering this done; a local YAML assertion is not evidence of runtime gating |
| Gating leaves an expensive step unreachable in a way that looks like success | Unit 5 asserts the gate's fail-closed branch exists; the institutional learnings forbid a silent skip |

## Documentation / Operational Notes

- `.github/ACTIONS.md` and `.github/BRANCH_PROTECTION.md` document the workflow and required-check surface; both should be checked for statements this change contradicts.
- Once landed, cross-link this from `docs/solutions/best-practices/checks-that-pass-while-validating-nothing-2026-09-01.md`, since conditional skipping is adjacent to that defect class and the reasoning for why it is safe here belongs next to it.

## Sources & References

- **Origin document:** `docs/brainstorms/2026-09-16-ci-path-filtering-requirements.md`
- Precedent: `bfra-me/renovate-action` (`.github/filters.yaml`, `.github/workflows/main.yaml`), `marcusrbrown/systematic` (`.github/workflows/main.yaml`), `fro-bot/agent` (`.github/workflows/ci.yaml`) — sibling repos, not tracked here
- Related issues: #393 (the docs-only PR that motivated this), #366, #363, #314 (the `performance.yaml` evidence contract this must not weaken)
- Action pin: `dorny/paths-filter@ceb8a2b8f2d89434be7ff52d3de7ec3738c5cc9d # v4.0.3`
