# GitHub Copilot Instructions for mrbro.dev

## Project Overview

This is a developer portfolio website built with modern web technologies and deployed to GitHub Pages with the custom domain `mrbro.dev`. The project showcases GitHub repositories and serves as a development blog.

## Technical Stack

- **Framework**: React 19+ with TypeScript
- **Routing**: React Router v7+ (latest v7.7.1)
- **Build Tool**: Vite 7+ (latest v7.0.6)
- **Package Manager**: pnpm v10.13.1+ (required)
- **Testing**: Vitest with happy-dom
- **Styling**: Global CSS styles with CSS custom properties
- **Syntax Highlighting**: Shiki v3.8.1 with theme integration
- **Schema Validation**: Ajv v8.17.1 + ajv-formats v3.0.1
- **Linting**: ESLint 9+ with flat config
- **Formatting**: Prettier via @bfra.me/prettier-config/120-proof
- **Deployment**: GitHub Pages via GitHub Actions
- **Node.js**: v22+ LTS required

## Code Standards

### TypeScript Configuration

- Uses single `tsconfig.json` configuration
- Pure ESM modules only (`"type": "module"` in package.json)
- Strict TypeScript settings enabled
- Modern bundler resolution with Vite

### ESLint Configuration

- **IMPORTANT**: Uses flat config (`eslint.config.ts`) not legacy `.eslintrc.*`
- Extends `@bfra.me/eslint-config` which includes Prettier
- Separate Prettier config: `"prettier": "@bfra.me/prettier-config/120-proof"` in package.json
- Project-specific ignores: `.ai/`, `.github/copilot-instructions.md`, `public/`
- **Pattern**: `defineConfig({ name: 'project-name', ignores: [...], typescript: { tsconfigPath: './tsconfig.json' } })`

### File Naming Conventions

- Use `.yaml` extension for YAML files (not `.yml`)
- Use `eslint.config.ts` for ESLint (not `.eslintrc.*`)
- **Hook files use PascalCase**: `UseTheme.ts`, `UseGitHub.ts`

## Project Structure

```
├── .github/
│   ├── workflows/
│   │   └── deploy.yaml              # GitHub Pages deployment
│   └── copilot-instructions.md      # This file
├── public/                          # Static assets
├── src/                             # Application source
│   ├── components/                  # React components
│   ├── hooks/                       # Custom React hooks
│   ├── pages/                       # Page components
│   ├── styles/                      # CSS/styling
│   ├── types/                       # TypeScript type definitions
│   ├── utils/                       # Utility functions
│   ├── App.tsx                      # Main App component
│   └── main.tsx                     # Application entry point
├── tests/                           # Test files
├── eslint.config.ts                 # ESLint flat config
├── package.json                     # Package configuration (ESM)
├── tsconfig.json                    # TypeScript config
├── vite.config.ts                   # Vite configuration
└── vitest.config.ts                 # Test configuration
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
   - Prevent commit if unfixable issues exist

#### Benefits

- **Consistent code quality**: All commits meet linting standards
- **Automatic formatting**: No manual formatting needed
- **Early error detection**: Catch issues before they reach CI/CD
- **Zero overhead**: Only processes staged files for speed
- **Team consistency**: Same standards enforced for all contributors

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

## Deployment

### GitHub Pages Setup

1. Uses official GitHub Actions:
   - `actions/upload-pages-artifact@v3`
   - `actions/deploy-pages@v4`
2. Split build/deploy jobs for better performance
3. Includes linting and testing in CI pipeline
4. Supports custom domain configuration

### Environment Variables

- `GITHUB_PAGES=true` - Set automatically by GitHub Actions
- Available in build via `__GITHUB_PAGES__` define in Vite config

## Code Quality

### Testing Strategy

- Unit tests with Vitest and happy-dom
- Component testing for React components with `@testing-library/react`
- Coverage thresholds: 80% minimum
- Test files: `*.test.{ts,tsx}` or `*.spec.{ts,tsx}`
- **Mock Pattern**: Use `vi.mock('../../src/hooks/UseTheme')` for hook mocking
- **Wrapper Pattern**: Create provider wrappers for context-dependent components
- **Setup Pattern**: Use `beforeEach()` to reset mocks and state between tests

**Landing Page Testing Patterns**:
```typescript
// Animation testing with UseScrollAnimation hook
const { result } = renderHook(() => useScrollAnimation({ threshold: 0.5 }))
await waitFor(() => expect(result.current.isInView).toBe(true))

