import {Buffer} from 'node:buffer'
import {existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {
  buildPreviewBatch,
  fetchPreviewImage,
  isPortfolioRepo,
  previewFilename,
  refreshPreviewImages,
  truncateForLog,
  type RefreshRepo,
} from '../../scripts/project-preview-refresh'

const PNG_MAGIC_BYTES = [0x89, 0x50, 0x4e, 0x47]
const JPEG_MAGIC_BYTES = [0xff, 0xd8, 0xff]
const GIF_MAGIC_BYTES = [0x47, 0x49, 0x46, 0x38]

/** Builds a minimally-valid PNG payload: magic bytes padded to clear the size floor. */
const pngBytes = (size = 1200): Uint8Array => {
  const bytes = new Uint8Array(size)
  PNG_MAGIC_BYTES.forEach((byte, index) => {
    bytes[index] = byte
  })
  return bytes
}

const nonPngBytes = (magicBytes: number[], size = 1200): Uint8Array => {
  const bytes = new Uint8Array(size)
  magicBytes.forEach((byte, index) => {
    bytes[index] = byte
  })
  return bytes
}

const imageResponse = (init: Partial<{contentType: string; bytes: Uint8Array; ok: boolean; status: number}> = {}) => {
  const bytes = init.bytes ?? pngBytes()
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: 'OK',
    headers: new Headers({'content-type': init.contentType ?? 'image/png'}),
    arrayBuffer: async () => bytes.buffer,
  } as unknown as Response
}

const jsonResponse = (body: unknown, init: Partial<{status: number; headers: Record<string, string>}> = {}) =>
  ({
    ok: (init.status ?? 200) < 400,
    status: init.status ?? 200,
    statusText: init.status && init.status >= 400 ? 'Error' : 'OK',
    headers: new Headers(init.headers ?? {}),
    json: async () => body,
  }) as unknown as Response

const graphQLResponse = (urls: Record<string, string | null>) =>
  jsonResponse({
    data: Object.fromEntries(
      Object.entries(urls).map(([alias, url]) => [alias, url === null ? null : {openGraphImageUrl: url}]),
    ),
  })

const makeRepo = (overrides: Partial<RefreshRepo> & {id: number; full_name: string}): RefreshRepo => ({
  description: 'A great project',
  fork: false,
  archived: false,
  topics: ['portfolio'],
  ...overrides,
})

