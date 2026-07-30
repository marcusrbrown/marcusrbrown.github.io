/// <reference types="vite/client" />

// Vite define in vite.config.ts
declare const __GITHUB_PAGES__: boolean

interface ImportMetaEnv {
  /**
   * Public Umami website ID (see docs/analytics.md). Present only in configured
   * production builds; absent in development and unconfigured production builds.
   * Not a secret — Vite replaces this at build time for client code.
   */
  readonly VITE_UMAMI_WEBSITE_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

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
