import {describe, expect, it} from 'vitest'

import {
  AUDIT_ACTION_VERSION,
  parseAuditAction,
  parseAuditManifest,
  type AuditAction,
  type AuditManifest,
  type Finding,
  type ResponsiveCounterpart,
} from '../../scripts/live-audit/contract'
import {findingFingerprint, variantKey} from '../../scripts/live-audit/identity'
import {presetThemes} from '../../src/utils/preset-themes'

const evidence = (role: 'context' | 'crop', path: string, alt: string, caption: string) => ({
  role,
  path,
  alt,
  caption,
  integrity: {path, sha256: '0'.repeat(64), width: 1, height: 1, bytes: 1},
})

const observation = (signature = 'broken image'): Finding['observations'][number] => ({
  kind: 'candidate',
  status: 'failure',
  signature,
  observedAt: '2026-07-20T03:30:00.000Z',
})

describe('audit actions', () => {
  it('accepts closed click, press, and bounded wait actions', () => {
    const actions: AuditAction[] = [
      {version: AUDIT_ACTION_VERSION, kind: 'click', target: {kind: 'test-id', value: 'project-card-1'}},
      {
        version: AUDIT_ACTION_VERSION,
        kind: 'press',
        scope: 'target',
        key: 'Enter',
        target: {kind: 'role', role: 'button', name: 'Open'},
      },
      {version: AUDIT_ACTION_VERSION, kind: 'press', scope: 'page', key: 'ArrowRight'},
      {
        version: AUDIT_ACTION_VERSION,
        kind: 'wait',
        condition: 'visible',
        timeoutMs: 1000,
        target: {kind: 'text', value: 'Ready'},
      },
    ]
    for (const action of actions) expect(parseAuditAction(action)).toEqual(action)
  })

  it('rejects unknown, unsafe, unbounded, and arbitrary-key actions', () => {
    expect(() => parseAuditAction({version: 1, kind: 'click', target: {kind: 'css', value: '.x'}})).toThrow()
    expect(() => parseAuditAction({version: 1, kind: 'press', scope: 'page', key: 'KeyA'})).toThrow()
    expect(() =>
      parseAuditAction({
        version: 1,
        kind: 'wait',
        condition: 'visible',
        timeoutMs: 0,
        target: {kind: 'text', value: 'Ready'},
      }),
    ).toThrow()
    expect(() =>
      parseAuditAction({
        version: 1,
        kind: 'wait',
        condition: 'visible',
        timeoutMs: 31_000,
        target: {kind: 'text', value: 'Ready'},
      }),
    ).toThrow()
    expect(() => parseAuditAction({version: 1, kind: 'press', scope: 'page', key: 'Enter', extra: true})).toThrow()
  })
})

const responsiveCounterpart = (status: 'clean' | 'failure' = 'clean'): ResponsiveCounterpart => ({
  variant: {viewport: 'desktop', theme: {kind: 'preset', presetId: 'dracula'}, state: 'default'},
  target: {kind: 'test-id', value: 'project-card-1'},
  result:
    status === 'clean'
      ? {status: 'clean', observedAt: '2026-07-20T03:31:00.000Z'}
      : {status: 'failure', failureSignature: 'broken image', observedAt: '2026-07-20T03:31:00.000Z'},
  evidence: [
    evidence('context', 'screenshots/counterpart-context.png', 'Counterpart context', 'Context'),
    evidence('crop', 'screenshots/counterpart-crop.png', 'Counterpart crop', 'Crop'),
  ],
})

const validManifest = (): AuditManifest => ({
  version: 1,
  runId: 'run-123',
  generatedAt: '2026-07-20T03:30:00.000Z',
  runKind: 'scheduled',
  rotatingPresetId: 'dracula',
  validations: [],
  findings: [
    {
      route: '/projects',
      findingClass: 'broken-image',
      responsive: 'uncertain',
      semanticTarget: 'project-card-image',
      target: {kind: 'test-id', value: 'project-card-1'},
      assertion: {version: 1, kind: 'image-load', expected: 'loaded'},
      actions: [],
      failureSignature: 'broken image',
      description: 'The project image is broken.',
      reproduction: ['Open projects'],
      variant: {viewport: 'mobile', theme: {kind: 'preset', presetId: 'dracula'}, state: 'default'},
      observations: [observation(), {...observation(), kind: 'replay'}],
      evidence: [
        evidence('context', 'screenshots/context.png', 'Project context', 'Context'),
        evidence('crop', 'screenshots/crop.png', 'Project crop', 'Crop'),
      ],
      counterpart: responsiveCounterpart(),
    },
  ],
})

