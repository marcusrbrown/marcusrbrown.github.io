import type {BlogPostFull, BlogSnapshot} from '../../src/types'
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {
  buildSnapshot,
  GENERATOR,
  refreshBlogSnapshot,
  selectMarkdownSource,
  splitFrontmatter,
  truncateForLog,
  type RefreshCandidate,
} from '../../scripts/blog-refresh'

const emptySnapshot: BlogSnapshot = {posts: [], generatedAt: '2020-01-01T00:00:00.000Z', generator: GENERATOR}

const gistFile = (content: string) => ({content})

const candidate = (overrides: Partial<RefreshCandidate> & {gistId: string}): RefreshCandidate => ({
  gistUrl: `https://gist.github.com/marcusrbrown/${overrides.gistId}`,
  gistUpdatedAt: '2026-07-01T00:00:00.000Z',
  files: {},
  ...overrides,
})

const validPostMarkdown = (title: string, date: string, summary: string, extra = '') => `---
title: ${title}
date: ${date}
summary: ${summary}
${extra}---

# ${title}

Body content.
`

describe('blog-refresh script', () => {
  describe('splitFrontmatter', () => {
    it('splits a valid frontmatter block from the body', () => {
      const result = splitFrontmatter('---\ntitle: Hi\ndate: 2026-01-01\nsummary: Sum\n---\n\nBody text\n')
      expect(result).not.toBeNull()
      expect(result?.frontmatter).toEqual({title: 'Hi', date: '2026-01-01', summary: 'Sum'})
      expect(result?.body.trim()).toBe('Body text')
    })

    it('returns null when no frontmatter delimiters are present', () => {
      expect(splitFrontmatter('# Just a heading\n\nNo frontmatter here.')).toBeNull()
    })

    it('returns null for malformed YAML', () => {
      expect(splitFrontmatter('---\ntitle: [unterminated\n---\nBody')).toBeNull()
    })
  })

  describe('selectMarkdownSource', () => {
    it('uses the single Markdown file when only one exists', () => {
      const result = selectMarkdownSource({'post.md': gistFile('# Hello'), 'notes.txt': gistFile('irrelevant')})
      expect('error' in result).toBe(false)
      if (!('error' in result)) {
        expect(result.filename).toBe('post.md')
      }
    })

    it('deterministically selects the file whose frontmatter names itself via source', () => {
      const files = {
        'a-post.md': gistFile(validPostMarkdown('First', '2026-01-01', 'Summary', 'source: a-post.md\n')),
        'z-notes.md': gistFile('# Just some other markdown, no frontmatter'),
      }
      const result = selectMarkdownSource(files)
      expect('error' in result).toBe(false)
      if (!('error' in result)) {
        expect(result.filename).toBe('a-post.md')
      }
    })

    it('fails validation naming the gist scenario when multiple .md files have no source field', () => {
      const files = {
        'one.md': gistFile('# One, no frontmatter'),
        'two.md': gistFile('# Two, no frontmatter'),
      }
      const result = selectMarkdownSource(files)
      expect('error' in result).toBe(true)
      if ('error' in result) {
        expect(result.error).toContain('one.md')
        expect(result.error).toContain('two.md')
      }
    })

    it('reports an error when no Markdown file exists', () => {
      const result = selectMarkdownSource({'readme.txt': gistFile('nope')})
      expect('error' in result).toBe(true)
    })
  })

  describe('truncateForLog', () => {
    it('escapes HTML-significant characters', () => {
      expect(truncateForLog('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;')
    })

    it('truncates long strings to ~200 chars with an ellipsis', () => {
      const long = 'a'.repeat(300)
      const result = truncateForLog(long)
      expect(result.length).toBeLessThanOrEqual(201)
      expect(result.endsWith('…')).toBe(true)
    })
  })

  describe('buildSnapshot', () => {
    it.each([
      ['https://gist.github.com/marcusrbrown/valid-url', true],
      ['https://github.com/marcusrbrown/gist', true],
      ['http://gist.github.com/marcusrbrown/insecure', false],
      ['https://example.com/marcusrbrown/not-github', false],
      ['not a url', false],
    ])('accepts only safe gist URLs: %s', async (gistUrl, included) => {
      const result = await buildSnapshot(
        [
          candidate({
            gistId: `url-${included}`,
            gistUrl,
            files: {'post.md': gistFile(validPostMarkdown('URL Post', '2026-01-01', 'Summary'))},
          }),
        ],
        emptySnapshot,
      )

      expect(result.fatalError).toBeNull()
      expect(result.snapshot.posts).toHaveLength(included ? 1 : 0)
      expect(result.warnings).toHaveLength(included ? 0 : 1)
    })

    it('produces exactly two posts among six mixed candidates, reverse-date ordered, with rendered HTML', async () => {
      const candidates: RefreshCandidate[] = [
        candidate({
          gistId: 'valid-1',
          files: {'post.md': gistFile(validPostMarkdown('Older Post', '2026-01-01', 'Summary A'))},
        }),
        candidate({gistId: 'no-frontmatter', files: {'post.md': gistFile('# Just markdown, no frontmatter')}}),
        candidate({
          gistId: 'valid-2',
          files: {'post.md': gistFile(validPostMarkdown('Newer Post', '2026-02-01', 'Summary B'))},
        }),
        candidate({gistId: 'not-markdown', files: {'notes.txt': gistFile('irrelevant')}}),
        candidate({
          gistId: 'invalid-frontmatter',
          files: {'post.md': gistFile('---\ntitle: Missing fields\n---\n\nBody')},
        }),
        candidate({
          gistId: 'multi-md-no-source',
          files: {'one.md': gistFile('# One'), 'two.md': gistFile('# Two')},
        }),
      ]

      const result = await buildSnapshot(candidates, emptySnapshot)

      expect(result.fatalError).toBeNull()
      expect(result.snapshot.posts).toHaveLength(2)
      expect(result.snapshot.posts[0]?.frontmatter.title).toBe('Newer Post')
      expect(result.snapshot.posts[1]?.frontmatter.title).toBe('Older Post')
      expect(result.snapshot.posts[0]?.html).toContain('<h1')
      expect(result.warnings.length).toBeGreaterThanOrEqual(3)
    })

    it('produces a byte-identical snapshot (same generatedAt) on an unchanged rerun', async () => {
      const candidates: RefreshCandidate[] = [
        candidate({
          gistId: 'valid-1',
          files: {'post.md': gistFile(validPostMarkdown('Stable Post', '2026-01-01', 'Summary'))},
        }),
      ]

      const first = await buildSnapshot(candidates, emptySnapshot)
      expect(first.fatalError).toBeNull()

      const second = await buildSnapshot(candidates, first.snapshot)
      expect(second.fatalError).toBeNull()
      expect(JSON.stringify(second.snapshot)).toBe(JSON.stringify(first.snapshot))
      expect(second.snapshot.generatedAt).toBe(first.snapshot.generatedAt)
    })

    it('updates generatedAt when the content actually changes', async () => {
      const before = await buildSnapshot(
        [candidate({gistId: 'v1', files: {'post.md': gistFile(validPostMarkdown('V1', '2026-01-01', 'Summary'))}})],
        emptySnapshot,
      )
      await new Promise(resolve => setTimeout(resolve, 5))
      const after = await buildSnapshot(
        [
          candidate({gistId: 'v1', files: {'post.md': gistFile(validPostMarkdown('V1', '2026-01-01', 'Summary'))}}),
          candidate({gistId: 'v2', files: {'post.md': gistFile(validPostMarkdown('V2', '2026-01-02', 'Summary'))}}),
        ],
        before.snapshot,
      )
      expect(after.snapshot.posts).toHaveLength(2)
      expect(after.snapshot.generatedAt).not.toBe(before.snapshot.generatedAt)
    })

    it('hard-fails naming the slug when a previously published post is now malformed', async () => {
      const previousPost: BlogPostFull = {
        slug: 'my-post',
        frontmatter: {title: 'My Post', date: '2026-01-01', summary: 'Sum'},
        html: '<p>Body</p>',
        gistId: 'gist-1',
        gistUrl: 'https://gist.github.com/marcusrbrown/gist-1',
        gistUpdatedAt: '2026-01-01T00:00:00.000Z',
      }
      const previousSnapshot: BlogSnapshot = {
        posts: [previousPost],
        generatedAt: '2026-01-01T00:00:00.000Z',
        generator: GENERATOR,
      }

      const result = await buildSnapshot(
        [candidate({gistId: 'gist-1', files: {'post.md': gistFile('---\ntitle: Broken\n---\n\nBody')}})],
        previousSnapshot,
      )

      expect(result.fatalError).not.toBeNull()
      expect(result.fatalError).toContain('my-post')
      expect(result.snapshot).toBe(previousSnapshot)
    })

    it('hard-fails and preserves a previously published post with an invalid gist URL', async () => {
      const previousPost: BlogPostFull = {
        slug: 'url-sensitive-post',
        frontmatter: {title: 'URL Sensitive Post', date: '2026-01-01', summary: 'Sum'},
        html: '<p>Body</p>',
        gistId: 'gist-url-invalid',
        gistUrl: 'https://gist.github.com/gist-url-invalid',
        gistUpdatedAt: '2026-01-01T00:00:00.000Z',
      }
      const previousSnapshot: BlogSnapshot = {
        posts: [previousPost],
        generatedAt: '2026-01-01T00:00:00.000Z',
        generator: GENERATOR,
      }

      const result = await buildSnapshot(
        [
          candidate({
            gistId: 'gist-url-invalid',
            gistUrl: 'http://example.com/gist-url-invalid',
            files: {'post.md': gistFile(validPostMarkdown('URL Sensitive Post', '2026-01-01', 'Sum'))},
          }),
        ],
        previousSnapshot,
      )

      expect(result.fatalError).toContain('url-sensitive-post')
      expect(result.fatalError).toContain('gist-url-invalid')
      expect(result.fatalError).toContain('Invalid gist URL')
      expect(result.snapshot).toBe(previousSnapshot)
      expect(result.warnings).toHaveLength(0)
    })

    it('excludes a new candidate with invalid frontmatter, recording a warning, without failing the build', async () => {
      const result = await buildSnapshot(
        [candidate({gistId: 'new-invalid', files: {'post.md': gistFile('---\ntitle: Missing date\n---\n\nBody')}})],
        emptySnapshot,
      )

      expect(result.fatalError).toBeNull()
      expect(result.snapshot.posts).toHaveLength(0)
      expect(result.warnings).toHaveLength(1)
      expect(result.warnings[0]?.gistId).toBe('new-invalid')
    })

    it('drops a previously published post when its gist is absent from the successful fetch', async () => {
      const previousPost: BlogPostFull = {
        slug: 'deleted-post',
        frontmatter: {title: 'Deleted Post', date: '2026-01-01', summary: 'Sum'},
        html: '<p>Body</p>',
        gistId: 'gist-deleted',
        gistUrl: 'https://gist.github.com/marcusrbrown/gist-deleted',
        gistUpdatedAt: '2026-01-01T00:00:00.000Z',
      }
      const previousSnapshot: BlogSnapshot = {
        posts: [previousPost],
        generatedAt: '2026-01-01T00:00:00.000Z',
        generator: GENERATOR,
      }

      const result = await buildSnapshot([], previousSnapshot)

      expect(result.fatalError).toBeNull()
      expect(result.snapshot.posts).toHaveLength(0)
    })

    it('neutralizes hostile body markup and escapes a hostile frontmatter title, keeping GFM intact', async () => {
      const hostileMarkdown = `---
title: "Hostile <script>alert(1)</script> Title"
date: 2026-01-01
summary: "Summary <script>alert(1)</script>"
---

| A | B |
| --- | --- |
| 1 | 2 |

> A blockquote.

\`\`\`typescript
const x = 1
\`\`\`

<script>alert('xss')</script>

<img src="x" onerror="alert(1)">

- [x] completed task
- [ ] pending task
`
      const result = await buildSnapshot(
        [candidate({gistId: 'hostile', files: {'post.md': gistFile(hostileMarkdown)}})],
        emptySnapshot,
      )

      expect(result.fatalError).toBeNull()
      const post = result.snapshot.posts[0]
      expect(post).toBeDefined()
      expect(post?.frontmatter.title).toBe('Hostile <script>alert(1)</script> Title')
      expect(post?.frontmatter.summary).toBe('Summary <script>alert(1)</script>')
      expect(post?.html).not.toContain('<script>')
      expect(post?.html).not.toContain('onerror')
      expect(post?.html).toContain('<table')
      expect(post?.html).toContain('<blockquote')
      expect(post?.html).toContain('type="checkbox"')
      expect(post?.html).not.toContain('<script>')
    })

    it('keeps an existing gist slug stable when its title is edited, and derives a fresh slug for a new gist', async () => {
      const previousPost: BlogPostFull = {
        slug: 'original-slug',
        frontmatter: {title: 'Original Title', date: '2026-01-01', summary: 'Sum'},
        html: '<p>Body</p>',
        gistId: 'gist-existing',
        gistUrl: 'https://gist.github.com/marcusrbrown/gist-existing',
        gistUpdatedAt: '2026-01-01T00:00:00.000Z',
      }
      const previousSnapshot: BlogSnapshot = {
        posts: [previousPost],
        generatedAt: '2026-01-01T00:00:00.000Z',
        generator: GENERATOR,
      }

      const result = await buildSnapshot(
        [
          candidate({
            gistId: 'gist-existing',
            files: {'post.md': gistFile(validPostMarkdown('Edited Title', '2026-01-01', 'Sum'))},
          }),
          candidate({
            gistId: 'gist-new',
            files: {'post.md': gistFile(validPostMarkdown('Brand New', '2026-02-01', 'Sum'))},
          }),
        ],
        previousSnapshot,
      )

      expect(result.fatalError).toBeNull()
      const existing = result.snapshot.posts.find(p => p.gistId === 'gist-existing')
      const fresh = result.snapshot.posts.find(p => p.gistId === 'gist-new')
      expect(existing?.slug).toBe('original-slug')
      expect(fresh?.slug).toBe('brand-new')
    })
  })

  describe('refreshBlogSnapshot (integration)', () => {
    let tmpDir: string
    let snapshotPath: string

    beforeEach(() => {
      tmpDir = mkdtempSync(join(tmpdir(), 'blog-refresh-test-'))
      snapshotPath = join(tmpDir, 'blog-snapshot.json')
      writeFileSync(snapshotPath, `${JSON.stringify(emptySnapshot, null, 2)}\n`)
    })

    afterEach(() => {
      rmSync(tmpDir, {recursive: true, force: true})
      vi.unstubAllGlobals()
      vi.unstubAllEnvs()
    })

    it('exits non-zero and leaves the snapshot file untouched on a GitHub fetch failure', async () => {
      const before = readFileSync(snapshotPath, 'utf8')
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          json: async () => ({}),
        }),
      )

      await refreshBlogSnapshot({snapshotPath, username: 'marcusrbrown', token: undefined})

      expect(process.exitCode).toBe(1)
      process.exitCode = 0
      expect(readFileSync(snapshotPath, 'utf8')).toBe(before)
    })

    it('never sends GITHUB_TOKEN to the Gists API (App tokens are 403-rejected there)', async () => {
      // The Actions default GITHUB_TOKEN is a GitHub App installation token, which
      // the Gists REST API rejects with 403. Public gists list fine unauthenticated,
      // so an absent BLOG_REFRESH_TOKEN must fall back to no Authorization header —
      // never the App token.
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        json: async () => [],
      })
      vi.stubGlobal('fetch', fetchMock)
      vi.stubEnv('GITHUB_TOKEN', 'app-installation-token')
      vi.stubEnv('BLOG_REFRESH_TOKEN', '')

      await refreshBlogSnapshot({snapshotPath, username: 'marcusrbrown'})

      expect(process.exitCode).toBe(0)
      const [, init] = fetchMock.mock.calls[0] as [string, {headers: Record<string, string>}]
      expect(init.headers.authorization).toBeUndefined()
    })

    it('uses BLOG_REFRESH_TOKEN as the gist API bearer when present', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        json: async () => [],
      })
      vi.stubGlobal('fetch', fetchMock)
      vi.stubEnv('GITHUB_TOKEN', 'app-installation-token')
      vi.stubEnv('BLOG_REFRESH_TOKEN', 'fine-grained-pat')

      await refreshBlogSnapshot({snapshotPath, username: 'marcusrbrown'})

      expect(process.exitCode).toBe(0)
      const [, init] = fetchMock.mock.calls[0] as [string, {headers: Record<string, string>}]
      expect(init.headers.authorization).toBe('Bearer fine-grained-pat')
    })

    it('writes a snapshot with zero posts when no gists qualify, exiting zero', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => [],
        }),
      )

      await refreshBlogSnapshot({snapshotPath, username: 'marcusrbrown', token: undefined})

      expect(process.exitCode).toBe(0)
      const written = JSON.parse(readFileSync(snapshotPath, 'utf8')) as BlogSnapshot
      expect(written.posts).toEqual([])
      expect(written.generator).toBe(GENERATOR)
    })

    it('hard-fails and preserves a published post when its gist URL becomes invalid', async () => {
      const previous: BlogSnapshot = {
        ...emptySnapshot,
        posts: [
          {
            slug: 'published-post',
            frontmatter: {title: 'Published Post', date: '2026-01-01', summary: 'Sum'},
            html: '<p>old</p>',
            gistId: 'published-gist',
            gistUrl: 'https://gist.github.com/published-gist',
            gistUpdatedAt: '2026-01-01',
            sourceFilename: 'post.md',
          },
        ],
      }
      writeFileSync(snapshotPath, `${JSON.stringify(previous)}\n`)
      const before = readFileSync(snapshotPath, 'utf8')

      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: new Headers(),
            json: async () => [
              {
                id: 'published-gist',
                html_url: 'http://example.com/published-gist',
                updated_at: '2026-07-01',
                files: {'post.md': {}},
              },
            ],
          })
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: new Headers(),
            json: async () => ({
              id: 'published-gist',
              html_url: 'http://example.com/published-gist',
              updated_at: '2026-07-01',
              files: {'post.md': {content: validPostMarkdown('Published Post', '2026-01-01', 'Sum')}},
            }),
          }),
      )

      await refreshBlogSnapshot({snapshotPath, username: 'marcusrbrown'})

      expect(process.exitCode).toBe(1)
      process.exitCode = 0
      expect(readFileSync(snapshotPath, 'utf8')).toBe(before)
      expect(JSON.parse(readFileSync(snapshotPath, 'utf8'))).toEqual(previous)
    })

    it('fetches Markdown content from gist detail rather than trusting list metadata', async () => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: new Headers(),
            json: async () => [
              {
                id: 'metadata-only',
                html_url: 'https://gist.github.com/metadata-only',
                updated_at: '2026-01-01',
                files: {'post.md': {filename: 'post.md', raw_url: 'https://raw.example/post.md'}},
              },
            ],
          })
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: new Headers(),
            json: async () => ({
              id: 'metadata-only',
              html_url: 'https://gist.github.com/metadata-only',
              updated_at: '2026-01-01',
              files: {'post.md': {filename: 'post.md'}},
            }),
          }),
      )

      await refreshBlogSnapshot({snapshotPath, username: 'marcusrbrown'})

      const written = JSON.parse(readFileSync(snapshotPath, 'utf8')) as BlogSnapshot
      expect(written.posts).toEqual([])
      expect(fetch).toHaveBeenCalledTimes(2)
      expect(process.exitCode).toBe(1)
      process.exitCode = 0
    })

    it('follows pagination so a previously published gist on page two survives', async () => {
      const previous = {
        ...emptySnapshot,
        posts: [
          {
            slug: 'page-two',
            frontmatter: {title: 'Page Two', date: '2026-01-01', summary: 'Sum'},
            html: '<p>old</p>',
            gistId: 'page-two',
            gistUrl: 'https://gist.github.com/page-two',
            gistUpdatedAt: '2025-01-01',
            sourceFilename: 'post.md',
          },
        ],
      }
      writeFileSync(snapshotPath, `${JSON.stringify(previous)}\n`)
      const pageTwo = {
        id: 'page-two',
        html_url: 'https://gist.github.com/page-two',
        updated_at: '2026-01-01',
        files: {'post.md': {}},
      }
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: new Headers({link: '<https://api.github.com/users/marcusrbrown/gists?page=2>; rel="next"'}),
            json: async () => [],
          })
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: new Headers(),
            json: async () => [pageTwo],
          })
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: new Headers(),
            json: async () => ({
              ...pageTwo,
              files: {'post.md': {content: validPostMarkdown('Page Two', '2026-01-01', 'Sum')}},
            }),
          }),
      )

      await refreshBlogSnapshot({snapshotPath, username: 'marcusrbrown'})
      const written = JSON.parse(readFileSync(snapshotPath, 'utf8')) as BlogSnapshot
      expect(written.posts[0]?.gistId).toBe('page-two')
    })

    it.each(['invalid json', '{"posts":[],"generatedAt":"x"}'])(
      'fails before fetch for corrupt snapshot: %s',
      async raw => {
        writeFileSync(snapshotPath, raw)
        const before = readFileSync(snapshotPath, 'utf8')
        const fetchMock = vi.fn()
        vi.stubGlobal('fetch', fetchMock)
        await refreshBlogSnapshot({snapshotPath, username: 'marcusrbrown'})
        expect(process.exitCode).toBe(1)
        process.exitCode = 0
        expect(fetchMock).not.toHaveBeenCalled()
        expect(readFileSync(snapshotPath, 'utf8')).toBe(before)
      },
    )
  })
})
