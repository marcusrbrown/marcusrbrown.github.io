# src/utils/

13 utility modules — 5 theme-specific, plus accessibility, analytics, blog/slug transforms, blog frontmatter validation, projects, preview-image paths, syntax highlighting, and schema validation.

## By Domain

### Theme System (5 files)

| Utility                | Role                                                                    |
| ---------------------- | ----------------------------------------------------------------------- |
| `preset-themes.ts`     | 12 preset theme definitions + search/filter helpers (`presetThemes:15`) |
| `theme-storage.ts`     | localStorage persistence — load/save theme mode, custom themes, library |
| `theme-validation.ts`  | Runtime theme object validation against schema                          |
| `theme-export.ts`      | Theme import/export (JSON serialization)                                |
| `theme-performance.ts` | Theme switching performance monitoring + metrics                        |

FOUC-prevention theme preload now lives at `public/scripts/theme-preloader.js` — a public static bootstrap executed directly by the browser (see `tests/scripts/static-bootstraps.test.ts`), not a `src/utils/` module. There is no TypeScript generator; the shipped script is the tested source of truth.

### Core Utilities (8 files)

| Utility                  | Role                                                                        |
| ------------------------ | --------------------------------------------------------------------------- |
| `accessibility.ts`       | Keyboard handlers, focus traps, screen reader announcements, reduced motion |
| `analytics.ts`           | Page view + interaction tracking                                            |
| `blog.ts`                | Browser-safe pure slug/blog transforms — slugify, resolution, collisions    |
| `blog-validation.ts`     | Node/build-time Ajv frontmatter schema validation (not browser-safe)        |
| `projects.ts`            | GitHub repo → project transforms, portfolio/site-repo filtering             |
| `preview-image-path.ts`  | Computes public project-preview image path from a repo id                   |
| `syntax-highlighting.ts` | Shiki integration — externalized from bundle via build config               |
| `schema-validation.ts`   | JSON schema validation against `src/schemas/theme.schema.json`              |

## Patterns

- **No barrel exports** — import directly: `import { presetThemes } from '../utils/preset-themes'`
- **Pure functions preferred** — side effects isolated to storage and DOM utilities
- **Theme chain**: `preset-themes` defines → `theme-validation` validates → `theme-storage` persists → `public/scripts/theme-preloader.js` applies
- **Blog validation split**: `blog.ts` holds browser-safe pure slug/blog transforms; `blog-validation.ts` is Node/build-time only (Ajv), used by scripts, not shipped to the client

## Testing

- **Location**: `tests/utils/` (14 test files — good coverage)
