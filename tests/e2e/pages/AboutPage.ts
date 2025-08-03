import type {Locator, Page} from '@playwright/test'

import {BasePage} from './BasePage'

/**
 * Page Object Model for the About page
 */
export class AboutPage extends BasePage {
  readonly aboutContent: Locator
  readonly profileImage: Locator
  readonly socialLinks: Locator
  readonly contactInfo: Locator

  constructor(page: Page) {
    super(page)
    this.aboutContent = page.locator('main, div').first()
    this.profileImage = page.locator('img[alt*="profile"], img[alt*="Marcus"]')
    this.socialLinks = page.locator('a[href*="github"], a[href*="linkedin"], a[href*="twitter"]')
    this.contactInfo = page.locator('[data-testid="contact-info"]')
  }

  /**
   * Navigate to the about page
   */
  override async goto() {
    await super.goto('/about')
    await this.waitForLoad()
  }

  /**
   * Check if about content is visible
   */
  async isAboutContentVisible(): Promise<boolean> {
    return await this.aboutContent.isVisible()
  }

  /**
   * Check if profile image is loaded
   */
  async isProfileImageLoaded(): Promise<boolean> {
    const isVisible = await this.profileImage.isVisible()
    if (!isVisible) return false

    // Check if image is actually loaded
    const naturalWidth = await this.profileImage.evaluate((img: HTMLImageElement) => img.naturalWidth)
    return naturalWidth > 0
  }

  /**
   * Get social media links
   */
  async getSocialLinks(): Promise<string[]> {
    const links = await this.socialLinks.locator('a').allTextContents()
    return links.filter(link => link.trim().length > 0)
  }

  /**
   * Verify about page sections are present
   */
  async verifyAboutSections(): Promise<boolean> {
    const contentVisible = await this.isAboutContentVisible()
    const hasHeading = (await this.page.locator('h1').count()) > 0
    const hasContent = (await this.page.locator('p').count()) > 0

    return contentVisible && hasHeading && hasContent
  }
}
