import Ajv from 'ajv'
import addFormats from 'ajv-formats'

import {presetThemes} from '../../src/utils/preset-themes'
import {findingFingerprint, normalizeIdentityText, variantKey} from './identity'

export const AUDIT_CONTRACT_VERSION = 1
export const AUDIT_ROUTES = ['/', '/about', '/projects', '/blog'] as const
export const AUDIT_VIEWPORTS = ['desktop', 'mobile'] as const
export const AUDIT_THEMES = ['light', 'dark'] as const
export const AUDIT_PRESET_IDS = [
  'material-light',
  'material-dark',
  'dracula',
  'nord',
  'solarized-light',
  'solarized-dark',
  'github-light',
  'github-dark',
  'monokai',
  'one-dark-pro',
  'catppuccin-mocha',
  'tokyo-night',
] as const
export const MAX_AUDIT_TEXT = 2_000
export const MAX_AUDIT_FINDINGS = 100

export type AuditRoute = (typeof AUDIT_ROUTES)[number]
export type AuditViewport = (typeof AUDIT_VIEWPORTS)[number]
export type AuditTheme = (typeof AUDIT_THEMES)[number]
export type AuditPresetId = (typeof AUDIT_PRESET_IDS)[number]
export type AuditThemeSelection = {kind: 'mode'; mode: AuditTheme} | {kind: 'preset'; presetId: AuditPresetId}
export const isAuditRoute = (value: string): value is AuditRoute => (AUDIT_ROUTES as readonly string[]).includes(value)
export const isAuditPresetId = (value: string): value is AuditPresetId =>
  (AUDIT_PRESET_IDS as readonly string[]).includes(value) && presetThemes.some(theme => theme.id === value)
export type FindingClass = 'broken-image' | 'layout' | 'overflow' | 'visibility' | 'hit-target' | 'content'
export type TargetDescriptor =
  | {kind: 'role'; role: string; name: string}
  | {kind: 'text'; value: string}
  | {kind: 'test-id'; value: string}
  | {kind: 'region'; x: number; y: number; width: number; height: number}

export interface AuditVariant {
  viewport: AuditViewport
  theme: AuditThemeSelection
  state: string
}

export interface AuditObservation {
  kind: 'candidate' | 'replay'
  status: 'failure' | 'clean' | 'infrastructure-error'
  signature: string
  observedAt: string
}

export interface EvidenceReference {
  role: 'context' | 'crop'
  path: string
  alt: string
  caption: string
}

export type ResponsiveCounterpartResult =
  {status: 'clean'; observedAt: string} | {status: 'failure'; failureSignature: string; observedAt: string}

export interface ResponsiveCounterpart {
  variant: AuditVariant
  target: TargetDescriptor
  result: ResponsiveCounterpartResult
  evidence: [EvidenceReference, EvidenceReference]
}

interface FindingFields {
  route: AuditRoute
  findingClass: FindingClass
  semanticTarget: string
  target: TargetDescriptor
  failureSignature: string
  description: string
  reproduction: string[]
  variant: AuditVariant
  observations: [AuditObservation, AuditObservation]
  evidence: [EvidenceReference, EvidenceReference]
}

export type Finding = FindingFields &
  (
    | {responsive: 'not-applicable'; counterpart?: never}
    | {responsive: 'required' | 'uncertain'; counterpart: ResponsiveCounterpart}
  )

interface ManifestCommon {
  version: typeof AUDIT_CONTRACT_VERSION
  runId: string
  generatedAt: string
  findings: Finding[]
  validations: ValidationReplay[]
}

export interface ScheduledManifest extends ManifestCommon {
  runKind: 'scheduled'
  rotatingPresetId: AuditPresetId
  issueNumber?: never
}

export interface ManualManifest extends ManifestCommon {
  runKind: 'manual'
  issueNumber: number
  rotatingPresetId?: never
}

export type AuditManifest = ScheduledManifest | ManualManifest

