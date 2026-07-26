# Live Audit Evidence Runbook

> Durable evidence, not runner-local screenshots.

## Status

The original operational failure was twofold: freeform audit evidence could point at files on the Actions runner, and a full-page image could hide the target it claimed to prove. The checked-in implementation separates deterministic evidence and lifecycle from discovery.

**Runtime status: NOT YET EXECUTED.** The default-branch dispatch, issue #204 acceptance, repository-variable changes, release mutations, issue mutations, scheduled write runs, and the 24-hour rollout window are all still gated on merge and explicit approval. The contract and fixture checks are pre-merge receipts; they are not production acceptance.

## Architecture

The live-audit lane is:

```text
preflight → discovery / finalizer → reporter
```

- **Preflight** (`live-audit-preflight`) validates the event, current actor permission, labels, issue ledger, schedule slot, and replay-plan inputs.
- **Discovery / finalizer** (`live-audit-discovery`) checks out the trusted default branch, prepares a closed replay plan, runs the fixed discovery prompt, rejects worktree changes, and deterministically replays candidates with Chromium. Discovery has no GitHub write permission.
- **Reporter** (`live-audit-reporter`) downloads the exact Actions artifact into a fresh workspace, validates it again, plans release and issue operations, and performs writes only when the write mode permits them.

The pinned discovery action is `fro-bot/agent@v0.93.1`. That version requires `github-token: ${{ github.token }}`; scheduled and `workflow_dispatch` live-audit executions provision the token to the model/runtime. It is ephemeral, job-scoped, and read-only under the discovery job. `response-mode: none` prevents intentional action responses, but this is not credential-free isolation: the action can still receive the token and have API access permitted by the job. The fixed prompt's no-GitHub-use rule remains defense in depth and is an instruction, not a hard access boundary. The dedicated live-audit lane supplies no `FRO_BOT_PAT` and introduces no new long-lived token; the independent generic `Fro Bot` job retains its existing configuration.

The generic `Fro Bot` job remains independent. Its job name and required-check role are unchanged, and its review, maintenance, autoheal, PR, and non-visual comment behavior is not delegated to the visual lane. A `live-audit` workflow dispatch excludes that generic job so the dispatch is a visual dry run only; the two scheduled events retain the generic job alongside the dedicated visual jobs.

## Triggers and routing

The workflow entry point is `.github/workflows/fro-bot.yaml`.

| Event | Accepted live-audit input | Run kind | Notes |
| --- | --- | --- | --- |
| `schedule` | `30 3 * * *` | scheduled | 03:30 UTC autoheal slot |
| `schedule` | `30 15 * * *` | scheduled | 15:30 UTC maintenance slot |
| `workflow_dispatch` | `mode: live-audit` and `live-audit-slot: 30 3 * * *` or `30 15 * * *` | scheduled | The slot is a closed choice, not freeform text; the reporter is forced to `disabled` |
| `issue_comment` | Exact body `@fro-bot validate #N` on issue `#N` | manual | Created comment, non-bot actor, trusted association, and current write-capable repository permission are required |

The manual command is issue-local and exact. It does not accept a pull-request comment, extra prose, a mismatched issue number, or a bot actor. Preflight also requires the target issue to carry `visual-audit`, not `visual-audit-suppressed`, and a valid machine-readable ledger.

If live-audit preflight infrastructure fails, comments beginning with the literal `@fro-bot validate #` prefix—including malformed lookalikes—are intentionally excluded from generic Fro Bot; retry after preflight is healthy.

The authorized association set is `OWNER`, `MEMBER`, or `COLLABORATOR`. The current GitHub permission check must resolve to `write`, `maintain`, or `admin`. A permission lookup failure is a rejection, not a best-effort approval.

## `LIVE_AUDIT_WRITE_MODE`

The reporter reads the repository variable through the workflow environment. A missing variable defaults to `disabled`; an invalid value fails closed.

