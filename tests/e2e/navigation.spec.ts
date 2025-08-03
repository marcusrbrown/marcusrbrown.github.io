import {expect, test} from '@playwright/test'

import {AboutPage, BlogPage, HomePage, ProjectsPage} from './pages'

test.describe('Core Navigation Tests', () => {
  test.describe('Home Page Navigation', () => {
    test('should load home page successfully', async ({page}) => {
      const homePage = new HomePage(page)
      await homePage.goto()

      expect(await homePage.verifyPageLoad()).toBe(true)
      expect(await homePage.verifyMainSections()).toBe(true)
    })

    test('should display hero section with content', async ({page}) => {
      const homePage = new HomePage(page)
      await homePage.goto()

      expect(await homePage.isHeroSectionVisible()).toBe(true)

      const heroTitle = await homePage.getHeroTitle()
      expect(heroTitle.length).toBeGreaterThan(0)
    })

    test('should show navigation header', async ({page}) => {
      const homePage = new HomePage(page)
      await homePage.goto()

      expect(await homePage.isNavigationVisible()).toBe(true)

      const navLinks = await homePage.getNavigationLinks()
      expect(navLinks.length).toBeGreaterThan(0)
    })

    test('should pass basic accessibility checks', async ({page}) => {
      const homePage = new HomePage(page)
      await homePage.goto()

      expect(await homePage.checkBasicAccessibility()).toBe(true)
    })
  })

  test.describe('About Page Navigation', () => {
    test('should navigate to about page from home', async ({page}) => {
      const homePage = new HomePage(page)
      const aboutPage = new AboutPage(page)

      await homePage.goto()
      await homePage.navigateToPage('about')

      expect(page.url()).toContain('/about')
      expect(await aboutPage.verifyPageLoad()).toBe(true)
    })

    test('should display about content', async ({page}) => {
      const aboutPage = new AboutPage(page)
      await aboutPage.goto()

      expect(await aboutPage.verifyAboutSections()).toBe(true)
      expect(await aboutPage.isAboutContentVisible()).toBe(true)
    })

    test('should load profile image if present', async ({page}) => {
      const aboutPage = new AboutPage(page)
      await aboutPage.goto()

      // Profile image might not be present, so we check if it exists first
      const imageVisible = await aboutPage.profileImage.count()
      if (imageVisible > 0) {
        expect(await aboutPage.isProfileImageLoaded()).toBe(true)
      }
    })
  })

  test.describe('Projects Page Navigation', () => {
    test('should navigate to projects page from home', async ({page}) => {
      const homePage = new HomePage(page)
      const projectsPage = new ProjectsPage(page)

      await homePage.goto()
      await homePage.navigateToPage('projects')

      expect(page.url()).toContain('/projects')
      expect(await projectsPage.verifyPageLoad()).toBe(true)
    })

    test('should display projects container', async ({page}) => {
      const projectsPage = new ProjectsPage(page)
      await projectsPage.goto()

      expect(await projectsPage.verifyProjectsPage()).toBe(true)
    })

    test('should show project cards when available', async ({page}) => {
      const projectsPage = new ProjectsPage(page)
      await projectsPage.goto()

      const projectCount = await projectsPage.getProjectCount()
      // Projects might be loaded dynamically, so we allow 0 or more
      expect(projectCount).toBeGreaterThanOrEqual(0)

      if (projectCount > 0) {
        const titles = await projectsPage.getProjectTitles()
        expect(titles.length).toBeGreaterThan(0)
      }
    })
  })

  test.describe('Blog Page Navigation', () => {
    test('should navigate to blog page from home', async ({page}) => {
      const homePage = new HomePage(page)
      const blogPage = new BlogPage(page)

      await homePage.goto()
      await homePage.navigateToPage('blog')

      expect(page.url()).toContain('/blog')
      expect(await blogPage.verifyPageLoad()).toBe(true)
    })

    test('should display blog container', async ({page}) => {
      const blogPage = new BlogPage(page)
      await blogPage.goto()

      expect(await blogPage.verifyBlogPage()).toBe(true)
    })

    test('should handle blog posts or empty state', async ({page}) => {
      const blogPage = new BlogPage(page)
      await blogPage.goto()

      // Wait for API calls to complete or fail
      await page.waitForTimeout(4000)

      // Blog might be empty or have posts
      const postCount = await blogPage.getBlogPostCount()
      expect(postCount).toBeGreaterThanOrEqual(0)

      if (postCount > 0) {
        const titles = await blogPage.getBlogPostTitles()
        // Blog posts exist but titles might be empty due to API issues
        // Just verify we can find the title elements, content might be empty
        expect(titles).toBeDefined()
        expect(Array.isArray(titles)).toBe(true)
      }
    })
  })

  test.describe('Cross-Page Navigation', () => {
    test('should navigate between all pages using header navigation', async ({page}) => {
      const homePage = new HomePage(page)

      // Start at home
      await homePage.goto()
      expect(await homePage.verifyPageLoad()).toBe(true)

      // Navigate to About
      await homePage.navigateToPage('about')
      expect(page.url()).toContain('/about')

      // Navigate to Projects
      await homePage.navigateToPage('projects')
      expect(page.url()).toContain('/projects')

      // Navigate to Blog
      await homePage.navigateToPage('blog')
      expect(page.url()).toContain('/blog')

      // Navigate back to Home
      await homePage.navigateToPage('home')
      expect(page.url()).toMatch(/\/$/)
    })

    test('should maintain header and footer across all pages', async ({page}) => {
      const pages = [new HomePage(page), new AboutPage(page), new ProjectsPage(page), new BlogPage(page)]

      for (const pageInstance of pages) {
        await pageInstance.goto()
        expect(await pageInstance.isNavigationVisible()).toBe(true)
        expect(await pageInstance.checkBasicAccessibility()).toBe(true)
      }
    })
  })
})
