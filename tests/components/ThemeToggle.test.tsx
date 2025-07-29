import {fireEvent, render, screen} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import ThemeToggle from '../../src/components/ThemeToggle'
import {ThemeProvider} from '../../src/contexts/ThemeContext'

// Mock the useTheme hook
const mockUseTheme = {
  themeMode: 'light' as 'light' | 'dark' | 'system',
  isDarkMode: false,
  isLightMode: true,
  setThemeMode: vi.fn(),
}

vi.mock('../../src/hooks/UseTheme', () => ({
  useTheme: () => mockUseTheme,
}))

const ThemeToggleWrapper: React.FC = () => (
  <ThemeProvider>
    <ThemeToggle />
  </ThemeProvider>
)

describe('ThemeToggle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset mock state to light mode for each test
    mockUseTheme.themeMode = 'light'
    mockUseTheme.isDarkMode = false
    mockUseTheme.isLightMode = true
  })

  it('renders theme toggle button', () => {
    render(<ThemeToggleWrapper />)
    const button = screen.getByRole('button')
    expect(button).toBeInTheDocument()
  })

  it('displays current theme mode', () => {
    render(<ThemeToggleWrapper />)
    expect(screen.getByText('Light')).toBeInTheDocument()
  })

  it('has proper aria label for accessibility', () => {
    render(<ThemeToggleWrapper />)
    const button = screen.getByRole('button')
    expect(button).toHaveAttribute('aria-label', 'Switch to dark mode')
  })

  it('has proper aria describedby for screen readers', () => {
    render(<ThemeToggleWrapper />)
    const button = screen.getByRole('button')
    expect(button).toHaveAttribute('aria-describedby', 'theme-toggle-description')
  })

  it('includes screen reader description', () => {
    render(<ThemeToggleWrapper />)
    expect(screen.getByText('Current theme: Light mode')).toBeInTheDocument()
  })

  it('displays sun icon for light mode', () => {
    render(<ThemeToggleWrapper />)
    expect(screen.getByText('☀️')).toBeInTheDocument()
  })

  it('calls setThemeMode when clicked', () => {
    render(<ThemeToggleWrapper />)
    const button = screen.getByRole('button')
    fireEvent.click(button)
    expect(mockUseTheme.setThemeMode).toHaveBeenCalledWith('dark')
  })

  it('cycles to dark mode when in light mode', () => {
    render(<ThemeToggleWrapper />)
    const button = screen.getByRole('button')
    fireEvent.click(button)
    expect(mockUseTheme.setThemeMode).toHaveBeenCalledWith('dark')
  })

  it('handles Enter key press for accessibility', () => {
    render(<ThemeToggleWrapper />)
    const button = screen.getByRole('button')
    fireEvent.keyDown(button, {key: 'Enter'})
    expect(mockUseTheme.setThemeMode).toHaveBeenCalledWith('dark')
  })

  it('handles Space key press for accessibility', () => {
    render(<ThemeToggleWrapper />)
    const button = screen.getByRole('button')
    fireEvent.keyDown(button, {key: ' '})
    expect(mockUseTheme.setThemeMode).toHaveBeenCalledWith('dark')
  })

  it('ignores other key presses', () => {
    render(<ThemeToggleWrapper />)
    const button = screen.getByRole('button')
    fireEvent.keyDown(button, {key: 'Escape'})
    expect(mockUseTheme.setThemeMode).not.toHaveBeenCalled()
  })

  describe('theme mode cycling', () => {
    it('switches from dark to system mode', () => {
      mockUseTheme.themeMode = 'dark'
      mockUseTheme.isDarkMode = true
      mockUseTheme.isLightMode = false

      render(<ThemeToggleWrapper />)
      const button = screen.getByRole('button')
      fireEvent.click(button)
      expect(mockUseTheme.setThemeMode).toHaveBeenCalledWith('system')
    })

    it('switches from system to light mode', () => {
      mockUseTheme.themeMode = 'system'
      mockUseTheme.isDarkMode = false
      mockUseTheme.isLightMode = false

      render(<ThemeToggleWrapper />)
      const button = screen.getByRole('button')
      fireEvent.click(button)
      expect(mockUseTheme.setThemeMode).toHaveBeenCalledWith('light')
    })

    it('displays correct icon for dark mode', () => {
      mockUseTheme.themeMode = 'dark'
      mockUseTheme.isDarkMode = true
      mockUseTheme.isLightMode = false

      render(<ThemeToggleWrapper />)
      expect(screen.getByText('🌙')).toBeInTheDocument()
    })

    it('displays correct icon for system mode', () => {
      mockUseTheme.themeMode = 'system'
      mockUseTheme.isDarkMode = false
      mockUseTheme.isLightMode = false

      render(<ThemeToggleWrapper />)
      expect(screen.getByText('🖥️')).toBeInTheDocument()
    })
  })

  describe('accessibility', () => {
    it('has proper tabindex for keyboard navigation', () => {
      render(<ThemeToggleWrapper />)
      const button = screen.getByRole('button')
      expect(button).toHaveAttribute('tabindex', '0')
    })

    it('has aria-live region for screen reader updates', () => {
      render(<ThemeToggleWrapper />)
      const description = screen.getByText('Current theme: Light mode')
      expect(description).toHaveAttribute('aria-live', 'polite')
    })

    it('hides decorative icon from screen readers', () => {
      render(<ThemeToggleWrapper />)
      const icon = screen.getByText('☀️')
      expect(icon).toHaveAttribute('aria-hidden', 'true')
    })
  })
})
