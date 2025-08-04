import {renderHook} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {useParallax} from '../../src/hooks/UseParallax'

// Mock requestAnimationFrame and cancelAnimationFrame
const mockRequestAnimationFrame = vi.fn()
const mockCancelAnimationFrame = vi.fn()

Object.defineProperty(window, 'requestAnimationFrame', {
  writable: true,
  value: mockRequestAnimationFrame,
})

Object.defineProperty(window, 'cancelAnimationFrame', {
  writable: true,
  value: mockCancelAnimationFrame,
})

// Mock matchMedia for prefers-reduced-motion detection
const mockMatchMedia = vi.fn()
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: mockMatchMedia,
})

describe('useParallax', () => {
  const mockMediaQueryList = {
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockRequestAnimationFrame.mockImplementation(callback => {
      callback()
      return 1
    })
    mockMatchMedia.mockReturnValue(mockMediaQueryList)

    // Mock getBoundingClientRect and scroll properties
    Element.prototype.getBoundingClientRect = vi.fn(() => ({
      top: 100,
      height: 200,
      bottom: 300,
      left: 0,
      right: 0,
      width: 0,
      x: 0,
      y: 100,
      toJSON: vi.fn(),
    }))

    Object.defineProperty(window, 'scrollY', {
      writable: true,
      value: 0,
    })

    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      value: 800,
    })
  })

  describe('Hook Return Value', () => {
    it('should return ref and transform properties', () => {
      const {result} = renderHook(() => useParallax())

      expect(result.current).toHaveProperty('ref')
      expect(result.current).toHaveProperty('transform')
      expect(typeof result.current.transform).toBe('string')
    })

    it('should initialize with default transform', () => {
      const {result} = renderHook(() => useParallax())

      expect(result.current.transform).toBe('translate3d(0, 0, 0)')
    })
  })

  describe('Prefers Reduced Motion', () => {
    it('should set transform to default when prefers-reduced-motion is true', () => {
      mockMatchMedia.mockReturnValue({
        ...mockMediaQueryList,
        matches: true,
      })

      const {result} = renderHook(() => useParallax({speed: 0.5}))

      expect(result.current.transform).toBe('translate3d(0, 0, 0)')
    })

    it('should work when prefers-reduced-motion is false', () => {
      mockMatchMedia.mockReturnValue({
        ...mockMediaQueryList,
        matches: false,
      })

      const {result} = renderHook(() => useParallax({speed: 0.5}))

      expect(result.current.transform).toBe('translate3d(0, 0, 0)')
    })
  })

  describe('Parallax Options', () => {
    it('should use default options when none provided', () => {
      const {result} = renderHook(() => useParallax())

      expect(result.current.transform).toBe('translate3d(0, 0, 0)')
    })

    it('should respect disabled option', () => {
      const {result} = renderHook(() => useParallax({disabled: true}))

      expect(result.current.transform).toBe('translate3d(0, 0, 0)')
    })

    it('should accept different direction options', () => {
      const {result: upResult} = renderHook(() => useParallax({direction: 'up', speed: 0.5}))
      const {result: downResult} = renderHook(() => useParallax({direction: 'down', speed: 0.5}))
      const {result: leftResult} = renderHook(() => useParallax({direction: 'left', speed: 0.5}))
      const {result: rightResult} = renderHook(() => useParallax({direction: 'right', speed: 0.5}))

      // All should start with default transform until scroll events trigger
      expect(upResult.current.transform).toBe('translate3d(0, 0, 0)')
      expect(downResult.current.transform).toBe('translate3d(0, 0, 0)')
      expect(leftResult.current.transform).toBe('translate3d(0, 0, 0)')
      expect(rightResult.current.transform).toBe('translate3d(0, 0, 0)')
    })
  })

  describe('TypeScript Generics', () => {
    it('should work with specific element types', () => {
      const {result} = renderHook(() => useParallax<HTMLDivElement>())

      expect(result.current.ref).toBeDefined()
      expect(result.current.transform).toBe('translate3d(0, 0, 0)')
    })
  })
})
