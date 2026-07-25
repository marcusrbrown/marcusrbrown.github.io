---
name: agent-browser
description: Browser automation CLI for AI agents. Use when you need to interact with the mrbro.dev site — navigating pages, checking for errors, capturing screenshots, verifying WCAG compliance, filling forms, clicking buttons, or testing any browser-based behavior. Triggers include "open the site", "take a screenshot", "check for errors", "verify accessibility", "test the deployed page", "scrape content", or any task requiring browser interaction with https://mrbro.dev or a local preview server.
license: MIT
metadata:
  author: marcusrbrown
  version: "1.0"
allowed-tools: Bash(pnpm exec agent-browser:*)
---

## Browser Automation for mrbro.dev with agent-browser

Use the pinned local `agent-browser` package via `pnpm exec agent-browser` to interact with the site in CI or from `workflow_dispatch` events.

## Core Workflow

Every browser session follows this pattern:

1. **Navigate**: `pnpm exec agent-browser open <url>`
2. **Snapshot**: `pnpm exec agent-browser snapshot -i` (get element refs like `@e1`, `@e2`)
3. **Interact**: Use refs to click, fill, select
4. **Re-snapshot**: After navigation or DOM changes, get fresh refs

```sh
pnpm exec agent-browser open https://mrbro.dev
pnpm exec agent-browser wait --load networkidle
pnpm exec agent-browser snapshot -i
```

## Essential Commands

```sh
# Navigation
pnpm exec agent-browser open <url>              # Navigate to a URL
pnpm exec agent-browser close                   # Close browser

# Snapshot (get element refs)
pnpm exec agent-browser snapshot -i             # Interactive elements with refs (recommended)
pnpm exec agent-browser snapshot -i -C          # Include cursor-interactive elements
pnpm exec agent-browser snapshot -s "#main"     # Scope to CSS selector

# Interact using @refs from snapshot
pnpm exec agent-browser click @e1
pnpm exec agent-browser fill @e2 "text"
pnpm exec agent-browser press Enter
pnpm exec agent-browser scroll down 500

# Get information
pnpm exec agent-browser get text @e1
pnpm exec agent-browser get url
pnpm exec agent-browser get title

# Wait
pnpm exec agent-browser wait @e1                # Wait for element
pnpm exec agent-browser wait --load networkidle # Wait for network idle
pnpm exec agent-browser wait --url "**/blog"    # Wait for URL pattern
pnpm exec agent-browser wait 2000               # Wait milliseconds

# Capture
pnpm exec agent-browser screenshot              # Screenshot to temp dir
pnpm exec agent-browser screenshot --full       # Full page screenshot
pnpm exec agent-browser screenshot --annotate   # Annotated with numbered element labels

# Diff (compare page states)
pnpm exec agent-browser diff url <url1> <url2>              # Compare two pages
pnpm exec agent-browser diff screenshot --baseline before.png  # Visual pixel diff
```

## Example Prompts for mrbro.dev

### Check site for JavaScript errors

```sh
pnpm exec agent-browser open https://mrbro.dev && pnpm exec agent-browser wait --load networkidle
pnpm exec agent-browser snapshot -i
# Review the snapshot for error indicators; use `get text` for console output
```

### Verify all pages load without errors

```sh
for PATH in "/" "/about" "/projects" "/blog"; do
  pnpm exec agent-browser open "https://mrbro.dev${PATH}" && pnpm exec agent-browser wait --load networkidle
  pnpm exec agent-browser screenshot --full
done
```

### Check WCAG accessibility (visual scan)

```sh
pnpm exec agent-browser open https://mrbro.dev && pnpm exec agent-browser wait --load networkidle
pnpm exec agent-browser snapshot -i
# Verify: landmark elements (nav, main, footer) are present
# Verify: all interactive elements have accessible refs in the snapshot
# Verify: color contrast looks appropriate in screenshots
pnpm exec agent-browser screenshot --full accessibility-check.png
```

### Verify dark/light theme toggle

```sh
pnpm exec agent-browser open https://mrbro.dev && pnpm exec agent-browser wait --load networkidle
pnpm exec agent-browser screenshot light-theme.png
pnpm exec agent-browser snapshot -i -C
# Find the theme toggle button ref (e.g. @e5) from snapshot
pnpm exec agent-browser click @e5
pnpm exec agent-browser wait 500
pnpm exec agent-browser screenshot dark-theme.png
pnpm exec agent-browser diff screenshot --baseline light-theme.png
```

### Test navigation links

```sh
pnpm exec agent-browser open https://mrbro.dev && pnpm exec agent-browser wait --load networkidle
pnpm exec agent-browser snapshot -i
# Find nav link refs and verify each navigates correctly
pnpm exec agent-browser click @e2  # About
pnpm exec agent-browser wait --url "**/about"
pnpm exec agent-browser get url    # Should contain /about
```

### Test with local preview server

```sh
# Start preview server first: pnpm preview
pnpm exec agent-browser open http://localhost:4173 && pnpm exec agent-browser wait --load networkidle
pnpm exec agent-browser snapshot -i
pnpm exec agent-browser screenshot local-preview.png
```

### Compare deployed vs local build

```sh
pnpm exec agent-browser diff url https://mrbro.dev http://localhost:4173 --wait-until networkidle
```

## Command Chaining

Chain commands with `&&` for efficiency — the browser persists between commands:

```sh
pnpm exec agent-browser open https://mrbro.dev && pnpm exec agent-browser wait --load networkidle && pnpm exec agent-browser screenshot --full site.png
```

## Integration with CI (workflow_dispatch)

In a GitHub Actions workflow step:

```yaml
- name: Check site with agent-browser
  run: |
    pnpm exec agent-browser open https://mrbro.dev
    pnpm exec agent-browser wait --load networkidle
    pnpm exec agent-browser screenshot --full site-check.png
    pnpm exec agent-browser snapshot -i
    pnpm exec agent-browser close
```
