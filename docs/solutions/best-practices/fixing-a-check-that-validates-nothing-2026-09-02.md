---
title: Fixing a check that validates nothing
date: 2026-09-02
category: best-practices
module: CI quality gates and test reporting
problem_type: best_practice
component: development_workflow
severity: high
applies_when:
  - "Fixing a check that reported success without consuming the evidence it claimed to validate"
  - "A reported defect names one instance and the surrounding rule set has not been inventoried"
  - "A gate is too noisy to keep and the temptation is to delete the comparison"
  - "A subagent, audit, or issue reports a defect that has not been reproduced first-hand"
tags:
  - silent-failure
  - github-actions
  - validation
  - fail-closed
  - code-review
  - verification
---

# Fixing a check that validates nothing

## Context

The companion doc, [Checks that pass while validating nothing](./checks-that-pass-while-validating-nothing-2026-09-01.md), covers detection: how to recognise a check whose precondition, input, measurement, comparison, or failure path is absent. It closes with one sentence about remediation — *"fixes need the same evidence audit as the defects they remove"* — supported by two examples.

This doc is that sentence's evidence, and the mechanics behind it.

An audit swept `scripts/`, `src/utils/`, `src/schemas/`, `.opencode/`, `.github/git-hooks/`, and test setup for the same defect class, producing issues #355–#358 and PRs #360–#363. The findings were ordinary. What was not ordinary: **every review round caught the fix reproducing its own defect one layer down.** Not once — in every PR of the batch, plus both earlier PRs in the same body of work.

That reproducibility is what makes it worth writing down. It is not carelessness. It is what happens when you patch the instance you were shown.

## Guidance

### The defect moves down one level; it does not disappear

| PR | Fixed | Missed, one layer down |
| --- | --- | --- |
| #361 | Stopped trusting that a report file existed | Trusted its contents unchecked — `[{}]` still reported `completed`, because every metric read through `\|\| 0` |
| #362 | Distinguished a repository-level 404 from a real negative | Left the identical branch-level 404 conflation; a deleted or mistyped branch still read "unprotected" and exited zero |
| #363 | Made `performance-regression.ts` fail closed on absent evidence | The workflow still ran it under `continue-on-error: true`, plus a second `\|\| echo` mask |
| #344 | Closed the reported command-matcher evasion | Two more evasion paths, one per review round — see below |
| #327 | Removed fabricated success badges | Reintroduced fabrication in per-suite attribution |

The shape is constant: **container → contents, repository → branch, script → workflow.** The fix is correct about the level it addresses and silent about the level beneath it.

#344 is the clearest case because it took three rounds and each round's fix was individually reasonable:

1. Closed argument reordering (`rm -r -f /`)
2. Introduced a `findSubcommand` locator — still bypassed by a global option (`git -C ../other clean -fdx`)
3. Routed the *new* matchers through the locator, while pre-existing force-push and hard-reset guards stayed on the old regex path (`git -C ../other push --force origin main` still passed)

It ended only when the fix stopped being a spot patch: every git rule routed through a shared `locateGitSubcommand()`, unknown leading git options denied by default. The next gap is now visible by inspection rather than discovered in review.

**Rule: when fixing an evasion or a false negative, inventory the whole rule set and record which path each rule takes.** If you cannot name what every sibling rule does, you have not finished. Three cheap rounds of review cost more than one inventory.

### Prove the gate can fail by raising the measured value

A threshold that cannot trip is the same defect wearing a gate's clothing.

The tell is in how failure gets demonstrated. In #332, a first pass shipped a modal-open gate at `<100ms` against a measured maximum of 12.4ms — 8x headroom — and proved it worked by *lowering the threshold* to 1.00ms, below the measured floor. That proves arithmetic, not gating.

```
✗ lower the threshold below the observed range until it fails
✓ raise the measured value past the shipped threshold
```

The redone pass shipped `<20ms` against a measured max of 12.4ms (~1.6x headroom) and proved it by injecting `47.00ms exceeded 20.00ms`. Same for bundle size in #365: a real regression still exits 1, demonstrated by moving the input, not the limit.

### Observational must not mean silent

When a gate is genuinely too noisy to keep — see the wall-clock timing rule in the companion doc — the fix is a visible non-gating report, not a deleted comparison. Deleting it recreates the defect you set out to remove, and it arrives through the front door with a justification attached.

In #365 the LCP gate had failed a PR at +79.8% on a diff containing only dashboard and badge scripts plus their tests. Zero runtime code, so it could not have moved LCP; the baseline had simply been captured on a faster runner. The fix introduced an explicit per-metric flag rather than removing metrics from the comparison:

```ts
{key: 'lcp', name: 'LCP', unit: 'ms', gating: false},
{key: 'cls', name: 'CLS', unit: '', gating: true},
```

```ts
const isRegression = metric.gating && isPositiveChange && change > regressionThreshold
```

