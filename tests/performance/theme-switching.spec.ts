/**
 * Performance tests for theme switching and component rendering
 * Tests the performance impact of dynamic theme changes and component interactions
 */

import {expect, test} from '@playwright/test'

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
    // Measure theme switch performance
    await page.click('[data-testid="theme-toggle"]')

    // Wait for theme transition to complete
    await page.waitForTimeout(500)

    // Measure layout shift during theme change using any instead of strict typing
    const layoutShifts = await page.evaluate(async () => {
      return new Promise<number>(resolve => {
        let cumulativeScore = 0
        new PerformanceObserver(list => {
          for (const entry of list.getEntries()) {
            const layoutShiftEntry = entry as any
            if (!layoutShiftEntry.hadRecentInput) {
              cumulativeScore += layoutShiftEntry.value
            }
          }
          resolve(cumulativeScore)
        }).observe({entryTypes: ['layout-shift']})

        // Resolve after a short delay to capture shifts
        setTimeout(() => resolve(cumulativeScore), 1000)
      })
    })

    // Verify theme actually changed
    const isDarkMode = await page.evaluate(() => {
      return document.documentElement.dataset['theme'] === 'dark'
    })

    // Performance assertions
    expect(layoutShifts).toBeLessThan(0.1) // CLS should be minimal during theme switch
    expect(isDarkMode).toBe(true) // Theme should have switched to dark

    // Test switching back
    await page.click('[data-testid="theme-toggle"]')
    await page.waitForTimeout(500)

    const isLightMode = await page.evaluate(() => {
      return document.documentElement.dataset['theme'] === 'light'
    })

    expect(isLightMode).toBe(true)
  })

  test('Custom theme application performance', async ({page}) => {
    // Open theme customizer if available
    const customizer = page.locator('[data-testid="theme-customizer-trigger"]')
    if (await customizer.isVisible()) {
      // Measure time to open customizer
      const startTime = Date.now()
      await customizer.click()
      await page.waitForSelector('[data-testid="theme-customizer"]', {state: 'visible'})
      const openTime = Date.now() - startTime

      expect(openTime).toBeLessThan(500) // Should open within 500ms

      // Test color picker interactions
      const colorInput = page.locator('input[type="color"]').first()
      if (await colorInput.isVisible()) {
        await colorInput.fill('#ff0000')
        await page.waitForTimeout(100) // Allow for debounced updates

        // Measure layout stability during color changes
        const layoutShifts = await page.evaluate(async () => {
          return new Promise<number>(resolve => {
            let cumulativeScore = 0
            new PerformanceObserver(list => {
              for (const entry of list.getEntries()) {
                const layoutShiftEntry = entry as any
                cumulativeScore += layoutShiftEntry.value
              }
              resolve(cumulativeScore)
            }).observe({entryTypes: ['layout-shift']})

            setTimeout(() => resolve(cumulativeScore), 500)
          })
        })

        expect(layoutShifts).toBeLessThan(0.05) // Minimal layout shift during color changes
      }
    }
  })

  test('Theme persistence performance', async ({page}) => {
    // Set a specific theme
    await page.click('[data-testid="theme-toggle"]')
    await page.waitForTimeout(300)

    // Reload page and measure time to apply saved theme
    const reloadStartTime = Date.now()
    await page.reload()
    await page.waitForLoadState('domcontentloaded')

    // Check if theme was applied before first paint
    const themeAppliedBeforePaint = await page.evaluate(() => {
      const theme = document.documentElement.dataset['theme']
      return theme !== null && theme !== 'light' // Assuming we switched to dark
    })

    const reloadTime = Date.now() - reloadStartTime

    expect(themeAppliedBeforePaint).toBe(true)
    expect(reloadTime).toBeLessThan(3000) // Page should load within 3 seconds
  })
})

