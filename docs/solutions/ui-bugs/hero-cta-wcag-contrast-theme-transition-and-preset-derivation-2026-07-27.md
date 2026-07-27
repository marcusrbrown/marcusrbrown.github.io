---
title: Hero CTA fails WCAG AA contrast via theme-transition interpolation and preset-primary derivation
date: 2026-07-27
category: ui-bugs
module: landing page hero CTA / theme tokens
problem_type: ui_bug
component: frontend
symptoms:
  - "axe-core color-contrast (serious) on the hero CTA while the theme picker is open"
  - "Accessibility Tests CI job fails intermittently and passes on rerun"
  - "White CTA text on light-blue background below 4.5:1 under some presets (settled state)"
  - "CTA hover background fails contrast against white text"
root_cause: logic_error
resolution_type: code_fix
severity: medium
tags:
  - accessibility
  - wcag
  - color-contrast
  - theme
  - css-transition
  - cta
  - flaky-ci
---

# Hero CTA fails WCAG AA contrast via theme-transition interpolation and preset-primary derivation

## Problem

The home-page hero primary CTA (`.hero-cta-button--primary`, "View My Work") intermittently — and under some presets permanently — violated WCAG 2.1 AA contrast. White text rendered on blue backgrounds below the required 4.5:1 ratio. Three distinct mechanisms produced sub-AA states.

## Symptoms

- During theme transitions, `background: var(--color-primary)` interpolated through lighter blues, reaching ~**4.36:1** (`#3a72ed`) and ~**3.8:1** (`#4b7eee`) against white.
- Preset themes injected light-blue primaries (e.g. `#90caf9` ≈ **1.75:1**) that failed in the **settled** state, not just transiently.
- Hover used `var(--color-accent)` (`#0ea5e9` ≈ **2.77:1**) — a fixed hover failure.
- axe-core reported `color-contrast` (impact: serious) while the theme picker was open.
- The Accessibility Tests CI job failed intermittently; unrelated PRs #225 and #229 passed on rerun — a flaky-CI tax.

## What Didn't Work

- **Pinning the token only in `:root` and `[data-theme="light"]`.** The dark block still derived `--color-cta-primary-bg: var(--color-primary)`, so preset primaries leaked through. Contrast-critical tokens must be pinned in **every** theme block. (Fro Bot caught this as a blocking finding on the first commit.)
- **Relying on the existing a11y test.** It covered the theme-picker-open state but not hover or preset-selected states, so those failures were invisible to the suite until review reasoning surfaced them.
- **Assuming AA-passing endpoints are enough.** A CSS `transition` on `background-color` interpolates through intermediate colors; both endpoints being AA-safe does not prevent a failing mid-transition frame.

## Solution

Define fixed, AA-passing CTA colors in `:root`, `[data-theme="light"]`, and `[data-theme="dark"]` (`src/styles/themes.css`):

```css
--color-cta-primary-bg: #1d4ed8;        /* 6.86:1 on white */
--color-cta-primary-bg-hover: #1e40af;  /* ~8.69:1 on white */
```

Use them for the CTA (`src/styles/landing-page.css`):

```css
.hero-cta-button--primary {
  background: var(--color-cta-primary-bg, var(--color-primary));
  color: white;
}

.hero-cta-button--primary:hover {
  background: var(--color-cta-primary-bg-hover, #1e40af);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(37, 99, 235, 0.4);
}
```

The CTA intentionally stays fixed blue across all presets. Conversion-critical legibility takes priority over per-preset color matching — an accepted trade-off. This also fixes the latent light-preset settled-state failures for free.

## Why This Works

- The CTA background no longer derives from the runtime-injected preset primary (`ThemeContext.tsx` sets `--color-primary` via `root.style.setProperty`), so a light preset can no longer flow into a white-text element.
- Both resting (`#1d4ed8`, 6.86:1) and hover (`#1e40af`, ~8.69:1) are fixed AA-compliant values.
- The animated property can no longer interpolate through the light blues that produced the sub-AA frames, because its start and end are the same fixed token in every theme.
- Darker-on-hover adds contrast headroom and reads as a natural affordance.

## Prevention

- Pin contrast-critical tokens as **fixed values in every theme block** — not just default/light.
- Never derive a white-text element's background from a runtime-injected or preset color without an AA clamp.
- Treat CSS transitions as paths through intermediate colors, not just endpoint swaps: guard the animated property or restrict it to an AA-safe range/hue.
- Extend accessibility coverage to **hover and preset-selected** states, not only the default or theme-picker-open state.
- Watch for "passes on rerun" accessibility failures — a timing-dependent contrast dip during a transition is a real defect, not just test flake.

## Related Issues

- Issue #230 (CLOSED) — the a11y contrast defect this fixes.
- PR #231 — the fix documented here.
- PRs #225, #229 — unrelated PRs blocked by the transient flake before the fix.
- Issue #191 / PR #198 — earlier, separate hero-CTA problem (mobile box-sizing overflow); same element, different defect class.
