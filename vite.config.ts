import process from 'node:process'
import react from '@vitejs/plugin-react-swc'
import {defineConfig} from 'vitest/config'

export default defineConfig({
  plugins: [react()],

  build: {
    outDir: 'dist',
    sourcemap: true,
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

  // Enable GitHub Pages environment variable detection
  define: {
    __GITHUB_PAGES__: JSON.stringify(process.env.GITHUB_PAGES === 'true'),
  },

  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: './tests/setup.ts',
    // Exclude E2E, visual, and performance tests - they should only run through Playwright
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/tests/e2e/**',
      '**/tests/visual/**',
      '**/tests/performance/**',
      '**/tests/accessibility/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}', '**/node_modules/**', '**/dist/**'],
      thresholds: {
        global: {
          statements: 80,
          branches: 80,
          functions: 80,
          lines: 80,
        },
      },
    },
  },
})
