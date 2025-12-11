# Testing Documentation

This document provides comprehensive testing guidelines for contributors to the mrbro.dev portfolio project. We implement a multi-layered testing strategy ensuring code quality, functionality, and performance across all aspects of the application.

## Table of Contents

- [Quick Start](#quick-start)
- [Test Types Overview](#test-types-overview)
- [Unit Testing](#unit-testing)
- [End-to-End Testing](#end-to-end-testing)
- [Visual Regression Testing](#visual-regression-testing)
- [Accessibility Testing](#accessibility-testing)
- [Performance Testing](#performance-testing)
- [Test Dashboard](#test-dashboard)
- [Writing Tests](#writing-tests)
- [Troubleshooting](#troubleshooting)
- [Contributing Guidelines](#contributing-guidelines)

## Quick Start

### Prerequisites

- Node.js v22+ LTS
- pnpm v10.13.1+
- Git

### Setup

1. **Install dependencies**:

   ```bash
   pnpm install
   ```

2. **Install Playwright browsers**:

   ```bash
   pnpm exec playwright install
   ```

3. **Run all tests**:

   ```bash
   pnpm test:all
   ```

4. **Generate dashboard and badges**:

   ```bash
   pnpm dashboard && pnpm badges
   ```

## Test Types Overview

Our testing strategy includes five main categories:

| Test Type         | Purpose                        | Tools                   | Coverage         |
| ----------------- | ------------------------------ | ----------------------- | ---------------- |
| **Unit Tests**    | Component and function testing | Vitest, Testing Library | 80%+ required    |
| **E2E Tests**     | User workflow testing          | Playwright              | Cross-browser    |
| **Visual Tests**  | UI consistency                 | Playwright Visual       | Theme variations |
| **Accessibility** | WCAG compliance                | axe-core                | All pages        |
| **Performance**   | Speed and optimization         | Lighthouse CI           | Core Web Vitals  |

### Test Health Score

The project calculates a weighted health score across all test types:

- **Unit Tests**: 25% weight (based on coverage percentage)
- **E2E Tests**: 30% weight (pass/fail rate)
- **Visual Tests**: 15% weight (regression detection)
- **Accessibility**: 20% weight (violation count)
- **Performance**: 10% weight (Lighthouse scores)

## Unit Testing

Unit tests use Vitest with React Testing Library for component testing.

### Running Unit Tests

```bash
# Run all unit tests
pnpm test

# Run with coverage
pnpm test --coverage

# Watch mode for development
pnpm test --watch

# Open Vitest UI
pnpm test --ui

# Run specific test file
pnpm test src/components/Header.test.tsx

# Run tests matching pattern
pnpm test --grep \"theme\"
```

### Coverage Requirements

- **Minimum Coverage**: 80% across all metrics
- **Statements**: 80%+
- **Branches**: 80%+
- **Functions**: 80%+
- **Lines**: 80%+

### Writing Unit Tests

#### Component Testing Example

```tsx
import {render, screen} from '@testing-library/react'
import {expect, test, vi} from 'vitest'
import {ThemeProvider} from '../contexts/ThemeContext'
import {Header} from './Header'

test('renders navigation menu', () => {
  render(
    <ThemeProvider>
      <Header />
    </ThemeProvider>
  )

  expect(screen.getByRole('navigation')).toBeInTheDocument()
  expect(screen.getByText('Home')).toBeInTheDocument()
})

test('handles theme toggle', async () => {
  const mockToggle = vi.fn()
  // ... test implementation
})
```

#### Utility Function Testing

```typescript
import {expect, test} from 'vitest'
import {formatDate} from '../utils/formatDate'

test('formats date correctly', () => {
  const date = new Date('2024-01-15T10:30:00Z')
  expect(formatDate(date)).toBe('January 15, 2024')
})
```

### Best Practices

- **Arrange, Act, Assert**: Structure tests clearly
- **Test Behavior**: Focus on what users see/do
- **Mock External Dependencies**: Use vi.mock() for APIs
- **Test Error States**: Include error handling tests
- **Accessibility**: Test keyboard navigation and screen readers

## End-to-End Testing

E2E tests use Playwright to test complete user workflows across multiple browsers.

### Running E2E Tests

```bash
# Run all E2E tests
pnpm test:e2e

# Run with visible browser
pnpm test:e2e:headed

# Open Playwright UI
pnpm test:e2e:ui

# Run specific browser
pnpm exec playwright test --project=chromium

# Run specific test file
pnpm exec playwright test tests/e2e/navigation.spec.ts

# Generate code (record interactions)
pnpm test:e2e:codegen
```

### Browser Matrix

Tests run across three browsers:

- **Chromium**: Primary browser (Chrome/Edge)
- **Firefox**: Mozilla Firefox
- **WebKit**: Safari engine

### Writing E2E Tests

#### Page Object Model

```typescript
// tests/e2e/pages/HomePage.ts
import type {Locator, Page} from '@playwright/test'

export class HomePage {
  readonly page: Page
  readonly heroSection: Locator
  readonly themeToggle: Locator
  readonly navigationMenu: Locator

  constructor(page: Page) {
    this.page = page
    this.heroSection = page.getByTestId('hero-section')
    this.themeToggle = page.getByRole('button', {name: 'Toggle theme'})
    this.navigationMenu = page.getByRole('navigation')
  }

  async goto() {
    await this.page.goto('/')
  }

  async toggleTheme() {
    await this.themeToggle.click()
  }
}
```

#### Test Example

```typescript
// tests/e2e/navigation.spec.ts
import { expect, test } from '@playwright/test'
import { HomePage } from './pages/HomePage'

test('navigation works correctly', async ({page}) => {
  const homePage = new HomePage(page)

  await homePage.goto()
  await expect(homePage.heroSection).toBeVisible()

  // Test navigation
  await page.getByRole('link', {name: 'About'}).click()
  await expect(page).toHaveURL(/.*about/)
})
```

### E2E Best Practices

- **Use Page Objects**: Organize selectors and actions
- **Test User Journeys**: Complete workflows, not just clicks
- **Stable Selectors**: Prefer `getByRole()` and `getByTestId()`
- **Wait for Elements**: Use `expect().toBeVisible()` for reliability
- **Test Data**: Use fixtures for consistent test data

## Visual Regression Testing

Visual tests capture screenshots and compare them across theme variations.

### Running Visual Tests

```bash
# Run visual regression tests
pnpm test:visual

# Update baseline screenshots
pnpm test:visual:update

# Run with visible browser
pnpm test:visual:headed

# Clean up old artifacts
pnpm test:visual:artifacts:clean
```

### Baseline Management

Visual tests compare against baseline screenshots stored in the repository.

#### Updating Baselines

```bash
# Update all baselines
UPDATE_SNAPSHOTS=1 pnpm test:visual

# Update specific test
UPDATE_SNAPSHOTS=1 pnpm exec playwright test tests/visual/components.spec.ts
```

#### Baseline Storage

- **Location**: `tests/visual/**/*-baseline.png`
- **Naming**: `{test-name}-{theme}-{viewport}-{os}.png`
- **Retention**: Permanent (with cleanup automation)

### Writing Visual Tests

```typescript
// tests/visual/components.spec.ts
import { expect, test } from '@playwright/test'

test('header appears correctly across themes', async ({page}) => {
  await page.goto('/')

  // Test light theme
  await page.getByRole('button', {name: 'Toggle theme'}).click()
  await expect(page.locator('header')).toHaveScreenshot('header-light.png')

  // Test dark theme
  await page.getByRole('button', {name: 'Toggle theme'}).click()
  await expect(page.locator('header')).toHaveScreenshot('header-dark.png')
})
```

### Visual Testing Best Practices

- **Stable Rendering**: Wait for animations to complete
- **Consistent Viewports**: Use standard sizes (375px, 768px, 1024px)
- **Theme Coverage**: Test all theme variations
- **Selective Screenshots**: Focus on UI components, not full pages
- **Update Carefully**: Review visual diffs before accepting changes

## Accessibility Testing

Accessibility tests ensure WCAG 2.1 AA compliance using axe-core.

### Running Accessibility Tests

```bash
# Run accessibility tests
pnpm test:accessibility

# Run with visible browser
pnpm test:accessibility:headed

# Run specific page tests
pnpm exec playwright test tests/accessibility/ --grep \"home page\"
```

### Writing Accessibility Tests

```typescript
// tests/accessibility/pages.spec.ts
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test('home page meets accessibility standards', async ({page}) => {
  await page.goto('/')

  const accessibilityScanResults = await new AxeBuilder({page})
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze()

  expect(accessibilityScanResults.violations).toEqual([])
})

test('keyboard navigation works', async ({page}) => {
  await page.goto('/')

  // Test tab navigation
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', {name: 'Skip to content'})).toBeFocused()

  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', {name: 'Home'})).toBeFocused()
})
```

### Accessibility Guidelines

- **WCAG 2.1 AA**: Minimum compliance level
- **Keyboard Navigation**: All interactive elements accessible
- **Screen Readers**: Proper ARIA labels and semantic HTML
- **Color Contrast**: 4.5:1 minimum for normal text
- **Focus Management**: Visible focus indicators

## Performance Testing

Performance tests use Lighthouse CI to monitor Core Web Vitals and optimization metrics.

### Running Performance Tests

```bash
# Run Lighthouse CI
pnpm test:performance

# Run with performance budgets
pnpm test:performance:budgets

# Generate performance dashboard
pnpm test:performance:dashboard

# Run full performance suite
pnpm test:performance:full
```

### Performance Budgets

The project enforces performance budgets:

- **Total JavaScript**: < 500KB
- **Total CSS**: < 100KB
- **Lighthouse Performance**: > 90
- **First Contentful Paint**: < 2s
- **Largest Contentful Paint**: < 2.5s
- **Cumulative Layout Shift**: < 0.1

### Performance Best Practices

- **Code Splitting**: Lazy load components
- **Bundle Analysis**: Monitor JavaScript size
- **Image Optimization**: Use modern formats
- **Critical CSS**: Inline above-the-fold styles
- **Caching**: Leverage browser caching

## Test Dashboard

The test dashboard aggregates results from all test suites.

### Generating Dashboard

```bash
# Generate dashboard data
pnpm dashboard

# Update badges
pnpm badges

# Combined update
pnpm dashboard && pnpm badges
```

### Dashboard Files

- **`test-dashboard/dashboard-data.json`**: Current test results
- **`test-dashboard/test-history.json`**: Historical trends
- **`test-dashboard/test-summary.json`**: Summary with trends
- **`badges/badges.json`**: Badge URLs for README

## Writing Tests

### General Guidelines

1. **Test Names**: Descriptive and specific
2. **Arrange-Act-Assert**: Clear test structure
3. **Single Responsibility**: One concept per test
4. **Independent Tests**: No test dependencies
5. **Clean Up**: Reset state after tests

### Test Data

#### Using Fixtures

```typescript
// fixtures/user.ts
export const mockUser = {
  id: '123',
  name: 'Test User',
  email: 'test@example.com'
}
```

```typescript
// In tests
import { mockUser } from '../fixtures/user'
```

#### Environment Variables

```typescript
// For tests that need environment config
test('API integration', async () => {
  const apiUrl = process.env.TEST_API_URL || 'http://localhost:3000'
  // ... test implementation
})
```

### Mocking Guidelines

#### External APIs

```typescript
import {vi} from 'vitest'

// Mock fetch
globalThis.fetch = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
})

test('fetches user data', async () => {
  const mockResponse = {json: () => Promise.resolve(mockUser)}
  vi.mocked(fetch).mockResolvedValue(mockResponse as Response)

  // ... test implementation
})
```

#### Component Dependencies

```typescript
// Mock theme context
vi.mock('../contexts/ThemeContext', () => ({
  useTheme: () => ({
    currentTheme: 'light',
    toggleTheme: vi.fn()
  })
}))
```

## Troubleshooting

### Common Issues

#### Unit Tests

**Problem**: Tests fail with \"Cannot read property of undefined\"

**Solution**: Check for proper mocking of dependencies

```typescript
// Add proper mock setup
vi.mock('../utils/api', () => ({
  fetchData: vi.fn().mockResolvedValue({})
}))
```

**Problem**: Coverage reports missing files

**Solution**: Ensure test files follow naming convention `*.test.{ts,tsx}`

#### E2E Tests

**Problem**: Tests are flaky/intermittent failures

**Solution**: Use proper waiting strategies

```typescript
// Instead of page.waitForTimeout(1000)
await expect(page.getByText('Loading')).toBeHidden()
await expect(page.getByText('Content')).toBeVisible()
```

**Problem**: Screenshots differ across environments

**Solution**: Use consistent viewport and disable animations

```typescript
test.use({
  viewport: {width: 1280, height: 720}
})
```

```typescript
// Disable animations in playwright.config.ts
use: {
  // Spread configuration
  reducedMotion: 'reduce'
}
```

#### Visual Tests

**Problem**: Many false positive differences

**Solution**: Adjust threshold or update baselines

```typescript
await expect(page).toHaveScreenshot('page.png', {
  threshold: 0.3, // Allow 30% difference
  maxDiffPixels: 100
})
```

**Problem**: Fonts render differently

**Solution**: Use system fonts or web fonts in tests

#### Performance Tests

**Problem**: Lighthouse scores vary significantly

**Solution**: Run multiple times and use median scores

### Debug Commands

```bash
# Verbose test output
pnpm test --reporter=verbose

# Debug specific test
pnpm test --grep \"specific test\" --reporter=verbose

# Playwright debug mode
pnpm exec playwright test --debug

# Generate test report
pnpm exec playwright show-report
```

## Contributing Guidelines

### Before Submitting Tests

1. **Run Full Suite**: `pnpm test:all`
2. **Check Coverage**: Ensure 80%+ coverage maintained
3. **Update Baselines**: If visual changes are intentional
4. **Generate Dashboard**: `pnpm dashboard && pnpm badges`

### Test Requirements for PRs

- [ ] All existing tests pass
- [ ] New features have corresponding tests
- [ ] Test coverage meets 80% threshold
- [ ] E2E tests cover user-facing changes
- [ ] Visual tests updated for UI changes
- [ ] Accessibility tests pass for new pages/components
- [ ] Performance budgets not exceeded

### Adding New Test Types

When adding new test categories:

1. **Update Dashboard**: Modify `scripts/test-dashboard.mjs`
2. **Update Badges**: Modify `scripts/generate-test-badges.mjs`
3. **Add CI Integration**: Update `.github/workflows/e2e-tests.yaml`
4. **Document**: Update this file and README.md

### Review Checklist

**For Reviewers:**

- [ ] Tests are comprehensive and test behavior, not implementation
- [ ] Test names are descriptive and follow conventions
- [ ] No test dependencies or shared state
- [ ] Proper cleanup and mocking
- [ ] Performance impact considered
- [ ] Documentation updated if needed

### Continuous Improvement

The testing strategy evolves with the project. Consider:

- **Metrics Tracking**: Monitor test execution time
- **Flaky Test Detection**: Track and fix unreliable tests
- **Coverage Analysis**: Identify untested code paths
- **Performance Monitoring**: Track testing infrastructure costs
- **Tool Updates**: Keep testing dependencies current

---

For questions or suggestions about testing, please open an issue or discussion in the repository.