| Value | Scheduled run | Manual validation | Effect |
| --- | --- | --- | --- |
| missing or `disabled` | decision only | decision only | Zero release, issue, comment, label, reopen, or close writes |
| `manual-only` | decision only | writes permitted | Manual validation and the separately approved local legacy-adoption CLI may write; scheduled mutation stays disabled |
| `enabled` | writes permitted | writes permitted | Both approved paths may mutate |

Every `workflow_dispatch` with `mode: live-audit` is forced to `disabled`, regardless of the repository variable. Dispatch is therefore always a dry run. The decision plan is still built, including fingerprints, variants, asset names, comments, and transitions, so disabled and write-enabled evaluation can be compared before execution.

### Trusted legacy adoption CLI

`scripts/live-audit/adopt-legacy-issue.ts` is a **local-only** generic operation. It has no workflow or event route and is not invoked by `fro-bot.yaml`. It reads one closed JSON descriptor, queries the named issue through the existing `gh` runner, and plans a deterministic adoption keyed by `legacy-adopt`.

The descriptor binds:

- repository owner and name, checked against `GITHUB_REPOSITORY`;
- issue number and a reviewed baseline: `updatedAt`, open state, state reason, sorted labels, human-body SHA-256 outside the ledger, and `ledger: absent`;
- normalized route, semantic target, finding class, failure signature, and responsive kind; and
- closed replay variants carrying viewport, theme, state, target, assertion, bounded actions, and reviewed reproduction steps.

The parser rejects extra prose, unsafe or non-normalized text, duplicate variants, assertion/class mismatches, unsorted labels, and repository drift. Replay inputs never come from issue prose.

The operation is deliberately narrower than reporter execution:

1. If the ledger is absent and the reviewed baseline still matches, append the canonical sentinel ledger first.
2. Re-read the issue, then add the canonical managed-label union: the descriptor's reviewed labels plus `fro-bot` and `visual-audit`, sorted and deduplicated.
3. Verify the body outside the sentinel, ledger, state, and labels after each write.

It never publishes evidence or release assets, adds comments, creates issues, reopens issues, or closes issues. `disabled` produces the full bounded plan with zero GitHub writes; `manual-only` and `enabled` execute the approved body/label operation. The operation records `legacy-adopt` in the ledger, uses a stable adoption key, preserves the first adoption timestamp across partial recovery, and retries body-only or label-only work without duplicating completed effects. A second completed invocation returns an `already-adopted` warning with zero writes.

`LIVE_AUDIT_ADOPTER` is required and must be a non-bot human GitHub login. Derive it before running the CLI with the approved authentication, for example `gh api user --jq .login`; do not type an issue author or issue prose into this variable. `GH_TOKEN` must be set to a token for that same approved authenticated identity. The CLI's local outputs are only the bounded result file and, when configured, the Actions summary; its approved remote writes are limited to the issue ledger body and canonical labels.

## Permissions, secrets, and trust boundaries

| Job | Token and permissions | Secrets present | Boundary |
| --- | --- | --- | --- |
| Preflight | `github.token`; `contents: read`, `issues: read` | No model-auth secrets | Reads event data, issue metadata, labels, and current collaborator permission; cannot write |
| Discovery / finalizer | `github.token`; `contents: read`, `issues: read` | `OPENCODE_AUTH_JSON`, `OMO_PROVIDERS`, and `OPENCODE_CONFIG` are supplied only to the bounded Fro Bot discovery action; no `FRO_BOT_PAT` or new long-lived token | Can inspect the trusted checkout and public `mrbro.dev` routes; the action runtime can receive the read-only token/API access but cannot write issues, comments, releases, source, or commits; `response-mode: none` and the fixed prompt are defense-in-depth controls, not hard access boundaries |
| Reporter | `GH_TOKEN=${{ github.token }}`; `contents: write`, `issues: write` | No model-auth secrets and no `FRO_BOT_PAT` | May publish release assets and mutate issues; has no pull-request or discussion write permission and never runs the discovery agent |
| Generic `Fro Bot` | Existing job-level permissions and secrets | Existing `FRO_BOT_PAT`, model auth, and configuration | Independent automation path; not a reporter fallback |

