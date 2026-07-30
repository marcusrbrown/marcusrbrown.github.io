/**
 * Analytics tracking utility for key user interactions
 * Privacy-focused implementation with consent management
 */

import type {ThemeMode} from '../types'
import blogSnapshot from '../data/blog-snapshot.json'
import projectsSnapshot from '../data/projects-snapshot.json'
import {presetThemes} from './preset-themes'

declare global {
  function gtag(...args: unknown[]): void
}

interface AnalyticsEvent {
  category: string
  action: string
  label?: string
  value?: number
  custom_parameters?: Record<string, string | number | boolean>
}

interface UserSession {
  session_id: string
  start_time: number
  page_views: number
  scroll_depth: number
  time_on_page: number
}

interface AnalyticsConfig {
  enabled: boolean
  debug: boolean
  tracking_id?: string
  consent_required: boolean
  session_timeout: number // minutes
}

class AnalyticsManager {
  private readonly config: AnalyticsConfig
  private session: UserSession | null = null
  private readonly eventQueue: AnalyticsEvent[] = []
  private hasConsent = false
  private readonly observers: IntersectionObserver[] = []
  private readonly timers: NodeJS.Timeout[] = []

  constructor(config: Partial<AnalyticsConfig> = {}) {
    this.config = {
      enabled: true,
      debug: false,
      consent_required: true,
      session_timeout: 30,
      ...config,
    }

    if (typeof window !== 'undefined') {
      this.initializeSession()
      this.setupScrollTracking()
      this.setupTimeTracking()
      this.setupUnloadTracking()
    }
  }

