#!/usr/bin/env tsx

/**
 * Blog snapshot refresh script.
 *
 * Fetches public gists for `marcusrbrown`, filters by frontmatter convention (only
 * gists carrying a valid `title`/`date`/`summary` YAML frontmatter block are posts),
 * validates and renders each candidate to sanitized HTML with Shiki-highlighted code
 * fences, and writes `src/data/blog-snapshot.json`.
 *
 * Fails safe: any fetch failure or hard-fail condition (a previously published post
 * whose frontmatter has gone invalid) leaves the existing snapshot file untouched and
 * exits non-zero. New invalid candidates are warned about and excluded without failing
 * the run. Dual CLI/library shape mirrors `scripts/analyze-build.ts`.
 */

import type {Element, Root as HastRoot} from 'hast'
import type {BundledLanguage, Highlighter} from 'shiki'
import type {BlogPostFull, BlogSnapshot} from '../src/types'
import {existsSync, readFileSync, renameSync, unlinkSync, writeFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import process from 'node:process'
import rehypeSanitize, {defaultSchema, type Options as SanitizeSchema} from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import {createHighlighter} from 'shiki'
import {unified} from 'unified'
import {visit} from 'unist-util-visit'
import {parse as parseYaml} from 'yaml'

import {detectSlugCollisions, isSlugResolutionError, resolveSlug} from '../src/utils/blog'
import {validateBlogFrontmatter} from '../src/utils/blog-validation'

export const GENERATOR = 'blog-refresh'
const DEFAULT_SNAPSHOT_PATH = 'src/data/blog-snapshot.json'
const DEFAULT_USERNAME = 'marcusrbrown'
const LOG_TRUNCATE_LENGTH = 200
const SHIKI_LANGUAGES: BundledLanguage[] = [
  'typescript',
  'javascript',
  'tsx',
  'jsx',
  'json',
  'css',
  'html',
  'markdown',
  'bash',
  'shell',
  'yaml',
  'python',
  'rust',
  'go',
]
const SHIKI_THEMES = {light: 'github-light', dark: 'github-dark'} as const
const GITHUB_GIST_HOSTS = new Set(['gist.github.com', 'github.com'])

/** Accepts only HTTPS URLs hosted directly by GitHub or GitHub Gists. */
export const isSafeGistUrl = (value: unknown): value is string => {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && GITHUB_GIST_HOSTS.has(url.hostname)
  } catch {
    return false
  }
}

const sanitizeSchema: SanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code ?? []), ['className', /^language-./]],
  },
}

interface GistFile {
  content: string
}

/** Minimal shape of a single candidate gist, decoupled from the raw GitHub API response. */
export interface RefreshCandidate {
  gistId: string
  gistUrl: string
  gistUpdatedAt: string
  files: Record<string, GistFile>
}

interface FrontmatterSplit {
  frontmatter: unknown
  body: string
}

/**
 * Splits a Markdown document into its YAML frontmatter block and body. Returns `null`
 * when no `---`-delimited frontmatter block is present, or when the YAML fails to parse.
 */
export const splitFrontmatter = (source: string): FrontmatterSplit | null => {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(source)
  if (!match) {
    return null
  }

  const [, rawFrontmatter, body] = match
  try {
    const frontmatter: unknown = parseYaml(rawFrontmatter ?? '')
    return {frontmatter, body: body ?? ''}
  } catch {
    return null
  }
}

type MarkdownSourceResult = {filename: string; content: string} | {error: string}

/**
 * Selects the Markdown source file for a candidate gist: the sole `.md` file wins
 * automatically; multiple `.md` files require an explicit frontmatter `source` field
 * naming one of them, otherwise selection fails naming every candidate file.
 */
