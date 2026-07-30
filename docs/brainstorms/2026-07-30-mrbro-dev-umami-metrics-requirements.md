---
date: 2026-07-30
topic: mrbro-dev-umami-metrics
---

# mrbro.dev Umami Metrics

## Summary

Add self-hosted Umami analytics to mrbro.dev for route traffic and sanitized interaction metrics. The integration uses a thin typed event layer, honors Do Not Track, and publishes a complete privacy disclosure without presenting a consent banner.

---

## Problem Frame

mrbro.dev has no working production analytics. Its existing analytics abstraction buffers events behind consent state, but the site offers no consent control and the transport sends no data to a metrics service. Several event families also describe sections and behaviors that no longer exist.

The existing Umami server at `metrics.fro.bot` already measures Systematic and dev-like using a cookieless, self-hosted model. mrbro.dev needs comparable traffic and conversion evidence without collecting visitor-authored data or preserving the existing abstraction's unused session, queue, error, performance, and consent machinery.

---

## Actors

- A1. Visitor: Browses mrbro.dev and may trigger anonymous pageview or interaction events.
- A2. Site operator: Enables analytics, reviews aggregate metrics, and maintains the public privacy disclosure.
- A3. Metrics service: Receives permitted events on infrastructure controlled through `metrics.fro.bot`.

---

## Key Flows

- F1. Anonymous pageview capture
  - **Trigger:** A1 loads or navigates to a route while analytics is enabled.
  - **Actors:** A1, A3
  - **Steps:** The tracker checks Do Not Track, removes search and hash data, and records the normalized route when collection is permitted.
  - **Outcome:** A2 can measure aggregate route traffic without query strings, fragments, cookies, or persistent identifiers.
  - **Covered by:** R1-R7
- F2. Sanitized interaction capture
  - **Trigger:** A1 performs an allowlisted action such as viewing a section, opening a project, changing the theme, or following a contact link.
  - **Actors:** A1, A3
  - **Steps:** The site maps the action to a fixed event name and bounded categorical properties before sending it to Umami.
  - **Outcome:** A2 can compare meaningful engagement without receiving free-form visitor data.
  - **Covered by:** R8-R12
- F3. Fail-closed analytics launch
  - **Trigger:** The analytics site ID is absent, Do Not Track is enabled, or shared retention has not been verified.
  - **Actors:** A1, A2
  - **Steps:** The tracker remains absent or suppresses collection while the rest of the site continues normally.
  - **Outcome:** Missing analytics prerequisites never degrade the visitor experience or create an inaccurate privacy claim.
  - **Covered by:** R2, R3, R6, R13, R14, R22

---

## Requirements

**Activation and privacy**

- R1. Analytics must use the self-hosted Umami service at `metrics.fro.bot`; no third-party analytics provider may receive visitor data.
- R2. Analytics must be disabled when its public website identifier is absent, including local development and unconfigured builds.
- R3. Analytics must honor the browser Do Not Track signal by sending no pageview or custom-event data when DNT is enabled.
- R4. Analytics must use no cookies, persistent identifiers, fingerprinting, cross-site tracking, query strings, or URL hashes.
- R5. Analytics must not collect names, email addresses, visitor-authored text, raw URLs, error messages, or other personally identifiable information.
- R6. Production analytics must remain disabled until a version-controlled verification artifact confirms that the shared metrics service enforces 13-month rolling retention.
- R7. mrbro.dev must publish a `/privacy` page linked from the global site footer that documents the complete collection scope, exclusions, DNT behavior, IP and approximate-location processing, infrastructure ownership, and 13-month retention policy.

**Pageviews and interactions**

- R8. Aggregate pageviews must cover the site's public routes and individual blog posts exactly once per initial load or client-side navigation, including back and forward navigation but excluding same-route rerenders.
- R9. Passive engagement tracking must include fixed section impressions and exclude hover events.
- R10. Custom events must cover relevant navigation, project, theme, contact, external-profile, and blog-card interactions using fixed event names.
- R11. Custom-event properties must be selected from explicit categorical allowlists, including known route, section, action, source, project, theme, contact-method, and destination values.
- R12. The event model must reject or make unrepresentable arbitrary strings such as search queries, full URLs, error text, and unbounded runtime values.

**Migration and reliability**

- R13. The existing analytics abstraction must be replaced by a minimal typed Umami event layer rather than retrofitted with a new transport.
- R14. Analytics loading or transmission failures must not block rendering, navigation, theme changes, or other visitor interactions.
- R15. Obsolete session, consent, queue, error, performance, search, download, skill, and hover tracking must be removed unless a current rendered surface requires a bounded replacement.
- R16. Existing live analytics call sites must either migrate to the sanitized taxonomy or be removed; no silent no-op tracking APIs may remain.

**Verification and disclosure accuracy**

