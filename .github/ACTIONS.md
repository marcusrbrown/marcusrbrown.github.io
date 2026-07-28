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

### 🧪 E2E Tests Workflow (`.github/workflows/e2e-tests.yaml`)

Runs on:

- Pull requests to `main`
- Manual workflow dispatch

**Jobs:**

- **Setup**: Installs Playwright browsers and caches them via the composite action
- **Build for Tests**: Builds the site for serving during E2E test runs
- **E2E Tests**: Runs Playwright functional tests (matrix: chromium)
- **Visual Regression**: Runs screenshot-based visual comparison tests
- **Accessibility Tests**: Runs axe-core WCAG 2.1 AA audits across all pages
- **Test Summary**: Aggregates results and generates badge data
- **Notification**: Posts/updates a PR comment with pass/fail status for all suites

> **Note:** The E2E workflow uses `playwright.config.ts` which sets `retries: 2` on CI, absorbing transient network flakiness automatically.

### Fro Bot Live Audit Lane (`.github/workflows/fro-bot.yaml`)

The existing `Fro Bot` job remains the generic required check. Its dedicated live-audit lane is report-only and runs as `live-audit-preflight` → `live-audit-discovery` / finalizer → `live-audit-reporter`:

- **Triggers:** the existing `30 3 * * *` UTC schedule, `workflow_dispatch` with `mode: live-audit` and a closed `live-audit-slot` choice, and the exact authorized issue-local command `@fro-bot validate #N`.
- **Write mode:** `LIVE_AUDIT_WRITE_MODE` defaults to `disabled`; `manual-only` permits approved manual writes while schedules remain dry-run; `enabled` permits both. A live-audit dispatch always forces `disabled`.
- **Permissions:** preflight/discovery have `contents: read` and `issues: read`; the reporter alone has `contents: write` and `issues: write`, with no pull-request or discussion write permission. Discovery receives the model-auth secrets; reporter does not.
- **Discovery token boundary:** Pinned `fro-bot/agent@v0.93.1` requires `github-token: ${{ github.token }}`. Scheduled and `workflow_dispatch` executions provide that ephemeral, job-scoped read-only token to the model/runtime; `response-mode: none` prevents intentional action responses. The dedicated lane supplies no `FRO_BOT_PAT` or new long-lived token. This is not credential-free isolation: the fixed no-GitHub-use prompt rule is defense in depth, not a hard API boundary.
- **Handoff:** discovery writes a fixed run-scoped workspace to a canonical Actions artifact with 7-day retention. The reporter downloads that exact artifact into a fresh workspace and publishes only verified context/crop PNGs to the rolling `live-audit-evidence` release before issue mutation. The reporter emits bounded, token-redacted failure diagnostics to stderr, and its `reporter-result.json` is uploaded with `always()` and 7-day retention even when the reporter exits 1.
- **Concurrency:** `live-audit-reporter` uses a non-cancelling concurrency group; GitHub permits one active and one pending reporter run, not a durable queue. A newer pending run can replace an older pending run, so displaced approved operations require visible diagnostics and a manual rerun.

See the [live-audit evidence runbook](../docs/live-audit-evidence.md) for the contract, retention, lifecycle, rollout gates, and emergency disable procedure.

### 📰 Blog Refresh Workflow (`.github/workflows/blog-refresh.yaml`)

Runs on:

- Daily schedule (`45 6 * * *` UTC — off-hour, staggered from Fro Bot and Performance Testing)
- Manual workflow dispatch

**Jobs:**

- **Refresh**: Runs `pnpm run blog-refresh` to fetch gists, validate, render, and write `src/data/blog-snapshot.json`; if the snapshot changed, commits with the static message `chore(blog): refresh content snapshot` and pushes to `main` (fetch + rebase before push, one retry on rejection, never force-push); no diff means no commit and no deploy trigger

**Permissions:** `contents: write` only (minimal scope for committing the snapshot).

**Gist auth:** The Gists REST API rejects the Actions `GITHUB_TOKEN` (a GitHub App installation token) with `403`, so the blog step authenticates with `secrets.BLOG_REFRESH_TOKEN` — a fine-grained PAT with read-only Gists access. If that secret is unset, the script falls back to unauthenticated requests, which succeed for public gists but share the runner IP's 60 req/hr limit. The project-preview step keeps `GITHUB_TOKEN` (the Repos API accepts App tokens).

**Concurrency:** Single group `blog-refresh`, `cancel-in-progress: false` — prevents overlapping refresh runs from racing on the push.

### 🔄 Renovate Workflow (`.github/workflows/renovate.yaml`)

Automated dependency updates using Renovate bot.

## Agent Skills (`.agents/skills/`)

Agent skills empower Copilot and Fro Bot to interact with the site programmatically. Skills follow the [Agent Skills specification](https://agentskills.io/specification) and live in `.agents/skills/`.

### 🌐 agent-browser (`.agents/skills/agent-browser/SKILL.md`)

CLI-based browser automation via the project-local `pnpm exec agent-browser`. Use for:

- Navigating pages and capturing screenshots
- Checking for JavaScript errors and broken assets
- Verifying theme switching behavior
- Comparing deployed vs local preview builds
- Spot-checking WCAG compliance visually

### 🎭 playwright-mcp (`.agents/skills/playwright-mcp/SKILL.md`)

Accessibility-tree-based browser automation via the Playwright MCP server. Use for:

- Full WCAG 2.1 AA audits (navigate → snapshot → assert landmark structure)
- Verifying navigation flows work end-to-end
- Checking responsive behavior at specific viewports
- Smoke-testing the deployed site after each deploy

**MCP Configuration:**

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"]
    }
  }
}
```

## Reusable Actions

### 📦 Setup Action (`.github/actions/setup/action.yaml`)

A composite action that standardizes project setup across all workflows.

**Features:**

- ✅ Checkout with proper Git configuration
- ✅ pnpm v11.1.3 setup (derived from `package.json`'s `packageManager` field)
- ✅ Node.js v24 with automatic caching
- ✅ Dependency installation with frozen lockfile
- ✅ Optional checksum-verified `agent-browser` acquisition on Linux x64
- ✅ Configurable inputs for flexibility
- ✅ Outputs for downstream job coordination

**Inputs:**

- `node-version` (default: '24'): Node.js version
- `install-dependencies` (default: 'true'): Whether to install deps
- `install-playwright` (default: 'false'): Whether to install Playwright browsers
- `install-agent-browser` (default: 'false'): Install the Linux x64 `agent-browser` binary with SHA-256 verification
- `playwright-browsers` (default: 'chromium'): Playwright browsers to install (space-separated)

**Outputs:**

- `node-version`: The Node.js version that was setup
- `cache-hit`: Whether pnpm cache was hit
- `playwright-version`: The Playwright version (empty if install-playwright is false)
- `playwright-cache-hit`: Whether Playwright browser cache was hit

**Usage:**

```yaml
- name: Setup project
  uses: ./.github/actions/setup

# With Playwright for E2E testing:
- name: Setup project with Playwright
  uses: ./.github/actions/setup
  with:
    install-playwright: "true"

# With deterministic agent-browser setup:
- name: Setup project with agent-browser
  uses: ./.github/actions/setup
  with:
    install-agent-browser: "true"
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