export const selectMarkdownSource = (
  files: Record<string, GistFile>,
  preferredFilename?: string,
): MarkdownSourceResult => {
  const markdownEntries = Object.entries(files)
    .filter(([name]) => name.toLowerCase().endsWith('.md'))
    .sort(([a], [b]) => a.localeCompare(b))

  if (markdownEntries.length === 0) {
    return {error: 'No Markdown file found in gist'}
  }

  if (preferredFilename) {
    const preferred = markdownEntries.find(([name]) => name === preferredFilename)
    if (preferred) return {filename: preferred[0], content: preferred[1].content}
  }

  if (markdownEntries.length === 1) {
    const [filename, file] = markdownEntries[0] as [string, GistFile]
    return {filename, content: file.content}
  }

  const sourceMatches: [string, GistFile][] = []
  for (const [filename, file] of markdownEntries) {
    const split = splitFrontmatter(file.content)
    if (!split) continue
    const frontmatter = split.frontmatter as {source?: unknown} | null
    if (frontmatter && typeof frontmatter === 'object' && frontmatter.source === filename) {
      sourceMatches.push([filename, file])
    }
  }

  if (sourceMatches.length === 1) {
    const [filename, file] = sourceMatches[0] ?? []
    if (filename && file) return {filename, content: file.content}
  }

  return {
    error:
      sourceMatches.length > 1
        ? `Multiple Markdown files declare matching frontmatter "source" fields`
        : `Multiple Markdown files found (${markdownEntries.map(([name]) => name).join(', ')}) with no frontmatter "source" field naming one of them`,
  }
}

/** Escapes HTML-significant characters and truncates to ~200 chars for safe log/summary output. */
export const truncateForLog = (input: string): string => {
  const escaped = input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

  if (escaped.length <= LOG_TRUNCATE_LENGTH) {
    return escaped
  }

  return `${escaped.slice(0, LOG_TRUNCATE_LENGTH)}…`
}

const getCodeText = (node: Element): string => {
  return node.children
    .filter((child): child is {type: 'text'; value: string} => child.type === 'text')
    .map(child => child.value)
    .join('')
}

const getLanguageFromClassName = (node: Element): string => {
  const className = node.properties?.className
  const classes = Array.isArray(className) ? className : []
  const languageClass = classes.find(cls => typeof cls === 'string' && cls.startsWith('language-'))
  return typeof languageClass === 'string' ? languageClass.slice('language-'.length) : 'text'
}

/** Rehype plugin: replaces sanitized `<pre><code>` fences with Shiki-highlighted markup. */
const rehypeShikiHighlight = (highlighter: Highlighter) => () => (tree: HastRoot) => {
  visit(tree, 'element', (node, index, parent) => {
    if (node.tagName !== 'pre' || !parent || index === undefined) {
      return
    }

    const codeNode = node.children.find(
      (child): child is Element => child.type === 'element' && child.tagName === 'code',
    )
    if (!codeNode) {
      return
    }

    const language = getLanguageFromClassName(codeNode)
    const text = getCodeText(codeNode)
    const loadedLanguages = highlighter.getLoadedLanguages()
    const safeLanguage = loadedLanguages.includes(language) ? language : 'text'

    const hast = highlighter.codeToHast(text, {
      lang: safeLanguage,
      themes: SHIKI_THEMES,
      defaultColor: false,
    })

    const preNode = hast.children.find((child): child is Element => child.type === 'element') as Element | undefined
    if (!preNode) {
      return
    }

    const existingClass = typeof preNode.properties?.class === 'string' ? preNode.properties.class : ''
    preNode.properties = {
      ...preNode.properties,
      class: [existingClass, 'code-block__content'].filter(Boolean).join(' '),
    }

    parent.children[index] = {
      type: 'element',
      tagName: 'div',
      properties: {className: ['code-block']},
      children: [preNode],
    }
  })
}

const renderMarkdown = async (body: string, highlighter: Highlighter): Promise<string> => {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeSanitize, sanitizeSchema)
    .use(rehypeShikiHighlight(highlighter))
    .use(rehypeStringify)
    .process(body)

  return String(file)
}

export interface RefreshWarning {
  gistId: string
  reason: string
}

