# Analytics operator runbook

## Current state

**Disabled.** As of July 31, 2026, the repository variable `UMAMI_WEBSITE_ID` must remain unset. The self-hosted Umami service at `metrics.fro.bot` currently retains data indefinitely, so production collection is not approved. Separate work in `marcusrbrown/infra` must enforce 13-month rolling retention and publish version-controlled evidence before activation review.

This repository's feature work does not set the variable and must not be described as production analytics activation. With the variable unset, the production build contains no analytics tracker.

## Architecture and data flow

1. The GitHub repository variable `UMAMI_WEBSITE_ID` is mapped to `VITE_UMAMI_WEBSITE_ID` only on the `Build project` step in `.github/workflows/deploy.yaml`.
2. Vite injects exactly one tracker tag only for a configured production build. Development builds and production builds without the variable emit no tag.
3. `AnalyticsTracker` is mounted inside React Router and sends manual pageviews from normalized `location.pathname`. Umami auto-pageviews are disabled.
4. Interaction events go through the typed catalog/adapter in `src/utils/analytics.ts` and are sent to the self-hosted collector at `https://metrics.fro.bot`.
5. The `/privacy` page reads the same build-time enabled boolean and the catalog's privacy metadata. Its status must agree with the live build artifact.

## Privacy contract

When enabled, collection is limited to normalized pathnames, coarse Umami metadata, approximate location derived locally, a one-way monthly-rotating visitor hash, and the bounded categorical event catalog. Raw IP addresses are not stored.

The contract is:

- Do Not Track suppresses both pageviews and custom events.
- No cookies, names, email addresses, user-authored text, PII, raw URLs, query strings, URL hashes, raw IP storage, persistent cross-month identifiers, fingerprinting, cross-site tracking, sharing, or sale.
- Search queries, error strings, and custom user-authored theme values are not collected.
- The event catalog is bounded and typed. Current event families are: `navigation`, `section_view`, `project_open`, `blog_open`, `contact_open`, `external_profile_open`, and `theme_change`. Properties are restricted to approved destinations, mechanisms, actions, sources, snapshot-backed project IDs and blog slugs, contact method, profile destination, theme mode, and committed preset ID.
- The processor is self-hosted at `metrics.fro.bot` and is not a third-party analytics processor.
- A 13-month maximum retention target applies only after version-controlled infrastructure evidence proves rolling cleanup and enforcement. It is not the current state.

## Preconditions for activation

Activation is a deliberate human gate. Do not set `UMAMI_WEBSITE_ID` until all of the following are recorded and reviewed:

- A version-controlled `marcusrbrown/infra` evidence artifact is pinned to the exact deployed infrastructure commit and exact deployed Umami version.
- The evidence proves 13-month rolling cleanup and enforcement, not merely a configuration intent or an unverified dashboard setting.
- Service ownership, processing behavior, and retention match this disclosure and the `/privacy` page.
- The exact `mrbro.dev` repository commit and GitHub Pages deployment to activate are identified.
- The repository variable is still unset immediately before the activation review.

## Go/no-go matrix

Every row must pass. Any mismatch is **NO-GO**.

| Check | PASS condition |
| --- | --- |
| Retention evidence | Version-controlled evidence is pinned to the deployed infra commit and Umami version and proves 13-month rolling cleanup/enforcement. |
| Variable state | `UMAMI_WEBSITE_ID` is unset during review; it is set only after approval and contains the approved public site ID. |
| Built tag | The activation build has exactly one `https://metrics.fro.bot/script.js` tag with `data-website-id`, `data-do-not-track="true"`, `data-exclude-search="true"`, `data-exclude-hash="true"`, and `data-auto-pageview="false"`. |
| `/privacy` status | The live page reports analytics enabled for the same build that contains the tracker. |
| DNT suppression | Under Do Not Track, neither a pageview nor a custom event is sent and no collector record is created. |
| Configured collector smoke | One controlled `/privacy` pageview and one approved catalog event arrive with the expected route and exact categorical properties. |
| Query/hash exclusion | The observed pageview is the normalized pathname only; no query string or hash reaches the collector or event properties. |

## Activation procedure

This procedure is future-facing and gated. Do not use it while retention evidence is incomplete. Do not place a real website ID in this document.

1. Verify the preconditions and complete the go/no-go matrix. Record the exact infra commit, Umami version, evidence path/hash, site commit, and deployment.
2. After approval, set the repository variable `UMAMI_WEBSITE_ID` to the approved public site ID. Do not expose it as a secret or at workflow/job scope.
3. Dispatch or await the deploy workflow and identify the resulting GitHub Pages deployment.
4. Inspect the live document head. Confirm the exact tracker URL, one tag only, the required privacy attributes, and the expected `data-website-id`.
5. Open `/privacy` without a query string or hash. Confirm that its status says analytics are enabled and that the disclosure matches the reviewed evidence.
6. Run one controlled smoke sequence only: one `/privacy` pageview and one `navigation` event with `destination: "privacy"` and `method: "route_link"`. Confirm the pageview is exactly `/privacy`, the event properties are exactly the approved categorical values, and neither query strings nor hashes appear.
7. Repeat the same controlled sequence with Do Not Track enabled. Confirm that no new pageview or custom-event records are created.
8. Complete the activation record below. If any check differs from the matrix, stop and roll back rather than interpreting partial success as activation.

## Activation record template

```text
mrbro.dev commit/deploy:
Infra commit:
Umami version:
Retention evidence path/hash:
Review date:
Reviewer:
Repository variable state before review:
Repository variable state after approval:
Live tag result:
/privacy result:
DNT suppression result:
Configured collector smoke result:
Query/hash exclusion result:
Rollback evidence:
Notes:
```

## Rollback

1. Remove `UMAMI_WEBSITE_ID` from repository variables.
2. Redeploy the site through the normal Pages workflow.
3. Verify that the live artifact has no tracker tag and `/privacy` reports analytics disabled.
4. Verify that no new pageviews or custom events are sent.

Stale GitHub Pages output or disagreement between the live tag and `/privacy` is an incident. Rollback is incomplete until the live artifact is corrected and the disabled state is verified.

## Reverification triggers

Repeat the preconditions and go/no-go review after any change to:

- the Umami version or tracker script behavior;
- infrastructure ownership, processing, or retention behavior;
- the version-controlled retention evidence;
- the website ID or collector endpoint;
- the `/privacy` disclosure or event catalog.

## Local and CI verification

Use an unconfigured build for routine verification. Do not set `VITE_UMAMI_WEBSITE_ID` locally or in CI for these checks.

```bash
unset VITE_UMAMI_WEBSITE_ID
pnpm run check-types
pnpm exec vitest run tests/utils/analytics.test.ts tests/scripts/analytics-config.test.ts
pnpm run build
pnpm exec playwright test tests/e2e/analytics.spec.ts --project=chromium-desktop
```

Source/state-machine tests may stub a ready `window.umami` on the unconfigured build. Configured-like integration tests fulfill a local fixture tracker script and collector through Playwright interception. All `metrics.fro.bot` traffic is intercepted, so no test reaches production. Tests cover DNT, normalized routes, typed/declarative events, outage/readiness, CSP denial, and 404 restoration.
