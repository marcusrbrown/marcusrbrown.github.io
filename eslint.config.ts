import {defineConfig} from '@bfra.me/eslint-config'

export default defineConfig({
  name: 'marcusrbrown.github.io',
  ignores: ['.ai/', '.github/chatmodes/', '.github/copilot-instructions.md', 'public/'],
  typescript: true,
  react: true,
  vitest: {
    overrides: {
      'vitest/prefer-lowercase-title': 'off',
    },
  },
})