export interface BuildSnapshotResult {
  snapshot: BlogSnapshot
  warnings: RefreshWarning[]
  /** Non-null when a hard-fail condition occurred; `snapshot` is the untouched previous snapshot in that case. */
  fatalError: string | null
}

const stableStringify = (snapshot: BlogSnapshot): string => `${JSON.stringify(snapshot, null, 2)}\n`

/**
 * Builds the new blog snapshot from fetched candidates and the previous snapshot
 * (the slug registry). Implements the fail-safe matrix:
 * - a previously published gist whose frontmatter is now invalid hard-fails, naming the slug
 * - a new candidate with invalid frontmatter is excluded with a warning
 * - a previously published gist absent from `candidates` is dropped silently
 */
export const buildSnapshot = async (
  candidates: RefreshCandidate[],
  previousSnapshot: BlogSnapshot,
): Promise<BuildSnapshotResult> => {
  const highlighter = await createHighlighter({themes: [SHIKI_THEMES.light, SHIKI_THEMES.dark], langs: SHIKI_LANGUAGES})
  const previousByGistId = new Map(previousSnapshot.posts.map(post => [post.gistId, post]))
  const warnings: RefreshWarning[] = []
  const posts: BlogPostFull[] = []

  for (const candidate of candidates) {
    const wasPublished = previousByGistId.has(candidate.gistId)
    if (!isSafeGistUrl(candidate.gistUrl)) {
      if (wasPublished) {
        const previousSlug = previousByGistId.get(candidate.gistId)?.slug ?? candidate.gistId
        highlighter.dispose()
        return {
          snapshot: previousSnapshot,
          warnings,
          fatalError: `Previously published post "${previousSlug}" (gist ${candidate.gistId}) is no longer valid: Invalid gist URL: expected an HTTPS GitHub URL`,
        }
      }
      warnings.push({gistId: candidate.gistId, reason: 'Invalid gist URL: expected an HTTPS GitHub URL'})
      continue
    }

    const sourceResult = selectMarkdownSource(candidate.files, previousByGistId.get(candidate.gistId)?.sourceFilename)
    if ('error' in sourceResult) {
      if (wasPublished) {
        const previousSlug = previousByGistId.get(candidate.gistId)?.slug ?? candidate.gistId
        highlighter.dispose()
        return {
          snapshot: previousSnapshot,
          warnings,
          fatalError: `Previously published post "${previousSlug}" (gist ${candidate.gistId}) is no longer valid: ${sourceResult.error}`,
        }
      }
      warnings.push({gistId: candidate.gistId, reason: sourceResult.error})
      continue
    }

    const split = splitFrontmatter(sourceResult.content)
    if (!split) {
      if (wasPublished) {
        const previousSlug = previousByGistId.get(candidate.gistId)?.slug ?? candidate.gistId
        highlighter.dispose()
        return {
          snapshot: previousSnapshot,
          warnings,
          fatalError: `Previously published post "${previousSlug}" (gist ${candidate.gistId}) is no longer valid: missing or malformed frontmatter`,
        }
      }
      // Not a frontmatter-carrying candidate at all — silently excluded (not a "post" attempt).
      continue
    }

    const validation = validateBlogFrontmatter(split.frontmatter)
    if (!validation.ok) {
      if (wasPublished) {
        const previousSlug = previousByGistId.get(candidate.gistId)?.slug ?? candidate.gistId
        highlighter.dispose()
        return {
          snapshot: previousSnapshot,
          warnings,
          fatalError: `Previously published post "${previousSlug}" (gist ${candidate.gistId}) is no longer valid: ${validation.errors.join('; ')}`,
        }
      }
      warnings.push({gistId: candidate.gistId, reason: `Invalid frontmatter: ${validation.errors.join('; ')}`})
      continue
    }

    const frontmatter = validation.value
    const previousPost = previousByGistId.get(candidate.gistId)
    const slug = previousPost
      ? previousPost.slug
      : (() => {
          const resolved = resolveSlug(frontmatter)
          return isSlugResolutionError(resolved) ? resolved : resolved
        })()

    if (isSlugResolutionError(slug)) {
      if (wasPublished) {
        highlighter.dispose()
        return {
          snapshot: previousSnapshot,
          warnings,
          fatalError: `Previously published post (gist ${candidate.gistId}) is no longer valid: ${slug.reason}`,
        }
      }
      warnings.push({gistId: candidate.gistId, reason: slug.reason})
      continue
    }

    const html = await renderMarkdown(split.body, highlighter)

    posts.push({
      slug,
      frontmatter,
      html,
      gistId: candidate.gistId,
      gistUrl: candidate.gistUrl,
      gistUpdatedAt: candidate.gistUpdatedAt,
      sourceFilename: sourceResult.filename,
    })
  }

  highlighter.dispose()

  const collisions = detectSlugCollisions(posts.map(post => ({slug: post.slug, identifier: post.gistId})))
  if (collisions.length > 0) {
    const message = collisions.map(c => `"${c.slug}" (${c.identifiers.join(', ')})`).join('; ')
    return {
      snapshot: previousSnapshot,
      warnings,
      fatalError: `Slug collision(s) detected: ${message}`,
    }
  }

  posts.sort((a, b) => {
    const dateDiff = new Date(b.frontmatter.date).getTime() - new Date(a.frontmatter.date).getTime()
    if (dateDiff !== 0) return dateDiff
    return a.slug.localeCompare(b.slug)
  })

  const candidateSnapshot: BlogSnapshot = {
    posts,
    generatedAt: previousSnapshot.generatedAt,
    generator: GENERATOR,
  }

  const unchanged =
    stableStringify({...candidateSnapshot, generatedAt: previousSnapshot.generatedAt}) ===
    stableStringify(previousSnapshot)

  return {
    snapshot: unchanged ? candidateSnapshot : {...candidateSnapshot, generatedAt: new Date().toISOString()},
    warnings,
    fatalError: null,
  }
}

