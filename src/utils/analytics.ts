/**
 * Analytics tracking utility for key user interactions
 * Privacy-focused implementation with consent management
 */

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
  private config: AnalyticsConfig
  private session: UserSession | null = null
  private eventQueue: AnalyticsEvent[] = []
  private hasConsent = false
  private observers: IntersectionObserver[] = []
  private timers: NodeJS.Timeout[] = []

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

    // Update session time periodically
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

export default analytics
