import {describe, expect, it} from 'vitest'

import {latestLargestContentfulPaint, smoothScrollDuration} from '../performance/measurement-utils'

describe('performance measurement utilities', () => {
  it('reports the elapsed smooth-scroll interval', () => {
    expect(smoothScrollDuration(120, 845)).toBe(725)
  })

  it('selects the latest observed Largest Contentful Paint entry', () => {
    expect(latestLargestContentfulPaint([{startTime: 132}, {startTime: 556}])).toBe(556)
  })
})
