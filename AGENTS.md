# AGENTS.md

## Project Overview

**mrbro.dev** is a high-performance developer portfolio built with React 19+, TypeScript, and Vite. This is a **pure ESM project** deployed to GitHub Pages with comprehensive testing infrastructure, advanced theme system, and GitHub API integration.

### Key Technologies

- **Framework**: React 19+ with React Router v7+
- **Build Tool**: Vite 7+ (pure ESM, no CommonJS)
- **Language**: TypeScript 5.6+ in strict mode
- **Package Manager**: pnpm 10.13.1+ (REQUIRED - npm/yarn not supported)
- **Runtime**: Node.js 22+
- **Testing**: Vitest (unit), Playwright (e2e/visual/accessibility), Lighthouse CI (performance)
- **Linting**: ESLint 9+ with flat config (`eslint.config.ts`)
- **Deployment**: GitHub Pages → mrbro.dev

### Architecture Principles

1. **Pure ESM**: All code uses `import/export`, zero CommonJS
2. **TypeScript Strict**: No `any` types allowed
3. **Accessibility First**: WCAG 2.1 AA compliance required
4. **Performance Budgets**: JS <500KB (warning threshold), Total <2MB (max)
5. **Modern React**: Use React 19 concurrent features and modern hooks

## Setup Commands

### Initial Setup

```bash
# Clone repository
git clone https://github.com/marcusrbrown/marcusrbrown.github.io.git
cd marcusrbrown.github.io

# Install dependencies (requires pnpm)
pnpm install

# Set up git hooks (automatic via prepare script, manual if needed)
pnpm run setup-hooks
```

### Environment Requirements

- **Node.js**: >=22.0.0
- **pnpm**: ^10.13.1 (enforced via packageManager field)
- **Git**: Latest version recommended

## Development Workflow

### Starting Development

```bash
# Start development server with HMR
pnpm dev
# Opens at http://localhost:5173

# Preview production build
pnpm preview
```

### Building for Production

```bash
# Type check + production build
pnpm build
# Output: dist/

# Analyze bundle size and generate GitHub job summary
pnpm run analyze-build
```

### Code Quality

```bash
# Run linter (ESLint 9 flat config)
pnpm lint

# Auto-fix linting issues
pnpm fix
```

**Important**: Git hooks automatically run `eslint --fix` on staged files before commit via `simple-git-hooks` and `lint-staged`.

## Testing Instructions

### Unit Tests (Vitest)

```bash
# Run all unit tests
pnpm test

# Run with coverage
pnpm test -- --coverage
# Coverage report: coverage/index.html

# Watch mode
pnpm test -- --watch

# Run specific test file
pnpm test -- src/hooks/UseTheme.test.ts

# Run tests matching pattern
pnpm test -- -t "theme switching"
```

**Coverage Targets**: Aim for 80%+ coverage across statements, branches, functions, lines.

### E2E Tests (Playwright)

```bash
# Run all E2E tests (headless)
pnpm test:e2e

# Run with browser UI visible
pnpm test:e2e:headed

# Interactive UI mode
pnpm test:e2e:ui

# Generate new test with Codegen
pnpm test:e2e:codegen
```

**Test Projects**: Chromium, Firefox, WebKit (cross-browser testing).

### Visual Regression Tests

```bash
# Run visual regression tests
pnpm test:visual

# Run with browser visible
pnpm test:visual:headed

# Update baseline screenshots
pnpm test:visual:update

# Manage visual test artifacts
pnpm test:visual:artifacts         # Full report
pnpm test:visual:artifacts:clean   # Cleanup old artifacts
pnpm test:visual:artifacts:analyze # Analyze artifact sizes
pnpm test:visual:artifacts:report  # Generate detailed report
```

**Visual Testing**: Tests components across light/dark/custom themes at mobile (375px), tablet (768px), desktop (1440px) breakpoints.

### Accessibility Tests

```bash
# Run accessibility tests (axe-core)
pnpm test:accessibility

# Run with browser visible
pnpm test:accessibility:headed
```

**Standard**: WCAG 2.1 AA compliance required.

### Performance Tests

```bash
# Run Lighthouse CI
pnpm test:performance

# Mobile-specific performance testing
pnpm test:performance:mobile

# Desktop-specific performance testing
pnpm test:performance:desktop

# Validate performance budgets
pnpm test:performance:budgets

# Detect performance regressions
pnpm test:performance:regression

# Generate performance dashboard
pnpm test:performance:dashboard

# Manage performance artifacts
pnpm test:performance:artifacts

# Run complete performance suite
pnpm test:performance:full
```

