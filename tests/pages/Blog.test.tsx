import {render, screen, within} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {useBlogPosts} from '../../src/hooks/UseBlogPosts'
import Blog from '../../src/pages/Blog'

vi.mock('../../src/hooks/UseBlogPosts', () => ({
  useBlogPosts: vi.fn(),
}))

vi.mock('../../src/hooks/UsePageTitle', () => ({
  usePageTitle: vi.fn(),
}))

const mockUseBlogPosts = vi.mocked(useBlogPosts)

const BlogWrapper: React.FC = () => (
  <MemoryRouter>
    <Blog />
  </MemoryRouter>
)

const post = (overrides: Partial<ReturnType<typeof useBlogPosts>['posts'][number]> = {}) => ({
  slug: 'post-1',
  title: 'Post 1',
  date: '2024-01-01',
  summary: 'Summary 1',
  tags: ['tag-a'],
  ...overrides,
})

describe('Blog Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render the blog title', () => {
    mockUseBlogPosts.mockReturnValue({posts: [], getPostBySlug: vi.fn()})
    render(<BlogWrapper />)
    expect(screen.getByRole('heading', {name: 'Blog'})).toBeInTheDocument()
  })

  it('should render the editorial premise beneath the title', () => {
    mockUseBlogPosts.mockReturnValue({posts: [], getPostBySlug: vi.fn()})
    render(<BlogWrapper />)
    expect(
      screen.getByText('Notes on software systems, agent workflows, and the decisions behind maintained public work.'),
    ).toBeInTheDocument()
  })

  it('should render a visible RSS feed link', () => {
    mockUseBlogPosts.mockReturnValue({posts: [], getPostBySlug: vi.fn()})
    render(<BlogWrapper />)
    expect(screen.getByRole('link', {name: 'RSS Feed'})).toHaveAttribute('href', '/feed.xml')
  })

  it('should render 3 cards in reverse-date order with tags as labels', () => {
    mockUseBlogPosts.mockReturnValue({
      posts: [
        post({slug: 'newest', title: 'Newest Post', date: '2024-03-01'}),
        post({slug: 'middle', title: 'Middle Post', date: '2024-02-01'}),
        post({slug: 'oldest', title: 'Oldest Post', date: '2024-01-01'}),
      ],
      getPostBySlug: vi.fn(),
    })

    render(<BlogWrapper />)
    const headings = screen.getAllByRole('heading', {level: 2})
    expect(headings.map(h => h.textContent)).toStrictEqual(['Newest Post', 'Middle Post', 'Oldest Post'])

    const tagLists = screen.getAllByLabelText('Tags')
    expect(tagLists).toHaveLength(3)
    for (const tagList of tagLists) {
      expect(tagList.tagName.toLowerCase()).toBe('ul')
    }
  })

  it('should have exactly one accessible link per card to /blog/<slug>', () => {
    mockUseBlogPosts.mockReturnValue({
      posts: [post({slug: 'my-post', title: 'My Post'})],
      getPostBySlug: vi.fn(),
    })
    render(<BlogWrapper />)
    const article = screen.getByRole('article')
    const links = within(article).getAllByRole('link')
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute('href', '/blog/my-post')

    expect(screen.getByText('Read article')).toBeInTheDocument()
    expect(screen.queryByRole('link', {name: 'Read article'})).not.toBeInTheDocument()
  })

  it('should render BlogEmptyState when there are no posts (no bare paragraph)', () => {
    mockUseBlogPosts.mockReturnValue({posts: [], getPostBySlug: vi.fn()})
    render(<BlogWrapper />)
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByRole('heading', {name: 'No posts yet'})).toBeInTheDocument()
  })

  it('should render markup in title/summary/tags inert in list cards', () => {
    mockUseBlogPosts.mockReturnValue({
      posts: [
        post({
          slug: 'hostile',
          title: '<img src=x onerror=alert(1)>Hostile Title',
          summary: '<script>alert(1)</script>Hostile summary',
          tags: ['<b>bold-tag</b>'],
        }),
      ],
      getPostBySlug: vi.fn(),
    })

    render(<BlogWrapper />)
    expect(screen.getByRole('heading', {level: 2})).toHaveTextContent('<img src=x onerror=alert(1)>Hostile Title')
    expect(document.querySelector('script')).not.toBeInTheDocument()
  })
})
