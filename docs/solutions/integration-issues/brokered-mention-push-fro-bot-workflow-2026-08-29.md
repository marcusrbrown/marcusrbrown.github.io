---
title: Brokered push lets trusted @-mention runs update same-repository PRs
date: 2026-08-29
category: integration-issues
module: Fro Bot GitHub Actions workflow
problem_type: integration_issue
component: github-actions
symptoms:
  - "@-mention runs could inspect a pull request but could not deliver a commit to its branch"
root_cause: credential_withheld
resolution_type: configuration_change
severity: medium
tags:
  - fro-bot
  - github-actions
  - pull-requests
  - brokered-push
  - trusted-head-sha
---

# Brokered push lets trusted @-mention runs update same-repository PRs

## Problem

Mention-driven Fro Bot runs previously failed closed before they could push a fix. The agent treated credentials supplied to an `issue_comment` run as withheld, so the workflow could not safely give the agent a writable Git credential (tracked in #212).

## Solution

`fro-bot/agent` `v0.105.1` adds a brokered-push path. `.github/workflows/fro-bot.yaml` resolves the PR head SHA only when the PR belongs to this repository and passes it as `trusted-head-sha`. The agent can then deliver a commit through the Git Data API while the job retains `contents: read`; it does not receive a general writable checkout credential.

```yaml
with:
  trusted-head-sha: ${{ steps.prehead.outputs.ref }}
```

## Boundaries

- Brokered writes are limited to `src/`, `docs/`, and `README.md`, `ARCHITECTURE.md`, or `STRUCTURE.md`.
- Fork PRs never receive a trust anchor: their head repository does not match `github.repository`, so `trusted-head-sha` remains empty.
- If the PR-head lookup fails or does not establish a same-repository SHA, the run remains read-only.

## Prevention

Keep the same-repository check before passing a trust anchor, and do not replace the bounded brokered-push interface with an on-disk Git credential for mention runs.

## Related Issues

- #212 — original mention-run push limitation.
