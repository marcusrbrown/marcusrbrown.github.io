/**
 * @vitest-environment happy-dom
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import blogSnapshot from '../../src/data/blog-snapshot.json'
import projectsSnapshot from '../../src/data/projects-snapshot.json'
import {UMAMI_EVENT_DEFINITIONS, UMAMI_TRACKER_SCRIPT_URL, type UmamiEventCatalog} from '../../src/utils/analytics'
import {UMAMI_SCRIPT_URL} from '../../vite.config'

describe('typed Umami adapter and catalog', () => {
  // Derive known-valid fixture values from the committed snapshots rather than
  // hardcoding today's production project ID / blog slug, so these tests keep
  // passing as content rotates. Fail fast if a snapshot is empty rather than
  // silently falling back to a value that would make the test pass falsely.
  const firstProject = (projectsSnapshot as {projects: {id: string}[]}).projects[0]
  const firstPost = (blogSnapshot as {posts: {slug: string}[]}).posts[0]
  if (!firstProject) throw new Error('projects-snapshot.json has no projects; cannot derive a known project ID')
  if (!firstPost) throw new Error('blog-snapshot.json has no posts; cannot derive a known blog slug')
  const KNOWN_PROJECT_ID = firstProject.id
  const KNOWN_BLOG_SLUG = firstPost.slug

  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
    Reflect.deleteProperty(window, 'umami')
    Reflect.deleteProperty(window, 'doNotTrack')
    Reflect.deleteProperty(navigator, 'msDoNotTrack')
    Object.defineProperty(navigator, 'doNotTrack', {value: null, configurable: true})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    Reflect.deleteProperty(window, 'umami')
    Reflect.deleteProperty(window, 'doNotTrack')
    Reflect.deleteProperty(navigator, 'msDoNotTrack')
    document.querySelectorAll('script[data-website-id]').forEach(el => el.remove())
  })

  const importCore = async () => import('../../src/utils/analytics')

  describe('isDoNotTrackEnabled', () => {
    it('is false when no DNT signal is present', async () => {
      const {isDoNotTrackEnabled} = await importCore()
      expect(isDoNotTrackEnabled()).toBe(false)
    })

    it('is true when navigator.doNotTrack is "1"', async () => {
      Object.defineProperty(navigator, 'doNotTrack', {value: '1', configurable: true})
      const {isDoNotTrackEnabled} = await importCore()
      expect(isDoNotTrackEnabled()).toBe(true)
    })

    it('is true when navigator.doNotTrack is "yes"', async () => {
      Object.defineProperty(navigator, 'doNotTrack', {value: 'yes', configurable: true})
      const {isDoNotTrackEnabled} = await importCore()
      expect(isDoNotTrackEnabled()).toBe(true)
    })

    it('is true when navigator.doNotTrack is numeric 1', async () => {
      Object.defineProperty(navigator, 'doNotTrack', {value: 1, configurable: true})
      const {isDoNotTrackEnabled} = await importCore()
      expect(isDoNotTrackEnabled()).toBe(true)
    })

    it('is true when window.doNotTrack is "1"', async () => {
      Object.defineProperty(window, 'doNotTrack', {value: '1', configurable: true})
      const {isDoNotTrackEnabled} = await importCore()
      expect(isDoNotTrackEnabled()).toBe(true)
      Reflect.deleteProperty(window, 'doNotTrack')
    })

    it('is true when window.doNotTrack is numeric 1', async () => {
      Object.defineProperty(window, 'doNotTrack', {value: 1, configurable: true})
      const {isDoNotTrackEnabled} = await importCore()
      expect(isDoNotTrackEnabled()).toBe(true)
      Reflect.deleteProperty(window, 'doNotTrack')
    })

    it('is true when navigator.msDoNotTrack is "1" and no other signal is present', async () => {
      Object.defineProperty(navigator, 'msDoNotTrack', {value: '1', configurable: true})
      const {isDoNotTrackEnabled} = await importCore()
      expect(isDoNotTrackEnabled()).toBe(true)
      Reflect.deleteProperty(navigator, 'msDoNotTrack')
    })

    it('is false when doNotTrack signals are the browser default "unspecified" string', async () => {
      Object.defineProperty(navigator, 'doNotTrack', {value: 'unspecified', configurable: true})
      const {isDoNotTrackEnabled} = await importCore()
      expect(isDoNotTrackEnabled()).toBe(false)
    })

    it('prefers window.doNotTrack over navigator.doNotTrack when both are present', async () => {
      Object.defineProperty(window, 'doNotTrack', {value: '0', configurable: true})
      Object.defineProperty(navigator, 'doNotTrack', {value: '1', configurable: true})
      const {isDoNotTrackEnabled} = await importCore()
      // window.doNotTrack ('0') wins the fallback chain and is not an enabling value.
      expect(isDoNotTrackEnabled()).toBe(false)
      Reflect.deleteProperty(window, 'doNotTrack')
    })

    it('falls through to navigator.doNotTrack when window.doNotTrack is an empty string', async () => {
      Object.defineProperty(window, 'doNotTrack', {value: '', configurable: true})
      Object.defineProperty(navigator, 'doNotTrack', {value: '1', configurable: true})
      const {isDoNotTrackEnabled} = await importCore()
      // Empty string is falsy in the deployed tracker's `||` fallback chain.
      expect(isDoNotTrackEnabled()).toBe(true)
      Reflect.deleteProperty(window, 'doNotTrack')
    })

    it('falls through to navigator.msDoNotTrack when doNotTrack is null on both window and navigator', async () => {
      Object.defineProperty(navigator, 'msDoNotTrack', {value: '1', configurable: true})
      const {isDoNotTrackEnabled} = await importCore()
      expect(isDoNotTrackEnabled()).toBe(true)
      Reflect.deleteProperty(navigator, 'msDoNotTrack')
    })
  })

  describe('isUmamiTrackerAvailable', () => {
    it('is false when window.umami is absent', async () => {
      const {isUmamiTrackerAvailable} = await importCore()
      expect(isUmamiTrackerAvailable()).toBe(false)
    })

    it('is true synchronously once window.umami.track exists', async () => {
      const {isUmamiTrackerAvailable} = await importCore()
      vi.stubGlobal('umami', {track: vi.fn()})
      expect(isUmamiTrackerAvailable()).toBe(true)
    })
  })

  describe('trackUmamiPageview', () => {
    it('sends a normalized pageview when the tracker is ready and DNT is off', async () => {
      const track = vi.fn()
      vi.stubGlobal('umami', {track})
      const {trackUmamiPageview} = await importCore()
      const outcome = trackUmamiPageview(`/blog/${KNOWN_BLOG_SLUG}?ref=campaign#section`)
      expect(outcome).toBe('sent')
      expect(track).toHaveBeenCalledWith({url: `/blog/${KNOWN_BLOG_SLUG}`})
    })

    it('reports unavailable and sends nothing before the tracker mounts', async () => {
      const {trackUmamiPageview} = await importCore()
      expect(trackUmamiPageview('/about')).toBe('unavailable')
    })

    it('sends once the tracker appears after being unavailable', async () => {
      const {trackUmamiPageview} = await importCore()
      expect(trackUmamiPageview('/about')).toBe('unavailable')
      const track = vi.fn()
      vi.stubGlobal('umami', {track})
      expect(trackUmamiPageview('/about')).toBe('sent')
      expect(track).toHaveBeenCalledTimes(1)
    })

    it('drops by policy and sends nothing when DNT is enabled', async () => {
      Object.defineProperty(navigator, 'doNotTrack', {value: '1', configurable: true})
      const track = vi.fn()
      vi.stubGlobal('umami', {track})
      const {trackUmamiPageview} = await importCore()
      expect(trackUmamiPageview('/about')).toBe('dropped-by-policy')
      expect(track).not.toHaveBeenCalled()
    })

    it('reports unavailable and does not throw when the tracker call fails', async () => {
      const track = vi.fn().mockImplementation(() => {
        throw new Error('boom')
      })
      vi.stubGlobal('umami', {track})
      const {trackUmamiPageview} = await importCore()
      expect(() => trackUmamiPageview('/about')).not.toThrow()
      expect(trackUmamiPageview('/about')).toBe('unavailable')
    })

    it('drops an empty pathname without sending', async () => {
      const track = vi.fn()
      vi.stubGlobal('umami', {track})
      const {trackUmamiPageview} = await importCore()
      expect(trackUmamiPageview('')).toBe('dropped-by-policy')
      expect(track).not.toHaveBeenCalled()
    })

    it('drops an absolute URL without sending', async () => {
      const track = vi.fn()
      vi.stubGlobal('umami', {track})
      const {trackUmamiPageview} = await importCore()
      expect(trackUmamiPageview('https://mrbro.dev/about')).toBe('dropped-by-policy')
      expect(track).not.toHaveBeenCalled()
    })

    it('drops a protocol-relative URL without sending', async () => {
      const track = vi.fn()
      vi.stubGlobal('umami', {track})
      const {trackUmamiPageview} = await importCore()
      expect(trackUmamiPageview('//evil.example/about')).toBe('dropped-by-policy')
      expect(track).not.toHaveBeenCalled()
    })

    it('drops a value without a leading slash without sending', async () => {
      const track = vi.fn()
      vi.stubGlobal('umami', {track})
      const {trackUmamiPageview} = await importCore()
      expect(trackUmamiPageview('about')).toBe('dropped-by-policy')
      expect(track).not.toHaveBeenCalled()
    })

    it('drops a value with a double leading slash without sending', async () => {
      const track = vi.fn()
      vi.stubGlobal('umami', {track})
      const {trackUmamiPageview} = await importCore()
      expect(trackUmamiPageview('//about')).toBe('dropped-by-policy')
      expect(track).not.toHaveBeenCalled()
    })

    it('accepts a bare "/" pathname', async () => {
      const track = vi.fn()
      vi.stubGlobal('umami', {track})
      const {trackUmamiPageview} = await importCore()
      expect(trackUmamiPageview('/')).toBe('sent')
      expect(track).toHaveBeenCalledWith({url: '/'})
    })

    it.each(['/about', '/projects', '/blog', '/privacy'])('sends approved static path %s', async pathname => {
      const track = vi.fn()
      vi.stubGlobal('umami', {track})
      const {trackUmamiPageview} = await importCore()
      expect(trackUmamiPageview(pathname)).toBe('sent')
      expect(track).toHaveBeenCalledWith({url: pathname})
    })

    it('sends a known committed blog slug', async () => {
      const track = vi.fn()
      vi.stubGlobal('umami', {track})
      const {trackUmamiPageview} = await importCore()
      const path = `/blog/${KNOWN_BLOG_SLUG}`
      expect(trackUmamiPageview(path)).toBe('sent')
      expect(track).toHaveBeenCalledWith({url: path})
    })

    it('strips query and hash from a valid pathname before sending', async () => {
      const track = vi.fn()
      vi.stubGlobal('umami', {track})
      const {trackUmamiPageview} = await importCore()
      expect(trackUmamiPageview('/projects?filter=react#top')).toBe('sent')
      expect(track).toHaveBeenCalledWith({url: '/projects'})
    })

    it.each([
      ['/unknown', 'an unknown route'],
      ['/reset/alice@example.com', 'an email-like route'],
      ['/auth/reset/token=abc123', 'a token-like route'],
      ['/reset/alice%40example.com', 'an encoded route'],
      ['/https://evil.example/path', 'a protocol-looking route'],
    ])('drops %s (%s) even when the tracker is ready', async pathname => {
      const track = vi.fn()
      vi.stubGlobal('umami', {track})
      const {trackUmamiPageview} = await importCore()
      expect(trackUmamiPageview(pathname)).toBe('dropped-by-policy')
      expect(track).not.toHaveBeenCalled()
    })
  })

  describe('trackUmamiEvent', () => {
    it('sends an approved project_open event with a known project id', async () => {
      const track = vi.fn()
      vi.stubGlobal('umami', {track})
      const {trackUmamiEvent} = await importCore()
      const outcome = trackUmamiEvent('project_open', {
        action: 'preview',
        project_id: KNOWN_PROJECT_ID,
        source: 'gallery',
      })
      expect(outcome).toBe('sent')
      expect(track).toHaveBeenCalledWith('project_open', {
        action: 'preview',
        project_id: KNOWN_PROJECT_ID,
        source: 'gallery',
      })
    })

    it('sends an approved blog_open event with a known slug', async () => {
      const track = vi.fn()
      vi.stubGlobal('umami', {track})
      const {trackUmamiEvent} = await importCore()
      expect(trackUmamiEvent('blog_open', {slug: KNOWN_BLOG_SLUG, source: 'card'})).toBe('sent')
    })

    it('drops project_open for an unknown project id without sending', async () => {
      const track = vi.fn()
      vi.stubGlobal('umami', {track})
      const {trackUmamiEvent} = await importCore()
      const outcome = trackUmamiEvent('project_open', {
        action: 'preview',
        project_id: 'not-a-real-project',
        source: 'gallery',
      })
      expect(outcome).toBe('dropped-by-policy')
      expect(track).not.toHaveBeenCalled()
    })

    it('drops blog_open for an unknown slug without sending', async () => {
      const track = vi.fn()
      vi.stubGlobal('umami', {track})
      const {trackUmamiEvent} = await importCore()
      expect(trackUmamiEvent('blog_open', {slug: 'not-a-real-post', source: 'card'})).toBe('dropped-by-policy')
      expect(track).not.toHaveBeenCalled()
    })

    it('drops any event when DNT is enabled before checking availability', async () => {
      Object.defineProperty(navigator, 'doNotTrack', {value: '1', configurable: true})
      const track = vi.fn()
      vi.stubGlobal('umami', {track})
      const {trackUmamiEvent} = await importCore()
      expect(trackUmamiEvent('section_view', {section: 'hero'})).toBe('dropped-by-policy')
      expect(track).not.toHaveBeenCalled()
    })

    it('reports unavailable when the tracker has not mounted', async () => {
      const {trackUmamiEvent} = await importCore()
      expect(trackUmamiEvent('section_view', {section: 'hero'})).toBe('unavailable')
    })

    describe('catalog validation before tracker availability', () => {
      it('drops invalid project_open by policy even when tracker is absent', async () => {
        const {trackUmamiEvent} = await importCore()
        expect(
          trackUmamiEvent('project_open', {action: 'preview', project_id: 'not-a-real-project', source: 'gallery'}),
        ).toBe('dropped-by-policy')
      })

      it('drops invalid blog_open by policy even when tracker is absent', async () => {
        const {trackUmamiEvent} = await importCore()
        expect(trackUmamiEvent('blog_open', {slug: 'not-a-real-post', source: 'card'})).toBe('dropped-by-policy')
      })

      it('drops invalid navigation destination by policy even when tracker is absent', async () => {
        const {trackUmamiEvent} = await importCore()
        expect(
          trackUmamiEvent('navigation', {
            destination: 'evil-external',
            method: 'route_link',
          } as unknown as UmamiEventCatalog['navigation']),
        ).toBe('dropped-by-policy')
      })

      it('drops invalid navigation method by policy even when tracker is absent', async () => {
        const {trackUmamiEvent} = await importCore()
        expect(
          trackUmamiEvent('navigation', {
            destination: 'hero',
            method: 'post_message',
          } as unknown as UmamiEventCatalog['navigation']),
        ).toBe('dropped-by-policy')
      })

      it('drops unknown theme_change kind by policy even when tracker is absent', async () => {
        const {trackUmamiEvent} = await importCore()
        expect(trackUmamiEvent('theme_change', {kind: 'mode', value: 'sepia'})).toBe('dropped-by-policy')
      })

      it('drops unknown theme_change preset by policy even when tracker is absent', async () => {
        const {trackUmamiEvent} = await importCore()
        expect(trackUmamiEvent('theme_change', {kind: 'preset', value: 'my-custom-theme'})).toBe('dropped-by-policy')
      })

      it('drops unknown section_view by policy even when tracker is absent', async () => {
        const {trackUmamiEvent} = await importCore()
        expect(
          trackUmamiEvent('section_view', {section: 'gallery'} as unknown as UmamiEventCatalog['section_view']),
        ).toBe('dropped-by-policy')
      })

      it('drops unknown contact_open method by policy even when tracker is absent', async () => {
        const {trackUmamiEvent} = await importCore()
        expect(trackUmamiEvent('contact_open', {method: 'phone'} as unknown as UmamiEventCatalog['contact_open'])).toBe(
          'dropped-by-policy',
        )
      })

      it('drops unknown external_profile_open destination by policy even when tracker is absent', async () => {
        const {trackUmamiEvent} = await importCore()
        expect(
          trackUmamiEvent('external_profile_open', {
            destination: 'instagram',
          } as unknown as UmamiEventCatalog['external_profile_open']),
        ).toBe('dropped-by-policy')
      })

      it('still returns unavailable for valid data when tracker is absent', async () => {
        const {trackUmamiEvent} = await importCore()
        expect(trackUmamiEvent('section_view', {section: 'hero'})).toBe('unavailable')
      })
    })

    it('reports unavailable and does not throw when the tracker call fails', async () => {
      const track = vi.fn().mockImplementation(() => {
        throw new Error('boom')
      })
      vi.stubGlobal('umami', {track})
      const {trackUmamiEvent} = await importCore()
      expect(() => trackUmamiEvent('theme_change', {kind: 'mode', value: 'dark'})).not.toThrow()
    })

    it('sends an approved navigation event to the /privacy destination', async () => {
      const track = vi.fn()
      vi.stubGlobal('umami', {track})
      const {trackUmamiEvent} = await importCore()
      const outcome = trackUmamiEvent('navigation', {destination: 'privacy', method: 'route_link'})
      expect(outcome).toBe('sent')
      expect(track).toHaveBeenCalledWith('navigation', {destination: 'privacy', method: 'route_link'})
    })

    describe('theme_change boundary', () => {
      it('sends an approved mode value', async () => {
        const track = vi.fn()
        vi.stubGlobal('umami', {track})
        const {trackUmamiEvent} = await importCore()
        expect(trackUmamiEvent('theme_change', {kind: 'mode', value: 'dark'})).toBe('sent')
      })

      it('sends every approved mode value', async () => {
        const track = vi.fn()
        vi.stubGlobal('umami', {track})
        const {trackUmamiEvent} = await importCore()
        for (const mode of ['light', 'dark', 'system']) {
          expect(trackUmamiEvent('theme_change', {kind: 'mode', value: mode})).toBe('sent')
        }
      })

      it('drops an unknown mode value', async () => {
        const track = vi.fn()
        vi.stubGlobal('umami', {track})
        const {trackUmamiEvent} = await importCore()
        expect(trackUmamiEvent('theme_change', {kind: 'mode', value: 'sepia'})).toBe('dropped-by-policy')
        expect(track).not.toHaveBeenCalled()
      })

      it('sends a known committed preset id', async () => {
        const track = vi.fn()
        vi.stubGlobal('umami', {track})
        const {trackUmamiEvent} = await importCore()
        expect(trackUmamiEvent('theme_change', {kind: 'preset', value: 'dracula'})).toBe('sent')
      })

      it('drops an unknown preset id', async () => {
        const track = vi.fn()
        vi.stubGlobal('umami', {track})
        const {trackUmamiEvent} = await importCore()
        expect(trackUmamiEvent('theme_change', {kind: 'preset', value: 'my-custom-theme'})).toBe('dropped-by-policy')
        expect(track).not.toHaveBeenCalled()
      })

      it('drops a preset value even when it happens to equal an approved mode name', async () => {
        const track = vi.fn()
        vi.stubGlobal('umami', {track})
        const {trackUmamiEvent} = await importCore()
        expect(trackUmamiEvent('theme_change', {kind: 'preset', value: 'dark'})).toBe('dropped-by-policy')
        expect(track).not.toHaveBeenCalled()
      })

      it('drops a mode value even when it happens to equal a committed preset id', async () => {
        const track = vi.fn()
        vi.stubGlobal('umami', {track})
        const {trackUmamiEvent} = await importCore()
        expect(trackUmamiEvent('theme_change', {kind: 'mode', value: 'dracula'})).toBe('dropped-by-policy')
        expect(track).not.toHaveBeenCalled()
      })

      it('drops a raw hex color value', async () => {
        const track = vi.fn()
        vi.stubGlobal('umami', {track})
        const {trackUmamiEvent} = await importCore()
        expect(trackUmamiEvent('theme_change', {kind: 'mode', value: '#1976d2'})).toBe('dropped-by-policy')
        expect(track).not.toHaveBeenCalled()
      })

      it('drops a custom-theme JSON-like value', async () => {
        const track = vi.fn()
        vi.stubGlobal('umami', {track})
        const {trackUmamiEvent} = await importCore()
        expect(trackUmamiEvent('theme_change', {kind: 'preset', value: '{"colors":{"primary":"#000"}}'})).toBe(
          'dropped-by-policy',
        )
        expect(track).not.toHaveBeenCalled()
      })
    })
  })

  describe('onUmamiTrackerReady', () => {
    it('calls back synchronously when the tracker is already available', async () => {
      vi.stubGlobal('umami', {track: vi.fn()})
      const {onUmamiTrackerReady} = await importCore()
      const callback = vi.fn()
      onUmamiTrackerReady(callback)
      expect(callback).toHaveBeenCalledOnce()
    })

    it('does not throw and does not call back when no tracker script exists', async () => {
      const {onUmamiTrackerReady} = await importCore()
      const callback = vi.fn()
      expect(() => onUmamiTrackerReady(callback)).not.toThrow()
      expect(callback).not.toHaveBeenCalled()
    })

    it('calls back once the tracker script fires load and umami is defined', async () => {
      const script = document.createElement('script')
      script.src = UMAMI_TRACKER_SCRIPT_URL
      script.dataset.websiteId = 'fixture-website-id'
      document.head.append(script)
      const {onUmamiTrackerReady} = await importCore()
      const callback = vi.fn()
      onUmamiTrackerReady(callback)
      expect(callback).not.toHaveBeenCalled()

      vi.stubGlobal('umami', {track: vi.fn()})
      script.dispatchEvent(new Event('load'))
      expect(callback).toHaveBeenCalledOnce()
      script.remove()
    })

    it('ignores an unrelated decoy script that also carries data-website-id', async () => {
      const decoy = document.createElement('script')
      decoy.src = 'https://evil.example/tracker.js'
      decoy.dataset.websiteId = 'fixture-website-id'
      document.head.append(decoy)
      const {onUmamiTrackerReady} = await importCore()
      const callback = vi.fn()
      onUmamiTrackerReady(callback)

      vi.stubGlobal('umami', {track: vi.fn()})
      decoy.dispatchEvent(new Event('load'))
      expect(callback).not.toHaveBeenCalled()
      decoy.remove()
    })

    it('subscribes to the real tracker script even when a decoy is present', async () => {
      const decoy = document.createElement('script')
      decoy.src = 'https://evil.example/tracker.js'
      decoy.dataset.websiteId = 'fixture-website-id'
      document.head.append(decoy)

      const real = document.createElement('script')
      real.src = UMAMI_TRACKER_SCRIPT_URL
      real.dataset.websiteId = 'fixture-website-id'
      document.head.append(real)

      const {onUmamiTrackerReady} = await importCore()
      const callback = vi.fn()
      onUmamiTrackerReady(callback)

      vi.stubGlobal('umami', {track: vi.fn()})
      real.dispatchEvent(new Event('load'))
      expect(callback).toHaveBeenCalledOnce()

      decoy.remove()
      real.remove()
    })
  })

  describe('buildUmamiEventAttributes', () => {
    it('produces declarative data-umami-event attributes for an approved event', async () => {
      const {buildUmamiEventAttributes} = await importCore()
      const attrs = buildUmamiEventAttributes('contact_open', {method: 'email'})
      expect(attrs).toStrictEqual({
        'data-umami-event': 'contact_open',
        'data-umami-event-method': 'email',
      })
    })

    it('returns undefined for an invalid/unrepresentable identifier', async () => {
      const {buildUmamiEventAttributes} = await importCore()
      const attrs = buildUmamiEventAttributes('blog_open', {slug: 'not-a-real-post', source: 'card'})
      expect(attrs).toBeUndefined()
    })
  })

  describe('UMAMI_EVENT_PRIVACY_METADATA', () => {
    it('derives names and metadata from every catalog definition exactly once', async () => {
      const {UMAMI_EVENT_NAMES, UMAMI_EVENT_PRIVACY_METADATA} = await importCore()
      const definitionNames = Object.keys(UMAMI_EVENT_DEFINITIONS)
      const metadataNames = UMAMI_EVENT_PRIVACY_METADATA.map(entry => entry.name)

      expect(UMAMI_EVENT_NAMES).toStrictEqual(definitionNames)
      expect(metadataNames).toStrictEqual(definitionNames)
      expect(metadataNames).toHaveLength(new Set(metadataNames).size)
      expect(metadataNames).toHaveLength(UMAMI_EVENT_NAMES.length)
      expect(UMAMI_EVENT_PRIVACY_METADATA).toStrictEqual(
        UMAMI_EVENT_NAMES.map(name => ({name, description: UMAMI_EVENT_DEFINITIONS[name].description})),
      )
    })

    it('describes section_view using once-per-Home-mount semantics, not "current visit"', async () => {
      const {UMAMI_EVENT_PRIVACY_METADATA} = await importCore()
      const sectionView = UMAMI_EVENT_PRIVACY_METADATA.find(entry => entry.name === 'section_view')
      expect(sectionView?.description).not.toMatch(/current visit/i)
      expect(sectionView?.description).toMatch(/once per Home mount/i)
    })
  })

  describe('UMAMI_TRACKER_SCRIPT_URL / UMAMI_SCRIPT_URL coupling', () => {
    it('matches the build-time tracker URL in vite.config.ts exactly', async () => {
      const {UMAMI_TRACKER_SCRIPT_URL: runtimeUrl} = await importCore()
      expect(runtimeUrl).toBe(UMAMI_SCRIPT_URL)
    })
  })
})
