import type {Locator, Page} from '@playwright/test'
import {readFileSync} from 'node:fs'
import {expect, test} from '@playwright/test'

/**
 * SPA pageview-source coverage. The local preview build is unconfigured, so
 * source tests use an `addInitScript` stub while integration tests install a
 * fully intercepted fixture tracker; both paths guard against production
 * collector traffic.
 */

declare global {
  interface Window {
    __umamiTrackCalls?: unknown[]
    __cspViolations?: CspViolation[]
  }
}

interface CspViolation {
  blockedURI: string
  violatedDirective: string
}

type FixtureCollectorPayload =
  {type: 'pageview'; website: string; url: string} | {type: 'event'; name: string; data: Record<string, string>}

interface FixtureTrackerBoundary {
  collectorRequests: FixtureCollectorPayload[]
  scriptRequests: string[]
  scriptFulfillments: string[]
  unexpectedRequests: string[]
}

const FIXTURE_TRACKER_URL = 'https://metrics.fro.bot/script.js'
const FIXTURE_COLLECTOR_URL = 'https://metrics.fro.bot/api/send'
const FOUR_OH_FOUR_BODY = readFileSync(new URL('../../public/404.html', import.meta.url), 'utf8')

/** Minimal external tracker fixture. It exercises both adapter and declarative catalog paths. */
const FIXTURE_TRACKER_SCRIPT = `
(() => {
  const script = document.currentScript
  const isDnt = () => script?.dataset.doNotTrack === 'true' && navigator.doNotTrack === '1'
  const send = payload => {
    if (isDnt()) return
    void fetch('${FIXTURE_COLLECTOR_URL}', {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify(payload),
    }).catch(() => undefined)
  }

  window.umami = {
    track(nameOrTransform, data) {
      if (typeof nameOrTransform === 'function') {
        const properties = nameOrTransform({
          website: script?.dataset.websiteId ?? '',
          hostname: location.hostname,
          referrer: document.referrer,
          screen: window.screen.width + 'x' + window.screen.height,
          language: navigator.language,
          title: document.title,
          url: location.pathname,
        })
        send({
          type: 'pageview',
          website: properties?.website,
          url: typeof properties?.url === 'string' ? properties.url : '',
        })
        return
      }

      if (typeof nameOrTransform === 'string') {
        send({type: 'event', name: nameOrTransform, data: data ?? {}})
        return
      }

      throw new TypeError('Unsupported Umami track overload')
    },
  }

  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target.closest('[data-umami-event]') : null
    const name = target?.getAttribute('data-umami-event')
    if (!name) return

    const data = {}
    for (const attribute of target.attributes) {
      if (attribute.name.startsWith('data-umami-event-')) {
        data[attribute.name.slice('data-umami-event-'.length)] = attribute.value
      }
    }
    window.umami.track(name, data)
  })
})()
`

/** Stubs a ready `window.umami` tracker before any app script runs. */
const stubReadyUmamiTracker = async (page: Page) => {
  await page.addInitScript(() => {
    window.__umamiTrackCalls = []
    window.umami = {
      track: (
        nameOrTransform?:
          string | Record<string, unknown> | ((properties: Record<string, unknown>) => Record<string, unknown>),
        data?: Record<string, unknown>,
      ) => {
        if (typeof nameOrTransform === 'function') {
          const properties = nameOrTransform({
            website: 'e2e-fixture',
            hostname: location.hostname,
            referrer: document.referrer,
            screen: `${window.screen.width}x${window.screen.height}`,
            language: navigator.language,
            title: document.title,
            url: location.pathname,
          })
          window.__umamiTrackCalls?.push([properties])
          return
        }

        if (typeof nameOrTransform === 'string') {
          window.__umamiTrackCalls?.push([nameOrTransform, data])
          return
        }

        throw new TypeError('Unsupported Umami track overload')
      },
    }
  })
}

