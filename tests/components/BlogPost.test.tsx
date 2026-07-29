import {render, screen, within} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {describe, expect, it} from 'vitest'
import BlogPost from '../../src/components/BlogPost'

describe('BlogPost Component', () => {
  const defaultProps = {
    slug: 'my-blog-post',
    title: 'My Blog Post',
    date: '2024-01-15',
    summary: 'This is a summary of the blog post.',
    tags: ['react', 'typescript'],
  }

  const renderWithRouter = (props: typeof defaultProps) =>
    render(
      <MemoryRouter>
        <BlogPost {...props} />
      </MemoryRouter>,
    )

  it('should render the post title', () => {
    renderWithRouter(defaultProps)
    expect(screen.getByRole('heading', {name: 'My Blog Post'})).toBeInTheDocument()
  })

  it('should render a human-readable post date while preserving the ISO dateTime attribute', () => {
    renderWithRouter(defaultProps)
    const timeEl = screen.getByText('January 15, 2024')
    expect(timeEl.tagName.toLowerCase()).toBe('time')
    expect(timeEl).toHaveAttribute('dateTime', '2024-01-15')
  })

  it('should render the post summary', () => {
    renderWithRouter(defaultProps)
    expect(screen.getByText('This is a summary of the blog post.')).toBeInTheDocument()
  })

  it('should have exactly one accessible link to the post slug, with a non-interactive "Read article" cue', () => {
    renderWithRouter(defaultProps)
    const article = screen.getByRole('article')
    const links = within(article).getAllByRole('link')
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute('href', '/blog/my-blog-post')

    expect(screen.getByText('Read article')).toBeInTheDocument()
    expect(screen.queryByRole('link', {name: 'Read article'})).not.toBeInTheDocument()
    expect(screen.queryByRole('button', {name: 'Read article'})).not.toBeInTheDocument()
  })

  it('should render as an article element', () => {
    renderWithRouter(defaultProps)
    expect(screen.getByRole('article')).toBeInTheDocument()
  })

  it('should render tags as non-interactive labels introduced by a visible "Topics:" metadata label', () => {
    renderWithRouter(defaultProps)
    const tagsList = screen.getByLabelText('Tags')
    expect(tagsList).toBeInTheDocument()

    // The tags must be visibly introduced with the exact text "Topics:" so that
    // sighted users aren't left to infer meaning from color (blue hashtag prefixes) alone.
    expect(screen.getByText('Topics:')).toBeInTheDocument()

    expect(screen.getByText('react')).toBeInTheDocument()
    expect(screen.getByText('typescript')).toBeInTheDocument()

    // Tags remain non-interactive: no links or buttons for any tag, and the
    // one-link-per-card contract (the title link) must be preserved.
    expect(screen.queryByRole('link', {name: 'react'})).not.toBeInTheDocument()
    expect(screen.queryByRole('button', {name: 'react'})).not.toBeInTheDocument()
    expect(screen.queryByRole('link', {name: 'typescript'})).not.toBeInTheDocument()
    expect(screen.queryByRole('button', {name: 'typescript'})).not.toBeInTheDocument()

    const article = screen.getByRole('article')
    expect(within(article).getAllByRole('link')).toHaveLength(1)
  })

  it('should render without tags when none are provided', () => {
    const propsWithoutTags: typeof defaultProps = {...defaultProps, tags: []}
    renderWithRouter(propsWithoutTags)
    expect(screen.queryByLabelText('Tags')).not.toBeInTheDocument()
  })

  it('should render markup in title/summary/tags inert (no injected elements)', () => {
    renderWithRouter({
      ...defaultProps,
      title: '<img src=x onerror=alert(1)>Hostile Title',
      summary: '<script>alert(1)</script>Hostile summary',
      tags: ['<b>bold-tag</b>'],
    })

    expect(screen.getByRole('heading')).toHaveTextContent('<img src=x onerror=alert(1)>Hostile Title')
    expect(document.querySelector('script')).not.toBeInTheDocument()
    expect(document.querySelector('.blog-post__tag img')).not.toBeInTheDocument()
  })
})
