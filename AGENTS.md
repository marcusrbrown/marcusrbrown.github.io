# AGENTS.md

**Generated:** 2026-03-10 | **Commit:** ee5f670 | **Branch:** main

## Overview

Developer portfolio — React 19+, TypeScript strict, Vite 7+, pure ESM. Deployed to GitHub Pages at mrbro.dev.

## Structure

```
src/
├── components/    # 18 React components (see components/AGENTS.md)
├── hooks/         # 11 custom hooks — PascalCase files! (see hooks/AGENTS.md)
├── contexts/      # ThemeContext — single provider wrapping App
├── pages/         # 5 route pages: Home, Blog, Projects, About, BlogPostPage (/blog/:slug)
├── utils/         # 13 utilities — heavily theme-oriented (see utils/AGENTS.md)
├── types/         # TypeScript types, barrel export via index.ts
├── schemas/       # theme + blog-frontmatter schemas for runtime validation
└── styles/        # Global CSS
scripts/           # 20 build/test automation scripts (see scripts/AGENTS.md)
public/project-previews/ # Committed generated GitHub social-card preview assets
tests/             # Multi-type test infrastructure (see tests/AGENTS.md)
.agents/
└── skills/        # Agent skill definitions (agent-browser, playwright-mcp)
.ai/plan/          # Feature implementation plans (reference only)
docs/              # solutions/ = documented fixes by category w/ YAML frontmatter (module, tags, problem_type); plus brainstorms/, plans/, blog-system.md
.github/
├── workflows/     # 8 workflows: deploy, ci, e2e-tests, performance, fro-bot, blog-refresh (including preview-image refresh), renovate, copilot-setup-steps
├── actions/setup/ # Reusable CI setup action (Node 24, pnpm, Playwright)
└── hooks/         # Copilot hooks (pre-tool-use guardrails)
examples/          # Usage examples (button-form-styles, use-theme)
```

## Where to Look

| Task | Location | Notes |
| --- | --- | --- |
| Theme system | `src/contexts/ThemeContext.tsx` → `src/hooks/UseTheme.ts` → `src/utils/preset-themes.ts` | 300+ line context, 10+ preset themes |
| Add component | `src/components/` | PascalCase `.tsx`, no barrel exports |
| Add hook | `src/hooks/` | **PascalCase** filenames: `UseMyHook.ts` |
| Add route | `src/App.tsx` | React Router v7 Routes |
| GitHub API | `src/utils/github.ts` → `src/hooks/UseGitHub.ts` | Pure fetch, no external deps |
| Syntax highlighting | `src/utils/syntax-highlighting.ts` → `src/hooks/UseSyntaxHighlighting.ts` | Shiki, externalized in build |
| Build analysis | `scripts/analyze-build.ts` | Bundle size budgets + CI summaries |
| Test dashboard | `scripts/test-dashboard.mjs` | Aggregated health scoring |
| CI/CD | `.github/workflows/deploy.yaml` | Main pipeline: lint → test → build → deploy |
| E2E CI | `.github/workflows/e2e-tests.yaml` | Visual, accessibility, functional E2E jobs; PR notification |
| Agent skills | `.agents/skills/` | Browser automation skill definitions (`agent-browser`, `playwright-mcp`) |
| Visual baselines | `tests/visual/screenshots/` | 32 baseline images |

## Code Map (Key Symbols)

| Symbol | Type | Location | Role |
| --- | --- | --- | --- |
| `ThemeProvider` | Component | `src/contexts/ThemeContext.tsx:84` | App-wide theme context, CSS custom property injection |
| `useTheme` | Hook | `src/hooks/UseTheme.ts:43` | Compound return: 17 properties for theme control |
| `UseThemeReturn` | Interface | `src/hooks/UseTheme.ts:5` | Contract for useTheme hook |
| `AppContent` | Component | `src/App.tsx:13` | Routes + layout |
| `detectSystemPreference` | Function | `src/contexts/ThemeContext.tsx:57` | System dark/light detection |
| `presetThemes` | Constant | `src/utils/preset-themes.ts:15` | 12 preset theme definitions |

## Conventions (Deviations Only)

- **Hook filenames are PascalCase**: `UseTheme.ts`, NOT `useTheme.ts`
- **No barrel exports** except `src/types/index.ts` — all imports are direct file paths
- **ESLint flat config**: `eslint.config.ts` — NOT `.eslintrc.*`
- **YAML extension**: `.yaml` — NOT `.yml`
- **Shared configs**: ESLint (`@bfra.me/eslint-config`), TSConfig (`@bfra.me/tsconfig`), Prettier (`@bfra.me/prettier-config/120-proof`)
- **Vite embeds Vitest config**: No separate `vitest.config.ts`
- **SWC compiler**: Uses `@vitejs/plugin-react-swc`, not Babel
- **Build externals**: Shiki packages externalized, custom chunk splitting (vendor/shiki/highlight)
- **verbatimModuleSyntax**: Enforced — use `import type` for type-only imports
- **erasableSyntaxOnly**: Enforced in TypeScript config

## Anti-Patterns (This Project)

- **No `any` types** — TypeScript strict mode, no `as any`, `@ts-ignore`, `@ts-expect-error`
- **No CommonJS** — Pure ESM only. No `require()`, no `module.exports`
- **No npm/yarn** — pnpm 11.1.3+ required (enforced via `packageManager` field)
- **No default exports** — Named exports preferred everywhere
- **No `.eslintrc`** — Flat config only
- **No `.yml`** — Use `.yaml`
- **No inline styles** — CSS custom properties via theme system

## Commands

```bash
# Dev
pnpm dev                    # Vite dev server :5173
pnpm build                  # tsc + vite build → dist/
pnpm preview                # Preview production build

# Quality
pnpm lint                   # ESLint check
pnpm fix                    # ESLint auto-fix

# Test
pnpm test                   # Vitest unit tests
pnpm test:e2e               # Playwright cross-browser
pnpm test:visual            # Visual regression
pnpm test:accessibility      # axe-core WCAG 2.1 AA
pnpm test:performance        # Lighthouse CI
pnpm test:all               # All test suites

# Analysis
pnpm run analyze-build      # Bundle size + CI summary
pnpm dashboard              # Test health dashboard
pnpm badges                 # Update README badges
```

## Notes

- **Git hooks auto-run**: `simple-git-hooks` + `lint-staged` runs `eslint --fix` on commit
- **Coverage thresholds**: 80% statements/branches/functions/lines (enforced in Vite config)
- **Performance budgets**: JS <500KB warning, total <2MB max, LCP <2.5s, FID <100ms, CLS <0.1
- **No env vars required**: `VITE_GITHUB_TOKEN` optional for higher GitHub API rate limits
- **Accessibility mandatory**: WCAG 2.1 AA — all interactive elements keyboard-accessible, reduced motion respected
- **PR format**: Conventional commits (`feat:`, `fix:`, `docs:`, `test:`, `perf:`, `refactor:`)
- **Subdirectory AGENTS.md**: See `src/components/`, `src/hooks/`, `src/utils/`, `scripts/`, `tests/`
