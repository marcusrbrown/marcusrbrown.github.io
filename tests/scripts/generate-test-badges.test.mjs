import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, describe, expect, it} from 'vitest'
import {
  generateAccessibilityBadges,
  generateE2EBadges,
  generatePerformanceBadges,
} from '../../scripts/generate-test-badges.mjs'

const temporaryDirectories = []

const createTemporaryDirectory = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mrbro-badges-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, {recursive: true, force: true})))
})

describe('generate-test-badges', () => {
  it('reports missing artifacts instead of passing', async () => {
    const directory = await createTemporaryDirectory()

    const e2e = await generateE2EBadges(directory)
    const accessibility = await generateAccessibilityBadges(directory)
    const performance = await generatePerformanceBadges(directory)

    expect(e2e.e2eTests).toContain('not%20run')
    expect(e2e.visualTests).toContain('not%20run')
    expect(accessibility.accessibility).toContain('not%20tested')
    expect(performance.performance).toContain('not%20run')
    expect(performance.bundleSize).toContain('unknown')
  })

  it('finds reports in the CI artifact layout after merged downloads', async () => {
    const directory = await createTemporaryDirectory()
    await mkdir(join(directory, 'test-artifacts/e2e/test-results'), {recursive: true})
    await mkdir(join(directory, 'test-artifacts/visual/test-results'), {recursive: true})
    await writeFile(
      join(directory, 'test-artifacts/e2e/test-results/results.json'),
      JSON.stringify({
        suites: [{specs: [{tests: [{projectName: 'chromium-desktop', results: [{status: 'passed'}]}]}]}],
      }),
    )
    await writeFile(
      join(directory, 'test-artifacts/visual/test-results/results.json'),
      JSON.stringify({
        suites: [{specs: [{tests: [{projectName: 'visual-tests', results: [{status: 'passed'}]}]}]}],
      }),
    )

    const badges = await generateE2EBadges(directory)

    expect(badges.e2eTests).toContain('passing')
    expect(badges.visualTests).toContain('passing')
  })

  it('keeps visual and accessibility reports separate in the workflow layout', async () => {
    const directory = await createTemporaryDirectory()
    const workflow = await readFile(join(process.cwd(), '.github/workflows/e2e-tests.yaml'), 'utf8')
    await mkdir(join(directory, 'test-artifacts/e2e/test-results'), {recursive: true})
    await mkdir(join(directory, 'test-artifacts/visual/test-results'), {recursive: true})
    await mkdir(join(directory, 'test-artifacts/accessibility/test-results'), {recursive: true})

    await writeFile(
      join(directory, 'test-artifacts/e2e/test-results/results.json'),
      JSON.stringify({
        suites: [{specs: [{tests: [{projectName: 'chromium-desktop', results: [{status: 'passed'}]}]}]}],
      }),
    )
    await writeFile(
      join(directory, 'test-artifacts/visual/test-results/results.json'),
      JSON.stringify({suites: [{specs: [{tests: [{projectName: 'visual-tests', results: [{status: 'failed'}]}]}]}]}),
    )
    await writeFile(
      join(directory, 'test-artifacts/accessibility/test-results/results.json'),
      JSON.stringify({
        suites: [{specs: [{tests: [{projectName: 'accessibility-tests', results: [{status: 'passed'}]}]}]}],
      }),
    )

    expect(workflow).toContain('name: visual-test-results')
    expect(workflow).toContain('path: test-artifacts/visual/')
    expect(workflow).toContain('name: accessibility-test-results')
    expect(workflow).toContain('path: test-artifacts/accessibility/')

    const badges = await generateE2EBadges(directory)

    expect(badges.e2eTests).toContain('passing')
    expect(badges.visualTests).toContain('failing')
  })

  it('attributes mixed-project outcomes and counts to each suite independently', async () => {
    const directory = await createTemporaryDirectory()
    await mkdir(join(directory, 'test-results'))
    await writeFile(
      join(directory, 'test-results/results.json'),
      JSON.stringify({
        suites: [
          {
            specs: [
              {
                tests: [
                  {projectName: 'chromium-desktop', results: [{status: 'passed'}]},
                  {projectName: 'chromium-desktop', results: [{status: 'passed'}]},
                  {projectName: 'visual-tests', results: [{status: 'failed'}]},
                  {projectName: 'visual-tests', results: [{status: 'passed'}]},
                ],
              },
            ],
          },
        ],
      }),
    )

    const badges = await generateE2EBadges(directory)

    expect(badges.e2eTests).toContain('passing')
    expect(badges.e2eTests).toContain('2%2F2')
    expect(badges.visualTests).toContain('failing')
    expect(badges.visualTests).toContain('1%2F2')
  })

  it('derives performance and bundle badges from report files', async () => {
    const directory = await createTemporaryDirectory()
    await mkdir(join(directory, '.lighthouseci'))
    await writeFile(
      join(directory, '.lighthouseci/lhr-report.json'),
      JSON.stringify({categories: {performance: {score: 0.93}}}),
    )
    await writeFile(join(directory, 'build-history.json'), JSON.stringify([{totalSize: 123 * 1024}]))

    const badges = await generatePerformanceBadges(directory)

    expect(badges.performance).toContain('93%2F100')
    expect(badges.bundleSize).toContain('123KB')
  })
})
