import {Buffer} from 'node:buffer'
import {createHash} from 'node:crypto'
import {isAbsolute} from 'node:path'
import process from 'node:process'

import {describe, expect, it, vi} from 'vitest'

import {
  addIssueComment,
  createGhRunner,
  createIssue,
  getIssue,
  getIssueCloseEvents,
  getIssueComments,
  getRepositoryPermission,
  GhRunnerError,
  listLabeledIssues,
  parseGhJson,
  patchIssueBodyFresh,
  searchIssues,
  setIssueLabels,
  setIssueState,
  type GhCommandResult,
  type GhRunner,
  type GitHubCloseEvent,
  type GitHubIssue,
  type GitHubIssueComment,
} from '../../scripts/live-audit/github-runner'
import {
  EVIDENCE_RELEASE_TAG,
  evidenceAssetName,
  getOrCreateEvidenceRelease,
  inspectEvidenceRelease,
  listEvidenceAssets,
  planEvidenceAsset,
  publishEvidenceAsset,
  verifyPublicPng,
  type EvidenceAsset,
  type EvidenceRelease,
} from '../../scripts/live-audit/release-evidence'
import assetReal from './fixtures/live-audit/asset-real.json'
import closeEventReal from './fixtures/live-audit/close-event-real.json'
import commentReal from './fixtures/live-audit/comment-real.json'
import issueReal from './fixtures/live-audit/issue-real.json'
import permissionReal from './fixtures/live-audit/permission-real.json'
import releaseReal from './fixtures/live-audit/release-real.json'
import searchReal from './fixtures/live-audit/search-real.json'

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)
const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')
const result = (stdout: string, exitCode = 0, stderr = ''): GhCommandResult => ({stdout, stderr, exitCode})
const rawAssetPayload = (asset: {
  readonly id: number
  readonly name: string
  readonly state: string
  readonly size: number
  readonly contentType: string
  readonly digest?: string
  readonly browserDownloadUrl: string
}) => ({
  id: asset.id,
  name: asset.name,
  state: asset.state,
  size: asset.size,
  content_type: asset.contentType,
  digest: asset.digest,
  browser_download_url: asset.browserDownloadUrl,
})
const acceptsUnknown = (_value: unknown): _value is unknown => true
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const callValue = (calls: readonly unknown[][], index: number, position: number): unknown => {
  const call = calls.at(index)
  if (!call) throw new Error(`mock call ${index} missing`)
  return call[position]
}
const callArgs = (calls: readonly unknown[][], index: number): readonly string[] => {
  const value = callValue(calls, index, 0)
  if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) throw new Error('mock arguments missing')
  return value
}
const callInput = (calls: readonly unknown[][], index: number): string => {
  const value = callValue(calls, index, 1)
  if (!isRecord(value) || typeof value.input !== 'string') throw new Error('mock input missing')
  return value.input
}
const expectRejectedWithout = async (operation: Promise<unknown>, secret: string): Promise<void> => {
  try {
    await operation
    throw new Error('expected operation to reject')
  } catch (error) {
    if (!(error instanceof Error) || error.message.includes(secret)) throw new Error('secret leaked in transport error')
  }
}
const expectThrownWithout = (operation: () => unknown, secrets: readonly string[]): void => {
  try {
    operation()
    throw new Error('expected operation to throw')
  } catch (error) {
    if (!(error instanceof Error) || secrets.some(secret => error.message.includes(secret)))
      throw new Error('secret leaked in transport error')
  }
}
const fakeRunner = (responses: GhCommandResult[]): GhRunner => ({
  run: vi.fn().mockImplementation(async () => responses.shift() ?? result('{}')),
})
const withoutField = (value: Record<string, unknown>, field: string): Record<string, unknown> => {
  const copy = {...value}
  delete copy[field]
  return copy
}

const expectedRealIssue: GitHubIssue = {
  number: 204,
  title: 'Broken card',
  body: 'Human-authored issue body',
  state: 'open',
  stateReason: null,
  labels: ['visual-audit'],
  comments: 1,
  updatedAt: '2026-07-20T03:30:00Z',
}

const expectedRealComment: GitHubIssueComment = {
  id: 1,
  body: 'Validation comment',
  actor: 'maintainer',
  createdAt: '2026-07-20T03:30:00Z',
}

const expectedRealCloseEvent: GitHubCloseEvent = {
  id: 1,
  event: 'closed',
  createdAt: '2026-07-20T03:30:00Z',
  actor: 'github-actions[bot]',
}

const expectedRealAsset: EvidenceAsset = {
  id: 9,
  name: 'operation-fingerprint-variant-context.png',
  state: 'uploaded',
  size: 12345,
  contentType: 'image/png',
  digest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  browserDownloadUrl:
    'https://github.com/example/repo/releases/download/live-audit-evidence/operation-fingerprint-variant-context.png',
}

const expectedRealRelease: EvidenceRelease = {
  id: 42,
  tagName: 'live-audit-evidence',
  uploadUrl: 'https://uploads.github.com/repos/example/repo/releases/42/assets{?name,label}',
  isDraft: false,
  isPrerelease: true,
  isPrivate: undefined,
  assets: [],
}
const prereleaseReal = {...releaseReal, prerelease: true}

