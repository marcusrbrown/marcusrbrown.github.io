import {describe, expect, it} from 'vitest'
import {
  evaluateReactRouterRscBoundary,
  runReactRouterRscBoundary,
  type BoundaryLimits,
  type TrackedFile,
} from '../../scripts/check-react-router-rsc-boundary'

const cleanManifest = () => ({
  name: 'mrbro.dev',
  dependencies: {
    react: '^19.0.0',
    'react-dom': '^19.0.0',
    'react-router-dom': '^7.15.0',
  },
  devDependencies: {
    typescript: '5.9.3',
  },
})

const file = (path: string, content: string): TrackedFile => ({path, content})
const interpolatedDynamicImport = [
  "const part = 'server'; import(`react-router-dom/",
  String.fromCharCode(36),
  '{part}`)',
].join('')

const evaluate = (files: readonly TrackedFile[], packageManifest: unknown = cleanManifest(), limits?: BoundaryLimits) =>
  evaluateReactRouterRscBoundary({files, packageManifest, limits})

const runTrackedManifests = (
  trackedFiles: Record<string, string>,
  paths: readonly string[] = ['package.json', ...Object.keys(trackedFiles)],
) => {
  const reads: string[] = []
  const result = runReactRouterRscBoundary({
    listTrackedFiles: () => paths,
    readFile: path => {
      reads.push(path)
      const content = trackedFiles[path]
      if (content === undefined) throw new Error(`missing fixture: ${path}`)
      return content
    },
    readPackageJson: () => {
      reads.push('package.json')
      return JSON.stringify(cleanManifest())
    },
  })
  return {reads, result}
}

const expectClean = (result: ReturnType<typeof evaluateReactRouterRscBoundary>) => {
  expect(result.ok).toBe(true)
  expect(result.diagnostics).toEqual([])
}

const expectFinding = (result: ReturnType<typeof evaluateReactRouterRscBoundary>, reason: string) => {
  expect(result.ok).toBe(false)
  expect(result.diagnostics.some(diagnostic => diagnostic.reason.includes(reason))).toBe(true)
}

