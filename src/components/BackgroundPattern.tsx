import React from 'react'

/**
 * Subtle background pattern component with geometric elements
 * Provides non-distracting visual enhancement to sections
 */
interface BackgroundPatternProps {
  variant?: 'dots' | 'grid' | 'circles' | 'waves' | 'none'
  className?: string
  opacity?: number
  animated?: boolean
}

const BackgroundPattern: React.FC<BackgroundPatternProps> = ({
  variant = 'dots',
  className = '',
  opacity = 0.3,
  animated = true,
}) => {
  const baseClasses = 'background-pattern'
  const variantClasses = `background-pattern--${variant}`
  const animationClasses = animated ? 'background-pattern--animated' : ''

  const style = {
    '--pattern-opacity': opacity,
  } as React.CSSProperties

  if (variant === 'none') {
    return null
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
 * Floating geometric shapes component
 */
interface FloatingShapesProps {
  className?: string
  count?: number
  shapes?: ('circle' | 'square' | 'triangle')[]
  animated?: boolean
}

export const FloatingShapes: React.FC<FloatingShapesProps> = ({
  className = '',
  count = 6,
  shapes = ['circle', 'square', 'triangle'],
  animated = true,
}) => {
  const elements = Array.from({length: count}, (_, index) => {
    const shape = shapes[index % shapes.length]
    const size = 20 + Math.random() * 40 // Random size between 20-60px
    const delay = Math.random() * 10 // Random animation delay
    const duration = 15 + Math.random() * 10 // Random duration 15-25s

    const style = {
      '--shape-size': `${size}px`,
      '--animation-delay': `${delay}s`,
      '--animation-duration': `${duration}s`,
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
    } as React.CSSProperties

    return (
      <div
        key={index}
        className={`floating-shape floating-shape--${shape} ${animated ? 'floating-shape--animated' : ''}`}
        style={style}
      />
    )
  })

  return (
    <div className={`floating-shapes ${className}`.trim()} aria-hidden="true">
      {elements}
    </div>
  )
}

/**
 * Gradient overlay component for sections
 */
interface GradientOverlayProps {
  direction?: 'top' | 'bottom' | 'left' | 'right' | 'radial'
  colors?: string[]
  className?: string
  opacity?: number
}

export const GradientOverlay: React.FC<GradientOverlayProps> = ({
  direction = 'radial',
  colors = ['var(--color-primary)', 'var(--color-accent)'],
  className = '',
  opacity = 0.05,
}) => {
  const getGradientStyle = () => {
    const colorString = colors.join(', ')

    switch (direction) {
      case 'top':
        return `linear-gradient(to top, ${colorString})`
      case 'bottom':
        return `linear-gradient(to bottom, ${colorString})`
      case 'left':
        return `linear-gradient(to left, ${colorString})`
      case 'right':
        return `linear-gradient(to right, ${colorString})`
      case 'radial':
      default:
        return `radial-gradient(circle at center, ${colorString})`
    }
  }

  const style = {
    background: getGradientStyle(),
    opacity,
  } as React.CSSProperties

  return <div className={`gradient-overlay ${className}`.trim()} style={style} aria-hidden="true" />
}

/**
 * Section divider with subtle pattern
 */
interface SectionDividerProps {
  variant?: 'wave' | 'curve' | 'line' | 'dots'
  className?: string
  height?: number
}

export const SectionDivider: React.FC<SectionDividerProps> = ({variant = 'wave', className = '', height = 60}) => {
  const style = {
    height: `${height}px`,
  }

  const renderPattern = () => {
    switch (variant) {
      case 'wave':
        return (
          <svg viewBox="0 0 1200 120" preserveAspectRatio="none">
            <path d="M0,60 C300,20 900,100 1200,60 L1200,120 L0,120 Z" fill="var(--color-surface)" />
          </svg>
        )
      case 'curve':
        return (
          <svg viewBox="0 0 1200 120" preserveAspectRatio="none">
            <path d="M0,0 Q600,120 1200,0 L1200,120 L0,120 Z" fill="var(--color-surface)" />
          </svg>
        )
      case 'line':
        return <div className="section-divider-line" />
      case 'dots':
        return (
          <div className="section-divider-dots">
            {Array.from({length: 5}).map((_, index) => (
              <div key={index} className="section-divider-dot" />
            ))}
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div className={`section-divider section-divider--${variant} ${className}`.trim()} style={style} aria-hidden="true">
      {renderPattern()}
    </div>
  )
}

export default BackgroundPattern