const firstFinding = (manifest: AuditManifest): Finding => {
  const finding = manifest.findings.at(0)
  if (!finding) throw new Error('fixture finding missing')
  return finding
}

const withCounterpart = (manifest: AuditManifest, counterpart: unknown): unknown => {
  const result = structuredClone(manifest) as unknown as {findings: Record<string, unknown>[]}
  const finding = result.findings.at(0)
  if (!finding) throw new Error('fixture finding missing')
  finding.counterpart = counterpart
  return result
}

const rawFinding = (manifest: Record<string, unknown>): Record<string, unknown> => {
  const finding = (manifest.findings as Record<string, unknown>[]).at(0)
  if (!finding) throw new Error('fixture finding missing')
  return finding
}

const validCleanValidation = () => ({
  ...(() => {
    const variant = {
      viewport: 'mobile' as const,
      theme: {kind: 'preset' as const, presetId: 'dracula' as const},
      state: 'default',
    }
    return {
      fingerprint: findingFingerprint({
        route: '/projects',
        semanticTarget: 'project-card-image',
        failureSignature: 'broken image',
      }),
      variantKey: variantKey(variant),
      variant,
    }
  })(),
  status: 'clean' as const,
  issueNumber: 204,
  route: '/projects' as const,
  semanticTarget: 'project-card-image',
  findingClass: 'broken-image' as const,
  failureSignature: 'broken image',
  target: {kind: 'test-id' as const, value: 'project-card-1'},
  assertion: {version: 1, kind: 'image-load' as const, expected: 'loaded' as const},
  actions: [],
  observedAt: '2026-07-20T03:30:00.000Z',
  evidence: [
    evidence('context', 'validations/context.png', 'Validation context', 'Context'),
    evidence('crop', 'validations/crop.png', 'Validation crop', 'Crop'),
  ],
})

