import {defineConfig} from '@bfra.me/eslint-config'

export default defineConfig(
  {
    name: 'marcusrbrown.github.io',
    ignores: ['.ai/', '.claude/', '.github/chatmodes/', 'AGENTS.md', 'CLAUDE.md', 'public/'],
    typescript: true,
    react: true,
    vitest: {
      overrides: {
        'vitest/no-conditional-expect': 'off',
        'vitest/prefer-lowercase-title': 'off',
      },
    },
  },
  {
    files: ['README.md'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
    },
  },
)
