---
date: 2026-07-20
topic: live-audit-evidence
---

# Live Audit Evidence Requirements

## Summary

Modernize Fro Bot's scheduled visual/live audit so every reported finding carries durable, targeted evidence instead of runner-local screenshot paths. Fro Bot remains responsible for browser-based discovery, while deterministic workflow code validates its structured output, promotes only finding-specific screenshots to a rolling GitHub Release, and owns deduplicated issue creation, revalidation, and closure.

---

## Problem Frame

Issue [#204](https://github.com/marcusrbrown/marcusrbrown.github.io/issues/204) reports a plausible live-site defect but cites `/home/runner/.agent-browser/tmp/screenshots/...`, which cannot be opened after the workflow exits. Its full-page screenshot also fails to show the affected below-fold project card, so the image does not validate the finding.

The current workflow asks a freeform agent to inspect the site, capture screenshots, and create issues in one pass. `agent-browser` writes screenshots to runner-local temporary storage, and the workflow has no step that validates, uploads, or maps those files to durable issue evidence. Existing Playwright artifacts are a separate CI path and are intentionally temporary. GitHub provides no supported API for uploading arbitrary issue attachments, and Git LFS-backed repository images are unsuitable for durable issue embeds.

The problem is therefore not a missing Markdown link. The audit needs a reliable evidence boundary between agent discovery and GitHub reporting.

---

## Key Flows

### F1. Scheduled discovery creates an evidence-backed issue

- **Trigger:** An existing scheduled Fro Bot audit reaches the visual/live category.
- **Steps:** Fro Bot inspects the configured route, viewport, and theme matrix, performs a bounded exploratory pass, and writes a structured findings manifest plus screenshots to the audit workspace. Every apparent failure is replayed once in the same run and becomes reportable only when both observations agree. A separate deterministic reporter job validates the bundle, uploads only referenced evidence to the rolling release, verifies the public assets, and creates one issue per new finding fingerprint.
- **Outcome:** Every new visual/live issue contains reproducible context and embedded screenshots that remain accessible after the runner exits.
- **Covered by:** R1-R18, R25-R31

### F2. A repeat detection updates the existing issue

- **Trigger:** A scheduled audit detects a finding whose stable fingerprint already belongs to an open issue.
- **Steps:** After same-run confirmation, the reporter validates and promotes the new evidence, updates the matching variant in the existing issue's machine-readable ledger, appends the new run and evidence, and resets that variant's pending clean-run count.
- **Outcome:** Repeated observations strengthen one evidence trail without creating duplicate issues.
- **Covered by:** R16-R18, R22, R24, R30

### F3. A maintainer requests immediate validation

- **Trigger:** An authorized maintainer posts `@fro-bot validate #N` for an open automated visual-audit issue.
- **Steps:** The reporter reads the canonical replay inputs and active variants from machine-readable issue metadata. Fro Bot replays every active route, target, viewport, theme, and reproduction state. The reporter rejects missing or malformed replay metadata, validates and promotes comparable clean evidence, comments with the result, and closes only when every active variant no longer reproduces.
- **Outcome:** A deployed fix can be verified immediately with comparable evidence instead of waiting for the next schedule.
- **Covered by:** R19-R21, R23-R27

### F4. Scheduled validation closes only after two clean observations

- **Trigger:** A scheduled audit rechecks an open automated visual-audit issue.
- **Steps:** The reporter records the first clean replay for each active variant without closing. Every active variant must receive a second consecutive clean scheduled replay; any renewed confirmed failure resets only that variant's count. After all active variants satisfy the threshold, the reporter appends the validation evidence and closes the issue.
- **Outcome:** Unattended closure resists transient rendering or network false negatives while preserving an evidence-backed audit trail.
- **Covered by:** R21-R24

### F5. Invalid or incomplete evidence fails safely

- **Trigger:** A manifest, screenshot, upload, or GitHub write does not satisfy the reporting contract.
- **Steps:** The reporter rejects invalid evidence before issue mutation and emits an actionable workflow diagnostic. Release writes are serialized. Every external mutation carries a deterministic operation key and follows a fixed checkpoint order so a later retry can discover completed assets, issue writes, comments, and state transitions without duplicating them.
- **Outcome:** The workflow fails loudly without publishing broken links or local paths and never represents a partial report as a clean audit.
- **Covered by:** R7-R9, R14-R15, R28-R30

---

## Requirements

**Audit scope and coverage**

- R1. The modernized path applies only to scheduled and manually requested visual/live findings; other Fro Bot audit categories retain their current behavior.
- R2. The visual/live audit is report-only: it may write ephemeral audit files, release assets, issues, and issue comments, but it must not edit repository source, push commits, or open remediation pull requests.
- R3. Existing schedule cadence remains unchanged. The modernized path also supports authorized manual validation through `@fro-bot validate #N`.
- R4. Every scheduled visual/live audit executes a deterministic core matrix covering `/`, `/about`, `/projects`, and `/blog` at canonical desktop and mobile viewports in light and dark modes.
- R5. Each scheduled audit adds one named preset theme to the core matrix. Preset selection rotates deterministically through all 12 presets across successive audits and records the selected preset in the manifest.
- R6. Fro Bot performs a separately bounded exploratory pass after the core matrix. Exploration may discover novel states but must not replace or silently skip the core coverage.

**Structured handoff**

- R7. A read-only discovery job writes a versioned findings manifest and all referenced screenshots beneath one run-scoped workspace directory, then hands that bundle to a separate deterministic reporter job. Fro Bot does not create, update, or close visual-audit issues directly.
- R8. Each finding records its run identity, timestamp, normalized route, finding class, stable semantic target, normalized failure signature, concise description, reproduction steps, active variant keys, canonical replay inputs, screenshot references, and whether it is a failure or validation replay. A variant key captures viewport, theme, and any reproduction state that can change the observed result.
- R9. The reporter is a required post-discovery workflow entrypoint. Before any external write, it validates the manifest schema, path containment, referenced-file existence, image decodability, non-empty dimensions, required screenshot roles, and internally consistent run/finding metadata. An invalid finding is rejected with a diagnostic rather than silently omitted.

**Screenshot evidence**

- R10. Every reported failure includes both a viewport-level context screenshot and an element-focused crop in which the affected target and symptom are visible. Each image has descriptive alt text and a caption naming its route, viewport, theme, target, and observed result; a full-page screenshot alone or image-only explanation is invalid evidence.
- R11. Evidence always covers the viewport where the finding was detected. A desktop or mobile counterpart is required when the finding class or description concerns layout, positioning, overflow, visibility, hit targets, or responsive behavior, or when the target's result differs during a canonical counterpart replay. When classification is uncertain, the reporter captures the counterpart.
- R12. Fix-validation evidence replays the original route, target, viewport, theme, and reproduction state and uses comparable framing. Issues present evidence in a fixed readable order: failing context, failing crop, then—when available—clean context and clean crop, each with a text summary rather than a side-by-side image-only layout.
- R13. The complete run bundle is retained only as a normal, time-limited Actions artifact. Only screenshots referenced by a validated failure or fix-validation result are promoted to durable storage.
- R14. Promoted screenshots use immutable, collision-resistant asset names in one published rolling GitHub Release and are not committed to the repository or Git LFS. Release mutations are serialized with a non-cancelling workflow concurrency group. Referenced assets are retained for the repository's lifetime unless an explicit maintenance action proves that no issue or comment links them.
- R15. The reporter uploads and verifies every promoted asset as a publicly retrievable image before writing the corresponding issue or comment. Runner-local paths, expiring artifact URLs, missing assets, and non-image responses must never appear as report evidence.

**Issue identity and reporting**

- R16. The reporter computes a stable issue fingerprint from normalized route, semantic target, and normalized failure signature. Run IDs, timestamps, screenshot names, and prose wording do not affect issue identity. Viewport, theme, and reproduction state form distinct variant keys beneath that issue rather than being conditionally omitted from identity.
- R17. A new fingerprint creates one issue containing a concise text description of the visible symptom, reproduction steps, ordered and captioned evidence, the source workflow-run URL, and machine-readable metadata for the fingerprint, every active variant, canonical replay inputs, clean-run counts, operation keys, and automated-versus-human state transitions.
- R18. A repeat detection updates the matching active variant in the existing open issue after same-run confirmation instead of creating a duplicate. A materially different normalized failure signature creates a separate issue even when route and target match.

**Validation and closure**

- R19. Manual validation commands are accepted only from repository actors authorized to write to the project; untrusted issue comments cannot trigger browser runs or GitHub writes.
- R20. Manual validation reads canonical inputs only from the issue's machine-readable reporter metadata and rejects missing, malformed, or manually altered metadata. A clean authorized replay of every active variant appends matching evidence and closes the issue after that single replay; a confirmed failure updates that variant and keeps the issue open.
- R21. Scheduled audits recheck every active variant of open automated visual-audit findings. Consecutive-clean counts are persisted in the issue's machine-readable variant ledger, survive retries, and require two clean scheduled replays per active variant before automatic closure.
- R22. A same-run-confirmed failure before scheduled closure resets only that variant's consecutive-clean count and keeps the issue open with current evidence. A conflicting replay or browser/network failure changes no issue state and produces a workflow diagnostic.
- R23. Every automated closure includes a final comment that embeds the clean context/crop evidence, links the validating run, and states whether closure followed a manual replay or two scheduled replays.
- R24. If a finding recurs after the reporter automatically closed it, the reporter reopens the same fingerprinted issue and appends new evidence. A human closure, `not planned` resolution, duplicate resolution, or explicit suppression is authoritative: the reporter does not reopen or mutate that issue and surfaces the suppressed recurrence only in the workflow diagnostic.

**Safety and reliability**

- R25. Browser inspection is limited to configured public `mrbro.dev` routes. The reporter reconstructs browser URLs from normalized allowlisted routes, rejects foreign absolute URLs, and permits redirects only when the final origin remains `https://mrbro.dev`. Stored replay metadata cannot expand that allowlist.
- R26. The discovery job has read-only repository permissions and no issue or release writes. The separate reporter job receives only the reads it needs plus `contents: write` for release assets and `issues: write` for reporting; it receives no pull-request or discussion write permission.
- R27. Visual evidence must not expose credentials, tokens, private browser state, local filesystem details, or unrelated runner content.
- R28. Release uploads, issue creation, comments, reopening, and closure are idempotent by run ID, fingerprint, variant key, and deterministic operation key. Every asset and issue mutation embeds or derives that key, allowing a retry to reconstruct completed checkpoints from GitHub state rather than trusting runner-local state.
- R29. Mutations follow one fixed order: validate the bundle; compute operation keys and immutable asset names; serialize, upload, and verify or reuse exact assets; locate or create the fingerprinted issue; upsert one run-marked evidence record and machine metadata; then reopen or close last. A failure stops at its checkpoint, fails the job, and is never represented as a clean audit.
- R30. A scheduled failure from either core coverage or exploration becomes reportable only after one exact-state same-run replay produces the same normalized failure signature and visible evidence. A disagreement or infrastructure failure remains ephemeral and emits a workflow diagnostic without creating or updating durable issue evidence.
- R31. Untrusted manifest values are never interpolated into shell command strings. The reporter uses argument arrays or files for subprocess/API boundaries, strips unsafe control characters, contextually escapes all issue/comment Markdown, and constructs evidence links only from reporter-verified release assets.

---

## Acceptance Examples

- AE1. **Covers R7-R10, R14-R17, R30.** Given Fro Bot detects a broken project-card image and an exact-state replay reproduces it, when the reporter processes the finding, it uploads a viewport context image and a focused card crop, verifies both public URLs return image content, and creates one issue embedding both images without a runner-local path.
- AE2. **Covers R9, R15, R29.** Given a finding references a missing crop or an upload URL returns pointer text instead of image content, when reporting runs, no issue is created or updated and the workflow reports the exact rejected evidence.
- AE3. **Covers R16-R18.** Given the same route, target, and normalized failure signature are detected in desktop/light and mobile/dark states, when both report, one issue tracks two separate variant keys; given a materially different failure signature on the same target, a separate issue is created.
- AE4. **Covers R10-R12.** Given a below-fold card failure is detected on mobile, when evidence is captured, the card is scrolled into view, appears in both the mobile context and focused crop, and receives a desktop counterpart only when the symptom may be responsive.
- AE5. **Covers R19-R20, R23.** Given an authorized maintainer posts `@fro-bot validate #204` and every active variant from intact reporter metadata is clean, when validation completes, issue #204 receives ordered, captioned clean evidence and closes with the validating run linked.
- AE6. **Covers R21-R23.** Given every active variant receives its first clean scheduled replay, the issue remains open; given every variant then receives a second consecutive clean replay, the reporter appends final validation evidence and closes it.
- AE7. **Covers R21-R22.** Given one scheduled replay is clean and the next same-run-confirmed observation reproduces the failure, the clean count resets, current failure evidence is appended, and the issue remains open.
- AE8. **Covers R24.** Given a fingerprinted issue was automatically closed after validation and the same failure returns, the reporter reopens it; given a maintainer closed the issue as not planned, the same recurrence leaves it closed and appears only in the workflow diagnostic.
- AE9. **Covers R4-R6.** Given 12 successive scheduled audits, each runs the canonical route/viewport/light/dark matrix, each selects its recorded rotating preset, and all 12 named presets are covered without removing the bounded exploratory pass.
- AE10. **Covers R13-R15.** Given a clean audit produces screenshots but no findings or validations, when the run finishes, its bundle exists only as a time-limited Actions artifact and no release assets or report issues are created.
- AE11. **Covers R28-R29.** Given release upload succeeds but the first issue write fails, when the reporting job is rerun for the same operation key, it reconstructs the upload checkpoint, reuses the verified assets, and creates exactly one issue/evidence sequence.
- AE12. **Covers R19, R25-R27, R31.** Given an unauthorized actor posts a validation command containing shell metacharacters, crafted Markdown, and a foreign URL, when the workflow receives it, no browser or reporter job runs and no external write occurs; equivalent hostile values in an authorized manifest are escaped or rejected without leaving the route allowlist.
- AE13. **Covers R1-R3.** Given an existing scheduled run executes every Fro Bot category, when the modernized visual/live category completes, it writes no source changes and hands off structured evidence while all non-visual categories and both existing schedule entries retain their prior behavior; an authorized manual validation remains available independently.
- AE14. **Covers R22, R30.** Given a scheduled observation reports a failure but its exact-state replay is clean or cannot complete, when the run ends, no issue, comment, or release asset is created and the disagreement or infrastructure failure appears in the workflow diagnostic.
- AE15. **Covers R14, R28-R29.** Given a scheduled audit and manual validation attempt to publish evidence concurrently, when both reach the reporter, the non-cancelling release concurrency group serializes their writes and each operation produces one immutable asset set and one matching issue update.

---

## Success Criteria

- Every automated visual/live finding issue embeds a retrievable context screenshot and targeted crop whose URLs return image content after the originating workflow has expired.
- No visual/live issue or validation comment contains a runner-local path, expiring Actions artifact URL, Git LFS pointer, broken image, or screenshot that omits the reported target.
- Repeated detections of one stable finding produce zero duplicate issues and retain a chronological evidence trail on the original issue.
- Distinct viewport, theme, and reproduction variants remain independently visible within one finding, and no issue closes until every active variant satisfies the applicable validation threshold.
- Manual and scheduled validation follow the defined closure policy and provide ordered, captioned, text-described clean screenshots before any automated closure.
- A transient or contradictory scheduled observation creates no durable asset or issue update unless its exact-state replay confirms the same failure.
- Clean runs promote no durable assets and create no report-only audit issues.
- Issue #204 is successfully replayed through `@fro-bot validate #204`, receives durable targeted evidence, and is updated or closed according to the observed live result.
- Existing non-visual Fro Bot audit categories and schedule cadence continue unchanged.

---

## Scope Boundaries

- No restructuring of non-visual Fro Bot audit categories in this version.
- No same-run source-code remediation, commits, branches, pull requests, or deployment actions.
- No permanent gallery or historical archive for clean audit runs.
- No GitHub Pages evidence site, third-party object store, or Git LFS evidence delivery.
- No migration of all existing visual test screenshots into the release.
- No all-presets-per-run matrix; exactly one named preset rotates into each scheduled audit.
- No automatic closure based on a single unattended scheduled clean result.
- No replacement of issue #204 merely to obtain a cleaner report; it is the rollout acceptance case.

---

## Key Decisions

- **Structured handoff over prompt-only reporting:** Fro Bot owns discovery; deterministic workflow code owns schema validation, hosting, and GitHub side effects. This removes the runner-path and partial-write failure mode instead of adding more prompt instructions around it.
- **Release assets over issue attachments, artifacts, or Pages:** GitHub has no supported issue-attachment upload API, Actions artifact links expire, and a Pages gallery adds production surface. A rolling published release provides durable public image URLs without committing generated evidence.
- **Failure and fix evidence only:** Clean-run screenshots remain ephemeral, limiting storage and report noise while preserving the complete lifecycle of actionable findings.
- **Context plus crop:** Context establishes page state; the crop proves the reported target and symptom. Neither is sufficient alone for findings such as #204.
- **Fingerprint-based issue lifecycle:** Stable identity turns repeated audits into one evolving evidence record rather than a stream of duplicate issues.
- **Finding fingerprint plus variant ledger:** Route, target, and normalized failure signature identify the issue; viewport, theme, and reproduction states remain separately tracked so deduplication never hides a failing variant.
- **Same-run failure confirmation:** Scheduled failures must reproduce once before publication, preventing one-off browser, rendering, or network conditions from becoming durable report noise.
- **Hybrid closure threshold:** Explicit maintainer-triggered validation can close immediately; unattended schedules require two clean observations to reduce false closure from transient rendering or network conditions.
- **Core matrix plus bounded exploration:** Known routes and states receive repeatable coverage without eliminating Fro Bot's ability to find novel visual defects.
- **Report-only visual audits:** Evidence gathering and remediation remain separable, keeping scheduled browser review safe and auditable.

---

## Dependencies / Assumptions

- The existing scheduled Fro Bot workflow remains the entry point and can transfer a run-scoped discovery bundle from a read-only job to a separately permissioned deterministic reporter job.
- `agent-browser` or an equivalent browser capability can capture viewport and element-focused screenshots under a caller-specified workspace directory.
- A published rolling release such as `live-audit-evidence` can host public image assets without adding a deployment or external storage service.
- Workflow permissions can be narrowed to the minimum required browser/repository reads plus `contents: write` for release assets and `issues: write` for reporting.
- The current canonical public routes remain `/`, `/about`, `/projects`, and `/blog`; route changes require updating the core matrix.
- The existing twice-daily schedule cadence remains unchanged for the first version.
- Evidence linked from open or closed issues remains retained so audit reports do not decay.
- No telemetry, private-route authentication, or user data collection is introduced.

---

## Sources / Research

- [Issue #204: fix(ui): Projects card images are broken on production](https://github.com/marcusrbrown/marcusrbrown.github.io/issues/204)
- `.github/workflows/fro-bot.yaml`
- `.github/workflows/e2e-tests.yaml`
- `.agents/skills/agent-browser/SKILL.md`
- `.agents/skills/playwright-mcp/SKILL.md`
- `tests/visual/README.md`
- `scripts/visual-artifact-manager.mjs`
- `scripts/artifact-management.mjs`
- `scripts/project-preview-refresh.ts`
- [GitHub Docs: Adding a file to an issue or pull request](https://docs.github.com/get-started/writing-on-github/working-with-advanced-formatting/attaching-files)
- [GitHub Docs: Store and share data with workflow artifacts](https://docs.github.com/actions/using-workflows/storing-workflow-data-as-artifacts)
- [GitHub Docs: REST API endpoints for release assets](https://docs.github.com/rest/releases/assets)
- [GitHub Docs: Workflow commands for job summaries](https://docs.github.com/actions/using-workflows/workflow-commands-for-github-actions#adding-a-job-summary)