describe('project-preview-refresh script', () => {
  describe('truncateForLog', () => {
    it('leaves short strings untouched', () => {
      expect(truncateForLog('hello')).toBe('hello')
    })

    it('truncates long strings to 200 chars with an ellipsis', () => {
      const long = 'a'.repeat(250)
      const result = truncateForLog(long)
      expect(result.endsWith('…')).toBe(true)
      expect(result.length).toBe(201)
    })
  })

  describe('previewFilename', () => {
    it('derives the bare filename from the shared path helper', () => {
      expect(previewFilename(42)).toBe('42.png')
    })

    it('returns undefined for an invalid id', () => {
      expect(previewFilename(0)).toBeUndefined()
      expect(previewFilename(-1)).toBeUndefined()
    })
  })

  describe('isPortfolioRepo', () => {
    it('accepts a non-fork, non-archived, described, portfolio-tagged repo', () => {
      expect(isPortfolioRepo(makeRepo({id: 1, full_name: 'user/repo'}))).toBe(true)
    })

    it('rejects a fork', () => {
      expect(isPortfolioRepo(makeRepo({id: 1, full_name: 'user/repo', fork: true}))).toBe(false)
    })

    it('rejects an archived repo', () => {
      expect(isPortfolioRepo(makeRepo({id: 1, full_name: 'user/repo', archived: true}))).toBe(false)
    })

    it('rejects a repo with no description', () => {
      expect(isPortfolioRepo(makeRepo({id: 1, full_name: 'user/repo', description: null}))).toBe(false)
    })

    it('rejects a repo without the portfolio topic', () => {
      expect(isPortfolioRepo(makeRepo({id: 1, full_name: 'user/repo', topics: ['other']}))).toBe(false)
    })

    it('rejects the site repo by case-normalized full_name', () => {
      expect(isPortfolioRepo(makeRepo({id: 1, full_name: 'MarcusRBrown/Marcusrbrown.GitHub.io'}))).toBe(false)
    })
  })

  describe('fetchPreviewImage', () => {
    const headers = {accept: 'image/*'}

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('fetches the resolved custom GitHub image URL and returns the validated buffer', async () => {
      const fetchMock = vi.fn().mockResolvedValue(imageResponse())
      vi.stubGlobal('fetch', fetchMock)

      const url = 'https://repository-images.githubusercontent.com/1297795539/custom.png'
      const result = await fetchPreviewImage(url, headers)

      expect(fetchMock).toHaveBeenCalledWith(url, expect.objectContaining({headers}))
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.buffer.length).toBeGreaterThanOrEqual(1024)
    })

    it('classifies a non-image content-type as transport (broken response, not a non-PNG image)', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(imageResponse({contentType: 'text/html'})))
      const result = await fetchPreviewImage('https://opengraph.githubassets.com/1/user/repo', headers)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.kind).toBe('transport')
    })

    it('fails on a body below the minimum byte floor', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(imageResponse({bytes: pngBytes(10)})))
      const result = await fetchPreviewImage('https://opengraph.githubassets.com/1/user/repo', headers)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.kind).toBe('transport')
    })

    it('fails when PNG magic bytes are missing even with correct content-type and size', async () => {
      const garbage = new Uint8Array(1200).fill(0)
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(imageResponse({bytes: garbage})))
      const result = await fetchPreviewImage('https://opengraph.githubassets.com/1/user/repo', headers)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.kind).toBe('format')
    })

    it('fails on a non-ok HTTP response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(imageResponse({ok: false, status: 404})))
      const result = await fetchPreviewImage('https://opengraph.githubassets.com/1/user/repo', headers)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.kind).toBe('transport')
    })

    it('fails cleanly on a timeout', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('The operation was aborted.', 'TimeoutError')))
      const result = await fetchPreviewImage('https://opengraph.githubassets.com/1/user/repo', headers)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.kind).toBe('transport')
    })
  })

  describe('buildPreviewBatch (fail-safe matrix)', () => {
    const headers = {accept: 'image/*'}

    it('is fatal when a previously-committed repo fails to fetch', async () => {
      const repos = [makeRepo({id: 1, full_name: 'user/repo-1'})]
      const fetchImage = vi.fn().mockResolvedValue({ok: false, reason: 'boom', kind: 'transport'})
      const urlMap = new Map([[1, 'https://opengraph.githubassets.com/1/user/repo-1']])

      const result = await buildPreviewBatch(repos, new Set([1]), headers, urlMap, fetchImage)

      expect(result.fatalError).toContain('user/repo-1')
      expect(result.images.size).toBe(0)
    })

    it('skips (does not fail) a new repo whose fetch fails, while others still succeed', async () => {
      const repos = [makeRepo({id: 1, full_name: 'user/repo-1'}), makeRepo({id: 2, full_name: 'user/repo-2'})]
      const fetchImage = vi
        .fn()
        .mockResolvedValueOnce({ok: false, reason: 'boom', kind: 'transport'})
        .mockResolvedValueOnce({ok: true, buffer: Buffer.from(pngBytes())})
      const urlMap = new Map([
        [1, 'https://opengraph.githubassets.com/1/user/repo-1'],
        [2, 'https://opengraph.githubassets.com/1/user/repo-2'],
      ])

      const result = await buildPreviewBatch(repos, new Set(), headers, urlMap, fetchImage)

      expect(result.fatalError).toBeNull()
      expect(result.skipped).toEqual([{id: 1, reason: 'boom'}])
      expect(result.images.has(2)).toBe(true)
    })

    it('returns an empty batch for an empty portfolio set', async () => {
      const fetchImage = vi.fn()
      const result = await buildPreviewBatch([], new Set(), headers, new Map(), fetchImage)
      expect(result.fatalError).toBeNull()
      expect(result.images.size).toBe(0)
      expect(result.skipped).toEqual([])
      expect(fetchImage).not.toHaveBeenCalled()
    })
  })

  describe('refreshPreviewImages (integration)', () => {
    let tmpDir: string
    let outputDir: string

    beforeEach(() => {
      tmpDir = mkdtempSync(join(tmpdir(), 'project-preview-refresh-test-'))
      outputDir = join(tmpDir, 'project-previews')
    })

    afterEach(() => {
      rmSync(tmpDir, {recursive: true, force: true})
      vi.unstubAllGlobals()
      process.exitCode = 0
    })

    const repoListingBody = (repos: Record<string, unknown>[]) => repos

    it('fetches custom and generated Open Graph URLs without forwarding the GitHub token', async () => {
      const customUrl = 'https://repository-images.githubusercontent.com/1297795539/custom.png'
      const generatedUrl = 'https://opengraph.githubassets.com/abc/user/repo-2'
      const customBytes = pngBytes(1300)
      customBytes[100] = 1
      const generatedBytes = pngBytes(1400)
      generatedBytes[100] = 2
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(
            repoListingBody([
              {
                id: 1,
                full_name: 'user/repo-1',
                description: 'desc',
                fork: false,
                archived: false,
                topics: ['portfolio'],
              },
              {
                id: 2,
                full_name: 'user/repo-2',
                description: 'desc',
                fork: false,
                archived: false,
                topics: ['portfolio'],
              },
            ]),
          ),
        )
        .mockResolvedValueOnce(graphQLResponse({r0: customUrl, r1: generatedUrl}))
        .mockResolvedValueOnce(imageResponse({bytes: customBytes}))
        .mockResolvedValueOnce(imageResponse({bytes: generatedBytes}))
      vi.stubGlobal('fetch', fetchMock)

      await refreshPreviewImages({outputDir, username: 'marcusrbrown', token: 'secret-token'})

      expect(process.exitCode).toBe(0)

      const listingCall = fetchMock.mock.calls.find((call: unknown[]) =>
        (call[0] as string).includes('/users/marcusrbrown/repos'),
      )
      const graphQLCall = fetchMock.mock.calls.find((call: unknown[]) => (call[0] as string).endsWith('/graphql'))
      const customImageCall = fetchMock.mock.calls.find((call: unknown[]) => call[0] === customUrl)
      const generatedImageCall = fetchMock.mock.calls.find((call: unknown[]) => call[0] === generatedUrl)

      expect(listingCall).toBeDefined()
      expect(graphQLCall).toBeDefined()
      expect(customImageCall).toBeDefined()
      expect(generatedImageCall).toBeDefined()

      const listingHeaders = listingCall?.[1]?.headers as Record<string, string>
      const graphQLHeaders = graphQLCall?.[1]?.headers as Record<string, string>
      const customImageHeaders = customImageCall?.[1]?.headers as Record<string, string>
      const generatedImageHeaders = generatedImageCall?.[1]?.headers as Record<string, string>
      const graphQLInit = graphQLCall?.[1] as RequestInit | undefined

      expect(listingHeaders.authorization).toBe('Bearer secret-token')
      expect(graphQLHeaders.authorization).toBe('Bearer secret-token')
      expect(graphQLHeaders['content-type']).toBe('application/json')
      expect(graphQLInit?.method).toBe('POST')
      expect(graphQLInit?.body).toContain('r0: repository')
      expect(graphQLInit?.body).toContain('r1: repository')
      expect(customImageHeaders.authorization).toBeUndefined()
      expect(generatedImageHeaders.authorization).toBeUndefined()
      expect(
        fetchMock.mock.calls.some((call: unknown[]) => call[0] === 'https://opengraph.githubassets.com/1/user/repo-1'),
      ).toBe(false)
      expect(readFileSync(join(outputDir, '1.png'))).toEqual(Buffer.from(customBytes))
      expect(readFileSync(join(outputDir, '2.png'))).toEqual(Buffer.from(generatedBytes))
    })

    it.each([
      ['JPG', 'image/jpeg', nonPngBytes(JPEG_MAGIC_BYTES)],
      ['GIF', 'image/gif', nonPngBytes(GIF_MAGIC_BYTES)],
    ])(
      'falls back to the generated PNG when a custom %s preview is not a PNG',
      async (_format, contentType, customBytes) => {
        const customUrl = 'https://repository-images.githubusercontent.com/1297795539/custom-image'
        const fallbackUrl = 'https://opengraph.githubassets.com/1/user/repo-1'
        const generatedBytes = pngBytes(1400)
        generatedBytes[100] = 7
        const fetchMock = vi
          .fn()
          .mockResolvedValueOnce(
            jsonResponse(
              repoListingBody([
                {
                  id: 1,
                  full_name: 'user/repo-1',
                  description: 'desc',
                  fork: false,
                  archived: false,
                  topics: ['portfolio'],
                },
              ]),
            ),
          )
          .mockResolvedValueOnce(graphQLResponse({r0: customUrl}))
          .mockResolvedValueOnce(imageResponse({contentType, bytes: customBytes}))
          .mockResolvedValueOnce(imageResponse({bytes: generatedBytes}))
        vi.stubGlobal('fetch', fetchMock)

        await refreshPreviewImages({outputDir, username: 'marcusrbrown', token: 'secret-token'})

        expect(process.exitCode).toBe(0)
        expect(fetchMock.mock.calls.some((call: unknown[]) => call[0] === fallbackUrl)).toBe(true)
        const customImageCall = fetchMock.mock.calls.find((call: unknown[]) => call[0] === customUrl)
        const fallbackImageCall = fetchMock.mock.calls.find((call: unknown[]) => call[0] === fallbackUrl)
        expect((customImageCall?.[1]?.headers as Record<string, string>).authorization).toBeUndefined()
        expect((fallbackImageCall?.[1]?.headers as Record<string, string>).authorization).toBeUndefined()
        expect(readFileSync(join(outputDir, '1.png'))).toEqual(Buffer.from(generatedBytes))
      },
    )

    it('does not fall back after a published custom preview transport failure', async () => {
      const customUrl = 'https://repository-images.githubusercontent.com/1297795539/custom-image'
      const fallbackUrl = 'https://opengraph.githubassets.com/1/user/repo-1'
      mkdirSync(outputDir, {recursive: true})
      writeFileSync(join(outputDir, '1.png'), Buffer.from('old-content'))

      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(
            repoListingBody([
              {
                id: 1,
                full_name: 'user/repo-1',
                description: 'desc',
                fork: false,
                archived: false,
                topics: ['portfolio'],
              },
            ]),
          ),
        )
        .mockResolvedValueOnce(graphQLResponse({r0: customUrl}))
        .mockResolvedValueOnce(imageResponse({ok: false, status: 500}))
        .mockResolvedValueOnce(imageResponse())
      vi.stubGlobal('fetch', fetchMock)

      await refreshPreviewImages({outputDir, username: 'marcusrbrown', token: 'secret-token'})

      expect(process.exitCode).toBe(1)
      expect(fetchMock.mock.calls.some((call: unknown[]) => call[0] === fallbackUrl)).toBe(false)
      expect(fetchMock).toHaveBeenCalledTimes(3)
      const customImageCall = fetchMock.mock.calls.find((call: unknown[]) => call[0] === customUrl)
      expect((customImageCall?.[1]?.headers as Record<string, string>).authorization).toBeUndefined()
      expect(readFileSync(join(outputDir, '1.png'), 'utf8')).toBe('old-content')
    })

    it('does not fall back when a published custom preview returns a 200 text/html error page', async () => {
      const customUrl = 'https://repository-images.githubusercontent.com/1297795539/custom-image'
      const fallbackUrl = 'https://opengraph.githubassets.com/1/user/repo-1'
      mkdirSync(outputDir, {recursive: true})
      writeFileSync(join(outputDir, '1.png'), Buffer.from('old-content'))

      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(
            repoListingBody([
              {
                id: 1,
                full_name: 'user/repo-1',
                description: 'desc',
                fork: false,
                archived: false,
                topics: ['portfolio'],
              },
            ]),
          ),
        )
        .mockResolvedValueOnce(graphQLResponse({r0: customUrl}))
        // A CDN/proxy error page served as 200 text/html (>= MIN_IMAGE_BYTES):
        // must be treated as transport, not a non-PNG image, so no fallback and
        // the committed custom asset is preserved.
        .mockResolvedValueOnce(imageResponse({contentType: 'text/html', bytes: new Uint8Array(1200).fill(60)}))
        .mockResolvedValueOnce(imageResponse())
      vi.stubGlobal('fetch', fetchMock)

      await refreshPreviewImages({outputDir, username: 'marcusrbrown', token: 'secret-token'})

      expect(process.exitCode).toBe(1)
      expect(fetchMock.mock.calls.some((call: unknown[]) => call[0] === fallbackUrl)).toBe(false)
      expect(readFileSync(join(outputDir, '1.png'), 'utf8')).toBe('old-content')
    })

    it.each([
      ['new', false],
      ['published', true],
    ])(
      'does not fall back after a custom preview body-too-small failure (%s repo)',
      async (_repoState, wasPublished) => {
        const customUrl = 'https://repository-images.githubusercontent.com/1297795539/custom-image'
        const fallbackUrl = 'https://opengraph.githubassets.com/1/user/repo-1'
        if (wasPublished) {
          mkdirSync(outputDir, {recursive: true})
          writeFileSync(join(outputDir, '1.png'), Buffer.from('old-content'))
        }

        const fetchMock = vi
          .fn()
          .mockResolvedValueOnce(
            jsonResponse(
              repoListingBody([
                {
                  id: 1,
                  full_name: 'user/repo-1',
                  description: 'desc',
                  fork: false,
                  archived: false,
                  topics: ['portfolio'],
                },
              ]),
            ),
          )
          .mockResolvedValueOnce(graphQLResponse({r0: customUrl}))
          .mockResolvedValueOnce(imageResponse({bytes: pngBytes(10)}))
          .mockResolvedValueOnce(imageResponse())
        vi.stubGlobal('fetch', fetchMock)

        await refreshPreviewImages({outputDir, username: 'marcusrbrown', token: 'secret-token'})

        expect(process.exitCode).toBe(wasPublished ? 1 : 0)
        expect(fetchMock.mock.calls.some((call: unknown[]) => call[0] === fallbackUrl)).toBe(false)
        expect(fetchMock).toHaveBeenCalledTimes(3)
        const customImageCall = fetchMock.mock.calls.find((call: unknown[]) => call[0] === customUrl)
        expect((customImageCall?.[1]?.headers as Record<string, string>).authorization).toBeUndefined()
        if (wasPublished) {
          expect(readFileSync(join(outputDir, '1.png'), 'utf8')).toBe('old-content')
        } else {
          expect(existsSync(join(outputDir, '1.png'))).toBe(false)
        }
      },
    )

    it.each([
      ['new', false],
      ['published', true],
    ])('does not fall back when the generated card fails validation (%s repo)', async (_repoState, wasPublished) => {
      const generatedUrl = 'https://opengraph.githubassets.com/1/user/repo-1'
      if (wasPublished) {
        mkdirSync(outputDir, {recursive: true})
        writeFileSync(join(outputDir, '1.png'), Buffer.from('old-content'))
      }
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(
            repoListingBody([
              {
                id: 1,
                full_name: 'user/repo-1',
                description: 'desc',
                fork: false,
                archived: false,
                topics: ['portfolio'],
              },
            ]),
          ),
        )
        .mockResolvedValueOnce(graphQLResponse({r0: generatedUrl}))
        .mockResolvedValueOnce(imageResponse({bytes: nonPngBytes(JPEG_MAGIC_BYTES)}))
      vi.stubGlobal('fetch', fetchMock)

      await refreshPreviewImages({outputDir, username: 'marcusrbrown', token: undefined})

      expect(process.exitCode).toBe(wasPublished ? 1 : 0)
      expect(fetchMock.mock.calls.some((call: unknown[]) => call[0] === generatedUrl)).toBe(true)
      expect(fetchMock).toHaveBeenCalledTimes(3)
      if (wasPublished) {
        expect(readFileSync(join(outputDir, '1.png'), 'utf8')).toBe('old-content')
      } else {
        expect(existsSync(join(outputDir, '1.png'))).toBe(false)
      }
    })

    it.each([
      ['new', false],
      ['published', true],
    ])(
      'applies the existing fail-safe when custom and generated previews both fail (%s repo)',
      async (_repoState, wasPublished) => {
        const customUrl = 'https://repository-images.githubusercontent.com/1297795539/custom-image'
        const fallbackUrl = 'https://opengraph.githubassets.com/1/user/repo-1'
        if (wasPublished) {
          mkdirSync(outputDir, {recursive: true})
          writeFileSync(join(outputDir, '1.png'), Buffer.from('old-content'))
        }
        const fetchMock = vi
          .fn()
          .mockResolvedValueOnce(
            jsonResponse(
              repoListingBody([
                {
                  id: 1,
                  full_name: 'user/repo-1',
                  description: 'desc',
                  fork: false,
                  archived: false,
                  topics: ['portfolio'],
                },
              ]),
            ),
          )
          .mockResolvedValueOnce(graphQLResponse({r0: customUrl}))
          .mockResolvedValueOnce(imageResponse({contentType: 'image/jpeg', bytes: nonPngBytes(JPEG_MAGIC_BYTES)}))
          .mockResolvedValueOnce(imageResponse({bytes: nonPngBytes(GIF_MAGIC_BYTES)}))
        vi.stubGlobal('fetch', fetchMock)

        await refreshPreviewImages({outputDir, username: 'marcusrbrown', token: undefined})

        expect(process.exitCode).toBe(wasPublished ? 1 : 0)
        expect(fetchMock.mock.calls.some((call: unknown[]) => call[0] === fallbackUrl)).toBe(true)
        expect(fetchMock).toHaveBeenCalledTimes(4)
        if (wasPublished) {
          expect(readFileSync(join(outputDir, '1.png'), 'utf8')).toBe('old-content')
        } else {
          expect(existsSync(join(outputDir, '1.png'))).toBe(false)
        }
      },
    )

    it('happy path: writes one file for a valid portfolio repo and exits 0', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(
            repoListingBody([
              {
                id: 1,
                full_name: 'user/repo-1',
                description: 'desc',
                fork: false,
                archived: false,
                topics: ['portfolio'],
              },
            ]),
          ),
        )
        .mockResolvedValueOnce(graphQLResponse({r0: 'https://opengraph.githubassets.com/1/user/repo-1'}))
        .mockResolvedValueOnce(imageResponse())
      vi.stubGlobal('fetch', fetchMock)

      await refreshPreviewImages({outputDir, username: 'marcusrbrown', token: undefined})

      expect(process.exitCode).toBe(0)
      expect(existsSync(join(outputDir, '1.png'))).toBe(true)
    })

    it('skips a new repo when GraphQL returns an off-origin Open Graph URL', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(
            repoListingBody([
              {
                id: 1,
                full_name: 'user/repo-1',
                description: 'desc',
                fork: false,
                archived: false,
                topics: ['portfolio'],
              },
            ]),
          ),
        )
        .mockResolvedValueOnce(graphQLResponse({r0: 'https://evil.example/x.png'}))
      vi.stubGlobal('fetch', fetchMock)

      await refreshPreviewImages({outputDir, username: 'marcusrbrown', token: undefined})

      expect(process.exitCode).toBe(0)
      expect(existsSync(join(outputDir, '1.png'))).toBe(false)
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('fails fatally when a previously-published repo has an off-origin Open Graph URL', async () => {
      mkdirSync(outputDir, {recursive: true})
      writeFileSync(join(outputDir, '1.png'), Buffer.from('old-content'))

      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(
            repoListingBody([
              {
                id: 1,
                full_name: 'user/repo-1',
                description: 'desc',
                fork: false,
                archived: false,
                topics: ['portfolio'],
              },
            ]),
          ),
        )
        .mockResolvedValueOnce(graphQLResponse({r0: 'https://evil.example/x.png'}))
      vi.stubGlobal('fetch', fetchMock)

      await refreshPreviewImages({outputDir, username: 'marcusrbrown', token: undefined})

      expect(process.exitCode).toBe(1)
      expect(existsSync(join(outputDir, '1.png'))).toBe(true)
      expect(readFileSync(join(outputDir, '1.png'), 'utf8')).toBe('old-content')
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('empty portfolio set: no files written, exit 0', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse([])))

      await refreshPreviewImages({outputDir, username: 'marcusrbrown', token: undefined})

      expect(process.exitCode).toBe(0)
      expect(existsSync(outputDir) ? readdirSync(outputDir) : []).toEqual([])
    })

    it('listing fetch failure is fatal and prunes nothing', async () => {
      mkdirSync(outputDir, {recursive: true})
      writeFileSync(join(outputDir, '1.png'), Buffer.from(pngBytes()))

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, {status: 500})))

      await refreshPreviewImages({outputDir, username: 'marcusrbrown', token: undefined})

      expect(process.exitCode).toBe(1)
      expect(existsSync(join(outputDir, '1.png'))).toBe(true)
    })

    it('follows a same-origin api.github.com next link across pages', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(
            repoListingBody([
              {
                id: 1,
                full_name: 'user/repo-1',
                description: 'desc',
                fork: false,
                archived: false,
                topics: ['portfolio'],
              },
            ]),
            {headers: {link: '<https://api.github.com/user/12345/repos?page=2>; rel="next"'}},
          ),
        )
        .mockResolvedValueOnce(
          jsonResponse(
            repoListingBody([
              {
                id: 2,
                full_name: 'user/repo-2',
                description: 'desc',
                fork: false,
                archived: false,
                topics: ['portfolio'],
              },
            ]),
          ),
        )
        .mockResolvedValueOnce(
          graphQLResponse({
            r0: 'https://opengraph.githubassets.com/1/user/repo-1',
            r1: 'https://opengraph.githubassets.com/1/user/repo-2',
          }),
        )
        .mockResolvedValueOnce(imageResponse())
        .mockResolvedValueOnce(imageResponse())
      vi.stubGlobal('fetch', fetchMock)

      await refreshPreviewImages({outputDir, username: 'marcusrbrown', token: undefined})

      expect(process.exitCode).toBe(0)
      expect(existsSync(join(outputDir, '1.png'))).toBe(true)
      expect(existsSync(join(outputDir, '2.png'))).toBe(true)
      // listing page 1 + page 2 + GraphQL resolution + 2 image fetches
      expect(fetchMock).toHaveBeenCalledTimes(5)
    })

    it('stops pagination at an off-origin next link and never sends the token off-origin', async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce(
        jsonResponse(repoListingBody([]), {
          headers: {link: '<https://evil.example.com/steal?token=1>; rel="next"'},
        }),
      )
      vi.stubGlobal('fetch', fetchMock)

      await refreshPreviewImages({outputDir, username: 'marcusrbrown', token: 'secret-token'})

      expect(process.exitCode).toBe(0)
      // Only the first (same-origin) listing request was made — pagination
      // stopped rather than following the off-origin next link.
      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [url] = fetchMock.mock.calls[0] as [string]
      expect(url).toContain('api.github.com')
      expect(fetchMock.mock.calls.some((call: unknown[]) => (call[0] as string).includes('evil.example.com'))).toBe(
        false,
      )
    })

    it('previously-committed repo fetch failure is fatal, existing files unchanged', async () => {
      mkdirSync(outputDir, {recursive: true})
      writeFileSync(join(outputDir, '1.png'), Buffer.from('old-content'))

      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(
            repoListingBody([
              {
                id: 1,
                full_name: 'user/repo-1',
                description: 'desc',
                fork: false,
                archived: false,
                topics: ['portfolio'],
              },
            ]),
          ),
        )
        .mockResolvedValueOnce(graphQLResponse({r0: 'https://opengraph.githubassets.com/1/user/repo-1'}))
        .mockResolvedValueOnce(imageResponse({ok: false, status: 500}))
      vi.stubGlobal('fetch', fetchMock)

      await refreshPreviewImages({outputDir, username: 'marcusrbrown', token: undefined})

      expect(process.exitCode).toBe(1)
      expect(readdirSync(outputDir)).toEqual(['1.png'])
      expect(readFileSync(join(outputDir, '1.png'), 'utf8')).toBe('old-content')
    })

    it('new repo fetch failure is a warn-and-skip: others still written, exit 0', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(
            repoListingBody([
              {
                id: 1,
                full_name: 'user/repo-1',
                description: 'desc',
                fork: false,
                archived: false,
                topics: ['portfolio'],
              },
              {
                id: 2,
                full_name: 'user/repo-2',
                description: 'desc',
                fork: false,
                archived: false,
                topics: ['portfolio'],
              },
            ]),
          ),
        )
        .mockResolvedValueOnce(
          graphQLResponse({
            r0: 'https://opengraph.githubassets.com/1/user/repo-1',
            r1: 'https://opengraph.githubassets.com/1/user/repo-2',
          }),
        )
        .mockResolvedValueOnce(imageResponse({ok: false, status: 500}))
        .mockResolvedValueOnce(imageResponse())
      vi.stubGlobal('fetch', fetchMock)

      await refreshPreviewImages({outputDir, username: 'marcusrbrown', token: undefined})

      expect(process.exitCode).toBe(0)
      expect(existsSync(join(outputDir, '1.png'))).toBe(false)
      expect(existsSync(join(outputDir, '2.png'))).toBe(true)
    })

    it('first-request timeout (network down) is fatal, assets untouched', async () => {
      mkdirSync(outputDir, {recursive: true})
      writeFileSync(join(outputDir, '1.png'), Buffer.from('old-content'))

      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('timeout', 'TimeoutError')))

      await refreshPreviewImages({outputDir, username: 'marcusrbrown', token: undefined})

      expect(process.exitCode).toBe(1)
      expect(readFileSync(join(outputDir, '1.png'), 'utf8')).toBe('old-content')
    })

    it('R9: a repo absent from a successful listing has its committed image pruned', async () => {
      mkdirSync(outputDir, {recursive: true})
      writeFileSync(join(outputDir, '1.png'), Buffer.from(pngBytes()))
      writeFileSync(join(outputDir, '2.png'), Buffer.from(pngBytes()))

      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(
            repoListingBody([
              {
                id: 1,
                full_name: 'user/repo-1',
                description: 'desc',
                fork: false,
                archived: false,
                topics: ['portfolio'],
              },
            ]),
          ),
        )
        .mockResolvedValueOnce(graphQLResponse({r0: 'https://opengraph.githubassets.com/1/user/repo-1'}))
        .mockResolvedValueOnce(imageResponse())
      vi.stubGlobal('fetch', fetchMock)

      await refreshPreviewImages({outputDir, username: 'marcusrbrown', token: undefined})

      expect(process.exitCode).toBe(0)
      expect(existsSync(join(outputDir, '1.png'))).toBe(true)
      expect(existsSync(join(outputDir, '2.png'))).toBe(false)
    })

    it('R9: a failed listing fetch prunes nothing', async () => {
      mkdirSync(outputDir, {recursive: true})
      writeFileSync(join(outputDir, '1.png'), Buffer.from(pngBytes()))

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, {status: 500})))

      await refreshPreviewImages({outputDir, username: 'marcusrbrown', token: undefined})

      expect(process.exitCode).toBe(1)
      expect(existsSync(join(outputDir, '1.png'))).toBe(true)
    })

    it('publish-before-prune: a rename failure during publish leaves the stale asset intact and surfaces the error', async () => {
      mkdirSync(outputDir, {recursive: true})
      // repo 2's asset is stale — it would be pruned on a successful run since
      // only repo 1 is in the new listing.
      writeFileSync(join(outputDir, '2.png'), Buffer.from('stale-content'))
      // Force the publish rename for repo 1 to fail: renaming a staged FILE onto
      // an existing non-empty DIRECTORY of the same name is a real fs failure
      // (no fs mocking needed), simulating any real-world rename error.
      mkdirSync(join(outputDir, '1.png'), {recursive: true})
      writeFileSync(join(outputDir, '1.png', 'blocking-file'), 'x')

      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(
            repoListingBody([
              {
                id: 1,
                full_name: 'user/repo-1',
                description: 'desc',
                fork: false,
                archived: false,
                topics: ['portfolio'],
              },
            ]),
          ),
        )
        .mockResolvedValueOnce(graphQLResponse({r0: 'https://opengraph.githubassets.com/1/user/repo-1'}))
        .mockResolvedValueOnce(imageResponse())
      vi.stubGlobal('fetch', fetchMock)

      await refreshPreviewImages({outputDir, username: 'marcusrbrown', token: undefined})

      expect(process.exitCode).toBe(1)
      // The rename failure happened before pruning ever got a chance to run, so
      // repo 2's stale asset must still be there, untouched.
      expect(readFileSync(join(outputDir, '2.png'), 'utf8')).toBe('stale-content')
      // The blocking directory that caused the rename failure is still there,
      // proving no successful publish silently replaced it either.
      expect(existsSync(join(outputDir, '1.png', 'blocking-file'))).toBe(true)
    })

    it('publish-before-prune: happy-path prune still removes a stale asset when publish succeeds', async () => {
      mkdirSync(outputDir, {recursive: true})
      writeFileSync(join(outputDir, '1.png'), Buffer.from(pngBytes()))
      writeFileSync(join(outputDir, '2.png'), Buffer.from(pngBytes()))

      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(
            repoListingBody([
              {
                id: 1,
                full_name: 'user/repo-1',
                description: 'desc',
                fork: false,
                archived: false,
                topics: ['portfolio'],
              },
            ]),
          ),
        )
        .mockResolvedValueOnce(graphQLResponse({r0: 'https://opengraph.githubassets.com/1/user/repo-1'}))
        .mockResolvedValueOnce(imageResponse())
      vi.stubGlobal('fetch', fetchMock)

      await refreshPreviewImages({outputDir, username: 'marcusrbrown', token: undefined})

      expect(process.exitCode).toBe(0)
      expect(existsSync(join(outputDir, '1.png'))).toBe(true)
      expect(existsSync(join(outputDir, '2.png'))).toBe(false)
    })

    it('mid-batch failure leaves no half-written file and removes the staging dir', async () => {
      mkdirSync(outputDir, {recursive: true})
      writeFileSync(join(outputDir, '2.png'), Buffer.from('old-content'))

      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(
            repoListingBody([
              {
                id: 1,
                full_name: 'user/repo-1',
                description: 'desc',
                fork: false,
                archived: false,
                topics: ['portfolio'],
              },
              {
                id: 2,
                full_name: 'user/repo-2',
                description: 'desc',
                fork: false,
                archived: false,
                topics: ['portfolio'],
              },
            ]),
          ),
        )
        .mockResolvedValueOnce(
          graphQLResponse({
            r0: 'https://opengraph.githubassets.com/1/user/repo-1',
            r1: 'https://opengraph.githubassets.com/1/user/repo-2',
          }),
        )
        .mockResolvedValueOnce(imageResponse())
        .mockResolvedValueOnce(imageResponse({ok: false, status: 500}))
      vi.stubGlobal('fetch', fetchMock)

      await refreshPreviewImages({outputDir, username: 'marcusrbrown', token: undefined})

      expect(process.exitCode).toBe(1)
      // repo 1's fetch succeeded but repo 2 (previously committed) failed, which
      // aborts the whole batch — no repo-1 file is ever published, and repo 2's
      // pre-existing asset is left untouched.
      expect(existsSync(join(outputDir, '1.png'))).toBe(false)
      expect(readFileSync(join(outputDir, '2.png'), 'utf8')).toBe('old-content')
      const parentEntries = existsSync(tmpDir) ? readdirSync(tmpDir) : []
      expect(parentEntries.some(name => name.includes('.project-preview-refresh-staging-'))).toBe(false)
    })
  })
})
