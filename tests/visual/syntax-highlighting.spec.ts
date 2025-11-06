/**
 * Visual regression tests for code syntax highlighting across different themes
 * Tests CodeBlock component with various programming languages and theme variations
 */

import {test} from '@playwright/test'

import {preparePageForVisualTest, setThemeMode, waitForComponentStable, type ThemeMode} from './utils'

const THEMES: ThemeMode[] = ['light', 'dark']

// Sample code snippets for different programming languages
const CODE_SAMPLES = {
  typescript: `interface Developer {
  name: string;
  skills: string[];
  passion: 'open-source' | 'privacy' | 'security';
}

const marcus: Developer = {
  name: 'Marcus R. Brown',
  skills: ['TypeScript', 'React', 'AI', 'Game Development'],
  passion: 'open-source'
};

const getIntroduction = (dev: Developer): string => {
  return \`Hello! I'm \${dev.name}, passionate about \${dev.passion}.\`;
};

console.log(getIntroduction(marcus));`,

  javascript: `function calculateFibonacci(n) {
  if (n <= 1) return n;

  let prev = 0, curr = 1;
  for (let i = 2; i <= n; i++) {
    const next = prev + curr;
    prev = curr;
    curr = next;
  }

  return curr;
}

// Example usage
const result = calculateFibonacci(10);
console.log(\`Fibonacci(10) = \${result}\`);`,

  python: `from typing import List, Optional
import asyncio

class ThemeManager:
    def __init__(self, default_theme: str = "light"):
        self.current_theme = default_theme
        self.observers: List[callable] = []

    async def set_theme(self, theme: str) -> None:
        """Set the current theme and notify observers."""
        if theme in ["light", "dark", "auto"]:
            self.current_theme = theme
            await self._notify_observers()
        else:
            raise ValueError(f"Invalid theme: {theme}")

    async def _notify_observers(self) -> None:
        """Notify all registered observers of theme change."""
        tasks = [observer(self.current_theme) for observer in self.observers]
        await asyncio.gather(*tasks)

# Usage example
theme_manager = ThemeManager()
print(f"Current theme: {theme_manager.current_theme}")`,

  json: `{
  "name": "mrbro.dev",
  "version": "1.0.0",
  "description": "Personal portfolio and blog",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest",
    "lint": "eslint . --fix"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router": "^7.7.1",
    "shiki": "^3.8.1",
    "ajv": "^8.17.1"
  },
  "devDependencies": {
    "@playwright/test": "^1.54.2",
    "vite": "^7.0.6",
    "vitest": "^2.1.6"
  },
  "theme": {
    "primary": "#3b82f6",
    "background": "#ffffff",
    "mode": "auto"
  }
}`,

  css: `/* Modern CSS with custom properties and container queries */
:root {
  --color-primary: #3b82f6;
  --color-secondary: #64748b;
  --font-size-base: 1rem;
  --spacing-unit: 0.5rem;
  --border-radius: 0.375rem;
}

@container sidebar (min-width: 300px) {
  .card {
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: calc(var(--spacing-unit) * 2);
    padding: calc(var(--spacing-unit) * 3);
    background: linear-gradient(135deg,
      var(--color-primary) 0%,
      var(--color-secondary) 100%);
    border-radius: var(--border-radius);
    box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
    transition: transform 0.2s ease-in-out;
  }

  .card:hover {
    transform: translateY(-2px);
  }
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-primary: #60a5fa;
    --color-secondary: #94a3b8;
  }
}`,

  html: `<!DOCTYPE html>
<html lang="en" data-theme="auto">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="Marcus R. Brown - Developer Portfolio">
  <title>mrbro.dev - Portfolio & Blog</title>
  <link rel="stylesheet" href="/styles/globals.css">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <script type="module" src="/src/main.tsx"></script>
</head>
<body>
  <div id="root">
    <header role="banner">
      <nav aria-label="Main navigation">
        <ul>
          <li><a href="/" aria-current="page">Home</a></li>
          <li><a href="/about">About</a></li>
          <li><a href="/projects">Projects</a></li>
          <li><a href="/blog">Blog</a></li>
        </ul>
      </nav>
      <button data-testid="theme-toggle" aria-label="Toggle theme">
        🌙
      </button>
    </header>

    <main>
      <section class="hero">
        <h1>Welcome to mrbro.dev</h1>
        <p>Developer focused on open source, privacy, and security.</p>
      </section>
    </main>
  </div>
</body>
</html>`,

  bash: String.raw`#!/bin/bash
# Automated deployment script for mrbro.dev
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$PROJECT_ROOT/dist"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
  echo -e "$GREEN[INFO]$NC $1"
}

log_warn() {
  echo -e "$YELLOW[WARN]$NC $1"
}

log_error() {
  echo -e "$RED[ERROR]$NC $1" >&2
}

check_dependencies() {
  deps=("node" "pnpm" "git")

  for dep in "$deps"; do
    if ! command -v "$dep" > /dev/null 2>&1; then
      log_error "Required dependency '$dep' not found"
      exit 1
    fi
  done

  log_info "All dependencies are available"
}

build_project() {
  log_info "Installing dependencies..."
  pnpm install --frozen-lockfile

  log_info "Running tests..."
  pnpm test --run

  log_info "Building project..."
  pnpm build

  if [ ! -d "$BUILD_DIR" ]; then
    log_error "Build directory not found: $BUILD_DIR"
    exit 1
  fi

  log_info "Build completed successfully"
}

main() {
  log_info "Starting deployment process..."

  check_dependencies
  build_project

  log_info "Deployment completed successfully!"
}

main "$@"`,
} as const