// Interactive component testing with user events
const user = userEvent.setup()
await user.hover(screen.getByRole('button', { name: /skill item/i }))
expect(screen.getByText(/proficiency/i)).toBeVisible()

// Modal accessibility testing
await user.keyboard('{Escape}')
expect(mockOnClose).toHaveBeenCalled()
```

**Visual Testing**: Playwright tests cover component variations across themes:
```typescript
// tests/visual/components.spec.ts - Theme-aware visual testing
THEMES.forEach(theme => {
  test(`Skills showcase - ${theme} theme`, async ({page}) => {
    await preparePageForVisualTest(page, {theme})
    await skillsComponent.screenshot({
      path: `tests/visual/screenshots/skills-showcase-${theme}-theme.png`,
      animations: 'disabled',
    })
  })
})
```

### Performance

- Code splitting with manual chunks for vendors
- Source maps in production for debugging
- Optimized for GitHub Pages hosting
- Modern ES2020+ target for smaller bundles

## Architecture Patterns

### Landing Page Architecture

The project features a modern, accessible landing page with sophisticated animation system and component patterns:

```typescript
// src/pages/Home.tsx - Main landing page orchestrator
const Home: React.FC = () => {
  return (
    <div className="home-page">
      <HeroSection />
      <SkillsShowcase />
      <ProjectGallery />
      <ProjectPreviewModal />
    </div>
  )
}

// src/hooks/UseScrollAnimation.ts - Intersection Observer based animations
export const useScrollAnimation = <T extends HTMLElement>(options: ScrollAnimationOptions) => {
  // Provides smooth scroll-triggered animations with reduced motion support
  return { ref, isInView, animationState }
}
```

**Key Landing Page Components**:
- **HeroSection**: Animated hero with staggered typography and accessible CTAs
- **SkillsShowcase**: Interactive skills display with proficiency indicators and animations
- **ProjectGallery**: Enhanced project cards with hover effects and filtering
- **ProjectPreviewModal**: Keyboard-accessible modal with smooth transitions

**Animation System Features**:
- **Intersection Observer**: Performant scroll-triggered animations via `UseScrollAnimation.ts`
- **Staggered Entrances**: Progressive reveal animations with customizable delays
- **Reduced Motion**: Automatic fallbacks respecting `prefers-reduced-motion`
- **CSS Custom Properties**: Theme-aware animations using CSS variables

### Theme System Architecture

The project implements a comprehensive theme system with Context + Hook pattern plus advanced features:

```typescript
// src/contexts/ThemeContext.tsx - Centralized theme state
const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

// src/hooks/UseTheme.ts - Feature-rich hook interface
export const useTheme = (): UseThemeReturn => {
  // Provides: currentTheme, themeMode, toggleTheme, preset gallery, custom themes, etc.
  return useThemeContext()
}

// Usage in components
const MyComponent = () => {
  const { currentTheme, isDarkMode, toggleTheme, setCustomTheme } = useTheme()
  // ...
}
```

**Advanced Theme Features**:
- **Custom Theme Creation**: Full theme customizer with HSL color controls (`src/components/ThemeCustomizer.tsx`)
- **Preset Theme Gallery**: 10+ built-in themes (GitHub, Material, Nord, Solarized, etc.) (`src/utils/preset-themes.ts`)
- **Theme Import/Export**: JSON-based theme sharing with schema validation (`src/utils/theme-export.ts`)
- **JSON Schema Validation**: Comprehensive validation using Ajv (`src/schemas/theme.schema.json`, `src/utils/schema-validation.ts`)
- **CSS Custom Properties Integration**: Themes dynamically update CSS custom properties on `:root`
- **Syntax Highlighting Integration**: Shiki themes automatically match app themes (`src/utils/syntax-highlighting.ts`)

### JSON Schema Validation Pattern

Critical for theme security and validation:

```typescript
// src/utils/schema-validation.ts - Schema-based validation
import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import themeSchema from '../schemas/theme.schema.json'