describe('committed real-shape GitHub payloads', () => {
  const repository = {owner: 'example', repo: 'repo'}

  it('normalizes release and asset fixtures through release parsers', async () => {
    await expect(
      inspectEvidenceRelease(fakeRunner([result(JSON.stringify(prereleaseReal))]), repository),
    ).resolves.toEqual({status: 'found', release: expectedRealRelease})
    await expect(
      listEvidenceAssets(fakeRunner([result(JSON.stringify([[assetReal]]))]), repository, expectedRealRelease),
    ).resolves.toEqual([expectedRealAsset])

    await expect(
      inspectEvidenceRelease(fakeRunner([result(JSON.stringify(withoutField(releaseReal, 'tag_name')))]), repository),
    ).rejects.toThrow(/release|fields|shape/)
    await expect(
      listEvidenceAssets(
        fakeRunner([result(JSON.stringify([[withoutField(assetReal, 'content_type')]]))]),
        repository,
        expectedRealRelease,
      ),
    ).rejects.toThrow(/asset|shape|truncated/)
  })

  it('normalizes the issue fixture through issue and labeled-list parsers', async () => {
    await expect(getIssue(fakeRunner([result(JSON.stringify(issueReal))]), repository, 204)).resolves.toEqual(
      expectedRealIssue,
    )
    await expect(
      listLabeledIssues(
        fakeRunner([result(JSON.stringify([[issueReal]])), result(JSON.stringify([[]]))]),
        repository,
        'visual-audit',
      ),
    ).resolves.toEqual([expectedRealIssue])

    await expect(
      getIssue(fakeRunner([result(JSON.stringify(withoutField(issueReal, 'state_reason')))]), repository, 204),
    ).rejects.toThrow(/shape/)
  })

  it('normalizes the comment fixture through the comment parser', async () => {
    await expect(
      getIssueComments(fakeRunner([result(JSON.stringify([[commentReal]]))]), repository, 204),
    ).resolves.toEqual([expectedRealComment])
    await expect(
      getIssueComments(
        fakeRunner([result(JSON.stringify([[withoutField(commentReal, 'created_at')]]))]),
        repository,
        204,
      ),
    ).rejects.toThrow(/comment|shape/)
  })

  it('normalizes the close-event fixture through the lifecycle-event parser', async () => {
    await expect(
      getIssueCloseEvents(fakeRunner([result(JSON.stringify([[closeEventReal]]))]), repository, 204),
    ).resolves.toEqual([expectedRealCloseEvent])
    await expect(
      getIssueCloseEvents(
        fakeRunner([result(JSON.stringify([[withoutField(closeEventReal, 'created_at')]]))]),
        repository,
        204,
      ),
    ).rejects.toThrow(/event|timestamp|shape/)
  })

  it('normalizes the permission fixture through the collaborator permission parser', async () => {
    await expect(
      getRepositoryPermission(fakeRunner([result(JSON.stringify(permissionReal))]), repository, 'maintainer'),
    ).resolves.toBe('maintain')
    await expect(
      getRepositoryPermission(
        fakeRunner([result(JSON.stringify(withoutField(permissionReal, 'permission')))]),
        repository,
        'maintainer',
      ),
    ).rejects.toThrow(/permission|shape/)
  })

  it('normalizes the search fixture through the paginated search parser', async () => {
    await expect(
      searchIssues(fakeRunner([result(JSON.stringify([searchReal]))]), repository, 'visual-audit', 'open'),
    ).resolves.toEqual([expectedRealIssue])
    await expect(
      searchIssues(
        fakeRunner([result(JSON.stringify([withoutField(searchReal, 'total_count')]))]),
        repository,
        'visual-audit',
        'open',
      ),
    ).rejects.toThrow(/incomplete|truncated/)
  })
})

describe('bounded GitHub runner', () => {
  it('parses unknown JSON only through an explicit response guard', () => {
    expect(
      parseGhJson(
        result('{"ok":true}'),
        (value: unknown): value is object => typeof value === 'object' && value !== null,
      ),
    ).toEqual({ok: true})
    expect(() =>
      parseGhJson(result('{"ok":true}'), (value: unknown): value is unknown[] => Array.isArray(value)),
    ).toThrow(GhRunnerError)
    expect(() =>
      parseGhJson(result('not-json'), (value: unknown): value is object => typeof value === 'object'),
    ).toThrow(GhRunnerError)
  })

  it('rejects nonzero, timeout, and bounded-output failures with redacted diagnostics', async () => {
    const runner = fakeRunner([result('secret-token', 1, 'fatal secret-token'), result('', 124, 'timed out')])
    await expect(runner.run(['api', 'repos/example/repo'])).resolves.toEqual(expect.objectContaining({exitCode: 1}))
    expect(() => parseGhJson(result('secret-token', 1, 'fatal secret-token'), acceptsUnknown)).toThrow(/exit code/)
    expect(() => parseGhJson(result('x'.repeat(20), 0), acceptsUnknown, 10)).toThrow(/bounded/)
    expect(() => parseGhJson(result('é'.repeat(10), 0), acceptsUnknown, 10)).toThrow(/bounded/)
    await expect(runner.run(['api', 'timeout'])).resolves.toEqual(expect.objectContaining({exitCode: 124}))
  })

  it('never includes labeled or unlabeled secrets in transport errors', async () => {
    const secrets = ['raw-secret-token', 'Bearer super-secret-value'] as const
    expect(secrets[0]).toBe('raw-secret-token')
    expectThrownWithout(() => parseGhJson(result('', 1, `fatal ${secrets[0]} ${secrets[1]}`), acceptsUnknown), secrets)
    await expectRejectedWithout(
      getOrCreateEvidenceRelease(fakeRunner([result('', 1, `release failed ${secrets[0]}`)]), {
        owner: 'example',
        repo: 'repo',
      }),
      secrets[0],
    )
    const collision = {
      id: 9,
      name: 'collision.png',
      state: 'starter',
      size: 0,
      contentType: 'application/octet-stream',
      browserDownloadUrl: 'https://github.com/example/repo/releases/download/live-audit-evidence/collision.png',
    }
    await expectRejectedWithout(
      publishEvidenceAsset({
        runner: fakeRunner([
          result(JSON.stringify([rawAssetPayload(collision)])),
          result('', 1, `delete failed ${secrets[1]}`),
        ]),
        repository: {owner: 'example', repo: 'repo'},
        release: {
          id: 42,
          tagName: EVIDENCE_RELEASE_TAG,
          uploadUrl: 'upload',
          isDraft: false,
          isPrerelease: true,
          assets: [],
        },
        assetName: collision.name,
        expectedBytes: png,
        verifyPublicImage: vi.fn(),
      }),
      secrets[1],
    )
    const uploadRunner = fakeRunner([result('[]'), result('', 1, `upload failed ${secrets[0]}`)])
    await expectRejectedWithout(
      publishEvidenceAsset({
        runner: uploadRunner,
        repository: {owner: 'example', repo: 'repo'},
        release: {
          id: 42,
          tagName: EVIDENCE_RELEASE_TAG,
          uploadUrl: 'upload',
          isDraft: false,
          isPrerelease: true,
          assets: [],
        },
        assetName: 'new.png',
        expectedBytes: png,
        verifyPublicImage: vi.fn(),
      }),
      secrets[0],
    )
    expect(secrets).toHaveLength(2)
  })

  it('preserves argument and input-file boundaries without shell interpolation', async () => {
    const run = vi.fn().mockResolvedValue(result('{}'))
    const runner = createGhRunner({spawnCommand: run})
    await runner.run(['api', 'repos/example/repo/issues', '--input', '/tmp/body; echo pwned'], {input: '$(danger)'})
    expect(run).toHaveBeenCalledWith(
      ['api', 'repos/example/repo/issues', '--input', '/tmp/body; echo pwned'],
      '$(danger)',
      expect.any(Object),
    )
  })

  it('passes only the auth/runtime environment allowlist and closes stdin', async () => {
    const run = vi.fn().mockResolvedValue(result('{}'))
    const runner = createGhRunner({spawnCommand: run})
    await runner.run(['api', 'repos/example/repo'], {input: 'body'})
    const options = callValue(run.mock.calls, 0, 2)
    if (!isRecord(options) || !isRecord(options.env)) throw new Error('runner environment missing')
    expect(options.env).toEqual(
      expect.objectContaining({PATH: expect.any(String), NO_COLOR: '1', HOME: expect.any(String)}),
    )
    expect(isAbsolute(String(options.env.HOME))).toBe(true)
    expect(
      Object.keys(options.env ?? {}).every(key =>
        ['PATH', 'GH_TOKEN', 'GITHUB_TOKEN', 'GH_HOST', 'NO_COLOR', 'HOME'].includes(key),
      ),
    ).toBe(true)
  })

  it('reaps local subprocesses on timeout, SIGTERM-ignore, spawn error, and stdin close', async () => {
    const node = process.execPath
    await expect(
      createGhRunner({command: node, timeoutMs: 20}).run(['-e', 'setTimeout(() => {}, 1000)']),
    ).rejects.toThrow(/timed out/)
    await expect(
      createGhRunner({command: node, timeoutMs: 20}).run([
        '-e',
        "process.on('SIGTERM', () => {}); setTimeout(() => {}, 1000)",
      ]),
    ).rejects.toThrow(/timed out/)
    await expect(createGhRunner({command: '/path/does/not/exist'}).run([])).rejects.toThrow(/start gh|failed to start/)
    await expect(
      createGhRunner({command: node}).run(
        ['-e', "process.stdin.resume(); process.stdin.on('end', () => process.stdout.write('closed'))"],
        {input: 'payload'},
      ),
    ).resolves.toMatchObject({stdout: 'closed'})
  })
})

