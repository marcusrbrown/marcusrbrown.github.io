import {expect, test} from '@playwright/test'

/**
 * SPA pageview-source coverage. Runs against the unconfigured local preview
 * build (no `VITE_UMAMI_WEBSITE_ID`), so the real tracker script is never
 * injected. An `addInitScript` stub installs `window.umami` before the app
 * mounts, capturing `track()` calls into `window.__umamiTrackCalls`; a
 * network guard additionally asserts zero requests reach `metrics.fro.bot`.
 */

declare global {
  interface Window {
    __umamiTrackCalls?: unknown[]
  }
}

/** Stubs a ready `window.umami` tracker before any app script runs. */
const stubReadyUmamiTracker = async (page: import('@playwright/test').Page) => {
  await page.addInitScript(() => {
    window.__umamiTrackCalls = []
    window.umami = {
      track: (...args: unknown[]) => {
        window.__umamiTrackCalls?.push(args)
      },
    }
  })
}

/** Navigates via the header nav link for a route, disambiguated from the footer's duplicate links. */
const clickHeaderNavLink = async (page: import('@playwright/test').Page, name: string) => {
  await page.getByLabel('Main navigation').getByRole('link', {name, exact: true}).click()
}

const getTrackedUrls = async (page: import('@playwright/test').Page): Promise<string[]> => {
  const calls = await page.evaluate(() => window.__umamiTrackCalls ?? [])
  return calls
    .map(call => (Array.isArray(call) ? call[0] : undefined))
    .filter((entry): entry is {url: string} => !!entry && typeof entry === 'object' && 'url' in entry)
    .map(entry => entry.url)
}

/** Blocks and records any request to the real collector so no test can leak traffic to it. */
const guardAgainstRealCollectorTraffic = async (page: import('@playwright/test').Page) => {
  const blockedRequests: string[] = []
  await page.route('https://metrics.fro.bot/**', async route => {
    blockedRequests.push(route.request().url())
    await route.abort()
  })
  return blockedRequests
}

test.describe('Analytics route-pageview source (unconfigured build, stubbed tracker)', () => {
  test('emits exactly one normalized pageview for the initial route', async ({page}) => {
    const blocked = await guardAgainstRealCollectorTraffic(page)
    await stubReadyUmamiTracker(page)

    await page.goto('/about')
    await page.waitForLoadState('networkidle')

    expect(await getTrackedUrls(page)).toStrictEqual(['/about'])
    expect(blocked).toHaveLength(0)
  })

  test('emits one pageview for header link navigation between routes', async ({page}) => {
    const blocked = await guardAgainstRealCollectorTraffic(page)
    await stubReadyUmamiTracker(page)

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await clickHeaderNavLink(page, 'About')
    await expect.poll(async () => getTrackedUrls(page)).toStrictEqual(['/', '/about'])

    await clickHeaderNavLink(page, 'Projects')
    await expect.poll(async () => getTrackedUrls(page)).toStrictEqual(['/', '/about', '/projects'])

    expect(blocked).toHaveLength(0)
  })

  test('emits one pageview each for browser back and forward navigation', async ({page}) => {
    const blocked = await guardAgainstRealCollectorTraffic(page)
    await stubReadyUmamiTracker(page)

    await page.goto('/')
    await expect.poll(async () => getTrackedUrls(page)).toStrictEqual(['/'])
    await clickHeaderNavLink(page, 'About')
    await expect.poll(async () => getTrackedUrls(page)).toStrictEqual(['/', '/about'])
    await clickHeaderNavLink(page, 'Projects')
    await expect.poll(async () => getTrackedUrls(page)).toStrictEqual(['/', '/about', '/projects'])

    await page.goBack()
    await expect.poll(async () => getTrackedUrls(page)).toStrictEqual(['/', '/about', '/projects', '/about'])
    await page.goBack()
    await expect.poll(async () => getTrackedUrls(page)).toStrictEqual(['/', '/about', '/projects', '/about', '/'])
    await page.goForward()
    await expect
      .poll(async () => getTrackedUrls(page))
      .toStrictEqual(['/', '/about', '/projects', '/about', '/', '/about'])

    expect(blocked).toHaveLength(0)
  })

  test('allows a later real return to a previously visited path to emit again', async ({page}) => {
    const blocked = await guardAgainstRealCollectorTraffic(page)
    await stubReadyUmamiTracker(page)

    await page.goto('/about')
    await expect.poll(async () => getTrackedUrls(page)).toStrictEqual(['/about'])

    await clickHeaderNavLink(page, 'Projects')
    await expect.poll(async () => getTrackedUrls(page)).toStrictEqual(['/about', '/projects'])

    await clickHeaderNavLink(page, 'Home')
    await expect.poll(async () => getTrackedUrls(page)).toStrictEqual(['/about', '/projects', '/'])

    await clickHeaderNavLink(page, 'About')
    await expect.poll(async () => getTrackedUrls(page)).toStrictEqual(['/about', '/projects', '/', '/about'])

    expect(blocked).toHaveLength(0)
  })

  test('does not emit a duplicate pageview when clicking the already-active route link', async ({page}) => {
    const blocked = await guardAgainstRealCollectorTraffic(page)
    await stubReadyUmamiTracker(page)

    await page.goto('/about')
    await page.waitForLoadState('networkidle')

    await clickHeaderNavLink(page, 'About')
    await page.waitForLoadState('networkidle')

    expect(await getTrackedUrls(page)).toStrictEqual(['/about'])
    expect(blocked).toHaveLength(0)
  })

  test('restores the pathname through the GitHub Pages 404 redirect and emits it once, never a temporary "?p=" URL', async ({
    page,
  }) => {
    const blocked = await guardAgainstRealCollectorTraffic(page)
    await stubReadyUmamiTracker(page)

    // Simulates the GitHub Pages 404 redirect landing on root with the
    // original path encoded in `?p=`.
    await page.goto('/?p=/projects')
    await page.waitForLoadState('networkidle')

    expect(page.url()).not.toContain('?p=')
    expect(page.url()).toMatch(/\/projects$/)
    expect(await getTrackedUrls(page)).toStrictEqual(['/projects'])
    expect(blocked).toHaveLength(0)
  })
})

