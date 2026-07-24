# scripts/

19 top-level CI/build automation scripts for bundle analysis, performance monitoring, test orchestration, repo management, blog snapshot, and project preview refresh, plus the `live-audit/` module.

## Execution

- **`.ts` files**: Run via `tsx` (e.g., `npx tsx scripts/analyze-build.ts`)
- **`.mjs` files**: Run directly via `node` (e.g., `node scripts/test-dashboard.mjs`)

## By Domain

### Build Analysis

| Script                   | Role                                                                               |
| ------------------------ | ---------------------------------------------------------------------------------- |
| `analyze-build.ts`       | Bundle size auditing — JS <500KB warning, <2MB max. Generates GitHub job summaries |
| `performance-budgets.ts` | Enforces Core Web Vitals: LCP <2.5s, FID <100ms, CLS <0.1                          |

### Performance Monitoring

| Script                      | Role                                                  |
| --------------------------- | ----------------------------------------------------- |
| `performance-dashboard.ts`  | Aggregates Lighthouse data for trend tracking         |
| `performance-regression.ts` | Compares current metrics against historical baselines |
| `performance-artifacts.ts`  | Manages trace logs and flame graphs                   |

### Test Reporting

| Script                     | Role                                                                     |
| -------------------------- | ------------------------------------------------------------------------ |
| `test-dashboard.mjs`       | Weighted health score: Unit 25%, E2E 30%, A11y 20%, Visual 15%, Perf 10% |
| `generate-test-badges.mjs` | Updates README status badges from JSON test results                      |

### Artifact Management

| Script                        | Role                                                                     |
| ----------------------------- | ------------------------------------------------------------------------ |
| `artifact-management.mjs`     | Automated cleanup — coverage/results 30 days, visual baselines permanent |
| `visual-artifact-manager.mjs` | Handles diff/failure snapshots for visual regression                     |

### Repository Management

| Script                           | Role                                                   |
| -------------------------------- | ------------------------------------------------------ |
| `configure-branch-protection.ts` | Automates GitHub repository branch protection rulesets |
| `branch-protection-config.ts`    | Branch protection ruleset configuration definitions    |
| `branch-protection-api.ts`       | GitHub API client for branch protection operations     |
| `branch-protection-gh.ts`        | GitHub CLI wrapper for branch protection management    |
| `apply-repo-settings.ts`         | Applies repository-level settings via GitHub API       |

### Content Refresh

| Script | Role |
| --- | --- |
| `project-preview-refresh.ts` | Fetches and atomically publishes GitHub social cards, with fail-safe refresh and R9 pruning |

### Live Audit Evidence (`live-audit/`)

The live-audit module separates read-only browser discovery from deterministic evidence finalization and GitHub reporting. It is invoked by `.github/workflows/fro-bot.yaml`, not by a package script.

| Module / CLI | Role |
| --- | --- |
| `contract.ts` | Ajv-backed manifest, target, assertion, action, evidence, and validation contract |
| `identity.ts` | Stable finding fingerprints, variant keys, and retry operation keys |
| `issue-ledger.ts` | Bounded issue-body sentinel ledger, replay metadata, checkpoints, and transition provenance |
| `route-event.ts` | Exact schedule, dispatch-slot, and authorized manual-command routing |
| `replay-plan.ts` | Closed scheduled/manual replay plans and deterministic core matrix |
| `prepare-discovery.ts` | Event/issue preflight and atomic replay-plan CLI |
| `evidence.ts` | Browser replay, assertions, PNG validation, and context/crop capture |
| `finalize-discovery.ts` | Same-run confirmation, evidence sealing, manifest, diagnostics, and canonical artifact CLI |
| `github-runner.ts` | Bounded `gh` runner and typed GitHub API reads/writes through argument arrays or JSON input |
| `release-evidence.ts` | Machine-managed `live-audit-evidence` release and immutable public PNG publication |
| `reporter.ts` | Write-mode gate, dry-run decision parity, issue lifecycle, idempotency, and typed diagnostics |
| `report-audit.ts` | Reporter CLI; reads the closed artifact and writes `reporter-result.json` / `$GITHUB_STEP_SUMMARY` |
| `adopt-legacy-issue.ts` | Local-only generic trusted adoption CLI; reads `--descriptor`, writes bounded `--result`, and supports the closed write-mode gate |

Constraints:

- Use the existing Ajv, native `fetch`, Playwright, and `gh` runner patterns. Do not add an SDK, new dependency, or alternate GitHub client.
- Discovery is read-only and must stay beneath its fixed run workspace. The reporter is the only workflow lane allowed to publish release assets or perform general issue lifecycle mutation; the local adoption CLI is limited to its explicit body/label boundary below.
- `adopt-legacy-issue.ts` is local-only: it has no workflow or event route and may write only the issue ledger body followed by the canonical label union. It must never publish evidence or release assets, add comments, create issues, reopen, or close issues.
- The adoption CLI requires `GITHUB_REPOSITORY`, `GH_TOKEN`, and a validated non-bot human `LIVE_AUDIT_ADOPTER`; `GH_TOKEN` must represent that approved identity. `LIVE_AUDIT_WRITE_MODE` defaults to `disabled`, and only `disabled`, `manual-only`, and `enabled` are accepted.
- Adoption descriptors are closed JSON files bound to the repository, issue number, reviewed issue baseline, and bounded replay variants. Parse with `parseLegacyAdoptionDescriptor`; never derive replay inputs from issue prose or shell interpolation.
- Adoption execution is body-first, labels-second, with drift verification, a stable adoption key, and the `legacy-adopt` ledger checkpoint. Retries recover body-only or label-only completion and do not repeat completed effects. Result files are bounded and written atomically to the caller-provided temporary path.
- Keep `LIVE_AUDIT_WRITE_MODE` fail-closed: missing/`disabled`, `manual-only`, and `enabled` are the only values; live-audit dispatch is always dry-run.
- Never derive replay inputs from issue prose, interpolate untrusted values into shell strings, or publish runner-local paths. Use closed schemas, bounded paths, public-image verification, and temp/body-file or `--input -` boundaries for GitHub text writes.
- Preserve the fingerprint/variant/operation-key identities, ledger sentinel ownership, reporter markers, fixed operation order, and human-closure suppression rules. A retry must reconcile GitHub state rather than trust runner-local state.
- The rolling release is machine-managed evidence. Reuse verified assets; replace only positively incomplete same-name collisions; never rename or delete referenced assets.

## CI Integration

Scripts trigger via `.github/workflows/`. Outputs target `$GITHUB_STEP_SUMMARY` for job summaries and repository badges for README.