describe('durable evidence release transport', () => {
  const release: EvidenceRelease = {
    id: 42,
    tagName: EVIDENCE_RELEASE_TAG,
    uploadUrl: 'https://uploads.github.com/repos/example/repo/releases/42/assets{?name,label}',
    isDraft: false,
    isPrerelease: true,
    assets: [],
  }

  it('reuses a published rolling release and creates it only on 404', async () => {
    const existing = fakeRunner([
      result(
        JSON.stringify({
          id: 42,
          tag_name: EVIDENCE_RELEASE_TAG,
          upload_url: release.uploadUrl,
          draft: false,
          prerelease: true,
          assets: [],
        }),
      ),
    ])
    await expect(getOrCreateEvidenceRelease(existing, {owner: 'example', repo: 'repo'})).resolves.toMatchObject(release)
    const created = fakeRunner([
      result('', 1, 'HTTP 404'),
      result(
        JSON.stringify({
          id: 42,
          tag_name: EVIDENCE_RELEASE_TAG,
          upload_url: release.uploadUrl,
          draft: false,
          prerelease: true,
          assets: [],
        }),
      ),
    ])
    await expect(getOrCreateEvidenceRelease(created, {owner: 'example', repo: 'repo'})).resolves.toMatchObject(release)
  })

  it('inspects a missing release without creating or mutating anything', async () => {
    const runner = fakeRunner([result('', 1, 'HTTP 404 Not Found')])
    await expect(inspectEvidenceRelease(runner, {owner: 'example', repo: 'repo'})).resolves.toEqual({status: 'missing'})
    const calls = (runner.run as ReturnType<typeof vi.fn>).mock.calls
    expect(calls).toHaveLength(1)
    expect(callArgs(calls, 0)).toEqual(['api', 'repos/example/repo/releases/tags/live-audit-evidence'])
  })

  it('lists existing release assets through the repository-qualified endpoint', async () => {
    const rawAsset = {
      id: 9,
      name: 'existing.png',
      state: 'uploaded',
      size: png.length,
      content_type: 'image/png',
      digest: `sha256:${sha256(png)}`,
      browser_download_url: 'https://github.com/example/repo/releases/download/live-audit-evidence/existing.png',
    }
    const runner = fakeRunner([result(JSON.stringify([[rawAsset]]))])
    await expect(
      listEvidenceAssets(runner, {owner: 'example', repo: 'repo'}, {...release, isPrerelease: false}),
    ).resolves.toMatchObject([{name: rawAsset.name, digest: rawAsset.digest}])
    expect(callArgs((runner.run as ReturnType<typeof vi.fn>).mock.calls, 0)).toEqual([
      'api',
      'repos/example/repo/releases/42/assets',
      '--paginate',
      '--slurp',
    ])
  })

  it('plans exact asset reuse without any release mutation', async () => {
    const asset = {
      id: 9,
      name: 'existing.png',
      state: 'uploaded',
      size: png.length,
      contentType: 'image/png',
      digest: `sha256:${sha256(png)}`,
      browserDownloadUrl: 'https://github.com/example/repo/releases/download/live-audit-evidence/existing.png',
    }
    const verify = vi.fn().mockResolvedValue({ok: true, bytes: png, contentType: 'image/png', sha256: sha256(png)})
    await expect(
      planEvidenceAsset({
        repository: {owner: 'example', repo: 'repo'},
        release,
        assets: [asset],
        assetName: asset.name,
        expectedBytes: png,
        verifyPublicImage: verify,
      }),
    ).resolves.toMatchObject({kind: 'reuse', asset})
    expect(verify).toHaveBeenCalledOnce()
  })

  it('plans a new upload when no named asset exists', async () => {
    await expect(
      planEvidenceAsset({
        repository: {owner: 'example', repo: 'repo'},
        release,
        assets: [],
        assetName: 'new.png',
        expectedBytes: png,
        verifyPublicImage: vi.fn(),
      }),
    ).resolves.toMatchObject({kind: 'upload', assetName: 'new.png', expectedBytes: png})
  })

  it.each([
    ['starter', {state: 'starter', size: png.length, contentType: 'application/octet-stream'}],
    ['zero-byte', {state: 'uploaded', size: 0, contentType: 'image/png'}],
  ])('plans delete-plus-upload replacement for a positively incomplete %s asset', async (_name, incomplete) => {
    const asset = {
      id: 9,
      name: 'existing.png',
      browserDownloadUrl: 'https://github.com/example/repo/releases/download/live-audit-evidence/existing.png',
      ...incomplete,
      digest: `sha256:${sha256(png)}`,
    }
    await expect(
      planEvidenceAsset({
        repository: {owner: 'example', repo: 'repo'},
        release,
        assets: [asset],
        assetName: asset.name,
        expectedBytes: png,
        verifyPublicImage: vi.fn(),
      }),
    ).resolves.toMatchObject({
      kind: 'replace',
      asset,
      assetName: asset.name,
      expectedBytes: png,
      delete: true,
      upload: true,
    })
  })

  it.each([
    ['wrong digest', {state: 'uploaded', size: png.length, contentType: 'image/png', digest: 'sha256:wrong'}],
    ['wrong type', {state: 'uploaded', size: png.length, contentType: 'text/plain', digest: `sha256:${sha256(png)}`}],
    [
      'wrong size',
      {state: 'uploaded', size: png.length - 1, contentType: 'image/png', digest: `sha256:${sha256(png)}`},
    ],
  ])('plans an error for a nonzero uploaded asset with %s', async (_name, mismatch) => {
    const asset = {
      id: 9,
      name: 'existing.png',
      browserDownloadUrl: 'https://github.com/example/repo/releases/download/live-audit-evidence/existing.png',
      ...mismatch,
    }
    await expect(
      planEvidenceAsset({
        repository: {owner: 'example', repo: 'repo'},
        release,
        assets: [asset],
        assetName: asset.name,
        expectedBytes: png,
        verifyPublicImage: vi.fn(),
      }),
    ).resolves.toMatchObject({kind: 'error', asset})
  })

  it('plans an error for duplicate immutable-name assets', async () => {
    const asset = {
      id: 9,
      name: 'existing.png',
      state: 'uploaded',
      size: png.length,
      contentType: 'image/png',
      digest: `sha256:${sha256(png)}`,
      browserDownloadUrl: 'https://github.com/example/repo/releases/download/live-audit-evidence/existing.png',
    }
    await expect(
      planEvidenceAsset({
        repository: {owner: 'example', repo: 'repo'},
        release,
        assets: [asset, {...asset, id: 10}],
        assetName: asset.name,
        expectedBytes: png,
        verifyPublicImage: vi.fn(),
      }),
    ).resolves.toMatchObject({kind: 'error', reason: 'multiple release assets share the requested name'})
  })

  it('plans a hard failure rather than deletion or upload when public reuse verification fails', async () => {
    const asset = {
      id: 9,
      name: 'existing.png',
      state: 'uploaded',
      size: png.length,
      contentType: 'image/png',
      digest: `sha256:${sha256(png)}`,
      browserDownloadUrl: 'https://github.com/example/repo/releases/download/live-audit-evidence/existing.png',
    }
    await expect(
      planEvidenceAsset({
        repository: {owner: 'example', repo: 'repo'},
        release,
        assets: [asset],
        assetName: asset.name,
        expectedBytes: png,
        verifyPublicImage: vi.fn().mockResolvedValue({ok: false, reason: 'CDN timeout'}),
      }),
    ).resolves.toMatchObject({kind: 'error', asset, reason: 'CDN timeout'})
  })

  it('does not plan reuse for a metadata match outside the expected release namespace', async () => {
    const asset = {
      id: 9,
      name: 'existing.png',
      state: 'uploaded',
      size: png.length,
      contentType: 'image/png',
      digest: `sha256:${sha256(png)}`,
      browserDownloadUrl: 'https://github.com/example/other/releases/download/live-audit-evidence/existing.png',
    }
    const verify = vi.fn()
    await expect(
      planEvidenceAsset({
        repository: {owner: 'example', repo: 'repo'},
        release,
        assets: [asset],
        assetName: asset.name,
        expectedBytes: png,
        verifyPublicImage: verify,
      }),
    ).resolves.toMatchObject({kind: 'error', asset, reason: 'existing asset URL is outside the release namespace'})
    expect(verify).not.toHaveBeenCalled()
  })

  it('fails closed for malformed release and asset inspection responses', async () => {
    await expect(inspectEvidenceRelease(fakeRunner([result('{}')]), {owner: 'example', repo: 'repo'})).rejects.toThrow(
      /release|fields|shape/,
    )
    await expect(
      listEvidenceAssets(
        fakeRunner([result(JSON.stringify([{missing: true}]))]),
        {owner: 'example', repo: 'repo'},
        release,
      ),
    ).rejects.toThrow(/asset|shape|truncated/)
    await expect(
      inspectEvidenceRelease(
        fakeRunner([
          result(
            JSON.stringify({
              id: 42,
              tag_name: EVIDENCE_RELEASE_TAG,
              upload_url: release.uploadUrl,
              draft: true,
              prerelease: false,
              assets: [],
            }),
          ),
        ]),
        {owner: 'example', repo: 'repo'},
      ),
    ).rejects.toThrow(/published|stable/)
    await expect(
      inspectEvidenceRelease(
        fakeRunner([
          result(
            JSON.stringify({
              id: 42,
              tag_name: EVIDENCE_RELEASE_TAG,
              upload_url: release.uploadUrl,
              draft: false,
              prerelease: false,
              assets: [],
            }),
          ),
        ]),
        {owner: 'example', repo: 'repo'},
      ),
    ).resolves.toMatchObject({status: 'found', release: {isPrerelease: false}})
    await expect(
      inspectEvidenceRelease(
        fakeRunner([
          result(
            JSON.stringify({
              id: 42,
              tag_name: EVIDENCE_RELEASE_TAG,
              upload_url: release.uploadUrl,
              draft: false,
              prerelease: true,
              private: true,
              assets: [],
            }),
          ),
        ]),
        {owner: 'example', repo: 'repo'},
      ),
    ).rejects.toThrow(/published|prerelease/)
    await expect(
      inspectEvidenceRelease(
        fakeRunner([
          result(
            JSON.stringify({
              id: 42,
              tag_name: EVIDENCE_RELEASE_TAG,
              upload_url: release.uploadUrl,
              draft: false,
              prerelease: true,
              assets: [],
            }),
          ),
        ]),
        {owner: 'example', repo: 'repo'},
      ),
    ).resolves.toMatchObject({status: 'found', release})
    await expect(
      inspectEvidenceRelease(fakeRunner([result('', 1, 'permission denied')]), {owner: 'example', repo: 'repo'}),
    ).rejects.toThrow(/lookup|exit code/)
  })

  it('rejects draft releases that would invalidate durable links', async () => {
    const runner = fakeRunner([
      result(
        JSON.stringify({
          id: 42,
          tag_name: EVIDENCE_RELEASE_TAG,
          upload_url: release.uploadUrl,
          draft: true,
          prerelease: false,
          assets: [],
        }),
      ),
    ])
    await expect(getOrCreateEvidenceRelease(runner, {owner: 'example', repo: 'repo'})).rejects.toThrow(/published/)
  })

  it('derives immutable asset names from operation, identity, variant, role, and content hash', () => {
    const name = evidenceAssetName({
      operationKey: 'op-1',
      fingerprint: 'fp-1',
      variantKey: 'variant-1',
      role: 'context',
      bytes: png,
    })
    expect(name).toContain('op-1-fp-1-variant-1-context')
    expect(name).toContain(sha256(png).slice(0, 16))
    expect(
      evidenceAssetName({
        operationKey: 'op-1',
        fingerprint: 'fp-1',
        variantKey: 'variant-1',
        role: 'context',
        bytes: Buffer.from('different'),
      }),
    ).not.toBe(name)
  })

  it('verifies PNG bytes and reuses an exact asset without uploading twice', async () => {
    const existing = {
      ...release,
      assets: [
        {
          id: 9,
          name: 'op-fp-v-context.png',
          state: 'uploaded',
          size: png.length,
          contentType: 'image/png',
          digest: `sha256:${sha256(png)}`,
          browserDownloadUrl:
            'https://github.com/example/repo/releases/download/live-audit-evidence/op-fp-v-context.png',
        },
      ],
    }
    const runner = fakeRunner([result(JSON.stringify(existing.assets.map(rawAssetPayload)))])
    const verify = vi.fn().mockResolvedValue({ok: true, bytes: png, contentType: 'image/png', sha256: sha256(png)})
    await expect(
      publishEvidenceAsset({
        runner,
        repository: {owner: 'example', repo: 'repo'},
        release: existing,
        assetName: 'op-fp-v-context.png',
        expectedBytes: png,
        verifyPublicImage: verify,
      }),
    ).resolves.toMatchObject({reused: true})
    expect(verify).toHaveBeenCalledOnce()
  })

  it('maps recorded GitHub asset payload fields from snake_case', async () => {
    const rawAsset = {
      id: 9,
      name: 'op-fp-v-context.png',
      state: 'uploaded',
      size: png.length,
      content_type: 'image/png',
      digest: `sha256:${sha256(png)}`,
      browser_download_url: 'https://github.com/example/repo/releases/download/live-audit-evidence/op-fp-v-context.png',
    }
    const runner = fakeRunner([result(JSON.stringify([rawAsset]))])
    const verify = vi.fn().mockResolvedValue({ok: true, bytes: png, contentType: 'image/png', sha256: sha256(png)})
    await expect(
      publishEvidenceAsset({
        runner,
        repository: {owner: 'example', repo: 'repo'},
        release,
        assetName: rawAsset.name,
        expectedBytes: png,
        verifyPublicImage: verify,
      }),
    ).resolves.toMatchObject({reused: true, asset: {contentType: 'image/png'}})
  })

  it('flattens paginated release asset responses with a bounded page boundary', async () => {
    const rawAsset = {
      id: 9,
      name: 'op-fp-v-context.png',
      state: 'uploaded',
      size: png.length,
      content_type: 'image/png',
      digest: `sha256:${sha256(png)}`,
      browser_download_url: 'https://github.com/example/repo/releases/download/live-audit-evidence/op-fp-v-context.png',
    }
    const runner = fakeRunner([result(JSON.stringify([[rawAsset]]))])
    const verify = vi.fn().mockResolvedValue({ok: true, bytes: png, contentType: 'image/png', sha256: sha256(png)})
    await expect(
      publishEvidenceAsset({
        runner,
        repository: {owner: 'example', repo: 'repo'},
        release,
        assetName: rawAsset.name,
        expectedBytes: png,
        verifyPublicImage: verify,
      }),
    ).resolves.toMatchObject({reused: true})
    expect(callArgs((runner.run as ReturnType<typeof vi.fn>).mock.calls, 0)).toContain('--paginate')
  })

  it.each([
    ['starter', {state: 'starter', size: 0, contentType: 'application/octet-stream'}],
    ['zero-byte', {state: 'uploaded', size: 0, contentType: 'image/png'}],
  ])('removes only a positively incomplete %s collision before retrying', async (_name, invalid) => {
    const collision = {
      id: 10,
      name: 'op-fp-v-context.png',
      browserDownloadUrl: 'https://github.com/example/repo/releases/download/live-audit-evidence/op-fp-v-context.png',
      ...invalid,
    }
    const valid = {
      ...collision,
      state: 'uploaded',
      size: png.length,
      contentType: 'image/png',
      digest: `sha256:${sha256(png)}`,
    }
    const runner = fakeRunner([
      result(JSON.stringify([rawAssetPayload(collision)])),
      result(''),
      result(''),
      result(JSON.stringify([rawAssetPayload(valid)])),
    ])
    const verify = vi.fn().mockResolvedValue({ok: true, bytes: png, contentType: 'image/png', sha256: sha256(png)})
    await expect(
      publishEvidenceAsset({
        runner,
        repository: {owner: 'example', repo: 'repo'},
        release,
        assetName: collision.name,
        expectedBytes: png,
        verifyPublicImage: verify,
      }),
    ).resolves.toMatchObject({reused: false})
    const calls = (runner.run as ReturnType<typeof vi.fn>).mock.calls
    const secondCall = calls.at(1)
    if (!secondCall) throw new Error('delete call missing')
    expect(secondCall[0]).toContain('--method')
  })

  it.each([
    ['hash mismatch', {state: 'uploaded', size: png.length, contentType: 'image/png', digest: 'sha256:wrong'}],
    [
      'content mismatch',
      {state: 'uploaded', size: png.length, contentType: 'text/plain', digest: `sha256:${sha256(png)}`},
    ],
    [
      'size mismatch',
      {state: 'uploaded', size: png.length - 1, contentType: 'image/png', digest: `sha256:${sha256(png)}`},
    ],
  ])('does not delete or upload a nonzero uploaded %s collision', async (_name, invalid) => {
    const collision = {
      id: 10,
      name: 'op-fp-v-context.png',
      browserDownloadUrl: 'https://github.com/example/repo/releases/download/live-audit-evidence/op-fp-v-context.png',
      ...invalid,
    }
    const runner = fakeRunner([result(JSON.stringify([rawAssetPayload(collision)]))])
    const verify = vi.fn()
    await expect(
      publishEvidenceAsset({
        runner,
        repository: {owner: 'example', repo: 'repo'},
        release,
        assetName: collision.name,
        expectedBytes: png,
        verifyPublicImage: verify,
      }),
    ).rejects.toThrow(/metadata|collision|immutable|expected PNG/)
    expect(runner.run).toHaveBeenCalledOnce()
    expect(verify).not.toHaveBeenCalled()
  })

  it('does not delete or upload duplicate immutable-name collisions', async () => {
    const asset = {
      id: 10,
      name: 'duplicate.png',
      state: 'uploaded',
      size: png.length,
      contentType: 'image/png',
      digest: `sha256:${sha256(png)}`,
      browserDownloadUrl: 'https://github.com/example/repo/releases/download/live-audit-evidence/duplicate.png',
    }
    const runner = fakeRunner([result(JSON.stringify([rawAssetPayload(asset), rawAssetPayload({...asset, id: 11})]))])
    await expect(
      publishEvidenceAsset({
        runner,
        repository: {owner: 'example', repo: 'repo'},
        release,
        assetName: asset.name,
        expectedBytes: png,
        verifyPublicImage: vi.fn(),
      }),
    ).rejects.toThrow(/multiple|duplicate|collision/)
    expect(runner.run).toHaveBeenCalledOnce()
  })

  it('reconciles duplicate-name upload responses by rereading exact asset state', async () => {
    const valid = {
      id: 10,
      name: 'op-fp-v-context.png',
      state: 'uploaded',
      size: png.length,
      contentType: 'image/png',
      digest: `sha256:${sha256(png)}`,
      browserDownloadUrl: 'https://github.com/example/repo/releases/download/live-audit-evidence/op-fp-v-context.png',
    }
    const runner = fakeRunner([
      result('[]'),
      result('', 1, 'HTTP 422 already_exists'),
      result(JSON.stringify([rawAssetPayload(valid)])),
    ])
    const verify = vi.fn().mockResolvedValue({ok: true, bytes: png, contentType: 'image/png', sha256: sha256(png)})
    await expect(
      publishEvidenceAsset({
        runner,
        repository: {owner: 'example', repo: 'repo'},
        release,
        assetName: valid.name,
        expectedBytes: png,
        verifyPublicImage: verify,
      }),
    ).resolves.toMatchObject({reused: false, asset: valid})
  })

  it('uses the repository-qualified asset endpoint and exact name without clobber', async () => {
    const valid = {
      id: 10,
      name: 'exact-name.png',
      state: 'uploaded',
      size: png.length,
      contentType: 'image/png',
      digest: `sha256:${sha256(png)}`,
      browserDownloadUrl: 'https://github.com/example/repo/releases/download/live-audit-evidence/exact-name.png',
    }
    const run = vi
      .fn()
      .mockResolvedValueOnce(result('[]'))
      .mockResolvedValueOnce(result(''))
      .mockResolvedValueOnce(result(JSON.stringify([rawAssetPayload(valid)])))
    const verify = vi.fn().mockResolvedValue({ok: true, bytes: png, contentType: 'image/png', sha256: sha256(png)})
    await publishEvidenceAsset({
      runner: {run},
      repository: {owner: 'example', repo: 'repo'},
      release,
      assetName: valid.name,
      expectedBytes: png,
      verifyPublicImage: verify,
    })
    expect(callArgs(run.mock.calls, 0)).toContain('repos/example/repo/releases/42/assets')
    expect(callArgs(run.mock.calls, 1).some(argument => argument.endsWith(`/${valid.name}`))).toBe(true)
    expect(callArgs(run.mock.calls, 1)).not.toContain('--clobber')
  })

  it('stops before upload when collision deletion fails', async () => {
    const collision = {
      id: 10,
      name: 'exact-name.png',
      state: 'starter',
      size: 0,
      contentType: 'application/octet-stream',
      browserDownloadUrl: 'https://github.com/example/repo/releases/download/live-audit-evidence/exact-name.png',
    }
    const runner = fakeRunner([result(JSON.stringify([rawAssetPayload(collision)])), result('', 1, 'forbidden')])
    await expect(
      publishEvidenceAsset({
        runner,
        repository: {owner: 'example', repo: 'repo'},
        release,
        assetName: collision.name,
        expectedBytes: png,
        verifyPublicImage: vi.fn(),
      }),
    ).rejects.toThrow(/delete/)
  })

  it('fails without deleting an exact durable asset when public verification is transient', async () => {
    const asset = {
      id: 10,
      name: 'exact-name.png',
      state: 'uploaded',
      size: png.length,
      contentType: 'image/png',
      digest: `sha256:${sha256(png)}`,
      browserDownloadUrl: 'https://github.com/example/repo/releases/download/live-audit-evidence/exact-name.png',
    }
    const runner = fakeRunner([result(JSON.stringify([rawAssetPayload(asset)]))])
    await expect(
      publishEvidenceAsset({
        runner,
        repository: {owner: 'example', repo: 'repo'},
        release,
        assetName: asset.name,
        expectedBytes: png,
        verifyPublicImage: vi.fn().mockResolvedValue({ok: false, reason: 'CDN timeout'}),
      }),
    ).rejects.toThrow(/refusing deletion|publicly verified/)
    expect(runner.run).toHaveBeenCalledOnce()
  })

  it('does not reuse a metadata match outside the expected release namespace', async () => {
    const asset = {
      id: 10,
      name: 'exact-name.png',
      state: 'uploaded',
      size: png.length,
      contentType: 'image/png',
      digest: `sha256:${sha256(png)}`,
      browserDownloadUrl: 'https://github.com/example/other/releases/download/live-audit-evidence/exact-name.png',
    }
    const runner = fakeRunner([result(JSON.stringify([rawAssetPayload(asset)]))])
    const verify = vi.fn().mockResolvedValue({ok: true, bytes: png, contentType: 'image/png', sha256: sha256(png)})
    await expect(
      publishEvidenceAsset({
        runner,
        repository: {owner: 'example', repo: 'repo'},
        release,
        assetName: asset.name,
        expectedBytes: png,
        verifyPublicImage: verify,
      }),
    ).rejects.toThrow(/metadata|namespace|collision|expected PNG/)
    expect(verify).not.toHaveBeenCalled()
    expect(runner.run).toHaveBeenCalledOnce()
  })

  it('rejects the former truncated PNG fixture before any asset API write', async () => {
    const truncated = Buffer.alloc(24)
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(truncated)
    truncated.write('IHDR', 12, 'ascii')
    truncated.writeUInt32BE(1, 16)
    truncated.writeUInt32BE(1, 20)
    const run = vi.fn()
    await expect(
      publishEvidenceAsset({
        runner: {run},
        repository: {owner: 'example', repo: 'repo'},
        release,
        assetName: 'truncated.png',
        expectedBytes: truncated,
        verifyPublicImage: vi.fn(),
      }),
    ).rejects.toThrow(/PNG|chunk|truncated/)
    expect(run).not.toHaveBeenCalled()
  })

  it('rejects unsafe public verification responses', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      url: 'https://evil.example/image',
      headers: new Headers({'content-type': 'text/html'}),
      arrayBuffer: async () => png.buffer,
    })
    await expect(
      verifyPublicPng('https://github.com/example/image.png', fetchImpl, {
        owner: 'example',
        repo: 'repo',
        tag: EVIDENCE_RELEASE_TAG,
        assetName: 'image.png',
      }),
    ).resolves.toMatchObject({ok: false})
  })

  it('accepts valid PNG bytes delivered as octet-stream and rejects malformed octet-stream', async () => {
    const expected = {
      owner: 'example',
      repo: 'repo',
      tag: EVIDENCE_RELEASE_TAG,
      assetName: 'image.png',
      expectedSha256: sha256(png),
    }
    const url = 'https://github.com/example/repo/releases/download/live-audit-evidence/image.png'
    const response = (bytes: Uint8Array) => ({
      ok: true,
      url,
      headers: new Headers({'content-type': 'application/octet-stream'}),
      arrayBuffer: async () => new Uint8Array(bytes).buffer,
    })

    await expect(verifyPublicPng(url, vi.fn().mockResolvedValue(response(png)), expected)).resolves.toMatchObject({
      ok: true,
      contentType: 'application/octet-stream',
      sha256: sha256(png),
    })
    await expect(
      verifyPublicPng(url, vi.fn().mockResolvedValue(response(Buffer.from('not a PNG'))), expected),
    ).resolves.toMatchObject({ok: false})
    await expect(
      verifyPublicPng(url, vi.fn().mockResolvedValue(response(png.subarray(0, -1))), expected),
    ).resolves.toMatchObject({ok: false})
  })

  it('bounds public verification to the expected release namespace, bytes, hash, and timeout', async () => {
    const expected = {owner: 'example', repo: 'repo', tag: EVIDENCE_RELEASE_TAG, assetName: 'image.png'}
    const validResponse = (url: string, bytes: Uint8Array = png) => ({
      ok: true,
      url,
      headers: new Headers({'content-type': 'image/png', 'content-length': String(bytes.length)}),
      arrayBuffer: async () => new Uint8Array(bytes).buffer,
    })
    await expect(
      verifyPublicPng(
        'https://github.com/other/repo/releases/download/live-audit-evidence/image.png',
        vi
          .fn()
          .mockResolvedValue(
            validResponse('https://github.com/other/repo/releases/download/live-audit-evidence/image.png'),
          ),
        expected,
      ),
    ).resolves.toMatchObject({ok: false})
    await expect(
      verifyPublicPng(
        'https://github.com/example/repo/releases/download/live-audit-evidence/other.png',
        vi
          .fn()
          .mockResolvedValue(
            validResponse('https://github.com/example/repo/releases/download/live-audit-evidence/other.png'),
          ),
        expected,
      ),
    ).resolves.toMatchObject({ok: false})
    await expect(
      verifyPublicPng(
        'https://github.com/example/repo/releases/download/live-audit-evidence/image.png',
        vi
          .fn()
          .mockResolvedValue(
            validResponse(
              'https://github.com/example/repo/releases/download/live-audit-evidence/image.png',
              Buffer.concat([png, Buffer.alloc(100)]),
            ),
          ),
        expected,
        {maxBytes: 10},
      ),
    ).resolves.toMatchObject({ok: false})
    const chunked = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(png))
        controller.enqueue(new Uint8Array(100))
        controller.close()
      },
    })
    await expect(
      verifyPublicPng(
        'https://github.com/example/repo/releases/download/live-audit-evidence/image.png',
        vi.fn().mockResolvedValue({
          ...validResponse('https://github.com/example/repo/releases/download/live-audit-evidence/image.png'),
          body: chunked,
          headers: new Headers({'content-type': 'image/png'}),
        }),
        expected,
        {maxBytes: 10},
      ),
    ).resolves.toMatchObject({ok: false})
    await expect(
      verifyPublicPng(
        'https://github.com/example/repo/releases/download/live-audit-evidence/image.png',
        vi
          .fn()
          .mockResolvedValue(
            validResponse('https://github.com/example/repo/releases/download/live-audit-evidence/image.png'),
          ),
        {...expected, expectedSha256: 'wrong'},
      ),
    ).resolves.toMatchObject({ok: false})
    await expect(
      verifyPublicPng(
        'https://github.com/example/repo/releases/download/live-audit-evidence/image.png',
        vi.fn().mockRejectedValue(new DOMException('timeout', 'TimeoutError')),
        expected,
        {timeoutMs: 1},
      ),
    ).resolves.toMatchObject({ok: false})
  })
})

