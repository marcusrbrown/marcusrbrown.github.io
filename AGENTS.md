# AGENTS.md

**Generated:** 2026-03-06 | **Commit:** bc62df8 | **Branch:** main

## Overview

**marcusrbrown.com** — Personal brand site for Marcus R. Brown. Single-page React 19 portfolio deployed to GitHub Pages. Pure ESM, TypeScript strict, no routing.

**Stack:** React 19 + Vite 7 + TypeScript 5.6+ + pnpm 10.30+ + Node 22+

## Structure

```
├── src/
│   ├── App.tsx                      # Root component → Navigation + 4 sections
│   ├── main.tsx                     # Entry point (StrictMode + brand.css)
│   ├── components/
│   │   ├── Navigation.tsx           # Anchor-link nav bar
│   │   ├── sections/               # About, Experience, Skills, Contact
│   │   └── __tests__/              # Component smoke tests
│   ├── hooks/
│   │   ├── UseScrollReveal.ts       # IntersectionObserver scroll animation
│   │   └── __tests__/              # Hook unit tests
│   └── styles/                     # brand.css, Navigation.css
├── scripts/                         # Build analysis + test automation + verification (see scripts/AGENTS.md)
├── .github/
│   ├── workflows/                   # ci, deploy, renovate, fro-bot (see .github/ACTIONS.md)
│   └── actions/setup/               # Composite action: Node 22 + pnpm + optional Playwright
├── vite.config.ts                   # Build config + inline Vitest config (happy-dom)
├── eslint.config.ts                 # Flat config extending @bfra.me/eslint-config
├── tsconfig.json                    # Extends @bfra.me/tsconfig, strict mode
└── package.json                     # Pure ESM, pnpm enforced via packageManager field
```

## Where to Look

| Task | Location | Notes |
|------|----------|-------|
| Add a section | `src/components/sections/` + wire in `App.tsx` | Follow existing section pattern |
| Add a custom hook | `src/hooks/Use*.ts` | **PascalCase filename**, test in `__tests__/` |
| Modify build analysis | `scripts/analyze-build.ts` | Performance budgets defined inline |
| CI/CD changes | `.github/workflows/` | See `.github/ACTIONS.md` for full docs |
| Test config | `vite.config.ts` → `test:` block | No separate vitest.config — it's inline |
| Shared configs | `@bfra.me/*` packages | ESLint, Prettier (120-char), TypeScript |

## Conventions

### File Naming (CRITICAL)
- **Hook files: PascalCase** → `UseScrollReveal.ts`, NOT `useScrollReveal.ts`
- Components: PascalCase → `Navigation.tsx`
- Utilities: kebab-case → `analyze-build.ts`
- Config: `.yaml` extension, never `.yml`

### TypeScript
- `strict: true` — no `any`, no `@ts-ignore`, no `@ts-expect-error`
- `verbatimModuleSyntax` — consistent import/export syntax
- `noUnusedLocals`, `noUnusedParameters` — dead code caught at compile time
- `erasableSyntaxOnly` — no enums, use `as const` unions
- Pure ESM only — `import/export`, never `require()`

### React
- Functional components with hooks only
- Named exports preferred over default exports
- `prefers-reduced-motion` respected in animations (see `UseScrollReveal.ts`)
- No routing — single-page with anchor links

### Code Quality
- Prettier via `@bfra.me/prettier-config/120-proof` — **120-char line width**
- ESLint flat config — `eslint.config.ts`, NOT `.eslintrc.*`
- Git hooks auto-run `eslint --fix` on staged files via `simple-git-hooks` + `lint-staged`
- Vitest overrides: `no-conditional-expect: off`, `prefer-lowercase-title: off`

## Anti-Patterns (THIS PROJECT)

- **No CommonJS** — `require()` will break the build
- **No npm/yarn** — pnpm only, enforced by `packageManager` field
- **No `.eslintrc.*`** — flat config only (`eslint.config.ts`)
- **No `.yml` extension** — use `.yaml`
- **No `any` types** — strict mode enforced
- **No default exports** — named exports only

## Commands

```bash
pnpm dev              # Dev server → http://localhost:5173
pnpm build            # tsc + vite build → dist/
pnpm preview          # Preview production build
pnpm lint             # ESLint (flat config)
pnpm fix              # ESLint --fix
pnpm test             # vitest run (happy-dom)
```

## Testing

- **Unit tests**: Vitest with `happy-dom`, config inline in `vite.config.ts`
- **Coverage target**: 80%+ (statements, branches, functions, lines)
- **Test location**: Co-located `__tests__/` dirs next to source
- **Run specific test**: `pnpm test -- src/hooks/UseTheme.test.ts`
- **Watch mode**: `pnpm test -- --watch`

## CI/CD

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ci.yaml` | PRs to main, pushes to non-main | Lint + test + build + type-check + cross-platform matrix |
| `deploy.yaml` | Push to main | Build + deploy to GitHub Pages (marcusrbrown.com) |
| `renovate.yaml` | Scheduled | Automated dependency updates |
| `fro-bot.yaml` | PR events | AI-powered PR review |

Custom setup action at `.github/actions/setup/` handles Node 22 + pnpm + optional Playwright install.

## Notes

- Domain is **marcusrbrown.com** (CNAME in `public/`)
- Build outputs source maps (`build.sourcemap: true`)
- `__GITHUB_PAGES__` define injected at build time
- No Playwright/E2E tests currently configured — only Vitest unit tests
- Many `scripts/verify-*.sh` are one-time migration/verification scripts
- Shared configs from `@bfra.me` org — ESLint, Prettier, TypeScript base configs
