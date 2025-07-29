import {defineConfig} from '@bfra.me/eslint-config'

export default defineConfig({
  name: 'marcusrbrown.github.io',
  ignores: ['.ai/', '.github/chatmodes/', '.github/copilot-instructions.md', 'public/'],
  typescript: {
    tsconfigPath: './tsconfig.json',
  },
  // vitest: true,
})