describe('prerelease evidence release reconciliation', () => {
  const repository = {owner: 'example', repo: 'repo'}
  const uploadUrl = 'https://uploads.github.com/repos/example/repo/releases/42/assets{?name,label}'
  const releasePayload = (overrides: Record<string, unknown> = {}) => ({
    id: 42,
    tag_name: EVIDENCE_RELEASE_TAG,
    upload_url: uploadUrl,
    draft: false,
    prerelease: true,
    assets: [],
    ...overrides,
  })

  it('creates a missing release as a published prerelease that is never latest', async () => {
    const runner = fakeRunner([result('', 1, 'HTTP 404 Not Found'), result(JSON.stringify(releasePayload()))])

    await expect(getOrCreateEvidenceRelease(runner, repository)).resolves.toMatchObject({
      id: 42,
      tagName: EVIDENCE_RELEASE_TAG,
      isDraft: false,
      isPrerelease: true,
    })

    const calls = (runner.run as ReturnType<typeof vi.fn>).mock.calls
    expect(JSON.parse(callInput(calls, 1))).toEqual(
      expect.objectContaining({draft: false, prerelease: true, make_latest: 'false'}),
    )
  })

  it('reconciles an existing published normal release by patching its release ID', async () => {
    const runner = fakeRunner([
      result(JSON.stringify(releasePayload({prerelease: false}))),
      result(JSON.stringify(releasePayload())),
    ])

    await expect(getOrCreateEvidenceRelease(runner, repository)).resolves.toMatchObject({
      id: 42,
      tagName: EVIDENCE_RELEASE_TAG,
      isDraft: false,
      isPrerelease: true,
    })

    const calls = (runner.run as ReturnType<typeof vi.fn>).mock.calls
    expect(callArgs(calls, 1)).toEqual(['api', 'repos/example/repo/releases/42', '--method', 'PATCH', '--input', '-'])
    expect(JSON.parse(callInput(calls, 1))).toEqual({draft: false, prerelease: true, make_latest: 'false'})
  })

  it('reuses an already-correct published prerelease without mutation', async () => {
    const runner = fakeRunner([result(JSON.stringify(releasePayload()))])

    await expect(getOrCreateEvidenceRelease(runner, repository)).resolves.toMatchObject({
      id: 42,
      tagName: EVIDENCE_RELEASE_TAG,
      isDraft: false,
      isPrerelease: true,
    })
    expect(runner.run).toHaveBeenCalledOnce()
  })
})

