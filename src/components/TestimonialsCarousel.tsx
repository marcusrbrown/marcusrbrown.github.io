import React, {useCallback, useEffect, useState} from 'react'
import {useScrollAnimation} from '../hooks/UseScrollAnimation'

interface Testimonial {
  id: string
  name: string
  role: string
  company: string
  content: string
  avatar?: string
  rating?: number
  linkedinUrl?: string
}

interface TestimonialsCarouselProps {
  testimonials?: Testimonial[]
  autoPlay?: boolean
  autoPlayInterval?: number
  className?: string
}

const defaultTestimonials: Testimonial[] = [
  {
    id: '1',
    name: 'Sarah Johnson',
    role: 'Senior Product Manager',
    company: 'Tech Innovation Corp',
    content:
      'Working with Marcus was an absolute pleasure. His technical expertise and attention to detail helped us deliver a complex project on time and exceed our expectations.',
  },
  {
    id: '2',
    name: 'David Chen',
    role: 'CTO',
    company: 'StartupFlow',
    content:
      'Marcus demonstrated exceptional problem-solving skills and leadership during our collaboration. His ability to translate complex requirements into elegant solutions is remarkable.',
  },
  {
    id: '3',
    name: 'Emily Rodriguez',
    role: 'UX Designer',
    company: 'Creative Studios',
    content:
      'The collaboration with Marcus was seamless. He understood our design vision perfectly and implemented it with pixel-perfect precision while maintaining excellent performance.',
  },
]

const TestimonialsCarousel: React.FC<TestimonialsCarouselProps> = ({
  testimonials = defaultTestimonials,
  autoPlay = true,
  autoPlayInterval = 5000,
  className = '',
}) => {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(autoPlay)

  const {ref, isInView} = useScrollAnimation<HTMLElement>({
    threshold: 0.2,
    rootMargin: '50px 0px',
    triggerOnce: true,
  })

  const nextTestimonial = useCallback(() => {
    setCurrentIndex(prevIndex => (prevIndex === testimonials.length - 1 ? 0 : prevIndex + 1))
  }, [testimonials.length])

  const prevTestimonial = useCallback(() => {
    setCurrentIndex(prevIndex => (prevIndex === 0 ? testimonials.length - 1 : prevIndex - 1))
  }, [testimonials.length])

  const goToTestimonial = useCallback((index: number) => {
    setCurrentIndex(index)
  }, [])

  // Auto-play functionality
  useEffect(() => {
    if (!isPlaying || !isInView) return

    const interval = setInterval(nextTestimonial, autoPlayInterval)
    return () => clearInterval(interval)
  }, [isPlaying, isInView, nextTestimonial, autoPlayInterval])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isInView) return

      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault()
          prevTestimonial()
          setIsPlaying(false)
          break
        case 'ArrowRight':
          event.preventDefault()
          nextTestimonial()
          setIsPlaying(false)
          break
        case ' ':
          event.preventDefault()
          setIsPlaying(!isPlaying)
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isInView, nextTestimonial, prevTestimonial, isPlaying])

  if (testimonials.length === 0) {
    return null
  }

  const currentTestimonial = testimonials[currentIndex]

  if (!currentTestimonial) {
    return null
  }

  return (
    <section
      ref={ref}
      className={`testimonials-carousel ${className}`.trim()}
      aria-labelledby="testimonials-heading"
      style={{
        opacity: isInView ? 1 : 0,
        transform: isInView ? 'translateY(0)' : 'translateY(2rem)',
        transition: 'opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1), transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <div className="testimonials-carousel-container">
        <header className="testimonials-header">
          <h3 id="testimonials-heading" className="testimonials-title">
            What People Say
          </h3>
          <p className="testimonials-subtitle">
            Testimonials from colleagues and clients I've had the pleasure to work with
          </p>
        </header>

        <div className="testimonials-content" role="region" aria-live="polite" aria-label="Testimonials carousel">
          <div className="testimonial-card">
            <blockquote className="testimonial-quote">
              <p className="testimonial-text">"{currentTestimonial.content}"</p>
            </blockquote>

            <footer className="testimonial-author">
              {currentTestimonial.avatar && (
                <img
                  src={currentTestimonial.avatar}
                  alt={`${currentTestimonial.name} avatar`}
                  className="testimonial-avatar"
                />
              )}
              <div className="testimonial-author-info">
                <cite className="testimonial-name">
                  {currentTestimonial.linkedinUrl ? (
                    <a
                      href={currentTestimonial.linkedinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="testimonial-link"
                    >
                      {currentTestimonial.name}
                    </a>
                  ) : (
                    currentTestimonial.name
                  )}
                </cite>
                <p className="testimonial-role">
                  {currentTestimonial.role} at {currentTestimonial.company}
                </p>
              </div>
            </footer>
          </div>
        </div>

        <div className="testimonials-controls">
          <button
            type="button"
            onClick={prevTestimonial}
            className="testimonial-nav-btn testimonial-nav-btn--prev"
            aria-label="Previous testimonial"
            onFocus={() => setIsPlaying(false)}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M15 18L9 12L15 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          <div className="testimonials-indicators">
            {testimonials.map((_, index) => (
              <button
                key={index}
                type="button"
                onClick={() => {
                  goToTestimonial(index)
                  setIsPlaying(false)
                }}
                className={`testimonial-indicator ${index === currentIndex ? 'testimonial-indicator--active' : ''}`}
                aria-label={`Go to testimonial ${index + 1}`}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={nextTestimonial}
            className="testimonial-nav-btn testimonial-nav-btn--next"
            aria-label="Next testimonial"
            onFocus={() => setIsPlaying(false)}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M9 18L15 12L9 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        <div className="testimonials-playback">
          <button
            type="button"
            onClick={() => setIsPlaying(!isPlaying)}
            className="testimonial-playback-btn"
            aria-label={isPlaying ? 'Pause testimonials' : 'Play testimonials'}
          >
            {isPlaying ? (
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <rect x="6" y="4" width="4" height="16" fill="currentColor" />
                <rect x="14" y="4" width="4" height="16" fill="currentColor" />
              </svg>
            ) : (
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <polygon points="5,3 19,12 5,21" fill="currentColor" />
              </svg>
            )}
            <span className="sr-only">{isPlaying ? 'Pause' : 'Play'} testimonials carousel</span>
          </button>
        </div>
      </div>
    </section>
  )
}

export default TestimonialsCarousel