**Performance Budgets**:

- JavaScript bundles: <500KB (warning threshold)
- Total bundle size: <2MB (maximum threshold)
- Core Web Vitals: LCP <2.5s, FID <100ms, CLS <0.1

### Test Dashboards and Reporting

```bash
# Run all tests (unit + e2e + visual + accessibility)
pnpm test:all

# Generate comprehensive test dashboard
pnpm dashboard

# Update dashboard with latest test results
pnpm dashboard:update

# Generate/update README test badges
pnpm badges

# Update badges with latest coverage
pnpm badges:update
```

**Dashboard Output**: `test-dashboard/` contains aggregated health scoring across all test types.

### Artifact Management

```bash
# Manage all test artifacts
pnpm artifacts

# Cleanup old artifacts
pnpm artifacts:cleanup

# Optimize artifact storage
pnpm artifacts:optimize

# Full artifact management (cleanup + optimize + report)
pnpm artifacts:full
```

## Code Style Guidelines

### File Naming Conventions

**CRITICAL**: Hook files use **PascalCase**, not camelCase:

- ✅ Correct: `src/hooks/UseTheme.ts`, `src/hooks/UseScrollAnimation.ts`
- ❌ Wrong: `src/hooks/useTheme.ts`, `src/hooks/useScrollAnimation.ts`

**Other conventions**:

- Components: PascalCase (`Button.tsx`, `ThemeSelector.tsx`)
- Utilities: camelCase (`preset-themes.ts`, `theme-validator.ts`)
- YAML files: `.yaml` extension (not `.yml`)
- ESLint config: `eslint.config.ts` (flat config, not `.eslintrc.*`)

### TypeScript Standards

- **Strict mode enabled**: No `any` types, explicit return types for exported functions
- **ES2020+ target**: Use modern JavaScript features
- **Pure ESM**: Always use `import/export`, never `require()`

### React Patterns

```tsx
// Use React 19 concurrent features
import { use, useOptimistic, useTransition } from 'react'

// Custom hooks follow established patterns
function MyComponent() {
  const { ref, animationState, isInView } = useScrollAnimation({
    threshold: 0.1,
    delay: 200,
    respectReducedMotion: true,
  })

  // Theme system integration
  const { currentTheme, themeMode, toggleTheme } = useTheme()
}
```

### Import/Export Patterns

```typescript
// Barrel exports in index files
export * from './components'
// Named exports preferred over default exports
export { useTheme } from './hooks/UseTheme'

export type { Theme, ThemeMode } from './types/theme'
```

### Accessibility Requirements

- All interactive elements must be keyboard accessible
- Use semantic HTML elements
- Include ARIA labels where appropriate
- Respect `prefers-reduced-motion` for animations
- Maintain WCAG 2.1 AA compliance

### Comment Guidelines

Follow self-explanatory code principles:

- Explain **WHY**, not **WHAT**
- Comment complex business logic and algorithms
- Document non-obvious performance optimizations
- Use JSDoc for public APIs
- Add TODO/FIXME/NOTE annotations with context

### ESLint Configuration

Uses **flat config** (`eslint.config.ts`), not legacy `.eslintrc.*`:

- Extends `@bfra.me/eslint-config` (includes Prettier)
- React hooks linting enabled
- TypeScript-aware linting
- Automatic formatting on git commit

## Build and Deployment

### Build Process

```bash
# Full production build
pnpm build

# Build outputs to dist/ with:
# - Minified JavaScript/CSS
# - Source maps
# - Asset optimization
# - Code splitting

# Analyze bundle size
pnpm run analyze-build
```

**Build Analysis Output**:

- Console summary with size breakdowns
- GitHub job summaries in CI (markdown reports)
- Warnings if bundle size exceeds thresholds
- Trend analysis comparing to build history

### Deployment

**Automatic**: Deploys to GitHub Pages on push to `main` branch.

**Workflow**: `.github/workflows/deploy.yaml`

- Runs all tests and quality checks
- Builds production bundle
- Generates build analysis
- Deploys to `gh-pages` branch
- Serves at <https://mrbro.dev>

**Manual Deployment**: Not typically needed (CI handles it).