const ajv = new Ajv({ allErrors: true, removeAdditional: true })
addFormats(ajv)
const validateThemeExport = ajv.compile(themeSchema)

// Usage in theme import/export
export const validateThemeExportData = (data: unknown): ThemeValidationResult => {
  const isValid = validateThemeExport(data)
  return { isValid, errors: formatValidationErrors(validateThemeExport.errors || []) }
}
```

### Syntax Highlighting Architecture

Theme-aware syntax highlighting using Shiki:

```typescript
// src/utils/syntax-highlighting.ts - Shiki integration
const SHIKI_THEME_MAP: Record<ResolvedThemeMode, BundledTheme> = {
  light: 'github-light',
  dark: 'github-dark',
}

export const highlightCode = async (code: string, language: BundledLanguage, options: {
  theme?: ResolvedThemeMode
  removeBackground?: boolean
} = {}): Promise<string> => {
  const highlighter = await initializeHighlighter()
  return highlighter.codeToHtml(code, { lang: language, theme: SHIKI_THEME_MAP[theme] })
}
```

**Key Components**:
- `src/components/CodeBlock.tsx` - Theme-aware code block component
- `src/hooks/UseSyntaxHighlighting.ts` - Hook for automatic theme updates
- Supports 15+ languages (TypeScript, JavaScript, Python, Rust, etc.)

### Compound Component Pattern

Used extensively in the landing page system for modular, reusable components:

```typescript
// src/components/SkillsShowcase.tsx - Compound component architecture
const SkillsShowcase: React.FC<SkillsShowcaseProps> = ({ title, subtitle }) => {
  return (
    <section className="skills-showcase">
      <div className="skills-grid">
        {skillCategories.map(category => (
          <SkillCategorySection key={category.id} category={category} />
        ))}
      </div>
    </section>
  )
}

// Individual compound components
const SkillCategorySection = ({ category, isVisible }) => { /* ... */ }
const SkillItem = ({ skill, index, isVisible }) => { /* ... */ }
```

**Animation Hook Pattern**:
```typescript
// src/hooks/UseScrollAnimation.ts - Intersection Observer integration
export const useScrollAnimation = <T extends HTMLElement>(options: {
  threshold?: number
  rootMargin?: string
  triggerOnce?: boolean
  delay?: number
}) => {
  // Returns ref, isInView state, and animation classes
  return { ref, isInView, animationState }
}

// Usage in components with staggered animations
const { ref, isInView } = useScrollAnimation({
  threshold: 0.2,
  delay: getStaggerDelay(index, 200, 150), // Staggered entrance
  triggerOnce: true
})
```

### Progressive Enhancement Pattern

Landing page implements progressive enhancement for animations and interactions:

```css
/* src/styles/landing-page.css - Progressive animation classes */
.animate--idle {
  opacity: 0;
  transform: translateY(2rem);
}

.animate--visible {
  opacity: 1;
  transform: translateY(0);
  transition: opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}

/* Reduced motion fallbacks */
@media (prefers-reduced-motion: reduce) {
  .animate--idle { opacity: 1; transform: none; }
  .animate--visible { transition: none; }
}
```

### Compound Component Pattern

Used extensively in the theme system for modular, reusable components:

```typescript
// src/components/ThemeCustomizer.tsx - Compound component architecture
const ThemeCustomizer: React.FC<ThemeCustomizerProps> = ({ onClose, onThemeChange }) => {
  return (
    <div className="theme-customizer">
      <ColorSection title="Primary Colors" colors={primaryColors} />
      <ColorSection title="Surface Colors" colors={surfaceColors} />
      <ThemePreview theme={editingTheme} />
      <PresetThemeGallery onThemeApply={handleThemeApply} />
    </div>
  )
}

