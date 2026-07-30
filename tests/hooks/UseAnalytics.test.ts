import {act, renderHook} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {
  useAnalyticsTracking,
  useContactTracking,
  useDownloadTracking,
  useErrorTracking,
  useNavigationTracking,
  usePageviewTracking,
  usePerformanceTracking,
  useProjectTracking,
  useSearchTracking,
  useSectionTracking,
  useSkillTracking,
  useThemeTracking,
} from '../../src/hooks/UseAnalytics'
import {analytics, onUmamiTrackerReady, trackUmamiPageview} from '../../src/utils/analytics'

// Mock the analytics utility
vi.mock('../../src/utils/analytics', () => ({
  analytics: {
    track: vi.fn(),
    trackContactClick: vi.fn(),
    trackExternalLink: vi.fn(),
    trackProjectInteraction: vi.fn(),
    trackSkillInteraction: vi.fn(),
    trackNavigation: vi.fn(),
    trackThemeChange: vi.fn(),
    trackError: vi.fn(),
    trackSearch: vi.fn(),
    trackDownload: vi.fn(),
    trackSectionView: vi.fn(),
  },
  trackUmamiPageview: vi.fn(),
  onUmamiTrackerReady: vi.fn(),
}))

describe('UseAnalytics hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('useContactTracking', () => {
    it('should provide trackContactClick function', () => {
      const {result} = renderHook(() => useContactTracking())
      expect(typeof result.current.trackContactClick).toBe('function')
    })

    it('should call analytics.trackContactClick when trackContactClick is called', () => {
      const {result} = renderHook(() => useContactTracking())

      act(() => {
        result.current.trackContactClick('email', 'contact-form')
      })

      expect(analytics.trackContactClick).toHaveBeenCalledWith('email', 'contact-form')
    })

    it('should provide trackExternalLink function', () => {
      const {result} = renderHook(() => useContactTracking())
      expect(typeof result.current.trackExternalLink).toBe('function')
    })

    it('should call analytics.trackExternalLink when trackExternalLink is called', () => {
      const {result} = renderHook(() => useContactTracking())

      act(() => {
        result.current.trackExternalLink('https://github.com', 'contact')
      })

      expect(analytics.trackExternalLink).toHaveBeenCalledWith('https://github.com', 'contact')
    })
  })

  describe('useProjectTracking', () => {
    it('should provide all project tracking functions', () => {
      const {result} = renderHook(() => useProjectTracking())
      expect(typeof result.current.trackProjectView).toBe('function')
      expect(typeof result.current.trackProjectClick).toBe('function')
      expect(typeof result.current.trackProjectHover).toBe('function')
      expect(typeof result.current.trackProjectModal).toBe('function')
    })

    it('should call analytics for trackProjectClick', () => {
      const {result} = renderHook(() => useProjectTracking())

      act(() => {
        result.current.trackProjectClick('proj-1', 'gallery')
      })

      expect(analytics.trackProjectInteraction).toHaveBeenCalledWith('click', 'proj-1', 'gallery')
    })

    it('should call analytics for trackProjectView', () => {
      const {result} = renderHook(() => useProjectTracking())

      act(() => {
        result.current.trackProjectView('proj-1')
      })

      expect(analytics.trackProjectInteraction).toHaveBeenCalledWith('view', 'proj-1', 'gallery')
    })

    it('should call analytics for trackProjectHover', () => {
      const {result} = renderHook(() => useProjectTracking())

      act(() => {
        result.current.trackProjectHover('proj-1')
      })

      expect(analytics.trackProjectInteraction).toHaveBeenCalledWith('hover', 'proj-1', 'gallery')
    })

    it('should call analytics for trackProjectModal', () => {
      const {result} = renderHook(() => useProjectTracking())

      act(() => {
        result.current.trackProjectModal('open', 'proj-1')
      })

      expect(analytics.trackProjectInteraction).toHaveBeenCalledWith('open', 'proj-1', 'modal')
    })
  })

  describe('useSkillTracking', () => {
    it('should provide all skill tracking functions', () => {
      const {result} = renderHook(() => useSkillTracking())
      expect(typeof result.current.trackSkillHover).toBe('function')
      expect(typeof result.current.trackSkillClick).toBe('function')
      expect(typeof result.current.trackSkillView).toBe('function')
    })

    it('should call analytics for trackSkillHover', () => {
      const {result} = renderHook(() => useSkillTracking())

      act(() => {
        result.current.trackSkillHover('TypeScript', 'languages')
      })

      expect(analytics.trackSkillInteraction).toHaveBeenCalledWith('hover', 'TypeScript', 'languages')
    })

    it('should call analytics for trackSkillClick', () => {
      const {result} = renderHook(() => useSkillTracking())

      act(() => {
        result.current.trackSkillClick('React')
      })

      expect(analytics.trackSkillInteraction).toHaveBeenCalledWith('click', 'React', undefined)
    })

    it('should call analytics for trackSkillView', () => {
      const {result} = renderHook(() => useSkillTracking())

      act(() => {
        result.current.trackSkillView('Node.js', 'backend')
      })

      expect(analytics.trackSkillInteraction).toHaveBeenCalledWith('view', 'Node.js', 'backend')
    })
  })

  describe('useNavigationTracking', () => {
    it('should provide navigation tracking functions', () => {
      const {result} = renderHook(() => useNavigationTracking())
      expect(typeof result.current.trackNavigation).toBe('function')
      expect(typeof result.current.trackScrollToSection).toBe('function')
    })

    it('should call analytics for trackNavigation', () => {
      const {result} = renderHook(() => useNavigationTracking())

      act(() => {
        result.current.trackNavigation('projects', 'click')
      })

      expect(analytics.trackNavigation).toHaveBeenCalledWith('projects', 'click')
    })

    it('should call analytics for trackScrollToSection', () => {
      const {result} = renderHook(() => useNavigationTracking())

      act(() => {
        result.current.trackScrollToSection('about')
      })

      expect(analytics.trackNavigation).toHaveBeenCalledWith('about', 'scroll')
    })
  })

  describe('useThemeTracking', () => {
    it('should provide theme tracking functions', () => {
      const {result} = renderHook(() => useThemeTracking())
      expect(typeof result.current.trackThemeChange).toBe('function')
      expect(typeof result.current.trackThemeToggle).toBe('function')
    })

    it('should call analytics for trackThemeChange', () => {
      const {result} = renderHook(() => useThemeTracking())

      act(() => {
        result.current.trackThemeChange('light', 'dark')
      })

      expect(analytics.trackThemeChange).toHaveBeenCalledWith('light', 'dark')
    })

    it('should call analytics.track for trackThemeToggle', () => {
      const {result} = renderHook(() => useThemeTracking())

      act(() => {
        result.current.trackThemeToggle('dark')
      })

      expect(analytics.track).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'Theme',
          action: 'toggle',
          label: 'dark',
        }),
      )
    })
  })

  describe('useErrorTracking', () => {
    it('should provide error tracking functions', () => {
      const {result} = renderHook(() => useErrorTracking())
      expect(typeof result.current.trackError).toBe('function')
      expect(typeof result.current.trackApiError).toBe('function')
    })

    it('should call analytics.trackError for trackError', () => {
      const {result} = renderHook(() => useErrorTracking())

      act(() => {
        result.current.trackError('Something failed', 'useGitHub')
      })

      expect(analytics.trackError).toHaveBeenCalledWith('Something failed', 'useGitHub')
    })

    it('should call analytics.trackError for trackApiError', () => {
      const {result} = renderHook(() => useErrorTracking())

      act(() => {
        result.current.trackApiError('/api/repos', '404 Not Found')
      })

      expect(analytics.trackError).toHaveBeenCalledWith('API: 404 Not Found', '/api/repos')
    })
  })

  describe('useSearchTracking', () => {
    it('should provide search tracking functions', () => {
      const {result} = renderHook(() => useSearchTracking())
      expect(typeof result.current.trackSearch).toBe('function')
      expect(typeof result.current.trackSearchFilter).toBe('function')
    })

    it('should call analytics.trackSearch', () => {
      const {result} = renderHook(() => useSearchTracking())

      act(() => {
        result.current.trackSearch('react', 5)
      })

      expect(analytics.trackSearch).toHaveBeenCalledWith('react', 5)
    })

    it('should call analytics.track for trackSearchFilter', () => {
      const {result} = renderHook(() => useSearchTracking())

      act(() => {
        result.current.trackSearchFilter('language', 'TypeScript')
      })

      expect(analytics.track).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'Search',
          action: 'filter',
          label: 'language:TypeScript',
        }),
      )
    })
  })

  describe('usePerformanceTracking', () => {
    it('should provide performance tracking functions', () => {
      const {result} = renderHook(() => usePerformanceTracking())
      expect(typeof result.current.trackPageLoad).toBe('function')
      expect(typeof result.current.trackImageLoad).toBe('function')
      expect(typeof result.current.trackAnimation).toBe('function')
    })

    it('should call analytics.track for trackPageLoad', () => {
      const {result} = renderHook(() => usePerformanceTracking())

      act(() => {
        result.current.trackPageLoad(1500.7)
      })

      expect(analytics.track).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'Performance',
          action: 'page_load',
          value: 1501,
        }),
      )
    })

    it('should call analytics.track for trackImageLoad', () => {
      const {result} = renderHook(() => usePerformanceTracking())

      act(() => {
        result.current.trackImageLoad('hero.jpg', 200.5)
      })

      expect(analytics.track).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'Performance',
          action: 'image_load',
          label: 'hero.jpg',
          value: 201,
        }),
      )
    })

    it('should call analytics.track for trackAnimation', () => {
      const {result} = renderHook(() => usePerformanceTracking())

      act(() => {
        result.current.trackAnimation('slide-in', 300.2)
      })

      expect(analytics.track).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'Performance',
          action: 'animation',
          label: 'slide-in',
          value: 300,
        }),
      )
    })
  })

  describe('useDownloadTracking', () => {
    it('should provide download tracking functions', () => {
      const {result} = renderHook(() => useDownloadTracking())
      expect(typeof result.current.trackDownload).toBe('function')
      expect(typeof result.current.trackResumeDownload).toBe('function')
    })

    it('should call analytics.trackDownload for trackDownload', () => {
      const {result} = renderHook(() => useDownloadTracking())

      act(() => {
        result.current.trackDownload('resume.pdf', 'hero')
      })

      expect(analytics.trackDownload).toHaveBeenCalledWith('resume.pdf', 'hero')
    })

    it('should call analytics.trackDownload for trackResumeDownload', () => {
      const {result} = renderHook(() => useDownloadTracking())

      act(() => {
        result.current.trackResumeDownload('pdf')
      })

      expect(analytics.trackDownload).toHaveBeenCalledWith('resume.pdf', 'resume_section')
    })
  })

  describe('useAnalyticsTracking', () => {
    it('should combine all tracking functions', () => {
      const {result} = renderHook(() => useAnalyticsTracking())

      // Contact
      expect(typeof result.current.trackContactClick).toBe('function')
      expect(typeof result.current.trackExternalLink).toBe('function')
      // Project
      expect(typeof result.current.trackProjectView).toBe('function')
      expect(typeof result.current.trackProjectClick).toBe('function')
      // Skill
      expect(typeof result.current.trackSkillHover).toBe('function')
      // Navigation
      expect(typeof result.current.trackNavigation).toBe('function')
      // Theme
      expect(typeof result.current.trackThemeChange).toBe('function')
      // Error
      expect(typeof result.current.trackError).toBe('function')
      // Performance
      expect(typeof result.current.trackPageLoad).toBe('function')
      // Download
      expect(typeof result.current.trackDownload).toBe('function')
    })
  })

  describe('useSectionTracking', () => {
    it('should return a ref object', () => {
      const {result} = renderHook(() => useSectionTracking('hero'))

      expect(result.current).toBeDefined()
      expect(result.current).toHaveProperty('current')
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
