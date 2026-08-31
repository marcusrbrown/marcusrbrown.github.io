/**
 * Performance tests for theme switching and component rendering
 * Tests the performance impact of dynamic theme changes and component interactions
 */

import {expect, test} from '@playwright/test'

import {latestLargestContentfulPaint, smoothScrollDuration} from './measurement-utils'

interface LayoutShiftEntry extends PerformanceEntry {
  value: number
  hadRecentInput: boolean
}

interface ThemePreloaderObservation {
  firstDataTheme: string | null
  firstDataThemeBeforeBody: boolean
}

test.describe('Theme Switching Performance', () => {
  test.beforeEach(async ({page}) => {
    // Navigate to home page
    await page.goto('/')

    // Wait for page to be fully loaded
    await page.waitForLoadState('networkidle')

    // Ensure theme system is initialized
    await page.waitForSelector('[data-testid="theme-toggle"]', {state: 'visible'})
  })

  test('Theme toggle performance impact', async ({page}) => {
    // The theme toggle opens the picker; selecting a mode applies the theme.
    await page.click('[data-testid="theme-toggle"]')
    const themePicker = page.getByRole('listbox', {name: 'Theme choices'})
    await themePicker.getByRole('option', {name: 'Light', exact: true}).click()

    // Start measuring before the theme change so the observer cannot miss it.
    const layoutShiftsPromise = page.evaluate(async () => {
      return new Promise<number>(resolve => {
        let cumulativeScore = 0
        const observer = new PerformanceObserver(list => {
          for (const entry of list.getEntries()) {
            const layoutShiftEntry = entry as LayoutShiftEntry
            if (!layoutShiftEntry.hadRecentInput) {
              cumulativeScore += layoutShiftEntry.value
            }
          }
        })
        observer.observe({entryTypes: ['layout-shift']})

        // Resolve after a short delay to capture all shifts from the change.
        setTimeout(() => {
          observer.disconnect()
          resolve(cumulativeScore)
        }, 1000)
      })
    })

    await themePicker.getByRole('option', {name: 'Dark', exact: true}).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    const layoutShifts = await layoutShiftsPromise

    // Performance assertions
    expect(layoutShifts).toBeLessThan(0.1) // CLS should be minimal during theme switch

    // Test switching back
    await themePicker.getByRole('option', {name: 'Light', exact: true}).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  })

  test('Theme persistence performance', async ({page}) => {
    // The theme toggle opens the picker; select the mode to persist it.
    await page.click('[data-testid="theme-toggle"]')
    await page.getByRole('listbox', {name: 'Theme choices'}).getByRole('option', {name: 'Dark', exact: true}).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

    // Observe the preloader's synchronous data-theme write on the next
    // document before any page scripts run. The preloader is the only public
    // script that uses setAttribute for data-theme.
    await page.addInitScript(() => {
      const observation: ThemePreloaderObservation = {
        firstDataTheme: null,
        firstDataThemeBeforeBody: false,
      }
      const originalSetAttribute = Element.prototype.setAttribute

      Element.prototype.setAttribute = function (this: Element, name: string, value: string) {
        if (this === document.documentElement && name === 'data-theme' && observation.firstDataTheme === null) {
          observation.firstDataTheme = value
          observation.firstDataThemeBeforeBody = document.body === null
        }
        originalSetAttribute.call(this, name, value)
      }

      Object.defineProperty(window, '__themePreloaderObservation', {
        configurable: true,
        value: observation,
      })
    })

    // Reload page and measure time to apply saved theme
    const reloadStartTime = Date.now()
    await page.reload({waitUntil: 'domcontentloaded'})

    // The preloader applies the persisted theme during document loading.
    const themeAfterReload = await page.locator('html').getAttribute('data-theme')
    const preloaderObservation = await page.evaluate(() => {
      const windowWithObservation = window as Window & {
        __themePreloaderObservation?: ThemePreloaderObservation
      }
      return windowWithObservation.__themePreloaderObservation ?? null
    })

    const reloadTime = Date.now() - reloadStartTime

    expect(themeAfterReload).toBe('dark')
    expect(preloaderObservation).toEqual({
      firstDataTheme: 'dark',
      firstDataThemeBeforeBody: true,
    })
    // Runner contention makes reload timing unsuitable for gating until #313 establishes CI-backed thresholds.
    console.warn(`[performance] Page reload time: ${reloadTime.toFixed(2)}ms (observational; not gating)`)
  })
})

