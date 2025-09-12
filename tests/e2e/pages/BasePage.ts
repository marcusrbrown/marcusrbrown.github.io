import type {Locator, Page} from '@playwright/test'

/**
 * Base page class that provides common functionality for all pages
 * Implements shared navigation, theme switching, and utility methods
 */
export class BasePage {
  protected page: Page
  protected header: Locator
  protected footer: Locator
  protected main: Locator
  protected themeToggle: Locator
  protected mainContent: Locator

  constructor(page: Page) {
    this.page = page
    this.header = page.locator('header.header')
    this.footer = page.locator('footer')
    this.main = page.locator('main')
    this.themeToggle = page.locator('.theme-toggle')
    this.mainContent = page.locator('main, .home-page, .about-page, .projects-page, .blog-page')
  }

  /**
   * Navigate to a specific path
   */
  async goto(path = '/') {
    await this.page.goto(path)
  }

  /**
   * Wait for the page to be fully loaded
   */
  async waitForLoad() {
    await this.page.waitForLoadState('networkidle')
  }

  /**
   * Get the current theme mode from the data attribute
   */
  async getCurrentTheme(): Promise<string> {
    return (await this.page.getAttribute('html', 'data-theme')) || 'light'
  }

  /**
   * Get the theme toggle locator for direct access in tests
   */
  get themeToggleElement(): Locator {
    return this.themeToggle
  }

  /**
   * Toggle between light and dark themes
   */
  async toggleTheme() {
    const currentTheme = await this.getCurrentTheme()
    await this.themeToggle.click()

    // Wait for theme change to complete - the ThemeContext has a 300ms transition
    // Plus cleanup timers, so we need to wait a bit longer
    await this.page.waitForTimeout(400)

    // Optionally verify the theme actually changed
    const newTheme = await this.getCurrentTheme()
    if (newTheme === currentTheme) {
      // Theme didn't change, might be a timing issue, wait a bit more
      await this.page.waitForTimeout(200)
    }
  }

  /**
   * Set theme to a specific mode
   */
  async setTheme(theme: 'light' | 'dark' | 'system') {
    const currentTheme = await this.getCurrentTheme()

    if (currentTheme !== theme) {
      // Click theme toggle until we get the desired theme
      // This handles the three-state toggle (light -> dark -> system -> light)
      let attempts = 0
      while ((await this.getCurrentTheme()) !== theme && attempts < 3) {
        await this.themeToggle.click()
        await this.page.waitForTimeout(100) // Small delay for theme change
        attempts++
      }
    }
  }

  /**
   * Check if the header navigation is visible and functional
   */
  async isNavigationVisible(): Promise<boolean> {
    return this.header.isVisible()
  }

  /**
   * Navigate using the header navigation links
   */
  async navigateToPage(pageName: 'home' | 'about' | 'projects' | 'blog') {
    const navLinks = {
      home: 'Home',
      about: 'About',
      projects: 'Projects',
      blog: 'Blog',
    }

    const linkText = navLinks[pageName]

    // First try the standard navigation link
    const navLink = this.header.locator(`a:has-text("${linkText}")`)

    // Wait for the link to be visible and clickable
    await navLink.waitFor({state: 'visible', timeout: 10000})
    await navLink.click()
    await this.waitForLoad()
  }

  /**
   * Check if the page is responsive by testing viewport changes
   */
  async testResponsiveness(width: number, height: number) {
    await this.page.setViewportSize({width, height})
    await this.page.waitForTimeout(500) // Allow for CSS transitions
  }

  /**
   * Get all visible links in the navigation
   */
  async getNavigationLinks(): Promise<string[]> {
    const links = await this.header.locator('nav a').allTextContents()
    return links.filter(link => link.trim().length > 0)
  }

  /**
   * Check accessibility of the page by ensuring basic landmarks exist
   */
  async checkBasicAccessibility(): Promise<boolean> {
    const header = await this.header.count()
    const main = await this.mainContent.count()
    const footer = await this.footer.count()

    return header > 0 && main > 0 && footer > 0
  }

  /**
   * Wait for theme transition to complete
   */
  async waitForThemeTransition() {
    // Wait for CSS transitions to complete
    await this.page.waitForTimeout(300)
  }

  /**
   * Check if the page has loaded all critical resources
   */
  async verifyPageLoad(): Promise<boolean> {
    try {
      await this.waitForLoad()
      // Wait for basic page elements to be visible
      const hasHeader = await this.header.isVisible()
      const hasContent = await this.page.locator('body').isVisible()
      return hasHeader && hasContent
    } catch {
      return false
    }
  }

  /**
   * Take a screenshot for visual testing
   */
  async takeScreenshot(name: string) {
    return this.page.screenshot({
      path: `test-results/${name}.png`,
      fullPage: true,
    })
  }
}
