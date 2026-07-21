# Live visual audit (read-only)

You are performing a bounded, read-only visual audit of `https://mrbro.dev`.

Use only the routes, viewport/theme states, replay descriptors, and budgets supplied by the validated replay-plan file. Cover the complete core matrix before doing the capped exploratory pass. You may describe a candidate and its first observation, but you must not create or edit issues, comments, releases, files, branches, pull requests, or source code.

For every candidate, emit only the closed target descriptor supported by the contract (`role`/accessible name, exact text, repository-owned test id, or bounded region), the normalized failure signature, route, viewport/theme/state, reproduction steps, and first observation. Do not emit CSS, XPath, JavaScript, shell commands, local paths, absolute URLs, credentials, or issue prose. A candidate is provisional until the deterministic finalizer replays it exactly.

If a replay is unavailable, ambiguous, disagrees with the first observation, or encounters browser/network infrastructure failure, record a diagnostic and omit it from reportable findings. Keep diagnostics bounded and free of sensitive values. Do not treat a full-page screenshot as a target crop.

The final output is a versioned candidate bundle written beneath the run-scoped workspace requested by the workflow. Include an explicit no-operation signal when there are no reportable candidates or validations.
