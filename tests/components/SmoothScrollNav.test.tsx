import {render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import SmoothScrollNav from '../../src/components/SmoothScrollNav'
import {trackUmamiEvent} from '../../src/utils/analytics'

vi.mock('../../src/utils/analytics', async importOriginal => {
  const actual = await importOriginal<typeof import('../../src/utils/analytics')>()
  return {
    ...actual,
    trackUmamiEvent: vi.fn(),
  }
})

// Mock IntersectionObserver
// eslint-disable-next-line prefer-arrow-callback
globalThis.IntersectionObserver = vi.fn(function (_callback, _options) {
  return {
    observe: vi.fn(),
    disconnect: vi.fn(),
    unobserve: vi.fn(),
  }
}) as unknown as typeof IntersectionObserver

// Mock scrollIntoView
Element.prototype.scrollIntoView = vi.fn()

describe('SmoothScrollNav', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Create mock sections in DOM
    const sections = ['hero', 'about', 'projects', 'blog']
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
    expect(screen.getByText('About')).toBeInTheDocument()
    expect(screen.getByText('Projects')).toBeInTheDocument()
    expect(screen.getByText('Blog')).toBeInTheDocument()
    expect(screen.queryByText('Skills')).not.toBeInTheDocument()
    expect(screen.queryByText('Contact')).not.toBeInTheDocument()
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

  describe('scroll navigation', () => {
    it('scrolls to the target section on pointer click', async () => {
      const user = userEvent.setup()
      render(<SmoothScrollNav />)

      const heroSection = document.querySelector('#hero') as HTMLElement
      const scrollIntoViewSpy = vi.spyOn(heroSection, 'scrollIntoView')

      const homeButton = screen.getByRole('button', {name: /navigate to home section/i})
      await user.click(homeButton)

      expect(trackUmamiEvent).toHaveBeenCalledTimes(1)
      expect(trackUmamiEvent).toHaveBeenCalledWith('navigation', {
        destination: 'hero',
        method: 'smooth_scroll',
      })
      expect(scrollIntoViewSpy).toHaveBeenCalledTimes(1)
      expect(scrollIntoViewSpy).toHaveBeenCalledWith({
        behavior: 'smooth',
        block: 'start',
      })
    })

    it('scrolls to the target section on Enter key when focused', async () => {
      const user = userEvent.setup()
      render(<SmoothScrollNav />)

      const aboutSection = document.querySelector('#about') as HTMLElement
      const scrollIntoViewSpy = vi.spyOn(aboutSection, 'scrollIntoView')
      const aboutButton = screen.getByRole('button', {name: /navigate to about section/i})

      aboutButton.focus()
      await user.keyboard('{Enter}')

      expect(trackUmamiEvent).toHaveBeenCalledTimes(1)
      expect(trackUmamiEvent).toHaveBeenCalledWith('navigation', {
        destination: 'about',
        method: 'smooth_scroll',
      })
      expect(scrollIntoViewSpy).toHaveBeenCalledTimes(1)
      expect(scrollIntoViewSpy).toHaveBeenCalledWith({
        behavior: 'smooth',
        block: 'start',
      })
    })

    it('scrolls to the target section on Space key when focused', async () => {
      const user = userEvent.setup()
      render(<SmoothScrollNav />)

      const projectsSection = document.querySelector('#projects') as HTMLElement
      const scrollIntoViewSpy = vi.spyOn(projectsSection, 'scrollIntoView')
      const projectsButton = screen.getByRole('button', {name: /navigate to projects section/i})

      projectsButton.focus()
      await user.keyboard(' ')

      expect(trackUmamiEvent).toHaveBeenCalledTimes(1)
      expect(trackUmamiEvent).toHaveBeenCalledWith('navigation', {
        destination: 'projects',
        method: 'smooth_scroll',
      })
      expect(scrollIntoViewSpy).toHaveBeenCalledTimes(1)
      expect(scrollIntoViewSpy).toHaveBeenCalledWith({
        behavior: 'smooth',
        block: 'start',
      })
    })

    it('does not track or scroll when target section is absent', async () => {
      const user = userEvent.setup()
      render(<SmoothScrollNav items={[{id: 'nonexistent', label: 'Missing'}]} />)

      const missingButton = screen.getByRole('button', {name: /navigate to missing section/i})
      await user.click(missingButton)

      expect(trackUmamiEvent).not.toHaveBeenCalled()
      expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled()
    })
  })
})
