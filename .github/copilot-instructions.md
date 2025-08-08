# GitHub Copilot Instructions for mrbro.dev

## Project Overview

This is a high-performance developer portfolio built with React 19+, TypeScript, and modern tooling. Features advanced theme system, GitHub API integration, comprehensive testing infrastructure, and automated deployment to GitHub Pages (`mrbro.dev`).

## Critical Architecture Patterns

### Modern ESM-Only Stack
- **Pure ESM**: All code uses `import/export`, no CommonJS
- **React 19+**: Latest concurrent features, modern hooks
- **TypeScript Strict**: No `any` types, comprehensive typing
- **Vite 7+**: Lightning-fast builds with HMR
- **pnpm Required**: Fast, efficient package management

### Advanced Testing Infrastructure
```bash
# Core test commands that aren't obvious
pnpm test:visual                    # Visual regression testing
pnpm test:performance:budgets       # Performance budget validation
pnpm dashboard                      # Generate comprehensive test dashboard
pnpm badges                         # Update README test status badges
```

**Key Testing Patterns:**
- **Visual Testing**: Playwright-based screenshot regression with theme variations
- **Performance Monitoring**: Automated bundle analysis with GitHub job summaries
- **Test Dashboard**: Aggregated health scoring across all test types
- **Badge Generation**: Auto-updating README badges from test results

### Hook Architecture (CRITICAL)
**File Naming**: Hooks use PascalCase - `UseTheme.ts`, `UseScrollAnimation.ts` (not camelCase)

```typescript
// Advanced scroll animation with accessibility
const { ref, animationState, isInView, triggerAnimation } = useScrollAnimation({
  threshold: 0.1,
  delay: 200,
  respectReducedMotion: true
})

// Comprehensive theme system
const { currentTheme, themeMode, toggleTheme, setCustomTheme } = useTheme()
```

**Key Hooks:**
- `UseScrollAnimation.ts`: Intersection Observer-based animations with reduced motion support
- `UseTheme.ts`: Advanced theming with custom creation, presets, and JSON schema validation
- `UseProgressiveImage.ts`: Blur-up effect for optimized image loading
- `UseProjectFilter.ts`: Interactive filtering with smooth animations
- `UseSyntaxHighlighting.ts`: Theme-aware code highlighting with Shiki

### Theme System Architecture
```typescript
// Custom theme creation with validation
const newTheme = createCustomTheme({
  primary: { hue: 220, saturation: 90, lightness: 60 },
  surface: { hue: 220, saturation: 10, lightness: 95 }
})
validateThemeExportData(themeData) // JSON schema validation with Ajv
```

**Features:**
- **10+ Preset Themes**: GitHub, Material, Nord, Solarized, etc. (`src/utils/preset-themes.ts`)
- **JSON Schema Validation**: Secure theme import/export (`src/schemas/theme.schema.json`)
- **CSS Custom Properties**: Dynamic theme updates on `:root`
- **Shiki Integration**: Syntax highlighting matches app themes

### Performance & Build Analysis (CRITICAL)
```bash
pnpm analyze-build                  # Detailed bundle analysis with warnings
pnpm test:performance:budgets       # Automated performance budget enforcement
pnpm artifacts                     # Artifact management and optimization
```

**Automated Monitoring:**
- **Bundle Size Limits**: JavaScript <500KB (warning), Total <2MB (maximum)
- **GitHub Job Summaries**: Rich markdown reports with size breakdowns and trends
- **Performance Budgets**: Automated CI warnings for regressions
- **Build Analysis**: `scripts/analyze-build.ts` provides comprehensive metrics

### Visual Testing System
```bash
pnpm test:visual                    # Cross-theme screenshot regression
pnpm test:visual:artifacts          # Visual artifact management
pnpm test:visual:update             # Update baseline screenshots
```

**Architecture:**
- **Multi-theme Testing**: All components tested across light/dark/custom themes
- **Responsive Breakpoints**: Mobile (375px), tablet (768px), desktop (1440px)
- **Threshold Configuration**: Different sensitivity levels for components vs pages
- **Artifact Management**: Automated cleanup and organization of test results

## Code Standards

### ESLint Configuration (CRITICAL)
- **IMPORTANT**: Uses flat config (`eslint.config.ts`) not legacy `.eslintrc.*`
- Extends `@bfra.me/eslint-config` which includes Prettier
- **Pattern**: `defineConfig({ name: 'project-name', ignores: [...], typescript: { tsconfigPath: './tsconfig.json' } })`

### File Naming Conventions
- **Hook files use PascalCase**: `UseTheme.ts`, `UseScrollAnimation.ts`
- Use `.yaml` extension for YAML files (not `.yml`)
- Use `eslint.config.ts` for ESLint (not `.eslintrc.*`)

## Project Structure

