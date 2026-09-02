import {afterEach, describe, expect, it, vi} from 'vitest'
import {PerformanceRegressionDetector} from '../../scripts/performance-regression'

type PerformanceMetrics = Parameters<PerformanceRegressionDetector['generateReport']>[0]
type LighthouseMetrics = PerformanceMetrics['lighthouse']['desktop']
type BundleMetrics = NonNullable<PerformanceMetrics['bundle']>

class ProcessExit extends Error {
  readonly code: number

  constructor(code: number) {
    super(`Process exited with code ${code}`)
    this.code = code
  }
}

const metrics = (
  performanceScore: number,
  lighthouseOverrides: Partial<LighthouseMetrics> = {},
  bundle?: BundleMetrics,
): PerformanceMetrics => ({
  timestamp: '2026-08-30T00:00:00.000Z',
  lighthouse: {
    desktop: {
      performanceScore,
      lcp: 1000,
      fid: 10,
      cls: 0.01,
      fcp: 800,
      tti: 1200,
      tbt: 50,
      accessibilityScore: 100,
      bestPracticesScore: 100,
      seoScore: 100,
      ...lighthouseOverrides,
    },
  },
  ...(bundle ? {bundle} : {}),
  commit: 'test-commit',
})

const bundleMetrics = (totalSize: number): BundleMetrics => ({
  totalSize,
  jsSize: 500,
  cssSize: 200,
  fileCount: 3,
})

const captureOutput = (): string[] => {
  const output: string[] = []
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    output.push(args.map(String).join(' '))
  })
  vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
    output.push(args.map(String).join(' '))
  })
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    output.push(args.map(String).join(' '))
  })
  return output
}

const mockProcessExit = () =>
  vi.spyOn(process, 'exit').mockImplementation((code): never => {
    throw new ProcessExit(typeof code === 'number' ? code : 0)
  })

afterEach(() => {
  vi.restoreAllMocks()
})

describe('PerformanceRegressionDetector', () => {
  it('emits a visible warning and explicit skip when no baseline is available', async () => {
    const output = captureOutput()
    const detector = new PerformanceRegressionDetector()
    vi.spyOn(detector, 'loadCurrentMetrics').mockResolvedValue(metrics(98))
    vi.spyOn(detector, 'loadBaselineMetrics').mockReturnValue(null)
    vi.spyOn(detector, 'saveBaseline').mockImplementation(() => {})
    const exit = mockProcessExit()

    await expect(detector.detectRegressions()).rejects.toMatchObject({code: 0})

    expect(exit).toHaveBeenCalledWith(0)
    expect(output.join('\n')).toContain('::warning::No performance baseline available; no comparison was performed.')
    expect(output.join('\n')).toContain('⚠️ No performance baseline available; no comparison was performed.')
    expect(output.join('\n')).not.toContain('Comparing performance metrics')
    expect(output.join('\n')).toContain('⚠️ Performance regression detection skipped: baseline unavailable')
    expect(output.join('\n')).not.toContain('✅ Performance regression detection complete')
  })

  it('reports a real before, after, and delta comparison for a present baseline', async () => {
    const output = captureOutput()
    const detector = new PerformanceRegressionDetector()
    vi.spyOn(detector, 'loadCurrentMetrics').mockResolvedValue(metrics(98))
    vi.spyOn(detector, 'loadBaselineMetrics').mockReturnValue(metrics(99))
    vi.spyOn(detector, 'saveBaseline').mockImplementation(() => {})
    mockProcessExit()

    await expect(detector.detectRegressions()).rejects.toMatchObject({code: 0})

    expect(output.join('\n')).toContain('Comparing performance metrics')
    expect(output.join('\n')).toContain(
      '[performance] Performance Score (desktop): current 98% (baseline 99%; delta -1%)',
    )
    expect(output.join('\n')).not.toContain('observational; not gating')
  })

  it('reports a performance score regression as an observational warning', async () => {
    const output = captureOutput()
    const detector = new PerformanceRegressionDetector()
    vi.spyOn(detector, 'loadCurrentMetrics').mockResolvedValue(metrics(90))
    vi.spyOn(detector, 'loadBaselineMetrics').mockReturnValue(metrics(100))
    vi.spyOn(detector, 'saveBaseline').mockImplementation(() => {})
    const exit = mockProcessExit()

    await expect(detector.detectRegressions()).rejects.toMatchObject({code: 0})

    expect(exit).toHaveBeenCalledWith(0)
    expect(output.join('\n')).not.toContain('PERFORMANCE REGRESSIONS DETECTED')
    expect(output.join('\n')).toContain('Performance Score (desktop): 90% → was 100% (+10% change)')
    expect(output.join('\n')).toContain('::warning::Performance Score (desktop)')
  })

  it('reports an above-threshold LCP change as an observational warning', async () => {
    const output = captureOutput()
    const detector = new PerformanceRegressionDetector()
    vi.spyOn(detector, 'loadCurrentMetrics').mockResolvedValue(metrics(98, {lcp: 1800}))
    vi.spyOn(detector, 'loadBaselineMetrics').mockReturnValue(metrics(98, {lcp: 1000}))
    vi.spyOn(detector, 'saveBaseline').mockImplementation(() => {})
    const exit = mockProcessExit()

    await expect(detector.detectRegressions()).rejects.toMatchObject({code: 0})

    expect(exit).toHaveBeenCalledWith(0)
    expect(output.join('\n')).toContain('[performance] LCP (desktop): current 1800ms (baseline 1000ms; delta +80%)')
    expect(output.join('\n')).toContain('PERFORMANCE WARNINGS')
    expect(output.join('\n')).toContain('LCP (desktop): 1800ms → was 1000ms (+80% change)')
    expect(output.join('\n')).toContain('::warning::LCP (desktop)')
    expect(output.join('\n')).not.toContain('PERFORMANCE REGRESSIONS DETECTED')
  })

  it('exits nonzero when a bundle-size regression exceeds its gate', async () => {
    const output = captureOutput()
    const detector = new PerformanceRegressionDetector()
    vi.spyOn(detector, 'loadCurrentMetrics').mockResolvedValue(metrics(98, {}, bundleMetrics(1100)))
    vi.spyOn(detector, 'loadBaselineMetrics').mockReturnValue(metrics(98, {}, bundleMetrics(1000)))
    vi.spyOn(detector, 'saveBaseline').mockImplementation(() => {})
    const exit = mockProcessExit()

    await expect(detector.detectRegressions()).rejects.toMatchObject({code: 1})

    expect(exit).toHaveBeenCalledWith(1)
    expect(output.join('\n')).toContain('PERFORMANCE REGRESSIONS DETECTED')
    expect(output.join('\n')).toContain('Total Bundle Size: 1.1 KB% → was 1000 B% (+10% change)')
  })

  it('exits nonzero when saving the baseline fails', async () => {
    const output = captureOutput()
    const detector = new PerformanceRegressionDetector()
    vi.spyOn(detector, 'loadCurrentMetrics').mockResolvedValue(metrics(98))
    vi.spyOn(detector, 'loadBaselineMetrics').mockReturnValue(null)
    vi.spyOn(detector, 'saveBaseline').mockImplementation(() => {
      throw new Error('permission denied')
    })
    const exit = mockProcessExit()

    await expect(detector.detectRegressions()).rejects.toMatchObject({code: 1})

    expect(exit).toHaveBeenCalledWith(1)
    expect(output.join('\n')).toContain('Baseline persistence failed: permission denied')
  })
})
