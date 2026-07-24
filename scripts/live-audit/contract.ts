import Ajv from 'ajv'
import addFormats from 'ajv-formats'

import {presetThemes} from '../../src/utils/preset-themes'
import {findingFingerprint, normalizeIdentityText, variantKey} from './identity'

export const AUDIT_CONTRACT_VERSION = 1
export const AUDIT_ASSERTION_VERSION = 1
export const AUDIT_ACTION_VERSION = 1
export const MAX_AUDIT_ACTIONS = 20
export const MAX_AUDIT_ACTION_TIMEOUT_MS = 30_000
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

export type AuditAssertion =
  | {version: typeof AUDIT_ASSERTION_VERSION; kind: 'image-load'; expected: 'loaded'}
  | {version: typeof AUDIT_ASSERTION_VERSION; kind: 'visibility'; expected: 'visible'}
  | {version: typeof AUDIT_ASSERTION_VERSION; kind: 'viewport-containment'; edges: 'all'}
  | {version: typeof AUDIT_ASSERTION_VERSION; kind: 'viewport-overflow'; axis: 'horizontal' | 'vertical' | 'both'}
  | {
      version: typeof AUDIT_ASSERTION_VERSION
      kind: 'geometry'
      property: 'width' | 'height' | 'area'
      operator: 'greater-than' | 'at-least'
      value: number
    }
  | {version: typeof AUDIT_ASSERTION_VERSION; kind: 'no-overlap'; otherTarget: TargetDescriptor}
  | {version: typeof AUDIT_ASSERTION_VERSION; kind: 'minimum-size'; width: number; height: number}
  | {version: typeof AUDIT_ASSERTION_VERSION; kind: 'text'; operator: 'equals' | 'contains'; value: string}

export type AuditActionKey =
  'Enter' | 'Space' | 'Escape' | 'Tab' | 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End'
export type AuditAction =
  | {version: typeof AUDIT_ACTION_VERSION; kind: 'click'; target: TargetDescriptor}
  | {version: typeof AUDIT_ACTION_VERSION; kind: 'press'; scope: 'page'; key: AuditActionKey}
  | {
      version: typeof AUDIT_ACTION_VERSION
      kind: 'press'
      scope: 'target'
      key: AuditActionKey
      target: TargetDescriptor
    }
  | {
      version: typeof AUDIT_ACTION_VERSION
      kind: 'wait'
      condition: 'visible' | 'hidden'
      timeoutMs: number
      target: TargetDescriptor
    }

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
  integrity: EvidenceIntegrity
}

export interface EvidenceIntegrity {
  path: string
  sha256: string
  width: number
  height: number
  bytes: number
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
  assertion: AuditAssertion
  actions: AuditAction[]
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
  assertion: AuditAssertion
  actions: AuditAction[]
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

const assertionSchema = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      properties: {version: {const: AUDIT_ASSERTION_VERSION}, kind: {const: 'image-load'}, expected: {const: 'loaded'}},
      required: ['version', 'kind', 'expected'],
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        version: {const: AUDIT_ASSERTION_VERSION},
        kind: {const: 'visibility'},
        expected: {const: 'visible'},
      },
      required: ['version', 'kind', 'expected'],
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        version: {const: AUDIT_ASSERTION_VERSION},
        kind: {const: 'viewport-containment'},
        edges: {const: 'all'},
      },
      required: ['version', 'kind', 'edges'],
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        version: {const: AUDIT_ASSERTION_VERSION},
        kind: {const: 'viewport-overflow'},
        axis: {enum: ['horizontal', 'vertical', 'both']},
      },
      required: ['version', 'kind', 'axis'],
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        version: {const: AUDIT_ASSERTION_VERSION},
        kind: {const: 'geometry'},
        property: {enum: ['width', 'height', 'area']},
        operator: {enum: ['greater-than', 'at-least']},
        value: {type: 'number', exclusiveMinimum: 0, maximum: 10000},
      },
      required: ['version', 'kind', 'property', 'operator', 'value'],
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {version: {const: AUDIT_ASSERTION_VERSION}, kind: {const: 'no-overlap'}, otherTarget: targetSchema},
      required: ['version', 'kind', 'otherTarget'],
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        version: {const: AUDIT_ASSERTION_VERSION},
        kind: {const: 'minimum-size'},
        width: {type: 'number', exclusiveMinimum: 0, maximum: 1000},
        height: {type: 'number', exclusiveMinimum: 0, maximum: 1000},
      },
      required: ['version', 'kind', 'width', 'height'],
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        version: {const: AUDIT_ASSERTION_VERSION},
        kind: {const: 'text'},
        operator: {enum: ['equals', 'contains']},
        value: {type: 'string', minLength: 1, maxLength: MAX_AUDIT_TEXT},
      },
      required: ['version', 'kind', 'operator', 'value'],
    },
  ],
}

