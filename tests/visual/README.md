# Visual Testing Documentation

This directory contains the visual regression testing infrastructure for the mrbro.dev portfolio website, implemented using Playwright's built-in visual testing capabilities.

## Overview

The visual testing system provides comprehensive screenshot-based regression testing across:

- **Multiple themes**: Light, dark, and custom theme variations
- **Responsive breakpoints**: Mobile (375px), tablet (768px), desktop (1440px), and large desktop (1920px)
- **UI components**: Header, footer, cards, modals, and interactive elements
- **Page layouts**: All main pages (Home, About, Blog, Projects)

## Structure

```txt
tests/visual/
├── playwright.config.ts          # Visual-specific Playwright configuration
├── utils.ts                      # Shared utilities and threshold configuration
├── components.spec.ts            # Component-level visual tests
├── baselines.spec.ts             # Baseline screenshot generation
├── responsive.spec.ts            # Responsive design visual tests
└── screenshots/                  # Generated screenshot baselines
    ├── *-light-theme.png
    ├── *-dark-theme.png
    └── *-responsive-*.png
```

## Configuration

### Visual Diff Thresholds

The system uses different threshold configurations optimized for different test scenarios:

```typescript
export const VISUAL_THRESHOLDS = {
  components: 0.08,   // Stricter for isolated UI components
  pages: 0.12,        // Standard for full page screenshots
  responsive: 0.15,   // More lenient for responsive breakpoint variations
  themes: 0.1,        // Moderate for theme switching tests
}
```

### Browser Configuration

Visual tests run on multiple browser projects:

- **Desktop Chromium**: 1440x900 (primary baseline)
- **Mobile Chromium**: 375x667 with touch support
- **Tablet Chromium**: 768x1024 with touch support
- **Large Desktop Chromium**: 1920x1080

## Usage

### Running Visual Tests

```bash
# Run all visual tests with current configuration
pnpm test:visual

# Run visual tests in headed mode (see browser)
pnpm test:visual:headed

# Update baselines (when intentional changes are made)
pnpm test:visual:update

# Run specific visual test file
playwright test:visual tests/visual/components.spec.ts
```

### Artifact Management

The visual testing system includes comprehensive artifact management:

```bash
# Analyze current artifact storage usage
pnpm test:visual:artifacts:analyze

# Clean old artifacts (dry run first)
pnpm test:visual:artifacts:clean --dry-run
pnpm test:visual:artifacts:clean

# Generate detailed artifact report
pnpm test:visual:artifacts:report

# General artifact management help
pnpm test:visual:artifacts help
```

### Artifact Management Features

The `visual-artifact-manager.mjs` script provides:

- **Storage Analysis**: Track total size and breakdown by directory
- **Retention Policies**: Automatic cleanup of old screenshots and reports
  - Screenshots: 30 days retention
  - Diff images: 7 days retention
  - Test reports: 14 days retention
  - Actual (failed) images: 3 days retention
- **Size Monitoring**: Warnings at 100MB, critical alerts at 500MB
- **Optimization**: Future support for compression and archiving

## Test Categories

### Component Tests (`components.spec.ts`)

- Header component across themes
- Footer component consistency
- Navigation states and interactions
- Modal and overlay components
- Card layouts and responsive behavior

### Baseline Tests (`baselines.spec.ts`)

- Systematic screenshot generation for all pages
- Theme variation coverage (light/dark)
- Component isolation and stability testing
- Custom theme application verification

### Responsive Tests (`responsive.spec.ts`)

- Breakpoint-specific layout verification
- Mobile navigation and touch interactions
- Tablet layout optimizations
- Large screen layout utilization

## Theme Integration

The visual tests are deeply integrated with the site's theme system:

```typescript
// Theme switching utility
await setThemeMode(page, 'dark')

// Wait for theme application
await waitForComponentStable(page, 'header')

// Theme-aware screenshot naming
await page.screenshot({ path: `header-${theme}-theme.png` })
```

### Theme Testing Coverage

- **Light Theme**: Default bright theme with high contrast
- **Dark Theme**: Dark mode with reduced eye strain
- **Custom Themes**: User-generated themes from the theme customizer
- **System Theme**: Automatic theme detection and switching

## Best Practices

### Adding New Visual Tests

1. **Use consistent naming**: `component-theme-variant.png`
2. **Apply appropriate thresholds**: Use `getThreshold(testType)` utility
3. **Ensure theme stability**: Always call `preparePageForVisualTest()`
4. **Wait for component stability**: Use `waitForComponentStable()` for dynamic content
5. **Test across breakpoints**: Include responsive variations where relevant

### Debugging Visual Failures

1. **Check diff images**: Look for `-diff.png` files in `test-results/`
2. **Compare actual vs expected**: Review `-actual.png` vs `-expected.png`
3. **Verify theme application**: Ensure theme switching completed before screenshot
4. **Check timing issues**: Add stability waits for animated components
5. **Update baselines**: Use `pnpm test:visual:update` for intentional changes

### CI/CD Integration

Visual tests integrate with the existing GitHub Actions workflow:

- Automatic baseline validation on PRs
- Artifact cleanup in CI environment
- Performance budget enforcement
- Cross-browser compatibility verification

## Troubleshooting

### Common Issues

**Theme switching not applied**

```bash
# Ensure theme utilities are properly implemented
await setThemeMode(page, 'dark')
await page.waitForTimeout(500) // Allow CSS transitions
```

**Flaky screenshot comparisons**

```bash
# Increase stability waiting
await waitForComponentStable(page, selector, 2000)
```

**Large artifact sizes**

```bash
# Run cleanup regularly
pnpm test:visual:artifacts:clean
```

**Baseline updates needed**

```bash
# Update after intentional UI changes
pnpm test:visual:update
```

### Configuration Issues

- **Viewport consistency**: Ensure viewport sizes match between test runs
- **Animation handling**: All animations are disabled by default in config
- **Font loading**: CSS font-display ensures consistent text rendering
- **Image loading**: Progressive image loading handled by test utilities

## Contributing

When adding new visual tests:

1. Follow the existing file naming patterns
2. Use the provided utility functions for consistency
3. Test across multiple themes and breakpoints
4. Update this documentation for new test categories
5. Run artifact analysis to monitor storage impact

For more information, see the main testing documentation in `/tests/README.md`.
