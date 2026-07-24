import {describe, expect, it} from 'vitest'

import {findingFingerprint, operationKey, variantKey} from '../../scripts/live-audit/identity'
import {parseIssueLedger, renderIssueLedger, type IssueLedger} from '../../scripts/live-audit/issue-ledger'

const ledger: IssueLedger = {
  version: 1,
  fingerprint: findingFingerprint({route: '/projects', semanticTarget: 'card', failureSignature: 'broken image'}),
  route: '/projects',
  semanticTarget: 'card',
  findingClass: 'broken-image',
  assertion: {version: 1, kind: 'image-load', expected: 'loaded'},
  actions: [],
  responsive: 'uncertain',
  failureSignature: 'broken image',
  variants: [
    {
      key: 'variant-1',
      viewport: 'mobile',
      theme: {kind: 'preset', presetId: 'dracula'},
      state: 'default',
      cleanCount: 1,
    },
  ],
  replay: [
    {
      variantKey: 'variant-1',
      target: {kind: 'test-id', value: 'card'},
      assertion: {version: 1, kind: 'image-load', expected: 'loaded'},
      actions: [],
      reproduction: ['Open projects'],
    },
  ],
  operations: [{key: 'op-1', checkpoint: 'issue', completedAt: '2026-07-20T03:30:00.000Z'}],
  transition: {kind: 'open', source: 'reporter'},
}
const transitionOperation = {
  key: 'transition-op-1',
  checkpoint: 'transition' as const,
  completedAt: '2026-07-20T03:31:00.000Z',
}
const reporterClosedLedger: IssueLedger = {
  ...ledger,
  operations: [...ledger.operations, transitionOperation],
  transition: {
    kind: 'closed' as const,
    source: 'reporter' as const,
    operationKey: transitionOperation.key,
    completedAt: transitionOperation.completedAt,
  },
}

