import React from 'react'
import {getAnimationClasses, getStaggerDelay, useScrollAnimation} from '../hooks/UseScrollAnimation'

/**
 * Contact method interface
 */
export interface ContactMethod {
  /** Unique identifier */
  id: string
  /** Display label */
  label: string
  /** Contact URL or email */
  href: string
  /** Icon identifier for styling */
  icon: string
  /** Method type for styling */
  type: 'email' | 'social' | 'calendar' | 'download'
  /** Whether this is a primary contact method */
  primary?: boolean
  /** Optional description */
  description?: string
}

/**
 * Props for ContactCTA component
 */
export interface ContactCTAProps {
  /** Additional CSS classes */
  className?: string
  /** Custom title */
  title?: string
  /** Custom subtitle */
  subtitle?: string
  /** Professional availability status */
  availabilityStatus?: string
  /** Whether to show availability indicator */
  showAvailability?: boolean
  /** Custom contact methods */
  contactMethods?: ContactMethod[]
}

/**
 * Individual contact method card component
 */
interface ContactMethodCardProps {
  method: ContactMethod
  index: number
  variant: 'primary' | 'secondary'
}

const ContactMethodCard: React.FC<ContactMethodCardProps> = ({method, index, variant}) => {
  const handleClick = () => {
    // Analytics tracking will be implemented in TASK-030
  }

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      const link = event.currentTarget.querySelector('a') as HTMLAnchorElement
      if (link) {
        link.click()
      }
    }
  }

  return (
    <div
      className={`contact-method-card contact-method-card--${variant} contact-method-card--${method.type}`}
      style={{'--method-index': index} as React.CSSProperties}
      tabIndex={0}
      role="button"
      aria-label={`${method.label}: ${method.description || 'Contact method'}`}
      onKeyDown={handleKeyDown}
    >
      <a
        href={method.href}
        className="contact-method-link"
        onClick={handleClick}
        target={
          method.type === 'social' || method.type === 'calendar' || method.type === 'download' ? '_blank' : undefined
        }
        rel={
          method.type === 'social' || method.type === 'calendar' || method.type === 'download'
            ? 'noopener noreferrer'
            : undefined
        }
        aria-describedby={`method-desc-${method.id}`}
      >
        <div className="contact-method-icon" aria-hidden="true">
          <span className={`icon ${method.icon}`} />
        </div>
        <div className="contact-method-content">
          <h4 className="contact-method-label">{method.label}</h4>
          {method.description && (
            <p id={`method-desc-${method.id}`} className="contact-method-description">
              {method.description}
            </p>
          )}
        </div>
        <div className="contact-method-arrow" aria-hidden="true">
          <span className="icon icon-arrow-right" />
        </div>
      </a>
    </div>
  )
}

/**
 * ContactCTA Component
 *
 * Comprehensive call-to-action section with multiple contact methods,
 * professional availability status, and social media integration.
 * Features smooth animations and responsive design.
 *
 * Key Features:
 * - Multiple contact methods (email, LinkedIn, GitHub, social)
 * - Professional availability status indicator
 * - Hover effects and micro-interactions
 * - Responsive design with mobile-first approach
 * - Theme-aware styling using CSS custom properties
 * - Accessibility-focused with proper ARIA attributes
 */
