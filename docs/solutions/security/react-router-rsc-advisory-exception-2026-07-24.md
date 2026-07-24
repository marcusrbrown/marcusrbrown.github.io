---
title: "React Router RSC advisory exception for the static SPA"
date: 2026-07-24
category: security
module: dependency validation
problem_type: security_advisory
component: react-router
symptoms:
  - "GHSA-qwww-vcr4-c8h2 nominally includes React Router 7.18.0"
root_cause: advisory_scope
resolution_type: bounded_exception
severity: moderate
tags: [react-router, react-server-components, rsc, advisory, static-spa]
---

## Decision

`GHSA-qwww-vcr4-c8h2` nominally includes React Router `7.18.0`. The exploit precondition is React Server Components (RSC) handling through the unstable RSC APIs or React Router framework/server mode; a client-only SPA does not satisfy that precondition.

This site is a static client SPA. Runtime navigation uses client routing, and the build-time prerender path uses `StaticRouter` only to render static HTML. It does not enable React Server Components or React Router framework/server mode, so the advisory is not applicable to the current deployment.

The exact `pnpm-workspace.yaml` exception configuration is:

```yaml
auditConfig:
  ignoreGhsas:
    - GHSA-qwww-vcr4-c8h2
    - GHSA-mh99-v99m-4gvg
```

## Guard behavior

`pnpm run security:react-router-rsc` runs an executable, fail-closed boundary check before `pnpm audit`. It reads the bounded list of tracked production source/config files, the root manifest, and tracked non-excluded production package manifests, then rejects prohibited RSC or framework/server dependencies, server-mode filenames, prohibited AST package boundaries, `use server` directives, and the exact React Router 7.18 unstable RSC API family. It ignores generated, vendor, public, documentation, test, and agent-metadata paths. Listing, reading, manifest validation, bounds, and source parsing failures are non-zero failures. Diagnostics contain only safe relative paths and concise reasons.

This decision and its executable guard cover only the React Router GHSA. The separate LHCI `brace-expansion` exception is documented independently. Other advisories remain subject to the existing audit policy.

## Residual risk and revisit triggers

The exception relies on the guard continuing to identify every production entry into RSC or framework/server mode. A missed future entry or advisory-scope change could make the exception unsafe.

Revisit this decision if RSC/server/framework mode is introduced, a React Router v8 migration begins, or upstream ships a maintained v7 fix or changes the advisory scope.