describe('live audit identity and issue ledger', () => {
  it('keeps finding identity stable across wording, run IDs, and screenshot names', () => {
    const base = {
      route: '/projects',
      target: {kind: 'test-id' as const, value: 'card'},
      semanticTarget: 'Project card image',
      findingClass: 'broken-image' as const,
      failureSignature: 'Image  is broken',
    }
    const descriptorChanged = {...base, target: {kind: 'role', role: 'img', name: 'Project card image'}}
    const proseChanged = {...base, failureSignature: 'materially different failure'}
    const runMetadataChanged = {...base, runId: 'run-2', screenshotName: 'new.png', description: 'different prose'}
    const classChanged = {...base, findingClass: 'layout'}
    expect(findingFingerprint(base)).toBe(findingFingerprint(descriptorChanged))
    expect(findingFingerprint(base)).not.toBe(findingFingerprint(proseChanged))
    expect(findingFingerprint(base)).toBe(findingFingerprint({...base, failureSignature: ' IMAGE   IS   BROKEN '}))
    expect(findingFingerprint(base)).toBe(findingFingerprint({...base, semanticTarget: ' project   card IMAGE '}))
    expect(findingFingerprint(base)).toBe(findingFingerprint(runMetadataChanged))
    expect(findingFingerprint(base)).not.toBe(findingFingerprint({...base, semanticTarget: 'project title'}))
    expect(findingFingerprint(base)).toBe(findingFingerprint(classChanged))
  })

  it('separates viewport/theme variants and derives deterministic operation keys', () => {
    expect(variantKey({viewport: 'mobile', theme: {kind: 'preset', presetId: 'dracula'}, state: 'default'})).not.toBe(
      variantKey({viewport: 'desktop', theme: {kind: 'preset', presetId: 'dracula'}, state: 'default'}),
    )
    expect(operationKey('run-1', 'fp-1', 'variant-1', 'asset')).toBe(
      operationKey('run-1', 'fp-1', 'variant-1', 'asset'),
    )
    expect(operationKey('run-1', 'fp-1', 'variant-1', 'asset')).not.toBe(
      operationKey('run-2', 'fp-1', 'variant-1', 'asset'),
    )
  })

  it('round trips the sentinel ledger while preserving surrounding human content', () => {
    const body = `Human heading\n\nDo not delete this prose.\n\n${renderIssueLedger(ledger)}\n\nHuman footer`
    const parsed = parseIssueLedger(body)
    expect(parsed.ledger).toEqual(ledger)
    expect(parsed.humanBody).toContain('Do not delete this prose.')
    expect(parsed.humanBody).toContain('Human footer')
    expect(() => parseIssueLedger('no ledger here')).toThrow()
    expect(() => parseIssueLedger(`${renderIssueLedger(ledger)}\n${renderIssueLedger(ledger)}`)).toThrow()
  })

  it('accepts the dedicated legacy adoption checkpoint without changing open provenance', () => {
    const adoptionLedger: IssueLedger = {
      ...ledger,
      operations: [{key: 'legacy-adoption-op', checkpoint: 'legacy-adopt', completedAt: '2026-07-20T03:30:00.000Z'}],
      transition: {kind: 'open', source: 'human'},
    }
    expect(parseIssueLedger(renderIssueLedger(adoptionLedger)).ledger).toEqual(adoptionLedger)
  })

  it('round trips reporter transition provenance and preserves the surrounding body exactly', () => {
    const human = '  Human heading\n\nKeep this byte-for-byte.\n'
    const body = `${human}${renderIssueLedger(reporterClosedLedger)}\n${human}`
    const parsed = parseIssueLedger(body)

    expect(parsed.ledger).toEqual(reporterClosedLedger)
    expect(parsed.humanBody).toBe(`${human}\n${human}`)
  })

  it('requires one matching transition operation for reporter close and reopen states', () => {
    for (const kind of ['closed', 'reopened'] as const) {
      const withKind: IssueLedger = {
        ...reporterClosedLedger,
        transition: {
          kind,
          source: 'reporter',
          operationKey: transitionOperation.key,
          completedAt: transitionOperation.completedAt,
        } as IssueLedger['transition'],
      }
      expect(() => renderIssueLedger(withKind)).not.toThrow()
      expect(() => renderIssueLedger({...withKind, operations: ledger.operations})).toThrow()
      expect(() =>
        renderIssueLedger({
          ...withKind,
          operations: [
            ...ledger.operations,
            transitionOperation,
            {...transitionOperation, key: 'another-transition-op'},
          ],
        }),
      ).toThrow()
      expect(() =>
        renderIssueLedger({
          ...withKind,
          operations: [{...transitionOperation, completedAt: '2026-07-20T03:32:00.000Z'}, ...ledger.operations],
        }),
      ).toThrow()
    }
  })

  it('keeps reporter-open and human transitions representable without reporter provenance', () => {
    expect(() => renderIssueLedger(ledger)).not.toThrow()
    expect(() =>
      renderIssueLedger({
        ...ledger,
        transition: {kind: 'closed' as const, source: 'human' as const},
      }),
    ).not.toThrow()
    expect(() =>
      renderIssueLedger({
        ...ledger,
        transition: {kind: 'reopened' as const, source: 'human' as const},
      }),
    ).not.toThrow()
  })

  it('requires a closed responsive classification on the ledger envelope', () => {
    const {responsive: _responsive, ...missingResponsive} = ledger
    expect(() => renderIssueLedger(missingResponsive as IssueLedger)).toThrow()
    for (const responsive of ['sideways', '', null, undefined, 42]) {
      expect(() => renderIssueLedger({...ledger, responsive} as IssueLedger)).toThrow()
    }
  })

  it('round trips a reporter-owned pending reopen without replacing close provenance', () => {
    const pending = {
      ...reporterClosedLedger,
      operations: [...reporterClosedLedger.operations, {key: 'reopen-op-1', checkpoint: 'transition-pending'}],
      transition: {
        kind: 'closed-pending-reopen',
        source: 'reporter',
        operationKey: transitionOperation.key,
        completedAt: transitionOperation.completedAt,
        reopenOperationKey: 'reopen-op-1',
      },
    } as unknown as IssueLedger
    expect(() => renderIssueLedger(pending)).not.toThrow()
    expect(parseIssueLedger(renderIssueLedger(pending)).ledger).toEqual(pending)
    expect(() =>
      renderIssueLedger({
        ...pending,
        transition: {kind: 'closed-pending-reopen', source: 'human'},
      } as unknown as IssueLedger),
    ).toThrow()
  })

  it('round trips a committed reopen while retaining the prior close checkpoint', () => {
    const reopenOperation = {
      key: 'reopen-op-1',
      checkpoint: 'transition' as const,
      completedAt: '2026-07-20T03:32:00.000Z',
    }
    const reopened = {
      ...reporterClosedLedger,
      operations: [reopenOperation],
      transition: {
        kind: 'reopened' as const,
        source: 'reporter' as const,
        operationKey: reopenOperation.key,
        completedAt: '2026-07-20T03:32:00.000Z',
        previousCloseOperationKey: transitionOperation.key,
        previousCloseCompletedAt: transitionOperation.completedAt,
      },
    }
    expect(() => renderIssueLedger(reopened as unknown as IssueLedger)).not.toThrow()
    expect(parseIssueLedger(renderIssueLedger(reopened as unknown as IssueLedger)).ledger).toEqual(reopened)
  })

  it('preserves responsive classification while updating variant clean counts', () => {
    const parsed = parseIssueLedger(renderIssueLedger(ledger)).ledger
    const variant = parsed.variants.at(0)
    if (!variant) throw new Error('fixture variant missing')
    variant.cleanCount = 2
    const updated = parseIssueLedger(renderIssueLedger(parsed)).ledger
    expect(updated.responsive).toBe('uncertain')
    const updatedVariant = updated.variants.at(0)
    if (!updatedVariant) throw new Error('updated variant missing')
    expect(updatedVariant.cleanCount).toBe(2)
  })

  it('strips controls and rejects oversized ledger state', () => {
    expect(() => renderIssueLedger({...ledger, fingerprint: 'bad\u0000value'})).toThrow()
    expect(() => renderIssueLedger({...ledger, fingerprint: 'x'.repeat(40000)})).toThrow()
  })

  it('preserves human content byte-for-byte and enforces UTF-8 ledger bounds', () => {
    const human = '  Human\n\n  café  \n\n'
    const body = `${human}${renderIssueLedger(ledger)}\n${human}`
    expect(parseIssueLedger(body).humanBody).toBe(`${human}\n${human}`)
    expect(() =>
      parseIssueLedger(
        `${renderIssueLedger(ledger)}\n${renderIssueLedger(ledger).replace('<!-- /live-audit-ledger -->', '')}`,
      ),
    ).toThrow()
    expect(() => parseIssueLedger(`${renderIssueLedger(ledger)}\n<!-- /live-audit-ledger -->`)).toThrow()
  })

  it('rejects an altered fingerprint and requires exactly one replay per variant', () => {
    const replay = ledger.replay.at(0)
    if (!replay) throw new Error('fixture replay missing')
    expect(() => renderIssueLedger({...ledger, fingerprint: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'})).toThrow()
    expect(() => renderIssueLedger({...ledger, replay: []})).toThrow()
    expect(() => renderIssueLedger({...ledger, replay: [...ledger.replay, replay]})).toThrow()
  })

  it.each([
    ['unknown key', {...ledger, unexpected: true}],
    ['unknown variant key', {...ledger, variants: [{...ledger.variants[0], unexpected: true}]}],
    ['unknown replay key', {...ledger, replay: [{...ledger.replay[0], unexpected: true}]}],
    ['unknown operation key', {...ledger, operations: [{...ledger.operations[0], unexpected: true}]}],
    ['unknown transition key', {...ledger, transition: {...ledger.transition, unexpected: true}}],
    [
      'reporter transition missing checkpoint identity',
      {...ledger, transition: {kind: 'closed' as const, source: 'reporter' as const}},
    ],
    [
      'human transition masquerading as reporter provenance',
      {
        ...ledger,
        transition: {
          kind: 'closed' as const,
          source: 'human' as const,
          operationKey: transitionOperation.key,
          completedAt: transitionOperation.completedAt,
        },
      },
    ],
    [
      'unexpected open transition provenance',
      {...ledger, transition: {...ledger.transition, operationKey: transitionOperation.key}},
    ],
    [
      'invalid reporter transition key',
      {
        ...reporterClosedLedger,
        transition: {...reporterClosedLedger.transition, operationKey: ''},
      },
    ],
    [
      'invalid reporter transition date',
      {
        ...reporterClosedLedger,
        transition: {...reporterClosedLedger.transition, completedAt: 'yesterday'},
      },
    ],
    ['orphan transition operation', {...ledger, operations: [...ledger.operations, transitionOperation]}],
    ['unknown checkpoint', {...ledger, operations: [{...ledger.operations[0], checkpoint: 'wat'}]}],
    ['bad date', {...ledger, operations: [{...ledger.operations[0], completedAt: 'yesterday'}]}],
    ['unsafe target', {...ledger, replay: [{...ledger.replay[0], target: {kind: 'css', value: '.unsafe'}}]}],
    ['empty key', {...ledger, operations: [{...ledger.operations[0], key: ''}]}],
    ['oversized text', {...ledger, replay: [{...ledger.replay[0], semanticTarget: 'x'.repeat(2001)}]}],
    ['duplicate variant', {...ledger, variants: [ledger.variants[0], ledger.variants[0]]}],
    ['duplicate replay', {...ledger, replay: [...ledger.replay, ledger.replay[0]]}],
    ['duplicate operation', {...ledger, operations: [ledger.operations[0], ledger.operations[0]]}],
    ['unknown preset', {...ledger, variants: [{...ledger.variants[0], theme: {kind: 'preset', presetId: 'unknown'}}]}],
    ['unsupported version', {...ledger, version: 99}],
  ])('rejects %s ledger state', (_name, value) => {
    expect(() => renderIssueLedger(value as IssueLedger)).toThrow()
  })

  it('enforces UTF-8 byte limits including sentinel overhead', () => {
    expect(() => renderIssueLedger({...ledger, fingerprint: 'é'.repeat(16_000)})).toThrow()
  })
})
