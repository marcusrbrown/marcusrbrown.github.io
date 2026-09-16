---
date: 2026-09-16
topic: ci-path-filtering
---

# CI path filtering

## Summary

Classify changed files once in each workflow's `setup` job with `dorny/paths-filter`, then gate the expensive **steps** on those outputs. Jobs always run and always report a status, so branch protection is untouched and no aggregator changes. Docs and unrelated config changes stop paying for browser and Lighthouse runs.

---

## Problem Frame

Every PR runs all seventeen required checks regardless of what changed. The two Lighthouse audits take roughly four minutes each, and the E2E chain runs setup and build before three suites. A documentation change pays the same as a change to shipped code. PR #393 was docs-only and waited on browser tests and Lighthouse before merging.

---

## Precedent

Two patterns exist across the other repos. This combines them.

`bfra-me/renovate-action` supplies the filter and output shape — `.github/filters.yaml` with anchored categories:

```yaml
config: &config
  - .github/**
  - '**.md'
  - '**.yaml'
src-changed: &src-changed
  - '**/src/**'
  - '**/package.json'
  - pnpm-lock.yaml
should-check:
  - added|modified: *config
  - added|modified: *src-changed
```

consumed by a `setup` job that publishes `contains()`-derived outputs:

```yaml
outputs:
  src-changed: ${{ contains(steps.filter.outputs.changes, 'src-changed') }}
steps:
  - uses: dorny/paths-filter@ceb8a2b8f2d89434be7ff52d3de7ec3738c5cc9d # v4.0.3
    id: filter
    with:
      filters: .github/filters.yaml
```

`marcusrbrown/systematic` supplies the gating placement. Its comment states the reason directly:

```yaml
# Path gating applies only to pull requests, and only at step level:
# this job has no top-level `if:`, so it always runs to completion and
# reports a status.
```

and its gate step fails loudly rather than silently skipping on an unexpected filter value:

```yaml
- name: Determine whether to run
  id: gate
  run: |
    if [[ "$EVENT_NAME" != "pull_request" ]]; then
      echo "run=true" >> "$GITHUB_OUTPUT"
    elif [[ "$FILTER_RESULT" == "true" ]]; then
      echo "run=true" >> "$GITHUB_OUTPUT"
    elif [[ "$FILTER_RESULT" == "false" ]]; then
      echo "run=false" >> "$GITHUB_OUTPUT"
    else
      echo "::error::paths-filter returned an unexpected value: '$FILTER_RESULT' (expected 'true' or 'false')"
      exit 1
    fi
```

---

## Requirements

- R1. Add `.github/filters.yaml` using the anchored-category style, with categories matching this repo's layout.
- R2. Run the filter once per workflow in the existing `setup` job (`ci.yaml`, `e2e-tests.yaml`) and publish `contains()`-derived outputs. `performance.yaml` has no `setup` job, so `performance-audit` runs its own filter step. Add `pull-requests: read` to each workflow's existing top-level `permissions` block.
- R3. Gate expensive **steps** with `if:`, never jobs. No job carrying a required status check gains a top-level `if:`, and no workflow uses workflow-level `paths:`.
- R4. An unexpected or missing filter value fails the step loudly rather than skipping, following the `systematic` guard.
- R5. Lint and the dependency audit stay ungated.
- R6. Categories cover shipped and CI-critical inputs beyond `src/`: `public/`, `index.html`, `.gitattributes`, `.github/actions/setup/`, the dependency manifests, the build and test configs (`vite.config.ts`, `playwright.config.ts`, `lighthouserc.cjs`, `tsconfig*.json`), and `tests/fixtures/`. The fixtures are not shipped, but `e2e-tests.yaml` feeds `tests/fixtures/blog-snapshot.json` into the browser suites via `BLOG_SNAPSHOT`, so a change there alters what those suites assert.

---

## Acceptance Examples

- AE1. **Covers R3.** Given a PR touching only `docs/`, every required check reports `success`, and the Lighthouse and browser steps are skipped within their jobs.
- AE2. **Covers R4.** Given a filter step that produces no usable value, the job fails with a visible error rather than reporting success.
- AE3. **Covers R6.** Given a PR touching only `tests/fixtures/blog-snapshot.json`, the browser suites run.

---

## Success Criteria

- A docs-only PR concludes with every required check reporting `success`, having skipped the Lighthouse and browser steps.
- A PR touching `src/`, `public/`, `index.html`, a dependency manifest, a build or test config, or `tests/fixtures/` still runs those steps.
- No aggregator job is modified, and no required check ever reports `skipped`.

---

## Scope Boundaries

- Branch protection unchanged; the seventeen required checks stay.
- No aggregator changes. `quality-gate`, `performance-summary`, and `test-summary` keep their current strict `needs.*.result` handling, because no job they depend on will skip.
- `deploy.yaml` out of scope — it triggers on push to `main`.
- No change to what any test asserts.
- The dependency audit stays ungated: it is ~30 seconds and the only thing that detects advisories published against unchanged dependencies (`extract-zip` is transitive with no patched release, so Renovate cannot raise a PR for it).

---

## Key Decisions

- **Gate steps, not jobs.** The `systematic` pattern. Jobs always run and report a status, so the seventeen required contexts always conclude `success` and branch protection needs no change. It also removes the skip-provenance problem: GitHub reports the same `skipped` string whether a job was filtered deliberately or skipped because an upstream job was skipped, so an aggregator tolerating `skipped` could green a PR where nothing ran. Nothing skips, so nothing is ambiguous. The cost is runner spin-up plus `setup` per job, roughly 40 seconds, against four-minute Lighthouse jobs.
- **Filter once per workflow, consume per step.** `steps.filter` is job-scoped, so gating steps across several jobs would otherwise mean repeating the filter in each. Running it once in `setup` and reading `needs.setup.outputs.*` inside each job's steps keeps one source of truth.
- **Fail loudly on an unexpected filter value.** A silent skip on a missing value would recreate the defect class documented in `docs/solutions/best-practices/checks-that-pass-while-validating-nothing-2026-09-01.md`.
- **External `.github/filters.yaml`** — the `renovate-action` shape, since three workflows share categories.
- **Pin `dorny/paths-filter@ceb8a2b8f2d89434be7ff52d3de7ec3738c5cc9d # v4.0.3`** — the SHA already in use across the other repos.
- **Grant `pull-requests: read` at workflow level, not job level.** All three workflows already declare top-level `permissions`, and a job-level block replaces rather than merges with it, so adding one to `setup` would silently drop `contents: read` plus `actions: read` and `pages: read` in `e2e-tests.yaml`.

---

## Dependencies / Assumptions

- `Performance Audit (desktop)` and `Performance Audit (mobile)` are matrix-expanded required contexts; renaming the matrix requires a branch-protection update.
- Sequence after the `tests/` Node/DOM split from #383, which moves paths the filter keys on.
- The repo is public, so `actions/checkout` needs no `contents` grant; the precedent relies on this and so would any job-level permissions block.

---

## Outstanding Questions

### Deferred to Planning

- [Affects R3][Technical] Whether `build-for-tests` producing no build artifact when its steps are gated off leaves the downstream suites' own gated steps consistent, or whether the build step should stay ungated.
