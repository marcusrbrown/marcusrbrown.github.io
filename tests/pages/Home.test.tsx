import type {Project} from '../../src/types'
import {fireEvent, render, screen} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {useBlogPosts} from '../../src/hooks/UseBlogPosts'
import {useProjects} from '../../src/hooks/UseProjects'
import Home from '../../src/pages/Home'
// Mock hooks
vi.mock('../../src/hooks/UseProjects', () => ({
  useProjects: vi.fn(),
}))

vi.mock('../../src/hooks/UseBlogPosts', () => ({
  useBlogPosts: vi.fn(),
}))

vi.mock('../../src/hooks/UsePageTitle', () => ({
  usePageTitle: vi.fn(),
}))

vi.mock('../../src/hooks/UseAnalytics', () => ({
  useSectionTracking: vi.fn(() => ({current: null})),
}))

// Mock all child components
vi.mock('../../src/components/HeroSection', () => ({
  default: () => <div data-testid="hero-section">Hero</div>,
}))

vi.mock('../../src/components/AboutSection', () => ({
  default: () => <div data-testid="about-section">About</div>,
}))

vi.mock('../../src/components/SmoothScrollNav', () => ({
  default: () => <div data-testid="smooth-scroll-nav">Nav</div>,
}))

vi.mock('../../src/components/ProjectGallery', () => ({
  default: ({onProjectPreview}: {onProjectPreview: (project: Project) => void}) => (
    <div data-testid="project-gallery">
      <button
        type="button"
        onClick={() =>
          onProjectPreview({
            id: 'proj1',
            title: 'Test Project',
            description: 'desc',
            url: 'https://github.com/test',
            language: 'TypeScript',
            stars: 5,
          })
        }
      >
        Preview Project
      </button>
    </div>
  ),
}))

vi.mock('../../src/components/ProjectPreviewModal', () => ({
  default: ({
    project,
    isOpen,
    onClose,
    onNavigate,
  }: {
    project: Project | null
    isOpen: boolean
    onClose: () => void
    onNavigate: (p: Project) => void
  }) =>
    isOpen && project ? (
      <div data-testid="project-modal">
        <button type="button" onClick={onClose}>
          Close Modal
        </button>
        <button
          type="button"
          onClick={() =>
            onNavigate({
              id: 'proj2',
              title: 'Next Project',
              description: 'desc',
              url: 'https://github.com/next',
              language: 'JavaScript',
              stars: 3,
            })
          }
        >
          Navigate Project
        </button>
        <a href={project.url} data-testid="modal-code-link">
          View Code
        </a>
        {project.homepage && (
          <a href={project.homepage} data-testid="modal-demo-link">
            Live Demo
          </a>
        )}
      </div>
    ) : null,
}))

vi.mock('../../src/components/BlogPost', () => ({
  default: ({title}: {title: string}) => <div data-testid="blog-post">{title}</div>,
}))

vi.mock('../../src/styles/landing-page.css', () => ({}))

const mockUseProjects = vi.mocked(useProjects)
const mockUseBlogPosts = vi.mocked(useBlogPosts)

const mockProjects: Project[] = [
  {
    id: 'proj-1',
    title: 'My Project',
    description: 'A portfolio project',
    url: 'https://github.com/user/my-project',
    language: 'TypeScript',
    stars: 42,
    topics: ['portfolio'],
  },
]

const HomeWrapper: React.FC = () => (
  <MemoryRouter>
    <Home />
  </MemoryRouter>
)

describe('Home Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseBlogPosts.mockReturnValue({posts: [], getPostBySlug: vi.fn()})
    mockUseProjects.mockReturnValue({projects: []})
  })

  it('should render main sections', () => {
    render(<HomeWrapper />)
    expect(screen.getByTestId('hero-section')).toBeInTheDocument()
    expect(screen.getByTestId('about-section')).toBeInTheDocument()
    expect(screen.getByTestId('smooth-scroll-nav')).toBeInTheDocument()
    expect(screen.queryByTestId('skills-showcase')).not.toBeInTheDocument()
    expect(screen.queryByTestId('contact-cta')).not.toBeInTheDocument()
  })

  it('should render project gallery section from static data', () => {
    mockUseProjects.mockReturnValue({projects: mockProjects})

    render(<HomeWrapper />)
    expect(screen.getByTestId('project-gallery')).toBeInTheDocument()
  })

  it('should render blog posts when available', () => {
    mockUseBlogPosts.mockReturnValue({
      posts: [{slug: 'blog-post-1', title: 'Blog Post 1', summary: 'Summary', date: '2024-01-01'}],
      getPostBySlug: vi.fn(),
    })

    render(<HomeWrapper />)
    expect(screen.getByText('Blog Post 1')).toBeInTheDocument()
  })

  it('should hide the blog preview section when there are no posts', () => {
    mockUseBlogPosts.mockReturnValue({posts: [], getPostBySlug: vi.fn()})

    render(<HomeWrapper />)
    expect(screen.queryByText('Latest Blog Posts')).not.toBeInTheDocument()
  })

  it('should NOT show loading or error states (data is static)', () => {
    mockUseProjects.mockReturnValue({projects: mockProjects})

    render(<HomeWrapper />)
    expect(screen.queryByTestId('loading-state')).not.toBeInTheDocument()
    expect(screen.queryByTestId('error-state')).not.toBeInTheDocument()
    expect(screen.queryByText(/Loading\.\.\./)).not.toBeInTheDocument()
    expect(screen.queryByText(/rate limit/i)).not.toBeInTheDocument()
  })

  it('should open modal when project is previewed', () => {
    mockUseProjects.mockReturnValue({projects: mockProjects})

    render(<HomeWrapper />)

    expect(screen.queryByTestId('project-modal')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', {name: 'Preview Project'}))
    expect(screen.getByTestId('project-modal')).toBeInTheDocument()
  })

  it('should close modal when close is triggered', () => {
    mockUseProjects.mockReturnValue({projects: mockProjects})

    render(<HomeWrapper />)
    fireEvent.click(screen.getByRole('button', {name: 'Preview Project'}))
    expect(screen.getByTestId('project-modal')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', {name: 'Close Modal'}))
    expect(screen.queryByTestId('project-modal')).not.toBeInTheDocument()
  })

  it('should navigate to a new project when onNavigate is called', () => {
    mockUseProjects.mockReturnValue({projects: mockProjects})

    render(<HomeWrapper />)
    fireEvent.click(screen.getByRole('button', {name: 'Preview Project'}))
    expect(screen.getByTestId('project-modal')).toBeInTheDocument()

    // Navigate to another project - modal should still be open
    fireEvent.click(screen.getByRole('button', {name: 'Navigate Project'}))
    expect(screen.getByTestId('project-modal')).toBeInTheDocument()
  })
})
