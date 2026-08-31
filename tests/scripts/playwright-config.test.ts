import {describe, expect, it} from 'vitest'

import {getPlaywrightWebServerConfig} from '../../playwright.config'

describe('Playwright web server preconditions', () => {
  it('builds the fixture before local browser tests and never reuses a server', () => {
    expect(getPlaywrightWebServerConfig(false)).toEqual({
      command: 'pnpm run build:e2e && pnpm preview',
      port: 4173,
      reuseExistingServer: false,
    })
  })

  it('uses the CI artifact without rebuilding while still refusing stale servers', () => {
    expect(getPlaywrightWebServerConfig(true)).toEqual({
      command: 'pnpm preview',
      port: 4173,
      reuseExistingServer: false,
    })
  })
})