test.describe('Component Rendering Performance', () => {
  test('Project gallery rendering performance', async ({page}) => {
    const renderStart = Date.now()
    await page.goto('/projects')
    // Wait for the rendered result instead of observing after networkidle; the
    // synchronous snapshot can render before a post-load observer is attached.
    await expect(page.locator('[data-testid="project-card"]').first()).toBeVisible()
    const renderTime = Date.now() - renderStart

    // Runner contention makes render timing unsuitable for gating until #313 establishes CI-backed thresholds.
    console.warn(`[performance] Project gallery render time: ${renderTime.toFixed(2)}ms (observational; not gating)`)
  })

  test('Modal open/close performance', async ({page}) => {
    await page.goto('/projects')

    // Project cards expose a Preview button; the card container itself is not
    // interactive.
    const projectCard = page.locator('[data-testid="project-card"]').first()
    await expect(projectCard).toBeVisible()
    const previewButton = projectCard.getByRole('button', {name: /^Preview /})
    const modal = page.getByRole('dialog')

    // Measure from the browser click event, not from Playwright's actionability
    // checks, which include waiting for the hover overlay to settle.
    const modalOpenTimePromise = page.evaluate(() => {
      return new Promise<number>(resolve => {
        const previewButton = document.querySelector('.project-card__preview-btn')
        if (!(previewButton instanceof HTMLElement)) {
          throw new TypeError('Project preview button is not rendered')
        }

        previewButton.addEventListener(
          'click',
          () => {
            const clickTime = performance.now()
            const waitForModal = () => {
              if (document.querySelector('.project-preview-modal--open')) {
                resolve(performance.now() - clickTime)
                return
              }
              requestAnimationFrame(waitForModal)
            }
            waitForModal()
          },
          {once: true},
        )
      })
    })

    await previewButton.click()

    // Wait for the semantic dialog exposed by the application.
    await expect(modal).toBeVisible()
    const modalOpenTime = await modalOpenTimePromise

    // Runner contention makes modal timing unsuitable for gating until #313 establishes CI-backed thresholds.
    console.warn(`[performance] Modal open time: ${modalOpenTime.toFixed(2)}ms (observational; not gating)`)

    // Test modal close performance
    const modalCloseStart = Date.now()
    await page.keyboard.press('Escape')
    await expect(modal).toBeHidden()
    const modalCloseTime = Date.now() - modalCloseStart

    // Runner contention makes modal timing unsuitable for gating until #313 establishes CI-backed thresholds.
    console.warn(`[performance] Modal close time: ${modalCloseTime.toFixed(2)}ms (observational; not gating)`)
  })

  test('Scroll performance with many elements', async ({page}) => {
    // The blog fixture currently contains one short post, which is not a
    // reliable long-scroll workload on desktop. Use the full landing page.
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Playwright's scroll events are not frame samples: desktop smooth-scroll
    // coalesces them differently from mobile emulation. Measure the duration
    // of the same smooth-scroll workload instead of reporting event gaps as
    // dropped frames.
    const scrollPerformance = await page.evaluate(async () => {
      return new Promise<{
        scrollableExtent: number
        totalScrollEvents: number
        scrollStartTime: number
        scrollEndTime: number
      }>(resolve => {
        let scrollEvents = 0
        let scrollStartTime: number | null = null
        const maxScrollPosition = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
        const targetScrollPosition = Math.min(2000, maxScrollPosition)
        let safetyTimer: number | undefined
        let scrollAnimationFrame: number | undefined
        let settled = false

        const handleScroll = () => {
          scrollEvents++
          if (scrollStartTime === null) {
            scrollStartTime = performance.now()
          }
        }

        const finish = () => {
          if (settled) return
          settled = true
          window.removeEventListener('scroll', handleScroll)
          if (safetyTimer !== undefined) {
            window.clearTimeout(safetyTimer)
          }
          if (scrollAnimationFrame !== undefined) {
            window.cancelAnimationFrame(scrollAnimationFrame)
          }
          resolve({
            scrollableExtent: maxScrollPosition,
            totalScrollEvents: scrollEvents,
            scrollStartTime: scrollStartTime ?? performance.now(),
            scrollEndTime: performance.now(),
          })
        }

        window.addEventListener('scroll', handleScroll, {passive: true})

        if (targetScrollPosition === 0) {
          finish()
          return
        }

        safetyTimer = window.setTimeout(finish, 2000)
        const waitForScrollToFinish = () => {
          if (settled) return
          if (window.scrollY >= targetScrollPosition) {
            scrollAnimationFrame = requestAnimationFrame(finish)
            return
          }
          scrollAnimationFrame = requestAnimationFrame(waitForScrollToFinish)
        }

        window.scrollTo({top: targetScrollPosition, left: 0, behavior: 'smooth'})
        scrollAnimationFrame = requestAnimationFrame(waitForScrollToFinish)
      })
    })

    expect(
      scrollPerformance.scrollableExtent,
      'Scroll workload was absent or insufficient: the landing page had no positive scrollable extent.',
    ).toBeGreaterThan(0)
    expect(
      scrollPerformance.totalScrollEvents,
      'Scroll workload was absent or insufficient: no scroll events were recorded.',
    ).toBeGreaterThan(0)

    const scrollDuration = smoothScrollDuration(scrollPerformance.scrollStartTime, scrollPerformance.scrollEndTime)

    // Runner contention makes scroll timing unsuitable for gating until #313 establishes a CI-backed threshold.
    console.warn(`[performance] Smooth-scroll duration: ${scrollDuration.toFixed(2)}ms (observational; not gating)`)
  })
})

