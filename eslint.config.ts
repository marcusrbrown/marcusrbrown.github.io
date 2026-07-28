import {defineConfig} from '@bfra.me/eslint-config'

export default defineConfig(
  {
    name: 'marcusrbrown.github.io',
    ignores: [
      '.agents/skills/',
      '.ai/',
      '.claude/',
      '.github/chatmodes/',
      '.impeccable/',
      '.opencode/',
      'AGENTS.md',
      'DESIGN.md',
      'PRODUCT.md',
      'docs/brainstorms/',
      'docs/plans/',
      'docs/solutions/',
      'public/',
      'src/data/*.json',
    ],
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