const ContactCTA: React.FC<ContactCTAProps> = ({
  className = '',
  title = "Let's Work Together",
  subtitle = "Ready to bring your next project to life? I'm currently available for new opportunities and would love to hear about your ideas.",
  availabilityStatus = 'Available for new projects',
  showAvailability = true,
  contactMethods,
}) => {
  // Default contact methods
  const defaultContactMethods: ContactMethod[] = [
    {
      id: 'email',
      label: 'Email',
      href: "mailto:hello@mrbro.dev?subject=Let's work together",
      icon: 'icon-email',
      type: 'email',
      primary: true,
      description: 'Direct email for project inquiries',
    },
    {
      id: 'linkedin',
      label: 'LinkedIn',
      href: 'https://linkedin.com/in/marcusrbrown',
      icon: 'icon-linkedin',
      type: 'social',
      description: 'Professional networking and career updates',
    },
    {
      id: 'github',
      label: 'GitHub',
      href: 'https://github.com/marcusrbrown',
      icon: 'icon-github',
      type: 'social',
      description: 'Open source projects and code repositories',
    },
    {
      id: 'twitter',
      label: 'Twitter',
      href: 'https://twitter.com/marcusrbrown',
      icon: 'icon-twitter',
      type: 'social',
      description: 'Tech discussions and industry insights',
    },
    {
      id: 'calendar',
      label: 'Schedule Call',
      href: 'https://calendly.com/marcusrbrown/30min',
      icon: 'icon-calendar',
      type: 'calendar',
      description: 'Book a 30-minute discovery call',
    },
    {
      id: 'resume',
      label: 'Download Resume',
      href: '/resume.pdf',
      icon: 'icon-download',
      type: 'download',
      description: 'Professional resume and portfolio',
    },
  ]

  const methods = contactMethods || defaultContactMethods

  // Animation hooks for staggered entrance effects
  const headerAnimation = useScrollAnimation<HTMLElement>({
    threshold: 0.3,
    delay: getStaggerDelay(0, 200, 100),
  })

  const availabilityAnimation = useScrollAnimation<HTMLDivElement>({
    threshold: 0.3,
    delay: getStaggerDelay(1, 200, 100),
  })

  const methodsAnimation = useScrollAnimation<HTMLDivElement>({
    threshold: 0.3,
    delay: getStaggerDelay(2, 200, 100),
  })

  // Separate primary and secondary contact methods
  const primaryMethods = methods.filter(method => method.primary)
  const secondaryMethods = methods.filter(method => !method.primary)

  return (
    <section className={`contact-cta ${className}`.trim()} aria-labelledby="contact-title" id="contact">
      <div className="container">
        {/* Header */}
        <header
          ref={headerAnimation.ref}
          className={`contact-cta-header ${getAnimationClasses(headerAnimation.animationState, 'animate-fade-up')}`}
        >
          <h2 id="contact-title" className="contact-cta-title">
            {title}
          </h2>
          <p className="contact-cta-subtitle">{subtitle}</p>
        </header>

        {/* Availability Status */}
        {showAvailability && (
          <div
            ref={availabilityAnimation.ref}
            className={`contact-availability ${getAnimationClasses(availabilityAnimation.animationState, 'animate-scale')}`}
          >
            <div className="contact-availability-indicator" aria-hidden="true">
              <div className="availability-dot"></div>
            </div>
            <span className="contact-availability-text">{availabilityStatus}</span>
          </div>
        )}

        {/* Contact Methods */}
        <div
          ref={methodsAnimation.ref}
          className={`contact-methods ${getAnimationClasses(methodsAnimation.animationState, 'animate-fade-up')}`}
        >
          {/* Primary Contact Methods */}
          {primaryMethods.length > 0 && (
            <div className="contact-methods-primary">
              <h3 className="contact-methods-title">Get In Touch</h3>
              <div className="contact-methods-grid contact-methods-grid--primary">
                {primaryMethods.map((method, index) => (
                  <ContactMethodCard key={method.id} method={method} index={index} variant="primary" />
                ))}
              </div>
            </div>
          )}

          {/* Secondary Contact Methods */}
          {secondaryMethods.length > 0 && (
            <div className="contact-methods-secondary">
              <h3 className="contact-methods-title">Connect & Follow</h3>
              <div className="contact-methods-grid contact-methods-grid--secondary">
                {secondaryMethods.map((method, index) => (
                  <ContactMethodCard
                    key={method.id}
                    method={method}
                    index={index + primaryMethods.length}
                    variant="secondary"
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Background Decorative Elements */}
      <div className="contact-cta-bg-elements" aria-hidden="true">
        <div className="contact-bg-grid"></div>
        <div className="contact-bg-circle contact-bg-circle--1"></div>
        <div className="contact-bg-circle contact-bg-circle--2"></div>
      </div>
    </section>
  )
}

export default ContactCTA
