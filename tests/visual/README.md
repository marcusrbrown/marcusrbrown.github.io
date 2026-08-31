# Visual Testing Documentation

Screenshot-based visual testing for the mrbro.dev portfolio, using Playwright.

## Overview

The visual test suite captures screenshots of UI components and page layouts across themes and breakpoints. Tests verify that pages load and components render correctly.

**Note:** Tests currently use `page.screenshot({ path })` to save images. They do not use Playwright's `toMatchSnapshot()` for automated diff comparison — screenshots are captured as artifacts for manual review.

## Structure

```txt
tests/visual/
├── utils.ts                      # Shared utilities (theme setup, API mocking, stability waits)
├── components.spec.ts            # Component-level visual tests (header, footer, cards, hero, skills)
├── responsive.spec.ts            # Responsive layout tests (mobile + desktop breakpoints)
├── syntax-highlighting.spec.ts   # Code block visual tests
├── theme-system.spec.ts          # Theme toggle and switching tests
└── screenshots/                  # Generated screenshots (regenerated per run)
```

## Test Matrix

| Spec File                     | Tests  | Coverage                                      |
| ----------------------------- | ------ | --------------------------------------------- |
| `components.spec.ts`          | 13     | 6 components × light/dark + header nav states |
| `responsive.spec.ts`          | 9      | 4 pages × mobile/desktop + nav comparison     |
| `syntax-highlighting.spec.ts` | 3      | Code block light/dark + theme transition      |
| `theme-system.spec.ts`        | 3      | Toggle light/dark + theme switching           |
| **Total**                     | **28** |                                               |

## Usage

```bash
# Run all visual tests
pnpm test:visual

# Run visual tests in headed mode
pnpm test:visual:headed

# Run a specific visual test file
pnpm exec playwright test --project=visual-tests tests/visual/components.spec.ts
```

## Adding New Visual Tests

1. Use `preparePageForVisualTest(page, {theme})` for consistent setup
2. Use `waitForComponentStable(page, selector)` before taking screenshots
3. Use `setupGitHubAPIMocking(page)` for pages that fetch from GitHub API
4. Place stability checks AFTER viewport changes, not before
5. Use descriptive screenshot paths: `screenshots/{component}-{theme}-{variant}.png`

## CI Integration

Visual tests run in the `visual-regression` job in `.github/workflows/e2e-tests.yaml`. Screenshots are uploaded as artifacts on every run.

Workers are set to 1 on CI to prevent screenshot flakiness from resource contention.