// Individual compound components
const ColorSection = ({ title, colors, onColorChange }) => { /* ... */ }
const ColorInput = ({ label, value, onChange }) => { /* ... */ }
```

### GitHub API Integration

```typescript
// src/utils/github.ts - Direct fetch API usage, no external libraries
const GITHUB_API_URL = 'https://api.github.com'

interface GitHubLabel {
  id: number;
  name: string;
  [key: string]: unknown;
}

interface GitHubIssue {
  labels: GitHubLabel[];
  [key: string]: unknown;
}

export const fetchRepositories = async (username: string) => {
  const response = await fetch(`${GITHUB_API_URL}/users/${username}/repos`)
  return await response.json()
}

export const fetchBlogPosts = async (repo: string) => {
  const response = await fetch(`${GITHUB_API_URL}/repos/${repo}/issues`)
  const data = await response.json()
  // Filter issues with 'blog' label for blog posts
  return (data as GitHubIssue[]).filter((post) =>
    post.labels.some((label) => label.name === 'blog')
  )
}
```

### Hook Pattern

```typescript
// src/hooks/UseTheme.ts (Note: Uses PascalCase naming convention)
import type {UseThemeReturn} from '../types'

export const useTheme = (): UseThemeReturn => {
  // Comprehensive interface with state, actions, and utilities
  const context = useThemeContext()
  return {
    currentTheme, themeMode, availableThemes,
    isDarkMode, isLightMode, isSystemMode,
    setThemeMode, toggleTheme, switchToLight,
    // ... full interface
  }
}
```

**Landing Page Hook Examples**:
```typescript
// src/hooks/UseScrollAnimation.ts - Animation with Intersection Observer
export const useScrollAnimation = <T extends HTMLElement>(options) => {
  const [isInView, setIsInView] = useState(false)
  const [animationState, setAnimationState] = useState<AnimationState>('idle')
  // Returns ref, visibility state, and CSS class helpers
}

// src/hooks/UseProgressiveImage.ts - Progressive image loading
export const useProgressiveImage = (src: string) => {
  // Provides blur-up effect for project gallery images
  return { imageSrc, isLoaded, isError }
}

// src/hooks/UseProjectFilter.ts - Interactive project filtering
export const useProjectFilter = (projects: Project[]) => {
  // Manages filter state and animated project grid updates
  return { filteredProjects, activeFilter, setFilter, filters }
}
```

**Hook Testing Pattern**:
```typescript
// Mock hook in tests
const mockUseTheme = {
  themeMode: 'light' as const,
  isDarkMode: false,
  setThemeMode: vi.fn(),
}

vi.mock('../../src/hooks/UseTheme', () => ({
  useTheme: () => mockUseTheme,
}))
```

### CSS Architecture

**CSS Custom Properties Pattern**: All theming uses CSS custom properties defined in `src/styles/themes.css`:

```css
:root {
  --color-primary: #2563eb;
  --color-background: #ffffff;
  /* Component-specific derived colors */
  --color-header-bg: var(--color-surface);
  --color-card-bg: var(--color-background);
}
```

**Landing Page CSS Structure**: `src/styles/landing-page.css` follows systematic organization:

```css
/* Landing Page Styles - Modern Developer Portfolio */

