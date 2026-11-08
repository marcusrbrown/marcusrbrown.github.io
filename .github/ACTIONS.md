# GitHub Actions Documentation

This repository uses a comprehensive CI/CD pipeline with reusable actions for efficiency and maintainability.

## Workflows

### 🔧 CI Workflow (`.github/workflows/ci.yaml`)

Runs on:

- Pull requests to `main`
- Manual workflow dispatch

**Jobs:**

- **Setup**: Prepares Node.js, pnpm, and dependencies with caching
- **Lint**: ESLint validation and formatting checks
- **Test**: Unit tests with coverage reporting (90% statements, 85% branches, 88% functions, 90% lines)
- **Build**: Production build validation
- **Type Check**: Both root and `.opencode/` TypeScript projects via `pnpm run check-types`
- **Validate**: Security audit and dependency health checks
- **Quality Gate**: Final validation and PR commenting

All CI jobs run on Ubuntu. Path filters gate unit tests, builds, and type checks independently; manual dispatch runs each gate.

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
- **Visual Regression**: Captures screenshots for manual comparison; the current specs do not assert screenshot baselines
- **Accessibility Tests**: Runs axe-core WCAG 2.1 AA audits across all pages
- **Test Summary**: Aggregates results and generates badge data
- **Notification**: Posts/updates a PR comment with pass/fail status for all suites

> **Note:** The E2E workflow uses `playwright.config.ts` which sets `retries: 2` on CI, absorbing transient network flakiness automatically.

### Performance Testing Workflow (`.github/workflows/performance.yaml`)

Runs on pushes and pull requests to `main`, manual dispatch, and Mondays at 06:00 UTC (`0 6 * * 1`). Pull-request path filters gate the expensive audit steps; other events run the full audit.

- **Performance Audit**: Independent desktop/mobile matrix jobs with 20-minute deadlines build the site, analyze absolute bundle budgets, run Lighthouse assertions and budget validation, then check relative regressions against a cached main-branch baseline before running theme-switching tests.
- **Baselines**: Each device restores `performance-baseline.json` from its main-branch cache prefix. Only non-PR runs on `main` may save a baseline. Download caches described below are separate from this regression evidence.
- **Performance Summary**: Aggregates device artifacts and reports the audit result. Passing absolute bundle budgets does not establish that the relative regression gate passed; inspect the failing device step before diagnosing a shared PR failure.

### Fro Bot Live Audit Lane (`.github/workflows/fro-bot.yaml`)

The existing `Fro Bot` job remains the generic required check. Its dedicated live-audit lane is report-only and runs as `live-audit-preflight` → `live-audit-discovery` / finalizer → `live-audit-reporter`:

- **Triggers:** the existing `30 3 * * *` UTC schedule, `workflow_dispatch` with `mode: live-audit` and a closed `live-audit-slot` choice, and the exact authorized issue-local command `@fro-bot validate #N`.
- **Write mode:** `LIVE_AUDIT_WRITE_MODE` defaults to `disabled`; `manual-only` permits approved manual writes while schedules remain dry-run; `enabled` permits both. A live-audit dispatch always forces `disabled`.
- **Permissions:** preflight/discovery have `contents: read` and `issues: read`; the reporter alone has `contents: write` and `issues: write`, with no pull-request or discussion write permission. Discovery receives the model-auth secrets; reporter does not.
- **Discovery token boundary:** The SHA-pinned discovery action in `.github/workflows/fro-bot.yaml` receives `github-token: ${{ github.token }}`. Scheduled and `workflow_dispatch` executions provide that ephemeral, job-scoped read-only token to the model/runtime; `response-mode: none` prevents intentional action responses. The dedicated lane supplies no `FRO_BOT_PAT` or new long-lived token. This is not credential-free isolation: the fixed no-GitHub-use prompt rule is defense in depth, not a hard API boundary.
- **Handoff:** discovery writes a fixed run-scoped workspace to a canonical Actions artifact with 7-day retention. The reporter downloads that exact artifact into a fresh workspace and publishes only verified context/crop PNGs to the rolling `live-audit-evidence` release before issue mutation. The reporter emits bounded, token-redacted failure diagnostics to stderr, and its `reporter-result.json` is uploaded with `always()` and 7-day retention even when the reporter exits 1.
- **Concurrency:** `live-audit-reporter` uses a non-cancelling concurrency group; GitHub permits one active and one pending reporter run, not a durable queue. A newer pending run can replace an older pending run, so displaced approved operations require visible diagnostics and a manual rerun.

See the [live-audit evidence runbook](../docs/live-audit-evidence.md) for the contract, retention, lifecycle, rollout gates, and emergency disable procedure.