interface GitHubGistFileResponse {
  content?: string
  truncated?: boolean
}

interface GitHubGistResponse {
  id?: string
  html_url?: string
  updated_at?: string
  public?: boolean
  files?: Record<string, GitHubGistFileResponse>
}

const isGist = (value: unknown): value is GitHubGistResponse => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const gist = value as Record<string, unknown>
  if (gist.id !== undefined && typeof gist.id !== 'string') return false
  if (gist.html_url !== undefined && typeof gist.html_url !== 'string') return false
  if (gist.updated_at !== undefined && typeof gist.updated_at !== 'string') return false
  if (gist.files === undefined) return true
  if (typeof gist.files !== 'object' || gist.files === null || Array.isArray(gist.files)) return false
  return Object.values(gist.files).every(file => typeof file === 'object' && file !== null && !Array.isArray(file))
}

const isGistArray = (data: unknown): data is GitHubGistResponse[] => Array.isArray(data) && data.every(isGist)

const toCandidate = (gist: GitHubGistResponse): RefreshCandidate | null => {
  if (typeof gist.id !== 'string' || typeof gist.html_url !== 'string' || typeof gist.updated_at !== 'string') {
    return null
  }

  const files: Record<string, GistFile> = {}
  for (const [name, file] of Object.entries(gist.files ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    if (typeof file.content === 'string') {
      files[name] = {content: file.content}
    }
  }

  return {gistId: gist.id, gistUrl: gist.html_url, gistUpdatedAt: gist.updated_at, files}
}

export interface RefreshOptions {
  snapshotPath?: string
  username?: string
  token?: string | undefined
}

const readPreviousSnapshot = (snapshotPath: string): BlogSnapshot => {
  try {
    const raw = readFileSync(snapshotPath, 'utf8')
    const parsed: unknown = JSON.parse(raw)
    const snapshot = parsed as {posts?: unknown; generatedAt?: unknown; generator?: unknown}
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !Array.isArray(snapshot.posts) ||
      typeof snapshot.generatedAt !== 'string' ||
      typeof snapshot.generator !== 'string' ||
      !snapshot.posts.every(
        post =>
          typeof post === 'object' &&
          post !== null &&
          'slug' in post &&
          typeof post.slug === 'string' &&
          'gistId' in post &&
          typeof post.gistId === 'string' &&
          (!('sourceFilename' in post) || typeof post.sourceFilename === 'string'),
      )
    ) {
      throw new Error('snapshot has the wrong shape')
    }
    return parsed as BlogSnapshot
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return {posts: [], generatedAt: new Date().toISOString(), generator: GENERATOR}
    }
    throw new Error(`Unable to read previous blog snapshot: ${error instanceof Error ? error.message : String(error)}`)
  }
}