interface ValidationIdentity {
  issueNumber: number
  fingerprint: string
  variantKey: string
  route: AuditRoute
  semanticTarget: string
  findingClass: FindingClass
  failureSignature: string
  variant: AuditVariant
  target: TargetDescriptor
  observedAt: string
}

export interface ValidationClean extends ValidationIdentity {
  status: 'clean'
  evidence: [EvidenceReference, EvidenceReference]
}

export interface ValidationInfrastructureError extends ValidationIdentity {
  status: 'infrastructure-error'
  diagnostic: string
}

export type ValidationReplay = ValidationClean | ValidationInfrastructureError

export class AuditContractError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuditContractError'
  }
}

const targetSchema = {
  oneOf: [
    {
      type: 'object',
      properties: {
        kind: {const: 'role'},
        role: {type: 'string', pattern: '^[A-Za-z][A-Za-z0-9_-]{0,49}$'},
        name: {type: 'string', minLength: 1, maxLength: MAX_AUDIT_TEXT},
      },
      required: ['kind', 'role', 'name'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {kind: {const: 'text'}, value: {type: 'string', minLength: 1, maxLength: 200}},
      required: ['kind', 'value'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {kind: {const: 'test-id'}, value: {type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$'}},
      required: ['kind', 'value'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        kind: {const: 'region'},
        x: {type: 'number', minimum: 0, maximum: 10000},
        y: {type: 'number', minimum: 0, maximum: 10000},
        width: {type: 'number', exclusiveMinimum: 0, maximum: 10000},
        height: {type: 'number', exclusiveMinimum: 0, maximum: 10000},
      },
      required: ['kind', 'x', 'y', 'width', 'height'],
      additionalProperties: false,
    },
  ],
}

const themeSelectionSchema = {
  oneOf: [
    {
      type: 'object',
      properties: {kind: {const: 'mode'}, mode: {enum: [...AUDIT_THEMES]}},
      required: ['kind', 'mode'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {kind: {const: 'preset'}, presetId: {enum: [...AUDIT_PRESET_IDS]}},
      required: ['kind', 'presetId'],
      additionalProperties: false,
    },
  ],
}

const validationIdentityProperties = {
  issueNumber: {type: 'integer', minimum: 1, maximum: 2_000_000_000},
  fingerprint: {type: 'string', pattern: '^[a-f0-9]{32}$'},
  variantKey: {type: 'string', pattern: '^[a-f0-9]{32}$'},
  route: {enum: [...AUDIT_ROUTES]},
  semanticTarget: {type: 'string', minLength: 1, maxLength: 200},
  findingClass: {enum: ['broken-image', 'layout', 'overflow', 'visibility', 'hit-target', 'content']},
  failureSignature: {type: 'string', minLength: 1, maxLength: MAX_AUDIT_TEXT},
  variant: {
    type: 'object',
    additionalProperties: false,
    properties: {
      viewport: {enum: [...AUDIT_VIEWPORTS]},
      theme: themeSelectionSchema,
      state: {type: 'string', minLength: 1, maxLength: 200},
    },
    required: ['viewport', 'theme', 'state'],
  },
  target: targetSchema,
  observedAt: {type: 'string', format: 'date-time'},
}
const validationEvidenceSchema = {
  type: 'array',
  minItems: 2,
  maxItems: 2,
  items: {
    type: 'object',
    additionalProperties: false,
    properties: {
      role: {enum: ['context', 'crop']},
      path: {type: 'string', minLength: 1, maxLength: 500},
      alt: {type: 'string', minLength: 1, maxLength: MAX_AUDIT_TEXT},
      caption: {type: 'string', minLength: 1, maxLength: MAX_AUDIT_TEXT},
    },
    required: ['role', 'path', 'alt', 'caption'],
  },
}
const responsiveCounterpartResultSchema = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      properties: {status: {const: 'clean'}, observedAt: {type: 'string', format: 'date-time'}},
      required: ['status', 'observedAt'],
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        status: {const: 'failure'},
        failureSignature: {type: 'string', minLength: 1, maxLength: MAX_AUDIT_TEXT},
        observedAt: {type: 'string', format: 'date-time'},
      },
      required: ['status', 'failureSignature', 'observedAt'],
    },
  ],
}
const responsiveCounterpartSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    variant: {
      type: 'object',
      additionalProperties: false,
      properties: {
        viewport: {enum: [...AUDIT_VIEWPORTS]},
        theme: themeSelectionSchema,
        state: {type: 'string', minLength: 1, maxLength: 200},
      },
      required: ['viewport', 'theme', 'state'],
    },
    target: targetSchema,
    result: responsiveCounterpartResultSchema,
    evidence: validationEvidenceSchema,
  },
  required: ['variant', 'target', 'result', 'evidence'],
}
const validationSchema = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      properties: {...validationIdentityProperties, status: {const: 'clean'}, evidence: validationEvidenceSchema},
      required: [...Object.keys(validationIdentityProperties), 'status', 'evidence'],
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        ...validationIdentityProperties,
        status: {const: 'infrastructure-error'},
        diagnostic: {type: 'string', minLength: 1, maxLength: 500},
      },
      required: [...Object.keys(validationIdentityProperties), 'status', 'diagnostic'],
    },
  ],
}

