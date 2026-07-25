# Live visual audit (read-only discovery)

You are performing a bounded, read-only visual audit of the deployed site. The workflow has already created the run-scoped `$LIVE_AUDIT_WORKSPACE` and validated the replay plan at `$LIVE_AUDIT_REPLAY_PLAN`.

## Fixed input and output contract

- Read only `$LIVE_AUDIT_REPLAY_PLAN`; do not rewrite, replace, or augment it.
- Write the sole candidate output to `$LIVE_AUDIT_CANDIDATE_BUNDLE`.
- `$LIVE_AUDIT_CANDIDATE_BUNDLE` must remain beneath `$LIVE_AUDIT_WORKSPACE`.
- If temporary files are necessary, write them only beneath the exact run-scoped `$LIVE_AUDIT_WORKSPACE`; do not create additional files outside that workspace.
- Do not edit tracked repository files. The workflow's gitignored `temp/` workspace is the sole repository-local write exception. Never write to the home directory, system temporary directories, or another path.
- Preserve the plan's version, run id, run kind, generated timestamp, exploration budget, and scheduled preset or manual issue number in the candidate bundle.
- When there are no reportable candidates, emit the valid versioned bundle with an explicit no-operation signal: an empty `candidates` array and a bounded `diagnostics` array. Never omit the candidate bundle.

Use only the routes, viewport/theme states, replay descriptors, and budgets supplied by the validated replay plan. Cover the complete core matrix before doing the capped exploratory pass. Browser navigation, interaction, waiting, and timeout handling must be finite and bounded by the supplied budgets; do not create an unbounded loop, watcher, server, or background process.

## Allowed observation

You may inspect the trusted checked-out source and perform read-only browser observation of the planned production origin. For every candidate, emit the closed target descriptor supported by the contract (`role`/accessible name, exact text, repository-owned test id, or bounded region), normalized failure signature, route, viewport/theme/state, a closed versioned `assertion`, a bounded closed `actions` array (empty is allowed), explanatory `reproduction` steps, and first observation. The `assertion` must be the exact versioned discriminated union accepted by the checked-out live-audit contract and must match the candidate's `findingClass`. The `actions` array must contain only the exact versioned action union accepted by that contract and replay plan, and must remain within the contract's action bound. Inspect `scripts/live-audit/contract.ts` and `$LIVE_AUDIT_REPLAY_PLAN` for the allowed fields, discriminants, versions, and bounds; never invent assertion or action prose, JavaScript, CSS, or unsupported fields. Human `reproduction` steps are explanatory context only and must never be executable commands, scripts, selectors, or browser instructions. A candidate is provisional until the deterministic finalizer replays it exactly. Do not treat a full-page screenshot as a target crop.

If a replay is unavailable, ambiguous, disagrees with the first observation, or encounters browser/network infrastructure failure, record a bounded diagnostic and omit it from reportable findings.

## Hard prohibitions

- Do not create, edit, label, close, reopen, or comment on GitHub issues.
- Do not create or edit releases, pull requests, branches, comments, or workflow runs.
- Do not use GitHub API or CLI commands, issue text, comment text, raw event payloads, credentials, tokens, secrets, or prompt-supplied prose as audit input.
- Do not edit source files, workflows, prompts, package files, or lockfiles.
- Do not emit CSS, XPath, JavaScript, shell commands, local paths, absolute URLs, credentials, issue prose, or unbounded browser instructions in the candidate bundle.