const atomicWrite = (path: string, content: string): void => {
  const temporaryPath = join(dirname(path), `.${path.split('/').pop() ?? 'snapshot'}.${process.pid}.tmp`)
  try {
    writeFileSync(temporaryPath, content, 'utf8')
    renameSync(temporaryPath, path)
  } catch (error) {
    try {
      if (existsSync(temporaryPath)) unlinkSync(temporaryPath)
    } catch {
      /* preserve original error */
    }
    throw error
  }
}

const nextLink = (response: Response): string | null => {
  const link = response.headers?.get('link')
  const match = link?.match(/<([^>]+)>;\s*rel="next"/)
  return match?.[1] ?? null
}

const readGists = async (username: string, headers: Record<string, string>): Promise<GitHubGistResponse[]> => {
  const gists: GitHubGistResponse[] = []
  let url: string | null = `https://api.github.com/users/${username}/gists?per_page=100`
  while (url) {
    let response: Response
    try {
      response = await fetch(url, {headers, signal: AbortSignal.timeout(30_000)})
    } catch (error) {
      if (error instanceof DOMException && error.name === 'TimeoutError')
        throw new Error(`GitHub request timed out: ${url}`)
      throw error
    }
    if (!response.ok) throw new Error(`GitHub request failed (${response.status} ${response.statusText}): ${url}`)
    const data: unknown = await response.json()
    if (!isGistArray(data)) throw new Error(`Unexpected gist list response shape: ${url}`)
    gists.push(...data)
    url = nextLink(response)
  }
  return gists
}