```
├── .github/workflows/deploy.yaml    # GitHub Pages deployment with build analysis
├── src/
│   ├── hooks/                       # PascalCase: UseTheme.ts, UseScrollAnimation.ts
│   ├── schemas/theme.schema.json    # JSON schema validation for themes
│   ├── components/                  # React components with compound patterns
│   ├── contexts/ThemeContext.tsx    # Centralized theme state management
│   └── utils/preset-themes.ts       # 10+ curated theme presets
├── scripts/                         # Critical automation scripts
│   ├── analyze-build.ts             # Bundle analysis with GitHub job summaries
│   ├── test-dashboard.mjs           # Aggregated test health scoring
│   ├── generate-test-badges.mjs     # Auto-updating README badges
│   └── performance-*.ts             # Performance monitoring suite
├── tests/visual/                    # Comprehensive visual regression testing
├── playwright.config.ts             # Multi-project test configuration
└── package.json                     # ESM-only with git hooks automation
```

## Development Workflow

### Commands

```bash
pnpm install           # Install dependencies
pnpm dev              # Start development server
pnpm build            # Build for production
pnpm preview          # Preview production build
pnpm test             # Run tests
pnpm lint             # Lint code
pnpm fix              # Fix linting issues
pnpm setup-hooks      # Set up git hooks (manual)
```

### Git Hooks & Code Quality

The project uses **simple-git-hooks** and **lint-staged** for automated code quality enforcement:

- **Pre-commit hooks**: Automatically run ESLint fixes and Prettier formatting on staged files
- **simple-git-hooks**: v2.13.0 - Lightweight, zero-dependency git hooks manager
- **lint-staged**: v16.1.2 - Run tools on git staged files only
- **Automatic setup**: Hooks are installed automatically via `prepare` script during `pnpm install`

#### Git Hooks Configuration

Located in `package.json`:
```json
{
  "simple-git-hooks": {
    "pre-commit": "pnpm exec lint-staged"
  },
  "lint-staged": {
    "*.{js,jsx,ts,tsx,json,css,md,yaml}": ["eslint --fix"]
  }
}
```

#### Git Hooks Workflow

1. **Automatic**: Hooks are set up during `pnpm install` via `prepare` script
2. **Manual**: Run `pnpm run setup-hooks` to manually set up hooks
3. **Pre-commit**: On every commit, automatically:
   - Fix ESLint issues and format all supported file types
### GitHub Integration

- Repository: `marcusrbrown/marcusrbrown.github.io`
- Custom domain: `mrbro.dev`
- Deployment: Automatic on push to `main` branch
- GitHub API integration for showcasing repositories

### CI/CD Pipeline

The project uses a comprehensive CI/CD pipeline with modern GitHub Actions:

- **Reusable Setup Action**: Composite action (`.github/actions/setup`) for consistent environment setup
- **Comprehensive CI Workflow**: Multi-job pipeline with lint, test, build, type-check, validate, matrix testing
- **Build Analysis**: Automated bundle size analysis with GitHub job summaries
- **GitHub CLI Integration**: Uses `gh` CLI for PR comments instead of external actions
- **Performance Monitoring**: Automated warnings for bundle size thresholds
- **Cross-Platform Testing**: Ubuntu, Windows, macOS matrix builds
- **Security**: SHA-pinned actions, dependency auditing, frozen lockfiles

## AI Coding Agent Guidelines

When working on this project:

1. **Respect the modern toolchain** - Don't suggest legacy configs
2. **Maintain ESM purity** - All code should be ESM
3. **Follow TypeScript strictness** - Use proper typing
4. **Preserve performance optimizations** - Don't regress bundle size
5. **Update tests** when adding features
6. **Consider GitHub Pages constraints** - Static site only
7. **Use the established patterns** documented above
8. **Keep accessibility in mind** - This is a public portfolio
9. **Optimize for SEO** - Important for discoverability
10. **Mobile-first responsive design** - Modern web standards
11. **Leverage CI/CD pipeline** - Use GitHub Actions job summaries for build analysis
12. **Monitor bundle performance** - The build analysis script tracks size metrics automatically
13. **Respect reduced motion preferences** - All animations must have fallbacks
14. **Use progressive enhancement** - Components should work without JavaScript
15. **Follow hook patterns** - Use compound components and animation hooks as established

### Build Performance Guidelines

- **JavaScript bundles** should stay under 500KB (warnings generated above this)
- **Total bundle size** should stay under 2MB (optimal) or 1MB (maximum)
- **Animation performance** considerations: Use `will-change` sparingly, prefer `transform` and `opacity`
- **Use the build analysis script** (`scripts/analyze-build.ts`) when optimizing
- **GitHub job summaries** provide rich markdown reports for build metrics
- **Performance status** is automatically tracked and reported in CI
