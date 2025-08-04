import {useEffect, useRef, useState} from 'react'

interface ParallaxOptions {
  speed?: number // Parallax speed multiplier (0.1 = subtle, 1.0 = fast)
  direction?: 'up' | 'down' | 'left' | 'right'
  disabled?: boolean // Allow disabling for reduced motion
}

interface ParallaxReturn<T extends HTMLElement = HTMLElement> {
  ref: React.RefObject<T>
  transform: string
}

/**
 * Custom hook for parallax scrolling effects
 *
 * Applies smooth parallax movement to elements based on scroll position.
 * Respects user's prefers-reduced-motion setting and provides performance
 * optimizations using transform3d and requestAnimationFrame.
 */
export const useParallax = <T extends HTMLElement>(options: ParallaxOptions = {}): ParallaxReturn<T> => {
  const {speed = 0.5, direction = 'up', disabled = false} = options

  const ref = useRef<T>(null)
  const [transform, setTransform] = useState('translate3d(0, 0, 0)')
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  useEffect(() => {
    // Check for prefers-reduced-motion
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPrefersReducedMotion(mediaQuery.matches)

    const handleMediaQueryChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches)
    }

    mediaQuery.addEventListener('change', handleMediaQueryChange)
    return () => mediaQuery.removeEventListener('change', handleMediaQueryChange)
  }, [])

  useEffect(() => {
    if (disabled || prefersReducedMotion || !ref.current) {
      setTransform('translate3d(0, 0, 0)')
      return
    }

    let animationId: number

    const handleScroll = () => {
      if (!ref.current) return

      const rect = ref.current.getBoundingClientRect()
      const elementTop = rect.top + window.scrollY
      const elementHeight = rect.height
      const windowHeight = window.innerHeight
      const scrollTop = window.scrollY

      // Calculate how much of the element is in view
      const elementCenter = elementTop + elementHeight / 2
      const windowCenter = scrollTop + windowHeight / 2
      const distanceFromCenter = windowCenter - elementCenter

      // Calculate parallax offset based on distance and speed
      const parallaxOffset = distanceFromCenter * speed

      // Apply direction-based transform
      let transformValue = 'translate3d(0, 0, 0)'
      switch (direction) {
        case 'up':
          transformValue = `translate3d(0, ${-parallaxOffset}px, 0)`
          break
        case 'down':
          transformValue = `translate3d(0, ${parallaxOffset}px, 0)`
          break
        case 'left':
          transformValue = `translate3d(${-parallaxOffset}px, 0, 0)`
          break
        case 'right':
          transformValue = `translate3d(${parallaxOffset}px, 0, 0)`
          break
      }

      setTransform(transformValue)
    }

    const throttledScroll = () => {
      cancelAnimationFrame(animationId)
      animationId = requestAnimationFrame(handleScroll)
    }

    // Initial calculation
    handleScroll()

    // Add scroll listener with throttling
    window.addEventListener('scroll', throttledScroll, {passive: true})

    return () => {
      window.removeEventListener('scroll', throttledScroll)
      cancelAnimationFrame(animationId)
    }
  }, [speed, direction, disabled, prefersReducedMotion])

  return {ref: ref as React.RefObject<T>, transform}
}
