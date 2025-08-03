/**
 * @jest-environment happy-dom
 */

import type {Project} from '../../src/types'
import {fireEvent, render, screen, waitFor} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import ProjectPreviewModal from '../../src/components/ProjectPreviewModal'

// Mock the UseProgressiveImage hook
vi.mock('../../src/hooks/UseProgressiveImage', () => ({
  useProgressiveImage: () => ({
    imgRef: {current: null},
    isLoaded: true,
    isError: false,
  }),
}))

// Mock accessibility utilities
vi.mock('../../src/utils/accessibility', () => ({
  handleEscapeKey: vi.fn((event, onClose) => {
    if (event.key === 'Escape' && onClose) {
      event.preventDefault()
      onClose()
    }
  }),
  trapFocus: vi.fn(),
}))

const mockProjects: Project[] = [
  {
    id: '1',
    title: 'Test Project 1',
    description: 'A test project for unit testing',
    url: 'https://github.com/test/project1',
    language: 'TypeScript',
    stars: 10,
    homepage: 'https://project1.demo.com',
    topics: ['react', 'typescript', 'testing'],
    lastUpdated: '2025-01-01T00:00:00Z',
    imageUrl: 'https://example.com/project1.jpg',
  },
  {
    id: '2',
    title: 'Test Project 2',
    description: 'Another test project',
    url: 'https://github.com/test/project2',
    language: 'JavaScript',
    stars: 5,
    topics: ['node', 'api'],
    lastUpdated: '2025-01-02T00:00:00Z',
    imageUrl: 'https://example.com/project2.jpg',
  },
  {
    id: '3',
    title: 'Test Project 3',
    description: 'Third test project without homepage',
    url: 'https://github.com/test/project3',
    language: 'Python',
    stars: 15,
    topics: ['python', 'ml'],
    lastUpdated: '2025-01-03T00:00:00Z',
  },
]

