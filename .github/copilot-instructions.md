# GitHub Copilot Instructions for mrbro.dev

## Project Overview

This is a developer portfolio website built with modern web technologies and deployed to GitHub Pages with the custom domain `mrbro.dev`. The project showcases GitHub repositories and serves as a development blog.

## Technical Stack

- **Framework**: React 18+ with TypeScript
- **Routing**: React Router v7+
- **Build Tool**: Vite 7+ (latest)
- **Package Manager**: pnpm (required)
- **Testing**: Vitest with happy-dom
- **Styling**: Global CSS styles
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
- Ignores: `dist/`, `node_modules/`, `**/*.d.ts`, `coverage/`, `.github/`, `public/`

### File Naming Conventions

- Use `.yaml` extension for YAML files (not `.yml`)
- Use `eslint.config.ts` for ESLint (not `.eslintrc.*`)

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
- Component testing for React components
- Coverage thresholds: 80% minimum
- Test files: `*.test.{ts,tsx}` or `*.spec.{ts,tsx}`

### Performance

- Code splitting with manual chunks for vendors
- Source maps in production for debugging
- Optimized for GitHub Pages hosting
- Modern ES2020+ target for smaller bundles

## Common Patterns

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

### API Integration

```typescript
// src/utils/github.ts
export const fetchRepositories = async (username: string) => {
  // GitHub API integration for fetching user repositories
};

export const fetchBlogPosts = async (repo: string) => {
  // Fetch blog posts from GitHub Issues with 'blog' label
};
```

### Hook Pattern

```typescript
// src/hooks/UseGitHub.ts (Note: Uses PascalCase naming)
import { useState, useEffect } from 'react';

export const useGitHub = () => {
  // Custom hook logic
  return { /* hook return */ };
};
```

## Repository Showcase Feature

The site includes GitHub API integration to showcase repositories:
- Fetches user repositories via `fetchRepositories()` function
- Displays repository metadata and links
- Supports blog posts from GitHub Issues labeled with 'blog'
- Simple routing structure: Home (`/`), Blog (`/blog`), Projects (`/projects`), About (`/about`)

## Development Guidelines

1. **Always use ESM imports** - No CommonJS (`require()`)
2. **Prefer default exports** for components (current pattern)
3. **Use TypeScript strict mode** - No `any` types
4. **Follow self-explanatory code commenting** as per project instructions
5. **Test coverage is mandatory** - Maintain 80%+ coverage
6. **Modern React patterns** - Hooks, function components, React 18 features

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

## Future Enhancements

Consider these areas for improvement:
- Dark/light theme toggle
- Blog post creation workflow
- Enhanced GitHub integration
- Performance monitoring
- Analytics integration
- SEO optimizations
- PWA features