test.describe('Component Rendering Performance', () => {
  test('Skills showcase animation performance', async ({page}) => {
    await page.goto('/')

    // Scroll to skills section to trigger animations
    await page.locator('[data-testid="skills-showcase"]').scrollIntoViewIfNeeded()

    // Measure animation frame rate
    const animationPerformance = await page.evaluate(async () => {
      return new Promise<number>(resolve => {
        let frameCount = 0
        const startTime = performance.now()

        function countFrames() {
          frameCount++
          if (performance.now() - startTime < 1000) {
            requestAnimationFrame(countFrames)
          } else {
            resolve(frameCount)
          }
        }

        requestAnimationFrame(countFrames)
      })
    })

    // Should maintain at least 30 FPS (30 frames in 1 second)
    expect(animationPerformance).toBeGreaterThan(30)
  })

  test('Project gallery rendering performance', async ({page}) => {
    await page.goto('/projects')
    await page.waitForLoadState('networkidle')

    // Measure time to render all project cards
    const renderTime = await page.evaluate(async () => {
      const startTime = performance.now()
      return new Promise<number>(resolve => {
        const observer = new MutationObserver(() => {
          const projectCards = document.querySelectorAll('[data-testid="project-card"]')
          if (projectCards.length > 0) {
            observer.disconnect()
            resolve(performance.now() - startTime)
          }
        })
        observer.observe(document.body, {childList: true, subtree: true})

        // Fallback timeout
        setTimeout(() => {
          observer.disconnect()
          resolve(performance.now() - startTime)
        }, 5000)
      })
    })

    expect(renderTime).toBeLessThan(2000) // Should render within 2 seconds
  })

  test('Modal open/close performance', async ({page}) => {
    await page.goto('/projects')
    await page.waitForLoadState('networkidle')

    // Find and click the first project card to open modal
    const projectCard = page.locator('[data-testid="project-card"]').first()
    if (await projectCard.isVisible()) {
      const modalOpenStart = Date.now()
      await projectCard.click()

      // Wait for modal to appear
      await page.waitForSelector('[data-testid="project-modal"]', {state: 'visible'})
      const modalOpenTime = Date.now() - modalOpenStart

      expect(modalOpenTime).toBeLessThan(300) // Modal should open quickly

      // Test modal close performance
      const modalCloseStart = Date.now()
      await page.keyboard.press('Escape')
      await page.waitForSelector('[data-testid="project-modal"]', {state: 'hidden'})
      const modalCloseTime = Date.now() - modalCloseStart

      expect(modalCloseTime).toBeLessThan(300) // Modal should close quickly
    }
  })

  test('Scroll performance with many elements', async ({page}) => {
    await page.goto('/blog')
    await page.waitForLoadState('networkidle')

    // Measure scroll performance
    const scrollPerformance = await page.evaluate(async () => {
      return new Promise<{totalScrollEvents: number; frameDrops: number; frameDropPercentage: number}>(resolve => {
        let scrollEvents = 0
        let frameDrops = 0
        let lastFrameTime = performance.now()

        const handleScroll = () => {
          scrollEvents++
          const currentTime = performance.now()
          const frameDelta = currentTime - lastFrameTime

          // Consider frame dropped if it takes longer than ~17ms (60 FPS)
          if (frameDelta > 20) {
            frameDrops++
          }

          lastFrameTime = currentTime
        }

        window.addEventListener('scroll', handleScroll, {passive: true})

        // Simulate smooth scrolling
        let scrollPosition = 0
        const scrollStep = () => {
          scrollPosition += 50
          window.scrollTo(0, scrollPosition)

          if (scrollPosition < 2000) {
            requestAnimationFrame(scrollStep)
          } else {
            window.removeEventListener('scroll', handleScroll)
            resolve({
              totalScrollEvents: scrollEvents,
              frameDrops,
              frameDropPercentage: (frameDrops / scrollEvents) * 100,
            })
          }
        }

        requestAnimationFrame(scrollStep)
      })
    })

    // Should have minimal frame drops during scrolling
    expect(scrollPerformance.frameDropPercentage).toBeLessThan(10) // Less than 10% frame drops
  })
})

test.describe('Core Web Vitals - Real User Monitoring', () => {
  test('Largest Contentful Paint (LCP)', async ({page}) => {
    await page.goto('/')

    const lcp = await page.evaluate(async () => {
      return new Promise<number | null>(resolve => {
        new PerformanceObserver(list => {
          const entries = list.getEntries()
          const lastEntry = entries.at(-1)
          resolve(lastEntry?.startTime || null)
        }).observe({entryTypes: ['largest-contentful-paint']})

        // Fallback timeout
        setTimeout(() => resolve(null), 10000)
      })
    })

    if (lcp !== null) {
      // LCP should be under 2.5 seconds (2500ms)
      expect(lcp).toBeLessThan(2500)
    }
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

    // FID should be under 100ms
    expect(interactionDelay).toBeLessThan(100)
  })

  test('Cumulative Layout Shift (CLS)', async ({page}) => {
    await page.goto('/')

    // Measure layout shifts during page load
    const cls = await page.evaluate(async () => {
      return new Promise<number>(resolve => {
        let cumulativeScore = 0

        new PerformanceObserver(list => {
          for (const entry of list.getEntries()) {
            const layoutShiftEntry = entry as any
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