const fetchCandidates = async (
  gists: GitHubGistResponse[],
  headers: Record<string, string>,
): Promise<RefreshCandidate[]> => {
  const candidates: RefreshCandidate[] = []
  for (const gist of gists) {
    const hasMarkdown = Object.keys(gist.files ?? {}).some(name => name.toLowerCase().endsWith('.md'))
    if (!hasMarkdown || typeof gist.id !== 'string') continue
    let detailResponse: Response
    try {
      detailResponse = await fetch(`https://api.github.com/gists/${encodeURIComponent(gist.id)}`, {
        headers,
        signal: AbortSignal.timeout(30_000),
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        throw new Error(`GitHub request timed out: gist ${gist.id}`)
      }
      throw error
    }
    if (!detailResponse.ok)
      throw new Error(`GitHub request failed (${detailResponse.status} ${detailResponse.statusText}): gist ${gist.id}`)
    const detail: unknown = await detailResponse.json()
    if (!isGist(detail)) throw new Error(`Unexpected gist detail response for ${gist.id}`)
    if (Object.values(detail.files ?? {}).some(file => file.truncated === true)) {
      throw new Error(`Gist ${gist.id} contains truncated file content`)
    }
    const candidate = toCandidate(detail)
    if (!candidate) throw new Error(`Gist ${gist.id} detail response is missing required metadata`)
    if (!Object.keys(candidate.files).some(name => name.toLowerCase().endsWith('.md'))) {
      throw new Error(`Gist ${gist.id} detail response is missing Markdown content`)
    }
    candidates.push(candidate)
  }
  return candidates
}

const writeSummary = (path: string | undefined, previous: BlogSnapshot, result: BuildSnapshotResult): void => {
  if (!path) return
  const oldByGist = new Map(previous.posts.map(post => [post.gistId, post.slug]))
  const newByGist = new Map(result.snapshot.posts.map(post => [post.gistId, post.slug]))
  const safe = (value: string) =>
    truncateForLog(value)
      .replaceAll('`', "'")
      .replaceAll(/[\r\n|]/g, ' ')
  const added = result.snapshot.posts.filter(post => !oldByGist.has(post.gistId)).map(post => safe(post.slug))
  const removed = previous.posts.filter(post => !newByGist.has(post.gistId)).map(post => safe(post.slug))
  const updated = result.snapshot.posts
    .filter(
      post =>
        oldByGist.get(post.gistId) === post.slug &&
        previous.posts.find(old => old.gistId === post.gistId)?.gistUpdatedAt !== post.gistUpdatedAt,
    )
    .map(post => safe(post.slug))
  const lines = [
    `### Blog Refresh`,
    `- Posts: ${previous.posts.length} → ${result.snapshot.posts.length}`,
    `- Added: ${added.join(', ') || 'none'}`,
    `- Removed: ${removed.join(', ') || 'none'}`,
    `- Updated: ${updated.join(', ') || 'none'}`,
    `- Excluded gist warnings: ${result.warnings.length}`,
    `- generatedAt: ${safe(result.snapshot.generatedAt)}`,
    '- Verification: `/blog/<slug>`, `/feed.xml`, `/sitemap.xml`',
    '',
  ]
  atomicWrite(path, `${lines.join('\n')}\n`)
}

/**
 * Fetches gists, builds the snapshot, and writes it to disk. Fails safe: any error
 * before a successful build leaves the on-disk snapshot untouched and sets a non-zero
 * `process.exitCode`.
 */
export const refreshBlogSnapshot = async (options: RefreshOptions = {}): Promise<void> => {
  const snapshotPath = options.snapshotPath ?? DEFAULT_SNAPSHOT_PATH
  const username = options.username ?? DEFAULT_USERNAME
  // The Gists REST API rejects the Actions default GITHUB_TOKEN (a GitHub App
  // installation token) with 403. Authenticate gist reads with a dedicated
  // fine-grained PAT (BLOG_REFRESH_TOKEN) instead; when it is absent, fall back
  // to unauthenticated requests, which succeed for public gists.
  const token = options.token ?? (process.env.BLOG_REFRESH_TOKEN || undefined)

  let previousSnapshot: BlogSnapshot
  try {
    previousSnapshot = readPreviousSnapshot(snapshotPath)
  } catch (error) {
    console.error(`❌ ${truncateForLog(error instanceof Error ? error.message : String(error))}`)
    process.exitCode = 1
    return
  }

  try {
    const headers: Record<string, string> = {accept: 'application/vnd.github+json'}
    if (token) {
      headers.authorization = `Bearer ${token}`
    }

    const gists = await readGists(username, headers)
    const candidates = await fetchCandidates(gists, headers)
    const result = await buildSnapshot(candidates, previousSnapshot)
    writeSummary(process.env.BLOG_REFRESH_SUMMARY_PATH, previousSnapshot, result)

    if (result.fatalError) throw new Error(result.fatalError)

    for (const warning of result.warnings) {
      console.warn(`⚠️  Excluding gist ${truncateForLog(warning.gistId)}: ${truncateForLog(warning.reason)}`)
    }
    atomicWrite(snapshotPath, stableStringify(result.snapshot))
    console.log(
      `✅ Blog snapshot refreshed: ${result.snapshot.posts.length} post(s), ${result.warnings.length} excluded`,
    )
    process.exitCode = 0
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`❌ Blog refresh failed: ${truncateForLog(message)}`)
    process.exitCode = 1
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  refreshBlogSnapshot().catch((error: unknown) => {
    console.error('❌ Unexpected blog refresh error:', error)
    process.exitCode = 1
  })
}
