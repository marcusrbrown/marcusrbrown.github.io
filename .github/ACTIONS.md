# GitHub Actions Documentation

This repository uses a comprehensive CI/CD pipeline with reusable actions for efficiency and maintainability.

## Workflows

### 🔧 CI Workflow (`.github/workflows/ci.yaml`)

Runs on:

- Pull requests to `main`
- Pushes to non-`main` branches
- Manual workflow dispatch

**Jobs:**

- **Setup**: Prepares Node.js, pnpm, and dependencies with caching
- **Lint**: ESLint validation and formatting checks
- **Test**: Unit tests with coverage reporting (80% threshold)
- **Build**: Production build validation
- **Type Check**: TypeScript compilation validation
- **Validate**: Security audit and dependency health checks
- **Matrix Test**: Cross-platform testing (Ubuntu, Windows, macOS)
- **Quality Gate**: Final validation and PR commenting

### 🚀 Deploy Workflow (`.github/workflows/deploy.yaml`)

Runs on:

- Pushes to `main` branch
- Manual workflow dispatch

Deploys to GitHub Pages at `mrbro.dev`.

### 🔄 Renovate Workflow (`.github/workflows/renovate.yaml`)

Automated dependency updates using Renovate bot.

## Reusable Actions

### 📦 Setup Action (`.github/actions/setup/action.yaml`)

A composite action that standardizes project setup across all workflows.

**Features:**

- ✅ Checkout with proper Git configuration
- ✅ pnpm v10.13.1 setup (pinned version)
- ✅ Node.js v22 with automatic caching
- ✅ Dependency installation with frozen lockfile
- ✅ Configurable inputs for flexibility
- ✅ Outputs for downstream job coordination

**Inputs:**

- `node-version` (default: '22'): Node.js version
- `install-dependencies` (default: 'true'): Whether to install deps
- `cache-key-suffix` (default: ''): Additional cache key suffix

**Outputs:**

- `node-version`: The Node.js version that was setup
- `cache-hit`: Whether pnpm cache was hit

**Usage:**

```yaml
- name: Setup project
  uses: ./.github/actions/setup
  with:
    node-version: '22'
    cache-key-suffix: ci
```

## Security & Best Practices

### 🔒 Security Features

- **Pinned Actions**: All actions use SHA hashes for security
- **Least Privilege**: Minimal required permissions
- **Dependency Auditing**: Security vulnerability scanning
- **Frozen Lockfiles**: Reproducible builds

### ⚡ Performance Optimizations

- **Smart Caching**: Node modules and pnpm cache
- **Parallel Jobs**: Independent jobs run concurrently
- **Conditional Logic**: Skip unnecessary steps
- **Artifact Management**: 7-day retention for build outputs

### 🎯 Quality Gates

- **80% Test Coverage**: Enforced via vitest configuration
- **ESLint Validation**: Code quality and formatting
- **TypeScript Strict**: Type safety validation
- **Cross-Platform Testing**: Ubuntu, Windows, macOS support

## Caching Strategy

The pipeline uses multiple caching layers:

1. **pnpm Cache**: Handled by `actions/setup-node`
2. **Node Modules**: Implicit via pnpm caching
3. **Build Artifacts**: 7-day retention for debugging

Cache keys include:

- OS and architecture
- Node.js version
- pnpm-lock.yaml hash
- Custom suffix when needed

## Monitoring & Debugging

### 📊 Artifacts

- **Build Output**: Production build files
- **Coverage Reports**: HTML and JSON coverage data
- **Test Results**: Detailed test execution logs

### 📈 Build Analysis & Job Summaries

The CI pipeline includes automated build analysis with rich markdown reporting:

- **Bundle Size Tracking**: Monitors JavaScript, CSS, and total bundle sizes
- **Performance Thresholds**: Automated warnings for large bundles
- **Asset Breakdown**: Detailed listing of largest files
- **GitHub Job Summaries**: Rich markdown reports visible in the Actions UI
- **Performance Status**: Color-coded indicators for bundle health

The build analysis script (`scripts/analyze-build.ts`) generates:

- Console output for immediate feedback
- GitHub Actions notices for quick status
- Detailed markdown job summaries with tables and charts
- Performance recommendations and warnings

### 🔍 Debugging Tips

1. Check the "Quality Gate" job for comprehensive status
2. Review individual job logs for specific failures
3. Download artifacts for local analysis
4. Use workflow dispatch for manual testing

## Dependencies

### Core Actions Used

- `actions/checkout@v4.2.2`: Repository checkout
- `actions/setup-node@v4.4.0`: Node.js environment
- `pnpm/action-setup@v4.1.0`: pnpm package manager
- `actions/configure-pages@v5`: GitHub Pages setup
- `actions/upload-artifact@v4.5.0`: Artifact management
- `actions/upload-pages-artifact@v3.0.1`: Pages deployment
- `actions/deploy-pages@v4.0.5`: Pages deployment

**Native GitHub CLI Integration:**

- Uses `gh` CLI for PR commenting instead of external actions
- Leverages `GITHUB_TOKEN` for authenticated operations
- Generates rich markdown job summaries automatically

All actions are pinned to specific SHA hashes for security and reproducibility.

## Workflow Triggers

### CI Triggers

```yaml
on:
  pull_request:
    branches: [main]
  push:
    branches-ignore: [main]
  workflow_dispatch:
```

### Deploy Triggers

```yaml
on:
  push:
    branches: [main]
  workflow_dispatch:
```

## Environment Variables

- `GITHUB_PAGES=true`: Set automatically during GitHub Pages builds
- `NODE_ENV=production`: Set during production builds

## Contributing

When modifying workflows:

1. **Test Changes**: Use workflow dispatch for testing
2. **Update Documentation**: Keep this README current
3. **Security Review**: Ensure SHA-pinned actions
4. **Performance Impact**: Consider CI execution time
5. **Cross-Platform**: Test on all supported platforms

## Troubleshooting

### Common Issues

**Cache Misses**: Clear caches in Settings > Actions > Caches **Permission Errors**: Check workflow permissions in repository settings **Build Failures**: Review the Quality Gate job for comprehensive status **Dependency Issues**: Check the Validate job for security audits

### Support

For workflow issues:

1. Check the Actions tab for detailed logs
2. Review this documentation
3. Open an issue for workflow-specific problems
