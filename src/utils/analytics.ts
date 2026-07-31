/**
 * Typed Umami adapter: privacy-first, catalog-validated analytics.
 * Never queues, retries, or polls. Outcomes are 'sent' | 'unavailable' | 'dropped-by-policy'.
 */

import type {ThemeMode} from '../types'
import blogSnapshot from '../data/blog-snapshot.json'
import projectsSnapshot from '../data/projects-snapshot.json'
import {presetThemes} from './preset-themes'

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

/** Runtime guard for navigation destinations accepted by the analytics catalog. */
export const isApprovedNavigationDestination = (value: string): value is ApprovedNavigationDestination =>
  (APPROVED_NAVIGATION_DESTINATIONS as readonly string[]).includes(value)

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

/** Privacy-inventory metadata for the `/privacy` page — one row per catalog event. */
export interface UmamiEventPrivacyMetadata {
  name: UmamiEventName
  description: string
}

/**
 * Source of truth for event descriptions and runtime validation. The mapped type
 * keeps each validator coupled to its catalog payload shape.
 */
type UmamiEventDefinitions = {
  [Name in UmamiEventName]: {
    description: string
    validate: (data: UmamiEventCatalog[Name]) => boolean
  }
}

export const UMAMI_EVENT_DEFINITIONS = {
  navigation: {
    description: 'Route or in-page section navigation, by destination and mechanism.',
    validate: ({destination, method}) =>
      isApprovedNavigationDestination(destination) &&
      (APPROVED_NAVIGATION_METHODS as readonly string[]).includes(method),
  },
  section_view: {
    description: 'A Home page section entered the viewport once per Home mount.',
    validate: ({section}) => (APPROVED_SECTION_NAMES as readonly string[]).includes(section),
  },
  project_open: {
    description: 'A portfolio project preview, source, or demo link was opened.',
    validate: ({action, project_id, source}) =>
      (APPROVED_PROJECT_ACTIONS as readonly string[]).includes(action) &&
      (APPROVED_PROJECT_SOURCES as readonly string[]).includes(source) &&
      KNOWN_PROJECT_IDS.has(project_id),
  },
  blog_open: {
    description: 'A blog post card was opened from a listing.',
    validate: ({slug, source}) =>
      (APPROVED_BLOG_SOURCES as readonly string[]).includes(source) && KNOWN_BLOG_SLUGS.has(slug),
  },
  contact_open: {
    description: 'The contact email link was opened.',
    validate: ({method}) => (APPROVED_CONTACT_METHODS as readonly string[]).includes(method),
  },
  external_profile_open: {
    description: 'An external GitHub or Twitter profile link was opened.',
    validate: ({destination}) => (APPROVED_EXTERNAL_PROFILE_DESTINATIONS as readonly string[]).includes(destination),
  },
  theme_change: {
    description: 'The active theme mode or preset changed.',
    validate: ({kind, value}) => {
      if (kind === 'mode') return (APPROVED_THEME_MODES as readonly string[]).includes(value)
      if (kind === 'preset') return KNOWN_PRESET_THEME_IDS.has(value)
      return false
    },
  },
} satisfies UmamiEventDefinitions

/** Every catalog event name, derived in definition order. */
export const UMAMI_EVENT_NAMES: readonly UmamiEventName[] = Object.keys(UMAMI_EVENT_DEFINITIONS) as UmamiEventName[]

/** Privacy-inventory metadata for the `/privacy` page, derived from the event catalog. */
export const UMAMI_EVENT_PRIVACY_METADATA: readonly UmamiEventPrivacyMetadata[] = UMAMI_EVENT_NAMES.map(name => ({
  name,
  description: UMAMI_EVENT_DEFINITIONS[name].description,
}))

const getUmamiEventDefinition = <Name extends UmamiEventName>(name: Name): UmamiEventDefinitions[Name] | undefined =>
  UMAMI_EVENT_DEFINITIONS[name]

/** Validates a single catalog event's properties against approved values/snapshots. */
const isValidCatalogEvent = <Name extends UmamiEventName>(name: Name, data: UmamiEventCatalog[Name]): boolean => {
  const definition = getUmamiEventDefinition(name)
  return definition === undefined ? false : definition.validate(data)
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

/** A valid same-site pathname begins with exactly one `/` and is never an absolute URL. */
const isValidPathname = (pathname: string): boolean =>
  pathname.length > 0 && pathname.startsWith('/') && !pathname.startsWith('//') && !/^\/[a-z][\w+.-]*:/i.test(pathname)

const APPROVED_STATIC_PAGEVIEW_PATHS = ['/', '/about', '/projects', '/blog', '/privacy'] as const

/** Returns the approved route sent to the collector, or `undefined` when policy rejects it. */
const normalizeApprovedPageviewPath = (pathname: string): string | undefined => {
  const normalizedPathname = stripSearchAndHash(pathname)
  if (!isValidPathname(normalizedPathname)) return undefined
  if ((APPROVED_STATIC_PAGEVIEW_PATHS as readonly string[]).includes(normalizedPathname)) return normalizedPathname

  const blogSlug = normalizedPathname.startsWith('/blog/') ? normalizedPathname.slice('/blog/'.length) : undefined
  return blogSlug && KNOWN_BLOG_SLUGS.has(blogSlug) ? normalizedPathname : undefined
}

/**
 * Sends one normalized pageview. Stateless: does not remember or retry the route.
 * The caller (the route tracker) retains the latest pending pathname if this
 * reports `'unavailable'` and re-calls once the tracker becomes ready. Rejects
 * empty, absolute, or protocol-relative input as a privacy/policy violation
 * rather than attempting to normalize it.
 */
export const trackUmamiPageview = (pathname: string): UmamiSendOutcome => {
  if (isDoNotTrackEnabled()) return 'dropped-by-policy'
  const normalizedPathname = normalizeApprovedPageviewPath(pathname)
  if (normalizedPathname === undefined) return 'dropped-by-policy'
  if (!isUmamiTrackerAvailable()) return 'unavailable'
  try {
    window.umami?.track(properties => ({...properties, url: normalizedPathname}))
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
  if (!isValidCatalogEvent(name, data)) return 'dropped-by-policy'
  if (!isUmamiTrackerAvailable()) return 'unavailable'
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
