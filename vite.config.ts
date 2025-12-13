import process from 'node:process'
import react from '@vitejs/plugin-react-swc'
import {defineConfig} from 'vite'

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
})
