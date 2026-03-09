import {expect, test} from '@playwright/test'

test.describe('scroll reveal', () => {
  test.beforeEach(async ({page}) => {
    await page.goto('/')
  })

  test('about section reveals on page load as it enters the initial viewport', async ({page}) => {
    // The About section is the first content section and should enter the viewport
    // immediately on load, triggering the IntersectionObserver callback.
    await expect(page.locator('#about')).toHaveClass(/is-visible/)
  })

  test('contact section is hidden before scrolling and reveals after', async ({page}) => {
    const contactSection = page.locator('#contact')

    // Contact is the last section — it should be below the fold on initial load.
    await expect(contactSection).not.toHaveClass(/is-visible/)

    // Scroll the section into the viewport.
    await contactSection.scrollIntoViewIfNeeded()

    // IntersectionObserver fires with isIntersecting: true → is-visible applied.
    await expect(contactSection).toHaveClass(/is-visible/)
  })

  test('every section reveals when scrolled into view', async ({page}) => {
    // Scroll each section into view in order and verify the is-visible class
    // is applied — this exercises the rootMargin and threshold defaults used by
    // useScrollReveal in a real browser layout.
    const sectionIds = ['about', 'experience', 'skills', 'contact']

    for (const id of sectionIds) {
      const section = page.locator(`#${id}`)
      await section.scrollIntoViewIfNeeded()
      await expect(section).toHaveClass(/is-visible/)
    }
  })
})
