import {afterEach, describe, expect, it, vi} from 'vitest'
import {PerformanceRegressionDetector} from '../../scripts/performance-regression'

type PerformanceMetrics = Parameters<PerformanceRegressionDetector['generateReport']>[0]

class ProcessExit extends Error {
  readonly code: number

  constructor(code: number) {
    super(`Process exited with code ${code}`)
    this.code = code
  }
}

const metrics = (performanceScore: number): PerformanceMetrics => ({
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
    },
  },
  commit: 'test-commit',
})

const captureOutput = (): string[] => {
  const output: string[] = []
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    output.push(args.map(String).join(' '))
  })
  vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
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
      '[performance] Performance Score (desktop): current 98% (baseline 99%; delta -1%; observational; not gating)',
    )
  })

  it('exits nonzero when a genuine regression is detected', async () => {
    const output = captureOutput()
    const detector = new PerformanceRegressionDetector()
    vi.spyOn(detector, 'loadCurrentMetrics').mockResolvedValue(metrics(90))
    vi.spyOn(detector, 'loadBaselineMetrics').mockReturnValue(metrics(100))
    vi.spyOn(detector, 'saveBaseline').mockImplementation(() => {})
    const exit = mockProcessExit()

    await expect(detector.detectRegressions()).rejects.toMatchObject({code: 1})

    expect(exit).toHaveBeenCalledWith(1)
    expect(output.join('\n')).toContain('PERFORMANCE REGRESSIONS DETECTED')
  })
})
