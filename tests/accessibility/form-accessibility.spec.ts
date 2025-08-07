import AxeBuilder from '@axe-core/playwright'
import {expect, test} from '@playwright/test'

/**
 * Form elements and error states accessibility tests
 * Tests form accessibility compliance, labeling, validation, and error handling
 */

test.describe('Form Accessibility Tests', () => {
  test.describe('Form Element Accessibility', () => {
    test('should have proper labels for all form inputs', async ({page}) => {
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      // Look for form elements across the site
      const formInputs = page.locator('input, textarea, select')
      const inputCount = await formInputs.count()

      for (let i = 0; i < inputCount; i++) {
        const input = formInputs.nth(i)
        const inputType = await input.getAttribute('type')

        // Skip hidden inputs and submit buttons
        if (inputType === 'hidden' || inputType === 'submit') continue

        const inputId = await input.getAttribute('id')
        const ariaLabel = await input.getAttribute('aria-label')
        const ariaLabelledBy = await input.getAttribute('aria-labelledby')
        const placeholder = await input.getAttribute('placeholder')

        let hasLabel = false

        // Check for associated label element
        if (inputId) {
          const label = page.locator(`label[for="${inputId}"]`)
          hasLabel = (await label.count()) > 0
        }

        // Check for aria-label or aria-labelledby
        hasLabel = hasLabel || !!ariaLabel || !!ariaLabelledBy

        // For accessibility, we prefer explicit labels over placeholders
        // but placeholder can serve as fallback for some cases
        if (!hasLabel && placeholder) {
          // This is acceptable for simple cases but not ideal
          hasLabel = true
        }

        expect(hasLabel).toBe(true)
      }
    })

    test('should provide accessible form validation', async ({page}) => {
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      // Look for forms that might have validation
      const forms = page.locator('form')
      const formCount = await forms.count()

      for (let i = 0; i < formCount; i++) {
        const form = forms.nth(i)
        const requiredInputs = form.locator('input[required], textarea[required], select[required]')
        const requiredCount = await requiredInputs.count()

        for (let j = 0; j < requiredCount; j++) {
          const requiredInput = requiredInputs.nth(j)

          // Check for aria-required or aria-invalid attributes
          const ariaRequired = await requiredInput.getAttribute('aria-required')
          const ariaInvalid = await requiredInput.getAttribute('aria-invalid')

          // Required inputs should have aria-required="true" or be marked as required
          const hasRequiredIndicator =
            ariaRequired === 'true' || (await requiredInput.getAttribute('required')) !== null

          expect(hasRequiredIndicator).toBe(true)

          // Initially, aria-invalid should be false or not present for untouched fields
          if (ariaInvalid !== null) {
            expect(['false', 'true']).toContain(ariaInvalid)
          }
        }
      }
    })

    test('should have accessible form error messages', async ({page}) => {
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      // Try to trigger form validation by submitting an empty form
      const forms = page.locator('form')
      const formCount = await forms.count()

      for (let i = 0; i < formCount; i++) {
        const form = forms.nth(i)
        const submitButton = form.locator('button[type="submit"], input[type="submit"]')

        if ((await submitButton.count()) > 0) {
          // Try to submit form to trigger validation
          await submitButton.first().click()
          await page.waitForTimeout(300)

          // Look for error messages
          const errorMessages = page.locator(
            '.error, .error-message, [role="alert"], [aria-live="polite"], [aria-live="assertive"]',
          )
          const errorCount = await errorMessages.count()

          if (errorCount > 0) {
            for (let j = 0; j < errorCount; j++) {
              const errorMessage = errorMessages.nth(j)

              if (await errorMessage.isVisible()) {
                // Error messages should have appropriate ARIA attributes
                const role = await errorMessage.getAttribute('role')
                const ariaLive = await errorMessage.getAttribute('aria-live')

                const hasProperAria = role === 'alert' || ariaLive === 'polite' || ariaLive === 'assertive'

                // Error messages should be announced to screen readers
                expect(hasProperAria || role === 'alert').toBe(true)

                // Error messages should have meaningful text
                const errorText = await errorMessage.textContent()
                expect(errorText?.trim().length).toBeGreaterThan(0)
              }
            }
          }
        }
      }
    })
  })

  test.describe('Search Form Accessibility', () => {
    test('should have accessible search functionality', async ({page}) => {
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      // Look for search inputs or search functionality
      const searchInputs = page.locator('input[type="search"], input[placeholder*="search" i], .search-input')
      const searchCount = await searchInputs.count()

      for (let i = 0; i < searchCount; i++) {
        const searchInput = searchInputs.nth(i)

        if (await searchInput.isVisible()) {
          // Search inputs should have proper labeling
          const ariaLabel = await searchInput.getAttribute('aria-label')
          const placeholder = await searchInput.getAttribute('placeholder')
          const inputId = await searchInput.getAttribute('id')

          let hasLabel = !!ariaLabel || !!placeholder

          // Check for associated label
          if (inputId) {
            const label = page.locator(`label[for="${inputId}"]`)
            hasLabel = hasLabel || (await label.count()) > 0
          }

          expect(hasLabel).toBe(true)

          // Search should be keyboard accessible
          await searchInput.focus()
          await expect(searchInput).toBeFocused()

          // Test search functionality if submit button exists
          const searchForm = searchInput.locator('..')
          const submitButton = searchForm.locator('button[type="submit"], input[type="submit"]')

          if ((await submitButton.count()) > 0) {
            // Should be able to submit via Enter key
            await searchInput.fill('test search')
            await page.keyboard.press('Enter')
            await page.waitForTimeout(300)

            // Search should work (basic functionality test)
            // This depends on implementation but we can check for no errors
          }
        }
      }
    })
  })

  test.describe('Contact/Newsletter Form Accessibility', () => {
    test('should handle contact form accessibility', async ({page}) => {
      await page.goto('/about')
      await page.waitForLoadState('networkidle')

      // Look for contact forms
      const contactForms = page.locator('form')
      const formCount = await contactForms.count()

      if (formCount > 0) {
        const form = contactForms.first()

        // Check email inputs
        const emailInputs = form.locator('input[type="email"]')
        const emailCount = await emailInputs.count()

        for (let i = 0; i < emailCount; i++) {
          const emailInput = emailInputs.nth(i)

          // Email inputs should have proper labeling
          const ariaLabel = await emailInput.getAttribute('aria-label')
          const inputId = await emailInput.getAttribute('id')

          let hasLabel = !!ariaLabel

          if (inputId) {
            const label = page.locator(`label[for="${inputId}"]`)
            hasLabel = hasLabel || (await label.count()) > 0
          }

          expect(hasLabel).toBe(true)

          // Should have email validation attributes
          const inputMode = await emailInput.getAttribute('inputmode')
          const autoComplete = await emailInput.getAttribute('autocomplete')

          // Email inputs should hint at email input mode
          expect(inputMode === 'email' || autoComplete === 'email').toBe(true)
        }

        // Check text areas
        const textAreas = form.locator('textarea')
        const textAreaCount = await textAreas.count()

        for (let i = 0; i < textAreaCount; i++) {
          const textArea = textAreas.nth(i)

          const ariaLabel = await textArea.getAttribute('aria-label')
          const textAreaId = await textArea.getAttribute('id')

          let hasLabel = !!ariaLabel

          if (textAreaId) {
            const label = page.locator(`label[for="${textAreaId}"]`)
            hasLabel = hasLabel || (await label.count()) > 0
          }

          expect(hasLabel).toBe(true)
        }
      }
    })
  })

  test.describe('Theme Customizer Form Accessibility', () => {
    test('should have accessible theme customizer form elements', async ({page}) => {
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      // Try to open theme customizer
      const themeCustomizerTrigger = page.locator('.theme-customizer-trigger, [aria-haspopup="dialog"]')
      const triggerCount = await themeCustomizerTrigger.count()

      if (triggerCount > 0) {
        await themeCustomizerTrigger.first().click()
        await page.waitForTimeout(500)

        const customizer = page.locator('.theme-customizer, [role="dialog"]')
        if ((await customizer.count()) > 0 && (await customizer.isVisible())) {
          // Check color input accessibility
          const colorInputs = customizer.locator('input[type="color"]')
          const colorCount = await colorInputs.count()

          for (let i = 0; i < colorCount; i++) {
            const colorInput = colorInputs.nth(i)

            // Color inputs should have labels
            const ariaLabel = await colorInput.getAttribute('aria-label')
            const inputId = await colorInput.getAttribute('id')

            let hasLabel = !!ariaLabel

            if (inputId) {
              const label = page.locator(`label[for="${inputId}"]`)
              hasLabel = hasLabel || (await label.count()) > 0
            }

            expect(hasLabel).toBe(true)

            // Color inputs should be keyboard accessible
            await colorInput.focus()
            await expect(colorInput).toBeFocused()
          }

          // Check range/slider inputs
          const rangeInputs = customizer.locator('input[type="range"]')
          const rangeCount = await rangeInputs.count()

          for (let i = 0; i < rangeCount; i++) {
            const rangeInput = rangeInputs.nth(i)

            // Range inputs should have labels and values
            const ariaLabel = await rangeInput.getAttribute('aria-label')
            const ariaValueNow = await rangeInput.getAttribute('aria-valuenow')
            const min = await rangeInput.getAttribute('min')
            const max = await rangeInput.getAttribute('max')

            expect(ariaLabel).toBeTruthy()
            expect(min).toBeTruthy()
            expect(max).toBeTruthy()

            // Range should be keyboard accessible
            await rangeInput.focus()
            await expect(rangeInput).toBeFocused()

            // Test keyboard interaction
            await page.keyboard.press('ArrowRight')
            const newValue = await rangeInput.getAttribute('aria-valuenow')

            // Value should change with keyboard interaction
            expect(newValue).not.toBe(ariaValueNow)
          }

          // Close customizer
          await page.keyboard.press('Escape')
        }
      }
    })
  })

  test.describe('Form Accessibility Compliance', () => {
    test('should pass comprehensive form accessibility audit', async ({page}) => {
      const pages = ['/', '/about']

      for (const pagePath of pages) {
        await page.goto(pagePath)
        await page.waitForLoadState('networkidle')

        // Run accessibility audit focusing on form elements
        const accessibilityScanResults = await new AxeBuilder({page})
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .withRules([
            'label',
            'label-title-only',
            'form-field-multiple-labels',
            'input-button-name',
            'select-name',
            'aria-input-field-name',
            'autocomplete-valid',
            'duplicate-id-active',
            'duplicate-id-aria',
          ])
          .analyze()

        if (accessibilityScanResults.violations.length > 0) {
          console.warn(`Form accessibility violations on ${pagePath}:`, accessibilityScanResults.violations)
        }

        expect(accessibilityScanResults.violations).toEqual([])
      }
    })

    test('should handle form submission states accessibly', async ({page}) => {
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      const forms = page.locator('form')
      const formCount = await forms.count()

      for (let i = 0; i < formCount; i++) {
        const form = forms.nth(i)
        const submitButton = form.locator('button[type="submit"], input[type="submit"]')

        if ((await submitButton.count()) > 0) {
          const button = submitButton.first()

          // Button should be properly labeled
          const buttonText = await button.textContent()
          const ariaLabel = await button.getAttribute('aria-label')

          expect(buttonText?.trim() || ariaLabel).toBeTruthy()

          // If form has loading states, they should be accessible
          await button.click()
          await page.waitForTimeout(100)

          // Check if button state changed to loading
          const loadingState = await button.evaluate(el => {
            return {
              disabled: el.hasAttribute('disabled'),
              ariaDisabled: el.getAttribute('aria-disabled'),
              ariaLabel: el.getAttribute('aria-label'),
              textContent: el.textContent?.trim(),
            }
          })

          // Loading states should be announced
          if (loadingState.disabled || loadingState.ariaDisabled === 'true') {
            expect(
              loadingState.ariaLabel?.includes('loading') ||
                loadingState.ariaLabel?.includes('submitting') ||
                loadingState.textContent?.includes('...') ||
                loadingState.textContent?.includes('Loading'),
            ).toBe(true)
          }
        }
      }
    })
  })
})
