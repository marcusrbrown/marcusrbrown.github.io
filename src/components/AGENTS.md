# src/components/

19 React 19+ components — PascalCase `.tsx` files, no barrel exports, direct file imports only.

## Organization

| Domain             | Components                                                                               |
| ------------------ | ---------------------------------------------------------------------------------------- |
| **Theme**          | `ThemePicker`, `ThemeCustomizer`, `ThemePreview`, `PresetThemeGallery`                   |
| **Content**        | `BlogPost`, `ProjectCard`, `AboutSection`                                                |
| **Layout**         | `Header`, `Footer`, `HeroSection`, `BackgroundPattern`, `LoadingStates`                  |
| **Interactive**    | `ProjectGallery`, `ProjectFilter`, `ProjectPreviewModal`, `SmoothScrollNav`, `CodeBlock` |
| **Infrastructure** | `AnalyticsTracker` — invisible, router-scoped pageview tracker (renders `null`)          |

## Patterns

- **Theme integration**: Via `useTheme` hook + CSS custom properties — no inline styles
- **Imports**: Direct file paths only (`import { Header } from './Header'`), no index.ts barrel
- **Exports**: Named exports only, no `export default`
- **Props types**: Interfaces defined in-file or `src/types/`

## Accessibility (WCAG 2.1 AA)

- All interactive elements keyboard-focusable with visible focus rings
- ARIA labels required for modals (`ProjectPreviewModal`) and toggles (`ThemePicker`)
- Animations must respect `prefers-reduced-motion`
- Maintain logical heading hierarchy within sections

## Testing Expectations

- **Unit**: Vitest tests in `tests/components/` (17 test files)
- **Visual**: Regression tests across themes in `tests/visual/`
- **A11y**: axe-core checks in `tests/accessibility/`
- Run `lsp_diagnostics` clean before commit
