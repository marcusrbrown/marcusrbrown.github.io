import {act, render, screen, waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import SkillsShowcase from '../../src/components/SkillsShowcase'

// Mock the UseScrollAnimation hook
vi.mock('../../src/hooks/UseScrollAnimation', () => ({
  useScrollAnimation: vi.fn(() => ({
    ref: {current: null},
    isInView: true,
    animationState: 'visible',
    triggerAnimation: vi.fn(),
    resetAnimation: vi.fn(),
  })),
}))

// Mock the animation utilities
vi.mock('../../src/utils/animation-utils', () => ({
  animateProficiency: vi.fn((target, onProgress, _config) => {
    // Simulate immediate completion for tests with actual target value
    onProgress(target)
    return vi.fn() // cleanup function
  }),
  createStaggeredDelays: vi.fn(() => [100, 150, 200, 250]),
  getSafeAnimationDuration: vi.fn(duration => duration),
}))

// Mock intersection observer
const mockIntersectionObserver = vi.fn()
mockIntersectionObserver.mockReturnValue({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
})
vi.stubGlobal('IntersectionObserver', mockIntersectionObserver)

// Mock requestAnimationFrame
vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
  return setTimeout(callback, 16)
})
vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id))

describe('SkillsShowcase', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllTimers()
  })

  it('renders with default props', () => {
    render(<SkillsShowcase />)

    expect(screen.getByText('Skills & Expertise')).toBeInTheDocument()
    expect(
      screen.getByText('Technologies and tools I work with to build exceptional digital experiences'),
    ).toBeInTheDocument()
  })

  it('renders with custom title and subtitle', () => {
    const customTitle = 'My Expertise'
    const customSubtitle = 'What I bring to the table'

    render(<SkillsShowcase title={customTitle} subtitle={customSubtitle} />)

    expect(screen.getByText(customTitle)).toBeInTheDocument()
    expect(screen.getByText(customSubtitle)).toBeInTheDocument()
  })

  it('applies custom className', () => {
    const customClass = 'custom-skills-section'
    const {container} = render(<SkillsShowcase className={customClass} />)

    expect(container.firstChild).toHaveClass('skills-showcase', customClass)
  })

  it('renders all skill categories', () => {
    render(<SkillsShowcase />)

    expect(screen.getByText('Frontend Development')).toBeInTheDocument()
    expect(screen.getByText('Backend Development')).toBeInTheDocument()
    expect(screen.getByText('Development Tools')).toBeInTheDocument()
    expect(screen.getByText('Professional Skills')).toBeInTheDocument()
  })

  it('renders all skills in each category', () => {
    render(<SkillsShowcase />)

    // Frontend skills
    expect(screen.getByText('React')).toBeInTheDocument()
    expect(screen.getByText('TypeScript')).toBeInTheDocument()
    expect(screen.getByText('CSS/SCSS')).toBeInTheDocument()

    // Backend skills
    expect(screen.getByText('Node.js')).toBeInTheDocument()
    expect(screen.getByText('REST APIs')).toBeInTheDocument()

    // Tools
    expect(screen.getByText('Git')).toBeInTheDocument()
    expect(screen.getByText('VS Code')).toBeInTheDocument()

    // Professional skills
    expect(screen.getByText('Problem Solving')).toBeInTheDocument()
    expect(screen.getByText('Communication')).toBeInTheDocument()
  })

  it('renders proficiency indicators for all skills', () => {
    render(<SkillsShowcase />)

    const progressBars = screen.getAllByRole('progressbar')
    expect(progressBars.length).toBeGreaterThan(0)

    // Check that each progress bar has proper ARIA attributes
    progressBars.forEach(progressBar => {
      expect(progressBar).toHaveAttribute('aria-valuenow')
      expect(progressBar).toHaveAttribute('aria-valuemin', '0')
      expect(progressBar).toHaveAttribute('aria-valuemax', '100')
      expect(progressBar).toHaveAttribute('aria-label')
    })
  })

  it('has proper ARIA structure for accessibility', () => {
    render(<SkillsShowcase />)

    // Check main section has proper labelling
    const section = screen.getByRole('region', {name: /skills organized by category/i})
    expect(section).toBeInTheDocument()

    // Check that skill lists have proper role
    const skillLists = screen.getAllByRole('list')
    expect(skillLists.length).toBeGreaterThan(0)

    // Check that skill items have proper role
    const skillItems = screen.getAllByRole('listitem')
    expect(skillItems.length).toBeGreaterThan(0)
  })

  it('supports keyboard navigation', async () => {
    const user = userEvent.setup()
    render(<SkillsShowcase />)

    const skillItems = screen.getAllByRole('listitem')

    // First skill item should be focusable
    expect(skillItems[0]).toHaveAttribute('tabIndex', '0')

    // Focus the first skill item
    const firstSkill = skillItems[0]
    if (firstSkill) {
      await act(async () => {
        await user.click(firstSkill)
      })
      expect(firstSkill).toHaveFocus()
    }
  })

  it('handles keyboard interactions', async () => {
    const user = userEvent.setup()
    render(<SkillsShowcase />)

    const skillItems = screen.getAllByRole('listitem')
    const firstSkill = skillItems[0]

    if (firstSkill) {
      await act(async () => {
        // Focus and press Enter
        await user.click(firstSkill)
        await user.keyboard('{Enter}')

        // Press Space
        await user.keyboard(' ')
      })

      // Should still have focus
      expect(firstSkill).toHaveFocus()
    }
  })

  it('animates proficiency values when visible', async () => {
    const {animateProficiency} = await import('../../src/utils/animation-utils')

    render(<SkillsShowcase />)

    // Wait for animations to be triggered
    await waitFor(() => {
      expect(animateProficiency).toHaveBeenCalled()
    })
  })

  it('handles focus and blur events', async () => {
    const user = userEvent.setup()
    render(<SkillsShowcase />)

    const skillItems = screen.getAllByRole('listitem')
    const firstSkill = skillItems[0]

    if (firstSkill) {
      // Check that element is focusable
      expect(firstSkill).toHaveAttribute('tabIndex', '0')

      await act(async () => {
        // Simulate focus event
        await user.click(firstSkill)
      })

      // Should have received focus (this is limited in jsdom but we can check events)
      expect(firstSkill).toHaveAttribute('tabIndex', '0')
    }
  })

  it('displays correct proficiency percentages', async () => {
    render(<SkillsShowcase />)

    // Wait for animations to complete and check that percentages are displayed
    await waitFor(() => {
      const percentages = screen.getAllByText('95%')
      expect(percentages.length).toBeGreaterThan(0) // React proficiency and others with 95%
    })

    // Check for various percentages that should exist
    expect(screen.getAllByText('90%').length).toBeGreaterThan(0) // TypeScript and others
    expect(screen.getAllByText('88%').length).toBeGreaterThan(0) // CSS/SCSS and others
    expect(screen.getAllByText('85%').length).toBeGreaterThan(0) // Various skills
  })

  it('applies proper CSS classes for animations', () => {
    const {container} = render(<SkillsShowcase />)

    // Check for animation-related classes
    expect(container.querySelector('.skills-grid')).toBeInTheDocument()
    expect(container.querySelector('.skills-grid--visible')).toBeInTheDocument()
    expect(container.querySelector('.skill-category')).toBeInTheDocument()
  })

  it('respects reduced motion preferences', async () => {
    // Mock prefers-reduced-motion
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(query => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })

    render(<SkillsShowcase />)

    // Animation utilities should be called with reduced motion settings
    const {getSafeAnimationDuration} = await import('../../src/utils/animation-utils')
    expect(getSafeAnimationDuration).toHaveBeenCalled()
  })

  it('has proper semantic HTML structure', () => {
    render(<SkillsShowcase />)

    // Check section element (the main skills section)
    const mainSection = screen.getByLabelText('Skills & Expertise')
    expect(mainSection.tagName).toBe('SECTION')

    // Check header structure
    const mainHeading = screen.getByRole('heading', {level: 2})
    expect(mainHeading).toHaveTextContent('Skills & Expertise')

    // Check category headings
    const categoryHeadings = screen.getAllByRole('heading', {level: 3})
    expect(categoryHeadings.length).toBe(4) // Four categories
  })

  it('includes proper descriptions for categories', () => {
    render(<SkillsShowcase />)

    expect(screen.getByText('Building responsive and interactive user interfaces')).toBeInTheDocument()
    expect(screen.getByText('Server-side development and API design')).toBeInTheDocument()
    expect(screen.getByText('Essential tools for modern development workflow')).toBeInTheDocument()
    expect(screen.getByText('Essential skills for effective collaboration and leadership')).toBeInTheDocument()
  })

  it('handles component unmounting cleanly', () => {
    const {unmount} = render(<SkillsShowcase />)

    // Should unmount without errors
    expect(() => unmount()).not.toThrow()
  })

  it('maintains focus visibility for accessibility', async () => {
    const user = userEvent.setup()
    render(<SkillsShowcase />)

    const skillItems = screen.getAllByRole('listitem')
    const firstSkill = skillItems[0]

    if (firstSkill) {
      await act(async () => {
        // Focus should be visible
        await user.click(firstSkill)
      })

      // The element should have focus styles (this would be tested in e2e tests)
      expect(firstSkill).toHaveFocus()
    }
  })
})
