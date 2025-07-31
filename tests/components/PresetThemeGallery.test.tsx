/**
 * @vitest-environment happy-dom
 */

import {fireEvent, render, screen} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import PresetThemeGallery from '../../src/components/PresetThemeGallery'
import {useTheme} from '../../src/hooks/UseTheme'

// Mock the useTheme hook
vi.mock('../../src/hooks/UseTheme')

// Mock the preset themes to avoid importing the full collection
vi.mock('../../src/utils/preset-themes', () => ({
  getPresetThemes: () => [
    {
      id: 'test-light',
      name: 'Test Light',
      description: 'A test light theme',
      mode: 'light',
      isBuiltIn: true,
      colors: {
        primary: '#007acc',
        secondary: '#666666',
        accent: '#ff6347',
        background: '#ffffff',
        surface: '#f5f5f5',
        text: '#333333',
        textSecondary: '#666666',
        border: '#e0e0e0',
        error: '#d32f2f',
        warning: '#ff9800',
        success: '#4caf50',
      },
    },
    {
      id: 'test-dark',
      name: 'Test Dark',
      description: 'A test dark theme',
      mode: 'dark',
      isBuiltIn: true,
      colors: {
        primary: '#61dafb',
        secondary: '#999999',
        accent: '#ff6b6b',
        background: '#1a1a1a',
        surface: '#2d2d2d',
        text: '#ffffff',
        textSecondary: '#cccccc',
        border: '#444444',
        error: '#f44336',
        warning: '#ff9800',
        success: '#4caf50',
      },
    },
  ],
  getPresetThemesByMode: (mode: 'light' | 'dark') =>
    mode === 'light'
      ? [
          {
            id: 'test-light',
            name: 'Test Light',
            mode: 'light',
            colors: {
              primary: '#007acc',
              secondary: '#666666',
              accent: '#ff6347',
              background: '#ffffff',
              surface: '#f5f5f5',
              text: '#333333',
              textSecondary: '#666666',
              border: '#e0e0e0',
              error: '#d32f2f',
              warning: '#ff9800',
              success: '#4caf50',
            },
          },
        ]
      : [
          {
            id: 'test-dark',
            name: 'Test Dark',
            mode: 'dark',
            colors: {
              primary: '#61dafb',
              secondary: '#999999',
              accent: '#ff6b6b',
              background: '#1a1a1a',
              surface: '#2d2d2d',
              text: '#ffffff',
              textSecondary: '#cccccc',
              border: '#444444',
              error: '#f44336',
              warning: '#ff9800',
              success: '#4caf50',
            },
          },
        ],
  searchPresetThemes: (query: string) =>
    query.toLowerCase().includes('light')
      ? [
          {
            id: 'test-light',
            name: 'Test Light',
            mode: 'light',
            colors: {
              primary: '#007acc',
              secondary: '#666666',
              accent: '#ff6347',
              background: '#ffffff',
              surface: '#f5f5f5',
              text: '#333333',
              textSecondary: '#666666',
              border: '#e0e0e0',
              error: '#d32f2f',
              warning: '#ff9800',
              success: '#4caf50',
            },
          },
        ]
      : [],
}))

const mockCurrentTheme = {
  id: 'default-light',
  name: 'Default Light',
  mode: 'light' as const,
  colors: {
    primary: '#007acc',
    secondary: '#666666',
    accent: '#ff6347',
    background: '#ffffff',
    surface: '#f5f5f5',
    text: '#333333',
    textSecondary: '#666666',
    border: '#e0e0e0',
    error: '#d32f2f',
    warning: '#ff9800',
    success: '#4caf50',
  },
}

const mockSetCustomTheme = vi.fn()

