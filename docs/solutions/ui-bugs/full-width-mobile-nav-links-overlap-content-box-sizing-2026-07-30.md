---
title: Full-width mobile navigation links overlap under content-box sizing
date: 2026-07-30
category: ui-bugs
module: responsive header navigation
problem_type: ui_bug
component: frontend_stimulus
related_components:
  - react
  - flexbox
  - playwright
symptoms:
  - "Adjacent mobile navigation links had overlapping hit areas at 320px"
  - "Each link rendered 80px wide inside a 72px flex item"
  - "Page-level overflow checks passed despite the interaction overlap"
root_cause: config_error
resolution_type: code_fix
severity: medium
tags:
  - flexbox
  - box-sizing
  - touch-targets
  - responsive-design
  - mobile-navigation
  - playwright
  - domrect
---

# Full-width mobile navigation links overlap under content-box sizing

## Problem

At the 320px mobile breakpoint, the header navigation fit visually within the viewport, but adjacent links had overlapping click and tap areas. Four equal-width flex items were 72px wide while each full-width link rendered at 80px because its horizontal padding was added outside the declared width.

## Symptoms

- No horizontal page overflow was reported.
- Screenshots showed the navigation fitting within the header.
- The first target ended at 96px while the next began at 88px, producing an 8px overlap.
- All four links still met the 44px minimum target height, so height-only accessibility checks passed.

## What Didn't Work

- **Checking `document.documentElement.scrollWidth`.** This proves the page fits the viewport, not that sibling interactive targets fit their flex items.
- **Relying on screenshots.** The labels and visible layout looked correct because the defect was in invisible hit-target geometry.
- **Reading `right` from Playwright's `boundingBox()`.** `boundingBox()` returns `x`, `y`, `width`, and `height`; it does not expose `right`. Calculate it as `x + width`, or measure `getBoundingClientRect()` in the browser.

## Solution

The mobile navigation flex layout gave each item one quarter of the available width. The link then used `width: 100%` plus horizontal padding:

```css
.header__nav-link {
  padding: 0 var(--nav-link-px);
  display: flex;
  align-items: center;
  min-height: 44px;
}

@media (max-width: 640px) {
  .header__nav-link {
    --nav-link-px: 0.25rem;
    width: 100%;
  }
}
```

Set the link to border-box sizing so the declared width includes its padding:

```css
.header__nav-link {
  box-sizing: border-box;
}
```

Pin the behavior with a browser geometry assertion rather than a source-code or screenshot assertion:

```ts
const navBoxes = await page.locator(".header__nav-link").evaluateAll(links =>
  links.map(link => {
    const {left, right} = link.getBoundingClientRect()
    return {left, right}
  }),
)

for (const [index, current] of navBoxes.entries()) {
  const next = navBoxes[index + 1]
  if (!next) break

  expect(current.right).toBeLessThanOrEqual(next.left)
}
```

The test failed before the fix with `Expected: <= 88` and `Received: 96`. After deployment, the targets measured `[16,88]`, `[88,160]`, `[160,232]`, and `[232,304]`: four 72-by-44-pixel targets with zero overlap.

## Why This Works

Under the default `content-box` model, `width: 100%` describes only the content box. A 72px flex item plus 4px padding on each side produces an 80px rendered box:

```text
72px content + 4px left padding + 4px right padding = 80px
```

`box-sizing: border-box` changes the sizing contract so the 72px declared width includes both padding edges. The link remains full-width and 44px tall without escaping its assigned flex item.

## Prevention

- Use `box-sizing: border-box` for full-width interactive children that add padding inside constrained flex items.
- Measure sibling DOM rectangles when validating dense responsive controls; page overflow and screenshots cannot prove non-overlap.
- Assert adjacent boundaries directly: each target's `right` edge must be less than or equal to the next target's `left` edge.
- Exercise the narrowest supported viewport, where fractional or fixed padding consumes the largest share of each flex item.

## Related Issues

- Header polish introduced the mobile grid in PR #249 (`3e2a9fe`).
- PR #250 (`c42860b`) added border-box sizing and the 320px geometry regression test.
- [Hero CTA contrast failures from theme transitions and preset derivation](./hero-cta-wcag-contrast-theme-transition-and-preset-derivation-2026-07-27.md) covers a different CSS defect on the same page shell.
