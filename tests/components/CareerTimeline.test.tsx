import {render, screen} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import CareerTimeline from '../../src/components/CareerTimeline'

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

describe('CareerTimeline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render timeline container with proper structure', () => {
    render(<CareerTimeline />)

    const timeline = screen.getByRole('region', {name: 'Professional career timeline'})
    expect(timeline).toHaveClass('career-timeline')
    expect(timeline.querySelector('.timeline-list')).toBeInTheDocument()
  })

  it('should render all timeline items', () => {
    render(<CareerTimeline />)

    expect(screen.getByText('Senior Full-Stack Developer')).toBeInTheDocument()
    expect(screen.getByText('Technical Lead')).toBeInTheDocument()
    expect(screen.getByText('Senior Software Developer')).toBeInTheDocument()
    expect(screen.getByText('Bachelor of Science in Computer Science')).toBeInTheDocument()
  })

  it('should have proper ARIA attributes', () => {
    render(<CareerTimeline />)

    const timeline = screen.getByRole('region', {name: 'Professional career timeline'})
    expect(timeline).toBeInTheDocument()

    const list = screen.getByRole('list')
    expect(list).toHaveClass('timeline-list')

    const listItems = screen.getAllByRole('listitem')
    expect(listItems).toHaveLength(4) // 4 timeline items
  })

  it('should have proper button accessibility attributes', () => {
    render(<CareerTimeline />)

    const buttons = screen.getAllByRole('button')
    buttons.forEach(button => {
      expect(button).toHaveAttribute('aria-expanded', 'false')
      expect(button).toHaveAttribute('aria-controls')
    })
  })
})
