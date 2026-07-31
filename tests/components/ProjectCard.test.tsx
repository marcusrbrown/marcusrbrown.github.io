import type {Project} from '../../src/types'
import {fireEvent, render, screen} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import ProjectCard from '../../src/components/ProjectCard'
import {buildUmamiEventAttributes, trackUmamiEvent} from '../../src/utils/analytics'

vi.mock('../../src/utils/analytics', async importOriginal => {
  const actual = await importOriginal<typeof import('../../src/utils/analytics')>()
  return {
    ...actual,
    trackUmamiEvent: vi.fn(actual.trackUmamiEvent),
  }
})

// Mock the progressive image hook
vi.mock('../../src/hooks/UseProgressiveImage', () => ({
  useProgressiveImage: vi.fn(() => ({
    imgRef: {current: null},
    isLoaded: false,
    isError: false,
    isInView: false,
  })),
}))

const makeProject = (overrides: Partial<Project> = {}): Project => ({
  id: '1',
  title: 'Test Project',
  description: 'A test project description',
  url: 'https://github.com/test/project',
  language: 'TypeScript',
  stars: 42,
  ...overrides,
})

describe('ProjectCard Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render project title', () => {
    render(<ProjectCard {...makeProject()} />)
    expect(screen.getByRole('heading', {name: 'Test Project'})).toBeInTheDocument()
  })

  it('should render project description', () => {
    render(<ProjectCard {...makeProject()} />)
    expect(screen.getByText('A test project description')).toBeInTheDocument()
  })

  it('should render language badge', () => {
    render(<ProjectCard {...makeProject()} />)
    expect(screen.getByText('TypeScript')).toBeInTheDocument()
  })

  it('should render stars count', () => {
    render(<ProjectCard {...makeProject()} />)
    expect(screen.getByLabelText('42 stars')).toBeInTheDocument()
  })

  it('should render GitHub link', () => {
    render(<ProjectCard {...makeProject()} />)
    expect(screen.getByLabelText('View Test Project on GitHub')).toHaveAttribute(
      'href',
      'https://github.com/test/project',
    )
  })

  it('should not render demo link when no homepage', () => {
    render(<ProjectCard {...makeProject({homepage: null})} />)
    expect(screen.queryByLabelText(/View live demo/)).not.toBeInTheDocument()
  })

  it('should render demo link when homepage is provided', () => {
    render(<ProjectCard {...makeProject({homepage: 'https://myproject.com'})} />)
    expect(screen.getByLabelText('View live demo of Test Project')).toHaveAttribute('href', 'https://myproject.com')
  })

  it('should render preview button', () => {
    render(<ProjectCard {...makeProject()} />)
    expect(screen.getByLabelText('Preview Test Project')).toBeInTheDocument()
  })

  it('should call onPreview and track event when preview button is clicked', () => {
    const onPreview = vi.fn()
    render(<ProjectCard {...makeProject()} onPreview={onPreview} />)

    fireEvent.click(screen.getByLabelText('Preview Test Project'))
    expect(onPreview).toHaveBeenCalledOnce()
    expect(trackUmamiEvent).toHaveBeenCalledTimes(1)
    expect(trackUmamiEvent).toHaveBeenCalledWith('project_open', {
      action: 'preview',
      project_id: '1',
      source: 'gallery',
    })
  })

  it('should not throw and emit zero events when preview is clicked without onPreview handler', () => {
    render(<ProjectCard {...makeProject()} />)
    expect(() => fireEvent.click(screen.getByLabelText('Preview Test Project'))).not.toThrow()
    expect(trackUmamiEvent).not.toHaveBeenCalled()
  })

  it('should render up to 3 topics', () => {
    const project = makeProject({topics: ['react', 'typescript', 'nodejs', 'express', 'mongodb']})
    render(<ProjectCard {...project} />)
    expect(screen.getByText('react')).toBeInTheDocument()
    expect(screen.getByText('typescript')).toBeInTheDocument()
    expect(screen.getByText('nodejs')).toBeInTheDocument()
  })

  it('should show "+more" badge when topics exceed 3', () => {
    const project = makeProject({topics: ['react', 'typescript', 'nodejs', 'express', 'mongodb']})
    render(<ProjectCard {...project} />)
    expect(screen.getByText('+2')).toBeInTheDocument()
  })

  it('should not render topics section when no topics', () => {
    const project = makeProject({topics: []})
    const {container} = render(<ProjectCard {...project} />)
    expect(container.querySelector('.project-card__topics')).not.toBeInTheDocument()
  })

  it('should render updated time when lastUpdated is provided', () => {
    const project = makeProject({lastUpdated: '2024-01-15T00:00:00Z'})
    render(<ProjectCard {...project} />)
    expect(screen.getByText(/Updated/)).toBeInTheDocument()
  })

  it('should not render updated time when lastUpdated is not provided', () => {
    const project = makeProject({lastUpdated: undefined})
    render(<ProjectCard {...project} />)
    expect(screen.queryByText(/Updated/)).not.toBeInTheDocument()
  })

  it('should have article role', () => {
    render(<ProjectCard {...makeProject()} />)
    expect(screen.getByRole('article')).toBeInTheDocument()
  })

  it('should render project image when imageUrl is provided', () => {
    const project = makeProject({imageUrl: 'https://example.com/image.png'})
    render(<ProjectCard {...project} />)
    expect(screen.getByAltText('Test Project project screenshot')).toBeInTheDocument()
  })

  it('should not render image tag when no imageUrl', () => {
    render(<ProjectCard {...makeProject({imageUrl: undefined})} />)
    expect(screen.queryByAltText(/project screenshot/)).not.toBeInTheDocument()
  })

  it('applies analytics attributes to links and buttons when using a valid snapshot project ID', () => {
    const onPreview = vi.fn()
    const project = makeProject({
      id: '1297795539',
      homepage: 'https://myproject.com',
    })
    render(<ProjectCard {...project} onPreview={onPreview} />)

    const codeLink = screen.getByLabelText('View Test Project on GitHub')
    const demoLink = screen.getByLabelText('View live demo of Test Project')
    const previewBtn = screen.getByLabelText('Preview Test Project')

    const codeAttrs = buildUmamiEventAttributes('project_open', {
      action: 'source',
      project_id: '1297795539',
      source: 'gallery',
    })
    const demoAttrs = buildUmamiEventAttributes('project_open', {
      action: 'demo',
      project_id: '1297795539',
      source: 'gallery',
    })

    expect(codeLink).toHaveAttribute('data-umami-event', codeAttrs?.['data-umami-event'])
    expect(codeLink).toHaveAttribute('data-umami-event-action', codeAttrs?.['data-umami-event-action'])
    expect(codeLink).toHaveAttribute('data-umami-event-project_id', codeAttrs?.['data-umami-event-project_id'])
    expect(codeLink).toHaveAttribute('data-umami-event-source', codeAttrs?.['data-umami-event-source'])

    expect(demoLink).toHaveAttribute('data-umami-event', demoAttrs?.['data-umami-event'])
    expect(demoLink).toHaveAttribute('data-umami-event-action', demoAttrs?.['data-umami-event-action'])
    expect(demoLink).toHaveAttribute('data-umami-event-project_id', demoAttrs?.['data-umami-event-project_id'])
    expect(demoLink).toHaveAttribute('data-umami-event-source', demoAttrs?.['data-umami-event-source'])

    fireEvent.click(previewBtn)
    expect(trackUmamiEvent).toHaveBeenCalledWith('project_open', {
      action: 'preview',
      project_id: '1297795539',
      source: 'gallery',
    })
  })

  it('does NOT apply analytics attributes and fails closed when using an invalid ID', () => {
    const onPreview = vi.fn()
    const project = makeProject({
      id: 'invalid-id',
      homepage: 'https://myproject.com',
    })
    render(<ProjectCard {...project} onPreview={onPreview} />)

    const codeLink = screen.getByLabelText('View Test Project on GitHub')
    const demoLink = screen.getByLabelText('View live demo of Test Project')
    const previewBtn = screen.getByLabelText('Preview Test Project')

    expect(codeLink).not.toHaveAttribute('data-umami-event')
    expect(demoLink).not.toHaveAttribute('data-umami-event')

    fireEvent.click(previewBtn)
    // Call is attempted with handler present — adapter returns 'dropped-by-policy' via catalog validation
    expect(trackUmamiEvent).toHaveBeenCalledWith('project_open', {
      action: 'preview',
      project_id: 'invalid-id',
      source: 'gallery',
    })
    // onPreview is still called — the handler is invoked regardless of validity
    expect(onPreview).toHaveBeenCalledOnce()
  })
})
