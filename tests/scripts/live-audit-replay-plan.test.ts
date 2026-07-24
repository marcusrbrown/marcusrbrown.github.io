import type {AuditVariant} from '../../scripts/live-audit/contract'
import type {IssueLedger} from '../../scripts/live-audit/issue-ledger'
import {describe, expect, it} from 'vitest'
import {AUDIT_ORIGIN, buildCoreMatrix, chooseRotatingPreset} from '../../scripts/live-audit/evidence'
import {findingFingerprint, variantKey} from '../../scripts/live-audit/identity'
import {
  buildManualReplayPlan,
  buildScheduledReplayPlan,
  MAX_REPLAY_PLAN_BYTES,
  parseReplayPlan,
  parseReplayPlanJson,
  REPLAY_PLAN_CRONS,
  REPLAY_PLAN_VERSION,
  serializeReplayPlan,
} from '../../scripts/live-audit/replay-plan'

const generatedAt = '2026-07-24T03:30:00.000Z'
const variant: AuditVariant = {viewport: 'mobile', theme: {kind: 'preset', presetId: 'dracula'}, state: 'core'}

const makeLedger = (route: '/projects' | '/about' = '/projects', state = 'core'): IssueLedger => {
  const currentVariant = {...variant, state}
  const currentVariantKey = variantKey(currentVariant)
  const fingerprint = findingFingerprint({route, semanticTarget: 'card', failureSignature: 'broken image'})
  return {
    version: 1,
    fingerprint,
    route,
    semanticTarget: 'card',
    findingClass: 'broken-image',
    assertion: {version: 1, kind: 'image-load', expected: 'loaded'},
    actions: [],
    responsive: 'not-applicable',
    failureSignature: 'broken image',
    variants: [
      {key: currentVariantKey, viewport: currentVariant.viewport, theme: currentVariant.theme, state, cleanCount: 0},
    ],
    replay: [
      {
        variantKey: currentVariantKey,
        target: {kind: 'test-id', value: 'card'},
        assertion: {version: 1, kind: 'image-load', expected: 'loaded'},
        actions: [],
        reproduction: ['Open projects'],
      },
    ],
    operations: [{key: 'issue-op', checkpoint: 'issue', completedAt: generatedAt}],
    transition: {kind: 'open', source: 'reporter'},
  }
}