describe('PresetThemeGallery', () => {
  beforeEach(() => {
    vi.mocked(useTheme).mockReturnValue({
      currentTheme: mockCurrentTheme,
      themeMode: 'light',
      availableThemes: [mockCurrentTheme],
      systemPreference: 'light',
      isDarkMode: false,
      isLightMode: true,
      isSystemMode: false,
      isSystemDark: false,
      isSystemLight: true,
      setThemeMode: vi.fn(),
      setCustomTheme: mockSetCustomTheme,
      toggleTheme: vi.fn(),
      switchToLight: vi.fn(),
      switchToDark: vi.fn(),
      switchToSystem: vi.fn(),
      getEffectiveThemeMode: () => 'light',
      isCustomTheme: false,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders preset theme gallery with header', () => {
    render(<PresetThemeGallery />)

    expect(screen.getByText('Preset Theme Gallery')).toBeInTheDocument()
    expect(screen.getByText('Choose from a curated collection of popular color schemes')).toBeInTheDocument()
  })

  it('displays preset theme cards', () => {
    render(<PresetThemeGallery />)

    expect(screen.getByText('Test Light')).toBeInTheDocument()
    expect(screen.getByText('Test Dark')).toBeInTheDocument()
    expect(screen.getByText('A test light theme')).toBeInTheDocument()
    expect(screen.getByText('A test dark theme')).toBeInTheDocument()
  })

  it('renders search input and mode filter', () => {
    render(<PresetThemeGallery />)

    expect(screen.getByPlaceholderText('Search themes...')).toBeInTheDocument()
    expect(screen.getByLabelText('Mode:')).toBeInTheDocument()
    expect(screen.getByDisplayValue('All Themes')).toBeInTheDocument()
  })

  it('filters themes by search query', async () => {
    render(<PresetThemeGallery />)

    const searchInput = screen.getByPlaceholderText('Search themes...')
    fireEvent.change(searchInput, {target: {value: 'light'}})

    // Test Light should still be visible, Test Dark should be filtered out
    expect(screen.getByText('Test Light')).toBeInTheDocument()
    expect(screen.queryByText('Test Dark')).not.toBeInTheDocument()
  })

  it('filters themes by mode', () => {
    render(<PresetThemeGallery />)

    const modeFilter = screen.getByLabelText('Mode:')
    fireEvent.change(modeFilter, {target: {value: 'light'}})

    // Only light themes should be visible
    expect(screen.getByText('Test Light')).toBeInTheDocument()
    expect(screen.queryByText('Test Dark')).not.toBeInTheDocument()
  })

  it('applies theme when card is clicked', () => {
    render(<PresetThemeGallery />)

    const themeCard = screen.getByText('Test Light').closest('.preset-theme-card')
    expect(themeCard).toBeInTheDocument()

    if (themeCard) {
      fireEvent.click(themeCard)
    }

    expect(mockSetCustomTheme).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'test-light',
        name: 'Test Light',
        mode: 'light',
      }),
    )
  })

  it('calls onThemeApply callback when provided', () => {
    const mockOnThemeApply = vi.fn()
    render(<PresetThemeGallery onThemeApply={mockOnThemeApply} />)

    const themeCard = screen.getByText('Test Light').closest('.preset-theme-card')
    if (themeCard) {
      fireEvent.click(themeCard)
    }

    expect(mockOnThemeApply).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'test-light',
        name: 'Test Light',
        mode: 'light',
      }),
    )
  })

  it('shows no themes message when no themes match filter', () => {
    render(<PresetThemeGallery />)

    const searchInput = screen.getByPlaceholderText('Search themes...')
    fireEvent.change(searchInput, {target: {value: 'nonexistent'}})

    expect(screen.getByText('No themes found matching your criteria.')).toBeInTheDocument()
    expect(screen.getByText('Clear search')).toBeInTheDocument()
  })

  it('clears search when clear button is clicked', () => {
    render(<PresetThemeGallery />)

    const searchInput = screen.getByPlaceholderText('Search themes...')
    fireEvent.change(searchInput, {target: {value: 'nonexistent'}})

    const clearButton = screen.getByText('Clear search')
    fireEvent.click(clearButton)

    expect(searchInput).toHaveValue('')
    expect(screen.getByText('Test Light')).toBeInTheDocument()
    expect(screen.getByText('Test Dark')).toBeInTheDocument()
  })

  it('handles keyboard navigation on theme cards', () => {
    render(<PresetThemeGallery />)

    const themeCard = screen.getByText('Test Light').closest('.preset-theme-card')
    expect(themeCard).toBeInTheDocument()

    if (themeCard) {
      fireEvent.keyDown(themeCard, {key: 'Enter'})
      expect(mockSetCustomTheme).toHaveBeenCalledTimes(1)

      vi.clearAllMocks()

      fireEvent.keyDown(themeCard, {key: ' '})
      expect(mockSetCustomTheme).toHaveBeenCalledTimes(1)
    }
  })
})
