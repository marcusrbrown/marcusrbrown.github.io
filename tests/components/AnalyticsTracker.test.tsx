import {render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import {MemoryRouter, Route, Routes, useNavigate} from 'react-router-dom'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {AnalyticsTracker} from '../../src/components/AnalyticsTracker'
import {onUmamiTrackerReady, trackUmamiPageview} from '../../src/utils/analytics'

vi.mock('../../src/utils/analytics', () => ({
  trackUmamiPageview: vi.fn(),
  onUmamiTrackerReady: vi.fn(),
}))

const mockTrackUmamiPageview = vi.mocked(trackUmamiPageview)
const mockOnUmamiTrackerReady = vi.mocked(onUmamiTrackerReady)

const Page: React.FC<{label: string}> = ({label}) => {
  const navigate = useNavigate()
  return (
    <div>
      <span>{label}</span>
      <button type="button" onClick={() => navigate('/about')}>
        go-about
      </button>
      <button type="button" onClick={() => navigate('/blog')}>
        go-blog
      </button>
      <button type="button" onClick={() => navigate('/about?ref=campaign#section')}>
        go-about-query-hash
      </button>
    </div>
  )
}

const TestApp: React.FC<{initialEntries?: string[]}> = ({initialEntries = ['/']}) => (
  <MemoryRouter initialEntries={initialEntries}>
    <AnalyticsTracker />
    <Routes>
      <Route path="/" element={<Page label="home" />} />
      <Route path="/about" element={<Page label="about" />} />
      <Route path="/blog" element={<Page label="blog" />} />
    </Routes>
  </MemoryRouter>
)

describe('AnalyticsTracker', () => {
  beforeEach(() => {
    mockTrackUmamiPageview.mockReset()
    mockOnUmamiTrackerReady.mockReset()
    mockTrackUmamiPageview.mockReturnValue('sent')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders no visible output of its own', () => {
    const {container} = render(<TestApp />)
    expect(screen.getByText('home')).toBeInTheDocument()
    expect(container.childElementCount).toBe(1)
  })

  it('passes the initial location pathname to the pageview hook/adapter', () => {
    render(<TestApp initialEntries={['/about']} />)
    expect(mockTrackUmamiPageview).toHaveBeenCalledTimes(1)
    expect(mockTrackUmamiPageview).toHaveBeenCalledWith('/about')
  })

  it('tracks a route navigation via useLocation', async () => {
    const user = userEvent.setup()
    render(<TestApp />)
    mockTrackUmamiPageview.mockClear()

    await user.click(screen.getByRole('button', {name: 'go-about'}))

    expect(mockTrackUmamiPageview).toHaveBeenCalledTimes(1)
    expect(mockTrackUmamiPageview).toHaveBeenCalledWith('/about')
  })

  it('passes only the pathname from useLocation, not query/hash', async () => {
    const user = userEvent.setup()
    render(<TestApp />)
    mockTrackUmamiPageview.mockClear()

    await user.click(screen.getByRole('button', {name: 'go-about-query-hash'}))

    expect(mockTrackUmamiPageview).toHaveBeenCalledTimes(1)
    expect(mockTrackUmamiPageview).toHaveBeenCalledWith('/about')
  })

  it('flushes only the latest pre-readiness route once the tracker becomes ready', async () => {
    mockTrackUmamiPageview.mockReturnValue('unavailable')
    let readyCallback: (() => void) | undefined
    mockOnUmamiTrackerReady.mockImplementation(cb => {
      readyCallback = cb
    })

    const user = userEvent.setup()
    render(<TestApp initialEntries={['/about']} />)
    await user.click(screen.getByRole('button', {name: 'go-blog'}))

    mockTrackUmamiPageview.mockClear()
    mockTrackUmamiPageview.mockReturnValue('sent')
    expect(readyCallback).toBeDefined()
    readyCallback?.()

    expect(mockTrackUmamiPageview).toHaveBeenCalledTimes(1)
    expect(mockTrackUmamiPageview).toHaveBeenCalledWith('/blog')
  })
})
