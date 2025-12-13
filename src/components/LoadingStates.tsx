import React from 'react'

/**
 * Reusable skeleton component for creating loading placeholders
 */
interface SkeletonProps {
  width?: string | number
  height?: string | number
  className?: string
  variant?: 'rectangular' | 'circular' | 'text'
  animation?: 'pulse' | 'wave' | 'none'
}

const Skeleton: React.FC<SkeletonProps> = ({
  width = '100%',
  height = '1rem',
  className = '',
  variant = 'rectangular',
  animation = 'pulse',
}) => {
  const baseClasses = 'skeleton-base'
  const variantClasses = `skeleton--${variant}`
  const animationClasses = animation === 'none' ? '' : `skeleton--${animation}`

  const style = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
  }

  return (
    <div
      className={`${baseClasses} ${variantClasses} ${animationClasses} ${className}`.trim()}
      style={style}
      aria-hidden="true"
    />
  )
}

/**
 * Project Card Skeleton for loading state
 */
export const ProjectCardSkeleton: React.FC = () => {
  return (
    <div className="project-card project-card--skeleton" aria-hidden="true">
      <div className="project-card__image-container">
        <Skeleton height={200} variant="rectangular" />
      </div>
      <div className="project-card__content">
        <div className="project-card__header">
          <Skeleton width="70%" height="1.5rem" className="mb-2" />
          <Skeleton width="100%" height="1rem" />
          <Skeleton width="80%" height="1rem" className="mt-1" />
        </div>
        <div className="project-card__meta mt-3">
          <div className="project-card__language">
            <Skeleton width={60} height="1.5rem" variant="rectangular" />
          </div>
          <div className="project-card__stars">
            <Skeleton width={40} height="1rem" />
          </div>
        </div>
        <div className="project-card__actions mt-4">
          <Skeleton width={80} height="2rem" variant="rectangular" />
          <Skeleton width={60} height="2rem" variant="rectangular" />
        </div>
      </div>
    </div>
  )
}

/**
 * Skills Category Skeleton for loading state
 */