const actionKeySchema = {
  enum: ['Enter', 'Space', 'Escape', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'],
}
const actionSchema = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      properties: {version: {const: AUDIT_ACTION_VERSION}, kind: {const: 'click'}, target: targetSchema},
      required: ['version', 'kind', 'target'],
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        version: {const: AUDIT_ACTION_VERSION},
        kind: {const: 'press'},
        scope: {const: 'page'},
        key: actionKeySchema,
      },
      required: ['version', 'kind', 'scope', 'key'],
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        version: {const: AUDIT_ACTION_VERSION},
        kind: {const: 'press'},
        scope: {const: 'target'},
        key: actionKeySchema,
        target: targetSchema,
      },
      required: ['version', 'kind', 'scope', 'key', 'target'],
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        version: {const: AUDIT_ACTION_VERSION},
        kind: {const: 'wait'},
        condition: {enum: ['visible', 'hidden']},
        timeoutMs: {type: 'integer', minimum: 1, maximum: MAX_AUDIT_ACTION_TIMEOUT_MS},
        target: targetSchema,
      },
      required: ['version', 'kind', 'condition', 'timeoutMs', 'target'],
    },
  ],
}
const actionsSchema = {type: 'array', maxItems: MAX_AUDIT_ACTIONS, items: actionSchema}

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

const findingClassEnumSchema = {
  enum: ['broken-image', 'layout', 'overflow', 'visibility', 'hit-target', 'content'],
}
const auditVariantSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    viewport: {enum: [...AUDIT_VIEWPORTS]},
    theme: themeSelectionSchema,
    state: {type: 'string', minLength: 1, maxLength: 200},
  },
  required: ['viewport', 'theme', 'state'],
}
const evidencePairSchema = {
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
      integrity: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: {type: 'string', minLength: 1, maxLength: 500},
          sha256: {type: 'string', pattern: '^[a-f0-9]{64}$'},
          width: {type: 'integer', minimum: 1, maximum: 10000},
          height: {type: 'integer', minimum: 1, maximum: 10000},
          bytes: {type: 'integer', minimum: 1, maximum: 5_000_000},
        },
        required: ['path', 'sha256', 'width', 'height', 'bytes'],
      },
    },
    required: ['role', 'path', 'alt', 'caption', 'integrity'],
  },
}
const validationIdentityProperties = {
  issueNumber: {type: 'integer', minimum: 1, maximum: 2_000_000_000},
  fingerprint: {type: 'string', pattern: '^[a-f0-9]{32}$'},
  variantKey: {type: 'string', pattern: '^[a-f0-9]{32}$'},
  route: {enum: [...AUDIT_ROUTES]},
  semanticTarget: {type: 'string', minLength: 1, maxLength: 200},
  findingClass: findingClassEnumSchema,
  failureSignature: {type: 'string', minLength: 1, maxLength: MAX_AUDIT_TEXT},
  variant: auditVariantSchema,
  target: targetSchema,
  assertion: assertionSchema,
  actions: actionsSchema,
  observedAt: {type: 'string', format: 'date-time'},
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
    variant: auditVariantSchema,
    target: targetSchema,
    result: responsiveCounterpartResultSchema,
    evidence: evidencePairSchema,
  },
  required: ['variant', 'target', 'result', 'evidence'],
}
const validationSchema = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      properties: {...validationIdentityProperties, status: {const: 'clean'}, evidence: evidencePairSchema},
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
          findingClass: findingClassEnumSchema,
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
          variant: auditVariantSchema,
          assertion: assertionSchema,
          actions: actionsSchema,
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
          evidence: evidencePairSchema,
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
          'assertion',
          'actions',
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
const validateAssertion = ajv.compile(assertionSchema)
const validateAction = ajv.compile(actionSchema)

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
  const parts = value.split('/')
  if (
    value.startsWith('/') ||
    value.includes('\\') ||
    parts.some(part => part.length === 0 || part === '.' || part === '..')
  )
    return false
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
  if (evidence.some(item => item.integrity.path !== item.path || !isSafeRelativePath(item.integrity.path)))
    throw new AuditContractError('evidence integrity path does not match the reference')
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