- R17. Automated checks must prove that unconfigured builds omit the tracker and that configured builds include the required privacy controls.
- R18. Browser verification must prove route pageviews and representative custom events reach the intended Umami website without exposing prohibited values.
- R19. Browser verification must prove that enabling Do Not Track suppresses pageview and custom-event requests; loading the static tracker script remains permitted under the Systematic model.
- R20. Every event-name or categorical-property addition must update the typed allowlist and privacy-page inventory in the same change.
- R21. The deployed site must restrict executable analytics scripts and analytics network connections to `self` and `metrics.fro.bot`.
- R22. Changes to metrics-service ownership, processing behavior, or retention invalidate the prior verification and require analytics to remain disabled until reverified.

---

## Acceptance Examples

- AE1. **Covers R2, R14, R17.** Given a build without an analytics website identifier, when a visitor loads any route, no Umami tracker or request is present and the page behaves normally.
- AE2. **Covers R3, R19.** Given a configured production build and a browser with Do Not Track enabled, when the visitor navigates and interacts with the site, the static tracker script may load but no pageview or custom-event request is sent.
- AE3. **Covers R4, R8.** Given a visit to `/blog/example?ref=campaign#section`, when a pageview is recorded, the analytics path contains neither the query string nor the hash.
- AE4. **Covers R10-R12, R18.** Given a visitor opens a known project from the projects section, when the event is recorded, it contains only the allowlisted event name and categorical project, action, and source values.
- AE5. **Covers R5, R12.** Given arbitrary error text, a search query, or a full outbound URL, the typed analytics interface provides no valid way to submit that value.
- AE6. **Covers R6, R7, R22.** Given that 13-month retention lacks a current version-controlled verification artifact, the production tracker remains disabled and the privacy page does not claim active analytics under that policy.

---

## Success Criteria

- The Umami dashboard records accurate traffic for every public route and individual blog post after launch.
- The dashboard receives section impressions and the approved interaction families with only bounded categorical properties.
- The site operator can compare content discovery, project interest, and contact intent without inspecting visitor-level records.
- DNT-enabled visitors and builds without an analytics website identifier generate no analytics requests.
- The privacy page accurately describes every collected field, event family, exclusion, processor, and retention rule.
- The dormant analytics framework and stale event taxonomy are removed rather than carried alongside the Umami integration.
- Planning can derive implementation units without inventing event scope, privacy behavior, launch gating, or migration boundaries.

---

## Scope Boundaries

- No consent banner or visitor preference prompt.
- No raw search queries, errors, URLs, performance payloads, visitor-authored text, or user/session profiles.
- No hover tracking, replay, heatmaps, advertising attribution, fingerprinting, or cross-site tracking.
- No embedded analytics dashboard or public metrics display on mrbro.dev.
- Shared-server retention enforcement and existing Systematic/dev-like disclosure updates are separate coordinated work.
- No compatibility layer for obsolete analytics APIs after their live call sites are migrated or removed.

---

## Key Decisions

- **Narrow telemetry exception:** Cookieless, self-hosted aggregate analytics may run without visitor opt-in only while every approved privacy condition remains true.
- **Thin typed adapter:** Preserve useful React integration and categorical safety without retaining the current analytics manager's unused machinery.
- **Modernized taxonomy:** Keep relevant behavioral coverage, but remove stale families and prohibit free-form payloads.
- **Section views without hover:** Measure content reach while avoiding noisy, pointer-dependent events.
- **Fail-closed launch:** Analytics remains disabled until both the site identifier and current version-controlled retention evidence are available.
- **Separate retention work:** Server enforcement and cross-repo privacy reconciliation do not share the mrbro.dev implementation PR.

---

## Dependencies / Assumptions

- A dedicated Umami website entry and public website identifier are available for mrbro.dev.
- `metrics.fro.bot` continues to be controlled by the same operator and does not forward analytics data to third parties.
- The shared service's documented behavior for cookies, monthly identifier rotation, IP handling, and local approximate-location derivation remains accurate.
- A separate coordinated work item will enforce 13-month rolling retention and produce the version-controlled verification artifact before mrbro.dev analytics is enabled.

---

## Outstanding Questions

### Deferred to Planning

- [Affects R8][Needs research] How does the deployed Umami tracker version handle client-side route changes, and what explicit integration is required for React Router navigation?
- [Affects R10-R12][Technical] What exact event names and property unions best map the approved taxonomy onto current rendered surfaces?
- [Affects R2, R17][Technical] Which existing build-time configuration mechanism should supply the public website identifier across local, CI, and production builds?
- [Affects R21][Needs research] What deployable security-policy mechanism should restrict script and connection origins on GitHub Pages?

---

## Sources / Research

- Systematic promotion and growth plan: `marcusrbrown/systematic`, `docs/plans/2026-05-27-001-feat-promotion-and-growth-plan.md`
- Systematic Umami configuration: `marcusrbrown/systematic`, `docs/astro.config.mjs`
- Systematic privacy disclosure: `marcusrbrown/systematic`, `docs/src/content/docs/privacy.mdx`
- Current analytics manager: `src/utils/analytics.ts`
- Current React tracking hooks: `src/hooks/UseAnalytics.ts`
- Current analytics call sites: `src/pages/Home.tsx`, `src/components/SmoothScrollNav.tsx`, `src/contexts/ThemeContext.tsx`
- Current analytics tests: `tests/utils/analytics.test.ts`, `tests/hooks/UseAnalytics.test.ts`
