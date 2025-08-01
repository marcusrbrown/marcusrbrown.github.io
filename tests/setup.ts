import {cleanup} from '@testing-library/react'
import {afterEach, beforeEach, vi} from 'vitest'
import '@testing-library/jest-dom'

declare global {
  interface GlobalThis {
    __MATCH_MEDIA_DARK__?: boolean
  }
}

afterEach(cleanup)

beforeEach(() => {
  // Mock DOM APIs that might not be available in happy-dom
  if (globalThis.Blob === undefined) {
    globalThis.Blob = vi.fn().mockImplementation((content, options) => ({
      size: content.reduce(
        (acc: number, item: any) => acc + (typeof item === 'string' ? item.length : String(item).length),
        0,
      ),
      type: options?.type || '',
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
      text: vi
        .fn()
        .mockResolvedValue(content.map((item: any) => (typeof item === 'string' ? item : String(item))).join('')),
    }))
  }

  if (globalThis.URL === undefined || !globalThis.URL.createObjectURL) {
    globalThis.URL = globalThis.URL || {}
    globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url')
    globalThis.URL.revokeObjectURL = vi.fn()
  }

  // Mock window.matchMedia for theme preference detection
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
      matches:
        typeof (globalThis as GlobalThis).__MATCH_MEDIA_DARK__ === 'boolean'
          ? (globalThis as GlobalThis).__MATCH_MEDIA_DARK__
          : query.includes('prefers-color-scheme: dark')
            ? false
            : !!query.includes('prefers-color-scheme: light'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })

  // Mock File API
  if (globalThis.File === undefined) {
    globalThis.File = vi.fn().mockImplementation((content, name, options) => ({
      name,
      size: Array.isArray(content)
        ? content.reduce(
            (acc, item) =>
              acc + (typeof item === 'string' ? item.length : item instanceof ArrayBuffer ? item.byteLength : 0),
            0,
          )
        : typeof content === 'string'
          ? content.length
          : content instanceof ArrayBuffer
            ? content.byteLength
            : 0,
      type: options?.type || '',
      lastModified: Date.now(),
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
      text: vi.fn().mockResolvedValue(Array.isArray(content) ? content.join('') : content),
    }))
  }

  // Mock navigator.clipboard for theme export/import
  Object.defineProperty(navigator, 'clipboard', {
    writable: true,
    value: {
      writeText: vi.fn().mockResolvedValue(undefined),
      readText: vi.fn().mockResolvedValue(''),
    },
  })
})
