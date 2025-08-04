import React, {useEffect, useState} from 'react'
import {useScrollAnimation} from '../hooks/UseScrollAnimation'
import {easingFunctions} from '../utils/animation-utils'

/**
 * Professional statistic for animated counter display
 */
interface Statistic {
  id: string
  value: number
  label: string
  suffix?: string
  prefix?: string
  /** Animation duration in milliseconds */
  duration?: number
}

/**
 * Configuration for animated counter behavior
 */
interface AnimatedCounterProps {
  statistic: Statistic
  /** Whether animation should start */
  shouldAnimate: boolean
  /** Delay before animation starts (ms) */
  delay?: number
}

/**
 * Individual animated counter component
 */
const AnimatedCounter: React.FC<AnimatedCounterProps> = ({statistic, shouldAnimate, delay = 0}) => {
  const [currentValue, setCurrentValue] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false)

  useEffect(() => {
    if (!shouldAnimate || isAnimating) return

    const startAnimation = () => {
      setIsAnimating(true)
      const startTime = Date.now()
      const duration = statistic.duration || 2000
      const startValue = 0
      const endValue = statistic.value

      const animate = () => {
        const elapsed = Date.now() - startTime
        const progress = Math.min(elapsed / duration, 1)

        // Use easeOutQuart for smooth deceleration
        const easedProgress = easingFunctions.easeOutQuart(progress)
        const value = Math.round(startValue + (endValue - startValue) * easedProgress)

        setCurrentValue(value)

        if (progress < 1) {
          requestAnimationFrame(animate)
        } else {
          setIsAnimating(false)
        }
      }

      requestAnimationFrame(animate)
    }

    if (delay > 0) {
      const timer = setTimeout(startAnimation, delay)
      return () => clearTimeout(timer)
    } else {
      startAnimation()
      return undefined
    }
  }, [shouldAnimate, statistic.value, statistic.duration, delay, isAnimating])

  const formattedValue = currentValue.toLocaleString()

  return (
    <div className="animated-counter">
      <div className="animated-counter-value">
        {statistic.prefix && <span className="animated-counter-prefix">{statistic.prefix}</span>}
        <span className="animated-counter-number" data-target={statistic.value} aria-live="polite">
          {formattedValue}
        </span>
        {statistic.suffix && <span className="animated-counter-suffix">{statistic.suffix}</span>}
      </div>
      <div className="animated-counter-label">{statistic.label}</div>
    </div>
  )
}

/**
 * Professional statistics data
 */
const professionalStats: Statistic[] = [
  {
    id: 'experience',
    value: 10,
    label: 'Years Experience',
    suffix: '+',
    duration: 2200,
  },
  {
    id: 'projects',
    value: 50,
    label: 'Projects Completed',
    suffix: '+',
    duration: 1800,
  },
  {
    id: 'repositories',
    value: 125,
    label: 'GitHub Repositories',
    suffix: '+',
    duration: 2500,
  },
  {
    id: 'languages',
    value: 15,
    label: 'Programming Languages',
    suffix: '+',
    duration: 1500,
  },
  {
    id: 'contributions',
    value: 2500,
    label: 'Open Source Contributions',
    suffix: '+',
    duration: 3000,
  },
  {
    id: 'certifications',
    value: 8,
    label: 'Technical Certifications',
    duration: 1200,
  },
]

/**
 * Animated counters showcasing professional statistics
 */
const AnimatedCounters: React.FC = () => {
  const {ref, animationState} = useScrollAnimation<HTMLDivElement>({
    threshold: 0.5,
    triggerOnce: true,
  })

  const shouldAnimate = animationState === 'visible' || animationState === 'entering'

  return (
    <div
      ref={ref}
      className={`animated-counters animate--${animationState}`}
      role="region"
      aria-label="Professional statistics"
    >
      <div className="animated-counters-grid">
        {professionalStats.map((stat, index) => (
          <AnimatedCounter
            key={stat.id}
            statistic={stat}
            shouldAnimate={shouldAnimate}
            delay={index * 150} // Staggered animation
          />
        ))}
      </div>
    </div>
  )
}

export default AnimatedCounters
