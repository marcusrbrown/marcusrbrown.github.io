# Copilot Instructions

Read `AGENTS.md` at the repo root for the full code map, structure, conventions, and anti-patterns.

## Stack

React 19 + Vite 7 + TypeScript 5.6+ (strict) + pnpm 10.30+ + Node 22+. Pure ESM. Single-page portfolio deployed to GitHub Pages.

## Commands

```bash
pnpm install --frozen-lockfile  # Install deps (NEVER npm/yarn)
pnpm build                      # tsc && vite build → dist/
pnpm test                       # vitest run (happy-dom)
pnpm lint                       # ESLint flat config
pnpm fix                        # ESLint --fix
```

Always run `pnpm build` and `pnpm test` before pushing. If lint or type-check fails, fix it — do not suppress errors.

## Critical Conventions

### File Naming

- Hook files: **PascalCase** → `UseScrollReveal.ts`, NOT `useScrollReveal.ts`
- Components: PascalCase → `Navigation.tsx`
- Utilities/scripts: kebab-case → `analyze-build.ts`
- Config files: `.yaml` extension, NEVER `.yml`

### TypeScript (strict mode enforced)

```typescript
// ✅ CORRECT: Named export, explicit types, as const
export const THEME_OPTIONS = ["light", "dark", "system"] as const
type ThemeOption = (typeof THEME_OPTIONS)[number]

// ❌ WRONG: default export, enum, any
export default function MyComponent() {
  /* ... */
}
enum Theme {
  Light,
  Dark,
}
const data: any = fetchData()
```

- No `any`, no `@ts-ignore`, no `@ts-expect-error`
- No enums — use `as const` unions (`erasableSyntaxOnly`)
- Named exports only — no default exports
- Pure ESM — `import`/`export` only, never `require()`
- `verbatimModuleSyntax` — use `import type` for type-only imports

### React

```typescript
// ✅ CORRECT: Functional component, named export, React.FC
export const About: React.FC = () => {
  return <section id="about">{/* ... */}</section>
}

// ❌ WRONG: class component, default export
export default class About extends React.Component { /* ... */ }
```

- Functional components with hooks only
- Respect `prefers-reduced-motion` in animations
- No routing — single page with anchor links

### Code Style

- Prettier: **120-character** line width (`@bfra.me/prettier-config/120-proof`)
- ESLint: flat config in `eslint.config.ts` — NOT `.eslintrc.*`
- Vitest for testing (NOT Jest) — config is inline in `vite.config.ts`
- Tests go in co-located `__tests__/` directories next to source

### Adding a Section

1. Create `src/components/sections/NewSection.tsx` (named export, `React.FC`)
2. Wire it into `src/App.tsx` following the existing pattern
3. Add tests in `src/components/__tests__/`

### Adding a Hook

1. Create `src/hooks/UseMyHook.ts` (**PascalCase** filename)
2. Add tests in `src/hooks/__tests__/`

## Security

- Never commit secrets, tokens, or credentials
- Never add `console.log` with sensitive data
- Never weaken TypeScript strict settings
