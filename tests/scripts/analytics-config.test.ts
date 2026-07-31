import type {Plugin} from 'vite'
import {readFileSync} from 'node:fs'
import {mkdtemp, readFile, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import process from 'node:process'
import {build as viteBuild} from 'vite'
import {describe, expect, it} from 'vitest'
import {parse as parseYaml} from 'yaml'
import viteConfig, {
  buildUmamiTrackerTag,
  resolveUmamiWebsiteId,
  shouldInjectUmamiTracker,
  UMAMI_SCRIPT_URL,
} from '../../vite.config'

const FIXTURE_WEBSITE_ID = '123e4567-e89b-12d3-a456-426614174000'

interface UmamiBuildState {
  name: string
  command: 'build' | 'serve'
  mode: string
  websiteId: string | undefined
  enabled: boolean
}

const withWebsiteId = <Result>(websiteId: string | undefined, callback: () => Result): Result => {
  const previousWebsiteId = process.env.VITE_UMAMI_WEBSITE_ID
  if (websiteId === undefined) {
    delete process.env.VITE_UMAMI_WEBSITE_ID
  } else {
    process.env.VITE_UMAMI_WEBSITE_ID = websiteId
  }

  try {
    return callback()
  } finally {
    if (previousWebsiteId === undefined) {
      delete process.env.VITE_UMAMI_WEBSITE_ID
    } else {
      process.env.VITE_UMAMI_WEBSITE_ID = previousWebsiteId
    }
  }
}

const umamiBuildStates: UmamiBuildState[] = [
  {
    name: 'configured production',
    command: 'build',
    mode: 'production',
    websiteId: FIXTURE_WEBSITE_ID,
    enabled: true,
  },
  {
    name: 'unconfigured production',
    command: 'build',
    mode: 'production',
    websiteId: undefined,
    enabled: false,
  },
  {
    name: 'configured development serve',
    command: 'serve',
    mode: 'development',
    websiteId: FIXTURE_WEBSITE_ID,
    enabled: false,
  },
]

const isUmamiTrackerPlugin = (plugin: unknown): plugin is Plugin =>
  typeof plugin === 'object' &&
  plugin !== null &&
  !Array.isArray(plugin) &&
  'name' in plugin &&
  plugin.name === 'umami-tracker-injection'

const runTrackerTransform = async (plugin: Plugin) => {
  const transform = plugin.transformIndexHtml
  if (typeof transform === 'function') return Reflect.apply(transform, undefined, [''])
  if (transform) return Reflect.apply(transform.handler, undefined, [''])
  return undefined
}

describe('Umami tracker build-time activation', () => {
  describe('resolveUmamiWebsiteId', () => {
    it.each([
      [undefined, undefined],
      ['', undefined],
    ])('treats %j as unconfigured', (websiteId, expected) => {
      expect(resolveUmamiWebsiteId(websiteId)).toBe(expected)
    })

    it('returns a valid UUID unchanged', () => {
      expect(resolveUmamiWebsiteId(FIXTURE_WEBSITE_ID)).toBe(FIXTURE_WEBSITE_ID)
    })
  })

  describe('shouldInjectUmamiTracker', () => {
    it('injects only for a configured production build', () => {
      expect(shouldInjectUmamiTracker({command: 'build', mode: 'production', websiteId: FIXTURE_WEBSITE_ID})).toBe(true)
    })

    it('does not inject for development builds even when configured', () => {
      expect(shouldInjectUmamiTracker({command: 'serve', mode: 'development', websiteId: FIXTURE_WEBSITE_ID})).toBe(
        false,
      )
    })

    it('does not inject for production builds without a website ID', () => {
      expect(shouldInjectUmamiTracker({command: 'build', mode: 'production', websiteId: undefined})).toBe(false)
    })

    it('does not inject for production builds with an empty website ID', () => {
      expect(shouldInjectUmamiTracker({command: 'build', mode: 'production', websiteId: ''})).toBe(false)
    })

    it.each([' ', '\t', '\n'])('rejects a whitespace-only website ID (%j)', websiteId => {
      expect(() => shouldInjectUmamiTracker({command: 'build', mode: 'production', websiteId})).toThrow(
        /Invalid VITE_UMAMI_WEBSITE_ID.*UUID/,
      )
    })

    it('rejects a website ID with surrounding whitespace', () => {
      expect(() =>
        shouldInjectUmamiTracker({command: 'build', mode: 'production', websiteId: ` ${FIXTURE_WEBSITE_ID} `}),
      ).toThrow(/Invalid VITE_UMAMI_WEBSITE_ID.*UUID/)
    })

    it.each([`${FIXTURE_WEBSITE_ID}\n`, `\n${FIXTURE_WEBSITE_ID}`, `${FIXTURE_WEBSITE_ID}\r\n`])(
      'rejects a website ID with surrounding newlines (%j)',
      websiteId => {
        expect(() => shouldInjectUmamiTracker({command: 'build', mode: 'production', websiteId})).toThrow(
          /Invalid VITE_UMAMI_WEBSITE_ID.*UUID/,
        )
      },
    )

    it.each(['not-a-uuid', '123e4567-e89b-12d3-a456-42661417400g', '123e4567-e89b-12d3-a456-426614174000-extra'])(
      'rejects malformed or non-UUID website IDs (%j)',
      websiteId => {
        expect(() => shouldInjectUmamiTracker({command: 'build', mode: 'production', websiteId})).toThrow(
          /Invalid VITE_UMAMI_WEBSITE_ID.*UUID/,
        )
      },
    )

    it('does not inject for development builds without a website ID', () => {
      expect(shouldInjectUmamiTracker({command: 'serve', mode: 'development', websiteId: undefined})).toBe(false)
    })

    it('rejects malformed configuration during development setup', () => {
      expect(() => withWebsiteId('not-a-uuid', () => viteConfig({command: 'serve', mode: 'development'}))).toThrow(
        /Invalid VITE_UMAMI_WEBSITE_ID.*UUID/,
      )
    })
  })

  describe('buildUmamiTrackerTag', () => {
    it('emits exactly one script tag with the fixture website ID and required privacy attributes', () => {
      const tag = buildUmamiTrackerTag(FIXTURE_WEBSITE_ID)

      expect(tag.tag).toBe('script')
      expect(tag.injectTo).toBe('head')
      expect(tag.attrs).toStrictEqual({
        src: UMAMI_SCRIPT_URL,
        async: true,
        'data-website-id': FIXTURE_WEBSITE_ID,
        'data-do-not-track': 'true',
        'data-exclude-search': 'true',
        'data-exclude-hash': 'true',
        'data-auto-pageview': 'false',
      })
    })

    it('points at the self-hosted metrics host', () => {
      expect(UMAMI_SCRIPT_URL).toBe('https://metrics.fro.bot/script.js')
    })
  })

  describe('real Vite config build state', () => {
    it.each(umamiBuildStates)('$name shares one tracker activation decision', async state => {
      const config = withWebsiteId(state.websiteId, () => viteConfig({command: state.command, mode: state.mode}))
      const trackerPlugin = config.plugins?.find(isUmamiTrackerPlugin)

      expect(trackerPlugin).toBeDefined()
      if (!trackerPlugin) return

      const transformed = await runTrackerTransform(trackerPlugin)
      const injectedTags = Array.isArray(transformed) ? transformed : []

      expect(config.define?.__UMAMI_ENABLED__).toBe(JSON.stringify(state.enabled))
      expect(JSON.parse(String(config.define?.__UMAMI_ENABLED__))).toBe(state.enabled)
      expect(injectedTags).toHaveLength(state.enabled ? 1 : 0)
      expect(Boolean(injectedTags[0])).toBe(state.enabled)

      if (state.enabled) {
        expect(injectedTags[0]).toMatchObject({
          attrs: {'data-website-id': state.websiteId},
        })
      }

      if (state.websiteId !== undefined) {
        expect(Object.values(config.define ?? {})).not.toContain(state.websiteId)
      }
    })
  })
})

describe('Umami tracker built artifact', () => {
  const buildIndexHtml = async (websiteId: string | undefined): Promise<string> => {
    const outputDirectory = await mkdtemp(join(tmpdir(), 'umami-config-test-'))

    try {
      const config = withWebsiteId(websiteId, () => viteConfig({command: 'build', mode: 'production'}))
      await viteBuild({
        ...config,
        configFile: false,
        build: {
          ...config.build,
          emptyOutDir: true,
          outDir: outputDirectory,
        },
      })

      return await readFile(join(outputDirectory, 'index.html'), 'utf8')
    } finally {
      await rm(outputDirectory, {force: true, recursive: true})
    }
  }

  it('contains exactly one hardened Umami tag with the configured UUID', async () => {
    const indexHtml = await buildIndexHtml(FIXTURE_WEBSITE_ID)
    const umamiTags = indexHtml.match(/<script\b[^>]+metrics\.fro\.bot\/script\.js[^>]*><\/script>/g) ?? []

    expect(umamiTags).toHaveLength(1)
    expect(umamiTags[0]).toContain(`data-website-id="${FIXTURE_WEBSITE_ID}"`)
  }, 30_000)

  it('contains no Umami tag when the production build is unconfigured', async () => {
    const indexHtml = await buildIndexHtml(undefined)
    const umamiTags = indexHtml.match(/<script\b[^>]+metrics\.fro\.bot\/script\.js[^>]*><\/script>/g) ?? []

    expect(umamiTags).toHaveLength(0)
  }, 30_000)
})

interface DeployWorkflow {
  env?: Record<string, unknown>
  jobs: Record<
    string,
    {
      env?: Record<string, unknown>
      steps: {name?: string; env?: Record<string, unknown>}[]
    }
  >
}

describe('deploy workflow variable scope', () => {
  const loadWorkflow = (): DeployWorkflow => {
    const workflowPath = join(process.cwd(), '.github/workflows/deploy.yaml')
    return parseYaml(readFileSync(workflowPath, 'utf8')) as DeployWorkflow
  }

  it('does not expose UMAMI_WEBSITE_ID at workflow or job scope', () => {
    const workflow = loadWorkflow()
    const buildJob = workflow.jobs.build
    expect(buildJob).toBeDefined()
    expect(workflow.env?.UMAMI_WEBSITE_ID).toBeUndefined()
    expect(buildJob?.env?.UMAMI_WEBSITE_ID).toBeUndefined()
  })

  it('maps UMAMI_WEBSITE_ID to VITE_UMAMI_WEBSITE_ID only on the build step', () => {
    const workflow = loadWorkflow()
    const buildJob = workflow.jobs.build
    expect(buildJob).toBeDefined()
    const steps = buildJob?.steps ?? []
    const buildStep = steps.find(step => step.name === 'Build project')

    const expectedExpression = ['$', '{{ vars.UMAMI_WEBSITE_ID }}'].join('')
    expect(buildStep?.env?.VITE_UMAMI_WEBSITE_ID).toBe(expectedExpression)

    const stepsWithVar = steps.filter(step => step.env?.VITE_UMAMI_WEBSITE_ID !== undefined)
    expect(stepsWithVar).toHaveLength(1)
  })
})