### Environment Configuration

No environment variables required for basic functionality.

**Optional GitHub API Integration**:

- `VITE_GITHUB_TOKEN`: Personal access token for higher API rate limits
- Set in `.env.local` (gitignored) or GitHub repository secrets

## Project Structure

```
├── .github/
│   ├── workflows/deploy.yaml        # CI/CD pipeline
│   └── actions/setup/               # Reusable setup action
├── src/
│   ├── hooks/                       # Custom hooks (PascalCase naming!)
│   │   ├── UseTheme.ts             # Advanced theme system
│   │   ├── UseScrollAnimation.ts    # Intersection Observer animations
│   │   ├── UseGitHub.ts            # GitHub API integration
│   │   └── ...
│   ├── components/                  # React components
│   ├── contexts/                    # React contexts (ThemeContext, etc.)
│   ├── pages/                       # Page components
│   ├── schemas/                     # JSON schemas (theme.schema.json)
│   ├── utils/                       # Utility functions
│   │   └── preset-themes.ts        # 10+ theme presets
│   ├── types/                       # TypeScript type definitions
│   └── styles/                      # Global styles
├── scripts/                         # Build and test automation
│   ├── analyze-build.ts            # Bundle analysis
│   ├── test-dashboard.mjs          # Test health scoring
│   ├── generate-test-badges.mjs    # README badge generation
│   ├── performance-*.ts            # Performance monitoring suite
│   └── artifact-management.mjs     # Artifact cleanup
├── tests/                           # Unit and integration tests
├── playwright.config.ts             # E2E/visual/accessibility test config
├── vitest.config.ts                # Unit test configuration
├── vite.config.ts                  # Build configuration
├── eslint.config.ts                # Flat ESLint config (not .eslintrc!)
└── package.json                     # ESM-only, pnpm required
```

## Pull Request Guidelines

### Before Committing

1. **Run all tests**:

   ```bash
   pnpm test:all
   ```

2. **Check linting** (auto-runs on commit):

   ```bash
   pnpm lint
   ```

3. **Verify build**:

   ```bash
   pnpm build
   ```

4. **Check bundle size**:
   ```bash
   pnpm run analyze-build
   ```

### PR Title Format

Use conventional commits:

- `feat: Add custom theme export functionality`
- `fix: Resolve scroll animation memory leak`
- `docs: Update testing documentation`
- `test: Add visual regression tests for theme switching`
- `perf: Optimize bundle size with code splitting`
- `refactor: Extract theme validation logic`

### Required Checks

All PRs must pass:

- ✅ ESLint (no errors)
- ✅ TypeScript type checking
- ✅ Unit tests (80%+ coverage preferred)
- ✅ E2E tests (cross-browser)
- ✅ Visual regression tests
- ✅ Accessibility tests (axe-core)
- ✅ Bundle size analysis (no regressions)
- ✅ Build successful

### Testing Requirements

- Add/update tests for all code changes
- Visual regression tests for UI changes
- Accessibility tests for interactive elements
- Performance tests if affecting bundle size

## Common Development Tasks

### Adding a New Hook

1. Create file in `src/hooks/` with **PascalCase** name: `UseMyHook.ts`
2. Follow established hook patterns (compound return objects)
3. Add unit tests: `UseMyHook.test.ts`
4. Update hook exports in `src/hooks/index.ts`

### Adding a New Component

1. Create component in `src/components/ComponentName.tsx`
2. Add Storybook story if applicable
3. Add visual regression tests
4. Add accessibility tests
5. Update component exports

### Modifying the Theme System

1. Theme schema: `src/schemas/theme.schema.json`
2. Theme types: `src/types/theme.ts`
3. Theme context: `src/contexts/ThemeContext.tsx`
4. Theme hook: `src/hooks/UseTheme.ts`
5. Preset themes: `src/utils/preset-themes.ts`
6. **Always validate against JSON schema**

### Performance Optimization

1. Run build analysis: `pnpm run analyze-build`
2. Identify large bundles in output
3. Consider code splitting, lazy loading
4. Re-run analysis to verify improvements
5. Check bundle size warnings in CI

## Debugging and Troubleshooting

### Common Issues

**Linting Errors After Update**:

```bash
# Clear ESLint cache
rm -rf node_modules/.cache/eslint

# Re-run linter
pnpm lint
```

**Git Hooks Not Working**:

