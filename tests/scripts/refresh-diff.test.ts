import {Buffer} from 'node:buffer'
import {spawnSync} from 'node:child_process'
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import process from 'node:process'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {
  BLOG_SNAPSHOT_PATH,
  combineOutcomes,
  detectPreviewChanges,
  evaluatePreviewCheck,
  evaluateSnapshotCheck,
  normalizeForComparison,
  PREVIEW_DIRECTORY,
  PROJECTS_SNAPSHOT_PATH,
  runDetection,
  type CheckOutcome,
} from '../../scripts/refresh-diff'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// The exact PR #369 delta: a real repo's projects-snapshot.json where the
// only differences between the committed and regenerated file are one
// project's `lastUpdated` and the top-level `generatedAt`.
const pr369Project = {
  id: '1297795539',
  title: 'Dev Like',
  description:
    "Profile a shop's engineering culture from public sources and install develop-like-<target> agent skills. /dev-like Every",
  url: 'https://github.com/marcusrbrown/dev-like',
  language: 'JavaScript',
  stars: 2,
  homepage: 'https://mrbro.dev/dev-like/',
  topics: ['agent-skills', 'ai-agents', 'claude-code', 'codex', 'cursor', 'engineering-culture', 'portfolio'],
  lastUpdated: '2026-09-01T12:40:27Z',
  imageUrl: '/project-previews/1297795539.png',
}

const pr369Previous = {
  projects: [pr369Project],
  generatedAt: '2026-09-02T07:00:29.410Z',
  generator: 'projects-refresh',
}

const pr369Current = {
  ...pr369Previous,
  projects: [{...pr369Project, lastUpdated: '2026-09-16T01:56:01Z'}],
  generatedAt: '2026-09-16T07:00:00.595Z',
}