The visual lane is report-only with respect to GitHub mutations. It does not edit source, push commits, open remediation pull requests, or deploy the site. Browser URLs are reconstructed from the allowlisted `https://mrbro.dev` routes; foreign origins and private browser state are outside the contract.

## Fixed workspace and artifact handoff

Discovery creates a run-scoped directory under:

```text
$GITHUB_WORKSPACE/temp/live-audit/${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}/
```

The gitignored `temp/` directory is used because the pinned discovery action permits normal in-workdir access while stripping custom `LIVE_AUDIT_*` environment variables and hard-locking external directories. The workflow renders the controlled paths into the prompt before invoking the action. The fixed paths are `replay-plan.json`, `candidate-bundle.json`, `artifact/`, and `finalization-result.json`. The candidate bundle must be a regular file beneath that workspace. The discovery job also verifies a clean trusted worktree before finalization.

The finalizer writes a closed artifact containing `manifest.json`, `diagnostics.json`, `finalization-result.json`, `evidence/`, and `provenance/` with the replay plan and candidate bundle. Evidence references are remapped to the artifact, sealed against unreferenced files and path traversal, and validated as PNGs. The canonical artifact is uploaded as `live-audit-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}`.

The reporter creates a different fresh directory under:

```text
$RUNNER_TEMP/live-audit-reporter/${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}/
```

It downloads that exact artifact name and invokes `scripts/live-audit/report-audit.ts` with `manifest.json` and the artifact root. No runner-local discovery path crosses the job boundary or appears in public evidence.

## Evidence retention

Every reportable finding or clean validation carries a context image and a target crop. The crop is captured from the resolved target or bounded region; a full-page image is never substituted for it. The contract records relative paths, PNG integrity, dimensions, byte counts, alt text, and captions. Target ambiguity, missing targets, zero-size bounds, invalid PNGs, and unreferenced files fail closed.

The complete run bundle is an ephemeral Actions artifact with **7-day retention**. Only referenced failure or clean-validation images are promoted to the durable rolling Release tagged `live-audit-evidence`.

The release is a published prerelease with `make_latest=false`: machine-managed infrastructure evidence, not a product release. Release metadata is checked and reconciled before reporter execution; a later concurrent maintainer edit is outside GitHub's atomic boundary and is corrected by the next evidence-bearing run. Asset names include the operation key, finding fingerprint, variant key, role (`context` or `crop`), and a content hash. A verified matching asset is reused. Only a positively incomplete same-name collision (`starter` or zero-byte) may be replaced; an unknown or mismatched collision fails closed. Never rename or delete an asset while an issue or comment references it.

Before an issue body or comment is written, each release URL is checked against the repository release namespace and fetched as public image bytes with the expected SHA-256. GitHub's public release transport may report `application/octet-stream` after redirect; the reporter accepts that content type only when the downloaded bytes are a valid PNG and match the expected hash. Actions artifact URLs, runner paths, Git LFS pointers, and unverified image URLs are not report evidence.

## Identity and issue lifecycle

### Fingerprints and variants

- **Finding fingerprint** — SHA-256-derived 32-hex identity from normalized route, semantic target, and normalized failure signature. Run IDs, timestamps, screenshot names, and wording do not change it.
- **Variant key** — SHA-256-derived 32-hex identity from viewport, theme kind and mode/preset, and reproduction state. Viewport, theme, and state remain visible beneath one finding; they are not hidden to make deduplication easier.
- **Operation key** — SHA-256-derived identity from run ID, fingerprint, variant, and checkpoint. It is the retry boundary.

One fingerprint maps to one reporter issue. A repeat updates that issue and its variant ledger. A materially different normalized failure signature produces a different fingerprint and therefore a separate issue. More than one matching reporter issue is a diagnostic failure, not a choice.

