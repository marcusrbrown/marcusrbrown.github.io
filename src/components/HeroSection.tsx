import React, {useEffect, useState} from 'react'
import {getAnimationClasses, getStaggerDelay, useScrollAnimation} from '../hooks/UseScrollAnimation'

/**
 * Props for the HeroSection component
 */
interface HeroSectionProps {
  /** Additional CSS classes */
  className?: string
  /** Custom title override */
  title?: string
  /** Custom subtitle override */
  subtitle?: string
  /** Primary CTA button text */
  primaryCTA?: string
  /** Primary CTA button href */
  primaryHref?: string
  /** Secondary CTA button text */
  secondaryCTA?: string
  /** Secondary CTA button href */
  secondaryHref?: string
}

/**
 * HeroSection Component
 *
 * Modern, accessible hero section with animated typography and call-to-action buttons.
 * Features smooth scroll-triggered animations that respect user motion preferences
 * and integrate seamlessly with the existing theme system.
 *
 * Key Features:
 * - Animated typography with staggered entrance effects
 * - Accessible call-to-action buttons with focus management
 * - Responsive design with mobile-first approach
 * - Reduced motion support via CSS and JavaScript
 * - Theme-aware styling using CSS custom properties
 * - SEO-optimized semantic HTML structure
 */
const HeroSection: React.FC<HeroSectionProps> = ({
  className = '',
  title = 'Marcus R. Brown',
  subtitle = 'Full-stack developer crafting exceptional digital experiences with modern web technologies. Passionate about clean code, performance optimization, and creating accessible solutions that make a difference.',
  primaryCTA = 'View My Work',
  primaryHref = '#projects',
  secondaryCTA = 'Get In Touch',
  secondaryHref = '#contact',
}) => {
  // Animation hooks for staggered entrance effects
  const titleAnimation = useScrollAnimation<HTMLHeadingElement>({
    threshold: 0.2,
    delay: getStaggerDelay(0, 200, 150),
  })

  const subtitleAnimation = useScrollAnimation<HTMLParagraphElement>({
    threshold: 0.2,
    delay: getStaggerDelay(1, 200, 150),
  })

  const ctaAnimation = useScrollAnimation<HTMLDivElement>({
    threshold: 0.2,
    delay: getStaggerDelay(2, 200, 150),
  })

  const scrollIndicatorAnimation = useScrollAnimation<HTMLDivElement>({
    threshold: 0.2,
    delay: getStaggerDelay(3, 200, 150),
  })

  // Loading state management
  const [isLoaded, setIsLoaded] = useState(false)

  // Handle component mount and loading state
  useEffect(() => {
    // Simulate loading complete after component mounts
    const timer = setTimeout(() => {
      setIsLoaded(true)
    }, 100)

    return () => clearTimeout(timer)
  }, [])

  /**
   * Handles smooth scrolling to target sections
   */
  const handleSmoothScroll = (event: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (href.startsWith('#')) {
      event.preventDefault()
      const targetId = href.slice(1)
      const targetElement = document.querySelector(`#${targetId}`)

      if (targetElement) {
        targetElement.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        })

        // Focus the target element for accessibility
        ;(targetElement as HTMLElement).focus()
      }
    }
  }

  /**
   * Handles keyboard navigation for CTA buttons
   */
  const handleKeyDown = (event: React.KeyboardEvent, action: () => void) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      action()
    }
  }

  return (
    <section className={`hero-section ${className}`} aria-label="Introduction and main call-to-action" role="banner">
      {/* Background Elements */}
      <div className="hero-background" aria-hidden="true" />

      {/* Main Content */}
      <div className={`hero-content ${isLoaded ? 'loaded' : 'loading'}`}>
        {/* Main Title */}
        <h1
          ref={titleAnimation.ref}
          className={`hero-title ${getAnimationClasses(titleAnimation.animationState, 'animate-fade-up')}`}
        >
          Hello, I'm <span className="hero-title-highlight">{title}</span>
        </h1>

        {/* Subtitle */}
        <p
          ref={subtitleAnimation.ref}
          className={`hero-subtitle ${getAnimationClasses(subtitleAnimation.animationState, 'animate-fade-up')}`}
        >
          {subtitle}
        </p>

        {/* Call-to-Action Buttons */}
        <div
          ref={ctaAnimation.ref}
          className={`hero-cta ${getAnimationClasses(ctaAnimation.animationState, 'animate-scale')}`}
        >
          <a
            href={primaryHref}
            className="hero-cta-button hero-cta-button--primary"
            onClick={e => handleSmoothScroll(e, primaryHref)}
            onKeyDown={e => handleKeyDown(e, () => handleSmoothScroll(e as any, primaryHref))}
            aria-describedby="primary-cta-description"
          >
            <span>{primaryCTA}</span>
            <span aria-hidden="true">→</span>
          </a>
          <span id="primary-cta-description" className="sr-only">
            Navigate to projects section to view my portfolio
          </span>

          <a
            href={secondaryHref}
            className="hero-cta-button hero-cta-button--secondary"
            onClick={e => handleSmoothScroll(e, secondaryHref)}
            onKeyDown={e => handleKeyDown(e, () => handleSmoothScroll(e as any, secondaryHref))}
            aria-describedby="secondary-cta-description"
          >
            <span>{secondaryCTA}</span>
            <span aria-hidden="true">✉</span>
          </a>
          <span id="secondary-cta-description" className="sr-only">
            Navigate to contact section to get in touch
          </span>
        </div>
      </div>

      {/* Scroll Indicator */}
      <div
        ref={scrollIndicatorAnimation.ref}
        className={`hero-scroll-indicator ${getAnimationClasses(scrollIndicatorAnimation.animationState, 'animate-fade-in')}`}
        aria-label="Scroll down to see more content"
        role="presentation"
      >
        <span className="sr-only">Scroll down</span>
        <div className="hero-scroll-arrow" aria-hidden="true" />
      </div>
    </section>
  )
}

export default HeroSection
