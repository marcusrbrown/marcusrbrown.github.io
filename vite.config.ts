import type {HtmlTagDescriptor} from 'vite'
import path from 'node:path'
import process from 'node:process'
import react from '@vitejs/plugin-react-swc'
import {defineConfig} from 'vitest/config'

/**
 * Self-hosted Umami tracker script origin (see docs/analytics.md).
 * `metrics.fro.bot` is the only permitted analytics script/connect origin.
 */
export const UMAMI_SCRIPT_URL = 'https://metrics.fro.bot/script.js'

const UMAMI_WEBSITE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/**
 * Resolves the optional Umami website ID without normalizing malformed input.
 * Empty configuration disables Umami; every other value must be a canonical UUID.
 */
export const resolveUmamiWebsiteId = (websiteId: string | undefined): string | undefined => {
  if (websiteId === undefined || websiteId === '') return undefined

  if (!UMAMI_WEBSITE_ID_PATTERN.test(websiteId)) {
    throw new Error(
      'Invalid VITE_UMAMI_WEBSITE_ID: expected a canonical lowercase UUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx).',
    )
  }

  return websiteId
}

/** Build/mode inputs that decide whether the Umami tracker tag is injected. */
export interface UmamiInjectionInput {
  command: 'build' | 'serve'
  mode: string
  /** Value of `VITE_UMAMI_WEBSITE_ID`; absent or empty disables the tracker. */
  websiteId: string | undefined
}

/**
 * The tracker is injected only for a production build with a non-empty website ID.
 * Development or unconfigured production builds never receive the tag.
 */
export const shouldInjectUmamiTracker = ({command, mode, websiteId}: UmamiInjectionInput): boolean =>
  command === 'build' && mode === 'production' && resolveUmamiWebsiteId(websiteId) !== undefined

/**
 * Builds the single hardened `<script>` tag descriptor for the configured production build.
 * Async so analytics cannot delay rendering; DNT, search/hash exclusion, and automatic
 * pageviews are fixed and non-configurable.
 */
export const buildUmamiTrackerTag = (websiteId: string): HtmlTagDescriptor => ({
  tag: 'script',
  injectTo: 'head',
  attrs: {
    src: UMAMI_SCRIPT_URL,
    async: true,
    'data-website-id': websiteId,
    'data-do-not-track': 'true',
    'data-exclude-search': 'true',
    'data-exclude-hash': 'true',
    'data-auto-pageview': 'false',
  },
})

// E2E fixture mechanism (see docs/plans/2026-07-17-001-feat-first-party-blog-plan.md,
// Unit 6 KTD): when BLOG_SNAPSHOT is set, alias the snapshot import to that path so
// test builds are deterministic and independent of the committed data file. Default
// (unset) resolves to the committed `src/data/blog-snapshot.json` — no runtime switching.
const blogSnapshotAlias = process.env.BLOG_SNAPSHOT
  ? [{find: '../data/blog-snapshot.json', replacement: path.resolve(process.cwd(), process.env.BLOG_SNAPSHOT)}]
  : []

// Same fixture mechanism for the projects snapshot: when PROJECTS_SNAPSHOT is set,
// alias the snapshot import so test builds are deterministic and independent of the
// committed data file. Default (unset) resolves to `src/data/projects-snapshot.json`.
const projectsSnapshotAlias = process.env.PROJECTS_SNAPSHOT
  ? [{find: '../data/projects-snapshot.json', replacement: path.resolve(process.cwd(), process.env.PROJECTS_SNAPSHOT)}]
  : []

// Directories that are Node-only tooling/automation tests (no DOM needed) rather than
// application/component tests. Kept as a single source of truth so the Node project's
// `include` and the DOM project's `exclude` can never drift apart (see #383).
const NODE_TEST_DIRS = ['tests/scripts', 'tests/copilot-hooks', '.opencode/impeccable']

const VITEST_DEFAULT_INCLUDE = '**/*.{test,spec}.?(c|m)[jt]s?(x)'