### Same-run confirmation and reporting

Scheduled discovery may propose a candidate, but the deterministic finalizer replays it in the same route, target, viewport, theme, state, assertion, and bounded action sequence. A finding is reportable only when the candidate and replay both fail with the same normalized signature and both have sealed evidence. Disagreement or infrastructure failure remains diagnostic and ephemeral.

The closed contract supports four target descriptors: role/name, exact text, repository-owned test ID, or bounded region. Assertions and actions are versioned unions. The action list is bounded at 20 actions, and each wait is bounded at 30 seconds. Scheduled coverage always includes `/`, `/about`, `/projects`, and `/blog` at desktop and mobile in light and dark modes, plus one deterministic rotating preset. Manual replay has no exploratory core matrix and replays only the active variants for one issue.

### Sentinel ledger and checkpoints

The issue body owns one machine-readable ledger between:

```text
<!-- live-audit-ledger:v1 -->
...
<!-- /live-audit-ledger -->
```

The reporter owns this sentinel block. Human text outside the block is preserved and hashed for drift detection; it is never parsed as replay input. The ledger records the fingerprint, route, semantic target, finding class, assertion, actions, variants, replay descriptors, operations, and transition provenance.

Ledger operation checkpoints are `validate`, `asset`, `issue`, `evidence`, `initial-create`, `legacy-adopt`, `transition`, and `transition-pending`. External execution follows a fixed order:

1. Validate the artifact, identity, paths, images, and metadata.
2. Compute operation keys and immutable asset names.
3. Create or reuse the rolling release; upload, replace only positively incomplete collisions, and verify each public asset.
4. Locate or create the one fingerprinted issue.
5. Update the ledger and human-facing body, then add an operation-marked reporter comment.
6. Reopen or close last, with transition provenance recorded in the ledger and comment markers.

Reporter comments carry `live-audit-operation:<key>`, `live-audit-transition:<key>` when applicable, and a run marker. A retry uses those markers and the ledger checkpoints to avoid duplicate assets, body events, comments, or state transitions.

### Closure policy

- **Manual validation:** one clean replay of every active variant in the issue closes it. A confirmed failure updates only the failing variant's evidence and keeps the issue open.
- **Scheduled validation:** the first clean replay records a clean count but does not close. Every active variant needs two clean scheduled replays from two distinct workflow runs; a same-run-confirmed recurrence resets that variant's clean count (and any required responsive counterpart) and keeps the issue open. Closure writes clean context/crop evidence and states that it followed two scheduled replays.
- **Recurrence:** a reporter-closed issue may be reopened only when the close event, reporter transition marker, `completed` state reason, and ledger provenance all prove that the reporter owned the close. A human closure, `not planned`, duplicate resolution, or explicit suppression is authoritative.

## Human authority

The `visual-audit-suppressed` label is a hard stop. Scheduled preflight excludes the issue, manual preflight rejects it, and reporter planning records a suppression diagnostic rather than mutating it.

The reporter never automatically reopens an issue whose closure provenance is human, missing, stale, or ambiguous. It re-reads the issue, comments, and close/reopen events before a transition. Any uncertainty suppresses mutation and surfaces a diagnostic. Human closure is authority, not a state to be “healed.”

## Retry, idempotency, drift, and status

The reporter re-reads issue snapshots, ledger content, release state, and asset lists before mutation. It detects issue-body drift outside the ledger, ledger drift, issue-creation races, release disappearance, asset-plan drift, state drift, and ambiguous lifecycle provenance. A later retry reconstructs completed checkpoints from GitHub state instead of trusting the old runner workspace.

Status is typed rather than inferred from prose:

