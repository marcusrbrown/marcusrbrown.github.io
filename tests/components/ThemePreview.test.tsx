import type {Theme} from '../../src/types'
import {render, screen} from '@testing-library/react'

import {describe, expect, it} from 'vitest'
import ThemePreview from '../../src/components/ThemePreview'

// Mock theme for testing
const mockTheme: Theme = {
  id: 'test-theme',
  name: 'Test Theme',
  mode: 'light',
  isBuiltIn: false,
  colors: {
    primary: '#007bff',
    secondary: '#6c757d',
    accent: '#28a745',
    background: '#ffffff',
    surface: '#f8f9fa',
    text: '#212529',
    textSecondary: '#6c757d',
    border: '#dee2e6',
    error: '#dc3545',
    warning: '#ffc107',
    success: '#28a745',
  },
}

describe('ThemePreview', () => {
  it('renders with basic structure', () => {
    render(<ThemePreview theme={mockTheme} />)

    // Check for main structural elements
    expect(screen.getByText('mrbro.dev')).toBeInTheDocument()
    expect(screen.getByText('Welcome to My Portfolio')).toBeInTheDocument()
    expect(screen.getByText('Buttons & Links')).toBeInTheDocument()
    expect(screen.getByText('Project Card')).toBeInTheDocument()
    expect(screen.getByText('Status Messages')).toBeInTheDocument()
    expect(screen.getByText('Code Block')).toBeInTheDocument()
  })

  it('displays navigation links', () => {
    render(<ThemePreview theme={mockTheme} />)

    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(screen.getByText('Blog')).toBeInTheDocument()
    expect(screen.getByText('Projects')).toBeInTheDocument()
    expect(screen.getByText('About')).toBeInTheDocument()
  })

  it('shows button examples', () => {
    render(<ThemePreview theme={mockTheme} />)

    expect(screen.getByText('Primary Action')).toBeInTheDocument()
    expect(screen.getByText('Secondary Action')).toBeInTheDocument()
    expect(screen.getByText('Sample Link')).toBeInTheDocument()
  })

  it('displays project card example', () => {
    render(<ThemePreview theme={mockTheme} />)

    expect(screen.getByText('Sample Project')).toBeInTheDocument()
    expect(screen.getByText('This is how project cards will appear with your custom theme colors.')).toBeInTheDocument()
    expect(screen.getByText('View Project')).toBeInTheDocument()
  })

  it('shows status message examples', () => {
    render(<ThemePreview theme={mockTheme} />)

    expect(screen.getByText('✓ Success: Theme saved successfully!')).toBeInTheDocument()
    expect(screen.getByText('⚠ Warning: Consider color contrast ratios')).toBeInTheDocument()
    expect(screen.getByText('✗ Error: Invalid color format')).toBeInTheDocument()
  })

  it('displays code block example', () => {
    render(<ThemePreview theme={mockTheme} />)

    expect(screen.getByText('const')).toBeInTheDocument()
    expect(screen.getByText('theme')).toBeInTheDocument()
    expect(screen.getByText('=')).toBeInTheDocument()
    expect(screen.getByText('"Test Theme"')).toBeInTheDocument()
  })

  it('applies CSS custom properties from theme colors', () => {
    const {container} = render(<ThemePreview theme={mockTheme} />)
    const previewElement = container.querySelector('.theme-preview')

    expect(previewElement).toHaveStyle({
      '--color-primary': '#007bff',
      '--color-background': '#ffffff',
      '--color-text': '#212529',
      '--color-surface': '#f8f9fa',
    })
  })

  it('applies custom className', () => {
    const {container} = render(<ThemePreview theme={mockTheme} className="custom-preview" />)
    const previewElement = container.querySelector('.theme-preview')

    expect(previewElement).toHaveClass('custom-preview')
  })

  it('updates when theme changes', () => {
    const {container, rerender} = render(<ThemePreview theme={mockTheme} />)

    const updatedTheme: Theme = {
      ...mockTheme,
      name: 'Updated Theme',
      colors: {
        ...mockTheme.colors,
        primary: '#ff0000',
        background: '#000000',
      },
    }

    rerender(<ThemePreview theme={updatedTheme} />)

    const previewElement = container.querySelector('.theme-preview')
    expect(previewElement).toHaveStyle({
      '--color-primary': '#ff0000',
      '--color-background': '#000000',
    })

    // Check that the code block shows the updated theme name
    expect(screen.getByText('"Updated Theme"')).toBeInTheDocument()
  })

  it('generates derived colors correctly', () => {
    const {container} = render(<ThemePreview theme={mockTheme} />)
    const previewElement = container.querySelector('.theme-preview')

    // Check derived colors
    expect(previewElement).toHaveStyle({
      '--color-link': '#007bff', // Same as primary
      '--color-link-hover': '#28a745', // Same as accent
      '--color-header-bg': '#f8f9fa', // Same as surface
    })
  })

  it('handles dark theme mode', () => {
    const darkTheme: Theme = {
      ...mockTheme,
      mode: 'dark',
      colors: {
        ...mockTheme.colors,
        background: '#1a1a1a',
        text: '#ffffff',
        surface: '#2d2d2d',
      },
    }

    const {container} = render(<ThemePreview theme={darkTheme} />)
    const previewElement = container.querySelector('.theme-preview')

    expect(previewElement).toHaveStyle({
      '--color-background': '#1a1a1a',
      '--color-text': '#ffffff',
      '--color-surface': '#2d2d2d',
    })
  })
})