/** Navigates via the header nav link for a route, disambiguated from the footer's duplicate links. */
const clickHeaderNavLink = async (page: Page, name: string) => {
  await page.getByLabel('Main navigation').getByRole('link', {name, exact: true}).click()
}

const getTrackedUrls = async (page: Page): Promise<string[]> => {
  const calls = await page.evaluate(() => window.__umamiTrackCalls ?? [])
  return calls
    .map(call => (Array.isArray(call) ? call[0] : undefined))
    .filter((entry): entry is {url: string} => !!entry && typeof entry === 'object' && 'url' in entry)
    .map(entry => entry.url)
}

/** Blocks and records any request to the real collector so no test can leak traffic to it. */
const guardAgainstRealCollectorTraffic = async (page: Page) => {
  const blockedRequests: string[] = []
  await page.route('https://metrics.fro.bot/**', async route => {
    blockedRequests.push(route.request().url())
    await route.abort()
  })
  return blockedRequests
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const isStringRecord = (value: unknown): value is Record<string, string> =>
  isRecord(value) && Object.values(value).every(entry => typeof entry === 'string')

const isFixtureCollectorPayload = (value: unknown): value is FixtureCollectorPayload => {
  if (!isRecord(value) || (value.type !== 'pageview' && value.type !== 'event')) return false
  if (value.type === 'pageview') {
    return typeof value.website === 'string' && value.website.length > 0 && typeof value.url === 'string'
  }
  return typeof value.name === 'string' && isStringRecord(value.data)
}

/** Intercepts every metrics request, fulfills the fixture script, and records local collector payloads. */
const installFixtureTracker = async (page: Page, doNotTrack = false): Promise<FixtureTrackerBoundary> => {
  const boundary: FixtureTrackerBoundary = {
    collectorRequests: [],
    scriptRequests: [],
    scriptFulfillments: [],
    unexpectedRequests: [],
  }

  await page.route('https://metrics.fro.bot/**', async route => {
    const requestUrl = new URL(route.request().url())

    if (requestUrl.pathname === '/script.js') {
      boundary.scriptRequests.push(route.request().url())
      await route.fulfill({status: 200, contentType: 'application/javascript', body: FIXTURE_TRACKER_SCRIPT})
      boundary.scriptFulfillments.push(route.request().url())
      return
    }

    if (requestUrl.pathname === '/api/send') {
      const postData = route.request().postData()
      let payload: unknown
      try {
        payload = JSON.parse(postData ?? 'null') as unknown
      } catch {
        payload = undefined
      }

      if (isFixtureCollectorPayload(payload)) boundary.collectorRequests.push(payload)
      else boundary.unexpectedRequests.push(`${route.request().method()} ${route.request().url()}`)

      await route.fulfill({status: 200, contentType: 'application/json', body: '{}'})
      return
    }

    boundary.unexpectedRequests.push(route.request().url())
    await route.abort()
  })

  await page.addInitScript(
    ({dnt}: {dnt: boolean}) => {
      if (dnt) Object.defineProperty(navigator, 'doNotTrack', {value: '1', configurable: true})

      const appendFixtureScript = () => {
        const script = document.createElement('script')
        script.async = true
        script.src = 'https://metrics.fro.bot/script.js'
        script.dataset.websiteId = 'e2e-fixture'
        script.dataset.doNotTrack = 'true'
        script.dataset.excludeSearch = 'true'
        script.dataset.excludeHash = 'true'
        script.dataset.autoPageview = 'false'
        document.head.append(script)
      }

      if (document.head) appendFixtureScript()
      else document.addEventListener('DOMContentLoaded', appendFixtureScript, {once: true})
    },
    {dnt: doNotTrack},
  )

  return boundary
}

interface FixtureTrackerReadyOptions {
  allowCrossDocumentRequests?: boolean
}

const expectFixtureTrackerReady = async (
  page: Page,
  boundary: FixtureTrackerBoundary,
  options: FixtureTrackerReadyOptions = {},
): Promise<void> => {
  if (options.allowCrossDocumentRequests) {
    await expect.poll(() => boundary.scriptRequests).toContain(FIXTURE_TRACKER_URL)
    await expect.poll(() => boundary.scriptFulfillments).toContain(FIXTURE_TRACKER_URL)
  } else {
    await expect.poll(() => boundary.scriptRequests).toStrictEqual([FIXTURE_TRACKER_URL])
    await expect.poll(() => boundary.scriptFulfillments).toStrictEqual([FIXTURE_TRACKER_URL])
  }

  const script = page.locator(`script[src="${FIXTURE_TRACKER_URL}"][data-website-id="e2e-fixture"]`)
  await expect(script).toHaveCount(1)
  await expect(script).toHaveAttribute('data-do-not-track', 'true')
  await expect(script).toHaveAttribute('data-exclude-search', 'true')
  await expect(script).toHaveAttribute('data-exclude-hash', 'true')
  await expect(script).toHaveAttribute('data-auto-pageview', 'false')
}

const COLLECTOR_STABILITY_WINDOW_MS = 250

const waitForCollectorStability = async (page: Page): Promise<void> => {
  await page.waitForTimeout(COLLECTOR_STABILITY_WINDOW_MS)
}

const openAndCloseProjectPreview = async (page: Page): Promise<Locator> => {
  const previewButton = page.getByRole('button', {name: 'Preview Dev Like', exact: true})
  const projectCard = previewButton.locator('xpath=ancestor::*[@data-testid="project-card"]')

  await expect(previewButton).toHaveCount(1)
  await previewButton.dispatchEvent('click')
  await expect(page.getByRole('dialog', {name: 'Dev Like'})).toBeVisible()
  await page.getByRole('button', {name: 'Close project preview'}).click()

  return projectCard
}

const assertMetaCspBlocksEvilOrigins = async (page: Page): Promise<void> => {
  const interceptedRequests: string[] = []
  await page.route('https://evil.example/**', async route => {
    interceptedRequests.push(route.request().url())
    await route.abort()
  })

  await page.evaluate(() => {
    window.__cspViolations = []
    window.addEventListener('securitypolicyviolation', event => {
      window.__cspViolations?.push({blockedURI: event.blockedURI, violatedDirective: event.violatedDirective})
    })

    const script = document.createElement('script')
    script.src = 'https://evil.example/blocked.js'
    document.head.append(script)
    fetch('https://evil.example/blocked').catch(() => undefined)
  })

  await expect
    .poll(async () => (await page.evaluate(() => window.__cspViolations ?? [])).length)
    .toBeGreaterThanOrEqual(2)

  const violations = await page.evaluate(() => window.__cspViolations ?? [])
  expect(violations).toEqual(
    expect.arrayContaining([
      expect.objectContaining({blockedURI: 'https://evil.example/blocked.js'}),
      expect.objectContaining({blockedURI: 'https://evil.example/blocked'}),
    ]),
  )
  expect(interceptedRequests).toHaveLength(0)
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
})