Observational metrics still compute their real delta, still emit an annotation, and are labelled so nobody reads the absence of a failure as an absence of movement:

```ts
const classification = w.observational ? ' [observational; not gating]' : ''
console.warn(`::warning::${warningMessage}${classification}`)
```

Because `isRegression` requires `metric.gating`, an observational metric cannot reach the failing path by any route, and the script still exits nonzero for a real bundle-size regression. Both properties need a test; a gate that can no longer fail at all is the worse outcome.

Scope permissiveness the same way. `--allow-empty` in the reporting lane names one acceptable absence and leaves every other failure fatal. `|| echo "Failed to generate dashboard"` on the adjacent line hides write errors, malformed input, and crashes alike — which is why it is filed as #366 rather than left as precedent.

### Verify the claim before writing the fix

Three claims in this batch dissolved under verification instead of becoming code:

- A `package.json` path mismatch described in an issue was not present in the file.
- A reported `.opencode/package.json` dependency-pin split was a **gitignored** local artifact. The audit read the filesystem; git shows no tracked pin, so CI and other contributors never see it. `git check-ignore -v <path>` settles this in one command.
- A recorded project memory said `pnpm run x -- --flag` loses the flag *at the pnpm layer*. It does not. pnpm forwards the literal `--`; the receiving CLI decides what to do with it. Vitest treats it as an argument separator and ignores everything after — the cause of three earlier bugs — while a `tsx` script reading raw argv sees the flag fine.

```console
$ pnpm run test:performance:artifacts -- --source=SENTINEL --help
$ tsx scripts/performance-artifacts.ts -- --source=SENTINEL --help
```

The practical rule is unchanged — omit the `--` — but the next occurrence must be diagnosed at the receiving CLI, not at pnpm. A memory can be wrong with more confidence than a person, because nothing re-checks it.

**Claims about presence, scope, or argument flow are cheap to verify and expensive to assume.** Check the file, the ignore state, or the actual argv before changing code. Writing a fix for a defect that does not exist produces a passing test, a plausible diff, and no improvement.

### Accept a reduced guarantee out loud

Not every fix is free. In #362 the branch-existence preflight used an endpoint requiring `Contents: read`, while the protection lookup requires `Administration: read` — so a correctness fix silently widened the required scope of a security tool, and a properly least-privileged token would have started failing.

GitHub documents the protection 404 only as "Resource not found", with no structured discriminator, so parsing the message would defer the same defect until GitHub rewrites a string. The resolution was to keep the preflight best-effort and fail loudly:

| case | result |
| --- | --- |
| branch 200 + protection 404 | `null` — genuinely unprotected |
| branch 404 | throws — branch does not exist |
| branch 403 + protection 404 | throws — **cannot determine** |

An Administration-only token can no longer distinguish "missing" from "unprotected". It says so and fails, rather than reporting a confident false negative on a branch-protection tool. State the limitation in the code and the tests; a documented gap is a known quantity, an undocumented one is a future incident.

## Why This Matters

A false-green check is a lie the repository tells itself. A *fixed* false-green check that still validates nothing one layer down is worse, because the fix consumes the attention that would have found it — the issue closes, the PR merges, and the defect now has a commit message asserting it was handled.

Every instance in the table above was caught in review. None were caught by the test suite, and several shipped with tests that passed against the remaining defect.

## When to Apply

- Fixing any check, gate, matcher, validator, or parser that reported success without consuming evidence
- Reviewing a PR whose stated purpose is removing a false-positive or false-negative
- Deciding whether a noisy gate should be removed, relaxed, or made observational
- Acting on a defect report from an audit, subagent, or issue that has not been reproduced first-hand

## Prevention

- Audit the whole rule set, not the reported instance. Record which path each sibling rule takes.
- Audit your own diff for the shape you just fixed, one level down, before requesting review.
- Prove a gate fails by raising the measured value past the threshold. Never by lowering the threshold below the observed range.
- Make noisy checks observational, never silent: keep the delta, keep the annotation, label it.
- Test both directions — the gate still fails on a real regression, and the observational path cannot fail.
- Scope permissiveness to a named case (`--allow-empty`), never a blanket mask (`|| echo`, `2>/dev/null || true`, `continue-on-error` on a deterministic step).
- Verify claims about presence, scope, or argument flow before writing code. `git check-ignore`, an echoed argv, or reading the actual file settles most of them.
- When a fix trades away a guarantee, say so in the code, the tests, and the PR.

## Related Issues

- #366 — dashboard failures masked by `|| echo` in the summary lane; the pattern still live on `main`
- #355–#358 — the audit findings this batch fixed; PRs #360–#363
- #364 / #365 — the LCP gate that fired on a diff with no runtime code, and the observational-not-silent fix
- #344 — three review rounds of command-matcher evasion, ending in a full rule inventory
- #327 / #332 — the earlier recursive fixes recorded in the companion doc