export const parseAuditAssertion = (input: unknown): AuditAssertion => {
  if (!validateAssertion(input))
    throw new AuditContractError(`invalid audit assertion: ${ajv.errorsText(validateAssertion.errors)}`)
  const assertion = input as unknown as AuditAssertion
  if (assertion.kind === 'no-overlap') parseTargetDescriptor(assertion.otherTarget)
  if (assertion.kind === 'text' && !hasSafeText(assertion.value, MAX_AUDIT_TEXT))
    throw new AuditContractError('audit assertion text is unsafe or empty')
  return assertion
}

export const parseAuditAction = (input: unknown): AuditAction => {
  if (!validateAction(input))
    throw new AuditContractError(`invalid audit action: ${ajv.errorsText(validateAction.errors)}`)
  const action = input as unknown as AuditAction
  if (action.kind === 'click' || action.kind === 'wait' || (action.kind === 'press' && action.scope === 'target'))
    parseTargetDescriptor(action.target)
  return action
}

export const parseAuditActions = (input: unknown): AuditAction[] => {
  if (!Array.isArray(input) || input.length > MAX_AUDIT_ACTIONS) throw new AuditContractError('invalid audit actions')
  return input.map(parseAuditAction)
}

export const isAuditAssertionForFindingClass = (findingClass: FindingClass, assertion: AuditAssertion): boolean => {
  if (findingClass === 'broken-image') return assertion.kind === 'image-load'
  if (findingClass === 'visibility') return assertion.kind === 'visibility'
  if (findingClass === 'overflow') return assertion.kind === 'viewport-overflow'
  if (findingClass === 'hit-target') return assertion.kind === 'minimum-size'
  if (findingClass === 'content') return assertion.kind === 'text'
  return ['viewport-containment', 'geometry', 'no-overlap'].includes(assertion.kind)
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
  if (
    counterpart.result.status === 'failure' &&
    normalizeIdentityText(counterpart.result.failureSignature) !== normalizeIdentityText(finding.failureSignature)
  )
    throw new AuditContractError('responsive counterpart failure signature disagrees')
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
    parseAuditAssertion(finding.assertion)
    parseAuditActions(finding.actions)
    if (!isAuditAssertionForFindingClass(finding.findingClass, finding.assertion))
      throw new AuditContractError('finding class does not match its assertion')
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
  const evidencePaths = new Set<string>()
  const assertUniqueEvidence = (evidence: readonly EvidenceReference[]): void => {
    for (const reference of evidence) {
      if (evidencePaths.has(reference.path)) throw new AuditContractError('evidence path is duplicated')
      evidencePaths.add(reference.path)
    }
  }
  for (const finding of manifest.findings) {
    assertUniqueEvidence(finding.evidence)
    if (finding.responsive !== 'not-applicable') assertUniqueEvidence(finding.counterpart.evidence)
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
    parseAuditAssertion(validation.assertion)
    parseAuditActions(validation.actions)
    if (!isAuditAssertionForFindingClass(validation.findingClass, validation.assertion))
      throw new AuditContractError('validation class does not match its assertion')
    if (validation.status === 'clean') {
      validateEvidencePair(validation.evidence)
      assertUniqueEvidence(validation.evidence)
    } else if (!hasSafeText(validation.diagnostic, 500)) throw new AuditContractError('invalid validation diagnostic')
  }
}

/** Parses untrusted JSON-shaped input into the closed live-audit domain contract. */
export const parseAuditManifest = (input: unknown): AuditManifest => {
  if (!validate(input)) throw new AuditContractError(`invalid audit manifest: ${ajv.errorsText(validate.errors)}`)
  const manifest = input as unknown as AuditManifest
  semanticValidate(manifest)
  return manifest
}
