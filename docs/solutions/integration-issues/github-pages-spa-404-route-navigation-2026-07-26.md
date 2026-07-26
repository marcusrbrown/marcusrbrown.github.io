---
title: GitHub Pages SPA routes 404 on direct load until the client restores them
date: 2026-07-26
category: integration-issues
module: live-audit deterministic navigation
problem_type: integration_issue
component: tooling
symptoms:
  - "Direct GET of /about, /projects, or /blog returns HTTP 404 from GitHub Pages"
  - "Deterministic replay/navigation aborts on the initial 404 before any assertion runs"
  - "curl of a non-root route returns the 404.html redirect shell, not the app"
root_cause: wrong_api
resolution_type: code_fix
severity: medium
tags:
  - github-pages
  - spa
  - routing
  - playwright
  - live-audit
  - 404-redirect
---

# GitHub Pages SPA routes 404 on direct load until the client restores them

## Problem

Automated tooling (the live-audit deterministic replay navigator) that visited non-root SPA routes directly — `/projects`, `/about`, `/blog` — received a GitHub Pages HTTP 404 and aborted before running any assertion, even though those routes work fine for real users.

## Symptoms

- Direct `GET https://mrbro.dev/projects` returns HTTP 404 (GitHub Pages has no such file).
- A navigator that rejects any response `>= 400` aborts on that initial 404, before the SPA restores the route client-side.
- `curl` of a non-root route returns the `404.html` redirect shell, not the rendered app.

## What Didn't Work

- Navigating straight to `https://mrbro.dev/<route>` and waiting for content: the 404 fires first and the deterministic navigator treats it as a hard failure.
- Assuming the route is "broken" because curl 404s: real browsers recover via the redirect trick, so the route is actually fine — the naive check is what's wrong.

## Solution

This site uses the [spa-github-pages](https://github.com/rafgraph/spa-github-pages) redirect trick: `public/404.html` encodes the original path into a query string and redirects to root (`/?p=/projects`), then `index.html` restores it via `history.replaceState`.

Deterministic tooling must enter through the same door — navigate via the `?p=` entry and then verify the restored pathname:

```ts
// Enter non-root routes through the root redirect entry, not the bare path.
await page.goto(`https://mrbro.dev/?p=${encodeURIComponent(route)}`)
// After client restore, assert the final same-origin pathname matches the allowlisted route.
await page.waitForFunction((r) => new URL(location.href).pathname === r, route)
// Keep rejecting genuine error responses on the root document.
```

Root (`/`) is loaded directly; only non-root allowlisted routes use `?p=`.

## Why This Works

GitHub Pages is static file hosting with no server-side SPA fallback. A direct request for `/projects` has no matching file, so Pages serves `404.html`. The redirect trick converts that 404 into a root load carrying the intended path, which the client router then restores. Entering through `?p=` means the tool exercises the exact path a real browser takes, so the initial response is a 200 root document and the final pathname is the real route — no spurious 404 abort, while genuine error responses on the root document are still rejected.

## Prevention

- Any deterministic navigator, crawler, or E2E check against a GitHub Pages SPA must navigate non-root routes via the `?p=` redirect entry, not the bare path.
- Verify the restored `location.pathname` equals the expected route after client hydration, rather than trusting the initial HTTP status.
- Keep an allowlist of real routes so the navigator never follows `?p=` into an unintended path.
- Direct `/` loads are fine; only non-root routes need the redirect entry.

## Related Issues

- Memory #7007 records this as the deterministic-navigation rule for the live-audit system.
- `docs/blog-system.md` documents the same 404-trick for prerendered `/blog/<slug>` pages (which ARE real 200s, unlike the SPA shell routes).