describe('React Router RSC boundary evaluator', () => {
  it('allows the current client SPA and build-time StaticRouter prerender path', () => {
    expect.assertions(2)
    expectClean(
      evaluate([
        file(
          'src/App.tsx',
          'import {BrowserRouter, Route, Routes} from \'react-router-dom\'\nexport const App = () => <BrowserRouter><Routes><Route path="/" /></Routes></BrowserRouter>',
        ),
        file(
          'scripts/prerender-blog.ts',
          "import React from 'react'\nimport {Route, Routes, StaticRouter} from 'react-router-dom'\nexport const render = () => React.createElement(StaticRouter, {location: '/'}, React.createElement(Routes, null, React.createElement(Route, {path: '/'})))",
        ),
      ]),
    )
  })

  it.each([
    ['react-server-dom-webpack', 'dependencies'],
    ['@react-router/dev', 'devDependencies'],
    ['@react-router/node', 'optionalDependencies'],
    ['@react-router/serve', 'peerDependencies'],
    ['@react-router/cloudflare', 'dependencies'],
  ])('rejects prohibited %s manifest dependency from %s', (dependency, section) => {
    expect.assertions(2)
    const manifest = {
      ...cleanManifest(),
      [section]: {[dependency]: '7.18.0'},
    }

    expectFinding(evaluate([], manifest), dependency)
  })

  it.each(['react-router.config.ts', 'src/entry.server.tsx', 'src/routes/home.server.tsx'])(
    'rejects production server/framework filename %s',
    path => {
      expect.assertions(2)
      expectFinding(evaluate([file(path, 'export const route = true')]), 'server/framework filename')
    },
  )

  it.each([
    ["import {createRequestHandler} from '@react-router/node'", '@react-router/node'],
    ["export * from 'react-router-dom/server'", 'react-router-dom/server'],
    ["const load = () => import('react-server-dom-webpack/client')", 'react-server-dom-webpack/client'],
    ["const server = require('@react-router/serve')", '@react-router/serve'],
  ])('rejects prohibited AST package boundary: %s', (source, packageName) => {
    expect.assertions(2)
    expectFinding(evaluate([file('src/runtime.ts', source)]), packageName)
  })

  it.each([
    ["const target = 'react-router-dom/server'; import(target)", 'identifier dynamic import'],
    [interpolatedDynamicImport, 'interpolated dynamic import'],
    ["require('@react-router/' + 'node')", 'concatenated require'],
    ["const target = './safe-module'; require(target)", 'benign non-literal require'],
  ])('fails closed for %s', source => {
    expect.assertions(4)
    const result = evaluate([file('src/runtime.ts', source)])

    expectFinding(result, 'non-literal module loading')
    expect(result.diagnostics.map(diagnostic => diagnostic.path)).toEqual(['src/runtime.ts'])
    expect(JSON.stringify(result)).not.toContain(source)
  })

  it('evaluates literal dynamic module names normally while allowing a literal safe target', () => {
    expect.assertions(4)
    expectFinding(evaluate([file('src/runtime.ts', 'import(`react-router-dom/server`)')]), 'react-router-dom/server')
    expectClean(evaluate([file('src/runtime.ts', 'import(`./safe-module`)')]))
  })

  it('rejects a module-level use server directive', () => {
    expect.assertions(2)
    expectFinding(
      evaluate([file('src/server-action.ts', "'use server'\nexport const action = () => true")]),
      'use server',
    )
  })

  it('rejects the installed React Router 7.18 RSC identifier family but not unrelated unstable APIs', () => {
    expect.assertions(4)
    expectFinding(
      evaluate([
        file('src/rsc.tsx', "import {unstable_RSCStaticRouter} from 'react-router'\nexport {unstable_RSCStaticRouter}"),
      ]),
      'unstable_RSCStaticRouter',
    )
    expectClean(
      evaluate([file('src/client.ts', "import {unstable_HistoryRouter, unstable_usePrompt} from 'react-router'")]),
    )
  })

  it('does not trigger on comments or string prose that mentions prohibited terms', () => {
    expect.assertions(2)
    expectClean(
      evaluate([
        file(
          'src/copy.ts',
          "// import {unstable_RSCStaticRouter} from 'react-router'\nconst prose = 'use server and react-server-dom-webpack are not runtime code'",
        ),
      ]),
    )
  })

  it('fails closed for a missing package manifest', () => {
    expect.assertions(2)
    expectFinding(evaluateReactRouterRscBoundary({files: [], packageManifest: undefined}), 'package.json')
  })

  it('fails closed for malformed package manifest shapes', () => {
    expect.assertions(4)
    expectFinding(evaluate([], []), 'package.json')
    expectFinding(evaluate([], {...cleanManifest(), dependencies: 'not-an-object'}), 'package.json')
  })

  it('fails closed for unsafe tracked paths without echoing the unsafe path', () => {
    expect.assertions(4)
    const result = evaluate([file('../secrets.txt', 'const token = true')])

    expectFinding(result, 'unsafe tracked path')
    expect(result.diagnostics.map(diagnostic => diagnostic.path)).toEqual(['.'])
    expect(JSON.stringify(result)).not.toContain('secrets.txt')
  })

  it('fails closed when the tracked-file list cannot be obtained', () => {
    const result = runReactRouterRscBoundary({
      listTrackedFiles: () => {
        throw new Error('private list failure')
      },
      readFile: () => '',
      readPackageJson: () => JSON.stringify(cleanManifest()),
    })

    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]?.path).toBe('.')
    expect(JSON.stringify(result)).not.toContain('private list failure')
  })

  it('fails closed when a tracked source or package manifest cannot be read', () => {
    const sourceFailure = runReactRouterRscBoundary({
      listTrackedFiles: () => ['src/App.tsx'],
      readFile: () => {
        throw new Error('secret source read failure')
      },
      readPackageJson: () => JSON.stringify(cleanManifest()),
    })
    const packageFailure = runReactRouterRscBoundary({
      listTrackedFiles: () => [],
      readFile: () => '',
      readPackageJson: () => {
        throw new Error('secret package read failure')
      },
    })

    expect(sourceFailure.ok).toBe(false)
    expect(sourceFailure.diagnostics[0]?.path).toBe('src/App.tsx')
    expect(packageFailure.ok).toBe(false)
    expect(packageFailure.diagnostics[0]?.path).toBe('package.json')
    expect(JSON.stringify(sourceFailure)).not.toContain('secret source read failure')
    expect(JSON.stringify(packageFailure)).not.toContain('secret package read failure')
  })

  it('scans each tracked production package manifest once without duplicating the root manifest', () => {
    expect.assertions(3)
    const nestedManifest = JSON.stringify({...cleanManifest(), name: '@site/runtime'})
    const {reads, result} = runTrackedManifests({'packages/runtime/package.json': nestedManifest}, [
      'package.json',
      'package.json',
      'packages/runtime/package.json',
    ])

    expectClean(result)
    expect(reads).toEqual(['package.json', 'packages/runtime/package.json'])
  })

  it.each(['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'])(
    'rejects prohibited dependencies in nested production %s',
    section => {
      expect.assertions(3)
      const nestedManifest = JSON.stringify({
        ...cleanManifest(),
        name: '@site/runtime',
        [section]: {'@react-router/node': '7.18.0'},
      })
      const {result} = runTrackedManifests({'packages/runtime/package.json': nestedManifest})

      expectFinding(result, '@react-router/node')
      expect(result.diagnostics[0]?.path).toBe('packages/runtime/package.json')
    },
  )

  it('fails closed for a malformed nested production package manifest', () => {
    expect.assertions(3)
    const {result} = runTrackedManifests({'packages/runtime/package.json': '{"name":"@site/runtime","dependencies":'})

    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]?.path).toBe('packages/runtime/package.json')
    expect(JSON.stringify(result)).not.toContain('dependencies')
  })

  it('fails closed when a nested production package manifest cannot be read', () => {
    expect.assertions(2)
    const result = runReactRouterRscBoundary({
      listTrackedFiles: () => ['package.json', 'packages/runtime/package.json'],
      readFile: path => {
        if (path === 'packages/runtime/package.json') throw new Error('secret nested manifest read failure')
        return JSON.stringify(cleanManifest())
      },
      readPackageJson: () => JSON.stringify(cleanManifest()),
    })

    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]?.path).toBe('packages/runtime/package.json')
  })

  it('ignores package manifests in excluded non-production paths', () => {
    expect.assertions(3)
    const excluded = {
      '.opencode/package.json': JSON.stringify({...cleanManifest(), dependencies: {'@react-router/node': '7.18.0'}}),
      'tests/fixtures/package.json': JSON.stringify({
        ...cleanManifest(),
        dependencies: {'@react-router/node': '7.18.0'},
      }),
      'docs/package.json': JSON.stringify({...cleanManifest(), dependencies: {'@react-router/node': '7.18.0'}}),
    }
    const {reads, result} = runTrackedManifests(excluded)

    expectClean(result)
    expect(reads).toEqual(['package.json'])
  })

  it('fails closed for a source parse error', () => {
    expect.assertions(2)
    expectFinding(evaluate([file('src/broken.ts', 'export const broken =')]), 'parse error')
  })

  it('enforces tracked-file, per-file byte, and total byte bounds', () => {
    expect.assertions(6)
    const limits: BoundaryLimits = {maxTrackedFiles: 1, maxFileBytes: 10, maxTotalBytes: 15}

    expectFinding(
      evaluate([file('src/one.ts', '12345678901'), file('src/two.ts', '1')], cleanManifest(), limits),
      'tracked file count',
    )
    expectFinding(evaluate([file('src/one.ts', '12345678901')], cleanManifest(), limits), 'per-file byte')
    expectFinding(
      evaluate([file('src/one.ts', '1234567890'), file('src/two.ts', '123456')], cleanManifest(), {
        ...limits,
        maxTrackedFiles: 2,
      }),
      'total tracked source byte',
    )
  })

  it('sorts multiple findings deterministically and keeps diagnostics safe', () => {
    const result = evaluate([
      file('z/runtime.ts', "import x from '@react-router/node'\n'use server'"),
      file('a/entry.server.tsx', 'export const entry = true'),
    ])

    expect(result.ok).toBe(false)
    expect(result.diagnostics.map(diagnostic => diagnostic.path)).toEqual([
      'a/entry.server.tsx',
      'z/runtime.ts',
      'z/runtime.ts',
    ])
    expect(result.diagnostics.every(diagnostic => /^[\w.-]+(?:\/[\w.-]+)*$/.test(diagnostic.path))).toBe(true)
    expect(result.diagnostics.every(diagnostic => diagnostic.reason.length < 160)).toBe(true)
  })
})
