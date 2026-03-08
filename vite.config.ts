import process from 'node:process'
import react from '@vitejs/plugin-react-swc'
import {defineConfig} from 'vitest/config'

export default defineConfig({
  plugins: [react()],

  build: {
    outDir: 'dist',
    sourcemap: true,
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
    setupFiles: ['./src/test-setup.ts'],
  },
})