- Finalizer result schema: `success`, `warning`, or `failure`, with `findingCount`, `validationCount`, `diagnosticCount`, and `manifestPath`. Successful finalization writes `success` or `warning`; a thrown finalizer error fails the job before a successful result is emitted.
- Reporter result: `success`, `warning`, or `failure`, with typed diagnostic details, planned operations, write count, and issue numbers. The CLI writes `reporter-result.json` and a bounded Actions summary; failures also emit a bounded, token-redacted diagnostic to stderr and exit non-zero. The workflow uploads `reporter-result.json` with `always()` and 7-day retention, including when the reporter exits 1.
- Reporter diagnostic codes: `writes-disabled`, `manual-only`, `suppressed`, `infrastructure`, `artifact`, `planning`, `asset-verification`, `transport`, `drift`, `mutation`, and `contract`. Disabled/manual-only/suppressed/infrastructure are warnings; the remaining codes are failures.

The reporter concurrency group is `live-audit-reporter` with `cancel-in-progress: false`. This is a single-pending-run limitation, not a durable queue: GitHub Actions permits one active and one pending run for the group, and a newer pending run can replace the older pending run. There is no multi-pending queue. The invalid queue syntax previously considered for this lane was removed; it is not part of the current workflow. If a pending run is displaced, inspect the run list and manually rerun the approved operation after checking the same operation key.

## Phased rollout

| Phase | Write mode | Go evidence | No-go condition |
| --- | --- | --- | --- |
| Pre-merge | `disabled` | Contract, fixture, Chromium evidence, workflow, lint, and path checks | Any test path mutates GitHub or the required check becomes conditional on visual jobs |
| Default-branch dispatch | `disabled` | Canonical artifact and reporter decision summary with zero writes | Invalid artifact, skipped replay, unsafe planned mutation, or non-zero write count |
| #204 adoption dry run | `disabled` | A reviewed trusted descriptor plans exactly one bounded ledger adoption | Any replay field comes from issue prose or unrelated issue content changes |
| #204 acceptance | `manual-only` | One approved local adoption and issue-local validation produce correct durable evidence and state | Broken URL, missing target, duplicate side effect, wrong transition, or human authority conflict |
| Scheduled activation | `enabled` | Both cron slots preserve generic behavior and produce correct no-op or idempotent mutation | Queue loss, duplicate issue/asset/comment, required-check regression, or failure represented as clean |

All runtime and #204 acceptance rows are **NOT YET EXECUTED**. They require merged code on the default branch and explicit approval. The local legacy-adoption CLI is implemented, but it is not a workflow route and does not by itself authorize a production mutation. Use only a reviewed closed descriptor and the gated procedure below; do not improvise a body edit for #204.

## Post-merge #204 procedure

This is the exact gated procedure. It is a runbook, not a record that these steps have run.