test.describe('Configured analytics fixture integration', () => {
  test('sends normalized pageviews and bounded catalog events without duplicate custom events', async ({page}) => {
    const boundary = await installFixtureTracker(page)

    await page.goto('/projects?ref=forbidden#ignored')
    await page.waitForLoadState('networkidle')
    await expectFixtureTrackerReady(page, boundary)
    await expect.poll(() => boundary.collectorRequests.length).toBe(1)
    expect(boundary.collectorRequests).toStrictEqual([{type: 'pageview', website: 'e2e-fixture', url: '/projects'}])

    const projectCard = await openAndCloseProjectPreview(page)
    const projectId = await projectCard
      .locator('[data-umami-event="project_open"]')
      .first()
      .getAttribute('data-umami-event-project_id')
    expect(projectId).toEqual(expect.any(String))
    if (!projectId) throw new Error('Rendered project catalog event is missing its project ID')

    await page.locator('footer').getByRole('link', {name: 'Privacy', exact: true}).click()
    await expect(page).toHaveURL(/\/privacy$/)
    await expect.poll(() => boundary.collectorRequests.length).toBe(4)
    await waitForCollectorStability(page)

    expect(boundary.collectorRequests).toHaveLength(4)
    expect(boundary.collectorRequests).toStrictEqual([
      {type: 'pageview', website: 'e2e-fixture', url: '/projects'},
      {type: 'event', name: 'project_open', data: {action: 'preview', project_id: projectId, source: 'gallery'}},
      {type: 'event', name: 'navigation', data: {destination: 'privacy', method: 'route_link'}},
      {type: 'pageview', website: 'e2e-fixture', url: '/privacy'},
    ])
    expect(boundary.collectorRequests.filter(request => request.type === 'event')).toHaveLength(2)
    expect(boundary.unexpectedRequests).toHaveLength(0)

    const serializedRequests = JSON.stringify(boundary.collectorRequests)
    expect(serializedRequests).not.toMatch(/[?#]/)
    expect(serializedRequests).not.toContain('forbidden')
    expect(serializedRequests).not.toContain('ignored')
    expect(serializedRequests).not.toContain('Dev Like')
    expect(serializedRequests).not.toContain('Preview')
    expect(serializedRequests).not.toContain('https://')
  })

  test('honors DNT for native declarative and direct catalog events while the UI remains usable', async ({page}) => {
    const boundary = await installFixtureTracker(page, true)

    await page.goto('/projects', {waitUntil: 'commit'})
    await page.waitForLoadState('networkidle')
    await expectFixtureTrackerReady(page, boundary)

    await openAndCloseProjectPreview(page)

    await page.locator('footer').getByRole('link', {name: 'Privacy', exact: true}).click()
    await expect(page).toHaveURL(/\/privacy$/)
    await expect(page.getByRole('heading', {name: 'Privacy & analytics disclosure', exact: true})).toBeVisible()
    await waitForCollectorStability(page)
    expect(boundary.collectorRequests).toHaveLength(0)
    expect(boundary.collectorRequests).toStrictEqual([])
    expect(boundary.unexpectedRequests).toHaveLength(0)
  })

  test('restores a direct non-root 404 through the real GitHub Pages redirect and emits one pageview', async ({
    page,
  }) => {
    const boundary = await installFixtureTracker(page)
    let interceptedUrl: string | undefined

    await page.route('**/*', async route => {
      const requestUrl = new URL(route.request().url())
      if (requestUrl.pathname !== '/projects' || requestUrl.search !== '') {
        await route.fallback()
        return
      }

      interceptedUrl = route.request().url()
      await route.fulfill({status: 404, contentType: 'text/html', body: FOUR_OH_FOUR_BODY})
    })

    await page.goto('/projects', {waitUntil: 'commit'})
    await expect(page).toHaveURL(/\/projects$/)
    await expect(page.locator('#root')).toBeVisible()
    await expectFixtureTrackerReady(page, boundary, {allowCrossDocumentRequests: true})

    expect(interceptedUrl).toMatch(/\/projects$/)
    const finalUrl = new URL(page.url())
    expect(finalUrl.pathname).toBe('/projects')
    expect(finalUrl.search).toBe('')
    expect(finalUrl.hash).toBe('')
    expect(page.url()).not.toContain('?p=')
    await expect
      .poll(() => boundary.collectorRequests)
      .toStrictEqual([{type: 'pageview', website: 'e2e-fixture', url: '/projects'}])
    await waitForCollectorStability(page)
    expect(boundary.collectorRequests).toHaveLength(1)
    expect(boundary.collectorRequests).toStrictEqual([{type: 'pageview', website: 'e2e-fixture', url: '/projects'}])
    expect(JSON.stringify(boundary.collectorRequests)).not.toMatch(/[?#]/)
    await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(1)
    await assertMetaCspBlocksEvilOrigins(page)
  })

  test('restores an unknown 404 route but sends no analytics payloads', async ({page}) => {
    const boundary = await installFixtureTracker(page)
    let interceptedUrl: string | undefined

    await page.route('**/*', async route => {
      const requestUrl = new URL(route.request().url())
      if (requestUrl.pathname !== '/reset/alice@example.com' || requestUrl.search !== '') {
        await route.fallback()
        return
      }

      interceptedUrl = route.request().url()
      await route.fulfill({status: 404, contentType: 'text/html', body: FOUR_OH_FOUR_BODY})
    })

    await page.goto('/reset/alice@example.com', {waitUntil: 'commit'})
    await expect(page).toHaveURL(/\/reset\/alice@example\.com$/)
    await expect(page.locator('#root')).toBeVisible()
    await expectFixtureTrackerReady(page, boundary, {allowCrossDocumentRequests: true})

    expect(interceptedUrl).toMatch(/\/reset\/alice@example\.com$/)
    expect((await page.locator('body').textContent())?.trim().length ?? 0).toBeGreaterThan(50)
    await waitForCollectorStability(page)
    expect(boundary.collectorRequests).toStrictEqual([])
    expect(boundary.unexpectedRequests).toHaveLength(0)
  })
})

test.describe('Meta CSP enforcement', () => {
  test('blocks evil script and connect origins before network requests while the app renders', async ({page}) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(1)
    await assertMetaCspBlocksEvilOrigins(page)
    await expect(page.locator('#root')).toBeVisible()
    expect((await page.locator('body').textContent())?.trim().length ?? 0).toBeGreaterThan(50)
  })
})

test.describe('Analytics DNT suppression', () => {
  test('drops navigation pageviews under Do Not Track without any request', async ({page}) => {
    const blocked = await guardAgainstRealCollectorTraffic(page)
    await page.addInitScript(() => {
      window.__umamiTrackCalls = []
      Object.defineProperty(navigator, 'doNotTrack', {value: '1', configurable: true})
      window.umami = {
        track: (
          nameOrTransform?:
            string | Record<string, unknown> | ((properties: Record<string, unknown>) => Record<string, unknown>),
          data?: Record<string, unknown>,
        ) => {
          if (typeof nameOrTransform === 'function') {
            const properties = nameOrTransform({
              website: 'e2e-fixture',
              hostname: location.hostname,
              referrer: document.referrer,
              screen: `${window.screen.width}x${window.screen.height}`,
              language: navigator.language,
              title: document.title,
              url: location.pathname,
            })
            window.__umamiTrackCalls?.push([properties])
            return
          }

          if (typeof nameOrTransform === 'string') {
            window.__umamiTrackCalls?.push([nameOrTransform, data])
            return
          }

          throw new TypeError('Unsupported Umami track overload')
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
    await expect(page).toHaveURL(/\/blog$/)
    await expect(page.getByRole('heading', {name: 'Blog', exact: true})).toBeVisible()
    await page.evaluate(
      () =>
        new Promise<void>(resolve => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => resolve())
          })
        }),
    )

    expect(await getTrackedUrls(page)).toStrictEqual([])

    // Tracker becomes available: set window.umami and dispatch `load` on the
    // fixture script tag — the exact signal onUmamiTrackerReady waits for.
    await page.evaluate(() => {
      window.umami = {
        track: (
          nameOrTransform?:
            string | Record<string, unknown> | ((properties: Record<string, unknown>) => Record<string, unknown>),
          data?: Record<string, unknown>,
        ) => {
          if (typeof nameOrTransform === 'function') {
            const properties = nameOrTransform({
              website: 'e2e-fixture',
              hostname: location.hostname,
              referrer: document.referrer,
              screen: `${window.screen.width}x${window.screen.height}`,
              language: navigator.language,
              title: document.title,
              url: location.pathname,
            })
            window.__umamiTrackCalls?.push([properties])
            return
          }

          if (typeof nameOrTransform === 'string') {
            window.__umamiTrackCalls?.push([nameOrTransform, data])
            return
          }

          throw new TypeError('Unsupported Umami track overload')
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
