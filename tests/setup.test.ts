import {describe, expect, it} from 'vitest'

describe('test fetch harness', () => {
  it('rejects requests that no test explicitly stubs', async () => {
    await expect(fetch('https://unexpected.example.test/missing-fixture')).rejects.toThrow(
      'Unexpected fetch request in test',
    )
  })
})
