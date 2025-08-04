import {render, screen} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import AboutSection from '../../src/components/AboutSection'

// Mock the UseScrollAnimation hook
vi.mock('../../src/hooks/UseScrollAnimation', () => ({
  useScrollAnimation: vi.fn(() => ({
    ref: {current: null},
    animationState: 'idle',
    isInView: false,
    triggerAnimation: vi.fn(),
    resetAnimation: vi.fn(),
  })),
}))

// Mock the sub-components
vi.mock('../../src/components/AnimatedCounters', () => ({
  default: () => <div data-testid="animated-counters">Animated Counters</div>,
}))

vi.mock('../../src/components/CareerTimeline', () => ({
  default: () => <div data-testid="career-timeline">Career Timeline</div>,
}))

describe('AboutSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Rendering', () => {
    it('should render the about section with proper structure', () => {
      render(<AboutSection />)

      expect(screen.getByLabelText('About Me')).toBeInTheDocument()
      expect(screen.getByRole('heading', {name: 'About Me'})).toBeInTheDocument()
      expect(screen.getByText(/Passionate full-stack developer/)).toBeInTheDocument()
    })

    it('should render section header with title and subtitle', () => {
      render(<AboutSection />)

      expect(screen.getByRole('heading', {name: 'About Me'})).toBeInTheDocument()
      expect(screen.getByText(/focus on creating exceptional digital experiences/)).toBeInTheDocument()
    })

    it('should render professional story content', () => {
      render(<AboutSection />)

      expect(screen.getByText(/dedicated software engineer with over a decade/)).toBeInTheDocument()
      expect(screen.getByText(/specialized in modern web technologies/)).toBeInTheDocument()
      expect(screen.getByText(/contributing to open-source projects/)).toBeInTheDocument()
    })

    it('should render animated counters component', () => {
      render(<AboutSection />)

      expect(screen.getByTestId('animated-counters')).toBeInTheDocument()
    })

    it('should render career timeline component', () => {
      render(<AboutSection />)

      expect(screen.getByTestId('career-timeline')).toBeInTheDocument()
      expect(screen.getByRole('heading', {name: 'Professional Journey'})).toBeInTheDocument()
    })

    it('should render call-to-action section', () => {
      render(<AboutSection />)

      expect(screen.getByText(/Interested in working together/)).toBeInTheDocument()
      expect(screen.getByRole('link', {name: 'Get in touch for collaboration opportunities'})).toBeInTheDocument()
      expect(screen.getByRole('link', {name: 'Download professional resume'})).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('should have proper semantic structure', () => {
      render(<AboutSection />)

      const section = screen.getByRole('region', {name: 'About Me'})
      expect(section).toHaveAttribute('id', 'about')
      expect(section).toHaveAttribute('aria-labelledby', 'about-heading')
    })

    it('should have proper heading hierarchy', () => {
      render(<AboutSection />)

      const mainHeading = screen.getByRole('heading', {level: 2, name: 'About Me'})
      expect(mainHeading).toHaveAttribute('id', 'about-heading')

      const timelineHeading = screen.getByRole('heading', {level: 3, name: 'Professional Journey'})
      expect(timelineHeading).toBeInTheDocument()
    })

    it('should have accessible CTA links', () => {
      render(<AboutSection />)

      const connectLink = screen.getByRole('link', {name: 'Get in touch for collaboration opportunities'})
      expect(connectLink).toHaveAttribute('href', '#contact')
      expect(connectLink).toHaveAttribute('aria-label', 'Get in touch for collaboration opportunities')

      const resumeLink = screen.getByRole('link', {name: 'Download professional resume'})
      expect(resumeLink).toHaveAttribute('href', '/resume')
      expect(resumeLink).toHaveAttribute('aria-label', 'Download professional resume')
      expect(resumeLink).toHaveAttribute('target', '_blank')
      expect(resumeLink).toHaveAttribute('rel', 'noopener noreferrer')
    })

    it('should hide decorative elements from screen readers', () => {
      render(<AboutSection />)

      const decorativeElements = screen.getByRole('region', {name: 'About Me'}).querySelector('.about-bg-elements')
      expect(decorativeElements).toHaveAttribute('aria-hidden', 'true')
    })
  })

  describe('Animation Integration', () => {
    it('should use scroll animation hooks for different sections', async () => {
      const {useScrollAnimation} = await import('../../src/hooks/UseScrollAnimation')

      render(<AboutSection />)

      // Should call useScrollAnimation multiple times for different sections
      expect(useScrollAnimation).toHaveBeenCalledTimes(4)

      // Check specific animation configurations - updated to match new implementation
      expect(useScrollAnimation).toHaveBeenCalledWith({
        threshold: 0.1,
        rootMargin: '100px 0px',
        triggerOnce: true,
      })
    })

    it('should apply inline styles based on animation state', async () => {
      const {useScrollAnimation} = await import('../../src/hooks/UseScrollAnimation')

      // Mock animation state as visible
      vi.mocked(useScrollAnimation).mockReturnValue({
        ref: {current: null},
        animationState: 'visible',
        isInView: true,
        triggerAnimation: vi.fn(),
        resetAnimation: vi.fn(),
      })

      render(<AboutSection />)

      // Check that inline styles are applied for visible state
      const header = screen.getByRole('region', {name: 'About Me'}).querySelector('.section-header')
      expect(header).toHaveStyle('opacity: 1')
      expect(header).toHaveStyle('transform: translateY(0)')
    })

    it('should apply hidden styles when not in view', async () => {
      const {useScrollAnimation} = await import('../../src/hooks/UseScrollAnimation')

      // Mock animation state as not visible
      vi.mocked(useScrollAnimation).mockReturnValue({
        ref: {current: null},
        animationState: 'idle',
        isInView: false,
        triggerAnimation: vi.fn(),
        resetAnimation: vi.fn(),
      })

      render(<AboutSection />)

      // Check that inline styles are applied for hidden state
      const header = screen.getByRole('region', {name: 'About Me'}).querySelector('.section-header')
      expect(header).toHaveStyle('opacity: 0')
      expect(header).toHaveStyle('transform: translateY(2rem)')
    })
  })

  describe('Custom Props', () => {
    it('should accept and apply custom className', () => {
      render(<AboutSection className="custom-about-class" />)

      const section = screen.getByRole('region', {name: 'About Me'})
      expect(section).toHaveClass('about-section', 'custom-about-class')
    })

    it('should handle empty className gracefully', () => {
      render(<AboutSection className="" />)

      const section = screen.getByRole('region', {name: 'About Me'})
      expect(section).toHaveClass('about-section')
      expect(section.className).not.toContain('undefined')
    })
  })

  describe('Layout Structure', () => {
    it('should render components in correct order', () => {
      render(<AboutSection />)

      const section = screen.getByRole('region', {name: 'About Me'})
      const container = section.children[0]
      expect(container).toBeDefined()
      const children = Array.from(container?.children || [])

      // Should have header, story, counters, timeline, and CTA
      expect(children).toHaveLength(5)
      expect(children[0]).toHaveClass('section-header')
      expect(children[1]).toHaveClass('about-story')
      expect(children[2]).toHaveClass('about-counters')
      expect(children[3]).toHaveClass('about-timeline')
      expect(children[4]).toHaveClass('about-cta')
    })

    it('should have proper container structure', () => {
      render(<AboutSection />)

      const section = screen.getByRole('region', {name: 'About Me'})
      const container = section.querySelector('.container')
      expect(container).toBeInTheDocument()

      const bgElements = section.querySelector('.about-bg-elements')
      expect(bgElements).toBeInTheDocument()
    })
  })

  describe('Content Validation', () => {
    it('should contain comprehensive professional story', () => {
      render(<AboutSection />)

      // Check for key story elements
      expect(screen.getByText(/dedicated software engineer/)).toBeInTheDocument()
      expect(screen.getByText(/modern web technologies/)).toBeInTheDocument()
      expect(screen.getByText(/React and TypeScript/)).toBeInTheDocument()
      expect(screen.getByText(/Node.js and cloud platforms/)).toBeInTheDocument()
      expect(screen.getByText(/clean, maintainable code/)).toBeInTheDocument()
      expect(screen.getByText(/contributing to open-source projects/)).toBeInTheDocument()
    })

    it('should have engaging call-to-action content', () => {
      render(<AboutSection />)

      expect(screen.getByText(/Interested in working together/)).toBeInTheDocument()
      expect(screen.getByText(/discussing opportunities/)).toBeInTheDocument()
    })
  })
})
