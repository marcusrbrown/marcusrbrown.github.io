# src/hooks/

11 custom React hooks — compound return objects, strict types, no barrel exports.

## CRITICAL: PascalCase Filenames

- **Correct**: `UseTheme.ts`, `UseProjects.ts`, `UseScrollAnimation.ts`
- **Wrong**: `useTheme.ts`, `useProjects.ts`
- New hooks: `UseMyHook.ts` — PascalCase, always

## Hook Registry

| Hook | Description |
| --- | --- |
| `UseAnalytics.ts` | Route pageview state/readiness (`usePageviewTracking`); interaction events call the typed analytics adapter directly |
| `UseBlogPosts.ts` | Snapshot-backed blog post listing/lookup |
| `UsePageTitle.ts` | Dynamic document title with SEO meta |
| `UseParallax.ts` | Scroll-based parallax transforms |
| `UseProgressiveImage.ts` | Blurred placeholder → full-resolution transitions |
| `UseProjectFilter.ts` | Client-side filtering/sorting for project grids |
| `UseProjects.ts` | Snapshot-backed projects hook — synchronous, no loading/error states |
| `UseScrollAnimation.ts` | Intersection Observer triggers, respects `prefers-reduced-motion` |
| `UseSyntaxHighlighting.ts` | Shiki-based highlighting (externalized from bundle) |
| `UseTheme.ts` | **Primary hook** — wraps `ThemeContext`, 17-property `UseThemeReturn` interface |
| `UseThemeContext.ts` | Raw `ThemeContext` accessor — use `useTheme()` instead unless building the provider itself |

## Patterns

- **Compound returns**: All hooks return destructured objects, never single values or arrays
- **Explicit interfaces**: Every hook defines a return type interface in-file
- **Theme access**: Use `useTheme()` — never import `useThemeContext` directly
- **Projects/blog data**: Both are build-time snapshot reads (`projects-snapshot.json`, `blog-snapshot.json`) — no runtime API calls, no loading state
- **Analytics**: Keep route pageview state/readiness in `UseAnalytics.ts`; interaction events use the typed adapter in `src/utils/analytics.ts`, not interaction-tracking hooks

## Testing

- **Location**: `tests/hooks/` (9 of 11 hooks currently have matching test files)
- **Framework**: Vitest + React Testing Library
- **Untested**: `UseSyntaxHighlighting`, `UseThemeContext`