test.describe('Core Web Vitals - Real User Monitoring', () => {
  test('Largest Contentful Paint (LCP)', async ({page}) => {
    // Install the observer before navigation. An observer attached after
    // page.goto() misses the page's real LCP candidates and can only report a
    // later paint, if one happens. buffered also covers candidates delivered
    // before the observer callback runs.
    await page.addInitScript(() => {
      const entries: {startTime: number}[] = []

      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          entries.push({startTime: entry.startTime})
        }
      }).observe({type: 'largest-contentful-paint', buffered: true})

      Object.defineProperty(window, '__largestContentfulPaintEntries', {
        configurable: true,
        value: entries,
      })
    })

    await page.goto('/')

    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)

    const lcpEntries = await page.evaluate(() => {
      const windowWithLcp = window as Window & {
        __largestContentfulPaintEntries?: {startTime: number}[]
      }

      return windowWithLcp.__largestContentfulPaintEntries ?? []
    })
    const lcp = latestLargestContentfulPaint(lcpEntries)

    // Runner contention makes LCP timing unsuitable for gating until #313 establishes CI-backed thresholds.
    console.warn(
      `[performance] Largest Contentful Paint: ${lcp === null ? 'unavailable' : `${lcp.toFixed(2)}ms`} (observational; not gating)`,
    )
  })

  test('First Input Delay (FID) simulation', async ({page}) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Simulate user interaction and measure response time
    const interactionDelay = await page.evaluate(async () => {
      return new Promise<number>(resolve => {
        const startTime = performance.now()

        document.addEventListener(
          'click',
          () => {
            const endTime = performance.now()
            resolve(endTime - startTime)
          },
          {once: true},
        )

        // Simulate click on theme toggle
        const themeToggle = document.querySelector('[data-testid="theme-toggle"]') as HTMLElement
        if (themeToggle) {
          themeToggle.click()
        } else {
          resolve(0) // No interaction element found
        }
      })
    })

    // Runner contention makes synthetic interaction timing unsuitable for gating until #313 establishes thresholds.
    console.warn(
      `[performance] Synthetic interaction delay: ${interactionDelay.toFixed(2)}ms (observational; not gating)`,
    )
  })

  test('Cumulative Layout Shift (CLS)', async ({page}) => {
    await page.goto('/')

    // Measure layout shifts during page load
    const cls = await page.evaluate(async () => {
      return new Promise<number>(resolve => {
        let cumulativeScore = 0

        new PerformanceObserver(list => {
          for (const entry of list.getEntries()) {
            const layoutShiftEntry = entry as LayoutShiftEntry
            if (!layoutShiftEntry.hadRecentInput) {
              cumulativeScore += layoutShiftEntry.value
            }
          }
        }).observe({entryTypes: ['layout-shift']})

        // Wait for page to settle and resolve with final CLS score
        setTimeout(() => resolve(cumulativeScore), 5000)
      })
    })

    // CLS should be under 0.1
    expect(cls).toBeLessThan(0.1)
  })
})