1. **Capture a read-only baseline first.** Record issue #204's state, state reason, labels, human body, ledger sentinel presence and validity, comments and reporter markers, close/reopen events and actors, existing evidence URLs and public image responses, and whether `visual-audit-suppressed` is present. Save the baseline outside the repository. Stop for maintainer direction if provenance is ambiguous or human authority has already resolved the issue.
2. **Build a temporary trusted descriptor from reviewed facts.** Use the current public page and the baseline to select the exact route, target descriptor, assertion, actions, viewport/theme/state, failure signature, and reproduction metadata. Do not derive any replay field from issue prose, old runner paths, stale screenshots, or unrelated issue content. Keep the descriptor in a temporary file; do not commit it.
3. **Derive the adopter identity externally.** With the approved authentication, run `gh api user --jq .login` and retain the login in a shell variable. Confirm `GH_TOKEN` is the token for that same human identity. The adopter is not taken from issue prose, a comment, or a bot identity.
4. **Run the disabled CLI dry run.** Construct the temporary closed descriptor, set `LIVE_AUDIT_WRITE_MODE=disabled`, and invoke `scripts/live-audit/adopt-legacy-issue.ts`. Inspect the bounded result file: status, issue number, fingerprint, adoption key, exactly planned body/label operations, `legacy-adopt` checkpoint, diagnostics, and `writeCount: 0`. This is a local CLI run with no release, evidence, comment, create, reopen, or close operation.
5. **Approval gate before mutation.** Stop and obtain explicit maintainer approval before changing `LIVE_AUDIT_WRITE_MODE`, running the manual-only CLI, seeding the ledger, changing issue body/labels, adding a reporter comment, creating or changing a release asset, reopening, or closing. No automatic rollout is implied.
6. **Set `manual-only` only after approval.** Use the repository variable as the single scheduled/reporting write gate. Keep scheduled workflow mutation disabled while #204 is accepted. The local CLI invocation below is itself mutating and approval-gated.
7. **Run the exact same descriptor through the CLI.** Reuse the unchanged temporary descriptor, `LIVE_AUDIT_ADOPTER`, `GH_TOKEN`, repository, and result boundary with `LIVE_AUDIT_WRITE_MODE=manual-only`. The CLI must write the sentinel ledger first, then the canonical label union, and verify both. Do not claim this step ran until the result and remote readback exist.
8. **Verify the issue baseline and labels.** Read #204 back and confirm the human body outside the sentinel is byte-equivalent, the ledger contains the reviewed route/fingerprint/variants and one completed `legacy-adopt` operation, the issue remains open with its original state reason, and labels equal the sorted descriptor labels plus `fro-bot` and `visual-audit`. Stop on drift or suppression.
9. **Exercise the normal issue-local command.** Only after the adoption readback passes, post exactly `@fro-bot validate #204` as a new comment from an authorized maintainer. The manual run must replay every active variant from the ledger, publish only verified context/crop assets, add ordered captions and alt text, and follow the one-clean manual policy.
10. **Inspect public evidence and state.** Independently fetch every rendered release URL and confirm it returns matching image bytes. Inspect the rendered issue body/comment for target-visible context and crop, readable captions, stable ordering, the validating workflow link, and zero local paths or expiring Actions URLs. Confirm the observed failure or clean result determines whether #204 stays open or closes.
11. **Rerun the same adoption operation key.** Run the exact same descriptor through the CLI again with the approved mode and confirm it returns `already-adopted` with zero writes. Then rerun the normal validation operation key as required by the reporter procedure. If state drift or provenance is ambiguous, stop rather than force reconciliation.
12. **Run authorization smoke.** Test a malformed command, an unauthorized actor, a bot actor, and a mismatched issue number. Confirm no browser run, checkout, artifact, reporter, or GitHub write starts for rejected issue-local validation.
13. **Run generic required-check smoke.** Open or update one normal PR and verify the required `Fro Bot` check remains present and independent; also verify maintenance and autoheal routes retain their expected behavior.
14. **Only then consider scheduled enablement.** Review the monitoring table, confirm the manual-only evidence is durable and target-visible, and obtain a separate go decision before changing the variable to `enabled`.

Use temporary files for all GitHub text payloads. Do not interpolate issue prose or backtick bodies into shell strings.

Read-only examples:

```bash
gh variable list
gh issue view 204 --json number,state,stateReason,labels,body,comments
gh api repos/marcusrbrown/marcusrbrown.github.io/issues/204/events --paginate
gh release view live-audit-evidence --json tagName,isDraft,isPrerelease,assets
gh run list --workflow fro-bot.yaml --limit 20
```

Dispatch dry-run example (**approval gate; mutating workflow trigger; NOT YET EXECUTED**):

```bash
gh workflow run fro-bot.yaml \
  -f mode=live-audit \
  -f 'live-audit-slot=30 3 * * *'
```

Variable inspection (**read-only**):

```bash
gh variable list
```

Variable mutation through a JSON file (**mutating; explicit approval required; NOT YET EXECUTED**):

```bash
mode_file="$(mktemp)"
printf '%s\n' '{"name":"LIVE_AUDIT_WRITE_MODE","value":"manual-only"}' >"$mode_file"
gh api repos/marcusrbrown/marcusrbrown.github.io/actions/variables/LIVE_AUDIT_WRITE_MODE \
  --method PATCH \
  --input "$mode_file"
rm -f "$mode_file"
```

