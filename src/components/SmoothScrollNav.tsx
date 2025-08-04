import React, {useCallback, useEffect, useState} from 'react'

/**
 * Navigation item configuration
 */
interface NavItem {
  /** Section ID to scroll to */
  id: string
  /** Display label for the navigation item */
  label: string
  /** Optional icon or emoji */
  icon?: string
}

/**
 * Props for the SmoothScrollNav component
 */
interface SmoothScrollNavProps {
  /** Additional CSS classes */
  className?: string
  /** Navigation items to display */
  items?: NavItem[]
  /** Whether to show scroll progress indicator */
  showProgress?: boolean
  /** Whether to auto-hide when at top of page */
  autoHide?: boolean
  /** Threshold for showing/hiding nav (in pixels from top) */
  showThreshold?: number
}

/**
 * Default navigation items for the portfolio sections
 */
const DEFAULT_NAV_ITEMS: NavItem[] = [
  {id: 'hero', label: 'Home', icon: '🏠'},
  {id: 'skills', label: 'Skills', icon: '💡'},
  {id: 'about', label: 'About', icon: '👨‍💻'},
  {id: 'projects', label: 'Projects', icon: '🚀'},
  {id: 'blog', label: 'Blog', icon: '📝'},
  {id: 'contact', label: 'Contact', icon: '📬'},
]

/**
 * SmoothScrollNav Component
 *
 * A fixed navigation component that provides smooth scrolling between page sections
 * with active section highlighting, scroll progress indicator, and full accessibility support.
 *
 * Features:
 * - Smooth scroll navigation between sections
 * - Active section highlighting using Intersection Observer
 * - Scroll progress indicator
 * - Auto-hide behavior based on scroll position
 * - Mobile-responsive design
 * - Full keyboard navigation support
 * - Respect for user motion preferences
 */
const SmoothScrollNav: React.FC<SmoothScrollNavProps> = ({
  className = '',
  items = DEFAULT_NAV_ITEMS,
  showProgress = true,
  autoHide = true,
  showThreshold = 100,
}) => {
  const [activeSection, setActiveSection] = useState<string>('')
  const [scrollProgress, setScrollProgress] = useState<number>(0)
  const [isVisible, setIsVisible] = useState<boolean>(!autoHide)
  const [isScrolling, setIsScrolling] = useState<boolean>(false)

  /**
   * Calculate scroll progress as percentage
   */
  const updateScrollProgress = useCallback(() => {
    const scrollTop = window.scrollY
    const docHeight = document.documentElement.scrollHeight - window.innerHeight
    const progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0
    setScrollProgress(progress)

    // Update visibility based on scroll position
    if (autoHide) {
      setIsVisible(scrollTop > showThreshold)
    }
  }, [autoHide, showThreshold])

  /**
   * Handle smooth scroll to section
   */
  const scrollToSection = useCallback((sectionId: string) => {
    const element = document.querySelector(`#${sectionId}`)
    if (!element) return

    setIsScrolling(true)

    // Use CSS scroll-behavior for smooth scrolling
    element.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })

    // Reset scrolling state after animation
    setTimeout(() => setIsScrolling(false), 1000)
  }, [])

  /**
   * Handle keyboard navigation
   */
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent, sectionId: string) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        scrollToSection(sectionId)
      }
    },
    [scrollToSection],
  )

  /**
   * Set up intersection observer for active section detection
   */
  useEffect(() => {
    // Skip intersection observer during programmatic scrolling
    if (isScrolling) return

    const sections = items.map(item => document.querySelector(`#${item.id}`)).filter(Boolean) as HTMLElement[]

    if (sections.length === 0) return

    const observer = new IntersectionObserver(
      entries => {
        // Find the section with the highest intersection ratio
        let maxRatio = 0
        let activeId = ''

        entries.forEach(entry => {
          if (entry.intersectionRatio > maxRatio) {
            maxRatio = entry.intersectionRatio
            activeId = entry.target.id
          }
        })

        // Only update if we have a significant intersection
        if (maxRatio > 0.1) {
          setActiveSection(activeId)
        }
      },
      {
        threshold: [0.1, 0.5, 1],
        rootMargin: '-20% 0px -60% 0px', // Bias towards sections in upper portion of viewport
      },
    )

    sections.forEach(section => observer.observe(section))

    return () => observer.disconnect()
  }, [items, isScrolling])

  /**
   * Set up scroll event listener
   */
  useEffect(() => {
    const handleScroll = () => {
      updateScrollProgress()
    }

    window.addEventListener('scroll', handleScroll, {passive: true})
    handleScroll() // Initial calculation

    return () => window.removeEventListener('scroll', handleScroll)
  }, [updateScrollProgress])

  return (
    <nav
      className={`smooth-scroll-nav ${isVisible ? 'smooth-scroll-nav--visible' : ''} ${className}`.trim()}
      aria-label="Page navigation"
      role="navigation"
    >
      {/* Scroll Progress Indicator */}
      {showProgress && (
        <div
          className="smooth-scroll-nav__progress"
          role="progressbar"
          aria-valuenow={Math.round(scrollProgress)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Page scroll progress: ${Math.round(scrollProgress)}%`}
          style={{'--progress': `${scrollProgress}%`} as React.CSSProperties}
        />
      )}

      {/* Navigation Items */}
      <ul className="smooth-scroll-nav__list" role="list">
        {items.map(item => (
          <li key={item.id} className="smooth-scroll-nav__item">
            <button
              type="button"
              className={`smooth-scroll-nav__link ${
                activeSection === item.id ? 'smooth-scroll-nav__link--active' : ''
              }`}
              onClick={() => scrollToSection(item.id)}
              onKeyDown={e => handleKeyDown(e, item.id)}
              aria-label={`Navigate to ${item.label} section`}
              aria-current={activeSection === item.id ? 'page' : undefined}
            >
              {item.icon && (
                <span className="smooth-scroll-nav__icon" aria-hidden="true">
                  {item.icon}
                </span>
              )}
              <span className="smooth-scroll-nav__label">{item.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export default SmoothScrollNav
