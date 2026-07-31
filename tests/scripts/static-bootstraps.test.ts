import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import vm from 'node:vm'
import {afterEach, beforeEach, describe, expect, it, vi, type MockedFunction} from 'vitest'

/**
 * Executes the public bootstrap scripts as the tested source of truth. These
 * files are shipped byte-for-byte as `<script src>` in `index.html`/`404.html`;
 * there is no TypeScript generator for them (see U1 plan: "Public browser
 * scripts are the tested source of truth; do not maintain a second
 * generator.").
 */
const readScript = (relativePath: string): string => readFileSync(join(process.cwd(), relativePath), 'utf8')

const THEME_PRELOADER_SRC = readScript('public/scripts/theme-preloader.js')
const SPA_RESTORE_SRC = readScript('public/scripts/spa-restore.js')
const SPA_REDIRECT_SRC = readScript('public/scripts/spa-redirect.js')

const INDEX_HTML = readScript('index.html')
const NOT_FOUND_HTML = readScript('public/404.html')

/** Runs a bootstrap script inside a sandbox with the given globals. */
const runInSandbox = (source: string, sandbox: Record<string, unknown>): void => {
  const vmContext = vm.createContext(sandbox)
  vm.runInContext(source, vmContext)
}

describe('theme-preloader.js (public bootstrap)', () => {
  let localStorageStore: Record<string, string> = {}
  const mockLocalStorage = {
    getItem: vi.fn((key: string) => localStorageStore[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      localStorageStore[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete localStorageStore[key]
    }),
    clear: vi.fn(() => {
      localStorageStore = {}
    }),
  }

  const mockMatchMedia = vi.fn()

  const mockDocumentElement = {
    classList: {add: vi.fn(), remove: vi.fn()},
    style: {setProperty: vi.fn()},
    setAttribute: vi.fn(),
  }

  const buildSandbox = () => ({
    document: {documentElement: mockDocumentElement},
    window: {matchMedia: mockMatchMedia},
    localStorage: mockLocalStorage,
    console: {warn: vi.fn()},
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockLocalStorage.clear()
    ;(mockLocalStorage.getItem as MockedFunction<typeof mockLocalStorage.getItem>).mockImplementation(
      (key: string) => localStorageStore[key] || null,
    )
    mockDocumentElement.style.setProperty.mockClear()
    mockDocumentElement.setAttribute.mockClear()
    mockDocumentElement.classList.add.mockClear()
    mockDocumentElement.classList.remove.mockClear()
    mockMatchMedia.mockReturnValue({matches: false})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('adds the theme-preload class to disable transitions before applying colors', () => {
    runInSandbox(THEME_PRELOADER_SRC, buildSandbox())

    expect(mockDocumentElement.classList.add).toHaveBeenCalledWith('theme-preload')
  })

  it('applies the light theme when no saved preference exists and system preference is light', () => {
    mockMatchMedia.mockReturnValue({matches: false})

    runInSandbox(THEME_PRELOADER_SRC, buildSandbox())

    expect(mockDocumentElement.style.setProperty).toHaveBeenCalledWith('--color-primary', '#2563eb')
    expect(mockDocumentElement.style.setProperty).toHaveBeenCalledWith('--color-background', '#ffffff')
    expect(mockDocumentElement.setAttribute).toHaveBeenCalledWith('data-theme', 'light')
  })

  it('applies the dark theme when system preference is dark', () => {
    mockMatchMedia.mockReturnValue({matches: true})

    runInSandbox(THEME_PRELOADER_SRC, buildSandbox())

    expect(mockDocumentElement.style.setProperty).toHaveBeenCalledWith('--color-primary', '#1d4ed8')
    expect(mockDocumentElement.style.setProperty).toHaveBeenCalledWith('--color-background', '#0f172a')
    expect(mockDocumentElement.setAttribute).toHaveBeenCalledWith('data-theme', 'dark')
  })

  it('applies the saved theme mode from localStorage over the system preference', () => {
    mockLocalStorage.setItem('mrbro-dev-theme-mode', JSON.stringify('dark'))
    mockMatchMedia.mockReturnValue({matches: false})

    runInSandbox(THEME_PRELOADER_SRC, buildSandbox())

    expect(mockDocumentElement.setAttribute).toHaveBeenCalledWith('data-theme', 'dark')
  })

  it('applies a saved custom theme when present and valid', () => {
    const customTheme = {
      mode: 'light',
      colors: {
        primary: '#ff0000',
        secondary: '#00ff00',
        accent: '#0000ff',
        background: '#ffffff',
        surface: '#f0f0f0',
        text: '#000000',
        textSecondary: '#666666',
        border: '#cccccc',
        error: '#ff0000',
        warning: '#ffaa00',
        success: '#00ff00',
      },
    }
    mockLocalStorage.setItem('mrbro-dev-custom-theme', JSON.stringify(customTheme))

    runInSandbox(THEME_PRELOADER_SRC, buildSandbox())

    expect(mockDocumentElement.style.setProperty).toHaveBeenCalledWith('--color-primary', '#ff0000')
    expect(mockDocumentElement.setAttribute).toHaveBeenCalledWith('data-theme', 'light')
  })

  it('falls back without throwing when custom theme storage contains invalid JSON', () => {
    mockLocalStorage.setItem('mrbro-dev-custom-theme', 'not-json')
    mockLocalStorage.setItem('mrbro-dev-theme-mode', JSON.stringify('dark'))

    expect(() => {
      runInSandbox(THEME_PRELOADER_SRC, buildSandbox())
    }).not.toThrow()

    expect(mockDocumentElement.setAttribute).toHaveBeenCalledWith('data-theme', 'dark')
  })

  it('falls back silently without throwing when localStorage access throws', () => {
    const sandbox = buildSandbox()
    sandbox.localStorage.getItem = vi.fn(() => {
      throw new Error('localStorage blocked')
    }) as unknown as typeof mockLocalStorage.getItem

    expect(() => {
      runInSandbox(THEME_PRELOADER_SRC, sandbox)
    }).not.toThrow()
  })
})

describe('spa-redirect.js (public 404 bootstrap)', () => {
  it('redirects to root with the original path encoded in the query string', () => {
    const replace = vi.fn()
    const sandbox = {
      window: {
        location: {
          protocol: 'https:',
          hostname: 'mrbro.dev',
          port: '',
          pathname: '/about',
          search: '',
          hash: '',
          replace,
        },
      },
    }

    runInSandbox(SPA_REDIRECT_SRC, sandbox)

    expect(replace).toHaveBeenCalledWith('https://mrbro.dev/?p=/about')
  })

  it('encodes search params and hash, escaping ampersands', () => {
    const replace = vi.fn()
    const sandbox = {
      window: {
        location: {
          protocol: 'https:',
          hostname: 'mrbro.dev',
          port: '',
          pathname: '/blog/my-post',
          search: '?a=1&b=2',
          hash: '#section',
          replace,
        },
      },
    }

    runInSandbox(SPA_REDIRECT_SRC, sandbox)

    expect(replace).toHaveBeenCalledWith('https://mrbro.dev/?p=/blog/my-post&q=a=1~and~b=2#section')
  })
})

describe('spa-restore.js (public main-document bootstrap)', () => {
  it('does nothing when there is no query string', () => {
    const replaceState = vi.fn()
    const sandbox = {
      window: {
        location: {search: '', hash: ''},
        history: {replaceState},
      },
    }

    runInSandbox(SPA_RESTORE_SRC, sandbox)

    expect(replaceState).not.toHaveBeenCalled()
  })

  it('restores the original pathname from the ?p= redirect query parameter', () => {
    const replaceState = vi.fn()
    const sandbox = {
      window: {
        location: {search: '?p=/about', hash: ''},
        history: {replaceState},
      },
      URLSearchParams,
    }

    runInSandbox(SPA_RESTORE_SRC, sandbox)

    expect(replaceState).toHaveBeenCalledWith(null, '', '/about')
  })

  it('restores original path, query, and hash together, unescaping ampersands', () => {
    const replaceState = vi.fn()
    const sandbox = {
      window: {
        location: {search: '?p=/blog/my-post&q=a=1~and~b=2', hash: '#section'},
        history: {replaceState},
      },
      URLSearchParams,
    }

    runInSandbox(SPA_RESTORE_SRC, sandbox)

    expect(replaceState).toHaveBeenCalledWith(null, '', '/blog/my-post?a=1&b=2#section')
  })

  it('round-trips through spa-redirect.js and spa-restore.js to the same pathname', () => {
    const redirectReplace = vi.fn()
    runInSandbox(SPA_REDIRECT_SRC, {
      window: {
        location: {
          protocol: 'https:',
          hostname: 'mrbro.dev',
          port: '',
          pathname: '/projects',
          search: '',
          hash: '',
          replace: redirectReplace,
        },
      },
    })

    const redirectedUrl = new URL(redirectReplace.mock.calls[0]?.[0] as string)

    const restoreState = vi.fn()
    runInSandbox(SPA_RESTORE_SRC, {
      window: {
        location: {search: redirectedUrl.search, hash: redirectedUrl.hash},
        history: {replaceState: restoreState},
      },
      URLSearchParams,
    })

    expect(restoreState).toHaveBeenCalledWith(null, '', '/projects')
  })
})

describe('static document CSP and bootstrap wiring', () => {
  const scriptTagRegex = /<script\b[^>]*>/gi

  const extractScriptTags = (html: string): string[] => html.match(scriptTagRegex) ?? []

  const cspMetaRegex = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"\s*\/?>/i

  const findInlineScripts = (html: string): string[] => {
    const inlineScriptWithBody = /<script(?![^>]*\ssrc=)[^>]*>[\s\S]*?<\/script>/gi
    const matches = html.match(inlineScriptWithBody) ?? []
    return matches.filter(tag => !/^<script[^>]*>\s*<\/script>$/i.test(tag))
  }

  it('index.html contains no inline executable script blocks', () => {
    expect(findInlineScripts(INDEX_HTML)).toEqual([])
  })

  it('404.html contains no inline executable script blocks', () => {
    expect(findInlineScripts(NOT_FOUND_HTML)).toEqual([])
  })

  it('index.html references the spa-restore and theme-preloader scripts as external same-origin assets', () => {
    const scriptTags = extractScriptTags(INDEX_HTML)
    const srcScripts = scriptTags.filter(tag => /\bsrc=/.test(tag))

    expect(srcScripts.some(tag => tag.includes('/scripts/spa-restore.js'))).toBe(true)
    expect(srcScripts.some(tag => tag.includes('/scripts/theme-preloader.js'))).toBe(true)
  })

  it('404.html references the spa-redirect script as an external same-origin asset', () => {
    const scriptTags = extractScriptTags(NOT_FOUND_HTML)
    const srcScripts = scriptTags.filter(tag => /\bsrc=/.test(tag))

    expect(srcScripts.some(tag => tag.includes('/scripts/spa-redirect.js'))).toBe(true)
  })

  it('index.html places the spa-restore script before the theme-preloader script', () => {
    const restoreIndex = INDEX_HTML.indexOf('/scripts/spa-restore.js')
    const preloaderIndex = INDEX_HTML.indexOf('/scripts/theme-preloader.js')

    expect(restoreIndex).toBeGreaterThan(-1)
    expect(preloaderIndex).toBeGreaterThan(-1)
    expect(restoreIndex).toBeLessThan(preloaderIndex)
  })

  it('index.html declares a meta CSP policy before any script, preload, or stylesheet markup', () => {
    const cspMatch = cspMetaRegex.exec(INDEX_HTML)
    expect(cspMatch).not.toBeNull()

    const cspIndex = INDEX_HTML.search(cspMetaRegex)
    const firstScriptIndex = INDEX_HTML.indexOf('<script')
    const firstLinkStylesheetIndex = INDEX_HTML.search(/<link[^>]+rel="stylesheet"/i)

    expect(cspIndex).toBeGreaterThan(-1)
    expect(cspIndex).toBeLessThan(firstScriptIndex)
    if (firstLinkStylesheetIndex !== -1) {
      expect(cspIndex).toBeLessThan(firstLinkStylesheetIndex)
    }
  })

  it('404.html declares a meta CSP policy before its script markup', () => {
    const cspMatch = cspMetaRegex.exec(NOT_FOUND_HTML)
    expect(cspMatch).not.toBeNull()

    const cspIndex = NOT_FOUND_HTML.search(cspMetaRegex)
    const firstScriptIndex = NOT_FOUND_HTML.indexOf('<script')

    expect(cspIndex).toBeGreaterThan(-1)
    expect(cspIndex).toBeLessThan(firstScriptIndex)
  })

  it.each([
    ['index.html', INDEX_HTML],
    ['404.html', NOT_FOUND_HTML],
  ])('%s CSP allows scripts and connections only from self and metrics.fro.bot', (_name, html) => {
    const cspMatch = cspMetaRegex.exec(html)
    expect(cspMatch).not.toBeNull()
    const policy = cspMatch?.[1] ?? ''

    const scriptSrcMatch = /script-src\s+([^;]+)/i.exec(policy)
    const connectSrcMatch = /connect-src\s+([^;]+)/i.exec(policy)

    expect(scriptSrcMatch).not.toBeNull()
    expect(connectSrcMatch).not.toBeNull()

    const scriptSrcValues = (scriptSrcMatch?.[1] ?? '').trim().split(/\s+/)
    const connectSrcValues = (connectSrcMatch?.[1] ?? '').trim().split(/\s+/)

    expect(scriptSrcValues.sort()).toEqual(["'self'", 'https://metrics.fro.bot'].sort())
    expect(connectSrcValues.sort()).toEqual(["'self'", 'https://metrics.fro.bot'].sort())
  })

  it('index.html retains an inline-style allowance required by the theme preload system', () => {
    const cspMatch = cspMetaRegex.exec(INDEX_HTML)
    const policy = cspMatch?.[1] ?? ''
    const styleSrcMatch = /style-src\s+([^;]+)/i.exec(policy)

    expect(styleSrcMatch).not.toBeNull()
    expect(styleSrcMatch?.[1]).toContain("'unsafe-inline'")
  })

  it('index.html does not permit any script/connect origin beyond metrics.fro.bot', () => {
    const cspMatch = cspMetaRegex.exec(INDEX_HTML)
    const policy = cspMatch?.[1] ?? ''

    expect(policy).not.toMatch(/\*/)
    expect(policy).not.toContain('unsafe-eval')
  })

  // `frame-ancestors` has no effect when delivered via <meta http-equiv> — only an HTTP
  // response header can enforce it. Browsers ignore the directive and some emit a console
  // warning about the unsupported meta-delivered directive. GitHub Pages cannot set
  // response headers, so this directive must not appear in either document's meta CSP.
  it.each([
    ['index.html', INDEX_HTML],
    ['404.html', NOT_FOUND_HTML],
  ])('%s meta CSP omits frame-ancestors (unsupported via meta delivery)', (_name, html) => {
    const cspMatch = cspMetaRegex.exec(html)
    expect(cspMatch).not.toBeNull()
    const policy = cspMatch?.[1] ?? ''

    expect(policy).not.toMatch(/frame-ancestors/i)
  })

  // img-src must stay bounded to same-origin and data: URIs. `https:` (or any wildcard
  // scheme) permits image requests to arbitrary third-party origins, which discloses
  // visitor IP addresses to hosts outside the approved self-hosted/data boundary.
  it.each([
    ['index.html', INDEX_HTML],
    ['404.html', NOT_FOUND_HTML],
  ])('%s CSP img-src is exactly self and data:, not an arbitrary https: origin', (_name, html) => {
    const cspMatch = cspMetaRegex.exec(html)
    expect(cspMatch).not.toBeNull()
    const policy = cspMatch?.[1] ?? ''

    const imgSrcMatch = /img-src\s+([^;]+)/i.exec(policy)
    expect(imgSrcMatch).not.toBeNull()

    const imgSrcValues = (imgSrcMatch?.[1] ?? '').trim().split(/\s+/)
    expect(imgSrcValues.sort()).toEqual(["'self'", 'data:'].sort())
  })
})
