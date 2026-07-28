---
title: "refactor: Serve /projects from a build-time snapshot"
type: refactor
status: active
date: 2026-07-28
---

# refactor: Serve /projects from a build-time snapshot

## Overview

The `/projects` section fetches `https://api.github.com/users/marcusrbrown/repos` from the browser at runtime (`src/hooks/UseGitHub.ts`). Anonymous GitHub API is rate-limited to 60 requests/hour per IP, so visitors past that budget — or on shared/CGNAT egress IPs — see "rate limit exceeded" instead of the portfolio. This converts projects to a committed build-time snapshot (`src/data/projects-snapshot.json`), generated in the existing `chore/blog-refresh` rolling-PR workflow, consumed synchronously by the hook exactly like `useBlogPosts`. The client makes zero GitHub API calls at runtime; the rate-limit failure mode is eliminated by construction.

The shipping commit is `fix(projects):` — it resolves a production defect visitors experience — even though the change is architecturally a refactor.

## Problem Frame

Runtime dependency on a rate-limited third-party API for data that only changes when Marcus ships or retags a repo. The data is effectively static between deploys, but it's fetched on every visit, so the anonymous quota (60/hr/IP) is the ceiling on how many people can view the portfolio per hour from a given egress IP. The blog already solved the identical problem with a committed snapshot; projects should follow the same architecture.

## Requirements Trace

- R1. `/projects` renders portfolio projects with no runtime GitHub API call.
- R2. A visitor never sees a rate-limit error on the projects section.
- R3. Projects data refreshes on the same daily cadence as blog + preview images, delivered through the existing rolling `chore/blog-refresh` PR that Marcus merges.
- R4. Snapshot generation is fail-safe: a transient GitHub/API failure preserves the last committed snapshot rather than shipping an empty or partial one.
- R5. Zero projects in the snapshot renders a graceful empty state, not an error.
- R6. Projects data and preview images stay in sync (same portfolio filter, same run).

## Scope Boundaries

- Portfolio-curation rules are unchanged (opt-in `portfolio` topic, `!fork && !archived && description`, site-repo self-exclusion).
- The preview-image pipeline (`scripts/project-preview-refresh.ts`) is not restructured — only the workflow gains a sibling step.
- No change to `ProjectCard`, `ProjectGallery`, or `UseProjectFilter` — they already consume `Project[]` props and are agnostic to the data source.

### Deferred to Separate Tasks

- Footer redesign: parked on branch `feat/footer-redesign` (separate work, unrelated to this fix).

## Context & Research

### Relevant Code and Patterns

- `src/hooks/UseBlogPosts.ts` — the target pattern: static `import blogSnapshot from '../data/blog-snapshot.json'`, cast once to `BlogSnapshot`, synchronous return with no loading/error state.
- `src/data/blog-snapshot.json` — shape `{posts, generatedAt, generator}`; the projects snapshot mirrors this as `{projects, generatedAt, generator}`.
- `scripts/blog-refresh.ts` — fail-safe reference: `readPreviousSnapshot()` returns a safe empty snapshot on `ENOENT`, `buildSnapshot()` preserves `previousSnapshot` on fatal error, `atomicWrite()` writes temp + rename. Uses `BLOG_REFRESH_TOKEN` (Gists API).
- `scripts/project-preview-refresh.ts` — reuse source: `fetchRepoListing()` (paginated `GET /users/:username/repos?sort=updated&per_page=100`, follows `Link rel=next` via `nextLink()`); `isPortfolioRepo()` predicate; authenticates the Repos API listing with `GITHUB_TOKEN`. Its `RefreshRepo` shape (`id, full_name, description, fork, archived, topics?`) is too narrow for `Project` — the sibling script owns a wider repo shape.
- `src/hooks/UseGitHub.ts` — current runtime hook: `transformReposToProjects()` (filter portfolio → sort by `stargazers_count` desc → map to `Project` with `imageUrl: previewImagePath(repo.id)`), local `GitHubRepo` interface, `UseGitHubReturn` (`repos, projects, loading, error, projectsLoading, projectsError, rateLimitReset, retry`), plus the fetch machinery (`fetchGitHubJsonPaginated`, session/memory caches, rate-limit header parsing).
- `src/types/index.ts` — `Project` interface (`id, title, description, url, language, stars, homepage?, topics?, lastUpdated?, imageUrl?`); the only sanctioned barrel export.
- `src/utils/preview-image-path.ts` — `previewImagePath(repoId)` → `/project-previews/<id>.png`; used to bake `imageUrl` at build time.
- `.github/workflows/blog-refresh.yaml` — runs `pnpm run blog-refresh` then `pnpm run project-preview-refresh`; diff-detection and staging currently scope `src/data/blog-snapshot.json public/project-previews/`; delivers via rolling `chore/blog-refresh` PR authored by mrbro-bot app token.
- `vite.config.ts:6-12` — `BLOG_SNAPSHOT` env aliases the snapshot import for tests; a `PROJECTS_SNAPSHOT` alias mirrors it.

