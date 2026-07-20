import {describe, expect, it} from 'vitest'

import {parseAuditManifest, type AuditManifest, type Finding} from '../../scripts/live-audit/contract'
import {findingFingerprint, variantKey} from '../../scripts/live-audit/identity'
import {presetThemes} from '../../src/utils/preset-themes'

const observation = (signature = 'broken image'): Finding['observations'][number] => ({
  kind: 'candidate',
  status: 'failure',
  signature,
  observedAt: '2026-07-20T03:30:00.000Z',
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
      failureSignature: 'broken image',
      description: 'The project image is broken.',
      reproduction: ['Open projects'],
      variant: {viewport: 'mobile', theme: {kind: 'preset', presetId: 'dracula'}, state: 'default'},
      observations: [observation(), {...observation(), kind: 'replay'}],
      evidence: [
        {role: 'context', path: 'screenshots/context.png', alt: 'Project context', caption: 'Context'},
        {role: 'crop', path: 'screenshots/crop.png', alt: 'Project crop', caption: 'Crop'},
      ],
    },
  ],
})

const firstFinding = (manifest: AuditManifest): Finding => {
  const finding = manifest.findings.at(0)
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
  observedAt: '2026-07-20T03:30:00.000Z',
  evidence: [
    {role: 'context' as const, path: 'validations/context.png', alt: 'Validation context', caption: 'Context'},
    {role: 'crop' as const, path: 'validations/crop.png', alt: 'Validation crop', caption: 'Crop'},
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
    expect(firstFinding(parseAuditManifest(manifest)).responsive).toBe(responsive)
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
      firstFinding(manifest).variant.theme = theme
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
