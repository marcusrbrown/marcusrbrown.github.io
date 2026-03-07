# marcusrbrown.com

[![Build Status](https://img.shields.io/github/actions/workflow/status/marcusrbrown/marcusrbrown.github.io/deploy.yaml?style=flat-square&label=Build)](https://github.com/marcusrbrown/marcusrbrown.github.io/actions) [![TypeScript](https://img.shields.io/badge/TypeScript-blue?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](https://opensource.org/licenses/MIT)

Personal brand site for **Marcus R. Brown** — Principal Software Engineer.

**Live**: [marcusrbrown.com](https://marcusrbrown.com)

## Tech Stack

- React 19+ with TypeScript (strict mode)
- Vite 7+ (pure ESM)
- pnpm 10.13.1+
- Node.js 22+

## Development

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm build        # Production build → dist/
pnpm preview      # Preview production build
pnpm lint         # ESLint 9 flat config
pnpm test         # Vitest unit tests
```

## Deployment

Automated via GitHub Actions on push to `main`. Deploys to GitHub Pages with custom domain `marcusrbrown.com`.

See [`.github/workflows/deploy.yaml`](.github/workflows/deploy.yaml) for the full CI/CD pipeline.

## Related

- **Portfolio**: [mrbro.dev](https://mrbro.dev) — full developer portfolio with projects, blog, and theme system

## License

[MIT](LICENSE)
