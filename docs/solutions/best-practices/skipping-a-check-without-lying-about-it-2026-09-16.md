---
title: Skipping a check without lying about it
date: 2026-09-16
category: best-practices
module: CI quality gates and test reporting
problem_type: best_practice
component: development_workflow
severity: high
applies_when:
  - Adding or editing path-based CI gating so narrow PRs skip expensive work
  - A skipped job could mean either deliberate filtering or a collapsed dependency chain
  - Summaries, notifications, or artifact downloads assume the gated work ran
resolution_type: workflow_improvement
related_components:
  - .github/filters.yaml
  - .github/workflows/ci.yaml
  - .github/workflows/e2e-tests.yaml
  - .github/workflows/performance.yaml
  - tests/scripts/ci-path-filtering.test.ts
tags:
  - github-actions
  - paths-filter
  - ci-gating
  - artifact-contracts
---

# Skipping a check without lying about it

## Context

The sibling docs below cover checks that report success while validating nothing — a defect. This covers the same outcome arrived at *on purpose*: a check that deliberately does not run, and the conditions under which that stays honest.

PR #400 added `dorny/paths-filter` gating to three workflows so a documentation change stops paying for browser and Lighthouse suites. Each rule below came from a review round or a trace, not from design.

## Guidance

### Gate steps, not jobs

GitHub reports `skipped` identically whether a job was filtered deliberately or skipped because an upstream `needs` was skipped. Nothing in the result distinguishes them.

That matters because aggregators read results. `quality-gate` in `.github/workflows/ci.yaml` exits 1 on anything that is not exactly `success`, so job-level gating leaves two options: fail every filtered PR, or teach the aggregator to accept `skipped`. The second option means reporting success when a collapsed chain meant nothing ran.

Gating the step sidesteps the ambiguity. The job runs, reports `success`, and satisfies branch protection; only the work inside it is conditional.

```yaml
- name: Run TypeScript compiler
  if: needs.setup.outputs.run-type-check == 'true'
```

### The gate must cover its own control plane

The first version of `.github/filters.yaml` had no category matching `.github/workflows/**` or the filter file itself. A PR editing only a workflow reported every category false and skipped the checks meant to validate that edit.

```yaml
automation: &automation
  - scripts/**
  - .github/hooks/**
  - .github/git-hooks/**
  - .github/filters.yaml
  - .github/workflows/**
```

A filter that cannot see changes to itself is a filter nobody can safely change.

### `added|modified:` is wrong for source paths

The prefix appears throughout the upstream precedent this work copied. Applied to source, a deletion or rename evaluates false — move a component out of `src/` and type-check and tests skip while its orphaned imports stay broken.

Reserve it for paths where a deleted file cannot break anything, and say so where the rule lives rather than trusting the next reader to rediscover it.

### The gate's scope must match the command's scope

`pnpm run check-types` runs `tsc --noEmit` over two projects, both `include: ["**/*"]`. The first gate derived from three narrow categories, so changes under `tests/**` and `examples/**` skipped type-checking entirely — and neither Vitest nor Playwright enforces types while transpiling.

Read what the gated command actually covers. A gate narrower than its command is a silent coverage hole.

### Narrowing a gate needs proof, not reasoning

`type-check: ['**']` looks lazily broad, and a reviewer suggested narrowing it to TypeScript extensions. It survived because the narrowing could not be proven complete.

`resolveJsonModule` is in use, by two different routes. `src/hooks/UseProjects.ts` and `UseBlogPosts.ts` assign the import to a typed const (`const snapshot: ProjectsSnapshot = projectsSnapshot`); `src/utils/analytics.ts` uses an inline assertion (`projectsSnapshot as {projects: {id: string}[]}`). Both surface a shape mismatch — renaming a single key in `src/data/projects-snapshot.json` produces TypeScript errors with zero `.ts` files touched:

```
Property 'projects' is missing in type '{ ... renamed: ... }'
  but required in type '{ projects: { id: string; }[]; }'
```

The reachable JSON set grows with the import graph, not with any fixed glob.

A gate that always runs costs seconds. A gate that misses an input costs a broken build nobody was warned about.

### Producers and consumers need the same condition

`build-artifacts-e2e` has one upload and three downloads. Gating the build without gating each download fails on artifact-not-found.

```yaml
- name: Download build artifacts
  if: ${{ needs.setup.outputs.e2e == 'true' }}
- name: Run E2E tests
  if: ${{ needs.setup.outputs.e2e == 'true' }}
```

Both gated or neither. The same pairing repeats for visual and accessibility.

### Skipped work must not report as passed

The first implementation had suite jobs succeed without running tests while the summary and notification reported every suite passed.

```sh
if [[ "$GATE_E2E" == "false" ]]; then
  echo "⏭️ **E2E Tests**: Not run (no relevant path changes)"
fi
```

Green must mean *ran and passed*, never *the job existed*.

### Invariant tests must learn new inputs automatically

The assertion protecting this whole design — no job carries a filter-keyed top-level `if:` — matched against a hardcoded list of gate output names, and silently failed to cover a newly added one.

```ts
for (const [outputName, expression] of Object.entries(job.outputs ?? {})) {
  if (/steps\.[\w-]*(?:gate|filter)[\w-]*\.outputs\./.test(expression)) names.add(outputName)
}
```

Scanning every job's `outputs:` across all three workflows means a new gate output is covered the moment it exists.

An invariant guarded by a hand-maintained list decays the moment someone adds an input and does not think to update it.

### Trace consumers, do not follow the step list

`Collect performance artifacts` runs without `--allow-empty`, so `validateRequiredArtifacts()` throws once the LHCI run and build are skipped. It was not on the list of steps to gate; enumerating every reader of `lhci-reports-<device>/` found it. Ungated, every filtered PR would have failed.

`Generate performance dashboard` and `Generate performance report` in that same file are deliberately left ungated, because each already handles an absent reports directory — the first pushes a collection failure and continues, the second writes an explicit "No Lighthouse reports generated" line. The difference between those and the collector is only visible by reading what each does when its input is missing.

## Why This Matters

Each rule closes one route to the same outcome — work not done, reported as work that passed. Step-level gating removes the `skipped` ambiguity, self-coverage keeps the filter changeable, scope matching stops silent holes, symmetry prevents artifact crashes, and explicit skip reporting keeps the summary honest.

## When to Apply

- Adding or editing path-filter categories
- Changing workflow `if:` conditions, job outputs, or required checks
- Narrowing any gate that feeds an artifact download, report, or notification
- Extending a gate to cover generated files, snapshots, or workflow files
- Updating tests that assert CI behavior

## Related

- [Checks that pass while validating nothing](checks-that-pass-while-validating-nothing-2026-09-01.md) — the general rule that absence must stay visible and distinct from success
- [Fixing a check that validates nothing](fixing-a-check-that-validates-nothing-2026-09-02.md) — remediation mechanics, including scoping permissiveness to a named case rather than a blanket mask
- [A developer git hook ran inside bot automation](../integration-issues/pre-push-hook-blocks-renovate-pushes-2026-09-16.md) — the same honesty principle in a different failure mode: a bypass that states what it skipped and why
- PR #400
