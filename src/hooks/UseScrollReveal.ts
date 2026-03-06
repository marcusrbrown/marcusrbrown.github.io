import {useEffect, useRef, useState} from 'react'

export interface ScrollRevealOptions {
  rootMargin?: string
  threshold?: number | number[]
  retrigger?: boolean
}

export function useScrollReveal(options: ScrollRevealOptions = {}) {
  const ref = useRef<HTMLElement | null>(null)

  const [isVisible, setIsVisible] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches
    }
    return false
  })

  const rootMargin = options.rootMargin ?? '0px 0px -50px 0px'
  const threshold = options.threshold ?? 0.1
  const retrigger = options.retrigger ?? false

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return
    }

    const observer = new IntersectionObserver(
      entries => {
        const entry = entries[0]
        if (!entry) return

        if (entry.isIntersecting) {
          setIsVisible(true)
          if (!retrigger && ref.current) {
            observer.unobserve(ref.current)
          }
        } else if (retrigger) {
          setIsVisible(false)
        }
      },
      {rootMargin, threshold},
    )

    const currentRef = ref.current
    if (currentRef) {
      observer.observe(currentRef)
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef)
      }
    }
  }, [rootMargin, threshold, retrigger])

  return {ref, isVisible}
}
