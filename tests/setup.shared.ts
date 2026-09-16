import {beforeEach, vi} from 'vitest'

// Environment-neutral test setup shared by both the Node and DOM Vitest projects
// (see vite.config.ts and #383). Nothing here may touch `window`/`navigator` --
// those belong in tests/setup.ts, which is DOM-project-only.

// Reject every request unless a test explicitly installs a narrower fixture (#362).
beforeEach(() => {
  globalThis.fetch = vi.fn().mockImplementation(async (url: string | URL | Request) => {
    const urlString = typeof url === 'string' ? url : url.toString()
    throw new Error(`Unexpected fetch request in test: ${urlString}`)
  })
})
