import {describe, expect, it} from 'vitest'
import {buildFollowUpTitle, parseRecommendedFollowUpChecks} from '../create-regression-watchlist-followups.ts'

describe('create-regression-watchlist-followups', () => {
  it('parses recommended checks from watchlist body', () => {
    const issueBody = `
## Summary
Some summary text.

## Recommended Follow-up Checks

1. **🚨 Accessibility gap** — Consider re-adding Playwright a11y tests.
2. **🔍 Navigation behavior** — Verify mobile menu and active highlighting.

## PR References
Extra content.
`

    expect(parseRecommendedFollowUpChecks(issueBody)).toEqual([
      {
        title: '🚨 Accessibility gap',
        details: 'Consider re-adding Playwright a11y tests.',
      },
      {
        title: '🔍 Navigation behavior',
        details: 'Verify mobile menu and active highlighting.',
      },
    ])
  })

  it('returns empty list when checks section is missing', () => {
    expect(parseRecommendedFollowUpChecks('## Summary\nNo checks.')).toEqual([])
  })

  it('builds deterministic issue titles', () => {
    expect(buildFollowUpTitle(123, '🔍 Navigation behavior')).toBe('Follow-up: 🔍 Navigation behavior (watchlist #123)')
  })
})