/* Hero Section Styles */
.hero-section { /* ... */ }
.hero-title-highlight {
  background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

/* Animation Classes for UseScrollAnimation Hook */
.animate--idle { opacity: 0; transform: translateY(2rem); }
.animate--visible { opacity: 1; transform: translateY(0); }

/* Accessibility and Reduced Motion Support */
@media (prefers-reduced-motion: reduce) {
  .animate--idle { opacity: 1 !important; transform: none !important; }
  .animate--visible { transition: none !important; }
}
```

**Dynamic Theme Updates**: ThemeContext automatically updates these properties when theme changes, providing instant visual feedback.

**Performance Optimizations**: Theme system includes:
- Reduced motion detection and respecting user preferences
- Performance level optimization for theme switches
- CSS custom property cleanup to prevent memory leaks

### Component Structure

```typescript
// src/components/ComponentName.tsx
import React from 'react';

const ComponentName: React.FC = () => {
  return (
    <div>
      {/* Component JSX */}
    </div>
  );
};

export default ComponentName;
```

## Repository Showcase Feature

The site includes comprehensive GitHub API integration:
- **Repository Display**: Fetches user repositories via `fetchRepositories()` function using direct fetch API
- **Blog System**: GitHub Issues with 'blog' label converted to blog posts via `fetchBlogPosts()`
- **Theme Integration**: Full dark/light theme system with system preference detection
- **Routing Structure**: Home (`/`), Blog (`/blog`), Projects (`/projects`), About (`/about`) via React Router v7+
- **Context Architecture**: ThemeContext provides centralized theme state with `useTheme()` hook interface

## Development Guidelines

1. **Always use ESM imports** - No CommonJS (`require()`)
2. **Prefer default exports** for components (current pattern)
3. **Use TypeScript strict mode** - No `any` types
4. **Follow self-explanatory code commenting** as per project instructions
5. **Test coverage is mandatory** - Maintain 80%+ coverage
6. **Modern React patterns** - Hooks, function components, React 19 features

## Dependencies Management

- Use exact versions for critical dependencies
- Keep dependencies up to date
- Prefer smaller, focused packages
- Use pnpm for package management (faster, more efficient)
- **Git hooks auto-setup**: simple-git-hooks runs automatically on install via `prepare` script

## Troubleshooting

### Common Issues

1. **ESLint errors**: Ensure using flat config, not legacy
2. **TypeScript errors**: Check configuration is correct
3. **Build failures**: Verify Node.js v22+ and pnpm are used
4. **GitHub Pages**: Ensure workflow has correct permissions
5. **Git hooks not working**: Run `pnpm run setup-hooks` to reinstall
6. **Pre-commit failures**: Fix ESLint errors manually if auto-fix fails

### Debug Commands

```bash
pnpm install --frozen-lockfile  # Exact dependency install
pnpm build --debug             # Verbose build output
pnpm test --reporter=verbose    # Detailed test output
pnpm run setup-hooks           # Reinstall git hooks
```

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
15. **Follow landing page patterns** - Use compound components and animation hooks as established

### Build Performance Guidelines

- **JavaScript bundles** should stay under 500KB (warnings generated above this)
- **Total bundle size** should stay under 1MB (optimal) or 2MB (maximum)
- **Animation performance** considerations: Use `will-change` sparingly, prefer `transform` and `opacity`
- **Landing page performance**: Intersection Observer provides performant scroll animations
- **Use the build analysis script** (`scripts/analyze-build.ts`) when optimizing
- **GitHub job summaries** provide rich markdown reports for build metrics
- **Performance status** is automatically tracked and reported in CI

#### Build Analysis Workflow

The `scripts/analyze-build.ts` script provides comprehensive build analysis:

```javascript
// Key metrics tracked:
{
  totalSize: 0,      // Total bundle size
  jsSize: 0,         // JavaScript files
  cssSize: 0,        // CSS files
  fileCount: 0,      // Number of files
  assets: [...],     // Sorted by size (largest first)
}

// Automatic warnings:
// - JavaScript > 500KB
// - Total bundle > 2MB
// - Optimal indicators < 100KB JS
```

**GitHub Actions Integration**: Automatically generates job summaries with:
- Bundle size breakdown by file type
- Top 10 largest assets
- Performance warnings and recommendations
- Historical size comparison (when available)

## Future Enhancements

Consider these areas for improvement:
- Enhanced blog post creation workflow
- Advanced GitHub integration (pull requests, gists)
- Performance monitoring dashboard
- Analytics integration
- SEO optimizations
- PWA features
- Multi-language support
