import {defineConfig} from '@bfra.me/eslint-config'

export default defineConfig({
  name: 'marcusrbrown.github.io',
  ignores: ['.github/copilot-instructions.md', 'public/'],
  typescript: {
    tsconfigPath: './tsconfig.json',
  },
  // vitest: true,
})
