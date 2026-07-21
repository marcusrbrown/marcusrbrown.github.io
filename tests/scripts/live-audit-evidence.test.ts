import type {IssueLedger} from '../../scripts/live-audit/issue-ledger'
import {Buffer} from 'node:buffer'

import {describe, expect, it} from 'vitest'
import {parseAuditManifest} from '../../scripts/live-audit/contract'
import {
  AUDIT_ORIGIN,
  buildActiveReplayRequests,
  buildCoreMatrix,
  chooseRotatingPreset,
  finalizeActiveVariant,
  finalizeCandidateBundle,
  navigateAuditRoute,
  parseCandidateBundle,
  reconstructAuditUrl,
  responsiveCounterpartDecision,
  validatePng,
  type ActiveVariantReplayRequest,
  type CandidateBundle,
} from '../../scripts/live-audit/evidence'
import {findingFingerprint, variantKey} from '../../scripts/live-audit/identity'

describe('live-audit evidence finalization', () => {
  it('builds the complete deterministic core matrix and rotates presets by slot', () => {
    expect(buildCoreMatrix('dracula')).toHaveLength(24)
    expect(
      new Set(
        buildCoreMatrix('dracula').map(
          state =>
            `${state.route}:${state.viewport}:${state.theme.kind}:${state.theme.kind === 'mode' ? state.theme.mode : state.theme.presetId}`,
        ),
      ).size,
    ).toBe(24)
    const presets = new Set(
      Array.from({length: 12}, (_, slot) =>
        chooseRotatingPreset(new Date(Date.UTC(2026, 6, 20 + Math.floor(slot / 2), slot % 2 === 0 ? 3 : 15, 30))),
      ),
    )
    expect(presets.size).toBe(12)
    expect(() => chooseRotatingPreset(new Date('invalid'))).toThrow()
    expect(() => chooseRotatingPreset(new Date('2026-07-20T03:29:00Z'))).toThrow()
  })

  it('parses a bounded candidate bundle separately from the report manifest', () => {
    const bundle: CandidateBundle = {
      version: 1,
      runId: 'run-1',
      runKind: 'scheduled',
      rotatingPresetId: 'dracula',
      generatedAt: '2026-07-20T03:30:00.000Z',
      candidates: [
        {
          route: '/projects',
          findingClass: 'layout',
          responsive: 'not-applicable',
          semanticTarget: 'target',
          target: {kind: 'test-id', value: 'target'},
          failureSignature: 'overflow',
          description: 'Overflow',
          reproduction: ['Open projects'],
          variant: {viewport: 'mobile', theme: {kind: 'mode', mode: 'dark'}, state: 'core'},
          observation: {status: 'failure', signature: 'overflow', observedAt: '2026-07-20T03:30:00.000Z'},
        },
      ],
      diagnostics: [],
      exploration: {steps: 0, durationMs: 0},
    }
    expect(parseCandidateBundle(bundle)).toEqual(bundle)
    expect(() => parseCandidateBundle({...bundle, validations: []})).toThrow()
    expect(() => parseCandidateBundle({...bundle, status: 'clean'})).toThrow()
    expect(() => parseCandidateBundle({...bundle, unexpected: true})).toThrow()
    expect(() => parseCandidateBundle({...bundle, exploration: {steps: 21, durationMs: 0}})).toThrow()
    expect(() => parseCandidateBundle({...bundle, candidates: Array.from({length: 101}, () => ({}))})).toThrow()
    expect(() => reconstructAuditUrl('https://evil.example/')).toThrow()
    expect(reconstructAuditUrl('/about').origin).toBe(AUDIT_ORIGIN)
  })

  it('finalizes candidates sequentially and derives operations from results', async () => {
    const order: string[] = []
    const candidate = {
      route: '/projects' as const,
      findingClass: 'layout' as const,
      responsive: 'uncertain' as const,
      semanticTarget: 'target',
      target: {kind: 'test-id' as const, value: 'target'},
      failureSignature: 'overflow',
      description: 'Overflow',
      reproduction: ['Open projects'],
      variant: {viewport: 'mobile' as const, theme: {kind: 'mode' as const, mode: 'dark' as const}, state: 'core'},
      observation: {status: 'failure' as const, signature: 'overflow', observedAt: '2026-07-20T03:30:00.000Z'},
    }
    const bundle: CandidateBundle = {
      version: 1,
      runId: 'run-1',
      runKind: 'scheduled',
      rotatingPresetId: 'dracula',
      generatedAt: '2026-07-20T03:30:00.000Z',
      candidates: [candidate, {...candidate, semanticTarget: 'second', target: {kind: 'test-id', value: 'second'}}],
      diagnostics: [],
      exploration: {steps: 0, durationMs: 0},
    }
    const result = await finalizeCandidateBundle(bundle, {
      replay: async value => {
        order.push(value.semanticTarget)
        return {status: 'failure', signature: 'overflow', observedAt: '2026-07-20T03:30:01.000Z'}
      },
      capture: async value => ({
        context: {role: 'context', path: `${value.semanticTarget}-context.png`, alt: 'x', caption: 'x'},
        crop: {role: 'crop', path: `${value.semanticTarget}-crop.png`, alt: 'x', caption: 'x'},
      }),
      counterpartReplay: async () => ({status: 'clean', signature: '', observedAt: '2026-07-20T03:30:02.000Z'}),
      counterpartCapture: async () => ({
        context: {role: 'context', path: 'counter-context.png', alt: 'x', caption: 'x'},
        crop: {role: 'crop', path: 'counter-crop.png', alt: 'x', caption: 'x'},
      }),
    })
    expect(order).toEqual(['target', 'second'])
    expect(result.hasOperations).toBe(true)
    expect(result.manifest.findings).toHaveLength(2)
  })

  it('builds infrastructure validation from an attempted active replay', async () => {
    const ledger: IssueLedger = {
      version: 1,
      fingerprint: findingFingerprint({route: '/projects', semanticTarget: 'target', failureSignature: 'overflow'}),
      route: '/projects',
      semanticTarget: 'target',
      findingClass: 'layout',
      responsive: 'not-applicable',
      failureSignature: 'overflow',
      variants: [
        {
          key: variantKey({viewport: 'mobile', theme: {kind: 'mode', mode: 'dark'}, state: 'core'}),
          viewport: 'mobile',
          theme: {kind: 'mode', mode: 'dark'},
          state: 'core',
          cleanCount: 0,
        },
      ],
      replay: [
        {
          variantKey: variantKey({viewport: 'mobile', theme: {kind: 'mode', mode: 'dark'}, state: 'core'}),
          target: {kind: 'test-id', value: 'target'},
          reproduction: ['Open projects'],
        },
      ],
      operations: [],
      transition: {kind: 'open', source: 'reporter'},
    }
    const requests = buildActiveReplayRequests(204, ledger)
    expect(requests).toHaveLength(1)
    const request = requests[0] as ActiveVariantReplayRequest
    const result = await finalizeActiveVariant(
      request,
      async () => ({status: 'infrastructure-error', signature: 'timeout', observedAt: '2026-07-20T03:30:01.000Z'}),
      async () => {
        throw new Error('not called')
      },
    )
    expect(result.validation?.status).toBe('infrastructure-error')
    expect(result.finding).toBeUndefined()
  })

  it('performs one clean active replay and exactly two matching recurrent replays', async () => {
    const request: ActiveVariantReplayRequest = {
      issueNumber: 204,
      fingerprint: findingFingerprint({route: '/projects', semanticTarget: 'target', failureSignature: 'overflow'}),
      variantKey: variantKey({viewport: 'mobile', theme: {kind: 'mode', mode: 'dark'}, state: 'core'}),
      route: '/projects',
      semanticTarget: 'target',
      findingClass: 'layout',
      failureSignature: 'overflow',
      responsive: 'required',
      variant: {viewport: 'mobile', theme: {kind: 'mode', mode: 'dark'}, state: 'core'},
      target: {kind: 'test-id', value: 'target'},
      reproduction: ['Open projects'],
    }
    let calls = 0
    const capture = async () => ({
      context: {role: 'context' as const, path: 'context.png', alt: 'context', caption: 'context'},
      crop: {role: 'crop' as const, path: 'crop.png', alt: 'crop', caption: 'crop'},
    })
    const recurrent = await finalizeActiveVariant(
      request,
      async () => {
        calls += 1
        return {status: 'failure', signature: 'overflow', observedAt: `2026-07-20T03:30:0${calls}.000Z`}
      },
      capture,
      async () => ({status: 'clean', signature: '', observedAt: '2026-07-20T03:30:03.000Z'}),
      capture,
    )
    expect(calls).toBe(2)
    expect(recurrent.finding).toBeDefined()
    if (!recurrent.finding || recurrent.finding.responsive === 'not-applicable')
      throw new Error('recurrent finding missing counterpart')
    const recurrentFinding = recurrent.finding
    expect(recurrentFinding.counterpart.result.status).toBe('clean')
    expect(recurrentFinding.observations.map(observation => observation.observedAt)).toEqual([
      '2026-07-20T03:30:01.000Z',
      '2026-07-20T03:30:02.000Z',
    ])
    expect(
      parseAuditManifest({
        version: 1,
        runId: 'recurrent',
        generatedAt: '2026-07-20T03:30:00.000Z',
        runKind: 'manual',
        issueNumber: 204,
        findings: [recurrentFinding],
        validations: [],
      }).findings,
    ).toHaveLength(1)
    let cleanCounterpartCalls = 0
    const clean = await finalizeActiveVariant(
      {...request, responsive: 'not-applicable'},
      async () => ({status: 'clean', signature: '', observedAt: '2026-07-20T03:31:00.000Z'}),
      capture,
      async () => {
        cleanCounterpartCalls += 1
        return {status: 'clean', signature: '', observedAt: '2026-07-20T03:31:01.000Z'}
      },
      async () => {
        cleanCounterpartCalls += 1
        return capture()
      },
    )
    expect(clean.validation?.status).toBe('clean')
    expect(cleanCounterpartCalls).toBe(0)
    expect(calls).toBe(2)
    let disagreementCalls = 0
    const firstClean = await finalizeActiveVariant(
      {...request, responsive: 'not-applicable'},
      async () => {
        disagreementCalls += 1
        return disagreementCalls === 1
          ? {status: 'failure', signature: 'overflow', observedAt: '2026-07-20T03:32:00.000Z'}
          : {status: 'clean', signature: '', observedAt: '2026-07-20T03:32:01.000Z'}
      },
      capture,
    )
    expect(firstClean.finding).toBeUndefined()
    expect(firstClean.diagnostic).toMatch(/confirm|disagree/)
    let mismatchCalls = 0
    const mismatch = await finalizeActiveVariant(
      {...request, responsive: 'not-applicable'},
      async () => {
        mismatchCalls += 1
        return {
          status: 'failure',
          signature: mismatchCalls === 1 ? 'different' : 'overflow',
          observedAt: `2026-07-20T03:33:0${mismatchCalls}.000Z`,
        }
      },
      capture,
    )
    expect(mismatch.finding).toBeUndefined()
    expect(mismatch.diagnostic).toMatch(/disagree/)
    const counterpartFailure = await finalizeActiveVariant(
      request,
      async () => ({status: 'failure', signature: 'overflow', observedAt: '2026-07-20T03:34:00.000Z'}),
      capture,
      async () => {
        throw new Error('counterpart unavailable')
      },
      capture,
    )
    expect(counterpartFailure.finding).toBeUndefined()
    expect(counterpartFailure.diagnostic).toMatch(/counterpart/)
    const counterpartCaptureFailure = await finalizeActiveVariant(
      request,
      async () => ({status: 'failure', signature: 'overflow', observedAt: '2026-07-20T03:35:00.000Z'}),
      capture,
      async () => ({status: 'clean', signature: '', observedAt: '2026-07-20T03:35:01.000Z'}),
      async () => {
        throw new Error('counterpart capture unavailable')
      },
    )
    expect(counterpartCaptureFailure.finding).toBeUndefined()
    expect(counterpartCaptureFailure.diagnostic).toMatch(/counterpart/)
  })

  it('derives active replay requests only from the ledger and preserves the variant key', () => {
    const ledger: IssueLedger = {
      version: 1,
      fingerprint: findingFingerprint({route: '/projects', semanticTarget: 'target', failureSignature: 'overflow'}),
      route: '/projects',
      semanticTarget: 'target',
      findingClass: 'layout',
      responsive: 'not-applicable',
      failureSignature: 'overflow',
      variants: [
        {
          key: variantKey({viewport: 'mobile', theme: {kind: 'mode', mode: 'dark'}, state: 'core'}),
          viewport: 'mobile',
          theme: {kind: 'mode', mode: 'dark'},
          state: 'core',
          cleanCount: 0,
        },
      ],
      replay: [
        {
          variantKey: variantKey({viewport: 'mobile', theme: {kind: 'mode', mode: 'dark'}, state: 'core'}),
          target: {kind: 'test-id', value: 'target'},
          reproduction: ['Open projects'],
        },
      ],
      operations: [],
      transition: {kind: 'open', source: 'reporter'},
    }
    expect(buildActiveReplayRequests(204, ledger)[0]).toMatchObject({
      issueNumber: 204,
      fingerprint: ledger.fingerprint,
      responsive: 'not-applicable',
      reproduction: ['Open projects'],
    })
  })

  it('rejects an issue-mismatched manual active request before callbacks run', async () => {
    const request: ActiveVariantReplayRequest = {
      issueNumber: 205,
      fingerprint: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      variantKey: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      route: '/projects',
      semanticTarget: 'target',
      findingClass: 'layout',
      failureSignature: 'overflow',
      responsive: 'not-applicable',
      variant: {viewport: 'mobile', theme: {kind: 'mode', mode: 'dark'}, state: 'core'},
      target: {kind: 'test-id', value: 'target'},
      reproduction: ['Open projects'],
    }
    const bundle: CandidateBundle = {
      version: 1,
      runId: 'manual',
      runKind: 'manual',
      issueNumber: 204,
      generatedAt: '2026-07-20T03:30:00.000Z',
      candidates: [],
      diagnostics: [],
      exploration: {steps: 0, durationMs: 0},
    }
    let callbacks = 0
    await expect(
      finalizeCandidateBundle(bundle, {
        replay: async () => {
          callbacks += 1
          return {status: 'clean', signature: '', observedAt: '2026-07-20T03:30:00.000Z'}
        },
        capture: async () => {
          callbacks += 1
          throw new Error('unexpected capture')
        },
        activeRequests: [request],
        activeReplay: async () => {
          callbacks += 1
          return {status: 'clean', signature: '', observedAt: '2026-07-20T03:30:00.000Z'}
        },
        activeCapture: async () => {
          callbacks += 1
          throw new Error('unexpected active capture')
        },
      }),
    ).rejects.toThrow(/issue/)
    expect(callbacks).toBe(0)
  })

  it('fails closed when derived diagnostics exceed the bounded limit', async () => {
    const bundle: CandidateBundle = {
      version: 1,
      runId: 'diagnostics',
      runKind: 'scheduled',
      rotatingPresetId: 'dracula',
      generatedAt: '2026-07-20T03:30:00.000Z',
      candidates: [
        {
          route: '/projects',
          findingClass: 'layout',
          responsive: 'not-applicable',
          semanticTarget: 'target',
          target: {kind: 'test-id', value: 'target'},
          failureSignature: 'overflow',
          description: 'Overflow',
          reproduction: ['Open projects'],
          variant: {viewport: 'mobile', theme: {kind: 'mode', mode: 'dark'}, state: 'core'},
          observation: {status: 'failure', signature: 'overflow', observedAt: '2026-07-20T03:30:00.000Z'},
        },
      ],
      diagnostics: Array.from({length: 100}, (_, index) => `diagnostic-${index}`),
      exploration: {steps: 0, durationMs: 0},
    }
    await expect(
      finalizeCandidateBundle(bundle, {
        replay: async () => ({status: 'clean', signature: '', observedAt: '2026-07-20T03:30:00.000Z'}),
        capture: async () => {
          throw new Error('not called')
        },
      }),
    ).rejects.toThrow(/bounded/)
  })

  it('supports responsive counterpart decisions without invoking them for not-applicable', () => {
    expect(responsiveCounterpartDecision('required')).toBe('capture-counterpart')
    expect(responsiveCounterpartDecision('uncertain')).toBe('capture-counterpart')
    expect(responsiveCounterpartDecision('not-applicable')).toBe('not-required')
  })

  it('supports region capture descriptors without falling back to body', () => {
    expect(reconstructAuditUrl('/')).toEqual(new URL(AUDIT_ORIGIN))
    expect(responsiveCounterpartDecision('required')).toBe('capture-counterpart')
    expect(responsiveCounterpartDecision('uncertain')).toBe('capture-counterpart')
    expect(responsiveCounterpartDecision('not-applicable')).toBe('not-required')
  })

  it('rejects a final off-origin navigation', async () => {
    const page = {
      goto: async () => ({status: () => 200}),
      url: () => 'https://evil.example/redirect',
    }
    await expect(navigateAuditRoute(page, '/')).rejects.toThrow(/off origin/)
  })

  it('validates decoded PNG signatures and dimensions', () => {
    const png = Buffer.alloc(24)
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png)
    png.write('IHDR', 12, 'ascii')
    png.writeUInt32BE(1, 16)
    png.writeUInt32BE(2, 20)
    expect(validatePng(png)).toEqual({width: 1, height: 2})
    expect(() => validatePng(Buffer.alloc(24))).toThrow()
  })
})
