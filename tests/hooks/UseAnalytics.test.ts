import {act, render, renderHook} from '@testing-library/react'
import {createElement} from 'react'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {usePageviewTracking, useSectionTracking} from '../../src/hooks/UseAnalytics'
import {onUmamiTrackerReady, trackUmamiEvent, trackUmamiPageview} from '../../src/utils/analytics'

// Mock the analytics utility
vi.mock('../../src/utils/analytics', () => ({
  trackUmamiPageview: vi.fn(),
  trackUmamiEvent: vi.fn(),
  onUmamiTrackerReady: vi.fn(),
}))

const mockTrackUmamiEvent = vi.mocked(trackUmamiEvent)

const HOME_SECTIONS = ['hero', 'about', 'projects', 'blog'] as const
type HomeSection = (typeof HOME_SECTIONS)[number]

describe('UseAnalytics hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTrackUmamiEvent.mockReset()
  })

  describe('useSectionTracking', () => {
    const SectionFixture = ({section}: {section: HomeSection}) => {
      const ref = useSectionTracking<HTMLDivElement>(section)
      return createElement('div', {ref, 'data-testid': `section-${section}`})
    }

    const HomeFixture = () =>
      createElement(
        'div',
        null,
        ...HOME_SECTIONS.map(section => createElement(SectionFixture, {key: section, section})),
      )

    it('should return a ref object', () => {
      const {result} = renderHook(() => useSectionTracking('hero'))

      expect(result.current).toBeDefined()
      expect(result.current).toHaveProperty('current')
    })

    it('tracks each section once per Home mount, preserves observer cleanup, and tracks again on a new mount', () => {
      mockTrackUmamiEvent.mockReturnValue('sent')
      const callbacks: IntersectionObserverCallback[] = []
      const observers: MockIntersectionObserver[] = []

      class MockIntersectionObserver {
        readonly disconnect = vi.fn()
        readonly observe = vi.fn()

        constructor(callback: IntersectionObserverCallback) {
          callbacks.push(callback)
          observers.push(this)
        }
      }

      vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)

      const emitIntersection = (callback: IntersectionObserverCallback, isIntersecting: boolean) => {
        act(() => {
          callback([{isIntersecting} as IntersectionObserverEntry], {} as IntersectionObserver)
        })
      }

      const {unmount} = render(createElement(HomeFixture))
      expect(callbacks).toHaveLength(HOME_SECTIONS.length)

      callbacks.forEach(callback => {
        emitIntersection(callback, true)
        emitIntersection(callback, false)
        emitIntersection(callback, true)
      })

      expect(mockTrackUmamiEvent.mock.calls).toStrictEqual(HOME_SECTIONS.map(section => ['section_view', {section}]))
      expect(observers).toHaveLength(HOME_SECTIONS.length)

      unmount()
      observers.forEach(observer => expect(observer.disconnect).toHaveBeenCalledOnce())

      const callbacksBeforeSecondMount = callbacks.length
      render(createElement(HomeFixture))
      expect(callbacks).toHaveLength(callbacksBeforeSecondMount + HOME_SECTIONS.length)

      callbacks.slice(callbacksBeforeSecondMount).forEach(callback => emitIntersection(callback, true))

      expect(mockTrackUmamiEvent).toHaveBeenCalledTimes(HOME_SECTIONS.length * 2)
      expect(mockTrackUmamiEvent.mock.calls.slice(HOME_SECTIONS.length)).toStrictEqual(
        HOME_SECTIONS.map(section => ['section_view', {section}]),
      )
    })

    it('does not retry a section event after the adapter reports unavailable', () => {
      mockTrackUmamiEvent.mockReturnValue('unavailable')
      const callbacks: IntersectionObserverCallback[] = []

      class MockIntersectionObserver {
        readonly disconnect = vi.fn()
        readonly observe = vi.fn()

        constructor(callback: IntersectionObserverCallback) {
          callbacks.push(callback)
        }
      }

      vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)

      render(createElement(SectionFixture, {section: 'hero'}))
      const callback = callbacks[0]
      if (!callback) throw new Error('Expected section observer callback')

      act(() => {
        callback([{isIntersecting: true} as IntersectionObserverEntry], {} as IntersectionObserver)
        callback([{isIntersecting: false} as IntersectionObserverEntry], {} as IntersectionObserver)
        callback([{isIntersecting: true} as IntersectionObserverEntry], {} as IntersectionObserver)
      })

      expect(mockTrackUmamiEvent).toHaveBeenCalledExactlyOnceWith('section_view', {section: 'hero'})
    })
  })

  describe('usePageviewTracking', () => {
    const mockTrackUmamiPageview = vi.mocked(trackUmamiPageview)
    const mockOnUmamiTrackerReady = vi.mocked(onUmamiTrackerReady)

    beforeEach(() => {
      mockTrackUmamiPageview.mockReset()
      mockOnUmamiTrackerReady.mockReset()
    })

    it('sends one normalized pageview for the initial pathname when the tracker is ready', () => {
      mockTrackUmamiPageview.mockReturnValue('sent')
      renderHook(({pathname}) => usePageviewTracking(pathname), {initialProps: {pathname: '/'}})

      expect(mockTrackUmamiPageview).toHaveBeenCalledTimes(1)
      expect(mockTrackUmamiPageview).toHaveBeenCalledWith('/')
    })

    it('sends one pageview per real pathname change (link/replace/back/forward all look the same to the hook)', () => {
      mockTrackUmamiPageview.mockReturnValue('sent')
      const {rerender} = renderHook(({pathname}) => usePageviewTracking(pathname), {
        initialProps: {pathname: '/'},
      })

      rerender({pathname: '/about'})
      rerender({pathname: '/projects'})

      expect(mockTrackUmamiPageview.mock.calls.map(call => call[0])).toStrictEqual(['/', '/about', '/projects'])
    })

    it('does not emit a duplicate pageview for a same-path rerender', () => {
      mockTrackUmamiPageview.mockReturnValue('sent')
      const {rerender} = renderHook(({pathname}) => usePageviewTracking(pathname), {
        initialProps: {pathname: '/about'},
      })

      rerender({pathname: '/about'})
      rerender({pathname: '/about'})

      expect(mockTrackUmamiPageview).toHaveBeenCalledTimes(1)
    })

    it('emits again for /about -> /projects -> /about (a real return to a previously visited path)', () => {
      mockTrackUmamiPageview.mockReturnValue('sent')
      const {rerender} = renderHook(({pathname}) => usePageviewTracking(pathname), {
        initialProps: {pathname: '/about'},
      })

      rerender({pathname: '/projects'})
      rerender({pathname: '/about'})

      expect(mockTrackUmamiPageview.mock.calls.map(call => call[0])).toStrictEqual(['/about', '/projects', '/about'])
    })

    it('retains only the latest pending pathname and does not register readiness twice while unavailable', () => {
      mockTrackUmamiPageview.mockReturnValue('unavailable')
      const {rerender} = renderHook(({pathname}) => usePageviewTracking(pathname), {
        initialProps: {pathname: '/about'},
      })

      rerender({pathname: '/projects'})
      rerender({pathname: '/blog'})

      // Every navigation attempted a send (each reported unavailable), but readiness
      // was registered only once — the hook does not create a persistent queue.
      expect(mockTrackUmamiPageview.mock.calls.map(call => call[0])).toStrictEqual(['/about', '/projects', '/blog'])
      expect(mockOnUmamiTrackerReady).toHaveBeenCalledTimes(1)
    })

    it('flushes only the latest pending pathname once the tracker becomes ready', () => {
      mockTrackUmamiPageview.mockReturnValue('unavailable')
      let readyCallback: (() => void) | undefined
      mockOnUmamiTrackerReady.mockImplementation(cb => {
        readyCallback = cb
      })

      const {rerender} = renderHook(({pathname}) => usePageviewTracking(pathname), {
        initialProps: {pathname: '/about'},
      })
      rerender({pathname: '/projects'})
      rerender({pathname: '/blog'})

      mockTrackUmamiPageview.mockClear()
      mockTrackUmamiPageview.mockReturnValue('sent')
      expect(readyCallback).toBeDefined()
      act(() => {
        readyCallback?.()
      })

      expect(mockTrackUmamiPageview).toHaveBeenCalledTimes(1)
      expect(mockTrackUmamiPageview).toHaveBeenCalledWith('/blog')
    })

    it('does not flush again if the ready callback fires more than once', () => {
      mockTrackUmamiPageview.mockReturnValue('unavailable')
      let readyCallback: (() => void) | undefined
      mockOnUmamiTrackerReady.mockImplementation(cb => {
        readyCallback = cb
      })

      renderHook(({pathname}) => usePageviewTracking(pathname), {initialProps: {pathname: '/about'}})

      mockTrackUmamiPageview.mockClear()
      mockTrackUmamiPageview.mockReturnValue('sent')
      act(() => {
        readyCallback?.()
        readyCallback?.()
      })

      // Multiple readiness firings must not duplicate the flush.
      expect(mockTrackUmamiPageview).toHaveBeenCalledTimes(1)
    })

    it('sends later routes immediately once the tracker is ready, without re-sending a stale pending route', () => {
      mockTrackUmamiPageview.mockReturnValueOnce('unavailable')
      let readyCallback: (() => void) | undefined
      mockOnUmamiTrackerReady.mockImplementation(cb => {
        readyCallback = cb
      })

      const {rerender} = renderHook(({pathname}) => usePageviewTracking(pathname), {
        initialProps: {pathname: '/about'},
      })

      mockTrackUmamiPageview.mockReturnValue('sent')
      act(() => {
        readyCallback?.()
      })
      mockTrackUmamiPageview.mockClear()

      rerender({pathname: '/projects'})
      expect(mockTrackUmamiPageview).toHaveBeenCalledTimes(1)
      expect(mockTrackUmamiPageview).toHaveBeenCalledWith('/projects')
    })

    it('drops navigation under DNT without registering a readiness retry', () => {
      mockTrackUmamiPageview.mockReturnValue('dropped-by-policy')
      const {rerender} = renderHook(({pathname}) => usePageviewTracking(pathname), {
        initialProps: {pathname: '/about'},
      })
      rerender({pathname: '/projects'})

      expect(mockTrackUmamiPageview).toHaveBeenCalledTimes(2)
      expect(mockOnUmamiTrackerReady).not.toHaveBeenCalled()
    })

    it('does not throw when trackUmamiPageview itself throws (defensive; adapter never throws in practice)', () => {
      mockTrackUmamiPageview.mockImplementation(() => {
        throw new Error('boom')
      })
      expect(() =>
        renderHook(({pathname}) => usePageviewTracking(pathname), {initialProps: {pathname: '/about'}}),
      ).not.toThrow()
    })

    it('retains the pending route when a readiness retry itself is still unavailable, then re-registers and flushes only the latest route on the next opportunity', () => {
      mockTrackUmamiPageview.mockReturnValue('unavailable')
      const readyCallbacks: (() => void)[] = []
      mockOnUmamiTrackerReady.mockImplementation(cb => readyCallbacks.push(cb))

      const {rerender} = renderHook(({pathname}) => usePageviewTracking(pathname), {
        initialProps: {pathname: '/about'},
      })
      expect(mockOnUmamiTrackerReady).toHaveBeenCalledTimes(1)

      act(() => readyCallbacks[0]?.())

      // The retry itself was still unavailable — registration must free up for
      // a later opportunity rather than being exhausted for the component's lifetime.
      rerender({pathname: '/projects'})
      expect(mockOnUmamiTrackerReady).toHaveBeenCalledTimes(2)

      mockTrackUmamiPageview.mockClear()
      mockTrackUmamiPageview.mockReturnValue('sent')
      act(() => readyCallbacks[1]?.())

      // Only the latest pending route flushes — /about was superseded by /projects,
      // not silently lost and not resurrected.
      expect(mockTrackUmamiPageview).toHaveBeenCalledTimes(1)
      expect(mockTrackUmamiPageview).toHaveBeenCalledWith('/projects')
    })

    it('terminates without recursion when onUmamiTrackerReady invokes its callback synchronously and the tracker stays unavailable', () => {
      mockTrackUmamiPageview.mockReturnValue('unavailable')
      mockOnUmamiTrackerReady.mockImplementation(cb => cb())

      expect(() =>
        renderHook(({pathname}) => usePageviewTracking(pathname), {initialProps: {pathname: '/about'}}),
      ).not.toThrow()

      // The initial attempt plus exactly one synchronous retry — not unbounded recursion.
      expect(mockTrackUmamiPageview).toHaveBeenCalledTimes(2)
      expect(mockOnUmamiTrackerReady).toHaveBeenCalledTimes(1)
    })

    it('retries the pending route once when readiness fires synchronously, then retries again on the next real navigation', () => {
      mockTrackUmamiPageview.mockReturnValue('unavailable')
      mockOnUmamiTrackerReady.mockImplementation(cb => cb())

      const {rerender} = renderHook(({pathname}) => usePageviewTracking(pathname), {
        initialProps: {pathname: '/about'},
      })
      expect(mockOnUmamiTrackerReady).toHaveBeenCalledTimes(1)

      mockTrackUmamiPageview.mockClear()
      mockTrackUmamiPageview.mockReturnValue('sent')
      rerender({pathname: '/projects'})

      // Only /projects sends — the earlier /about retry outcome must not resurrect a stale send.
      expect(mockTrackUmamiPageview).toHaveBeenCalledTimes(1)
      expect(mockTrackUmamiPageview).toHaveBeenCalledWith('/projects')
      expect(mockOnUmamiTrackerReady).toHaveBeenCalledTimes(1)
    })

    it('allows a later unavailable streak to register readiness again after a successful flush', () => {
      mockTrackUmamiPageview.mockReturnValueOnce('unavailable')
      let readyCallback: (() => void) | undefined
      mockOnUmamiTrackerReady.mockImplementation(cb => {
        readyCallback = cb
      })

      const {rerender} = renderHook(({pathname}) => usePageviewTracking(pathname), {
        initialProps: {pathname: '/about'},
      })
      expect(mockOnUmamiTrackerReady).toHaveBeenCalledTimes(1)

      mockTrackUmamiPageview.mockReturnValue('sent')
      act(() => readyCallback?.())

      mockTrackUmamiPageview.mockReturnValue('unavailable')
      rerender({pathname: '/projects'})
      expect(mockOnUmamiTrackerReady).toHaveBeenCalledTimes(2)
    })
  })
})