describe('issue transport boundaries', () => {
  const issuePayload = {
    number: 204,
    title: 'Broken card',
    body: 'human prose',
    state: 'open',
    state_reason: null,
    labels: [{name: 'visual-audit'}],
    user: {login: 'maintainer'},
    comments: 1,
    updated_at: '2026-07-20T03:30:00Z',
  }

  it('parses issue and close-event payloads through narrow real-shape guards', async () => {
    const runner = fakeRunner([
      result(JSON.stringify(issuePayload)),
      result(
        JSON.stringify([
          [{id: 1, event: 'closed', created_at: '2026-07-20T03:30:00Z', actor: {login: 'github-actions[bot]'}}],
        ]),
      ),
    ])
    await expect(getIssue(runner, {owner: 'example', repo: 'repo'}, 204)).resolves.toMatchObject({
      number: 204,
      state: 'open',
      updatedAt: '2026-07-20T03:30:00Z',
    })
    await expect(getIssueCloseEvents(runner, {owner: 'example', repo: 'repo'}, 204)).resolves.toHaveLength(1)
    await expect(
      getIssue(
        fakeRunner([result(JSON.stringify({...issuePayload, labels: [{name: 42}]}))]),
        {owner: 'example', repo: 'repo'},
        204,
      ),
    ).rejects.toThrow(/shape/)
  })

  it('reads issue search, comments, and current collaborator permission', async () => {
    const comment = {id: 1, body: 'validation', user: {login: 'maintainer'}, created_at: '2026-07-20T03:30:00Z'}
    const runner = fakeRunner([
      result(JSON.stringify([{total_count: 1, incomplete_results: false, items: [issuePayload]}])),
      result(JSON.stringify([[comment]])),
      result(JSON.stringify({permission: 'maintain', user: {login: 'maintainer'}})),
    ])
    await expect(searchIssues(runner, {owner: 'example', repo: 'repo'}, 'visual-audit', 'open')).resolves.toHaveLength(
      1,
    )
    await expect(getIssueComments(runner, {owner: 'example', repo: 'repo'}, 204)).resolves.toMatchObject([
      {body: 'validation'},
    ])
    await expect(getRepositoryPermission(runner, {owner: 'example', repo: 'repo'}, 'maintainer')).resolves.toBe(
      'maintain',
    )
  })

  it('uses slurped pagination and rejects incomplete or truncated search responses', async () => {
    const event = {id: 2, event: 'closed', created_at: '2026-07-20T03:30:00Z', actor: {login: 'bot'}}
    const comment = {id: 1, body: 'validation', user: {login: 'maintainer'}, created_at: '2026-07-20T03:30:00Z'}
    const paginated = fakeRunner([
      result(JSON.stringify([[event], [event]])),
      result(JSON.stringify([[comment], [comment]])),
      result(
        JSON.stringify([
          {total_count: 2, incomplete_results: false, items: [issuePayload]},
          {total_count: 2, incomplete_results: false, items: [issuePayload]},
        ]),
      ),
    ])
    await expect(getIssueCloseEvents(paginated, {owner: 'example', repo: 'repo'}, 204)).resolves.toHaveLength(2)
    await expect(getIssueComments(paginated, {owner: 'example', repo: 'repo'}, 204)).resolves.toHaveLength(2)
    await expect(
      searchIssues(paginated, {owner: 'example', repo: 'repo'}, 'visual-audit', 'open'),
    ).resolves.toHaveLength(2)
    expect(callArgs((paginated.run as ReturnType<typeof vi.fn>).mock.calls, 0)).toContain('--paginate')
    const incomplete = fakeRunner([
      result(JSON.stringify([{total_count: 1, incomplete_results: true, items: [issuePayload]}])),
    ])
    await expect(searchIssues(incomplete, {owner: 'example', repo: 'repo'}, 'visual-audit', 'open')).rejects.toThrow(
      /incomplete|truncated/,
    )
  })

  it('uses JSON stdin boundaries for create, fresh body patch, comments, labels, and state', async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce(result(JSON.stringify(issuePayload)))
      .mockResolvedValueOnce(result(JSON.stringify(issuePayload)))
      .mockResolvedValueOnce(result('{}'))
      .mockResolvedValueOnce(result(JSON.stringify(issuePayload)))
      .mockResolvedValue(result('{}'))
    const runner: GhRunner = {run}
    await createIssue(
      runner,
      {owner: 'example', repo: 'repo'},
      {title: '$(hostile)', body: 'body; rm -rf', labels: ['visual-audit']},
    )
    await patchIssueBodyFresh(runner, {owner: 'example', repo: 'repo'}, 204, () => 'human + ledger')
    await addIssueComment(runner, {owner: 'example', repo: 'repo'}, 204, 'comment --flag')
    await setIssueLabels(runner, {owner: 'example', repo: 'repo'}, 204, ['visual-audit'])
    await setIssueState(runner, {owner: 'example', repo: 'repo'}, 204, 'closed', 'completed')
    expect(
      run.mock.calls.some(
        (_call, index) =>
          callArgs(run.mock.calls, index).includes('--input') &&
          callInput(run.mock.calls, index).includes('$(hostile)'),
      ),
    ).toBe(true)
    expect(
      run.mock.calls.every((_call, index) =>
        callArgs(run.mock.calls, index).every(arg => !arg.includes('$(hostile)') && !arg.includes('rm -rf')),
      ),
    ).toBe(true)
  })

  it('validates repository, actor, and issue identifiers and uses exact state_reason enums', async () => {
    const runner = fakeRunner([result(JSON.stringify(issuePayload))])
    await expect(getIssue(runner, {owner: 'bad/owner', repo: 'repo'}, 204)).rejects.toThrow(/repository/)
    await expect(getIssue(runner, {owner: 'example', repo: 'repo'}, 0)).rejects.toThrow(/issue/)
    await expect(getRepositoryPermission(runner, {owner: 'example', repo: 'repo'}, 'bad/actor')).rejects.toThrow(
      /actor/,
    )
    const run = vi.fn().mockResolvedValue(result('{}'))
    await setIssueState({run}, {owner: 'example', repo: 'repo'}, 204, 'closed', 'not_planned')
    expect(callInput(run.mock.calls, 0)).toContain('not_planned')
    await setIssueState({run}, {owner: 'example', repo: 'repo'}, 204, 'open', 'reopened')
    expect(callInput(run.mock.calls, 1)).toContain('reopened')
  })

  it('merges over a fresh issue body and rereads the patched issue', async () => {
    const fresh = {...issuePayload, body: 'human edit'}
    const updated = {...issuePayload, body: 'human edit\nledger', updated_at: '2026-07-20T03:31:00Z'}
    const run = vi
      .fn()
      .mockResolvedValueOnce(result(JSON.stringify(fresh)))
      .mockResolvedValueOnce(result(JSON.stringify(updated)))
      .mockResolvedValueOnce(result(JSON.stringify(updated)))
    await expect(
      patchIssueBodyFresh(
        {run},
        {owner: 'example', repo: 'repo'},
        204,
        (issue: GitHubIssue) => `${issue.body ?? ''}\nledger`,
      ),
    ).resolves.toMatchObject({body: updated.body, updatedAt: updated.updated_at})
    expect(callInput(run.mock.calls, 1)).toContain('human edit')
    expect(callArgs(run.mock.calls, 2).some(argument => argument.includes('issues/204'))).toBe(true)
  })
})