Adopter derivation and disabled CLI dry run (**read-only GitHub query; local result write; NOT YET EXECUTED**):

```bash
: "${GH_TOKEN:?Set GH_TOKEN to the approved human identity's token}"
adopter_login="$(GH_TOKEN="$GH_TOKEN" gh api user --jq .login)"
descriptor_file="$(mktemp)"
result_file="$(mktemp)"
# Populate descriptor_file from reviewed baseline facts only; do not copy issue prose.
GITHUB_REPOSITORY=marcusrbrown/marcusrbrown.github.io \
GH_TOKEN="$GH_TOKEN" \
LIVE_AUDIT_ADOPTER="$adopter_login" \
LIVE_AUDIT_WRITE_MODE=disabled \
pnpm exec tsx scripts/live-audit/adopt-legacy-issue.ts \
  --descriptor "$descriptor_file" \
  --result "$result_file"
jq '{status, issueNumber, fingerprint, adoptionKey, operations, diagnosticDetails, writeCount}' "$result_file"
```

Manual-only adoption (**mutating; explicit approval required; NOT YET EXECUTED**):

```bash
GITHUB_REPOSITORY=marcusrbrown/marcusrbrown.github.io \
GH_TOKEN="$GH_TOKEN" \
LIVE_AUDIT_ADOPTER="$adopter_login" \
LIVE_AUDIT_WRITE_MODE=manual-only \
pnpm exec tsx scripts/live-audit/adopt-legacy-issue.ts \
  --descriptor "$descriptor_file" \
  --result "$result_file"
```

The manual-only command may write only the issue ledger body and canonical labels. It does not publish evidence or release assets, add comments, create issues, reopen, or close. Keep the descriptor and result in temporary files; never put issue prose or a body payload on a shell command line.

Run inspection and cancellation examples (**cancellation is mutating; explicit approval required**):

```bash
gh run list --workflow fro-bot.yaml --json databaseId,status,conclusion,createdAt,displayTitle
gh run cancel RUN_ID
gh run view RUN_ID --log-failed
```

Issue-comment payload boundary (**mutating; explicit approval required**):

```bash
body_file="$(mktemp)"
cat >"$body_file" <<'EOF'
{"body":"@fro-bot validate #204"}
EOF
gh api repos/marcusrbrown/marcusrbrown.github.io/issues/204/comments \
  --method POST \
  --input "$body_file"
rm -f "$body_file"
```

## Monitoring and go / no-go

Monitor at write enablement, after each 03:30 and 15:30 UTC slot, and after the first 24 hours.

| Signal | Go condition | Stop / disable condition |
| --- | --- | --- |
| Discovery and finalizer | Deterministic artifact and replay complete | Any deterministic failure after writes are enabled |
| Dry-run/write parity | Every planned write matches the prior disabled decision | A write is absent from the decision summary |
| Asset integrity | Every public URL returns the expected PNG bytes and hash | Broken, targetless, expiring, or non-image evidence |
| Idempotency | Same operation key produces no duplicate side effect | Duplicate asset, comment, body event, reopen, or close |
| Authorization | Only the exact command and write-capable actor reach the lane | Unauthorized command reaches checkout, browser, agent, artifact, or reporter |
| Discovery access boundary | Discovery receives only the ephemeral read-only job token, uses `response-mode: none`, and follows the fixed no-GitHub-use prompt rule | Any broader permission, unexpected discovery write/API behavior, or drift in the action inputs; prompt and response-mode controls are not treated as hard isolation |
| Issue identity | One open issue per fingerprint; variants remain distinct | Duplicate fingerprint issue or variant overwrite |
| Required check | `Fro Bot` remains present and independent on a normal PR | Missing, renamed, skipped, or visual-dependent required check |
| Generic automation | Maintenance, autoheal, and normal comments retain expected behavior | Non-visual regression |
| Runtime and cost | Visual lane stays within the approved rollout budget | Budget exceeded for two consecutive scheduled runs |