describe('live audit contract', () => {
  it('parses a clean run and a confirmed finding from unknown input', () => {
    expect(
      parseAuditManifest({
        version: 1,
        runId: 'clean',
        generatedAt: validManifest().generatedAt,
        runKind: 'scheduled',
        rotatingPresetId: 'dracula',
        validations: [],
        findings: [],
      }),
    ).toEqual(expect.objectContaining({findings: []}))
    expect(parseAuditManifest(validManifest()).findings).toHaveLength(1)
  })

  it('requires a closed versioned assertion and rejects prose or class mismatches', () => {
    const missing = structuredClone(validManifest()) as unknown as Record<string, unknown>
    delete (rawFinding(missing) as Record<string, unknown>).assertion
    expect(() => parseAuditManifest(missing)).toThrow()

    const valid = structuredClone(validManifest()) as unknown as Record<string, unknown>
    rawFinding(valid).assertion = {version: 1, kind: 'image-load', expected: 'loaded'}
    expect(parseAuditManifest(valid).findings[0]).toMatchObject({assertion: {kind: 'image-load'}})

    for (const assertion of [
      {version: 1, kind: 'image-load', expected: 'loaded', prose: 'run JavaScript'},
      {version: 1, kind: 'visibility', expected: 'visible'},
      {version: 1, kind: 'text', operator: 'equals', value: 'a'.repeat(2_001)},
    ]) {
      const invalid = structuredClone(validManifest()) as unknown as Record<string, unknown>
      rawFinding(invalid).assertion = assertion
      expect(() => parseAuditManifest(invalid)).toThrow()
    }
  })

  it('accepts every approved assertion branch only with its matching finding class', () => {
    const cases = [
      ['broken-image', {version: 1, kind: 'image-load', expected: 'loaded'}],
      ['visibility', {version: 1, kind: 'visibility', expected: 'visible'}],
      ['layout', {version: 1, kind: 'viewport-containment', edges: 'all'}],
      ['overflow', {version: 1, kind: 'viewport-overflow', axis: 'both'}],
      ['layout', {version: 1, kind: 'geometry', property: 'width', operator: 'at-least', value: 10}],
      ['layout', {version: 1, kind: 'no-overlap', otherTarget: {kind: 'test-id', value: 'other'}}],
      ['hit-target', {version: 1, kind: 'minimum-size', width: 44, height: 44}],
      ['content', {version: 1, kind: 'text', operator: 'contains', value: 'Project'}],
    ] as const
    for (const [findingClass, assertion] of cases) {
      const manifest = structuredClone(validManifest()) as unknown as Record<string, unknown>
      const finding = rawFinding(manifest)
      finding.findingClass = findingClass
      finding.assertion = assertion
      expect(parseAuditManifest(manifest).findings[0]?.assertion).toEqual(assertion)
    }
    for (const [findingClass, assertion] of cases) {
      const manifest = structuredClone(validManifest()) as unknown as Record<string, unknown>
      const finding = rawFinding(manifest)
      finding.findingClass = findingClass === 'layout' ? 'content' : 'layout'
      finding.assertion = assertion
      expect(() => parseAuditManifest(manifest)).toThrow(/class|assertion/)
    }
  })

  it('accepts clean and infrastructure validation replay branches', () => {
    const clean = validCleanValidation()
    const {evidence: _evidence, ...validationWithoutEvidence} = validCleanValidation()
    const infrastructureError = {
      ...validationWithoutEvidence,
      status: 'infrastructure-error',
      diagnostic: 'Browser timed out',
    }
    expect(
      parseAuditManifest({...validManifest(), validations: [clean, infrastructureError]}).validations,
    ).toHaveLength(2)
    for (const invalid of [
      {...clean, evidence: undefined},
      {...infrastructureError, evidence: clean.evidence},
      {...clean, issueNumber: 0},
      {...clean, path: '../unsafe.png'},
      {...infrastructureError, diagnostic: 'bad\u0000diagnostic'},
      {...clean, unexpected: true},
    ]) {
      expect(() => parseAuditManifest({...validManifest(), validations: [invalid]})).toThrow()
    }
  })

  it('rejects validation identity keys that do not match their replay inputs', () => {
    const wrongFingerprint = validCleanValidation()
    wrongFingerprint.fingerprint = 'cccccccccccccccccccccccccccccccc'
    const wrongVariantKey = validCleanValidation()
    wrongVariantKey.variantKey = 'cccccccccccccccccccccccccccccccc'
    const unsafeState = validCleanValidation()
    unsafeState.variant = {...unsafeState.variant, state: 'bad\u0000state'}
    expect(() => parseAuditManifest({...validManifest(), validations: [wrongFingerprint]})).toThrow()
    expect(() => parseAuditManifest({...validManifest(), validations: [wrongVariantKey]})).toThrow()
    expect(() => parseAuditManifest({...validManifest(), validations: [unsafeState]})).toThrow()
  })

  it('discriminates scheduled and manual run metadata', () => {
    const scheduled = validManifest()
    expect(parseAuditManifest(scheduled).runKind).toBe('scheduled')
    const manual = {
      version: 1,
      runId: 'manual-1',
      generatedAt: '2026-07-20T03:30:00.000Z',
      runKind: 'manual',
      issueNumber: 204,
      findings: [],
      validations: [],
    }
    expect(parseAuditManifest(manual).runKind).toBe('manual')
    expect(() => parseAuditManifest({...manual, rotatingPresetId: 'dracula'})).toThrow()
    expect(() => parseAuditManifest({...scheduled, issueNumber: 204})).toThrow()
    const {rotatingPresetId: _rotatingPresetId, ...scheduledWithoutPreset} = scheduled
    expect(() => parseAuditManifest(scheduledWithoutPreset)).toThrow()
    const {issueNumber: _issueNumber, ...manualWithoutIssue} = manual
    expect(() => parseAuditManifest(manualWithoutIssue)).toThrow()
  })

  it.each(['not-applicable', 'required', 'uncertain'] as const)('accepts responsive classification %s', responsive => {
    const manifest = structuredClone(validManifest())
    firstFinding(manifest).responsive = responsive
    if (responsive === 'not-applicable')
      delete (firstFinding(manifest) as unknown as Record<string, unknown>).counterpart
    expect(firstFinding(parseAuditManifest(manifest)).responsive).toBe(responsive)
  })

  it('requires a counterpart for required and uncertain responsive findings', () => {
    for (const responsive of ['required', 'uncertain'] as const) {
      const manifest = structuredClone(validManifest())
      firstFinding(manifest).responsive = responsive
      delete (firstFinding(manifest) as unknown as Record<string, unknown>).counterpart
      expect(() => parseAuditManifest(manifest)).toThrow()
    }
  })

  it('accepts clean and failure counterpart results for a required finding', () => {
    for (const result of [responsiveCounterpart('clean'), responsiveCounterpart('failure')]) {
      const manifest = withCounterpart(validManifest(), result) as Record<string, unknown>
      const finding = rawFinding(manifest)
      finding.responsive = 'required'
      expect(parseAuditManifest(manifest).findings[0]).toMatchObject({counterpart: result})
    }
  })

  it('rejects a counterpart failure whose identity differs from the primary', () => {
    const manifest = withCounterpart(validManifest(), {
      ...responsiveCounterpart('failure'),
      result: {
        status: 'failure',
        failureSignature: 'different failure',
        observedAt: '2026-07-20T03:31:00.000Z',
      },
    }) as Record<string, unknown>
    rawFinding(manifest).responsive = 'required'
    expect(() => parseAuditManifest(manifest)).toThrow(/signature|disagrees/)
  })

  it('rejects counterpart evidence for not-applicable findings', () => {
    const manifest = withCounterpart(validManifest(), responsiveCounterpart()) as Record<string, unknown>
    rawFinding(manifest).responsive = 'not-applicable'
    expect(() => parseAuditManifest(manifest)).toThrow()
  })

  it('requires an opposite viewport and matching theme and state for counterpart evidence', () => {
    for (const variant of [
      {viewport: 'mobile', theme: {kind: 'preset', presetId: 'dracula'}, state: 'default'},
      {viewport: 'desktop', theme: {kind: 'preset', presetId: 'nord'}, state: 'default'},
      {viewport: 'desktop', theme: {kind: 'preset', presetId: 'dracula'}, state: 'expanded'},
    ]) {
      const manifest = withCounterpart(validManifest(), {...responsiveCounterpart(), variant}) as Record<
        string,
        unknown
      >
      rawFinding(manifest).responsive = 'required'
      expect(() => parseAuditManifest(manifest)).toThrow()
    }
  })

  it('rejects malformed counterpart target, result, evidence, dates, and unknown keys', () => {
    const invalidCounterparts = [
      {...responsiveCounterpart(), target: {kind: 'css', value: '.secret'}},
      {...responsiveCounterpart(), result: {status: 'failure', observedAt: '2026-07-20T03:31:00.000Z'}},
      {
        ...responsiveCounterpart(),
        result: {...responsiveCounterpart('failure').result, failureSignature: 'bad\u0000signature'},
      },
      {
        ...responsiveCounterpart(),
        result: {status: 'clean', failureSignature: 'impossible', observedAt: '2026-07-20T03:31:00.000Z'},
      },
      {...responsiveCounterpart(), result: {status: 'clean', observedAt: 'not-a-date'}},
      {
        ...responsiveCounterpart(),
        evidence: [responsiveCounterpart().evidence[0], {...responsiveCounterpart().evidence[1], role: 'context'}],
      },
      {...responsiveCounterpart(), unexpected: true},
    ]
    for (const counterpart of invalidCounterparts) {
      const manifest = withCounterpart(validManifest(), counterpart) as Record<string, unknown>
      rawFinding(manifest).responsive = 'required'
      expect(() => parseAuditManifest(manifest)).toThrow()
    }
  })

  it.each([
    ['unknown version', {...validManifest(), version: 99}],
    [
      'invalid viewport',
      {
        ...validManifest(),
        findings: [
          {
            ...firstFinding(validManifest()),
            variant: {viewport: 'wide', theme: {kind: 'mode', mode: 'dark'}, state: 'default'},
          },
        ],
      },
    ],
    ['extra executable field', {...validManifest(), execute: 'alert(1)'}],
    [
      'missing replay',
      {...validManifest(), findings: [{...firstFinding(validManifest()), observations: [observation()]}]},
    ],
  ])('rejects %s', (_name, input) => {
    expect(() => parseAuditManifest(input)).toThrow()
  })

  it('rejects unsafe paths, foreign routes, and unsupported targets', () => {
    const finding = firstFinding(validManifest())
    expect(() =>
      parseAuditManifest({...validManifest(), findings: [{...finding, route: 'https://evil.example'}]}),
    ).toThrow()
    expect(() =>
      parseAuditManifest({
        ...validManifest(),
        findings: [{...finding, evidence: [{...finding.evidence[0], path: '../secret.png'}, finding.evidence[1]]}],
      }),
    ).toThrow()
    expect(() =>
      parseAuditManifest({...validManifest(), findings: [{...finding, target: {kind: 'css', value: '.secret'}}]}),
    ).toThrow()
  })

  it('requires two matching failure observations and canonical context/crop roles', () => {
    const finding = firstFinding(validManifest())
    expect(finding.observations[0].signature).toBe(finding.observations[1].signature)
    expect(() =>
      parseAuditManifest({
        ...validManifest(),
        findings: [{...finding, evidence: [finding.evidence[0], {...finding.evidence[1], role: 'context'}]}],
      }),
    ).toThrow()
  })

  it('keeps the finding-count boundary and accepts every canonical preset', () => {
    expect(() =>
      parseAuditManifest({
        ...validManifest(),
        findings: Array.from({length: 101}, () => firstFinding(validManifest())),
      }),
    ).toThrow()
    for (const preset of presetThemes) {
      const manifest = structuredClone(validManifest())
      manifest.rotatingPresetId = preset.id as AuditManifest['rotatingPresetId']
      expect(parseAuditManifest(manifest).rotatingPresetId).toBe(preset.id)
    }
    const unknown = structuredClone(validManifest())
    ;(unknown as unknown as {rotatingPresetId: string}).rotatingPresetId = 'not-a-canonical-preset'
    expect(() => parseAuditManifest(unknown)).toThrow()
  })

  it.each([
    [
      'run ID',
      (manifest: AuditManifest) => {
        manifest.runId = 'bad\u0000id'
      },
    ],
    [
      'semantic target',
      (manifest: AuditManifest) => {
        firstFinding(manifest).semanticTarget = '  \u0000  '
      },
    ],
    [
      'variant state',
      (manifest: AuditManifest) => {
        firstFinding(manifest).variant.state = '  \u0000  '
      },
    ],
    [
      'observation signature',
      (manifest: AuditManifest) => {
        firstFinding(manifest).observations[1].signature = '  \u0000  '
      },
    ],
    [
      'reproduction text',
      (manifest: AuditManifest) => {
        firstFinding(manifest).reproduction[0] = '  \u0000  '
      },
    ],
    [
      'evidence text',
      (manifest: AuditManifest) => {
        firstFinding(manifest).evidence[0].alt = '  \u0000  '
      },
    ],
  ])('rejects controls or empty-after-cleaning in %s', (_name, mutate) => {
    const manifest = structuredClone(validManifest())
    mutate(manifest)
    expect(() => parseAuditManifest(manifest)).toThrow()
  })

  it('accepts each closed target descriptor and rejects unsafe or ambiguous values', () => {
    const targets: Finding['target'][] = [
      {kind: 'role', role: 'img', name: 'Project image'},
      {kind: 'text', value: 'Project image'},
      {kind: 'test-id', value: 'project-card-1'},
      {kind: 'region', x: 0, y: 0, width: 100, height: 100},
    ]
    for (const target of targets) {
      const manifest = structuredClone(validManifest())
      firstFinding(manifest).target = target
      expect(firstFinding(parseAuditManifest(manifest)).target).toEqual(target)
    }
    for (const target of [
      {kind: 'role', role: '  ', name: 'image'},
      {kind: 'text', value: '  '},
      {kind: 'test-id', value: 'button[onclick]'},
      {kind: 'region', x: 0, y: 0, width: 0, height: 100},
      {kind: 'role', role: 'img', name: 'bad\u0000name'},
    ]) {
      const manifest = structuredClone(validManifest())
      firstFinding(manifest).target = target as Finding['target']
      expect(() => parseAuditManifest(manifest)).toThrow()
    }
  })

  it('requires exactly one context and crop with safe relative paths', () => {
    for (const evidence of [
      [
        {...firstFinding(validManifest()).evidence[0], role: 'crop'},
        {...firstFinding(validManifest()).evidence[1], role: 'crop'},
      ],
      [
        {...firstFinding(validManifest()).evidence[0], path: '/absolute.png'},
        firstFinding(validManifest()).evidence[1],
      ],
      [
        {...firstFinding(validManifest()).evidence[0], path: String.raw`screens\crop.png`},
        firstFinding(validManifest()).evidence[1],
      ],
      [
        {...firstFinding(validManifest()).evidence[0], path: 'runner/tmp.png'},
        firstFinding(validManifest()).evidence[1],
      ],
    ]) {
      const manifest = structuredClone(validManifest())
      firstFinding(manifest).evidence = evidence as Finding['evidence']
      expect(() => parseAuditManifest(manifest)).toThrow()
    }
  })

  it('requires canonical integrity metadata for every evidence reference', () => {
    const manifest = structuredClone(validManifest())
    delete (manifest.findings[0]?.evidence[0] as unknown as Record<string, unknown>).integrity
    expect(() => parseAuditManifest(manifest)).toThrow(/integrity/)
  })

  it('rejects unknown, mismatched, and duplicate integrity entries', () => {
    const unknown = structuredClone(validManifest())
    ;(unknown.findings[0]?.evidence[0].integrity as unknown as Record<string, unknown>).unexpected = true
    expect(() => parseAuditManifest(unknown)).toThrow()

    const mismatched = structuredClone(validManifest())
    firstFinding(mismatched).evidence[0].integrity.path = 'other.png'
    expect(() => parseAuditManifest(mismatched)).toThrow(/integrity|match/)

    const duplicate = structuredClone(validManifest())
    const duplicateFinding = firstFinding(duplicate)
    const first = duplicateFinding.evidence[0]
    duplicateFinding.evidence[1].path = first.path
    duplicateFinding.evidence[1].integrity.path = first.path
    expect(() => parseAuditManifest(duplicate)).toThrow(/duplicated/)
  })

  it('rejects clean or infrastructure disagreement for a confirmed failure', () => {
    for (const status of ['clean', 'infrastructure-error'] as const) {
      const manifest = structuredClone(validManifest())
      firstFinding(manifest).observations[1].status = status
      expect(() => parseAuditManifest(manifest)).toThrow()
    }
    const mismatch = structuredClone(validManifest())
    firstFinding(mismatch).observations[1].signature = 'different failure'
    expect(() => parseAuditManifest(mismatch)).toThrow()
  })

  it('accepts mode and preset theme selections but rejects mixed selections', () => {
    for (const theme of [
      {kind: 'mode', mode: 'light'},
      {kind: 'mode', mode: 'dark'},
      {kind: 'preset', presetId: 'dracula'},
    ] as const) {
      const manifest = structuredClone(validManifest())
      const finding = firstFinding(manifest)
      finding.variant.theme = theme
      if (finding.responsive !== 'not-applicable') finding.counterpart.variant.theme = theme
      expect(parseAuditManifest(manifest)).toBeTruthy()
    }
    const mixed = structuredClone(validManifest())
    ;(firstFinding(mixed).variant as unknown as Record<string, unknown>).theme = {
      kind: 'mode',
      mode: 'dark',
      presetId: 'dracula',
    }
    expect(() => parseAuditManifest(mixed)).toThrow()
  })
})
