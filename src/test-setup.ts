import type {AxeMatchers} from 'vitest-axe/matchers'
import {expect} from 'vitest'
import * as matchers from 'vitest-axe/matchers'

expect.extend(matchers)

declare module '@vitest/expect' {
  interface Assertion extends AxeMatchers {}
  interface AsymmetricMatchersContaining extends AxeMatchers {}
}
