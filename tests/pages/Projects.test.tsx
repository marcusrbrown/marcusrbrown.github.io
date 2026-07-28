import type {Project} from '../../src/types'
import {fireEvent, render, screen} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {useProjects} from '../../src/hooks/UseProjects'
import Projects from '../../src/pages/Projects'

// Mock dependencies
vi.mock('../../src/hooks/UseProjects', () => ({
  useProjects: vi.fn(),
}))

vi.mock('../../src/hooks/UsePageTitle', () => ({
  usePageTitle: vi.fn(),
}))

vi.mock('../../src/components/ProjectGallery', () => ({
  default: ({projects, onProjectPreview}: {projects: Project[]; onProjectPreview: (project: Project) => void}) => (
    <div data-testid="project-gallery">
      {projects.length === 0 && <p data-testid="empty-state">No projects found</p>}
      <button
        type="button"
        onClick={() =>
          onProjectPreview({
            id: 'proj1',
            title: 'Test Project',
            description: 'A test project',
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
  default: ({isOpen, onClose}: {isOpen: boolean; onClose: () => void}) =>
    isOpen ? (
      <div data-testid="project-modal">
        <button type="button" onClick={onClose}>
          Close Modal
        </button>
      </div>
    ) : null,
}))

const mockUseProjects = vi.mocked(useProjects)

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

const ProjectsWrapper: React.FC = () => (
  <MemoryRouter>
    <Projects />
  </MemoryRouter>
)

describe('Projects Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render project gallery when projects are present', () => {
    mockUseProjects.mockReturnValue({projects: mockProjects})

    render(<ProjectsWrapper />)
    expect(screen.getByTestId('project-gallery')).toBeInTheDocument()
  })

  it('should NOT show a loading spinner', () => {
    mockUseProjects.mockReturnValue({projects: mockProjects})

    render(<ProjectsWrapper />)
    expect(screen.queryByText('Loading Projects...')).not.toBeInTheDocument()
    expect(screen.queryByText(/Fetching the latest projects/)).not.toBeInTheDocument()
    expect(screen.queryByTestId('loading-state')).not.toBeInTheDocument()
  })

  it('should NOT show an error message or retry button', () => {
    mockUseProjects.mockReturnValue({projects: mockProjects})

    render(<ProjectsWrapper />)
    expect(screen.queryByText('Error Loading Projects')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', {name: 'Try Again'})).not.toBeInTheDocument()
    expect(screen.queryByText(/rate limit/i)).not.toBeInTheDocument()
  })

  it('should render gallery (with empty state) when projects is empty — no retry, no rate-limit copy', () => {
    mockUseProjects.mockReturnValue({projects: []})

    render(<ProjectsWrapper />)
    // Gallery is still rendered (shows its own empty state)
    expect(screen.getByTestId('project-gallery')).toBeInTheDocument()
    // No error or retry affordance
    expect(screen.queryByRole('button', {name: 'Try Again'})).not.toBeInTheDocument()
    expect(screen.queryByText(/rate limit/i)).not.toBeInTheDocument()
    expect(screen.queryByText('Error Loading Projects')).not.toBeInTheDocument()
  })

  it('should open modal when project is previewed', () => {
    mockUseProjects.mockReturnValue({projects: mockProjects})

    render(<ProjectsWrapper />)

    expect(screen.queryByTestId('project-modal')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', {name: 'Preview Project'}))
    expect(screen.getByTestId('project-modal')).toBeInTheDocument()
  })

  it('should close modal when close is triggered', () => {
    mockUseProjects.mockReturnValue({projects: mockProjects})

    render(<ProjectsWrapper />)

    fireEvent.click(screen.getByRole('button', {name: 'Preview Project'}))
    expect(screen.getByTestId('project-modal')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', {name: 'Close Modal'}))
    expect(screen.queryByTestId('project-modal')).not.toBeInTheDocument()
  })
})