const schema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    version: {const: AUDIT_CONTRACT_VERSION},
    runId: {type: 'string', minLength: 1, maxLength: 200},
    generatedAt: {type: 'string', format: 'date-time'},
    runKind: {enum: ['scheduled', 'manual']},
    rotatingPresetId: {enum: [...AUDIT_PRESET_IDS]},
    issueNumber: {type: 'integer', minimum: 1, maximum: 2_000_000_000},
    validations: {type: 'array', maxItems: MAX_AUDIT_FINDINGS, items: validationSchema},
    findings: {
      type: 'array',
      maxItems: MAX_AUDIT_FINDINGS,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          route: {enum: [...AUDIT_ROUTES]},
          findingClass: {enum: ['broken-image', 'layout', 'overflow', 'visibility', 'hit-target', 'content']},
          responsive: {enum: ['not-applicable', 'required', 'uncertain']},
          semanticTarget: {type: 'string', minLength: 1, maxLength: 200},
          target: targetSchema,
          failureSignature: {type: 'string', minLength: 1, maxLength: MAX_AUDIT_TEXT},
          description: {type: 'string', minLength: 1, maxLength: MAX_AUDIT_TEXT},
          reproduction: {
            type: 'array',
            minItems: 1,
            maxItems: 20,
            items: {type: 'string', minLength: 1, maxLength: 500},
          },
          variant: {
            type: 'object',
            additionalProperties: false,
            properties: {
              viewport: {enum: [...AUDIT_VIEWPORTS]},
              theme: themeSelectionSchema,
              state: {type: 'string', minLength: 1, maxLength: 200},
            },
            required: ['viewport', 'theme', 'state'],
          },
          observations: {
            type: 'array',
            minItems: 2,
            maxItems: 2,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                kind: {enum: ['candidate', 'replay']},
                status: {enum: ['failure', 'clean', 'infrastructure-error']},
                signature: {type: 'string', minLength: 1, maxLength: MAX_AUDIT_TEXT},
                observedAt: {type: 'string', format: 'date-time'},
              },
              required: ['kind', 'status', 'signature', 'observedAt'],
            },
          },
          evidence: {
            type: 'array',
            minItems: 2,
            maxItems: 2,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                role: {enum: ['context', 'crop']},
                path: {type: 'string', minLength: 1, maxLength: 500},
                alt: {type: 'string', minLength: 1, maxLength: MAX_AUDIT_TEXT},
                caption: {type: 'string', minLength: 1, maxLength: MAX_AUDIT_TEXT},
              },
              required: ['role', 'path', 'alt', 'caption'],
            },
          },
          counterpart: responsiveCounterpartSchema,
        },
        required: [
          'route',
          'findingClass',
          'responsive',
          'semanticTarget',
          'target',
          'failureSignature',
          'description',
          'reproduction',
          'variant',
          'observations',
          'evidence',
        ],
        oneOf: [
          {
            properties: {responsive: {const: 'not-applicable'}, counterpart: false},
          },
          {
            properties: {responsive: {enum: ['required', 'uncertain']}, counterpart: responsiveCounterpartSchema},
            required: ['counterpart'],
          },
        ],
      },
    },
  },
  required: ['version', 'runId', 'generatedAt', 'runKind', 'findings', 'validations'],
}