test.describe('Analytics DNT suppression', () => {
  test('drops navigation pageviews under Do Not Track without any request', async ({page}) => {
    const blocked = await guardAgainstRealCollectorTraffic(page)
    await page.addInitScript(() => {
      window.__umamiTrackCalls = []
      Object.defineProperty(navigator, 'doNotTrack', {value: '1', configurable: true})
      window.umami = {
        track: (...args: unknown[]) => {
          window.__umamiTrackCalls?.push(args)
        },
      }
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await clickHeaderNavLink(page, 'About')
    await page.waitForLoadState('networkidle')

    expect(await getTrackedUrls(page)).toStrictEqual([])
    expect(blocked).toHaveLength(0)
  })
})

test.describe('Analytics tracker unavailability', () => {
  test('missing tracker never throws or blocks navigation and rendering', async ({page}) => {
    const blocked = await guardAgainstRealCollectorTraffic(page)
    const pageErrors: Error[] = []
    page.on('pageerror', error => pageErrors.push(error))

    // No stub installed: window.umami never exists — the unavailable path.
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await clickHeaderNavLink(page, 'About')
    await page.waitForLoadState('networkidle')
    await clickHeaderNavLink(page, 'Projects')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('#root')).toBeVisible()
    const bodyText = await page.locator('body').textContent()
    expect(bodyText?.trim().length ?? 0).toBeGreaterThan(50)
    expect(pageErrors).toHaveLength(0)
    expect(blocked).toHaveLength(0)
  })

  test('flushes only the latest pre-readiness route once the tracker becomes available', async ({page}) => {
    const blocked = await guardAgainstRealCollectorTraffic(page)
    // `onUmamiTrackerReady` checks for the tracker script tag once, at the
    // moment it is called — install that fixture tag before navigation so
    // readiness registration finds it; `window.umami` is added later,
    // simulating the tracker becoming ready.
    await page.addInitScript(() => {
      window.__umamiTrackCalls = []
      const appendFixtureScript = () => {
        const script = document.createElement('script')
        script.src = 'https://metrics.fro.bot/script.js'
        script.dataset.websiteId = 'e2e-fixture'
        document.head.append(script)
      }
      if (document.head) appendFixtureScript()
      else document.addEventListener('DOMContentLoaded', appendFixtureScript)
    })

    await page.goto('/about')
    await page.waitForLoadState('networkidle')
    await clickHeaderNavLink(page, 'Projects')
    await page.waitForLoadState('networkidle')
    await clickHeaderNavLink(page, 'Blog')
    await page.waitForLoadState('networkidle')

    expect(await getTrackedUrls(page)).toStrictEqual([])

    // Tracker becomes available: set window.umami and dispatch `load` on the
    // fixture script tag — the exact signal onUmamiTrackerReady waits for.
    await page.evaluate(() => {
      window.umami = {
        track: (...args: unknown[]) => {
          window.__umamiTrackCalls?.push(args)
        },
      }
      const script = document.querySelector<HTMLScriptElement>(
        'script[src="https://metrics.fro.bot/script.js"][data-website-id]',
      )
      script?.dispatchEvent(new Event('load'))
    })

    await expect.poll(async () => getTrackedUrls(page)).toStrictEqual(['/blog'])
    expect(blocked).toStrictEqual(['https://metrics.fro.bot/script.js'])
  })
})
