/// <reference types="vite/client" />

// Vite define in vite.config.ts
declare const __GITHUB_PAGES__: boolean
declare const __UMAMI_ENABLED__: boolean

interface Window {
  /**
   * Present once the self-hosted Umami tracker script (see vite.config.ts,
   * `buildUmamiTrackerTag`) has loaded and initialized. Absent in development,
   * unconfigured production builds, or before the async script mounts.
   */
  umami?: {
    track: (nameOrPayload?: string | Record<string, unknown>, data?: Record<string, unknown>) => void
  }
}
