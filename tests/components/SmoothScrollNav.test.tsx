import {fireEvent, render, screen} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import SmoothScrollNav from '../../src/components/SmoothScrollNav'

// Mock IntersectionObserver
globalThis.IntersectionObserver = vi.fn().mockImplementation(_callback => ({
  observe: vi.fn(),
  disconnect: vi.fn(),
  unobserve: vi.fn(),
}))

// Mock scrollIntoView
Element.prototype.scrollIntoView = vi.fn()

describe('SmoothScrollNav', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Create mock sections in DOM
    const sections = ['hero', 'skills', 'about', 'projects', 'blog', 'contact']
    sections.forEach(id => {
      const section = document.createElement('section')
      section.id = id
      document.body.append(section)
    })
  })

  afterEach(() => {
    // Clean up DOM
    document.body.innerHTML = ''
  })

  it('renders navigation items correctly', () => {
    render(<SmoothScrollNav />)

    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(screen.getByText('Skills')).toBeInTheDocument()
    expect(screen.getByText('About')).toBeInTheDocument()
    expect(screen.getByText('Projects')).toBeInTheDocument()
    expect(screen.getByText('Blog')).toBeInTheDocument()
    expect(screen.getByText('Contact')).toBeInTheDocument()
  })

  it('renders with progress indicator by default', () => {
    render(<SmoothScrollNav />)

    const progressBar = screen.getByRole('progressbar')
    expect(progressBar).toBeInTheDocument()
    expect(progressBar).toHaveAttribute('aria-valuenow', '0')
    expect(progressBar).toHaveAttribute('aria-valuemin', '0')
    expect(progressBar).toHaveAttribute('aria-valuemax', '100')
  })

  it('can hide progress indicator', () => {
    render(<SmoothScrollNav showProgress={false} />)

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('handles smooth scroll navigation on click', () => {
    render(<SmoothScrollNav />)

    const heroSection = document.querySelector('#hero') as HTMLElement
    const scrollIntoViewSpy = vi.spyOn(heroSection, 'scrollIntoView')

    const homeButton = screen.getByRole('button', {name: /navigate to home section/i})
    fireEvent.click(homeButton)

    expect(scrollIntoViewSpy).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
    })
  })

  it('handles keyboard navigation', () => {
    render(<SmoothScrollNav />)

    const skillsSection = document.querySelector('#skills') as HTMLElement
    const scrollIntoViewSpy = vi.spyOn(skillsSection, 'scrollIntoView')

    const skillsButton = screen.getByRole('button', {name: /navigate to skills section/i})

    // Test Enter key
    fireEvent.keyDown(skillsButton, {key: 'Enter', code: 'Enter'})
    expect(scrollIntoViewSpy).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
    })

    // Test Space key
    fireEvent.keyDown(skillsButton, {key: ' ', code: 'Space'})
    expect(scrollIntoViewSpy).toHaveBeenCalledTimes(2)
  })

  it('does not scroll for other keys', () => {
    render(<SmoothScrollNav />)

    const aboutSection = document.querySelector('#about') as HTMLElement
    const scrollIntoViewSpy = vi.spyOn(aboutSection, 'scrollIntoView')

    const aboutButton = screen.getByRole('button', {name: /navigate to about section/i})
    fireEvent.keyDown(aboutButton, {key: 'Tab', code: 'Tab'})

    expect(scrollIntoViewSpy).not.toHaveBeenCalled()
  })

  it('renders custom navigation items', () => {
    const customItems = [
      {id: 'custom1', label: 'Custom 1', icon: '🎯'},
      {id: 'custom2', label: 'Custom 2', icon: '🚀'},
    ]

    render(<SmoothScrollNav items={customItems} />)

    expect(screen.getByText('Custom 1')).toBeInTheDocument()
    expect(screen.getByText('Custom 2')).toBeInTheDocument()
    expect(screen.getByText('🎯')).toBeInTheDocument()
    expect(screen.getByText('🚀')).toBeInTheDocument()
  })

  it('has proper accessibility attributes', () => {
    render(<SmoothScrollNav />)

    const nav = screen.getByRole('navigation')
    expect(nav).toHaveAttribute('aria-label', 'Page navigation')

    const list = screen.getByRole('list')
    expect(list).toBeInTheDocument()

    const buttons = screen.getAllByRole('button')
    buttons.forEach(button => {
      expect(button).toHaveAttribute('aria-label')
      expect(button.getAttribute('aria-label')).toMatch(/Navigate to .+ section/)
    })
  })

  it('applies additional CSS classes', () => {
    render(<SmoothScrollNav className="custom-nav" />)

    const nav = screen.getByRole('navigation')
    expect(nav).toHaveClass('custom-nav')
  })

  it('sets up intersection observer for active section detection', () => {
    render(<SmoothScrollNav />)

    expect(globalThis.IntersectionObserver).toHaveBeenCalledWith(expect.any(Function), {
      threshold: [0.1, 0.5, 1],
      rootMargin: '-20% 0px -60% 0px',
    })
  })
})
