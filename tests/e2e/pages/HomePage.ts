import type {Locator, Page} from '@playwright/test'

import {BasePage} from './BasePage'

/**
 * Page Object Model for the Home page
 * Contains elements and methods specific to the home/landing page
 */
export class HomePage extends BasePage {
  readonly heroSection: Locator
  readonly skillsShowcase: Locator
  readonly featuredProjects: Locator
  readonly heroTitle: Locator
  readonly heroSubtitle: Locator
  readonly ctaButtons: Locator

  constructor(page: Page) {
    super(page)
    this.heroSection = page.locator('.hero-section')
    this.skillsShowcase = page.locator('.skills-showcase')
    this.featuredProjects = page.locator('.projects-section')
    this.heroTitle = page.locator('.hero-title')
    this.heroSubtitle = page.locator('.hero-subtitle')
    this.ctaButtons = page.locator('.hero-cta-button')
  }

  /**
   * Navigate to the home page
   */
  override async goto() {
    await super.goto('/')
    await this.waitForLoad()
  }

  /**
   * Check if hero section is visible and contains expected content
   */
  async isHeroSectionVisible(): Promise<boolean> {
    return await this.heroSection.isVisible()
  }

  /**
   * Get the hero title text
   */
  async getHeroTitle(): Promise<string> {
    return (await this.heroTitle.textContent()) || ''
  }

  /**
   * Get the hero subtitle text
   */
  async getHeroSubtitle(): Promise<string> {
    return (await this.heroSubtitle.textContent()) || ''
  }

  /**
   * Check if skills showcase is present
   */
  async isSkillsShowcaseVisible(): Promise<boolean> {
    return await this.skillsShowcase.isVisible()
  }

  /**
   * Get all skill items displayed
   */
  async getSkillItems(): Promise<string[]> {
    const skillElements = await this.skillsShowcase.locator('.skill-item, .skill').allTextContents()
    return skillElements.filter(skill => skill.trim().length > 0)
  }

  /**
   * Check if featured projects section is visible
   */
  async isFeaturedProjectsVisible(): Promise<boolean> {
    return await this.featuredProjects.isVisible()
  }

  /**
   * Get the number of featured projects displayed
   */
  async getFeaturedProjectsCount(): Promise<number> {
    return await this.featuredProjects.locator('.project-card, .card').count()
  }

  /**
   * Click on a call-to-action button
   */
  async clickCTA(index = 0) {
    const button = this.ctaButtons.nth(index)
    await button.click()
    await this.waitForLoad()
  }

  /**
   * Verify all main sections are present on the home page
   */
  async verifyMainSections(): Promise<boolean> {
    const heroVisible = await this.isHeroSectionVisible()
    const skillsVisible = await this.isSkillsShowcaseVisible()
    const projectsVisible = await this.isFeaturedProjectsVisible()

    return heroVisible && skillsVisible && projectsVisible
  }

  /**
   * Test hero section responsiveness across different viewport sizes
   */
  async testHeroResponsiveness() {
    const viewports = [
      {width: 375, height: 667}, // Mobile
      {width: 768, height: 1024}, // Tablet
      {width: 1024, height: 768}, // Desktop
      {width: 1440, height: 900}, // Large Desktop
    ]

    for (const viewport of viewports) {
      await this.testResponsiveness(viewport.width, viewport.height)
      const isVisible = await this.isHeroSectionVisible()
      if (!isVisible) {
        throw new Error(`Hero section not visible at ${viewport.width}x${viewport.height}`)
      }
    }
  }

  /**
   * Test theme switching on the home page
   */
  async testThemeSwitching() {
    // Test light theme
    await this.setTheme('light')
    await this.waitForThemeTransition()
    const lightTheme = await this.getCurrentTheme()

    // Test dark theme
    await this.setTheme('dark')
    await this.waitForThemeTransition()
    const darkTheme = await this.getCurrentTheme()

    return {light: lightTheme, dark: darkTheme}
  }
}
