# mrbro.dev

[![Build Status](https://img.shields.io/github/actions/workflow/status/marcusrbrown/marcusrbrown.github.io/deploy.yaml?style=flat-square&label=Build)](https://github.com/marcusrbrown/marcusrbrown.github.io/actions) [![Open in GitHub Codespaces](https://img.shields.io/badge/Codespaces-Open-blue?style=flat-square&logo=github)](https://codespaces.new/marcusrbrown/marcusrbrown.github.io?hide_repo_select=true&ref=main&quickstart=true) ![Node version](https://img.shields.io/badge/Node.js->=22-3c873a?style=flat-square) [![TypeScript](https://img.shields.io/badge/TypeScript-blue?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](https://opensource.org/licenses/MIT)

⭐ If you like this project, star it on GitHub — it helps a lot!

[Features](#features) • [Getting Started](#getting-started) • [Technology Stack](#technology-stack) • [Architecture](#architecture) • [Deployment](#deployment)

A modern, high-performance developer portfolio built with React 19+, TypeScript, and Vite. Features an advanced theme system, GitHub API integration, and automated deployment to GitHub Pages with the custom domain [mrbro.dev](https://mrbro.dev).

> [!NOTE] **Modern Architecture**: This project uses pure ESM modules, React 19+, and cutting-edge tooling for optimal performance and developer experience.

## Features

- **🎨 Advanced Theme System** - Custom theme creator with 10+ preset themes (Material, Dracula, Nord, Solarized), import/export functionality, and JSON schema validation
- **📱 GitHub Integration** - Dynamic repository showcase and blog system powered by GitHub Issues API
- **💻 Syntax Highlighting** - Theme-aware code blocks with Shiki supporting 15+ programming languages
- **⚡ Performance Optimized** - Bundle analysis, code splitting, modern ES2020+ target, and automated performance monitoring
- **🚀 Modern Stack** - React 19, TypeScript strict mode, Vite 7+, React Router v7+, and pnpm package management
- **📊 Comprehensive Testing** - 80%+ test coverage with Vitest, happy-dom, and automated CI/CD pipeline
- **🎯 Developer Experience** - Git hooks with lint-staged, ESLint 9+ flat config, and Prettier integration
- **📈 Build Analytics** - Automated bundle size analysis with GitHub Actions job summaries

## Getting Started

There are multiple ways to get started with this project.

The quickest way is to use [GitHub Codespaces](#github-codespaces) that provides a preconfigured environment for you. Alternatively, you can [set up your local environment](#local-environment) following the instructions below.

### GitHub Codespaces

You can run this project directly in your browser by using GitHub Codespaces, which will open a web-based VS Code:

[![Open in GitHub Codespaces](https://img.shields.io/static/v1?style=flat-square&label=GitHub+Codespaces&message=Open&color=blue&logo=github)](https://codespaces.new/marcusrbrown/marcusrbrown.github.io?hide_repo_select=true&ref=main&quickstart=true)

### VSCode Dev Container

A similar option to Codespaces is VS Code Dev Containers, that will open the project in your local VS Code instance using the [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers).

You will also need to have [Docker](https://www.docker.com/get-started/) installed on your machine to run the container.

### Local Environment

You need to install following tools to work on your local machine:

- [Node.js v22+](https://nodejs.org/en/download)
- [pnpm v10.13.1+](https://pnpm.io/installation) _(required package manager)_
- [Git](https://git-scm.com/downloads)

Then you can get the project code:

1. **Clone the repository**:

   ```bash
   git clone https://github.com/marcusrbrown/marcusrbrown.github.io.git
   ```

2. **Navigate to the project directory**:

   ```bash
   cd marcusrbrown.github.io
   ```

3. **Install dependencies**:

   ```bash
   pnpm install
   ```

4. **Run the development server**:

   ```bash
   pnpm dev
   ```

5. **Open your browser** and visit `http://localhost:5173` to see the portfolio in action.

## Technology Stack

### Core Technologies

- **React 19+** - Latest React with concurrent features and modern hooks
- **TypeScript** - Strict type checking with modern ES2020+ target
- **Vite 7+** - Lightning-fast build tool with HMR and optimized production builds
- **React Router v7+** - Modern client-side routing with data loading
- **pnpm** - Fast, disk space efficient package manager

### Theme System

- **Custom Theme Engine** - Advanced theming with CSS custom properties
- **Preset Collection** - 10+ professionally designed themes
- **Schema Validation** - JSON schema validation with Ajv for theme import/export
- **WCAG Compliance** - All themes meet WCAG 2.1 AA contrast requirements

### Development Tools

- **ESLint 9+** - Modern flat config with comprehensive rules
- **Prettier** - Code formatting with 120-proof config
- **Vitest** - Fast unit testing with happy-dom environment
- **Simple Git Hooks** - Automated code quality enforcement
- **Shiki** - Advanced syntax highlighting with theme integration

### Build & Deployment

- **GitHub Actions** - Comprehensive CI/CD with matrix testing
- **GitHub Pages** - Static hosting with custom domain support
- **Bundle Analysis** - Automated performance monitoring and alerts
- **Cross-Platform Testing** - Ubuntu, Windows, macOS compatibility

## Architecture

### Theme System Architecture

The project implements a comprehensive theme system using Context + Hook pattern:

```typescript
// Advanced theme management with custom creation, presets, and persistence
const { currentTheme, themeMode, toggleTheme, setCustomTheme } = useTheme()
```

**Key Features:**

- **Custom Theme Creator** - Full HSL color controls with real-time preview
- **Preset Gallery** - Curated collection including GitHub, Material, Nord, Solarized themes
- **Import/Export** - JSON-based theme sharing with validation
- **Performance Optimized** - CSS custom property updates with reduced motion support

### GitHub API Integration

Direct fetch API implementation for dynamic content:

```typescript
// Repository showcase and blog system
const repositories = await fetchRepositories('marcusrbrown')
const blogPosts = await fetchBlogPosts('marcusrbrown/marcusrbrown.github.io')
```

**Features:**

- **Repository Display** - Automatic showcase of GitHub projects
- **Blog System** - GitHub Issues with 'blog' label converted to blog posts
- **No External Dependencies** - Pure fetch API implementation

### Code Quality Architecture

- **Git Hooks Integration** - Automatic ESLint fixes and formatting on commit
- **Comprehensive Testing** - 80%+ coverage with component and integration tests
- **Performance Monitoring** - Bundle size tracking with automated warnings
- **Cross-Platform CI** - Matrix testing across multiple operating systems

## Deployment

### GitHub Pages Setup

The site is automatically deployed to GitHub Pages using GitHub Actions:

- **Custom Domain**: [mrbro.dev](https://mrbro.dev)
- **Automatic Deployment**: Triggered on push to main branch
- **Build Analysis**: Comprehensive bundle size reporting
- **Performance Monitoring**: Automated warnings for bundle size thresholds

### Environment Configuration

- `GITHUB_PAGES=true` - Automatically set by GitHub Actions
- Custom domain configured via `CNAME` file
- SHA-pinned actions for security

## Development

### Available Scripts

```bash
pnpm install        # Install dependencies with frozen lockfile
pnpm dev           # Start development server with HMR
pnpm build         # Build for production with type checking
pnpm preview       # Preview production build locally
pnpm test          # Run test suite with coverage
pnpm lint          # Lint codebase with ESLint
pnpm fix           # Auto-fix linting issues
pnpm setup-hooks   # Manually setup git hooks
```

### Code Quality

The project enforces high code quality standards:

- **Automatic Git Hooks** - ESLint fixes and Prettier formatting on commit
- **Strict TypeScript** - No `any` types, comprehensive type checking
- **Test Coverage** - Minimum 80% coverage requirement
- **Modern Standards** - ESM-only, React 19 patterns, performance best practices

### Performance Guidelines

- **JavaScript bundles** should stay under 500KB (warnings generated above this)
- **Total bundle size** should stay under 2MB maximum
- **Build analysis** automatically tracks and reports size metrics
- **Performance optimizations** include code splitting and modern ES2020+ target

## Resources

Here are some resources to learn more about the technologies used:

- [React 19 Documentation](https://react.dev) - Latest React features and patterns
- [TypeScript Handbook](https://www.typescriptlang.org/docs/) - TypeScript language reference
- [Vite Guide](https://vitejs.dev/guide/) - Modern build tool documentation
- [Vitest Documentation](https://vitest.dev) - Fast unit testing framework
- [GitHub Pages](https://pages.github.com) - Static site hosting documentation
- [pnpm Documentation](https://pnpm.io) - Efficient package management

## Troubleshooting

### Common Issues

1. **Node.js Version** - Ensure you're using Node.js v22+ LTS
2. **Package Manager** - This project requires pnpm, not npm or yarn
3. **Git Hooks** - Run `pnpm run setup-hooks` if pre-commit hooks aren't working
4. **Build Errors** - Check that all dependencies are installed with `pnpm install --frozen-lockfile`

### Debug Commands

```bash
pnpm install --frozen-lockfile  # Exact dependency install
pnpm build --debug             # Verbose build output
pnpm test --reporter=verbose    # Detailed test output
pnpm run setup-hooks           # Reinstall git hooks
```

> [!TIP] **Performance**: The build analysis script provides detailed bundle metrics and optimization suggestions in GitHub Actions job summaries.