// Excludes shared by every project: build output, worktrees, and Playwright-only suites
// that must not be picked up by `vitest run`.
const SHARED_TEST_EXCLUDE = [
  '**/node_modules/**',
  '**/dist/**',
  '**/.worktrees/**',
  '**/tests/e2e/**',
  '**/tests/visual/**',
  '**/tests/performance/**',
  '**/tests/accessibility/**',
]

export default defineConfig(({command, mode}) => {
  const websiteId = resolveUmamiWebsiteId(process.env.VITE_UMAMI_WEBSITE_ID)
  const umamiEnabled = command === 'build' && mode === 'production' && websiteId !== undefined

  return {
    plugins: [
      react(),
      {
        name: 'umami-tracker-injection',
        transformIndexHtml() {
          if (!umamiEnabled || websiteId === undefined) {
            return undefined
          }
          return [buildUmamiTrackerTag(websiteId)]
        },
      },
    ],

    resolve: {
      alias: [...blogSnapshotAlias, ...projectsSnapshotAlias],
    },

    build: {
      outDir: 'dist',
      // No prod source maps: ~2MB of .map files visitors never fetch. Source is public on GitHub.
      sourcemap: false,
      rollupOptions: {
        external: ['shiki', '@shikijs/core', '@shikijs/transformers'],
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('@shikijs')) return 'shiki'
              if (id.includes('highlight.js')) return 'highlight'
              if (id.includes('react') || id.includes('react-dom')) return 'vendor'
              return 'vendor'
            }
            return undefined
          },
        },
      },
    },

    // GitHub Pages deployment with custom domain
    base: '/',

    // Enable GitHub Pages and Umami build-time globals
    define: {
      __GITHUB_PAGES__: JSON.stringify(process.env.GITHUB_PAGES === 'true'),
      __UMAMI_ENABLED__: JSON.stringify(umamiEnabled),
    },

    test: {
      globals: true,
      // Split into Node and DOM projects (#383): tooling/automation specs under
      // NODE_TEST_DIRS import Node-only packages (e.g. @playwright/test) that happy-dom
      // has no business seeing, and previously all inherited the happy-dom default. Each
      // project's `include`/`exclude` is derived from NODE_TEST_DIRS so the two sets stay
      // mutually exclusive and every spec is selected exactly once.
      projects: [
        {
          extends: true,
          test: {
            name: 'node',
            environment: 'node',
            setupFiles: ['./tests/setup.shared.ts'],
            include: NODE_TEST_DIRS.map(dir => `${dir}/**/${VITEST_DEFAULT_INCLUDE}`),
            exclude: SHARED_TEST_EXCLUDE,
          },
        },
        {
          extends: true,
          test: {
            name: 'dom',
            environment: 'happy-dom',
            environmentOptions: {
              happyDOM: {
                settings: {
                  disableCSSFileLoading: true,
                  disableJavaScriptFileLoading: true,
                },
              },
            },
            setupFiles: ['./tests/setup.ts'],
            include: [VITEST_DEFAULT_INCLUDE],
            exclude: [...SHARED_TEST_EXCLUDE, ...NODE_TEST_DIRS.map(dir => `${dir}/**`)],
          },
        },
      ],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json-summary', 'html'],
        // Vitest matches coverage globs against absolute filenames with `contains: true`.
        // Anchor this glob to the project root so a checkout under a parent `src/` directory
        // cannot accidentally include unrelated scripts and tooling files.
        include: [path.resolve(process.cwd(), 'src/**/*.{ts,tsx}')],
        exclude: [
          '**/*.test.{ts,tsx}',
          '**/*.spec.{ts,tsx}',
          '**/node_modules/**',
          '**/dist/**',
          'src/types/**',
          'src/vite-env.d.ts',
        ],
        // Calibrated below measured src-only coverage; raise as coverage improves.
        thresholds: {
          statements: 90,
          branches: 85,
          functions: 88,
          lines: 90,
        },
      },
    },
  }
})