describe('versioned live-audit replay plans', () => {
  it('preserves either approved originating schedule', () => {
    const afternoon = buildScheduledReplayPlan({
      runId: 'scheduled-afternoon',
      generatedAt,
      cron: REPLAY_PLAN_CRONS[1],
      exploration: {steps: 0, durationMs: 0},
      activeLedgers: [{issueNumber: 204, ledger: makeLedger()}],
    })
    expect(afternoon.cron).toBe('30 15 * * *')
    const parsed = parseReplayPlan(afternoon)
    expect(parsed.runKind).toBe('scheduled')
    if (parsed.runKind === 'scheduled') expect(parsed.cron).toBe('30 15 * * *')
    expect(() => parseReplayPlan({...afternoon, cron: '0 0 * * *'})).toThrow(/schedule|cron/)
  })
  it('builds a canonical scheduled plan with the exact 24-state matrix', () => {
    const plan = buildScheduledReplayPlan({
      runId: 'scheduled-1',
      generatedAt,
      exploration: {steps: 2, durationMs: 100},
      activeLedgers: [{issueNumber: 42, ledger: makeLedger()}],
    })
    expect(plan.version).toBe(REPLAY_PLAN_VERSION)
    expect(plan.origin).toBe(AUDIT_ORIGIN)
    expect(plan.cron).toBe('30 3 * * *')
    expect(plan.coreMatrix).toEqual(buildCoreMatrix(plan.rotatingPresetId))
    expect(plan.coreMatrix).toHaveLength(24)
    expect(plan.issueNumbers).toEqual([42])
  })

  it('allows an empty scheduled active request set', () => {
    expect(
      buildScheduledReplayPlan({
        runId: 'scheduled-empty',
        generatedAt,
        exploration: {steps: 0, durationMs: 0},
        activeLedgers: [],
      }).activeRequests,
    ).toEqual([])
  })

  it('builds a manual plan only when every active request targets one issue', () => {
    const plan = buildManualReplayPlan({
      runId: 'manual-1',
      generatedAt,
      issueNumber: 42,
      exploration: {steps: 1, durationMs: 10},
      activeLedgers: [{issueNumber: 42, ledger: makeLedger()}],
    })
    expect(plan.coreMatrix).toEqual([])
    expect(plan.issueNumber).toBe(42)
    expect(() =>
      buildManualReplayPlan({
        runId: 'manual-empty',
        generatedAt,
        issueNumber: 42,
        exploration: {steps: 0, durationMs: 0},
        activeLedgers: [],
      }),
    ).toThrow(/active/)
    expect(() =>
      buildManualReplayPlan({
        runId: 'manual-cross-issue',
        generatedAt,
        issueNumber: 42,
        exploration: {steps: 0, durationMs: 0},
        activeLedgers: [
          {issueNumber: 42, ledger: makeLedger()},
          {issueNumber: 43, ledger: makeLedger('/about')},
        ],
      }),
    ).toThrow(/issue/)
  })

  it('rejects duplicate, tampered, malformed, and unknown request data', () => {
    const plan = buildScheduledReplayPlan({
      runId: 'scheduled-invalid',
      generatedAt,
      exploration: {steps: 0, durationMs: 0},
      activeLedgers: [{issueNumber: 42, ledger: makeLedger()}],
    })
    expect(() => parseReplayPlan({...plan, activeRequests: [...plan.activeRequests, plan.activeRequests[0]]})).toThrow(
      /duplicate/,
    )
    expect(() =>
      parseReplayPlan({
        ...plan,
        activeRequests: [{...plan.activeRequests[0], variantKey: 'tampered'}, ...plan.activeRequests.slice(1)],
      }),
    ).toThrow(/variant|identity/)
    expect(() =>
      parseReplayPlan({
        ...plan,
        activeRequests: [
          {...plan.activeRequests[0], assertion: {version: 1, kind: 'text', operator: 'equals', value: 'prose'}},
          ...plan.activeRequests.slice(1),
        ],
      }),
    ).toThrow(/assertion|class/)
    expect(() => parseReplayPlan({...plan, unexpected: true})).toThrow(/plan|unknown/)
  })

  it('rejects schedule, matrix, preset, and origin mismatches', () => {
    const plan = buildScheduledReplayPlan({
      runId: 'scheduled-mismatch',
      generatedAt,
      exploration: {steps: 0, durationMs: 0},
      activeLedgers: [{issueNumber: 42, ledger: makeLedger()}],
    })
    expect(() => parseReplayPlan({...plan, cron: '* * * * *'})).toThrow(/cron|schedule/)
    expect(() => parseReplayPlan({...plan, coreMatrix: plan.coreMatrix.slice(1)})).toThrow(/matrix/)
    expect(() =>
      parseReplayPlan({...plan, rotatingPresetId: chooseRotatingPreset(new Date('2026-07-25T03:30:00.000Z'))}),
    ).toThrow(/preset/)
    expect(() => parseReplayPlan({...plan, origin: 'https://evil.example'})).toThrow(/origin|common metadata/)
  })

  it('serializes with stable request ordering and enforces the UTF-8 byte bound', () => {
    const plan = buildScheduledReplayPlan({
      runId: 'scheduled-order',
      generatedAt,
      exploration: {steps: 0, durationMs: 0},
      activeLedgers: [
        {issueNumber: 42, ledger: makeLedger('/about')},
        {issueNumber: 41, ledger: makeLedger()},
      ],
    })
    const serialized = serializeReplayPlan(plan)
    expect(parseReplayPlanJson(serialized)).toEqual(parseReplayPlan(JSON.parse(serialized)))
    expect(serializeReplayPlan(plan)).toBe(serialized)
    expect(() => parseReplayPlanJson(' '.repeat(MAX_REPLAY_PLAN_BYTES + 1))).toThrow(/byte|size/)
  })
})
