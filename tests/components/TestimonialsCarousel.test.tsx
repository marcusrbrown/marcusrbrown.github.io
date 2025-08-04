import {render, screen} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import TestimonialsCarousel from '../../src/components/TestimonialsCarousel'

// Mock the UseScrollAnimation hook
vi.mock('../../src/hooks/UseScrollAnimation', () => ({
  useScrollAnimation: vi.fn(() => ({
    ref: {current: null},
    isInView: true,
  })),
}))

const mockTestimonials = [
  {
    id: '1',
    name: 'John Doe',
    role: 'Senior Developer',
    company: 'Tech Corp',
    content: 'Great work and professional attitude.',
  },
  {
    id: '2',
    name: 'Jane Smith',
    role: 'Product Manager',
    company: 'Innovation Inc',
    content: 'Excellent problem-solving skills and attention to detail.',
  },
  {
    id: '3',
    name: 'Bob Johnson',
    role: 'CTO',
    company: 'Startup LLC',
    content: 'Outstanding technical expertise and leadership.',
  },
]

describe('TestimonialsCarousel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Rendering', () => {
    it('should render with default testimonials when none provided', () => {
      render(<TestimonialsCarousel />)

      expect(screen.getByRole('heading', {name: 'What People Say'})).toBeInTheDocument()
      expect(screen.getByText(/Testimonials from colleagues and clients/)).toBeInTheDocument()
    })

    it('should render with provided testimonials', () => {
      render(<TestimonialsCarousel testimonials={mockTestimonials} />)

      expect(
        screen.getByText(content => {
          return content.includes('Great work and professional attitude.')
        }),
      ).toBeInTheDocument()
      expect(screen.getByText('John Doe')).toBeInTheDocument()
      expect(screen.getByText('Senior Developer at Tech Corp')).toBeInTheDocument()
    })

    it('should render nothing when empty testimonials array provided', () => {
      const {container} = render(<TestimonialsCarousel testimonials={[]} />)

      expect(container.firstChild).toBeNull()
    })

    it('should render navigation controls', () => {
      render(<TestimonialsCarousel testimonials={mockTestimonials} />)

      expect(screen.getByRole('button', {name: 'Previous testimonial'})).toBeInTheDocument()
      expect(screen.getByRole('button', {name: 'Next testimonial'})).toBeInTheDocument()
      expect(screen.getByRole('button', {name: 'Pause testimonials'})).toBeInTheDocument()
    })

    it('should render indicators for each testimonial', () => {
      render(<TestimonialsCarousel testimonials={mockTestimonials} />)

      const indicators = screen.getAllByRole('button', {name: /Go to testimonial/})
      expect(indicators).toHaveLength(3)
    })
  })

  describe('Accessibility', () => {
    it('should have proper ARIA attributes', () => {
      render(<TestimonialsCarousel testimonials={mockTestimonials} />)

      const section = screen.getByRole('region', {name: 'Testimonials carousel'})
      expect(section).toHaveAttribute('aria-live', 'polite')

      const heading = screen.getByRole('heading', {name: 'What People Say'})
      expect(heading).toHaveAttribute('id', 'testimonials-heading')

      const carousel = screen.getByLabelText('What People Say')
      expect(carousel).toHaveAttribute('aria-labelledby', 'testimonials-heading')
    })

    it('should have screen reader friendly content', () => {
      render(<TestimonialsCarousel testimonials={mockTestimonials} />)

      const playButton = screen.getByRole('button', {name: 'Pause testimonials'})
      expect(playButton.querySelector('.sr-only')).toBeInTheDocument()
    })
  })

  describe('Avatar and LinkedIn Integration', () => {
    it('should render avatar when provided', () => {
      const testimonialsWithAvatar = [
        {
          id: '1',
          name: 'John Doe',
          role: 'Senior Developer',
          company: 'Tech Corp',
          content: 'Great work and professional attitude.',
          avatar: 'https://example.com/avatar.jpg',
        },
      ]

      render(<TestimonialsCarousel testimonials={testimonialsWithAvatar} />)

      const avatar = screen.getByRole('img', {name: 'John Doe avatar'})
      expect(avatar).toHaveAttribute('src', 'https://example.com/avatar.jpg')
    })

    it('should render LinkedIn link when provided', () => {
      const testimonialsWithLinkedIn = [
        {
          id: '1',
          name: 'John Doe',
          role: 'Senior Developer',
          company: 'Tech Corp',
          content: 'Great work and professional attitude.',
          linkedinUrl: 'https://linkedin.com/in/johndoe',
        },
      ]

      render(<TestimonialsCarousel testimonials={testimonialsWithLinkedIn} />)

      const linkedInLink = screen.getByRole('link', {name: 'John Doe'})
      expect(linkedInLink).toHaveAttribute('href', 'https://linkedin.com/in/johndoe')
      expect(linkedInLink).toHaveAttribute('target', '_blank')
      expect(linkedInLink).toHaveAttribute('rel', 'noopener noreferrer')
    })

    it('should render name as text when no LinkedIn URL provided', () => {
      render(<TestimonialsCarousel testimonials={mockTestimonials} />)

      const nameElement = screen.getByText('John Doe')
      expect(nameElement.tagName).toBe('CITE')
      expect(nameElement.closest('a')).toBeNull()
    })
  })

  describe('Performance', () => {
    it('should not render when testimonials is undefined and no defaults available', () => {
      const {container} = render(<TestimonialsCarousel testimonials={[]} />)

      expect(container.firstChild).toBeNull()
    })
  })
})
