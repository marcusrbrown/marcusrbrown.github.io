import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {expect, test} from '@playwright/test'
import {BlogPostPage} from './pages/BlogPostPage'

interface BlogSnapshotPost {
  slug: string
  frontmatter: {
    title: string
  }
}

interface BlogSnapshot {
  posts: BlogSnapshotPost[]
}

const blogSnapshotPath = resolve(process.cwd(), process.env.BLOG_SNAPSHOT ?? 'src/data/blog-snapshot.json')
const blogSnapshot = JSON.parse(readFileSync(blogSnapshotPath, 'utf8')) as BlogSnapshot

const getFirstBlogPost = (): BlogSnapshotPost => {
  const firstPost = blogSnapshot.posts[0]
  expect(firstPost, 'The selected E2E blog snapshot must contain at least one post').toBeDefined()
  if (!firstPost) throw new Error('The selected E2E blog snapshot must contain at least one post')
  return firstPost
}

/**
 * Smoke tests that verify the deployed site loads correctly and all
 * critical assets are reachable. Guards against blank-page deploys,
 * broken asset references, and routing failures.
 *
 * @see https://github.com/marcusrbrown/mrbro.dev/issues/11
 */

test.describe('Base Path Smoke Tests', () => {
  test('home page loads successfully', async ({page}) => {
    const response = await page.goto('/')
    expect(response?.status()).toBeLessThan(400)
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveTitle(/.+/)
  })

  test('CSS assets load without 404', async ({page}) => {
    const failedRequests: string[] = []

    page.on('response', response => {
      const url = response.url()
      if (url.endsWith('.css') && response.status() >= 400) {
        failedRequests.push(`${response.status()} ${url}`)
      }
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    expect(failedRequests, `Failed asset requests: ${failedRequests.join(', ')}`).toHaveLength(0)
  })

  test('JavaScript assets load without 404', async ({page}) => {
    const failedRequests: string[] = []

    page.on('response', response => {
      const url = response.url()
      if (url.endsWith('.js') && response.status() >= 400) {
        failedRequests.push(`${response.status()} ${url}`)
      }
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    expect(failedRequests, `Failed JS requests: ${failedRequests.join(', ')}`).toHaveLength(0)
  })

  test('page renders visible content (not a blank page)', async ({page}) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Verify the root element has rendered content
    const rootElement = page.locator('#root')
    await expect(rootElement).toBeVisible()

    // Verify the page has meaningful text content
    const bodyText = await page.locator('body').textContent()
    expect(bodyText?.trim().length ?? 0).toBeGreaterThan(50)
  })

  test('sub-pages load successfully', async ({page}) => {
    const firstPost = getFirstBlogPost()
    const paths = ['/about', '/projects', '/blog', '/privacy', `/blog/${firstPost.slug}`]

    for (const path of paths) {
      const response = await page.goto(path)
      expect(response?.status(), `${path} should return < 400`).toBeLessThan(400)
      await page.waitForLoadState('networkidle')

      const rootElement = page.locator('#root')
      await expect(rootElement, `${path} should render content`).toBeVisible()

      if (path === '/privacy') {
        await expect(page.getByRole('heading', {name: 'Privacy & analytics disclosure', exact: true})).toBeVisible()
        await expect(
          page.getByRole('heading', {name: 'What analytics collects — and what it does not', exact: true}),
        ).toBeVisible()
      }
    }
  })

  test('direct load of a prerendered post renders content without SPA redirect', async ({page}) => {
    const firstPost = getFirstBlogPost()
    const blogPostPage = new BlogPostPage(page)
    const response = await page.goto(`/blog/${firstPost.slug}`)
    expect(response?.status()).toBeLessThan(400)
    await page.waitForLoadState('networkidle')

    await expect(blogPostPage.title).toHaveText(firstPost.frontmatter.title)
    await expect(blogPostPage.body).toBeVisible()
  })

  test('direct load of an unknown slug falls back to the not-found state', async ({page}) => {
    const response = await page.goto('/blog/this-slug-does-not-exist')
    expect(response?.status()).toBeLessThan(400)
    await page.waitForLoadState('networkidle')

    await expect(page.locator('.blog-post-page--not-found h1')).toHaveText('Post not found')
    await expect(page.locator('.blog-post-page__back-link')).toBeVisible()
  })

  test('navigation links use correct base path', async ({page}) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Verify all internal navigation links have correct paths (not double-slash or missing base)
    const links = await page
      .locator('nav a[href]')
      .evaluateAll(elements => elements.map(el => (el as HTMLAnchorElement).getAttribute('href') ?? ''))

    const internalLinks = links.filter(href => href.startsWith('/'))

    expect(
      internalLinks.length,
      'Expected at least one internal navigation link in <nav>, but none were found.',
    ).toBeGreaterThan(0)

    for (const href of internalLinks) {
      // Internal links (starting with /) should not have double slashes
      expect(href, `Internal link should not have double slash: ${href}`).not.toMatch(/\/\//)
    }
  })
})