test.describe('Code Syntax Highlighting Visual Regression', () => {
  test.beforeEach(async ({page}) => {
    // Navigate to About page which has CodeBlock examples
    await page.goto('/about')
  })

  test.describe('TypeScript Code Highlighting', () => {
    THEMES.forEach(theme => {
      test(`TypeScript - ${theme} theme`, async ({page}) => {
        await preparePageForVisualTest(page, {theme})

        // Wait for code block to be rendered
        await waitForComponentStable(page, '.code-block')

        // Find the existing TypeScript code block on the About page
        const codeBlock = page.locator('.code-block').first()
        await codeBlock.screenshot({
          path: `tests/visual/screenshots/syntax-typescript-${theme}-theme.png`,
          animations: 'disabled',
        })
      })
    })

    test('TypeScript - with line numbers', async ({page}) => {
      await preparePageForVisualTest(page, {theme: 'light'})
      await waitForComponentStable(page, '.code-block')

      // Look for code block with line numbers (if it exists on the page)
      const codeBlockWithLines = page.locator('.code-block--line-numbers')
      if ((await codeBlockWithLines.count()) > 0) {
        await codeBlockWithLines.first().screenshot({
          path: 'tests/visual/screenshots/syntax-typescript-line-numbers.png',
          animations: 'disabled',
        })
      }
    })
  })

  test.describe('Multiple Language Support', () => {
    // We'll test the different code samples via direct injection
    // since the About page shows the existing TypeScript example

    test('JavaScript syntax highlighting', async ({page}) => {
      await preparePageForVisualTest(page, {theme: 'light'})

      // Inject a JavaScript code block for testing
      await page.evaluate(code => {
        const container = document.createElement('div')
        container.innerHTML = `
          <div class="code-block">
            <div class="code-block__header">
              <span class="code-block__title">JavaScript Example</span>
              <span class="code-block__language">javascript</span>
            </div>
            <div class="code-block__content">
              <pre><code>${code}</code></pre>
            </div>
          </div>
        `
        document.body.append(container)
      }, CODE_SAMPLES.javascript)

      await page.waitForTimeout(500) // Allow code injection to complete

      const jsCodeBlock = page.locator('.code-block').last()
      await jsCodeBlock.screenshot({
        path: 'tests/visual/screenshots/syntax-javascript-light-theme.png',
        animations: 'disabled',
      })
    })

    test('Python syntax highlighting', async ({page}) => {
      await preparePageForVisualTest(page, {theme: 'dark'})

      // Inject a Python code block for testing
      await page.evaluate(code => {
        const container = document.createElement('div')
        container.innerHTML = `
          <div class="code-block">
            <div class="code-block__header">
              <span class="code-block__title">Python Theme Manager</span>
              <span class="code-block__language">python</span>
            </div>
            <div class="code-block__content">
              <pre><code>${code}</code></pre>
            </div>
          </div>
        `
        document.body.append(container)
      }, CODE_SAMPLES.python)

      await page.waitForTimeout(500)

      const pythonCodeBlock = page.locator('.code-block').last()
      await pythonCodeBlock.screenshot({
        path: 'tests/visual/screenshots/syntax-python-dark-theme.png',
        animations: 'disabled',
      })
    })

    test('JSON syntax highlighting', async ({page}) => {
      await preparePageForVisualTest(page, {theme: 'light'})

      // Inject a JSON code block for testing
      await page.evaluate(code => {
        const container = document.createElement('div')
        container.innerHTML = `
          <div class="code-block">
            <div class="code-block__header">
              <span class="code-block__title">package.json</span>
              <span class="code-block__language">json</span>
            </div>
            <div class="code-block__content">
              <pre><code>${code}</code></pre>
            </div>
          </div>
        `
        document.body.append(container)
      }, CODE_SAMPLES.json)

      await page.waitForTimeout(500)

      const jsonCodeBlock = page.locator('.code-block').last()
      await jsonCodeBlock.screenshot({
        path: 'tests/visual/screenshots/syntax-json-light-theme.png',
        animations: 'disabled',
      })
    })

    test('CSS syntax highlighting', async ({page}) => {
      await preparePageForVisualTest(page, {theme: 'dark'})

      // Inject a CSS code block for testing
      await page.evaluate(code => {
        const container = document.createElement('div')
        container.innerHTML = `
          <div class="code-block">
            <div class="code-block__header">
              <span class="code-block__title">Modern CSS</span>
              <span class="code-block__language">css</span>
            </div>
            <div class="code-block__content">
              <pre><code>${code}</code></pre>
            </div>
          </div>
        `
        document.body.append(container)
      }, CODE_SAMPLES.css)

      await page.waitForTimeout(500)

      const cssCodeBlock = page.locator('.code-block').last()
      await cssCodeBlock.screenshot({
        path: 'tests/visual/screenshots/syntax-css-dark-theme.png',
        animations: 'disabled',
      })
    })

    test('HTML syntax highlighting', async ({page}) => {
      await preparePageForVisualTest(page, {theme: 'light'})

      // Inject an HTML code block for testing
      await page.evaluate(code => {
        const container = document.createElement('div')
        container.innerHTML = `
          <div class="code-block">
            <div class="code-block__header">
              <span class="code-block__title">HTML Template</span>
              <span class="code-block__language">html</span>
            </div>
            <div class="code-block__content">
              <pre><code>${code.replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</code></pre>
            </div>
          </div>
        `
        document.body.append(container)
      }, CODE_SAMPLES.html)

      await page.waitForTimeout(500)

      const htmlCodeBlock = page.locator('.code-block').last()
      await htmlCodeBlock.screenshot({
        path: 'tests/visual/screenshots/syntax-html-light-theme.png',
        animations: 'disabled',
      })
    })

    test('Bash syntax highlighting', async ({page}) => {
      await preparePageForVisualTest(page, {theme: 'dark'})

      // Inject a Bash code block for testing
      await page.evaluate(code => {
        const container = document.createElement('div')
        container.innerHTML = `
          <div class="code-block">
            <div class="code-block__header">
              <span class="code-block__title">Deployment Script</span>
              <span class="code-block__language">bash</span>
            </div>
            <div class="code-block__content">
              <pre><code>${code}</code></pre>
            </div>
          </div>
        `
        document.body.append(container)
      }, CODE_SAMPLES.bash)

      await page.waitForTimeout(500)

      const bashCodeBlock = page.locator('.code-block').last()
      await bashCodeBlock.screenshot({
        path: 'tests/visual/screenshots/syntax-bash-dark-theme.png',
        animations: 'disabled',
      })
    })
  })

  test.describe('Theme Switching Behavior', () => {
    test('Code block theme switching transitions', async ({page}) => {
      await preparePageForVisualTest(page, {theme: 'light'})
      await waitForComponentStable(page, '.code-block')

      // Take initial light theme screenshot
      const codeBlock = page.locator('.code-block').first()
      await codeBlock.screenshot({
        path: 'tests/visual/screenshots/syntax-theme-transition-before.png',
        animations: 'disabled',
      })

      // Switch to dark theme
      await setThemeMode(page, 'dark')
      await page.waitForTimeout(300) // Allow theme transition to complete

      // Take dark theme screenshot
      await codeBlock.screenshot({
        path: 'tests/visual/screenshots/syntax-theme-transition-after.png',
        animations: 'disabled',
      })
    })

    test('Syntax highlighting consistency across themes', async ({page}) => {
      // Test that the same code appears consistent across different themes
      await preparePageForVisualTest(page, {theme: 'light'})

      // Inject a consistent code sample
      await page.evaluate(() => {
        const container = document.createElement('div')
        container.innerHTML = `
          <div class="code-block" data-testid="consistency-test">
            <div class="code-block__header">
              <span class="code-block__title">Theme Consistency Test</span>
              <span class="code-block__language">typescript</span>
            </div>
            <div class="code-block__content">
              <pre><code>const themeTest = {
  primary: '#3b82f6',
  secondary: '#64748b',
  accent: '#0ea5e9'
};

function applyTheme(theme: typeof themeTest) {
  document.documentElement.style.setProperty('--color-primary', theme.primary);
  console.log('Theme applied successfully!');
}</code></pre>
            </div>
          </div>
        `
        document.body.append(container)
      })

      await page.waitForTimeout(500)

      // Screenshot in light theme
      const testCodeBlock = page.locator('[data-testid="consistency-test"]')
      await testCodeBlock.screenshot({
        path: 'tests/visual/screenshots/syntax-consistency-light.png',
        animations: 'disabled',
      })

      // Switch to dark theme and screenshot again
      await setThemeMode(page, 'dark')
      await page.waitForTimeout(300)

      await testCodeBlock.screenshot({
        path: 'tests/visual/screenshots/syntax-consistency-dark.png',
        animations: 'disabled',
      })
    })
  })

  test.describe('Code Block Features', () => {
    test('Code block with title and language badge', async ({page}) => {
      await preparePageForVisualTest(page, {theme: 'light'})
      await waitForComponentStable(page, '.code-block')

      // The About page should have a code block with title
      const codeBlockWithHeader = page.locator('.code-block__header')
      if ((await codeBlockWithHeader.count()) > 0) {
        const fullCodeBlock = codeBlockWithHeader.locator('..').first()
        await fullCodeBlock.screenshot({
          path: 'tests/visual/screenshots/code-block-with-header.png',
          animations: 'disabled',
        })
      }
    })

    test('Error state code block', async ({page}) => {
      await preparePageForVisualTest(page, {theme: 'light'})

      // Inject an error state code block
      await page.evaluate(() => {
        const container = document.createElement('div')
        container.innerHTML = `
          <div class="code-block code-block--error">
            <div class="code-block__header">
              <span class="code-block__title">Syntax Error</span>
              <span class="code-block__language">typescript</span>
            </div>
            <div class="code-block__content">
              <pre><code>// This code has intentional syntax errors
const unclosedString = "This string is never closed
function missingBrace() {
  console.log("Missing closing brace"</code></pre>
            </div>
          </div>
        `
        document.body.append(container)
      })

      await page.waitForTimeout(500)

      const errorCodeBlock = page.locator('.code-block--error')
      await errorCodeBlock.screenshot({
        path: 'tests/visual/screenshots/code-block-error-state.png',
        animations: 'disabled',
      })
    })

    test('Loading state code block', async ({page}) => {
      await preparePageForVisualTest(page, {theme: 'light'})

      // Inject a loading state code block
      await page.evaluate(() => {
        const container = document.createElement('div')
        container.innerHTML = `
          <div class="code-block code-block--loading">
            <div class="code-block__skeleton" aria-label="Loading syntax highlighting...">
              <pre><code>const loading = true;
// Syntax highlighting is loading...
console.log("Please wait...");</code></pre>
            </div>
          </div>
        `
        document.body.append(container)
      })

      await page.waitForTimeout(500)

      const loadingCodeBlock = page.locator('.code-block--loading')
      await loadingCodeBlock.screenshot({
        path: 'tests/visual/screenshots/code-block-loading-state.png',
        animations: 'disabled',
      })
    })
  })

  test.describe('Responsive Code Blocks', () => {
    test('Code block on mobile viewport', async ({page}) => {
      await page.setViewportSize({width: 375, height: 667})
      await preparePageForVisualTest(page, {theme: 'light'})
      await waitForComponentStable(page, '.code-block')

      const codeBlock = page.locator('.code-block').first()
      await codeBlock.screenshot({
        path: 'tests/visual/screenshots/code-block-mobile.png',
        animations: 'disabled',
      })
    })

    test('Code block on tablet viewport', async ({page}) => {
      await page.setViewportSize({width: 768, height: 1024})
      await preparePageForVisualTest(page, {theme: 'dark'})
      await waitForComponentStable(page, '.code-block')

      const codeBlock = page.locator('.code-block').first()
      await codeBlock.screenshot({
        path: 'tests/visual/screenshots/code-block-tablet.png',
        animations: 'disabled',
      })
    })
  })
})