describe('ProjectPreviewModal', () => {
  const mockOnClose = vi.fn()
  const mockOnNavigate = vi.fn()

  // Safely extract projects with proper typing
  const project1 = mockProjects[0] as Project
  const project2 = mockProjects[1] as Project
  const project3 = mockProjects[2] as Project

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset body overflow style
    document.body.style.overflow = ''
  })

  it('renders nothing when not open', () => {
    render(
      <ProjectPreviewModal
        project={null}
        projects={mockProjects}
        isOpen={false}
        onClose={mockOnClose}
        onNavigate={mockOnNavigate}
      />,
    )

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders modal when open with project', () => {
    render(
      <ProjectPreviewModal
        project={project1}
        projects={mockProjects}
        isOpen={true}
        onClose={mockOnClose}
        onNavigate={mockOnNavigate}
      />,
    )

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Test Project 1')).toBeInTheDocument()
    expect(screen.getByText('A test project for unit testing')).toBeInTheDocument()
    expect(screen.getByText(/10/)).toBeInTheDocument() // stars with emoji
    expect(screen.getByText('TypeScript')).toBeInTheDocument()
  })

  it('shows project topics when available', () => {
    render(
      <ProjectPreviewModal
        project={project1}
        projects={mockProjects}
        isOpen={true}
        onClose={mockOnClose}
        onNavigate={mockOnNavigate}
      />,
    )

    expect(screen.getByText('react')).toBeInTheDocument()
    expect(screen.getByText('typescript')).toBeInTheDocument()
    expect(screen.getByText('testing')).toBeInTheDocument()
  })

  it('shows both Code and Demo links when homepage is available', () => {
    render(
      <ProjectPreviewModal
        project={project1}
        projects={mockProjects}
        isOpen={true}
        onClose={mockOnClose}
        onNavigate={mockOnNavigate}
      />,
    )

    const codeLink = screen.getByRole('link', {name: /View Code/i})
    const demoLink = screen.getByRole('link', {name: /Live Demo/i})

    expect(codeLink).toHaveAttribute('href', 'https://github.com/test/project1')
    expect(demoLink).toHaveAttribute('href', 'https://project1.demo.com')
  })

  it('shows only Code link when homepage is not available', () => {
    render(
      <ProjectPreviewModal
        project={project3}
        projects={mockProjects}
        isOpen={true}
        onClose={mockOnClose}
        onNavigate={mockOnNavigate}
      />,
    )

    expect(screen.getByRole('link', {name: /View Code/i})).toBeInTheDocument()
    expect(screen.queryByRole('link', {name: /Live Demo/i})).not.toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', () => {
    render(
      <ProjectPreviewModal
        project={project1}
        projects={mockProjects}
        isOpen={true}
        onClose={mockOnClose}
        onNavigate={mockOnNavigate}
      />,
    )

    const closeButton = screen.getByRole('button', {name: /Close project preview/i})
    fireEvent.click(closeButton)

    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when backdrop is clicked', () => {
    render(
      <ProjectPreviewModal
        project={project1}
        projects={mockProjects}
        isOpen={true}
        onClose={mockOnClose}
        onNavigate={mockOnNavigate}
      />,
    )

    const backdrop = screen.getByRole('dialog').parentElement
    if (backdrop) {
      fireEvent.click(backdrop)
      expect(mockOnClose).toHaveBeenCalledTimes(1)
    }
  })

  it('does not close when clicking modal content', () => {
    render(
      <ProjectPreviewModal
        project={project1}
        projects={mockProjects}
        isOpen={true}
        onClose={mockOnClose}
        onNavigate={mockOnNavigate}
      />,
    )

    const modalContent = screen.getByRole('dialog')
    fireEvent.click(modalContent)

    expect(mockOnClose).not.toHaveBeenCalled()
  })

  it('shows navigation buttons when multiple projects', () => {
    render(
      <ProjectPreviewModal
        project={project2}
        projects={mockProjects}
        isOpen={true}
        onClose={mockOnClose}
        onNavigate={mockOnNavigate}
      />,
    )

    expect(screen.getByRole('button', {name: /Previous project/i})).toBeInTheDocument()
    expect(screen.getByRole('button', {name: /Next project/i})).toBeInTheDocument()
  })

  it('disables previous button on first project', () => {
    render(
      <ProjectPreviewModal
        project={project1}
        projects={mockProjects}
        isOpen={true}
        onClose={mockOnClose}
        onNavigate={mockOnNavigate}
      />,
    )

    const prevButton = screen.getByRole('button', {name: /Previous project/i})
    expect(prevButton).toBeDisabled()
  })

  it('disables next button on last project', () => {
    render(
      <ProjectPreviewModal
        project={project3}
        projects={mockProjects}
        isOpen={true}
        onClose={mockOnClose}
        onNavigate={mockOnNavigate}
      />,
    )

    const nextButton = screen.getByRole('button', {name: /Next project/i})
    expect(nextButton).toBeDisabled()
  })

  it('calls onNavigate when previous button is clicked', () => {
    render(
      <ProjectPreviewModal
        project={project2}
        projects={mockProjects}
        isOpen={true}
        onClose={mockOnClose}
        onNavigate={mockOnNavigate}
      />,
    )

    const prevButton = screen.getByRole('button', {name: /Previous project/i})
    fireEvent.click(prevButton)

    expect(mockOnNavigate).toHaveBeenCalledWith(project1)
  })

  it('calls onNavigate when next button is clicked', () => {
    render(
      <ProjectPreviewModal
        project={project1}
        projects={mockProjects}
        isOpen={true}
        onClose={mockOnClose}
        onNavigate={mockOnNavigate}
      />,
    )

    const nextButton = screen.getByRole('button', {name: /Next project/i})
    fireEvent.click(nextButton)

    expect(mockOnNavigate).toHaveBeenCalledWith(project2)
  })

  it('handles keyboard navigation - Escape key', () => {
    render(
      <ProjectPreviewModal
        project={project1}
        projects={mockProjects}
        isOpen={true}
        onClose={mockOnClose}
        onNavigate={mockOnNavigate}
      />,
    )

    const modal = screen.getByRole('dialog')
    fireEvent.keyDown(modal, {key: 'Escape'})

    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  it('handles keyboard navigation - Arrow left for previous project', () => {
    render(
      <ProjectPreviewModal
        project={project2}
        projects={mockProjects}
        isOpen={true}
        onClose={mockOnClose}
        onNavigate={mockOnNavigate}
      />,
    )

    const modal = screen.getByRole('dialog')
    fireEvent.keyDown(modal, {key: 'ArrowLeft'})

    expect(mockOnNavigate).toHaveBeenCalledWith(project1)
  })

  it('handles keyboard navigation - Arrow right for next project', () => {
    render(
      <ProjectPreviewModal
        project={project1}
        projects={mockProjects}
        isOpen={true}
        onClose={mockOnClose}
        onNavigate={mockOnNavigate}
      />,
    )

    const modal = screen.getByRole('dialog')
    fireEvent.keyDown(modal, {key: 'ArrowRight'})

    expect(mockOnNavigate).toHaveBeenCalledWith(project2)
  })

  it('shows project counter information', () => {
    render(
      <ProjectPreviewModal
        project={project2}
        projects={mockProjects}
        isOpen={true}
        onClose={mockOnClose}
        onNavigate={mockOnNavigate}
      />,
    )

    expect(screen.getByText('Project 2 of 3')).toBeInTheDocument()
    expect(screen.getByText(/Use ← → keys to navigate/i)).toBeInTheDocument()
  })

  it('hides navigation elements when only one project', () => {
    render(
      <ProjectPreviewModal
        project={project1}
        projects={[project1]}
        isOpen={true}
        onClose={mockOnClose}
        onNavigate={mockOnNavigate}
      />,
    )

    expect(screen.queryByRole('button', {name: /Previous project/i})).not.toBeInTheDocument()
    expect(screen.queryByRole('button', {name: /Next project/i})).not.toBeInTheDocument()
    expect(screen.queryByText(/Project 1 of 1/i)).not.toBeInTheDocument()
  })

  it('shows no image placeholder when imageUrl is not provided', () => {
    render(
      <ProjectPreviewModal
        project={project3}
        projects={mockProjects}
        isOpen={true}
        onClose={mockOnClose}
        onNavigate={mockOnNavigate}
      />,
    )

    expect(screen.getByText('No preview image available')).toBeInTheDocument()
  })

  it('prevents body scroll when modal is open', async () => {
    const {rerender} = render(
      <ProjectPreviewModal
        project={project1}
        projects={mockProjects}
        isOpen={true}
        onClose={mockOnClose}
        onNavigate={mockOnNavigate}
      />,
    )

    await waitFor(() => {
      expect(document.body.style.overflow).toBe('hidden')
    })

    // Close modal
    rerender(
      <ProjectPreviewModal
        project={project1}
        projects={mockProjects}
        isOpen={false}
        onClose={mockOnClose}
        onNavigate={mockOnNavigate}
      />,
    )

    await waitFor(() => {
      expect(document.body.style.overflow).toBe('')
    })
  })

  it('has proper ARIA attributes', () => {
    render(
      <ProjectPreviewModal
        project={project1}
        projects={mockProjects}
        isOpen={true}
        onClose={mockOnClose}
        onNavigate={mockOnNavigate}
      />,
    )

    const modal = screen.getByRole('dialog')
    expect(modal).toHaveAttribute('aria-modal', 'true')
    expect(modal).toHaveAttribute('aria-labelledby')
    expect(modal).toHaveAttribute('aria-describedby')
  })

  it('handles touch gestures for mobile navigation', () => {
    render(
      <ProjectPreviewModal
        project={project2}
        projects={mockProjects}
        isOpen={true}
        onClose={mockOnClose}
        onNavigate={mockOnNavigate}
      />,
    )

    const backdrop = screen.getByRole('dialog').parentElement

    if (backdrop) {
      // Simulate swipe right (previous project)
      fireEvent.touchStart(backdrop, {
        targetTouches: [{clientX: 100}],
      })
      fireEvent.touchMove(backdrop, {
        targetTouches: [{clientX: 200}],
      })
      fireEvent.touchEnd(backdrop)

      expect(mockOnNavigate).toHaveBeenCalledWith(project1)

      vi.clearAllMocks()

      // Simulate swipe left (next project)
      fireEvent.touchStart(backdrop, {
        targetTouches: [{clientX: 200}],
      })
      fireEvent.touchMove(backdrop, {
        targetTouches: [{clientX: 100}],
      })
      fireEvent.touchEnd(backdrop)

      expect(mockOnNavigate).toHaveBeenCalledWith(project3)
    }
  })

  it('handles edge cases for project navigation', () => {
    // Test navigation from first project (should not navigate backwards)
    render(
      <ProjectPreviewModal
        project={project1}
        projects={mockProjects}
        isOpen={true}
        onClose={mockOnClose}
        onNavigate={mockOnNavigate}
      />,
    )

    const modal = screen.getByRole('dialog')
    fireEvent.keyDown(modal, {key: 'ArrowLeft'})

    expect(mockOnNavigate).not.toHaveBeenCalled()
  })

  it('applies correct CSS classes for modal state', () => {
    const {container} = render(
      <ProjectPreviewModal
        project={project1}
        projects={mockProjects}
        isOpen={true}
        onClose={mockOnClose}
        onNavigate={mockOnNavigate}
      />,
    )

    const modalElement = container.querySelector('.project-preview-modal')
    expect(modalElement).toHaveClass('project-preview-modal--open')
  })
})