const ajv = new Ajv({allErrors: true, strict: true, coerceTypes: false, removeAdditional: false, useDefaults: false})
addFormats(ajv)
const validate = ajv.compile(schema)
const validateTarget = ajv.compile(targetSchema)
const validateThemeSelection = ajv.compile(themeSelectionSchema)

const cleanText = (value: string): string =>
  [...value]
    .filter(character => {
      const code = character.codePointAt(0) ?? 0
      return code > 0x1f && code !== 0x7f
    })
    .join('')
    .trim()
const hasSafeText = (value: string, maxLength = MAX_AUDIT_TEXT): boolean =>
  value.length <= maxLength && cleanText(value) === value && cleanText(value).length > 0
const isIdentityKey = (value: string): boolean => /^[a-f0-9]{32}$/.test(value)
const isSafeRelativePath = (value: string): boolean => {
  if (value.startsWith('/') || value.includes('\\') || value.split('/').includes('..')) return false
  return !/(?:^|\/)(?:tmp|temp|runner|home|var)(?:\/|$)/i.test(value)
}
const validateEvidencePair = (evidence: [EvidenceReference, EvidenceReference]): void => {
  if (
    evidence
      .map(item => item.role)
      .sort()
      .join(',') !== 'context,crop'
  )
    throw new AuditContractError('evidence requires one context and one crop')
  if (evidence.some(item => !isSafeRelativePath(item.path)))
    throw new AuditContractError('evidence path is not safely contained')
  const textValues = evidence.flatMap(item => [item.path, item.alt, item.caption])
  if (textValues.some(value => !hasSafeText(value)))
    throw new AuditContractError('evidence contains unsafe or empty text')
}
const sameTheme = (left: AuditThemeSelection, right: AuditThemeSelection): boolean =>
  left.kind === right.kind &&
  (left.kind === 'mode'
    ? left.mode === (right as {kind: 'mode'; mode: AuditTheme}).mode
    : left.presetId === (right as {kind: 'preset'; presetId: AuditPresetId}).presetId)

export const parseTargetDescriptor = (input: unknown): TargetDescriptor => {
  if (!validateTarget(input))
    throw new AuditContractError(`invalid target descriptor: ${ajv.errorsText(validateTarget.errors)}`)
  const target = input as unknown as TargetDescriptor
  if (target.kind === 'region') {
    if (![target.x, target.y, target.width, target.height].every(Number.isFinite))
      throw new AuditContractError('invalid target region')
    return target
  }
  const values = target.kind === 'role' ? [target.role, target.name] : [target.value]
  if (values.some(value => !hasSafeText(value, 500)))
    throw new AuditContractError('target contains unsafe or empty text')
  return target
}

export const parseThemeSelection = (input: unknown): AuditThemeSelection => {
  if (!validateThemeSelection(input))
    throw new AuditContractError(`invalid theme selection: ${ajv.errorsText(validateThemeSelection.errors)}`)
  const selection = input as unknown as AuditThemeSelection
  if (selection.kind === 'preset' && !isAuditPresetId(selection.presetId))
    throw new AuditContractError('unknown theme preset')
  return selection
}

const validateResponsiveCounterpart = (finding: Finding): void => {
  if (finding.responsive === 'not-applicable') return
  const counterpart = finding.counterpart
  if (counterpart.variant.viewport === finding.variant.viewport)
    throw new AuditContractError('responsive counterpart must use the opposite viewport')
  if (
    !sameTheme(counterpart.variant.theme, finding.variant.theme) ||
    counterpart.variant.state !== finding.variant.state
  )
    throw new AuditContractError('responsive counterpart must preserve theme and state')
  if (!hasSafeText(counterpart.variant.state, 200)) throw new AuditContractError('invalid responsive counterpart state')
  parseThemeSelection(counterpart.variant.theme)
  parseTargetDescriptor(counterpart.target)
  validateEvidencePair(counterpart.evidence)
  if (counterpart.result.status === 'failure' && !hasSafeText(counterpart.result.failureSignature))
    throw new AuditContractError('invalid responsive counterpart failure signature')
}

const semanticValidate = (manifest: AuditManifest): void => {
  if (!hasSafeText(manifest.runId, 200)) throw new AuditContractError('run ID contains unsafe or empty text')
  for (const finding of manifest.findings) {
    if (finding.observations[0].kind === finding.observations[1].kind)
      throw new AuditContractError('observations must contain candidate and replay')
    if (finding.observations.some(observation => observation.status !== 'failure'))
      throw new AuditContractError('confirmed findings require failure observations')
    if (
      normalizeIdentityText(finding.failureSignature) !== normalizeIdentityText(finding.observations[0].signature) ||
      normalizeIdentityText(finding.observations[0].signature) !==
        normalizeIdentityText(finding.observations[1].signature)
    )
      throw new AuditContractError('observations have mismatched signatures')
    validateEvidencePair(finding.evidence)
    validateResponsiveCounterpart(finding)
    if (!hasSafeText(finding.semanticTarget, 200))
      throw new AuditContractError('semantic target contains unsafe or empty text')
    const textValues = [
      finding.semanticTarget,
      finding.failureSignature,
      finding.description,
      ...finding.reproduction,
      finding.variant.state,
      ...finding.evidence.flatMap(item => [item.path, item.alt, item.caption]),
    ]
    if (textValues.some(value => !hasSafeText(value)))
      throw new AuditContractError('metadata contains unsafe or empty text')
    parseThemeSelection(finding.variant.theme)
    parseTargetDescriptor(finding.target)
  }
  if (manifest.runKind === 'scheduled') {
    if (!isAuditPresetId(manifest.rotatingPresetId) || manifest.issueNumber !== undefined)
      throw new AuditContractError('invalid scheduled manifest metadata')
  } else if (
    !Number.isInteger(manifest.issueNumber) ||
    manifest.issueNumber < 1 ||
    manifest.rotatingPresetId !== undefined
  ) {
    throw new AuditContractError('invalid manual manifest metadata')
  }
  for (const validation of manifest.validations) {
    if (
      !Number.isInteger(validation.issueNumber) ||
      validation.issueNumber < 1 ||
      !isIdentityKey(validation.fingerprint) ||
      !isIdentityKey(validation.variantKey)
    )
      throw new AuditContractError('invalid validation identity')
    if (!hasSafeText(validation.semanticTarget, 200) || !hasSafeText(validation.failureSignature))
      throw new AuditContractError('invalid validation identity text')
    if (
      validation.fingerprint !==
      findingFingerprint({
        route: validation.route,
        semanticTarget: validation.semanticTarget,
        failureSignature: validation.failureSignature,
      })
    )
      throw new AuditContractError('validation fingerprint does not match replay identity')
    if (validation.variantKey !== variantKey(validation.variant))
      throw new AuditContractError('validation variant key does not match replay variant')
    if (!hasSafeText(validation.variant.state, 200)) throw new AuditContractError('invalid validation variant state')
    parseThemeSelection(validation.variant.theme)
    parseTargetDescriptor(validation.target)
    if (validation.status === 'clean') validateEvidencePair(validation.evidence)
    else if (!hasSafeText(validation.diagnostic, 500)) throw new AuditContractError('invalid validation diagnostic')
  }
}

/** Parses untrusted JSON-shaped input into the closed live-audit domain contract. */
export const parseAuditManifest = (input: unknown): AuditManifest => {
  if (!validate(input)) throw new AuditContractError(`invalid audit manifest: ${ajv.errorsText(validate.errors)}`)
  const manifest = input as unknown as AuditManifest
  semanticValidate(manifest)
  return manifest
}
