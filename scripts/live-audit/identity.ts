import type {AuditRoute, AuditVariant} from './contract'

import {createHash} from 'node:crypto'

export const normalizeIdentityText = (value: string): string =>
  [...value]
    .map(character => {
      const code = character.codePointAt(0) ?? 0
      return code <= 0x1f || code === 0x7f ? ' ' : character
    })
    .join('')
    .trim()
    .replaceAll(/\s+/g, ' ')
    .toLowerCase()
const normalize = normalizeIdentityText
const digest = (value: string): string => createHash('sha256').update(value).digest('hex').slice(0, 32)

export const findingFingerprint = (input: {
  route: AuditRoute | string
  semanticTarget: string
  failureSignature: string
}): string =>
  digest(
    [
      normalizeIdentityText(input.route),
      normalizeIdentityText(input.semanticTarget),
      normalizeIdentityText(input.failureSignature),
    ].join('|'),
  )
export const variantKey = (variant: AuditVariant): string =>
  digest(
    [
      variant.viewport,
      variant.theme.kind,
      variant.theme.kind === 'mode' ? variant.theme.mode : variant.theme.presetId,
      normalize(variant.state),
    ].join('|'),
  )
export const operationKey = (runId: string, fingerprint: string, variant: string, checkpoint: string): string =>
  digest([runId, fingerprint, variant, checkpoint].map(normalize).join('|'))