```bash
# Manually set up hooks
pnpm run setup-hooks

# Verify .git/hooks/pre-commit exists
ls -la .git/hooks/
```

**Visual Test Failures**:

```bash
# View diff images in test-results/
open test-results/

# Update baselines if changes are intentional
pnpm test:visual:update
```

**Performance Budget Exceeded**:

```bash
# Analyze bundle composition
pnpm run analyze-build

# Check for large dependencies
# Consider code splitting or lazy loading
```

**TypeScript Errors**:

```bash
# Clear build cache
rm -rf dist/ node_modules/.vite/

# Rebuild
pnpm build
```

### Logging Patterns

- Console logs removed in production builds
- Use React DevTools for component debugging
- Playwright trace viewer for E2E debugging: `pnpm test:e2e -- --trace on`

### Performance Considerations

- Use `React.memo()` for expensive components
- Implement virtual scrolling for long lists
- Lazy load routes with React Router
- Optimize images (WebP format preferred)
- Monitor bundle size after dependency updates

## CI/CD Pipeline

### Workflow Structure

**Main workflow**: `.github/workflows/deploy.yaml`

**Jobs**:

1. **Lint**: ESLint checks
2. **Test**: Unit tests with coverage
3. **Build**: Production build + analysis
4. **Type-check**: TypeScript validation
5. **Validate**: Additional validation checks
6. **Matrix Tests**: Cross-platform (Ubuntu, Windows, macOS)
7. **Deploy**: GitHub Pages deployment

### GitHub Actions Features

- **Reusable setup action**: `.github/actions/setup`
- **Build analysis**: Automated bundle size reports in job summaries
- **GitHub CLI integration**: PR comments for performance warnings
- **Security**: SHA-pinned actions, frozen lockfiles
- **Performance monitoring**: Automated regression detection

### Secrets and Variables

No secrets required for basic CI/CD.

**Optional**:

- `GITHUB_TOKEN`: Auto-provided by GitHub Actions
- `PERSONAL_ACCESS_TOKEN`: For GitHub API integration (if needed)

## Additional Notes

### Important Reminders

- **Always use pnpm**, not npm or yarn
- **Hook files are PascalCase**: `UseTheme.ts`, not `useTheme.ts`
- **ESLint uses flat config**: `eslint.config.ts`, not `.eslintrc.*`
- **Pure ESM**: No CommonJS allowed
- **YAML extension**: `.yaml`, not `.yml`
- **Bundle size matters**: Monitor performance budgets
- **Accessibility is required**: Not optional, test with axe-core
- **Git hooks auto-run**: Code automatically formatted on commit

### Testing Philosophy

- **Test behavior, not implementation**
- **Visual regression tests catch UI bugs**
- **Accessibility tests are mandatory**
- **Performance tests prevent regressions**
- **High coverage is encouraged but not a goal in itself**

### Key Hook Patterns

```tsx
function ExampleComponent() {
  // Scroll animations with reduced motion support
  const scrollAnim = useScrollAnimation({ threshold: 0.1, respectReducedMotion: true })

  // Theme system with custom creation
  const theme = useTheme() // Access current theme, toggle, create custom

  // Progressive image loading
  const image = useProgressiveImage(src, lowQualitySrc)

  // GitHub API integration
  const github = useGitHub() // Fetch repositories and blog posts

  // Analytics tracking
  const analytics = useAnalytics() // Track page views and interactions

  // Page title management
  usePageTitle(title) // Dynamic title updates with SEO
}
```

### Performance Best Practices

- **Code splitting**: Use dynamic imports for routes
- **Tree shaking**: Ensure all imports are used
- **Asset optimization**: WebP images, lazy loading
- **Bundle analysis**: Run `pnpm run analyze-build` regularly
- **Lighthouse CI**: Monitor Core Web Vitals in CI pipeline

### Security Considerations

- **Dependency audits**: Run `pnpm audit` regularly
- **Frozen lockfiles**: Enforced in CI
- **No inline scripts**: CSP-friendly architecture
- **SHA-pinned actions**: Security best practice in workflows

### Getting Help

- **Documentation**: See README.md and TESTING.md
- **Issues**: <https://github.com/marcusrbrown/marcusrbrown.github.io/issues>
- **CI Logs**: Check GitHub Actions for detailed error messages
- **Test Reports**: Review `test-dashboard/` for comprehensive health status
