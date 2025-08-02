import {useEffect, useRef, useState} from 'react'

interface UseProgressiveImageOptions {
  lowQualityPlaceholder?: string
  threshold?: number
  rootMargin?: string
}

interface UseProgressiveImageReturn {
  imgRef: React.RefObject<HTMLImageElement | null>
  isLoaded: boolean
  isError: boolean
  isInView: boolean
}

/**
 * Custom hook for progressive image loading with blur-to-sharp transition
 * Uses Intersection Observer for performance optimization
 */
export const useProgressiveImage = (
  src?: string,
  options: UseProgressiveImageOptions = {},
): UseProgressiveImageReturn => {
  const {threshold = 0.1, rootMargin = '50px'} = options

  const [isLoaded, setIsLoaded] = useState(false)
  const [isError, setIsError] = useState(false)
  const [isInView, setIsInView] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    const img = imgRef.current
    if (!img || !src) return

    // Create intersection observer to detect when image enters viewport
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            setIsInView(true)
            observer.unobserve(entry.target)
          }
        })
      },
      {
        threshold,
        rootMargin,
      },
    )

    observer.observe(img)

    return () => {
      observer.disconnect()
    }
  }, [src, threshold, rootMargin])

  useEffect(() => {
    if (!src || !isInView) return

    // Load the high-quality image
    const image = new Image()

    const handleLoad = () => {
      setIsLoaded(true)
      setIsError(false)
    }

    const handleError = () => {
      setIsError(true)
      setIsLoaded(false)
    }

    image.addEventListener('load', handleLoad)
    image.addEventListener('error', handleError)

    image.src = src

    return () => {
      image.removeEventListener('load', handleLoad)
      image.removeEventListener('error', handleError)
    }
  }, [src, isInView])

  return {
    imgRef,
    isLoaded,
    isError,
    isInView,
  }
}
