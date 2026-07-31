/**
 * Blog frontmatter validation (Ajv, mirroring `schema-validation.ts`).
 *
 * Build-time/Node-only: `ajv.compile()` runs `new Function` at module scope, which a
 * strict `script-src` CSP with no `unsafe-eval` blocks in the browser. This module is
 * imported only by `scripts/blog-refresh.ts` (a Node/tsx build script) and its tests —
 * never by browser-loaded code. Pure, browser-safe blog helpers (slug derivation,
 * `toBlogPostMeta`, etc.) live in `src/utils/blog.ts`, which has no `ajv`/`ajv-formats`
 * dependency (see `tests/utils/blog.test.ts`'s module-boundary regression test).
 */

import type {BlogFrontmatter} from '../types'
import Ajv, {type ErrorObject} from 'ajv'
import addFormats from 'ajv-formats'

import blogFrontmatterSchema from '../schemas/blog-frontmatter.schema.json'

export type BlogValidationResult = {ok: true; value: BlogFrontmatter} | {ok: false; errors: string[]}

const ajv = new Ajv({
  allErrors: true,
  verbose: true,
  strict: false,
  removeAdditional: false,
  useDefaults: false,
  coerceTypes: false,
})

addFormats(ajv)

const validateFrontmatterSchema = ajv.compile<BlogFrontmatter>(blogFrontmatterSchema)

const errorFormatters: Record<string, (error: ErrorObject, path: string) => string> = {
  required: (error, path) => {
    const missingProperty = error.params?.missingProperty
    return `Missing required property: ${path}.${missingProperty}`
  },
  type: (error, path) => {
    const expectedType = error.params?.type
    return `Invalid type at ${path}: expected ${expectedType}, got ${typeof error.data}`
  },
  format: (error, path) => {
    const format = error.params?.format
    return `Invalid format at ${path}: expected ${format} format`
  },
  minLength: (error, path) => {
    const minLength = error.params?.limit
    return `Value too short at ${path}: minimum length is ${minLength}`
  },
  maxLength: (error, path) => {
    const maxLength = error.params?.limit
    return `Value too long at ${path}: maximum length is ${maxLength}`
  },
  maxItems: (error, path) => {
    const limit = error.params?.limit
    return `Too many items at ${path}: maximum is ${limit}`
  },
  uniqueItems: (_, path) => {
    return `Duplicate items are not allowed at ${path}`
  },
  additionalProperties: (error, path) => {
    const additionalProperty = error.params?.additionalProperty
    return `Unexpected property at ${path}: ${additionalProperty} is not allowed`
  },
}

/** Formats Ajv validation errors into human-readable messages. */
export const formatValidationErrors = (errors: ErrorObject[]): string[] => {
  return errors.map(error => {
    const path = error.instancePath || 'root'
    const message = error.message || 'validation failed'
    const formatter = errorFormatters[error.keyword]
    if (formatter) {
      return formatter(error, path)
    }
    return `Validation error at ${path}: ${message}`
  })
}

/** Validates unknown data against the blog frontmatter schema. */
export const validateBlogFrontmatter = (data: unknown): BlogValidationResult => {
  const isValid = validateFrontmatterSchema(data)

  if (isValid) {
    return {ok: true, value: data}
  }

  const errors = validateFrontmatterSchema.errors ?? []
  return {ok: false, errors: formatValidationErrors(errors)}
}

/** Type guard confirming `data` is a valid `BlogFrontmatter` object. */
export const isValidBlogFrontmatter = (data: unknown): data is BlogFrontmatter => {
  return validateBlogFrontmatter(data).ok
}
