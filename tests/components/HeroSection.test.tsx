/**
 * @vitest-environment happy-dom
 */

import {act, fireEvent, render, screen} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import HeroSection from '../../src/components/HeroSection'

// Mock UseScrollAnimation so we can control animation state
const mockUseScrollAnimation = vi.fn()

vi.mock('../../src/hooks/UseScrollAnimation', () => ({
  useScrollAnimation: (opts: unknown) => mockUseScrollAnimation(opts),
  getAnimationClasses: (state: string, _base?: string) => `animate animate--${state}`,
  getStaggerDelay: (index: number, base = 0, increment = 100) => base + index * increment,
}))

const makeAnimRef = () => ({current: null})

const idleReturn = () => ({
  ref: makeAnimRef(),
  animationState: 'idle' as const,
  isInView: false,
  triggerAnimation: vi.fn(),
  resetAnimation: vi.fn(),
})

const visibleReturn = () => ({
  ref: makeAnimRef(),
  animationState: 'visible' as const,
  isInView: true,
  triggerAnimation: vi.fn(),
  resetAnimation: vi.fn(),
})

describe('HeroSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    // Default: all animations idle
    mockUseScrollAnimation.mockReturnValue(idleReturn())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('default rendering', () => {
    it('should expose the hero as a labeled region, not a banner', () => {
      render(<HeroSection />)
      const section = screen.getByRole('region', {name: 'Introduction and main call-to-action'})
      expect(section).toBeInTheDocument()
      expect(section).toHaveAttribute('id', 'hero')
      expect(screen.queryByRole('banner')).not.toBeInTheDocument()
    })

    it('should render the default title', () => {
      render(<HeroSection />)
      expect(screen.getByText("Hello, I'm")).toBeInTheDocument()
      expect(screen.getByText('Marcus R. Brown')).toBeInTheDocument()
    })

    it('should render the default subtitle', () => {
      render(<HeroSection />)
      expect(screen.getByText(/Full-stack developer crafting exceptional/)).toBeInTheDocument()
    })

    it('should render the primary CTA button', () => {
      render(<HeroSection />)
      const primary = screen.getByRole('link', {name: /View My Work/})
      expect(primary).toHaveAttribute('href', '#projects')
    })

    it('should render the secondary CTA button', () => {
      render(<HeroSection />)
      const secondary = screen.getByRole('link', {name: /Get In Touch/})
      expect(secondary).toHaveAttribute('href', 'mailto:hello@mrbro.dev')
    })

    it('should render in loading state initially', () => {
      render(<HeroSection />)
      const content = document.querySelector('.hero-content')
      expect(content).toHaveClass('loading')
    })

    it('should transition to loaded state after 100ms', () => {
      render(<HeroSection />)
      act(() => {
        vi.advanceTimersByTime(110)
      })
      const content = document.querySelector('.hero-content')
      expect(content).toHaveClass('loaded')
    })
  })

  describe('custom props', () => {
    it('should render custom title', () => {
      render(<HeroSection title="Jane Doe" />)
      expect(screen.getByText('Jane Doe')).toBeInTheDocument()
    })

    it('should render custom subtitle', () => {
      render(<HeroSection subtitle="Custom subtitle text" />)
      expect(screen.getByText('Custom subtitle text')).toBeInTheDocument()
    })

    it('should render custom primary CTA', () => {
      render(<HeroSection primaryCTA="See Portfolio" primaryHref="#portfolio" />)
      const btn = screen.getByRole('link', {name: /See Portfolio/})
      expect(btn).toHaveAttribute('href', '#portfolio')
    })

    it('should render custom secondary CTA', () => {
      render(<HeroSection secondaryCTA="Say Hello" secondaryHref="#hello" />)
      const btn = screen.getByRole('link', {name: /Say Hello/})
      expect(btn).toHaveAttribute('href', '#hello')
    })

    it('should apply custom className to section', () => {
      render(<HeroSection className="custom-hero" />)
      const section = screen.getByRole('region', {name: 'Introduction and main call-to-action'})
      expect(section).toHaveClass('custom-hero')
    })
  })

  describe('scroll animations', () => {
    it('should apply animation classes to title', () => {
      mockUseScrollAnimation.mockReturnValueOnce({...visibleReturn()}).mockReturnValue(idleReturn())
      render(<HeroSection />)
      const title = screen.getByRole('heading', {level: 1})
      expect(title).toHaveClass('animate--visible')
    })

    it('should apply idle animation class when not in view', () => {
      mockUseScrollAnimation.mockReturnValue(idleReturn())
      render(<HeroSection />)
      const title = screen.getByRole('heading', {level: 1})
      expect(title).toHaveClass('animate--idle')
    })
  })

  describe('smooth scroll behaviour', () => {
    it('should call scrollIntoView when clicking a hash link', () => {
      render(<HeroSection primaryHref="#projects" />)

      const projectsSection = document.createElement('div')
      projectsSection.id = 'projects'
      projectsSection.tabIndex = -1
      const mockScrollIntoView = vi.fn()
      projectsSection.scrollIntoView = mockScrollIntoView
      document.body.append(projectsSection)

      const link = screen.getByRole('link', {name: /View My Work/})
      fireEvent.click(link)

      expect(mockScrollIntoView).toHaveBeenCalledWith({behavior: 'smooth', block: 'start'})
      projectsSection.remove()
    })

    it('should not call scrollIntoView when target element does not exist', () => {
      render(<HeroSection primaryHref="#nonexistent" />)
      const link = screen.getByRole('link', {name: /View My Work/})
      // Should not throw
      expect(() => fireEvent.click(link)).not.toThrow()
    })
  })

  describe('keyboard navigation', () => {
    it('should trigger smooth scroll on Enter key', () => {
      render(<HeroSection primaryHref="#projects" />)

      const projectsSection = document.createElement('div')
      projectsSection.id = 'projects'
      projectsSection.tabIndex = -1
      const mockScrollIntoView = vi.fn()
      projectsSection.scrollIntoView = mockScrollIntoView
      document.body.append(projectsSection)

      const link = screen.getByRole('link', {name: /View My Work/})
      fireEvent.keyDown(link, {key: 'Enter'})

      expect(mockScrollIntoView).toHaveBeenCalled()
      projectsSection.remove()
    })

    it('should trigger smooth scroll on Space key', () => {
      render(<HeroSection secondaryHref="#contact" />)

      const contactSection = document.createElement('div')
      contactSection.id = 'contact'
      contactSection.tabIndex = -1
      const mockScrollIntoView = vi.fn()
      contactSection.scrollIntoView = mockScrollIntoView
      document.body.append(contactSection)

      const link = screen.getByRole('link', {name: /Get In Touch/})
      fireEvent.keyDown(link, {key: ' '})

      expect(mockScrollIntoView).toHaveBeenCalled()
      contactSection.remove()
    })

    it('should not trigger action on other keys', () => {
      render(<HeroSection primaryHref="#projects" />)
      const link = screen.getByRole('link', {name: /View My Work/})
      // Should not throw
      expect(() => fireEvent.keyDown(link, {key: 'Tab'})).not.toThrow()
    })

    it('should preventDefault and smooth-scroll on Enter for the hash primary CTA', () => {
      render(<HeroSection primaryHref="#projects" />)
      const link = screen.getByRole('link', {name: /View My Work/})

      // fireEvent.keyDown returns false when preventDefault() was called on the event
      const notPrevented = fireEvent.keyDown(link, {key: 'Enter'})
      expect(notPrevented).toBe(false)
    })

    it('should NOT preventDefault on Enter for the default (mailto) secondary CTA, allowing native activation', () => {
      render(<HeroSection />)
      const link = screen.getByRole('link', {name: /Get In Touch/})
      expect(link).toHaveAttribute('href', 'mailto:hello@mrbro.dev')

      // fireEvent.keyDown returns true when preventDefault() was NOT called on the event
      const notPrevented = fireEvent.keyDown(link, {key: 'Enter'})
      expect(notPrevented).toBe(true)
    })
  })

  describe('accessibility', () => {
    it('should have sr-only description for primary CTA', () => {
      render(<HeroSection />)
      const desc = document.querySelector('#primary-cta-description')
      expect(desc).toBeInTheDocument()
      expect(desc).toHaveClass('sr-only')
    })

    it('should have sr-only description for secondary CTA', () => {
      render(<HeroSection />)
      const desc = document.querySelector('#secondary-cta-description')
      expect(desc).toBeInTheDocument()
    })

    it('should describe the secondary CTA as an email action, matching the mailto href', () => {
      render(<HeroSection />)
      const link = screen.getByRole('link', {name: /Get In Touch/})
      const describedById = link.getAttribute('aria-describedby')
      expect(describedById).toBeTruthy()

      const desc = document.querySelector(`#${describedById}`)
      expect(desc).toBeInTheDocument()
      expect(desc).toHaveTextContent(/email/i)
      expect(desc).not.toHaveTextContent(/contact section/i)
    })

    it('should have aria-hidden background element', () => {
      render(<HeroSection />)
      const bg = document.querySelector('.hero-background')
      expect(bg).toHaveAttribute('aria-hidden', 'true')
    })

    it('should have scroll indicator with presentation role', () => {
      render(<HeroSection />)
      const indicator = screen.getByRole('presentation', {hidden: true})
      expect(indicator).toHaveClass('hero-scroll-indicator')
    })
  })
})
