/**
 * @vitest-environment happy-dom
 */

import {fireEvent, render, screen} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'
import {ThemeCustomizer} from '../../src/components/ThemeCustomizer'
import {ThemeProvider} from '../../src/contexts/ThemeContext'

// Mock the theme context for testing
const MockedThemeProvider = ({children}: {children: React.ReactNode}) => <ThemeProvider>{children}</ThemeProvider>

describe('ThemeCustomizer', () => {
  it('renders with basic structure', () => {
    render(
      <MockedThemeProvider>
        <ThemeCustomizer />
      </MockedThemeProvider>,
    )

    expect(screen.getByText('Theme Customizer')).toBeInTheDocument()
    expect(screen.getByDisplayValue(/Custom/)).toBeInTheDocument()
    expect(screen.getByText('Brand Colors')).toBeInTheDocument()
    expect(screen.getByText('Background Colors')).toBeInTheDocument()
    expect(screen.getByText('Text Colors')).toBeInTheDocument()
    expect(screen.getByText('Interface Colors')).toBeInTheDocument()
    expect(screen.getByText('Status Colors')).toBeInTheDocument()
  })

  it('shows close button when onClose prop is provided', () => {
    const mockClose = vi.fn()
    render(
      <MockedThemeProvider>
        <ThemeCustomizer onClose={mockClose} />
      </MockedThemeProvider>,
    )

    const closeButton = screen.getByLabelText('Close theme customizer')
    expect(closeButton).toBeInTheDocument()

    fireEvent.click(closeButton)
    expect(mockClose).toHaveBeenCalledOnce()
  })

  it('allows theme mode selection', () => {
    render(
      <MockedThemeProvider>
        <ThemeCustomizer />
      </MockedThemeProvider>,
    )

    const lightModeRadio = screen.getByLabelText('Light')
    const darkModeRadio = screen.getByLabelText('Dark')

    expect(lightModeRadio).toBeInTheDocument()
    expect(darkModeRadio).toBeInTheDocument()

    fireEvent.click(darkModeRadio)
    expect(darkModeRadio).toBeChecked()
  })

  it('has color input fields for each color category', () => {
    render(
      <MockedThemeProvider>
        <ThemeCustomizer />
      </MockedThemeProvider>,
    )

    // Check for color inputs
    expect(screen.getByLabelText('Primary color value')).toBeInTheDocument()
    expect(screen.getByLabelText('Secondary color value')).toBeInTheDocument()
    expect(screen.getByLabelText('Accent color value')).toBeInTheDocument()
    expect(screen.getByLabelText('Background color value')).toBeInTheDocument()
    expect(screen.getByLabelText('Surface color value')).toBeInTheDocument()
    expect(screen.getByLabelText('Text color value')).toBeInTheDocument()
    expect(screen.getByLabelText('Secondary Text color value')).toBeInTheDocument()
    expect(screen.getByLabelText('Border color value')).toBeInTheDocument()
    expect(screen.getByLabelText('Error color value')).toBeInTheDocument()
    expect(screen.getByLabelText('Warning color value')).toBeInTheDocument()
    expect(screen.getByLabelText('Success color value')).toBeInTheDocument()
  })

  it('has HSL toggle buttons for color controls', () => {
    render(
      <MockedThemeProvider>
        <ThemeCustomizer />
      </MockedThemeProvider>,
    )

    const hslButtons = screen.getAllByText('HSL')
    expect(hslButtons.length).toBeGreaterThan(0)

    // Test expanding HSL controls
    const firstHslButton = hslButtons[0]
    if (firstHslButton) {
      fireEvent.click(firstHslButton)
      expect(firstHslButton).toHaveAttribute('aria-expanded', 'true')
    }
  })

  it('allows color value editing', () => {
    render(
      <MockedThemeProvider>
        <ThemeCustomizer />
      </MockedThemeProvider>,
    )

    const primaryColorInput = screen.getByLabelText('Primary color value')

    fireEvent.change(primaryColorInput, {target: {value: '#ff0000'}})
    expect(primaryColorInput).toHaveValue('#ff0000')
  })

  it('validates color input values', () => {
    render(
      <MockedThemeProvider>
        <ThemeCustomizer />
      </MockedThemeProvider>,
    )

    const primaryColorInput = screen.getByLabelText('Primary color value')

    // Test invalid color
    fireEvent.change(primaryColorInput, {target: {value: 'invalid-color'}})
    expect(
      screen.getByText('Invalid color format. Use hex (#ffffff), hsl(), rgb(), or named colors.'),
    ).toBeInTheDocument()
  })

  it('has theme name input', () => {
    render(
      <MockedThemeProvider>
        <ThemeCustomizer />
      </MockedThemeProvider>,
    )

    const nameInput = screen.getByDisplayValue(/Custom/)
    expect(nameInput).toBeInTheDocument()

    fireEvent.change(nameInput, {target: {value: 'My Custom Theme'}})
    expect(nameInput).toHaveValue('My Custom Theme')
  })

  it('has apply and reset buttons', () => {
    render(
      <MockedThemeProvider>
        <ThemeCustomizer />
      </MockedThemeProvider>,
    )

    expect(screen.getByText('Apply Theme')).toBeInTheDocument()
    expect(screen.getByText('Reset')).toBeInTheDocument()
  })

  it('calls onThemeChange when colors are modified', () => {
    const mockThemeChange = vi.fn()
    render(
      <MockedThemeProvider>
        <ThemeCustomizer onThemeChange={mockThemeChange} />
      </MockedThemeProvider>,
    )

    const primaryColorInput = screen.getByLabelText('Primary color value')
    fireEvent.change(primaryColorInput, {target: {value: '#ff0000'}})

    expect(mockThemeChange).toHaveBeenCalled()
  })

  it('shows HSL controls when toggled', () => {
    render(
      <MockedThemeProvider>
        <ThemeCustomizer />
      </MockedThemeProvider>,
    )

    const hslButton = screen.getAllByText('HSL')[0]
    if (hslButton) {
      fireEvent.click(hslButton)

      // Check for HSL sliders
      expect(screen.getByText(/Hue:/)).toBeInTheDocument()
      expect(screen.getByText(/Saturation:/)).toBeInTheDocument()
      expect(screen.getByText(/Lightness:/)).toBeInTheDocument()
    }
  })

  it('updates HSL values with sliders', () => {
    render(
      <MockedThemeProvider>
        <ThemeCustomizer />
      </MockedThemeProvider>,
    )

    const hslButton = screen.getAllByText('HSL')[0]
    if (hslButton) {
      fireEvent.click(hslButton)

      const hueSlider = screen.getByLabelText('Hue value')
      fireEvent.change(hueSlider, {target: {value: '180'}})

      expect(hueSlider).toHaveValue('180')
    }
  })

  it('applies custom class name', () => {
    const {container} = render(
      <MockedThemeProvider>
        <ThemeCustomizer className="custom-class" />
      </MockedThemeProvider>,
    )

    expect(container.firstChild).toHaveClass('theme-customizer')
    expect(container.firstChild).toHaveClass('custom-class')
  })
})
