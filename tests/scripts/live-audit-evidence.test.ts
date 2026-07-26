import type {IssueLedger} from '../../scripts/live-audit/issue-ledger'
import {Buffer} from 'node:buffer'
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'

import {describe, expect, it, vi} from 'vitest'
import {parseAuditManifest, type AuditAssertion} from '../../scripts/live-audit/contract'
import {
  AUDIT_ORIGIN,
  buildActiveReplayRequests,
  buildCoreMatrix,
  captureTargetEvidence,
  chooseRotatingPreset,
  computeEvidenceIntegrity,
  evaluateAuditAssertion,
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
import {EVIDENCE_RELEASE_TAG, publishEvidenceAsset, verifyPublicPng} from '../../scripts/live-audit/release-evidence'

const validPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)
const indexed16BitPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABEAMAAAB4W+j4AAAAA1BMVEX/AAAZ4gk3AAAAC0lEQVR4nGNgYAAAAAMAAbitOmMAAAAASUVORK5CYII=',
  'base64',
)
const evidence = (role: 'context' | 'crop', path: string, alt: string, caption: string) => ({
  role,
  path,
  alt,
  caption,
  integrity: {path, sha256: '0'.repeat(64), width: 1, height: 1, bytes: 1},
})

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
          assertion: {version: 1, kind: 'viewport-containment', edges: 'all'},
          actions: [],
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
    const missingAssertion = structuredClone(bundle) as unknown as {candidates: Record<string, unknown>[]}
    delete missingAssertion.candidates[0]?.assertion
    expect(() => parseCandidateBundle(missingAssertion)).toThrow(/candidate|assertion/)
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
    let counterpartCaptureCount = 0
    const candidate = {
      route: '/projects' as const,
      findingClass: 'layout' as const,
      assertion: {version: 1 as const, kind: 'viewport-containment' as const, edges: 'all' as const},
      actions: [],
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
        context: evidence('context', `${value.semanticTarget}-context.png`, 'x', 'x'),
        crop: evidence('crop', `${value.semanticTarget}-crop.png`, 'x', 'x'),
      }),
      counterpartReplay: async () => ({status: 'clean', signature: '', observedAt: '2026-07-20T03:30:02.000Z'}),
      counterpartCapture: async () => ({
        context: evidence('context', `counter-context-${counterpartCaptureCount++}.png`, 'x', 'x'),
        crop: evidence('crop', `counter-crop-${counterpartCaptureCount}.png`, 'x', 'x'),
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
      assertion: {version: 1, kind: 'viewport-containment', edges: 'all'},
      actions: [],
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
          actions: [],
          assertion: {version: 1, kind: 'viewport-containment', edges: 'all'},
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
    expect(result.validation?.actions).toEqual(request.actions)
    expect(result.finding).toBeUndefined()
    const bundleResult = await finalizeCandidateBundle(
      {
        version: 1,
        runId: 'infrastructure-bundle',
        runKind: 'manual',
        issueNumber: 204,
        generatedAt: '2026-07-20T03:30:00.000Z',
        candidates: [],
        diagnostics: [],
        exploration: {steps: 0, durationMs: 0},
      },
      {
        replay: async () => ({status: 'clean', signature: '', observedAt: '2026-07-20T03:30:00.000Z'}),
        capture: async () => {
          throw new Error('not called')
        },
        activeRequests: requests,
        activeReplay: async () => ({
          status: 'infrastructure-error',
          signature: 'timeout',
          observedAt: '2026-07-20T03:30:01.000Z',
        }),
        activeCapture: async () => {
          throw new Error('not called')
        },
      },
    )
    expect(bundleResult.manifest.validations).toHaveLength(0)
    expect(bundleResult.diagnostics.join(' ')).toContain('timeout')
  })

  it('performs one clean active replay and exactly two matching recurrent replays', async () => {
    const request: ActiveVariantReplayRequest = {
      issueNumber: 204,
      fingerprint: findingFingerprint({route: '/projects', semanticTarget: 'target', failureSignature: 'overflow'}),
      variantKey: variantKey({viewport: 'mobile', theme: {kind: 'mode', mode: 'dark'}, state: 'core'}),
      route: '/projects',
      semanticTarget: 'target',
      findingClass: 'layout',
      assertion: {version: 1, kind: 'viewport-containment', edges: 'all'},
      actions: [],
      failureSignature: 'overflow',
      responsive: 'required',
      variant: {viewport: 'mobile', theme: {kind: 'mode', mode: 'dark'}, state: 'core'},
      target: {kind: 'test-id', value: 'target'},
      reproduction: ['Open projects'],
    }
    let calls = 0
    const capture = async () => ({
      context: evidence('context', 'context.png', 'context', 'context'),
      crop: evidence('crop', 'crop.png', 'crop', 'crop'),
    })
    const recurrent = await finalizeActiveVariant(
      request,
      async () => {
        calls += 1
        return {status: 'failure', signature: 'overflow', observedAt: `2026-07-20T03:30:0${calls}.000Z`}
      },
      capture,
      async () => ({status: 'clean', signature: '', observedAt: '2026-07-20T03:30:03.000Z'}),
      async () => ({
        context: evidence('context', 'counter-context.png', 'counter context', 'counter context'),
        crop: evidence('crop', 'counter-crop.png', 'counter crop', 'counter crop'),
      }),
    )
    expect(calls).toBe(2)
    expect(recurrent.finding).toBeDefined()
    expect(recurrent.finding?.assertion).toEqual(request.assertion)
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
    expect(clean.validation?.actions).toEqual(request.actions)
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
    const counterpartSignatureMismatch = await finalizeActiveVariant(
      request,
      async () => ({status: 'failure', signature: 'overflow', observedAt: '2026-07-20T03:36:00.000Z'}),
      capture,
      async () => ({status: 'failure', signature: 'different failure', observedAt: '2026-07-20T03:36:01.000Z'}),
      async () => ({
        context: evidence('context', 'counter-mismatch-context.png', 'context', 'context'),
        crop: evidence('crop', 'counter-mismatch-crop.png', 'crop', 'crop'),
      }),
    )
    expect(counterpartSignatureMismatch.finding).toBeUndefined()
    expect(counterpartSignatureMismatch.diagnostic).toMatch(/signature|counterpart/)
  })

  it('derives active replay requests only from the ledger and preserves the variant key', () => {
    const ledger: IssueLedger = {
      version: 1,
      fingerprint: findingFingerprint({route: '/projects', semanticTarget: 'target', failureSignature: 'overflow'}),
      route: '/projects',
      actions: [],
      semanticTarget: 'target',
      findingClass: 'layout',
      assertion: {version: 1, kind: 'viewport-containment', edges: 'all'},
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
          assertion: {version: 1, kind: 'viewport-containment', edges: 'all'},
          actions: [],
          reproduction: ['Open projects'],
        },
      ],
      operations: [],
      transition: {kind: 'open', source: 'reporter'},
    }
    expect(buildActiveReplayRequests(204, ledger)[0]).toMatchObject({
      issueNumber: 204,
      fingerprint: ledger.fingerprint,
      assertion: ledger.assertion,
      actions: [],
      responsive: 'not-applicable',
      reproduction: ['Open projects'],
    })
  })

  it('rejects an issue-mismatched manual active request before callbacks run', async () => {
    const request: ActiveVariantReplayRequest = {
      issueNumber: 205,
      fingerprint: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      actions: [],
      variantKey: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      route: '/projects',
      semanticTarget: 'target',
      findingClass: 'layout',
      assertion: {version: 1, kind: 'viewport-containment', edges: 'all'},
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

  it('binds manual candidate counterpart validation to the enclosing issue', async () => {
    const candidate = {
      route: '/projects' as const,
      findingClass: 'layout' as const,
      assertion: {version: 1 as const, kind: 'viewport-containment' as const, edges: 'all' as const},
      actions: [],
      responsive: 'required' as const,
      semanticTarget: 'target',
      target: {kind: 'test-id' as const, value: 'target'},
      failureSignature: 'overflow',
      description: 'Overflow',
      reproduction: ['Open projects'],
      variant: {viewport: 'mobile' as const, theme: {kind: 'mode' as const, mode: 'dark' as const}, state: 'core'},
      observation: {status: 'failure' as const, signature: 'overflow', observedAt: '2026-07-20T03:30:00.000Z'},
    }
    let issueNumber = 0
    const result = await finalizeCandidateBundle(
      {
        version: 1,
        runId: 'manual',
        runKind: 'manual',
        issueNumber: 204,
        generatedAt: '2026-07-20T03:30:00.000Z',
        candidates: [candidate],
        diagnostics: [],
        exploration: {steps: 0, durationMs: 0},
      },
      {
        replay: async () => ({status: 'failure', signature: 'overflow', observedAt: '2026-07-20T03:30:01.000Z'}),
        capture: async () => ({
          context: evidence('context', 'primary-context.png', 'context', 'context'),
          crop: evidence('crop', 'primary-crop.png', 'crop', 'crop'),
        }),
        counterpartReplay: async request => {
          issueNumber = request.issueNumber
          return {status: 'clean', signature: '', observedAt: '2026-07-20T03:30:02.000Z'}
        },
        counterpartCapture: async () => ({
          context: evidence('context', 'counter-context.png', 'context', 'context'),
          crop: evidence('crop', 'counter-crop.png', 'crop', 'crop'),
        }),
      },
    )
    expect(issueNumber).toBe(204)
    expect(result.manifest.findings).toHaveLength(1)
  })

  it('suppresses contradictory candidate and validation terminals for one variant', async () => {
    const candidate = {
      route: '/projects' as const,
      findingClass: 'layout' as const,
      assertion: {version: 1 as const, kind: 'viewport-containment' as const, edges: 'all' as const},
      actions: [],
      responsive: 'not-applicable' as const,
      semanticTarget: 'target',
      target: {kind: 'test-id' as const, value: 'target'},
      failureSignature: 'overflow',
      description: 'Overflow',
      reproduction: ['Open projects'],
      variant: {viewport: 'mobile' as const, theme: {kind: 'mode' as const, mode: 'dark' as const}, state: 'core'},
      observation: {status: 'failure' as const, signature: 'overflow', observedAt: '2026-07-20T03:30:00.000Z'},
    }
    const fingerprint = findingFingerprint(candidate)
    const request: ActiveVariantReplayRequest = {
      issueNumber: 204,
      fingerprint,
      variantKey: variantKey(candidate.variant),
      route: candidate.route,
      semanticTarget: candidate.semanticTarget,
      findingClass: candidate.findingClass,
      assertion: candidate.assertion,
      actions: candidate.actions,
      failureSignature: candidate.failureSignature,
      responsive: candidate.responsive,
      variant: candidate.variant,
      target: candidate.target,
      reproduction: candidate.reproduction,
    }
    const result = await finalizeCandidateBundle(
      {
        version: 1,
        runId: 'conflict',
        runKind: 'manual',
        issueNumber: 204,
        generatedAt: '2026-07-20T03:30:00.000Z',
        candidates: [candidate],
        diagnostics: [],
        exploration: {steps: 0, durationMs: 0},
      },
      {
        replay: async () => ({status: 'failure', signature: 'overflow', observedAt: '2026-07-20T03:30:01.000Z'}),
        capture: async () => ({
          context: evidence('context', 'candidate-context.png', 'context', 'context'),
          crop: evidence('crop', 'candidate-crop.png', 'crop', 'crop'),
        }),
        activeRequests: [request],
        activeReplay: async () => ({status: 'clean', signature: '', observedAt: '2026-07-20T03:30:02.000Z'}),
        activeCapture: async () => ({
          context: evidence('context', 'validation-context.png', 'context', 'context'),
          crop: evidence('crop', 'validation-crop.png', 'crop', 'crop'),
        }),
      },
    )
    expect(result.manifest.findings).toHaveLength(0)
    expect(result.manifest.validations).toHaveLength(0)
    expect(result.diagnostics.join(' ')).toMatch(/conflict|terminal|candidate|validation/i)
  })

  it('suppresses duplicate terminal validations for one fingerprint and variant', async () => {
    const request: ActiveVariantReplayRequest = {
      issueNumber: 204,
      actions: [],
      fingerprint: findingFingerprint({route: '/projects', semanticTarget: 'target', failureSignature: 'overflow'}),
      variantKey: variantKey({viewport: 'mobile', theme: {kind: 'mode', mode: 'dark'}, state: 'core'}),
      route: '/projects',
      semanticTarget: 'target',
      findingClass: 'layout',
      assertion: {version: 1, kind: 'viewport-containment', edges: 'all'},
      failureSignature: 'overflow',
      responsive: 'not-applicable',
      variant: {viewport: 'mobile', theme: {kind: 'mode', mode: 'dark'}, state: 'core'},
      target: {kind: 'test-id', value: 'target'},
      reproduction: ['Open projects'],
    }
    const result = await finalizeCandidateBundle(
      {
        version: 1,
        runId: 'duplicate-validations',
        runKind: 'manual',
        issueNumber: 204,
        generatedAt: '2026-07-20T03:30:00.000Z',
        candidates: [],
        diagnostics: [],
        exploration: {steps: 0, durationMs: 0},
      },
      {
        replay: async () => ({status: 'clean', signature: '', observedAt: '2026-07-20T03:30:00.000Z'}),
        capture: async () => {
          throw new Error('not called')
        },
        activeRequests: [request, {...request}],
        activeReplay: async () => ({status: 'clean', signature: '', observedAt: '2026-07-20T03:30:01.000Z'}),
        activeCapture: async () => ({
          context: evidence('context', 'validation-context.png', 'context', 'context'),
          crop: evidence('crop', 'validation-crop.png', 'crop', 'crop'),
        }),
      },
    )
    expect(result.manifest.validations).toHaveLength(0)
    expect(result.diagnostics.join(' ')).toMatch(/duplic|conflict|terminal/i)
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
          assertion: {version: 1, kind: 'viewport-containment', edges: 'all'},
          actions: [],
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

  it('navigates non-root routes through the root fallback and accepts the restored pathname', async () => {
    let navigatedUrl = ''
    const page = {
      goto: async (url: string) => {
        navigatedUrl = url
        return {status: () => 200}
      },
      url: () => 'https://mrbro.dev/projects',
    }
    await navigateAuditRoute(page, '/projects')
    expect(navigatedUrl).toBe('https://mrbro.dev/?p=%2Fprojects')
    expect(new URL(page.url()).pathname).toBe('/projects')
  })

  it('rejects a same-origin navigation that does not restore the requested pathname', async () => {
    const page = {
      goto: async (_url: string) => ({status: () => 200}),
      url: () => 'https://mrbro.dev/about',
    }
    await expect(navigateAuditRoute(page, '/projects')).rejects.toThrow(/pathname|route/)
  })

  it('captures context and crop evidence when residual target overflow is within two CSS pixels', async () => {
    let scrollAttempts = 0
    const locator = {
      waitFor: async () => undefined,
      count: async () => 1,
      isVisible: async () => true,
      scrollIntoViewIfNeeded: async () => undefined,
      boundingBox: async () => ({x: 120, y: 424.15625, width: 378.65625, height: 477.1875}),
      screenshot: async ({path: outputPath}: {path: string}) => {
        await writeFile(outputPath, validPng)
      },
    }
    const page = {
      getByTestId: () => locator,
      evaluate: async (_callback: unknown, amount?: number) => {
        if (amount !== undefined) scrollAttempts += 1
        return {width: 1440, height: 900}
      },
      screenshot: async ({path: outputPath}: {path: string}) => {
        await writeFile(outputPath, validPng)
      },
    } as unknown
    const outputDirectory = await mkdtemp(path.join(tmpdir(), 'live-audit-evidence-tolerance-'))

    try {
      const result = await captureTargetEvidence(
        page as never,
        {kind: 'test-id', value: 'desktop-target'},
        outputDirectory,
      )
      const context = await readFile(path.join(outputDirectory, result.context.path))
      const crop = await readFile(path.join(outputDirectory, result.crop.path))

      expect(scrollAttempts).toBe(1)
      expect(context).toEqual(validPng)
      expect(crop).toEqual(validPng)
      expect(result.context.role).toBe('context')
      expect(result.crop.role).toBe('crop')
      expect(result.context.integrity.bytes).toBe(validPng.byteLength)
      expect(result.crop.integrity.bytes).toBe(validPng.byteLength)
    } finally {
      await rm(outputDirectory, {recursive: true, force: true})
    }
  })

  it('rejects residual target overflow greater than two CSS pixels', async () => {
    const locator = {
      waitFor: async () => undefined,
      count: async () => 1,
      isVisible: async () => true,
      scrollIntoViewIfNeeded: async () => undefined,
      boundingBox: async () => ({x: 120, y: 424, width: 378, height: 478.0001}),
      screenshot: async ({path: outputPath}: {path: string}) => {
        await writeFile(outputPath, validPng)
      },
    }
    const page = {
      getByTestId: () => locator,
      evaluate: async () => ({width: 1440, height: 900}),
      screenshot: async ({path: outputPath}: {path: string}) => {
        await writeFile(outputPath, validPng)
      },
    } as unknown
    const outputDirectory = await mkdtemp(path.join(tmpdir(), 'live-audit-evidence-overflow-'))

    try {
      await expect(
        captureTargetEvidence(page as never, {kind: 'test-id', value: 'desktop-target'}, outputDirectory),
      ).rejects.toThrow(/target is outside the viewport/)
    } finally {
      await rm(outputDirectory, {recursive: true, force: true})
    }
  })

  it('rejects a region that extends one CSS pixel outside the viewport', async () => {
    let evaluateCalls = 0
    const page = {
      evaluate: async () => (evaluateCalls++ === 0 ? {width: 100, height: 100} : {x: 0, y: 0, width: 100, height: 100}),
      screenshot: async ({path: outputPath}: {path: string}) => {
        await writeFile(outputPath, validPng)
      },
    } as unknown
    const outputDirectory = await mkdtemp(path.join(tmpdir(), 'live-audit-evidence-region-bounds-'))

    try {
      await expect(
        captureTargetEvidence(page as never, {kind: 'region', x: -1, y: 0, width: 10, height: 10}, outputDirectory),
      ).rejects.toThrow(/target is outside the viewport/)
    } finally {
      await rm(outputDirectory, {recursive: true, force: true})
    }
  })

  it('waits for a locator target to attach before capturing evidence', async () => {
    let attached = false
    const waitFor = vi.fn(async (options: {state: 'attached'; timeout: number}) => {
      expect(options.state).toBe('attached')
      expect(options.timeout).toBeGreaterThan(0)
      expect(options.timeout).toBeLessThanOrEqual(5_000)
      attached = true
    })
    const locator = {
      waitFor,
      count: async () => (attached ? 1 : 0),
      isVisible: async () => true,
      scrollIntoViewIfNeeded: async () => undefined,
      boundingBox: async () => ({x: 1, y: 1, width: 10, height: 10}),
      screenshot: async ({path: outputPath}: {path: string}) => {
        await writeFile(outputPath, validPng)
      },
    }
    const page = {
      getByTestId: () => locator,
      evaluate: async () => ({width: 100, height: 100}),
      screenshot: async ({path: outputPath}: {path: string}) => {
        await writeFile(outputPath, validPng)
      },
    } as unknown
    const outputDirectory = await mkdtemp(path.join(tmpdir(), 'live-audit-evidence-attachment-'))

    try {
      await expect(
        captureTargetEvidence(page as never, {kind: 'test-id', value: 'async-target'}, outputDirectory),
      ).resolves.toBeDefined()
      expect(waitFor).toHaveBeenCalledOnce()
    } finally {
      await rm(outputDirectory, {recursive: true, force: true})
    }
  })

  it('rejects a signature-and-IHDR-only truncated PNG', () => {
    const png = Buffer.alloc(24)
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png)
    png.write('IHDR', 12, 'ascii')
    png.writeUInt32BE(1, 16)
    png.writeUInt32BE(2, 20)
    expect(() => validatePng(png)).toThrow()
  })

  it('validates complete PNG structure, CRCs, and decompressed scanlines', () => {
    expect(validatePng(validPng)).toEqual({width: 1, height: 1})
  })

  it('rejects 16-bit indexed-color PNG encoding', () => {
    expect(() => validatePng(indexed16BitPng)).toThrow(/encoding|bit depth|color type/)
  })

  it('rejects corrupt chunks, missing terminal chunks, and oversized dimensions', () => {
    const corrupt = Buffer.from(validPng)
    const corruptIndex = corrupt.length - 20
    corrupt[corruptIndex] = (corrupt.at(corruptIndex) ?? 0) ^ 1
    expect(() => validatePng(corrupt)).toThrow(/CRC|IDAT|invalid/)
    expect(() => validatePng(validPng.subarray(0, -12))).toThrow(/incomplete|truncated/)
    const oversized = Buffer.from(validPng)
    oversized.writeUInt32BE(10_001, 16)
    expect(() => validatePng(oversized)).toThrow(/dimension|CRC/)
  })

  it('evaluates closed assertions from DOM state with normalized signatures', async () => {
    const makePage = (
      elements: Record<
        string,
        {box: {x: number; y: number; width: number; height: number}; visible: boolean; text?: string; image?: string}
      >,
      viewport: {
        width: number
        height: number
        scrollWidth?: number
        clientWidth?: number
        scrollHeight?: number
        clientHeight?: number
      } = {width: 100, height: 100},
    ) => {
      const locatorFor = (value: string) => {
        const element = elements[value]
        return {
          waitFor: async () => undefined,
          count: async () => (element ? 1 : 0),
          boundingBox: async () => element?.box ?? null,
          isVisible: async () => element?.visible ?? false,
          textContent: async () => element?.text ?? null,
          evaluate: async () => element?.image ?? 'not-image',
        }
      }
      return {
        url: () => AUDIT_ORIGIN,
        getByTestId: locatorFor,
        evaluate: async () => viewport,
      } as unknown
    }
    const target = {kind: 'test-id' as const, value: 'target'}
    const evaluate = async (page: unknown, assertion: AuditAssertion) =>
      evaluateAuditAssertion(page as never, target, assertion)
    const imageResult = await evaluate(
      makePage({target: {box: {x: 1, y: 1, width: 10, height: 10}, visible: true, image: 'loaded'}}),
      {version: 1, kind: 'image-load', expected: 'loaded'},
    )
    expect(imageResult.status).toBe('clean')
    expect(imageResult.signature).toBe('assertion:image-load:expected-loaded:loaded')
    expect(
      (
        await evaluate(
          makePage({target: {box: {x: 1, y: 1, width: 10, height: 10}, visible: true, image: 'not-loaded'}}),
          {
            version: 1,
            kind: 'image-load',
            expected: 'loaded',
          },
        )
      ).status,
    ).toBe('failure')
    expect(
      (
        await evaluate(makePage({target: {box: {x: 1, y: 1, width: 10, height: 10}, visible: true}}), {
          version: 1,
          kind: 'visibility',
          expected: 'visible',
        })
      ).status,
    ).toBe('clean')
    expect(
      (
        await evaluate(makePage({target: {box: {x: 1, y: 1, width: 10, height: 10}, visible: false}}), {
          version: 1,
          kind: 'visibility',
          expected: 'visible',
        })
      ).status,
    ).toBe('failure')
    expect(
      (
        await evaluate(makePage({target: {box: {x: 1, y: 1, width: 10, height: 10}, visible: true}}), {
          version: 1,
          kind: 'viewport-containment',
          edges: 'all',
        })
      ).status,
    ).toBe('clean')
    expect(
      (
        await evaluate(makePage({target: {box: {x: 95, y: 1, width: 10, height: 10}, visible: true}}), {
          version: 1,
          kind: 'viewport-containment',
          edges: 'all',
        })
      ).status,
    ).toBe('failure')
    expect(
      (
        await evaluate(
          makePage(
            {target: {box: {x: 1, y: 1, width: 10, height: 10}, visible: true}},
            {width: 100, height: 100, scrollWidth: 120, clientWidth: 100, scrollHeight: 100, clientHeight: 100},
          ),
          {version: 1, kind: 'viewport-overflow', axis: 'horizontal'},
        )
      ).status,
    ).toBe('failure')
    expect(
      (
        await evaluate(
          makePage({target: {box: {x: 1, y: 1, width: 10, height: 10}, visible: true}}, {width: 100, height: 100}),
          {version: 1, kind: 'geometry', property: 'width', operator: 'at-least', value: 10},
        )
      ).status,
    ).toBe('clean')
    expect(
      (
        await evaluate(
          makePage({
            target: {box: {x: 1, y: 1, width: 10, height: 10}, visible: true},
            other: {box: {x: 5, y: 5, width: 10, height: 10}, visible: true},
          }),
          {version: 1, kind: 'no-overlap', otherTarget: {kind: 'test-id', value: 'other'}},
        )
      ).status,
    ).toBe('failure')
    expect(
      (
        await evaluate(makePage({target: {box: {x: 1, y: 1, width: 2, height: 2}, visible: true}}), {
          version: 1,
          kind: 'minimum-size',
          width: 4,
          height: 4,
        })
      ).status,
    ).toBe('failure')
    expect(
      (
        await evaluate(
          makePage({target: {box: {x: 1, y: 1, width: 10, height: 10}, visible: true, text: 'Hello world'}}),
          {version: 1, kind: 'text', operator: 'contains', value: 'world'},
        )
      ).status,
    ).toBe('clean')
    expect(
      (
        await evaluate(
          makePage({target: {box: {x: 1, y: 1, width: 10, height: 10}, visible: true, text: 'Hello world'}}),
          {version: 1, kind: 'text', operator: 'equals', value: 'Goodbye'},
        )
      ).status,
    ).toBe('failure')
  })

  it('waits for an asynchronously attached test-id target before evaluating its assertion', async () => {
    let attached = false
    const waitFor = vi.fn(async (options: {state: 'attached'; timeout: number}) => {
      expect(options.state).toBe('attached')
      expect(options.timeout).toBeGreaterThan(0)
      attached = true
    })
    const locator = {
      count: async () => (attached ? 1 : 0),
      waitFor,
      boundingBox: async () => ({x: 1, y: 1, width: 10, height: 10}),
      isVisible: async () => false,
    }
    const page = {
      url: () => AUDIT_ORIGIN,
      getByTestId: () => locator,
      evaluate: async () => ({width: 100, height: 100}),
    } as unknown

    const result = await evaluateAuditAssertion(
      page as never,
      {kind: 'test-id', value: 'project-card'},
      {version: 1, kind: 'visibility', expected: 'visible'},
    )

    expect(waitFor).toHaveBeenCalledOnce()
    expect(result.status).toBe('failure')
    expect(result.signature).toBe('assertion:visibility:expected-visible:hidden')
  })

  it('derives canonical evidence integrity from validated PNG bytes', () => {
    expect(computeEvidenceIntegrity('screenshots/image.png', validPng)).toEqual({
      path: 'screenshots/image.png',
      sha256: '431ced6916a2a21a156e38701afe55bbd7f88969fbbfc56d7fe099d47f265460',
      width: 1,
      height: 1,
      bytes: validPng.byteLength,
    })
    expect(() => computeEvidenceIntegrity('../image.png', validPng)).toThrow(/path|safe/)
  })

  it('rejects a public PNG response that contains only a signature and IHDR', async () => {
    const truncated = Buffer.alloc(24)
    validPng.subarray(0, 8).copy(truncated)
    truncated.write('IHDR', 12, 'ascii')
    truncated.writeUInt32BE(1, 16)
    truncated.writeUInt32BE(1, 20)
    await expect(
      verifyPublicPng(
        'https://github.com/example/repo/releases/download/live-audit-evidence/image.png',
        vi.fn().mockResolvedValue({
          ok: true,
          url: 'https://github.com/example/repo/releases/download/live-audit-evidence/image.png',
          headers: new Headers({'content-type': 'image/png'}),
          arrayBuffer: async () => truncated.buffer,
        }),
        {owner: 'example', repo: 'repo', tag: EVIDENCE_RELEASE_TAG, assetName: 'image.png'},
      ),
    ).resolves.toMatchObject({ok: false})
  })

  it('does not delete an exact durable asset when public verification is transiently unavailable', async () => {
    const asset = {
      id: 7,
      name: 'exact.png',
      state: 'uploaded',
      size: validPng.byteLength,
      content_type: 'image/png',
      digest: `sha256:${computeEvidenceIntegrity('exact.png', validPng).sha256}`,
      browser_download_url: 'https://github.com/example/repo/releases/download/live-audit-evidence/exact.png',
    }
    const run = vi.fn().mockResolvedValue({stdout: JSON.stringify([asset]), stderr: '', exitCode: 0})
    await expect(
      publishEvidenceAsset({
        runner: {run},
        repository: {owner: 'example', repo: 'repo'},
        release: {
          id: 42,
          tagName: EVIDENCE_RELEASE_TAG,
          uploadUrl: 'upload',
          isDraft: false,
          isPrerelease: true,
          assets: [],
        },
        assetName: asset.name,
        expectedBytes: validPng,
        verifyPublicImage: vi.fn().mockResolvedValue({ok: false, reason: 'CDN timeout'}),
      }),
    ).rejects.toThrow(/matching|public/)
    expect(run).toHaveBeenCalledOnce()
  })
})
