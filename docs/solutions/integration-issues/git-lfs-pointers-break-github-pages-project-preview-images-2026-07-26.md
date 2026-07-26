---
title: Git LFS pointers break GitHub Pages project-preview images
date: 2026-07-26
category: integration-issues
module: project preview asset pipeline
problem_type: integration_issue
component: tooling
symptoms:
  - "Project-preview images failed to decode in production"
  - "GitHub Pages served a ~131-byte LFS pointer as content-type image/png"
  - "Browser image naturalWidth was 0 and the error state applied"
  - "Vite copied pointer files into dist/project-previews/"
root_cause: config_error
resolution_type: config_change
severity: medium
tags:
  - github-pages
  - git-lfs
  - gitattributes
  - vite
  - deploy
  - project-previews
---

# Git LFS pointers break GitHub Pages project-preview images

## Problem

Project-preview PNGs on `/projects` were committed through Git LFS because `.gitattributes` applied a blanket `*.png` rule. GitHub Pages served the LFS pointer text instead of the image bytes, so every preview failed to decode in production.

## Symptoms

- Preview images failed to decode in production.
- Browser reported `naturalWidth: 0` and applied the image error state (`project-card__image-img--error`).
- The response was `content-type: image/png`, but the body was a 131-byte LFS pointer:
  ```text
  version https://git-lfs.github.com/spec/v1
  oid sha256:868414402d1ecbf9213e402f6598313e0eec82525f34b9b8b5e519b8ac9ddf44
  size 105397
  ```
- Local files appeared valid because the working tree contained real PNG bytes — only the committed blob and the deployed file were pointers.

## What Didn't Work

- Inspecting or opening the local PNGs: the working tree hid the bad committed blob.
- Relying on green CI: no test fetched the deployed GitHub Pages artifact, so nothing caught it.
- Treating the failure as generic image decoding: the actionable signal was a 131-byte response served as `image/png`.
- Adding `lfs: true` to the deploy checkout was rejected as the primary fix — it preserves fragile LFS coupling, consumes LFS bandwidth, and requires every deploy path to remain LFS-aware.

## Solution

Exclude web-served previews from the blanket LFS rule:

```gitattributes
# Web-served preview images must be real blobs — GitHub Pages does not resolve LFS pointers
public/project-previews/*.png filter= diff= merge= -text
```

Renormalize the committed files so they are stored as real blobs, not pointers:

```bash
git rm --cached public/project-previews/1297795539.png public/project-previews/313368595.png
git add .gitattributes public/project-previews/*.png
```

The files were already real PNGs in the working tree, so re-adding them under the override stored real blobs (131 → 105397 bytes, 130 → 96427 bytes). Visual screenshots deliberately stay in LFS:

```bash
git check-attr filter -- tests/visual/screenshots/footer-dark-theme.png
# filter: lfs
```

## Why This Works

Git LFS stores a small pointer file in Git and the binary separately. GitHub Pages serves the committed Git blob directly; it does **not** resolve LFS pointers. A web-served LFS asset therefore becomes pointer text with an image MIME type, which browsers cannot decode.

Keeping preview images as ordinary Git blobs makes the deploy pipeline LFS-agnostic: `vite build` copies actual PNG bytes into `dist/`, and GitHub Pages serves those bytes.

Verification:

```bash
git check-attr filter diff merge -- public/project-previews/1297795539.png
# filter, diff, merge all unset

git cat-file -s <committed-blob>
# 105397 or 96427 (real PNG, not a 131-byte pointer)

pnpm build
# dist/project-previews/*.png contain real PNG bytes (magic 89 50 4e 47)
```

Post-deploy production fetch returned `HTTP 200`, `content-type: image/png`, the expected byte size, and PNG magic bytes `89 50 4e 47`. Live-audit replay `30189610302` then completed clean: `validationCount 4`, `findingCount 0`, `diagnosticCount 0`, `status success`.

## Prevention

- Never store GitHub Pages web-served binaries in Git LFS.
- Scope LFS rules narrowly; explicitly exclude web-served asset directories from any blanket `*.ext filter=lfs` rule.
- Add CI validation that committed public assets are not LFS pointers:
  ```bash
  ! grep -q '^version https://git-lfs.github.com/spec/v1' public/project-previews/*.png
  ```
- Verify deployed assets with an HTTP fetch that checks status, MIME type, size, and file magic bytes — not just that the file exists.
- Remember that `ls` and local image inspection validate the working tree, not the committed or deployed artifact.
- Keep `tests/visual/screenshots/*.png` in LFS — they are test fixtures, never web-served.
- `scripts/project-preview-refresh.ts` writes previews into `public/project-previews/`; the `.gitattributes` override ensures future generated previews commit as normal blobs automatically (the pipeline self-heals).

## Related Issues

- Issue #204 (CLOSED) — the live-audit visual defect that tracked this broken preview.
- PR #202 — added the self-hosted project preview images (introduced the latent LFS exposure).
- PR #228 — the fix documented here.
- `docs/solutions/integration-issues/gist-list-api-omits-content-snapshot-empty-2026-07-18.md` — weak analogue: another external-contract/config failure where tests passed but the production artifact was invalid.