const stringify = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`

// ---------------------------------------------------------------------------
// Unit: normalizeForComparison
// ---------------------------------------------------------------------------

describe('refresh-diff script', () => {
  describe('normalizeForComparison', () => {
    it('strips top-level generatedAt for both snapshot kinds', () => {
      const blog = {posts: [], generatedAt: '2026-01-01T00:00:00.000Z', generator: 'blog-refresh'}
      expect(normalizeForComparison({...blog, generatedAt: 'A'}, 'blog')).toBe(
        normalizeForComparison({...blog, generatedAt: 'B'}, 'blog'),
      )
    })

    it('strips each project lastUpdated for the projects kind', () => {
      const a = normalizeForComparison(pr369Previous, 'projects')
      const b = normalizeForComparison(pr369Current, 'projects')
      expect(a).toBe(b)
    })

    it('does NOT strip lastUpdated-shaped fields for the blog kind (no such field exists on posts)', () => {
      const post = {slug: 's', gistId: 'g', gistUpdatedAt: 'A'}
      const snapshot = {posts: [post], generatedAt: 'X', generator: 'blog-refresh'}
      const other = {posts: [{...post, gistUpdatedAt: 'B'}], generatedAt: 'X', generator: 'blog-refresh'}
      // gistUpdatedAt is a real, compared field for blog posts — a change there
      // must NOT be normalized away.
      expect(normalizeForComparison(snapshot, 'blog')).not.toBe(normalizeForComparison(other, 'blog'))
    })

    it('detects a real field change (description) even with matching volatile fields', () => {
      const changed = {
        ...pr369Current,
        projects: [{...pr369Current.projects[0], description: 'A totally different description'}],
      }
      expect(normalizeForComparison(pr369Current, 'projects')).not.toBe(normalizeForComparison(changed, 'projects'))
    })

    it('detects topics changes', () => {
      const topicsChanged = {
        ...pr369Current,
        projects: [{...pr369Current.projects[0], topics: ['new-topic']}],
      }
      expect(normalizeForComparison(pr369Current, 'projects')).not.toBe(
        normalizeForComparison(topicsChanged, 'projects'),
      )
    })

    it('ignores a stars-only change — a star is third-party interaction, not the project changing', () => {
      const starsChanged = {
        ...pr369Current,
        projects: [{...pr369Current.projects[0], stars: 999}],
      }
      expect(normalizeForComparison(pr369Current, 'projects')).toBe(normalizeForComparison(starsChanged, 'projects'))
    })

    it('does NOT let a stars change mask a real field change occurring alongside it', () => {
      const starsAndDescriptionChanged = {
        ...pr369Current,
        projects: [{...pr369Current.projects[0], stars: 999, description: 'A totally different description'}],
      }
      expect(normalizeForComparison(pr369Current, 'projects')).not.toBe(
        normalizeForComparison(starsAndDescriptionChanged, 'projects'),
      )
    })

    it('detects a project being added or removed', () => {
      const added = {
        ...pr369Current,
        projects: [...pr369Current.projects, {...pr369Current.projects[0], id: 'other-id'}],
      }
      expect(normalizeForComparison(pr369Current, 'projects')).not.toBe(normalizeForComparison(added, 'projects'))

      const removed = {...pr369Current, projects: []}
      expect(normalizeForComparison(pr369Current, 'projects')).not.toBe(normalizeForComparison(removed, 'projects'))
    })
  })

  // ---------------------------------------------------------------------------
  // Unit: evaluateSnapshotCheck (the #369 fixture proof)
  // ---------------------------------------------------------------------------

  describe('evaluateSnapshotCheck', () => {
    it('PR #369 fixture: timestamp-only + generatedAt-only delta in projects-snapshot.json → unchanged', () => {
      const outcome = evaluateSnapshotCheck(
        'projects-snapshot.json',
        'projects',
        {content: stringify(pr369Current)},
        {content: stringify(pr369Previous)},
      )
      expect(outcome.status).toBe('unchanged')
      expect(outcome.warning).toBeUndefined()
    })

    it('generatedAt-only delta in blog-snapshot.json → unchanged', () => {
      const previous = {posts: [], generatedAt: 'A', generator: 'blog-refresh'}
      const current = {posts: [], generatedAt: 'B', generator: 'blog-refresh'}
      const outcome = evaluateSnapshotCheck(
        'blog-snapshot.json',
        'blog',
        {content: stringify(current)},
        {content: stringify(previous)},
      )
      expect(outcome.status).toBe('unchanged')
    })

    it('a real field change (description) → changed', () => {
      const changed = {
        ...pr369Current,
        projects: [{...pr369Current.projects[0], description: 'Something new'}],
      }
      const outcome = evaluateSnapshotCheck(
        'projects-snapshot.json',
        'projects',
        {content: stringify(changed)},
        {content: stringify(pr369Previous)},
      )
      expect(outcome.status).toBe('changed')
    })

    it('a stars-only delta → unchanged (a star is third-party interaction, not a PR-worthy update)', () => {
      const starsOnly = {
        ...pr369Previous,
        projects: [{...pr369Project, stars: pr369Project.stars + 50}],
      }
      const outcome = evaluateSnapshotCheck(
        'projects-snapshot.json',
        'projects',
        {content: stringify(starsOnly)},
        {content: stringify(pr369Previous)},
      )
      expect(outcome.status).toBe('unchanged')
      expect(outcome.warning).toBeUndefined()
    })

    it('stars changing together with a real field change → changed (broadening the volatile set must not mask a co-occurring real edit)', () => {
      const starsAndDescription = {
        ...pr369Previous,
        projects: [
          {
            ...pr369Project,
            stars: pr369Project.stars + 50,
            description: 'A brand new description landing in the same run as a star bump',
          },
        ],
      }
      const outcome = evaluateSnapshotCheck(
        'projects-snapshot.json',
        'projects',
        {content: stringify(starsAndDescription)},
        {content: stringify(pr369Previous)},
      )
      expect(outcome.status).toBe('changed')
    })

    it('a project being added → changed', () => {
      const withExtra = {
        ...pr369Previous,
        projects: [...pr369Previous.projects, {...pr369Previous.projects[0], id: 'new-project'}],
      }
      const outcome = evaluateSnapshotCheck(
        'projects-snapshot.json',
        'projects',
        {content: stringify(withExtra)},
        {content: stringify(pr369Previous)},
      )
      expect(outcome.status).toBe('changed')
    })

    it('a project being removed → changed', () => {
      const emptied = {...pr369Previous, projects: []}
      const outcome = evaluateSnapshotCheck(
        'projects-snapshot.json',
        'projects',
        {content: stringify(emptied)},
        {content: stringify(pr369Previous)},
      )
      expect(outcome.status).toBe('changed')
    })

    it('a new file with no committed version → changed, no warning (legitimate new file)', () => {
      const outcome = evaluateSnapshotCheck(
        'projects-snapshot.json',
        'projects',
        {content: stringify(pr369Previous)},
        {content: null},
      )
      expect(outcome.status).toBe('changed')
      expect(outcome.warning).toBeUndefined()
    })

    it('fails CLOSED (changed, with warning) when the regenerated file cannot be read', () => {
      const outcome = evaluateSnapshotCheck(
        'projects-snapshot.json',
        'projects',
        {error: 'ENOENT: no such file'},
        {content: stringify(pr369Previous)},
      )
      expect(outcome.status).toBe('error')
      expect(outcome.warning).toMatch(/regenerated projects-snapshot\.json/)
    })

    it('fails CLOSED (changed, with warning) when the committed file cannot be read via git', () => {
      const outcome = evaluateSnapshotCheck(
        'projects-snapshot.json',
        'projects',
        {content: stringify(pr369Current)},
        {error: 'fatal: not a git repository'},
      )
      expect(outcome.status).toBe('error')
      expect(outcome.warning).toMatch(/committed projects-snapshot\.json/)
    })

    it('fails CLOSED (changed, with warning) on malformed JSON in the regenerated file', () => {
      const outcome = evaluateSnapshotCheck(
        'projects-snapshot.json',
        'projects',
        {content: 'NOT VALID JSON'},
        {content: stringify(pr369Previous)},
      )
      expect(outcome.status).toBe('error')
      expect(outcome.warning).toMatch(/Could not semantically compare/)
    })

    it('fails CLOSED (changed, with warning) on malformed JSON in the committed file', () => {
      const outcome = evaluateSnapshotCheck(
        'projects-snapshot.json',
        'projects',
        {content: stringify(pr369Current)},
        {content: 'NOT VALID JSON'},
      )
      expect(outcome.status).toBe('error')
      expect(outcome.warning).toMatch(/Could not semantically compare/)
    })

    it('fails CLOSED on a non-object JSON payload (e.g. a bare array)', () => {
      const outcome = evaluateSnapshotCheck(
        'projects-snapshot.json',
        'projects',
        {content: '[]'},
        {content: stringify(pr369Previous)},
      )
      expect(outcome.status).toBe('error')
    })
  })

  // ---------------------------------------------------------------------------
  // Unit: preview directory detection
  // ---------------------------------------------------------------------------

  describe('detectPreviewChanges / evaluatePreviewCheck', () => {
    it('detects an untracked new preview PNG (porcelain "??" entry)', () => {
      const result = detectPreviewChanges('?? public/project-previews/1234.png\n')
      expect(result.changed).toBe(true)
      expect(result.paths).toEqual(['public/project-previews/1234.png'])
    })

    it('detects a modified tracked preview PNG and extracts the FULL path, uncorrupted by the leading-space status column', () => {
      // Bite-proof: porcelain's fixed-width prefix is "XY " (X or Y may be a
      // literal space). Trimming the line before slicing off that prefix eats
      // one character of the path whenever X is a space -- exactly this case.
      const result = detectPreviewChanges(' M public/project-previews/1234.png\n')
      expect(result.changed).toBe(true)
      expect(result.paths).toEqual(['public/project-previews/1234.png'])
    })

    it('detects a deleted preview PNG', () => {
      const result = detectPreviewChanges(' D public/project-previews/1234.png\n')
      expect(result.changed).toBe(true)
      expect(result.paths).toEqual(['public/project-previews/1234.png'])
    })

    it('extracts a path added to the index ("A  path")', () => {
      const result = detectPreviewChanges('A  public/project-previews/9999.png\n')
      expect(result.paths).toEqual(['public/project-previews/9999.png'])
    })

    it('extracts a path modified in both index and work tree ("MM path")', () => {
      const result = detectPreviewChanges('MM public/project-previews/1234.png\n')
      expect(result.paths).toEqual(['public/project-previews/1234.png'])
    })

    it('preserves a space embedded in the path itself', () => {
      const result = detectPreviewChanges(' M public/project-previews/my project.png\n')
      expect(result.paths).toEqual(['public/project-previews/my project.png'])
    })

    it('extracts the destination path from a rename entry ("R  old -> new")', () => {
      // Renamed/copied entries report as "XY ORIG_PATH -> NEW_PATH". The
      // destination is what a maintainer reading the summary needs to find on
      // disk right now, so that -- not the origin -- is what this reports.
      const result = detectPreviewChanges('R  public/project-previews/1234.png -> public/project-previews/5678.png\n')
      expect(result.paths).toEqual(['public/project-previews/5678.png'])
    })

    it('does not misparse an ordinary (non-rename) path that happens to contain " -> "', () => {
      const result = detectPreviewChanges(' M public/project-previews/before -> after.png\n')
      expect(result.paths).toEqual(['public/project-previews/before -> after.png'])
    })

    it('reports no change on empty porcelain output', () => {
      const result = detectPreviewChanges('')
      expect(result.changed).toBe(false)
      expect(result.paths).toEqual([])
    })

    it('evaluatePreviewCheck fails CLOSED when the git status check itself fails', () => {
      const outcome = evaluatePreviewCheck({error: 'fatal: not a git repository'})
      expect(outcome.status).toBe('error')
      expect(outcome.warning).toMatch(new RegExp(PREVIEW_DIRECTORY.replaceAll('/', String.raw`\/`)))
    })

    it('evaluatePreviewCheck reports unchanged for empty output', () => {
      expect(evaluatePreviewCheck({output: ''}).status).toBe('unchanged')
    })
  })

  // ---------------------------------------------------------------------------
  // Unit: combineOutcomes
  // ---------------------------------------------------------------------------

  describe('combineOutcomes', () => {
    it('is unchanged only when every outcome is unchanged', () => {
      const outcomes: CheckOutcome[] = [
        {status: 'unchanged', note: 'a'},
        {status: 'unchanged', note: 'b'},
      ]
      expect(combineOutcomes(outcomes).changed).toBe(false)
    })

    it('is changed when any outcome is changed', () => {
      const outcomes: CheckOutcome[] = [
        {status: 'unchanged', note: 'a'},
        {status: 'changed', note: 'b'},
      ]
      expect(combineOutcomes(outcomes).changed).toBe(true)
    })

    it('is changed when any outcome errored, and surfaces its warning', () => {
      const outcomes: CheckOutcome[] = [
        {status: 'unchanged', note: 'a'},
        {status: 'error', note: 'b', warning: 'boom'},
      ]
      const result = combineOutcomes(outcomes)
      expect(result.changed).toBe(true)
      expect(result.warnings).toEqual(['boom'])
    })

    it('collects one summary line per outcome', () => {
      const outcomes: CheckOutcome[] = [
        {status: 'unchanged', note: 'a'},
        {status: 'changed', note: 'b'},
      ]
      expect(combineOutcomes(outcomes).summary).toEqual(['- a', '- b'])
    })
  })

  // ---------------------------------------------------------------------------
  // Hermetic git environment (shared by every integration test below)
  //
  // A pre-push hook runs this whole suite as part of `git push`. Git exports
  // repository-location/index/object-store variables into that hook's
  // environment (empirically confirmed: `GIT_DIR` and `GIT_PREFIX` are set for
  // a pre-push hook invoked from a worktree checkout -- reproduced with a
  // scratch bare remote + worktree + a hook that dumps `env | grep ^GIT_`).
  // `GIT_INDEX_FILE` is set whenever a temporary/partial index is in play
  // (e.g. lint-staged's partial-stage step upstream of the push). Left
  // ambient, any of these silently redirect a `git` command spawned inside
  // one of this suite's scratch repositories back onto the REAL repository,
  // worktree, or index that is mid-push -- exactly what broke
  // `runDetection (integration, real git)` under the hook: `git commit`
  // inside a scratch tmpdir failed with "Current directory is not a git
  // directory" because `GIT_DIR`/`GIT_INDEX_FILE` pointed at the real repo.
  //
  // Deliberately NOT scrubbed: `GIT_AUTHOR_*`/`GIT_COMMITTER_*`/`GIT_EDITOR`/
  // `GIT_PAGER`/`GIT_SSH*`/`GIT_ASKPASS`/`GIT_TERMINAL_PROMPT`/`GIT_CONFIG*`.
  // None of those redirect a command to a different repository, index, or
  // object store -- they only affect commit metadata, transport, or
  // interactive UI, and no assertion in this file depends on any of them.
  const GIT_ENV_VARS_TO_SCRUB = [
    'GIT_DIR',
    'GIT_WORK_TREE',
    'GIT_COMMON_DIR',
    'GIT_NAMESPACE',
    'GIT_CEILING_DIRECTORIES',
    'GIT_DISCOVERY_ACROSS_FILESYSTEM',
    'GIT_INDEX_FILE',
    'GIT_INDEX_VERSION',
    'GIT_OBJECT_DIRECTORY',
    'GIT_ALTERNATE_OBJECT_DIRECTORIES',
    'GIT_QUARANTINE_PATH',
    'GIT_PREFIX',
    'GIT_EXEC_PATH',
  ] as const

  /**
   * Builds an env object for a SPAWNED child with every `GIT_ENV_VARS_TO_SCRUB`
   * entry removed, then layers `extraEnv` on top. An `extraEnv` value of
   * `undefined` deletes that key too (rather than being skipped), so a caller
   * can explicitly assert a variable's absence -- mirroring
   * `tests/scripts/pre-push.test.ts` and
   * docs/solutions/integration-issues/pre-push-hook-blocks-renovate-pushes-2026-09-16.md.
   */
  const hermeticGitEnv = (extraEnv: Record<string, string | undefined> = {}): Record<string, string | undefined> => {
    const env: Record<string, string | undefined> = {...process.env}
    for (const key of GIT_ENV_VARS_TO_SCRUB) delete env[key]

    Object.assign(env, extraEnv)
    for (const [key, value] of Object.entries(extraEnv)) {
      if (value === undefined) delete env[key]
    }

    return env
  }

  /**
   * Runs `fn` with every `GIT_ENV_VARS_TO_SCRUB` entry temporarily removed
   * from the CURRENT process's `process.env`, restoring the previous value
   * (or absence) afterward even if `fn` throws. Needed because `runDetection`
   * calls production code IN-PROCESS: its internal `execFileSync('git', ...)`
   * calls inherit `process.env` directly (they pass no `env` override), not an
   * object this test file controls -- so `hermeticGitEnv()` alone (which only
   * shapes an env object handed to a spawned child) cannot reach them.
   */
  const withHermeticProcessEnv = <T>(fn: () => T): T => {
    const previous = new Map(GIT_ENV_VARS_TO_SCRUB.map(key => [key, process.env[key]]))
    for (const key of GIT_ENV_VARS_TO_SCRUB) delete process.env[key]
    try {
      return fn()
    } finally {
      for (const [key, value] of previous) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Regression guard: the hermetic-env helper must not leak ambient GIT_*
  // variables into anything it touches. Bite-proofed manually: commenting out
  // either scrub loop above reliably fails the corresponding test below.
  // ---------------------------------------------------------------------------

  describe('hermetic git environment helpers (regression guard)', () => {
    const ambientBackup = new Map<string, string | undefined>()

    beforeEach(() => {
      for (const key of GIT_ENV_VARS_TO_SCRUB) {
        ambientBackup.set(key, process.env[key])
        process.env[key] = `contaminated-${key}`
      }
    })

    afterEach(() => {
      for (const [key, value] of ambientBackup) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
      ambientBackup.clear()
    })

    it('hermeticGitEnv() does not leak ambient GIT_* variables into a spawned command', () => {
      const script = 'console.log(JSON.stringify(Object.keys(process.env).filter(k => k.startsWith("GIT_"))))'
      const result = spawnSync(process.execPath, ['-e', script], {encoding: 'utf8', env: hermeticGitEnv()})

      expect(result.status).toBe(0)
      expect(JSON.parse(result.stdout) as string[]).toEqual([])
    })

    it('withHermeticProcessEnv() removes ambient GIT_* variables for the callback, then restores them', () => {
      const seenDuringCallback = withHermeticProcessEnv(() => GIT_ENV_VARS_TO_SCRUB.filter(key => key in process.env))
      expect(seenDuringCallback).toEqual([])

      // Restored to the contaminated values this describe block's beforeEach set.
      for (const key of GIT_ENV_VARS_TO_SCRUB) {
        expect(process.env[key]).toBe(`contaminated-${key}`)
      }
    })
  })

  // ---------------------------------------------------------------------------
  // Integration: runDetection against a real scratch git repository
  // ---------------------------------------------------------------------------

  describe('runDetection (integration, real git)', () => {
    let repoDir: string

    const git = (args: string[]) => {
      const result = spawnSync('git', args, {cwd: repoDir, encoding: 'utf8', env: hermeticGitEnv()})
      if (result.status !== 0) {
        throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`)
      }
      return result.stdout
    }

    const initRepo = () => {
      repoDir = mkdtempSync(join(tmpdir(), 'refresh-diff-test-'))
      git(['init', '-q'])
      git(['config', 'user.email', 'test@example.com'])
      git(['config', 'user.name', 'Test'])
    }

    const writeAndCommit = (relativePath: string, content: string, message: string) => {
      const fullPath = join(repoDir, relativePath)
      spawnSync('mkdir', ['-p', dirname(fullPath)])
      writeFileSync(fullPath, content)
      git(['add', relativePath])
      git(['commit', '-q', '-m', message])
    }

    afterEach(() => {
      rmSync(repoDir, {recursive: true, force: true})
    })

    it('PR #369 case end-to-end: timestamp-only rewrite of a real git working tree → not changed', () => {
      initRepo()
      writeAndCommit(
        BLOG_SNAPSHOT_PATH,
        stringify({posts: [], generatedAt: 'A', generator: 'blog-refresh'}),
        'seed blog',
      )
      writeAndCommit(PROJECTS_SNAPSHOT_PATH, stringify(pr369Previous), 'seed projects')

      // Simulate the refresh scripts rewriting the working tree in place —
      // blog-snapshot.json byte-identical, projects-snapshot.json with only
      // the #369 timestamp delta, no preview changes.
      writeFileSync(join(repoDir, PROJECTS_SNAPSHOT_PATH), stringify(pr369Current))

      const result = withHermeticProcessEnv(() => runDetection(repoDir))
      expect(result.changed).toBe(false)
      expect(result.warnings).toEqual([])
    })

    it('a real field change on disk → changed', () => {
      initRepo()
      writeAndCommit(
        BLOG_SNAPSHOT_PATH,
        stringify({posts: [], generatedAt: 'A', generator: 'blog-refresh'}),
        'seed blog',
      )
      writeAndCommit(PROJECTS_SNAPSHOT_PATH, stringify(pr369Previous), 'seed projects')

      const changed = {
        ...pr369Current,
        projects: [{...pr369Current.projects[0], description: 'New description entirely'}],
      }
      writeFileSync(join(repoDir, PROJECTS_SNAPSHOT_PATH), stringify(changed))

      const result = withHermeticProcessEnv(() => runDetection(repoDir))
      expect(result.changed).toBe(true)
    })

    it('an untracked new preview PNG on disk → changed', () => {
      initRepo()
      writeAndCommit(
        BLOG_SNAPSHOT_PATH,
        stringify({posts: [], generatedAt: 'A', generator: 'blog-refresh'}),
        'seed blog',
      )
      writeAndCommit(PROJECTS_SNAPSHOT_PATH, stringify(pr369Previous), 'seed projects')
      // Timestamp-only rewrite, same as the #369 case.
      writeFileSync(join(repoDir, PROJECTS_SNAPSHOT_PATH), stringify(pr369Current))

      spawnSync('mkdir', ['-p', join(repoDir, PREVIEW_DIRECTORY)])
      writeFileSync(join(repoDir, PREVIEW_DIRECTORY, 'new-image.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))

      const result = withHermeticProcessEnv(() => runDetection(repoDir))
      expect(result.changed).toBe(true)
      expect(result.summary.some(line => line.includes('new-image.png'))).toBe(true)
    })

    it('CLI: writes changed=false to GITHUB_OUTPUT for the #369 case, changed=true after a real edit', () => {
      initRepo()
      writeAndCommit(
        BLOG_SNAPSHOT_PATH,
        stringify({posts: [], generatedAt: 'A', generator: 'blog-refresh'}),
        'seed blog',
      )
      writeAndCommit(PROJECTS_SNAPSHOT_PATH, stringify(pr369Previous), 'seed projects')
      writeFileSync(join(repoDir, PROJECTS_SNAPSHOT_PATH), stringify(pr369Current))

      const outputPath = join(repoDir, 'github-output.txt')
      writeFileSync(outputPath, '')

      const run = spawnSync(
        process.execPath,
        [
          '--import',
          join(process.cwd(), 'node_modules/tsx/dist/loader.mjs'),
          join(process.cwd(), 'scripts/refresh-diff.ts'),
        ],
        {cwd: repoDir, encoding: 'utf8', env: hermeticGitEnv({GITHUB_OUTPUT: outputPath})},
      )

      expect(run.status).toBe(0)
      expect(readFileSync(outputPath, 'utf8')).toContain('changed=false')

      const changed = {
        ...pr369Current,
        projects: [{...pr369Current.projects[0], topics: ['brand-new-topic']}],
      }
      writeFileSync(join(repoDir, PROJECTS_SNAPSHOT_PATH), stringify(changed))
      writeFileSync(outputPath, '')

      const run2 = spawnSync(
        process.execPath,
        [
          '--import',
          join(process.cwd(), 'node_modules/tsx/dist/loader.mjs'),
          join(process.cwd(), 'scripts/refresh-diff.ts'),
        ],
        {cwd: repoDir, encoding: 'utf8', env: hermeticGitEnv({GITHUB_OUTPUT: outputPath})},
      )

      expect(run2.status).toBe(0)
      expect(readFileSync(outputPath, 'utf8')).toContain('changed=true')
    })
  })
})
