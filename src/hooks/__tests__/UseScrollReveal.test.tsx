import {act, render, screen} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {useScrollReveal, type ScrollRevealOptions} from '../UseScrollReveal'

interface MockObserverInstance {
  callback: IntersectionObserverCallback
  observe: ReturnType<typeof vi.fn>
  unobserve: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
}

let reducedMotionPreferred = false
let observerInstances: MockObserverInstance[] = []

function createMatchMediaResult(matches: boolean): MediaQueryList {
  return {
    matches,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }
}

function HookProbe({options}: {options?: ScrollRevealOptions}) {
  const {ref, isVisible} = useScrollReveal(options)

  return (
    <div>
      <section data-testid="target" ref={ref} />
      <span data-testid="visibility">{isVisible ? 'visible' : 'hidden'}</span>
    </div>
  )
}

beforeEach(() => {
  reducedMotionPreferred = false
  observerInstances = []

  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation(() => createMatchMediaResult(reducedMotionPreferred)),
  )

  const MockIntersectionObserver = class {
    callback: IntersectionObserverCallback
    observe = vi.fn()
    unobserve = vi.fn()
    disconnect = vi.fn()

    constructor(callback: IntersectionObserverCallback) {
      this.callback = callback
      observerInstances.push(this as unknown as MockObserverInstance)
    }
  }

  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useScrollReveal', () => {
  it('starts visible when reduced motion is preferred', () => {
    reducedMotionPreferred = true

    render(<HookProbe />)

    expect(screen.getByTestId('visibility').textContent).toBe('visible')
    expect(observerInstances).toHaveLength(0)
  })

  it('starts hidden when reduced motion is not preferred', () => {
    render(<HookProbe />)

    expect(screen.getByTestId('visibility').textContent).toBe('hidden')
  })

  it('becomes visible when intersection observer reports intersecting', () => {
    render(<HookProbe />)

    const target = screen.getByTestId('target')
    const observer = observerInstances[0]

    expect(observer).toBeDefined()
    expect(observer?.observe).toHaveBeenCalledWith(target)

    act(() => {
      observer?.callback([{isIntersecting: true} as IntersectionObserverEntry], {} as IntersectionObserver)
    })

    expect(screen.getByTestId('visibility').textContent).toBe('visible')
  })

  it('unobserves target after reveal when retrigger is disabled', () => {
    render(<HookProbe />)

    const target = screen.getByTestId('target')
    const observer = observerInstances[0]

    act(() => {
      observer?.callback([{isIntersecting: true} as IntersectionObserverEntry], {} as IntersectionObserver)
    })

    expect(observer?.unobserve).toHaveBeenCalledWith(target)
  })

  it('toggles visibility when retrigger is enabled', () => {
    render(<HookProbe options={{retrigger: true}} />)

    const observer = observerInstances[0]

    act(() => {
      observer?.callback([{isIntersecting: true} as IntersectionObserverEntry], {} as IntersectionObserver)
    })
    expect(screen.getByTestId('visibility').textContent).toBe('visible')

    act(() => {
      observer?.callback([{isIntersecting: false} as IntersectionObserverEntry], {} as IntersectionObserver)
    })
    expect(screen.getByTestId('visibility').textContent).toBe('hidden')
  })
})