### 📰 Blog Refresh Workflow (`.github/workflows/blog-refresh.yaml`)

Runs on:

- Daily schedule (`45 6 * * *` UTC — off-hour, staggered from Fro Bot and Performance Testing)
- Manual workflow dispatch

**Jobs:**

- **Refresh**: Runs `pnpm run blog-refresh`, `pnpm run project-preview-refresh`, and `pnpm run projects-refresh` to fetch gists/repos, validate, render, and write `src/data/blog-snapshot.json`, `public/project-previews/`, and `src/data/projects-snapshot.json`. The projects snapshot makes `/projects` fully static — the browser no longer calls the GitHub API at runtime, so visitors never hit the anonymous rate limit. If content changed, it commits as `mrbro-bot[bot]`, force-updates the fixed bot branch `chore/blog-refresh`, and opens (or updates in place) one rolling content PR against `main`. `main` is a protected branch, so the refresh cannot push directly — the content lands through the PR, which you merge manually to trigger Deploy. No diff means no commit and no PR.

**Permissions:** `contents: read` for the default `GITHUB_TOKEN` (the project-preview step reads the Repos API with it). All writes — the content branch push and the PR create/edit — are performed by a scoped `mrbro-bot` app installation token (minted via `actions/create-github-app-token` from `APPLICATION_ID`/`APPLICATION_PRIVATE_KEY`, matching CI/E2E), which the workflow `permissions` block does not govern.

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

### Impeccable (`.agents/skills/impeccable/SKILL.md`)

Frontend design and review guidance for hierarchy, typography, accessibility, responsive behavior, and theming. Its project-local scripts support design audits and live-edit tooling; `.opencode/` contains the separately type-checked hook bridge. Browser-backed visual discovery in scheduled automation belongs to the dedicated live-audit lane described above.

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

- ✅ Uses the caller's existing checkout (run checkout before invoking this action)
- ✅ pnpm setup using the version pinned in `package.json`'s `packageManager` field
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

- **Smart Caching**: pnpm store and optional Playwright browser downloads
- **Parallel Jobs**: Independent jobs run concurrently
- **Conditional Logic**: Skip unnecessary steps
- **Artifact Management**: 7-day retention for build outputs

### 🎯 Quality Gates

- **Per-Metric Test Coverage**: 90% statements, 85% branches, 88% functions, 90% lines, enforced in `vite.config.ts`
- **ESLint Validation**: Code quality and formatting
- **TypeScript Strict**: Type safety validation
- **CI Runner**: Ubuntu; no Windows/macOS matrix is configured

## Caching Strategy

The setup action caches downloads rather than installed dependencies:

1. **pnpm Store**: `actions/setup-node` caches pnpm's package store using `pnpm-lock.yaml` as the dependency key input. A cache hit does not restore `node_modules`; `pnpm install --frozen-lockfile` still runs when dependency installation is enabled.
2. **Playwright Browsers**: When `install-playwright` is enabled, `actions/cache` caches `~/.cache/ms-playwright` under `playwright-${{ runner.os }}-${{ steps.playwright-version.outputs.version }}`. Linux system dependencies and the browser installation check still run after a cache hit.

Build outputs are transferred between jobs as artifacts, with 7-day retention for debugging; they are separate from these download caches. See [the setup action](actions/setup/action.yaml) for the authoritative cache inputs and keys.

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

- `actions/checkout`: Repository checkout
- `actions/setup-node`: Node.js environment
- `pnpm/action-setup`: pnpm package manager
- `actions/configure-pages`: GitHub Pages setup
- `actions/upload-artifact`: Artifact management
- `actions/upload-pages-artifact`: Pages deployment
- `actions/deploy-pages`: Pages deployment

The authoritative SHA pins and version comments live in [the workflows](workflows/) and [the setup action](actions/setup/action.yaml).

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

### 📊 Analytics Website ID (`UMAMI_WEBSITE_ID`)

See the [analytics operator runbook](../docs/analytics.md) for the complete activation gate, privacy contract, verification matrix, activation record, and rollback procedure.

Current posture is **disabled**: `UMAMI_WEBSITE_ID` must remain unset while the self-hosted Umami service has indefinite retention. It is mapped to the public Vite variable `VITE_UMAMI_WEBSITE_ID` only on the `Build project` step; configured production builds inject the tracker, while development and unconfigured production builds do not.

Activation requires reviewed, version-controlled `marcusrbrown/infra` evidence for 13-month rolling retention, an identified site deployment, and a passing go/no-go review. Rollback removes the variable, redeploys, and verifies both the tracker tag is absent and `/privacy` reports analytics disabled. A stale Pages artifact or disagreement between the live tag and `/privacy` leaves rollback incomplete.

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
