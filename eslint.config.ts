import {defineConfig} from '@bfra.me/eslint-config'

export default defineConfig(
  {
    name: 'marcusrbrown.github.io',
    ignores: ['.ai/', '.claude/', '.github/chatmodes/', 'AGENTS.md', '.github/copilot-instructions.md', 'public/'],
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
    // Disable rules incompatible with Markdown files and their virtual inline code block files.
    // The @eslint/markdown processor creates virtual files (e.g., README.md/0_0.tsx) that lack
    // TypeScript project context, causing type-aware rules to error. See: marcusrbrown/marcusrbrown.github.io#265
    files: ['**/*.md', '**/*.md/**'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
      'react/no-implicit-key': 'off',
      'react/no-leaked-conditional-rendering': 'off',
    },
  },
)