  /**
   * Initialize user session
   */
  private initializeSession(): void {
    const sessionId = this.generateSessionId()
    this.session = {
      session_id: sessionId,
      start_time: Date.now(),
      page_views: 1,
      scroll_depth: 0,
      time_on_page: 0,
    }

    // Check for existing consent
    this.hasConsent = this.getStoredConsent()
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).slice(2, 15)}`
  }

  /**
   * Check stored consent preference
   */
  private getStoredConsent(): boolean {
    if (!this.config.consent_required) return true

    try {
      const consent = localStorage.getItem('analytics_consent')
      return consent === 'granted'
    } catch {
      return false
    }
  }

  /**
   * Set analytics consent
   */
  setConsent(granted: boolean): void {
    this.hasConsent = granted

    try {
      localStorage.setItem('analytics_consent', granted ? 'granted' : 'denied')
    } catch {
      // Handle localStorage not available
    }

    if (granted && this.eventQueue.length > 0) {
      this.flushEventQueue()
    } else if (!granted) {
      this.eventQueue.length = 0
    }
  }

  /**
   * Track custom event
   */
  track(event: AnalyticsEvent): void {
    if (!this.config.enabled) return

    const enrichedEvent = {
      ...event,
      timestamp: Date.now(),
      session_id: this.session?.session_id,
      url: window.location.href,
      user_agent: navigator.userAgent,
      ...event.custom_parameters,
    }

    if (this.config.debug) {
      console.warn('Analytics Event:', enrichedEvent)
    }

    if (this.hasConsent) {
      this.sendEvent(enrichedEvent)
    } else {
      this.eventQueue.push(enrichedEvent)
    }
  }

  /**
   * Track contact method clicks
   */
  trackContactClick(method: string, label?: string): void {
    this.track({
      category: 'Contact',
      action: 'click',
      label: `${method}${label ? `_${label}` : ''}`,
      custom_parameters: {
        contact_method: method,
        section: 'contact_cta',
      },
    })
  }

  /**
   * Track project interactions
   */
  trackProjectInteraction(action: string, projectId: string, source = 'gallery'): void {
    this.track({
      category: 'Project',
      action,
      label: projectId,
      custom_parameters: {
        project_id: projectId,
        source,
      },
    })
  }

  /**
   * Track skill interactions
   */
  trackSkillInteraction(action: string, skillName: string, category?: string): void {
    this.track({
      category: 'Skills',
      action,
      label: skillName,
      custom_parameters: {
        skill_name: skillName,
        ...(category && {skill_category: category}),
      },
    })
  }

  /**
   * Track theme changes
   */
  trackThemeChange(from: string, to: string): void {
    this.track({
      category: 'Theme',
      action: 'change',
      label: `${from}_to_${to}`,
      custom_parameters: {
        previous_theme: from,
        new_theme: to,
      },
    })
  }

  /**
   * Track navigation events
   */
  trackNavigation(section: string, method = 'click'): void {
    this.track({
      category: 'Navigation',
      action: method,
      label: section,
      custom_parameters: {
        target_section: section,
        navigation_method: method,
      },
    })
  }

  /**
   * Track section visibility (time spent)
   */
  trackSectionView(section: string): void {
    this.track({
      category: 'Section',
      action: 'view',
      label: section,
      custom_parameters: {
        section_name: section,
      },
    })
  }

  /**
   * Track download events
   */
  trackDownload(filename: string, source = 'unknown'): void {
    this.track({
      category: 'Download',
      action: 'click',
      label: filename,
      custom_parameters: {
        file_name: filename,
        download_source: source,
      },
    })
  }

  /**
   * Track external link clicks
   */
  trackExternalLink(url: string, source = 'unknown'): void {
    this.track({
      category: 'External',
      action: 'click',
      label: url,
      custom_parameters: {
        external_url: url,
        link_source: source,
      },
    })
  }

  /**
   * Track search interactions
   */
  trackSearch(query: string, results_count: number): void {
    this.track({
      category: 'Search',
      action: 'query',
      label: query,
      value: results_count,
      custom_parameters: {
        search_query: query,
        results_count,
      },
    })
  }

  /**
   * Track error events
   */
  trackError(error: string, context = 'unknown'): void {
    this.track({
      category: 'Error',
      action: 'occurrence',
      label: error,
      custom_parameters: {
        error_message: error,
        error_context: context,
      },
    })
  }

  /**
   * Setup scroll depth tracking
   */
  private setupScrollTracking(): void {
    const scrollThresholds = [25, 50, 75, 90, 100]
    const trackedThresholds = new Set<number>()

    const handleScroll = (): void => {
      const scrollPercentage = Math.round(
        (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100,
      )

      if (this.session) {
        this.session.scroll_depth = Math.max(this.session.scroll_depth, scrollPercentage)
      }

      for (const threshold of scrollThresholds) {
        if (scrollPercentage >= threshold && !trackedThresholds.has(threshold)) {
          trackedThresholds.add(threshold)
          this.track({
            category: 'Engagement',
            action: 'scroll',
            label: `${threshold}%`,
            value: threshold,
            custom_parameters: {
              scroll_depth: threshold,
            },
          })
        }
      }
    }

    // Throttle scroll events
    let scrollTimer: NodeJS.Timeout | null = null
    const throttledScroll = (): void => {
      if (scrollTimer) return
      scrollTimer = setTimeout(() => {
        handleScroll()
        scrollTimer = null
      }, 250)
    }

    window.addEventListener('scroll', throttledScroll, {passive: true})
  }

  /**
   * Setup time on page tracking
   */
  private setupTimeTracking(): void {
    const startTime = Date.now()
    const intervals = [30, 60, 120, 300, 600] // seconds

    for (const interval of intervals) {
      const timer = setTimeout(() => {
        this.track({
          category: 'Engagement',
          action: 'time_on_page',
          label: `${interval}s`,
          value: interval,
          custom_parameters: {
            time_spent: interval,
          },
        })
      }, interval * 1000)

      this.timers.push(timer)
    }

    const sessionTimer = setInterval(() => {
      if (this.session) {
        this.session.time_on_page = Math.round((Date.now() - startTime) / 1000)
      }
    }, 5000)

    this.timers.push(sessionTimer)
  }

  /**
   * Setup page unload tracking
   */
  private setupUnloadTracking(): void {
    const handleUnload = (): void => {
      if (this.session) {
        const finalTimeOnPage = Math.round((Date.now() - this.session.start_time) / 1000)

        this.track({
          category: 'Session',
          action: 'end',
          label: this.session.session_id,
          value: finalTimeOnPage,
          custom_parameters: {
            session_duration: finalTimeOnPage,
            scroll_depth: this.session.scroll_depth,
            page_views: this.session.page_views,
          },
        })
      }
    }

    window.addEventListener('beforeunload', handleUnload)
    window.addEventListener('pagehide', handleUnload)
  }

  /**
   * Send event to analytics service
   */
  private sendEvent(event: AnalyticsEvent & {timestamp: number}): void {
    // For Google Analytics 4
    if (typeof gtag !== 'undefined' && this.config.tracking_id) {
      gtag('event', event.action, {
        event_category: event.category,
        event_label: event.label,
        value: event.value,
        custom_map: event.custom_parameters,
      })
    }

    // For custom analytics endpoint
    if (this.config.debug) {
      console.warn('Sending analytics event:', event)
    }

    // You can add custom endpoint here
    // fetch('/api/analytics', { method: 'POST', body: JSON.stringify(event) })
  }

  /**
   * Flush queued events
   */
  private flushEventQueue(): void {
    while (this.eventQueue.length > 0) {
      const event = this.eventQueue.shift()
      if (event) {
        this.sendEvent({...event, timestamp: Date.now()})
      }
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.observers.forEach(observer => observer.disconnect())
    this.timers.forEach(timer => clearTimeout(timer))
    this.observers.length = 0
    this.timers.length = 0
  }
}

// Global analytics instance
let analyticsInstance: AnalyticsManager | null = null

/**
 * Initialize analytics
 */
export const initializeAnalytics = (config?: Partial<AnalyticsConfig>): AnalyticsManager => {
  if (analyticsInstance) {
    analyticsInstance.destroy()
  }

  analyticsInstance = new AnalyticsManager(config)
  return analyticsInstance
}

/**
 * Get current analytics instance
 */
export const getAnalytics = (): AnalyticsManager | null => {
  return analyticsInstance
}

/**
 * Convenient tracking functions
 */
export const analytics = {
  track: (event: AnalyticsEvent) => analyticsInstance?.track(event),
  trackContactClick: (method: string, label?: string) => analyticsInstance?.trackContactClick(method, label),
  trackProjectInteraction: (action: string, projectId: string, source?: string) =>
    analyticsInstance?.trackProjectInteraction(action, projectId, source),
  trackSkillInteraction: (action: string, skillName: string, category?: string) =>
    analyticsInstance?.trackSkillInteraction(action, skillName, category),
  trackThemeChange: (from: string, to: string) => analyticsInstance?.trackThemeChange(from, to),
  trackNavigation: (section: string, method?: string) => analyticsInstance?.trackNavigation(section, method),
  trackSectionView: (section: string) => analyticsInstance?.trackSectionView(section),
  trackDownload: (filename: string, source?: string) => analyticsInstance?.trackDownload(filename, source),
  trackExternalLink: (url: string, source?: string) => analyticsInstance?.trackExternalLink(url, source),
  trackSearch: (query: string, results_count: number) => analyticsInstance?.trackSearch(query, results_count),
  trackError: (error: string, context?: string) => analyticsInstance?.trackError(error, context),
  setConsent: (granted: boolean) => analyticsInstance?.setConsent(granted),
}

// Auto-initialize analytics if not already done
if (typeof window !== 'undefined' && !analyticsInstance) {
  initializeAnalytics({
    enabled: import.meta.env.PROD,
    debug: import.meta.env.DEV,
    consent_required: true,
  })
}

// -----------------------------------------------------------------------------------
// Typed Umami adapter and catalog
//
// Added alongside the legacy manager above. This adapter is intentionally stateless
// with respect to pending events: it never queues, retries, or polls. It reports
// whether a pageview or custom event was sent, deferred because the tracker is
// unavailable, or dropped by privacy policy (DNT) or catalog validation — the caller
// (the route tracker) owns any pending-route memory.
// -----------------------------------------------------------------------------------

/** Outcome of a typed adapter call. Never throws; never queues or retries. */
export type UmamiSendOutcome = 'sent' | 'unavailable' | 'dropped-by-policy'

const KNOWN_PROJECT_IDS = new Set<string>((projectsSnapshot as {projects: {id: string}[]}).projects.map(p => p.id))
const KNOWN_BLOG_SLUGS = new Set<string>((blogSnapshot as {posts: {slug: string}[]}).posts.map(p => p.slug))
/** Committed preset theme IDs — the only values `theme_change` may report for `kind: 'preset'`. */
const KNOWN_PRESET_THEME_IDS = new Set<string>(presetThemes.map(theme => theme.id))
/** Approved theme mode values — the only values `theme_change` may report for `kind: 'mode'`. */
export const APPROVED_THEME_MODES = ['light', 'dark', 'system'] as const satisfies readonly ThemeMode[]

/** Approved navigation destinations for `navigation` events. */
export const APPROVED_NAVIGATION_DESTINATIONS = [
  'hero',
  'about',
  'projects',
  'blog',
  'home',
  'contact',
  'privacy',
] as const
export type ApprovedNavigationDestination = (typeof APPROVED_NAVIGATION_DESTINATIONS)[number]

/** Approved navigation mechanisms for `navigation` events — input modality is never recorded. */
export const APPROVED_NAVIGATION_METHODS = ['route_link', 'smooth_scroll'] as const
export type ApprovedNavigationMethod = (typeof APPROVED_NAVIGATION_METHODS)[number]

/** Approved Home section names for `section_view` events. */
export const APPROVED_SECTION_NAMES = ['hero', 'about', 'projects', 'blog'] as const
export type ApprovedSectionName = (typeof APPROVED_SECTION_NAMES)[number]

/** Approved project interaction actions for `project_open` events. */
export const APPROVED_PROJECT_ACTIONS = ['preview', 'source', 'demo'] as const
export type ApprovedProjectAction = (typeof APPROVED_PROJECT_ACTIONS)[number]

/** Approved project interaction sources for `project_open` events. */
export const APPROVED_PROJECT_SOURCES = ['gallery', 'modal'] as const
export type ApprovedProjectSource = (typeof APPROVED_PROJECT_SOURCES)[number]

/** Approved contact methods for `contact_open` events. */
export const APPROVED_CONTACT_METHODS = ['email'] as const
export type ApprovedContactMethod = (typeof APPROVED_CONTACT_METHODS)[number]

/** Approved external profile destinations for `external_profile_open` events. */
export const APPROVED_EXTERNAL_PROFILE_DESTINATIONS = ['github', 'twitter'] as const
export type ApprovedExternalProfileDestination = (typeof APPROVED_EXTERNAL_PROFILE_DESTINATIONS)[number]

/** Approved blog-open sources for `blog_open` events. */
export const APPROVED_BLOG_SOURCES = ['card'] as const
export type ApprovedBlogSource = (typeof APPROVED_BLOG_SOURCES)[number]

/** Approved theme-change kinds for `theme_change` events. */
export const APPROVED_THEME_CHANGE_KINDS = ['mode', 'preset'] as const
export type ApprovedThemeChangeKind = (typeof APPROVED_THEME_CHANGE_KINDS)[number]

/** Typed event catalog: names, bounded categorical properties, and privacy metadata. */
export interface UmamiEventCatalog {
  navigation: {destination: ApprovedNavigationDestination; method: ApprovedNavigationMethod}
  section_view: {section: ApprovedSectionName}
  project_open: {action: ApprovedProjectAction; project_id: string; source: ApprovedProjectSource}
  blog_open: {slug: string; source: ApprovedBlogSource}
  contact_open: {method: ApprovedContactMethod}
  external_profile_open: {destination: ApprovedExternalProfileDestination}
  theme_change: {kind: ApprovedThemeChangeKind; value: string}
}

export type UmamiEventName = keyof UmamiEventCatalog

/** Every catalog event name, in the same order as `UMAMI_EVENT_PRIVACY_METADATA`. */
export const UMAMI_EVENT_NAMES: readonly UmamiEventName[] = [
  'navigation',
  'section_view',
  'project_open',
  'blog_open',
  'contact_open',
  'external_profile_open',
  'theme_change',
] as const

/** Privacy-inventory metadata for the `/privacy` page — one row per catalog event. */
export interface UmamiEventPrivacyMetadata {
  name: UmamiEventName
  description: string
}

/**
 * Source of truth for the `/privacy` event inventory (the privacy page reads this,
 * does not duplicate it). Must contain exactly one entry per `UMAMI_EVENT_NAMES`
 * value — see the `UMAMI_EVENT_PRIVACY_METADATA` coupling test in
 * `tests/utils/analytics.test.ts`.
 */
export const UMAMI_EVENT_PRIVACY_METADATA: readonly UmamiEventPrivacyMetadata[] = [
  {name: 'navigation', description: 'Route or in-page section navigation, by destination and mechanism.'},
  {
    name: 'section_view',
    description: 'A Home page section entered the viewport once per Home mount.',
  },
  {name: 'project_open', description: 'A portfolio project preview, source, or demo link was opened.'},
  {name: 'blog_open', description: 'A blog post card was opened from a listing.'},
  {name: 'contact_open', description: 'The contact email link was opened.'},
  {name: 'external_profile_open', description: 'An external GitHub or Twitter profile link was opened.'},
  {name: 'theme_change', description: 'The active theme mode or preset changed.'},
] as const

/** Validates a single catalog event's properties against approved values/snapshots. */
const isValidCatalogEvent = <Name extends UmamiEventName>(name: Name, data: UmamiEventCatalog[Name]): boolean => {
  switch (name) {
    case 'navigation': {
      const {destination, method} = data as UmamiEventCatalog['navigation']
      return (
        (APPROVED_NAVIGATION_DESTINATIONS as readonly string[]).includes(destination) &&
        (APPROVED_NAVIGATION_METHODS as readonly string[]).includes(method)
      )
    }
    case 'section_view': {
      const {section} = data as UmamiEventCatalog['section_view']
      return (APPROVED_SECTION_NAMES as readonly string[]).includes(section)
    }
    case 'project_open': {
      const {action, project_id, source} = data as UmamiEventCatalog['project_open']
      return (
        (APPROVED_PROJECT_ACTIONS as readonly string[]).includes(action) &&
        (APPROVED_PROJECT_SOURCES as readonly string[]).includes(source) &&
        KNOWN_PROJECT_IDS.has(project_id)
      )
    }
    case 'blog_open': {
      const {slug, source} = data as UmamiEventCatalog['blog_open']
      return (APPROVED_BLOG_SOURCES as readonly string[]).includes(source) && KNOWN_BLOG_SLUGS.has(slug)
    }
    case 'contact_open': {
      const {method} = data as UmamiEventCatalog['contact_open']
      return (APPROVED_CONTACT_METHODS as readonly string[]).includes(method)
    }
    case 'external_profile_open': {
      const {destination} = data as UmamiEventCatalog['external_profile_open']
      return (APPROVED_EXTERNAL_PROFILE_DESTINATIONS as readonly string[]).includes(destination)
    }
    case 'theme_change': {
      const {kind, value} = data as UmamiEventCatalog['theme_change']
      if (kind === 'mode') return (APPROVED_THEME_MODES as readonly string[]).includes(value)
      if (kind === 'preset') return KNOWN_PRESET_THEME_IDS.has(value)
      return false
    }
    default: {
      return false
    }
  }
}

/**
 * Honors the browser Do Not Track signal. Mirrors the deployed tracker's own
 * check exactly: `window.doNotTrack || navigator.doNotTrack ||
 * navigator.msDoNotTrack`, evaluated with `||` (so falsy values — `''`, `null`,
 * `undefined`, `0` — fall through to the next signal), and accepts numeric `1`,
 * string `'1'`, or `'yes'` as enabling.
 */
export const isDoNotTrackEnabled = (): boolean => {
  if (typeof navigator === 'undefined') return false
  const nav = navigator as Navigator & {msDoNotTrack?: string | number | null}
  const win = typeof window === 'undefined' ? undefined : (window as Window & {doNotTrack?: string | number | null})
  const value = win?.doNotTrack || nav.doNotTrack || nav.msDoNotTrack
  return value === 1 || value === '1' || value === 'yes'
}

/** Synchronous, non-blocking check for tracker availability. Never polls. */
export const isUmamiTrackerAvailable = (): boolean =>
  typeof window !== 'undefined' && typeof window.umami?.track === 'function'

/**
 * Strips query string and hash from a pathname so search/hash data never
 * reaches the collector, independent of the tracker's own
 * `data-exclude-search`/`data-exclude-hash` attributes.
 */
const stripSearchAndHash = (pathname: string): string => pathname.split('?')[0]?.split('#')[0] ?? pathname

/**
 * A valid same-site pathname begins with exactly one `/` (not two — that is
 * protocol-relative) and is never an absolute URL. Query/hash are stripped
 * separately; this only gates the shape of the input before stripping.
 */
const isValidPathname = (pathname: string): boolean =>
  pathname.length > 0 && pathname.startsWith('/') && !pathname.startsWith('//') && !/^\/[a-z][\w+.-]*:/i.test(pathname)

/**
 * Sends one normalized pageview. Stateless: does not remember or retry the route.
 * The caller (the route tracker) retains the latest pending pathname if this
 * reports `'unavailable'` and re-calls once the tracker becomes ready. Rejects
 * empty, absolute, or protocol-relative input as a privacy/policy violation
 * rather than attempting to normalize it.
 */
export const trackUmamiPageview = (pathname: string): UmamiSendOutcome => {
  if (isDoNotTrackEnabled()) return 'dropped-by-policy'
  if (!isValidPathname(pathname)) return 'dropped-by-policy'
  if (!isUmamiTrackerAvailable()) return 'unavailable'
  try {
    window.umami?.track({url: stripSearchAndHash(pathname)})
    return 'sent'
  } catch {
    return 'unavailable'
  }
}

/**
 * Sends one approved catalog event. Arbitrary payloads have no path: `data` must
 * match the named event's typed shape, and snapshot-backed identifiers (project
 * ID, blog slug) are validated against the committed snapshots before sending.
 */
export const trackUmamiEvent = <Name extends UmamiEventName>(
  name: Name,
  data: UmamiEventCatalog[Name],
): UmamiSendOutcome => {
  if (isDoNotTrackEnabled()) return 'dropped-by-policy'
  if (!isUmamiTrackerAvailable()) return 'unavailable'
  if (!isValidCatalogEvent(name, data)) return 'dropped-by-policy'
  try {
    window.umami?.track(name, data as unknown as Record<string, unknown>)
    return 'sent'
  } catch {
    return 'unavailable'
  }
}

/**
 * Self-hosted Umami tracker script origin. Must match `UMAMI_SCRIPT_URL` in
 * `vite.config.ts` exactly — the build-time injector is the only place this
 * script tag is emitted, and the readiness subscription below only attaches to
 * that exact tag so an unrelated script cannot spoof tracker readiness. Exported
 * under its own name (not imported from `vite.config.ts`) so this runtime module
 * never depends on build-time config; a coupling test asserts the two stay equal.
 */
export const UMAMI_TRACKER_SCRIPT_URL = 'https://metrics.fro.bot/script.js'

/**
 * Notifies the caller once the tracker becomes available, without polling or
 * blocking application startup. Fires synchronously if already available;
 * otherwise attaches a one-time `load` listener to the injected tracker script
 * tag (matched by exact `src`, not merely by carrying `data-website-id`, so an
 * unrelated decoy script cannot trigger readiness) and checks again on load.
 * Does not retry indefinitely and holds no pending event/route state — that
 * boundary belongs to the route tracker.
 */
export const onUmamiTrackerReady = (callback: () => void): void => {
  if (isUmamiTrackerAvailable()) {
    callback()
    return
  }
  if (typeof document === 'undefined') return
  const script = document.querySelector<HTMLScriptElement>(`script[src="${UMAMI_TRACKER_SCRIPT_URL}"][data-website-id]`)
  if (!script) return
  script.addEventListener(
    'load',
    () => {
      if (isUmamiTrackerAvailable()) callback()
    },
    {once: true},
  )
}

/** Declarative `data-umami-event*` attributes for an approved catalog event, or `undefined` if invalid. */
export const buildUmamiEventAttributes = <Name extends UmamiEventName>(
  name: Name,
  data: UmamiEventCatalog[Name],
): Record<string, string> | undefined => {
  if (!isValidCatalogEvent(name, data)) return undefined
  const attrs: Record<string, string> = {'data-umami-event': name}
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    attrs[`data-umami-event-${key}`] = String(value)
  }
  return attrs
}

export default analytics
