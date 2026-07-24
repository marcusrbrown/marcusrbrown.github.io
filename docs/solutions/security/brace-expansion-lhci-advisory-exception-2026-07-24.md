---
title: "Brace expansion advisory exception for the LHCI development chain"
date: 2026-07-24
category: security
module: dependency validation
problem_type: security_advisory
component: lighthouse-ci
symptoms:
  - "GHSA-mh99-v99m-4gvg affects brace-expansion@1.1.16 in the LHCI transitive chain"
root_cause: advisory_scope
resolution_type: bounded_exception
severity: high
tags: [brace-expansion, lighthouse-ci, advisory, development-tooling]
---

## Decision

`GHSA-mh99-v99m-4gvg` (`CVE-2026-14257`) reaches this repository through the dev-only transitive path:

```text
@lhci/cli -> chrome-launcher -> rimraf -> glob -> minimatch@3 -> brace-expansion@1.1.16
```

The patched `brace-expansion` `5.0.8` line cannot be forced onto `minimatch` 3. `minimatch` 3 expects the major-version and export contract of its `brace-expansion` 1.x dependency; replacing it with 5.x would cross a major boundary and can break that toolchain. The vulnerable dependency therefore remains installed; this exception does not claim patched code.

The affected chain is used only by Lighthouse CI development and validation jobs. Its configuration and test matrix inputs are fixed and repository-controlled, and it is not shipped in the SPA runtime. Pull-request jobs already execute the checked-out pull-request code, so this exception does not add a new production execution path.

The exact `pnpm-workspace.yaml` exception configuration is:

```yaml
auditConfig:
  ignoreGhsas:
    - GHSA-qwww-vcr4-c8h2
    - GHSA-mh99-v99m-4gvg
```

Only these two explicitly approved GHSA identifiers are ignored. All other moderate and high audit findings remain enforced.

## Residual risk and revisit triggers

The vulnerable dependency remains present in development tooling. Risk increases if untrusted brace or glob input is introduced, if LHCI enters production runtime, or if the repository's fixed-input assumption changes.

Remove or revisit this exception when a maintained LHCI or upstream toolchain release removes the transitive chain, or when the advisory scope changes. Revisit immediately if untrusted brace/glob input is added or LHCI enters the production runtime.
