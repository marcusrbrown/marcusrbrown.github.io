# tests/

Multi-type testing: unit (Vitest), E2E/visual/a11y (Playwright), performance (Lighthouse CI).

## Structure → Config Mapping

| Type              | Directory        | Runner                | Config                      |
| ----------------- | ---------------- | --------------------- | --------------------------- |
| Unit (components) | `components/`    | Vitest                | `vite.config.ts` (embedded) |
| Unit (hooks)      | `hooks/`         | Vitest                | `vite.config.ts`            |
| Unit (utils)      | `utils/`         | Vitest                | `vite.config.ts`            |
| E2E               | `e2e/`           | Playwright            | `playwright.config.ts`      |
| Visual            | `visual/`        | Playwright            | `playwright.config.ts`      |
| Accessibility     | `accessibility/` | Playwright + axe-core | `playwright.config.ts`      |
| Performance       | `performance/`   | Lighthouse CI         | `lhci.config.js`            |

## Key Files

- `setup.ts` — Global Vitest setup (DOM mocks, theme providers, Shiki stubbing)
- `visual/utils.ts` — Theme mocking + visual test helpers
- `e2e/base-path.spec.ts` — Smoke tests: asset loading, blank-page guard, sub-page routing
- `e2e/fixtures/` — Viewport configs + test data (2 files)
- `e2e/utils/` — Navigation and test helpers (2 files)

## Live Audit Evidence

- `scripts/live-audit-*.test.ts` — Vitest coverage for the closed contract, identity/ledger, routing and preflight, replay plans, GitHub runner, evidence/finalizer, release publication, reporter lifecycle, reporter CLI, and the local trusted legacy-adoption descriptor/parser/checkpoint/retry boundary. Use the filename pattern rather than a fixed test count.
- `scripts/fixtures/live-audit/` — Redacted real-shape GitHub issue, comment, permission, release, asset, search, and close-event fixtures.
- `e2e/live-audit-evidence.spec.ts` — Chromium evidence spec for target-visible context/crop screenshots, closed assertion replay, and bounded action replay. It is not part of the default Vitest suite.

## Test Matrices

- **Visual**: 2 themes (light/dark) × 2 breakpoints (375/1440px), ~28 tests
- **E2E**: 3 browsers (Chromium, Firefox, WebKit)
- **Accessibility**: WCAG 2.1 AA across all routes

## Coverage

- **Thresholds**: 80% statements/branches/functions/lines (enforced in Vite config)
- **Provider**: V8
- **Gap**: `hooks/` — only 3 of 9 hooks tested. Priority: `UseTheme`, `UseGitHub`

## Visual Baselines

- **Location**: `visual/screenshots/` — ~30 screenshot images
- **Note**: Screenshots are generated per-run, not compared via `toMatchSnapshot()`
- **Update**: `pnpm test:visual:update` regenerates all screenshots

## Health Dashboard Weights

| Suite         | Weight |
| ------------- | ------ |
| E2E           | 30%    |
| Unit          | 25%    |
| Accessibility | 20%    |
| Visual        | 15%    |
| Performance   | 10%    |