export const SkillCategorySkeleton: React.FC = () => {
  return (
    <div className="skill-category skill-category--skeleton" aria-hidden="true">
      <div className="skill-category-header">
        <Skeleton width={48} height={48} variant="rectangular" />
        <div className="skill-category-info">
          <Skeleton width="60%" height="1.25rem" className="mb-1" />
          <Skeleton width="90%" height="0.875rem" />
        </div>
      </div>
      <div className="skill-list">
        {Array.from({length: 4}).map((_, index) => (
          <div key={`skill-skeleton-${index}`} className="skill-item skill-item--skeleton">
            <div className="skill-content">
              <Skeleton width={32} height={32} variant="rectangular" />
              <div className="skill-info">
                <Skeleton width="70%" height="0.875rem" className="mb-1" />
                <Skeleton width="90%" height="0.75rem" />
              </div>
              <div className="skill-proficiency">
                <Skeleton width="100%" height="6px" variant="rectangular" />
                <Skeleton width="40%" height="0.75rem" className="mt-1" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Blog Post Skeleton for loading state
 */
export const BlogPostSkeleton: React.FC = () => {
  return (
    <article className="blog-post blog-post--skeleton" aria-hidden="true">
      <div className="blog-post__content">
        <div className="blog-post__meta">
          <Skeleton width={80} height="0.875rem" />
          <Skeleton width={60} height="0.875rem" />
        </div>
        <Skeleton width="85%" height="1.5rem" className="mb-2" />
        <Skeleton width="100%" height="1rem" />
        <Skeleton width="95%" height="1rem" className="mt-1" />
        <Skeleton width="70%" height="1rem" className="mt-1" />
        <div className="blog-post__footer mt-3">
          <Skeleton width={100} height="1.75rem" variant="rectangular" />
        </div>
      </div>
    </article>
  )
}

/**
 * Hero Section Content Skeleton
 */
export const HeroSkeleton: React.FC = () => {
  return (
    <div className="hero-content hero-content--skeleton" aria-hidden="true">
      <Skeleton width="90%" height="3rem" className="mb-4" />
      <Skeleton width="100%" height="1.25rem" className="mb-2" />
      <Skeleton width="80%" height="1.25rem" className="mb-6" />
      <div className="hero-cta">
        <Skeleton width={140} height="3rem" variant="rectangular" className="mr-4" />
        <Skeleton width={120} height="3rem" variant="rectangular" />
      </div>
    </div>
  )
}

/**
 * About Section Timeline Skeleton
 */
export const TimelineSkeleton: React.FC = () => {
  return (
    <div className="career-timeline career-timeline--skeleton" aria-hidden="true">
      <div className="timeline-list">
        {Array.from({length: 3}).map((_, index) => (
          <div key={`timeline-skeleton-${index}`} className="timeline-item timeline-item--skeleton">
            <div className="timeline-marker">
              <Skeleton width={12} height={12} variant="circular" />
            </div>
            <div className="timeline-content">
              <div className="timeline-header">
                <Skeleton width="50%" height="1.125rem" className="mb-1" />
                <Skeleton width="70%" height="0.875rem" className="mb-2" />
                <Skeleton width="30%" height="0.75rem" />
              </div>
              <div className="timeline-details">
                <Skeleton width="100%" height="0.875rem" />
                <Skeleton width="90%" height="0.875rem" className="mt-1" />
                <Skeleton width="85%" height="0.875rem" className="mt-1" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Contact Methods Skeleton for loading state
 */
export const ContactMethodsSkeleton: React.FC = () => {
  return (
    <div className="contact-methods contact-methods--skeleton" aria-hidden="true">
      <div className="contact-methods-grid contact-methods-grid--primary">
        {Array.from({length: 2}).map((_, index) => (
          <div key={`contact-primary-skeleton-${index}`} className="contact-method-card contact-method-card--skeleton">
            <div className="contact-method-link">
              <Skeleton width={48} height={48} variant="rectangular" />
              <div className="contact-method-content">
                <Skeleton width="60%" height="1.25rem" className="mb-2" />
                <Skeleton width="90%" height="0.9375rem" />
              </div>
              <Skeleton width={24} height={24} variant="rectangular" />
            </div>
          </div>
        ))}
      </div>
      <div className="contact-methods-grid contact-methods-grid--secondary">
        {Array.from({length: 4}).map((_, index) => (
          <div
            key={`contact-secondary-skeleton-${index}`}
            className="contact-method-card contact-method-card--skeleton"
          >
            <div className="contact-method-link">
              <Skeleton width={48} height={48} variant="rectangular" />
              <div className="contact-method-content">
                <Skeleton width="70%" height="1.25rem" className="mb-2" />
                <Skeleton width="85%" height="0.9375rem" />
              </div>
              <Skeleton width={24} height={24} variant="rectangular" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Loading State Container with optional error handling
 */
interface LoadingStateProps {
  loading: boolean
  error?: string | null
  skeleton: React.ReactNode
  children: React.ReactNode
  retryAction?: () => void
  className?: string
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  loading,
  error,
  skeleton,
  children,
  retryAction,
  className = '',
}) => {
  if (error) {
    return (
      <div className={`loading-error ${className}`.trim()}>
        <div className="loading-error__content">
          <div className="loading-error__icon" aria-hidden="true">
            <span className="icon icon-alert-circle" />
          </div>
          <h3 className="loading-error__title">Unable to load content</h3>
          <p className="loading-error__message">{error}</p>
          {retryAction && (
            <button className="btn btn--secondary btn--small" onClick={retryAction} type="button">
              Try Again
            </button>
          )}
        </div>
      </div>
    )
  }

  return loading ? <>{skeleton}</> : <>{children}</>
}

// Export the individual skeleton components and loading utilities
export default LoadingState
export {Skeleton}