### Institutional Learnings

- `docs/solutions/integration-issues/gist-list-api-omits-content-snapshot-empty-2026-07-18.md` — the closest prior art. Landmines it warns about, all applicable here: (a) **fail-safe ordering** — preserve the previous snapshot unless the new build is fully valid; (b) **atomic write** (temp + rename); (c) **authenticate the API traversal** so build-time generation itself doesn't hit the anonymous limit; (d) **real-API-shape fixtures** — the empty-snapshot masking bug happened because tests used a convenience shape while production consumed a different one. Projects tests must assert a non-empty snapshot from a realistic repo-listing shape.
- `docs/solutions/integration-issues/github-pages-spa-404-route-navigation-2026-07-26.md` — `/projects` stays an SPA route; no per-project prerender is added, so no new 404-trick surface. (Noted to confirm we are not introducing prerendered project pages.)
- `docs/blog-system.md` — confirms committed snapshot as source of truth is the sanctioned architecture for this repo.

## Key Technical Decisions

- **Snapshot stores transformed `Project[]`** (not raw repos): the client renders a ready view model with zero transform, matching `useBlogPosts`. `imageUrl` is baked via `previewImagePath(repo.id)` at build time.
- **Rename `useGitHub` → `useProjects`** (`src/hooks/UseGitHub.ts` → `src/hooks/UseProjects.ts`): the hook no longer touches GitHub at runtime; the name should tell the truth. Two consumers update (`Projects.tsx`, `Home.tsx`).
- **Sibling generator `scripts/projects-refresh.ts`**: owns the wider repo shape `Project` needs; reuses the repo-listing fetch + portfolio-filter *pattern*. The shared transform + filter + repo type is extracted to a util so the script and any remaining consumer cannot drift.
- **Authenticate with `GITHUB_TOKEN`** in the generator (same as preview-refresh's Repos API listing) so build-time generation has the 5,000/hr budget, not the anonymous 60/hr.
- **Fail-safe by construction**: read previous snapshot first; on any fetch/validation failure, preserve it and exit non-zero; atomic temp+rename write; byte-identical rebuilds don't churn `generatedAt`.

## Open Questions

### Resolved During Planning

- Snapshot shape → transformed `Project[]` (confirmed).
- Hook rename → `useProjects` (confirmed).
- Generation site → sibling `scripts/projects-refresh.ts` (confirmed).
- Commit classification → `fix(projects):` (resolves a production defect), even though structurally a refactor.

### Deferred to Implementation

- Whether the now-dead fetch helpers (`fetchGitHubJsonPaginated`, session/memory caches, rate-limit parsing) are fully unreferenced after the rename — remove only what grep confirms is orphaned; some helpers may be shared.
- Exact shared-util filename/location (`src/utils/projects.ts` vs colocated) — pick during implementation to satisfy "no barrel exports, named exports."

## Implementation Units

- [ ] **Unit 1: Projects snapshot contract + shared transform util**

**Goal:** Define the snapshot type and extract the portfolio filter + repo→Project transform into a shared, testable util that both the generator and tests import.

**Requirements:** R1, R6

**Dependencies:** None

**Files:**
- Modify: `src/types/index.ts` (add `ProjectsSnapshot` = `{projects: Project[]; generatedAt: string; generator: string}`; export the build-time repo shape the generator needs)
- Create: `src/utils/projects.ts` (the `GitHubRepo`-for-projects type, `PORTFOLIO_TOPIC`/`SITE_REPO_FULL_NAME` constants, `isPortfolioProject` predicate, `transformReposToProjects` moved verbatim from `UseGitHub.ts`)
- Test: `tests/utils/projects.test.ts`

**Approach:**
- Move `transformReposToProjects`, the local `GitHubRepo` interface, and the portfolio constants out of `UseGitHub.ts` into `src/utils/projects.ts` as named exports. Keep behavior identical (filter → sort by stars → map with `previewImagePath`).
- `ProjectsSnapshot` mirrors `BlogSnapshot`.

**Patterns to follow:** `BlogSnapshot` in `src/types/index.ts`; `src/utils/blog.ts` pure-helper style.

**Test scenarios:**
- Happy path: a listing of mixed repos → only portfolio-tagged, non-fork, non-archived, described, non-site repos survive, sorted by stars desc.
- Edge case: repo with `topics` undefined → excluded (no portfolio topic).
- Edge case: site repo carrying the portfolio topic → excluded by `full_name` match (case-insensitive).
- Happy path: each mapped `Project` has `imageUrl === previewImagePath(repo.id)` and title-cased `title`.
- Edge case: empty input → empty `Project[]`.

**Verification:** `transformReposToProjects` produces identical output to the pre-move implementation for a representative fixture; `tsc` clean.

- [ ] **Unit 2: Snapshot generator script**

**Goal:** `scripts/projects-refresh.ts` fetches the repo listing (authenticated, paginated), transforms to `Project[]`, and writes `src/data/projects-snapshot.json` fail-safe.

**Requirements:** R3, R4, R6

**Dependencies:** Unit 1

**Files:**
- Create: `scripts/projects-refresh.ts`
- Create: `src/data/projects-snapshot.json` (seeded by the first run)
- Modify: `package.json` (`"projects-refresh": "tsx scripts/projects-refresh.ts"`)
- Test: `tests/scripts/projects-refresh.test.ts`

**Approach:**
- Mirror `scripts/project-preview-refresh.ts` listing fetch (`per_page=100`, follow `Link rel=next`, `GITHUB_TOKEN` auth on `api.github.com` only) but request the wider repo fields (`id, name, full_name, description, html_url, language, stargazers_count, fork, archived, homepage, topics, updated_at`).
- Read previous snapshot first (safe empty on `ENOENT`). Build `Project[]` via Unit 1's util. On any fetch/validation failure, preserve the previous snapshot and exit non-zero. Atomic temp+rename write. Do not bump `generatedAt` when the project set is byte-identical.
- Dual CLI/library shape like the sibling scripts so tests import the builder.

**Execution note:** Test-first on the fail-safe matrix and the real-listing shape (guard against the empty-snapshot masking bug).

**Patterns to follow:** `scripts/project-preview-refresh.ts` (`fetchRepoListing`, `nextLink`, token boundary); `scripts/blog-refresh.ts` (`readPreviousSnapshot`, `atomicWrite`, fail-safe ordering).

**Test scenarios:**
- Happy path: realistic multi-page listing (real GitHub repo-object shape) with 3 portfolio repos → snapshot has exactly those 3 as `Project[]`, sorted by stars, non-empty.
- Error path: listing fetch fails (HTTP 500 / timeout) → previous snapshot preserved unchanged, non-zero exit.
- Edge case: zero portfolio repos → snapshot with empty `projects` written (valid, not an error).
- Edge case: byte-identical rebuild → `generatedAt` unchanged (no churn).
- Integration: token is sent only to `api.github.com`, never elsewhere.
- Edge case: pagination followed to exhaustion (repo beyond page 1 still included).

**Verification:** Live/seed run writes a valid `projects-snapshot.json`; a forced fetch failure leaves the committed file untouched.

- [ ] **Unit 3: Snapshot-backed hook (rename useGitHub → useProjects)**

**Goal:** Replace the runtime-fetch hook with a synchronous snapshot reader.

**Requirements:** R1, R2, R5

**Dependencies:** Unit 1, Unit 2 (needs the snapshot + type)

**Files:**
- Create: `src/hooks/UseProjects.ts` (static `import projectsSnapshot from '../data/projects-snapshot.json'`, cast to `ProjectsSnapshot`, return `{projects}` synchronously)
- Delete: `src/hooks/UseGitHub.ts`
- Modify: `src/pages/Projects.tsx`, `src/pages/Home.tsx` (consume `useProjects`)
- Test: `tests/hooks/UseProjects.test.ts` (replaces `tests/hooks/UseGitHub.test.ts`)

**Approach:**
- `useProjects` mirrors `useBlogPosts`: no `useEffect`, no state, no loading/error. Return `projects: Project[]` (and `getProjectById` only if a consumer needs it — otherwise just `projects`).
- Update the two consumers to drop destructured `projectsLoading/projectsError/retry`.

**Patterns to follow:** `src/hooks/UseBlogPosts.ts`.

**Test scenarios:**
- Happy path: hook returns the snapshot's projects in order.
- Edge case: empty snapshot → returns `[]` (drives the empty state in Unit 4).
- Integration: with `PROJECTS_SNAPSHOT` fixture env pointed at a 2-project fixture, the hook surfaces exactly those.

**Verification:** No `useEffect`/`fetch` remains in the hook; `tsc`/lint clean.

- [ ] **Unit 4: Remove dead loading/error/rate-limit UI + empty state**

**Goal:** Strip the now-unreachable runtime states from consumers and ensure zero-projects renders a graceful empty state.

**Requirements:** R2, R5

**Dependencies:** Unit 3

**Files:**
- Modify: `src/pages/Projects.tsx` (remove loading page, error page, retry button; add/confirm empty state)
- Modify: `src/pages/Home.tsx` (remove the GitHub project-fetch error branch + loading wrapper around the gallery)
- Modify: `src/hooks/UseProjects.ts` and delete orphaned helpers from the former `UseGitHub.ts` (only what grep confirms unreferenced: `fetchGitHubJsonPaginated`, session/memory caches, rate-limit parsing)
- Modify: `src/components/LoadingStates.tsx` only if a projects-specific branch is now fully orphaned (confirm first — it's a generic wrapper)
- Test: `tests/pages/Projects.test.tsx`, `tests/pages/Home.test.tsx`

**Approach:**
- Projects page renders the gallery directly from `projects`; an empty array shows the existing empty-state affordance (not an error, no retry).
- Delete dead code only after grep confirms no other referrer.

**Test scenarios:**
- Happy path: projects present → gallery renders, no loading/error affordance in the tree.
- Edge case: empty projects → empty state shown, no retry button, no rate-limit copy.
- Regression: no `rateLimitReset`/`retry`/`projectsError` referenced anywhere (grep clean).

**Verification:** Projects/Home render from static data; no rate-limit or retry UI exists; suite green.

- [ ] **Unit 5: Workflow wiring, fixture alias, docs**

**Goal:** Generate the projects snapshot in the rolling-PR workflow and support test fixtures; document the pipeline.

**Requirements:** R3, R6

**Dependencies:** Unit 2

**Files:**
- Modify: `.github/workflows/blog-refresh.yaml` (add `pnpm run projects-refresh` step after preview refresh, both using `GITHUB_TOKEN`; add `src/data/projects-snapshot.json` to the diff-detection `git diff --quiet` paths and the `git add` staging)
- Modify: `vite.config.ts` (add a `PROJECTS_SNAPSHOT` resolve alias mirroring `BLOG_SNAPSHOT`)
- Modify: `.github/ACTIONS.md`, `AGENTS.md` (structure/counts; document projects snapshot), and `docs/blog-system.md` or a short note if warranted
- Test expectation: none for the workflow YAML (validated by `actionlint` + a live/dispatch run); `vite.config` alias covered indirectly by Unit 3's fixture test

**Approach:**
- The projects snapshot rides the same commit message and rolling `chore/blog-refresh` PR as blog + previews — one PR Marcus merges.
- Keep the mrbro-bot app-token delivery and pre-push-hook behavior unchanged.

**Test scenarios:** `Test expectation: none` for YAML — `actionlint` clean + a gated `workflow_dispatch` verification run confirms the snapshot is generated and staged.

**Verification:** `actionlint` clean; a dispatched Blog Refresh run produces/updates `projects-snapshot.json` in the rolling PR alongside blog + previews.

## System-Wide Impact

- **Interaction graph:** `Projects.tsx` and `Home.tsx` switch from the async hook to the sync hook; `ProjectGallery`/`ProjectCard`/`UseProjectFilter` are untouched (they take `Project[]` props).
- **Error propagation:** the runtime error surface (rate-limit, network) is deleted; the only remaining failure is a build-time generator failure, which fails the CI job and is fixed before merge — never reaches a visitor.
- **State lifecycle risks:** fail-safe ordering + atomic write prevent a transient GitHub failure from committing an empty/partial snapshot (the documented gist-snapshot landmine).
- **API surface parity:** projects now follows the exact blog-snapshot contract; the two stay architecturally consistent.
- **Unchanged invariants:** portfolio-curation rules, preview-image pipeline, `Project` shape consumed by the gallery, and the rolling-PR delivery mechanism are all unchanged.

## Risks & Dependencies

| Risk | Mitigation |
| --- | --- |
| Empty-snapshot masking bug (tests pass on a convenience shape while the real listing differs) | Fixtures use real GitHub repo-object shape; a test asserts a non-empty snapshot from a realistic listing. |
| Transient GitHub failure overwrites good data | Read-previous-first + preserve-on-failure + atomic write; generator exits non-zero rather than writing empty. |
| Stale projects between daily refreshes | Accepted: portfolio changes are low-frequency; `workflow_dispatch` allows an on-demand refresh, and the data is never worse than the last merge. |
| Dead-code removal breaks a shared helper | Remove only grep-confirmed orphans; keep anything still referenced. |

## Sources & References

- Related code: `src/hooks/UseBlogPosts.ts`, `scripts/blog-refresh.ts`, `scripts/project-preview-refresh.ts`, `.github/workflows/blog-refresh.yaml`
- Institutional learning: `docs/solutions/integration-issues/gist-list-api-omits-content-snapshot-empty-2026-07-18.md`
- Prior art: build-time blog snapshot + project-preview refresh (this session's PRs #238–#242)
