# GitHub Copilot Instructions for mrbro.dev

## Project Overview

This is a developer portfolio website built with modern web technologies and deployed to GitHub Pages with the custom domain `mrbro.dev`. The project showcases GitHub repositories and serves as a development blog.

## Technical Stack

- **Framework**: React 18+ with TypeScript
- **Build Tool**: Vite 6+ (latest)
- **Package Manager**: pnpm (required)
- **Testing**: Vitest with happy-dom
- **Styling**: CSS Modules and global styles
- **Linting**: ESLint 9+ with flat config
- **Formatting**: Prettier via @bfra.me/eslint-config
- **Deployment**: GitHub Pages via GitHub Actions
- **Node.js**: v22+ LTS required

## Code Standards

### TypeScript Configuration

- Uses project references with `tsconfig.json`, `tsconfig.app.json`, and `tsconfig.node.json`
- Pure ESM modules only (`"type": "module"` in package.json)
- Strict TypeScript settings enabled
- Modern bundler resolution with Vite

### ESLint Configuration

- **IMPORTANT**: Uses flat config (`eslint.config.js`) not legacy `.eslintrc.*`
- Extends `@bfra.me/eslint-config` which includes Prettier
- No separate Prettier config needed - uses `"prettier": "@bfra.me/prettier-config"` in package.json
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
```

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
import { FC } from 'react';

interface ComponentNameProps {
  // Props interface
}

export const ComponentName: FC<ComponentNameProps> = ({ /* props */ }) => {
  return (
    <div>
      {/* Component JSX */}
    </div>
  );
};
```

### API Integration

```typescript
// src/utils/github.ts
export const fetchGitHubRepos = async (): Promise<Repository[]> => {
  // GitHub API integration
};
```

### Hook Pattern

```typescript
// src/hooks/useGitHub.ts
import { useState, useEffect } from 'react';

export const useGitHub = () => {
  // Custom hook logic
  return { /* hook return */ };
};
```

## Repository Showcase Feature

The site includes a special feature where repositories can be showcased at custom paths:
- `mrbro.dev/vbs/` maps to `https://github.com/marcusrbrown/vbs`
- Add new mappings in routing configuration
- Automatically fetch repository metadata from GitHub API

## Development Guidelines

1. **Always use ESM imports** - No CommonJS (`require()`)
2. **Prefer named exports** over default exports for components
3. **Use TypeScript strict mode** - No `any` types
4. **Follow self-explanatory code commenting** as per project instructions
5. **Test coverage is mandatory** - Maintain 80%+ coverage
6. **Modern React patterns** - Hooks, function components, React 18 features

## Dependencies Management

- Use exact versions for critical dependencies
- Keep dependencies up to date
- Prefer smaller, focused packages
- Use pnpm for package management (faster, more efficient)

## Troubleshooting

### Common Issues

1. **ESLint errors**: Ensure using flat config, not legacy
2. **TypeScript errors**: Check configuration is correct
3. **Build failures**: Verify Node.js v22+ and pnpm are used
4. **GitHub Pages**: Ensure workflow has correct permissions

### Debug Commands

```bash
pnpm install --frozen-lockfile  # Exact dependency install
pnpm build --debug             # Verbose build output
pnpm test --reporter=verbose    # Detailed test output
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
