import {render, screen} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import AnimatedCounters from '../../src/components/AnimatedCounters'

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

// Mock animation utility functions
vi.mock('../../src/utils/animation-utils', () => ({
  easingFunctions: {
    easeOutQuart: (t: number) => 1 - (1 - t) ** 4,
  },
}))

describe('AnimatedCounters', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render all counter items with correct structure', () => {
    render(<AnimatedCounters />)

    const countersContainer = screen.getByRole('region', {name: 'Professional statistics'})
    expect(countersContainer).toHaveClass('animated-counters')

    // Check for counter items
    expect(screen.getByText('Years Experience')).toBeInTheDocument()
    expect(screen.getByText('Projects Completed')).toBeInTheDocument()
    expect(screen.getByText('GitHub Repositories')).toBeInTheDocument()
    expect(screen.getByText('Programming Languages')).toBeInTheDocument()
    expect(screen.getByText('Open Source Contributions')).toBeInTheDocument()
    expect(screen.getByText('Technical Certifications')).toBeInTheDocument()
  })

  it('should display counter numbers initially as 0 or target values', () => {
    render(<AnimatedCounters />)

    // Should find counter numbers (they start as 0 until animation triggers)
    const counterNumbers = screen.getAllByText(/^\d+\+?%?$/)
    expect(counterNumbers.length).toBeGreaterThan(0)
  })

  it('should have proper accessibility attributes', () => {
    render(<AnimatedCounters />)

    const countersContainer = screen.getByRole('region', {name: 'Professional statistics'})
    expect(countersContainer).toBeInTheDocument()

    // Should have proper counter structure
    const counterItems = document.querySelectorAll('.animated-counter')
    expect(counterItems.length).toBe(6) // 6 counter items

    counterItems.forEach(item => {
      expect(item).toHaveClass('animated-counter')
    })
  })

  it('should apply animation classes based on scroll state', () => {
    render(<AnimatedCounters />)

    const countersContainer = screen.getByRole('region', {name: 'Professional statistics'})
    expect(countersContainer).toHaveClass('animate--idle')
  })
})