### Emergency disable

Disable first, cancel second, verify third, revert only if needed:

1. Set `LIVE_AUDIT_WRITE_MODE` to `disabled`.
2. Cancel every active `live-audit-discovery` and `live-audit-reporter` run.
3. Verify that no token-bearing discovery run or write-capable reporter run remains active or pending.
4. Revert code only if the code itself must be removed or corrected.

Disabling stops reporter writes on later evaluation but does not revoke the read-only token from an already-running discovery action or make that action credential-free. `response-mode: none` and the fixed prompt do not replace cancellation and permission controls. Reverting code does not undo public evidence. Erroneous public mutations require forward correction, and referenced release assets remain intact.

## Implementation map

The runtime receipts are in these exact paths:

| Path | Contract |
| --- | --- |
| `.github/workflows/fro-bot.yaml` | Event routing, job permissions, fixed workspaces, artifact upload/download, reporter concurrency, and dispatch write-mode override |
| `.github/prompts/fro-bot-live-audit.md` | Fixed read-only discovery prompt and closed candidate-output boundary |
| `scripts/live-audit/route-event.ts` | Exact schedules, dispatch slot routing, manual command parsing, association and permission gates |
| `scripts/live-audit/prepare-discovery.ts` | Event preflight, issue/label/ledger reads, and atomic replay-plan handoff |
| `scripts/live-audit/replay-plan.ts` | Versioned scheduled/manual plans, core matrix, active variant replay inputs, and bounds |
| `scripts/live-audit/contract.ts` | Ajv schema, target/assertion/action unions, evidence pair, manifest, and semantic validation |
| `scripts/live-audit/identity.ts` | Finding, variant, and operation identities |
| `scripts/live-audit/issue-ledger.ts` | Sentinel ledger, transition provenance, replay metadata, and checkpoint validation |
| `scripts/live-audit/evidence.ts` | Core matrix, browser replay, assertion evaluation, PNG validation, and context/crop capture |
| `scripts/live-audit/finalize-discovery.ts` | Deterministic same-run replay, evidence sealing, manifest, diagnostics, and canonical artifact |
| `scripts/live-audit/github-runner.ts` | Bounded `gh` runner, GitHub reads, JSON parsing, and file/JSON-input writes |
| `scripts/live-audit/release-evidence.ts` | Rolling release lookup/creation, immutable asset planning, public URL verification, and collision policy |
| `scripts/live-audit/reporter.ts` | Write modes, typed decisions/diagnostics, operation ordering, issue lifecycle, markers, and idempotency |
| `scripts/live-audit/report-audit.ts` | Reporter CLI, closed environment parsing, result file, and Actions summary |
| `scripts/live-audit/adopt-legacy-issue.ts` | Local-only trusted adoption CLI; closed descriptor/result boundaries, adopter validation, bounded atomic result, and explicit write-mode handling |
| `scripts/live-audit/contract.ts` | `LegacyAdoptionDescriptor` schema and `parseLegacyAdoptionDescriptor` identity/parser boundary |
| `scripts/live-audit/issue-ledger.ts` | `legacy-adopt` checkpoint and sentinel validation |
| `scripts/live-audit/reporter.ts` | `decideLegacyAdoption`, `adoptLegacyIssue`, body-first/labels-second execution, drift checks, and deterministic retries |
| `tests/scripts/live-audit-*.test.ts` | Contract, routing, preflight, replay, GitHub runner, release, ledger, reporter, and CLI fixtures |
| `tests/scripts/fixtures/live-audit/` | Redacted real-shape GitHub issue, comment, permission, release, asset, search, and close-event fixtures |
| `tests/e2e/live-audit-evidence.spec.ts` | Chromium evidence capture, target crops, assertion replay, and action replay checks |

The implementation is intentionally split at the discovery boundary. The reporter owns public state; discovery proposes, finalizer proves, and the runbook records the limits.
