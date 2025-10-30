/**
 * ProjectPreviewModal Component
 *
 * Full-screen modal for project previews with image carousel, project details,
 * and comprehensive keyboard navigation. Features smooth animations and mobile-friendly interactions.
 */

import type {Project} from '../types'
import React, {useCallback, useEffect, useRef, useState} from 'react'
import {useProgressiveImage} from '../hooks/UseProgressiveImage'
import {handleEscapeKey, trapFocus} from '../utils/accessibility'

interface ProjectPreviewModalProps {
  project: Project | null
  projects: Project[]
  isOpen: boolean
  onClose: () => void
  onNavigate?: (project: Project) => void
}

const ProjectPreviewModal: React.FC<ProjectPreviewModalProps> = ({project, projects, isOpen, onClose, onNavigate}) => {
  const modalRef = useRef<HTMLDivElement>(null)
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const {imgRef, isLoaded, isError} = useProgressiveImage(project?.imageUrl)

  // Find current project index for navigation
  const currentProjectIndex = project ? projects.findIndex(p => p.id === project.id) : -1

  // Generate image sources (for now, just the main image - can be extended for carousel)
  const imageSources = project?.imageUrl ? [project.imageUrl] : []

  // Project navigation functions
  const navigateToPreviousProject = useCallback(() => {
    if (currentProjectIndex > 0) {
      const previousProject = projects[currentProjectIndex - 1]
      if (previousProject && onNavigate) {
        setCurrentImageIndex(0) // Reset image index when navigating
        onNavigate(previousProject)
      }
    }
  }, [currentProjectIndex, projects, onNavigate])

  const navigateToNextProject = useCallback(() => {
    if (currentProjectIndex < projects.length - 1) {
      const nextProject = projects[currentProjectIndex + 1]
      if (nextProject && onNavigate) {
        setCurrentImageIndex(0) // Reset image index when navigating
        onNavigate(nextProject)
      }
    }
  }, [currentProjectIndex, projects, onNavigate])

  // Image carousel navigation functions
  const navigateToPreviousImage = useCallback(() => {
    setCurrentImageIndex(prev => (prev > 0 ? prev - 1 : imageSources.length - 1))
  }, [imageSources.length])

  const navigateToNextImage = useCallback(() => {
    setCurrentImageIndex(prev => (prev < imageSources.length - 1 ? prev + 1 : 0))
  }, [imageSources.length])

  // Handle modal open/close effects
  useEffect(() => {
    if (isOpen && modalRef.current) {
      // Focus modal when opened
      if (modalRef.current) {
        modalRef.current.focus()
      }
      // Prevent body scroll
      document.body.style.overflow = 'hidden'
    } else {
      // Restore body scroll
      document.body.style.overflow = ''
    }

    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      // Handle escape key
      handleEscapeKey(event, onClose)

      // Handle focus trapping
      if (modalRef.current) {
        trapFocus(event, modalRef as React.RefObject<HTMLElement>)
      }

      // Handle arrow key navigation
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        navigateToPreviousProject()
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        navigateToNextProject()
      }

      // Handle image carousel navigation
      if (imageSources.length > 1) {
        if (event.key === 'ArrowUp') {
          event.preventDefault()
          navigateToPreviousImage()
        } else if (event.key === 'ArrowDown') {
          event.preventDefault()
          navigateToNextImage()
        }
      }
    },
    [
      onClose,
      imageSources.length,
      navigateToPreviousProject,
      navigateToNextProject,
      navigateToPreviousImage,
      navigateToNextImage,
    ],
  )

  // Handle backdrop click to close
  const handleBackdropClick = useCallback(
    (event: React.MouseEvent) => {
      if (event.target === event.currentTarget) {
        onClose()
      }
    },
    [onClose],
  )

  // Handle touch/swipe gestures for mobile
  const [touchStart, setTouchStart] = useState<number | null>(null)
  const [touchEnd, setTouchEnd] = useState<number | null>(null)

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null)
    setTouchStart(e.targetTouches[0]?.clientX || 0)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0]?.clientX || 0)
  }

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return

    const distance = touchStart - touchEnd
    const isLeftSwipe = distance > 50
    const isRightSwipe = distance < -50

    if (isLeftSwipe) {
      navigateToNextProject()
    } else if (isRightSwipe) {
      navigateToPreviousProject()
    }
  }

  if (!isOpen || !project) {
    return null
  }

  return (
    <div
      className={`project-preview-modal ${isOpen ? 'project-preview-modal--open' : ''}`}
      onClick={handleBackdropClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div
        ref={modalRef}
        className="project-preview-modal__content"
        onKeyDown={handleKeyDown}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-modal-title"
        aria-describedby="project-modal-description"
      >
        {/* Close Button */}
        <button
          className="project-preview-modal__close"
          onClick={onClose}
          aria-label="Close project preview"
          title="Close preview (ESC)"
        >
          ✕
        </button>

        {/* Navigation Buttons */}
        {projects.length > 1 && (
          <>
            <button
              className="project-preview-modal__nav project-preview-modal__nav--prev"
              onClick={navigateToPreviousProject}
              disabled={currentProjectIndex <= 0}
              aria-label="Previous project"
              title="Previous project (←)"
            >
              ← Previous
            </button>
            <button
              className="project-preview-modal__nav project-preview-modal__nav--next"
              onClick={navigateToNextProject}
              disabled={currentProjectIndex >= projects.length - 1}
              aria-label="Next project"
              title="Next project (→)"
            >
              Next →
            </button>
          </>
        )}

        {/* Modal Content */}
        <div className="project-preview-modal__body">
          {/* Image Section */}
          <div className="project-preview-modal__image-section">
            {imageSources.length > 0 ? (
              <div className="project-preview-modal__image-container">
                <img
                  ref={imgRef}
                  src={imageSources[currentImageIndex]}
                  alt={`${project.title} project screenshot`}
                  className={`project-preview-modal__image ${isLoaded ? 'project-preview-modal__image--loaded' : ''} ${isError ? 'project-preview-modal__image--error' : ''}`}
                />
                {!isLoaded && !isError && (
                  <div className="project-preview-modal__image-placeholder">
                    <div className="project-preview-modal__image-spinner">Loading...</div>
                  </div>
                )}
                {isError && (
                  <div className="project-preview-modal__image-error">
                    <span>📷</span>
                    <p>Image unavailable</p>
                  </div>
                )}

                {/* Image Navigation (if multiple images) */}
                {imageSources.length > 1 && (
                  <div className="project-preview-modal__image-nav">
                    <button onClick={navigateToPreviousImage} aria-label="Previous image" title="Previous image (↑)">
                      ↑
                    </button>
                    <span className="project-preview-modal__image-counter">
                      {currentImageIndex + 1} / {imageSources.length}
                    </span>
                    <button onClick={navigateToNextImage} aria-label="Next image" title="Next image (↓)">
                      ↓
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="project-preview-modal__no-image">
                <span className="project-preview-modal__no-image-icon">📁</span>
                <p>No preview image available</p>
              </div>
            )}
          </div>

          {/* Details Section */}
          <div className="project-preview-modal__details">
            <header className="project-preview-modal__header">
              <h2 id="project-modal-title" className="project-preview-modal__title">
                {project.title}
              </h2>
              <div className="project-preview-modal__meta">
                <span className="project-preview-modal__language">
                  <span
                    className={`language-badge language-badge--${project.language.toLowerCase().replaceAll(' ', '-')}`}
                  >
                    {project.language}
                  </span>
                </span>
                <span className="project-preview-modal__stars" aria-label={`${project.stars} stars`}>
                  ⭐ {project.stars}
                </span>
                {project.lastUpdated && (
                  <time
                    className="project-preview-modal__updated"
                    dateTime={project.lastUpdated}
                    title={`Last updated: ${new Date(project.lastUpdated).toLocaleDateString()}`}
                  >
                    Updated {new Date(project.lastUpdated).toLocaleDateString()}
                  </time>
                )}
              </div>
            </header>

            <div id="project-modal-description" className="project-preview-modal__description">
              <p>{project.description}</p>
            </div>

            {/* Topics/Tags */}
            {project.topics && project.topics.length > 0 && (
              <div className="project-preview-modal__topics">
                <h3 className="project-preview-modal__topics-title">Technologies:</h3>
                <div className="project-preview-modal__topics-list">
                  {project.topics.map(topic => (
                    <span key={topic} className="project-preview-modal__topic">
                      {topic}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="project-preview-modal__actions">
              <a
                href={project.url}
                className="project-preview-modal__button project-preview-modal__button--primary"
                target="_blank"
                rel="noopener noreferrer"
              >
                📂 View Code
              </a>
              {project.homepage && (
                <a
                  href={project.homepage}
                  className="project-preview-modal__button project-preview-modal__button--secondary"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  🚀 Live Demo
                </a>
              )}
            </div>

            {/* Project Navigation Info */}
            {projects.length > 1 && (
              <div className="project-preview-modal__nav-info">
                <p>
                  Project {currentProjectIndex + 1} of {projects.length}
                  <br />
                  <small>Use ← → keys to navigate between projects</small>
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProjectPreviewModal
