import type {Project} from '../types'
import React, {useState} from 'react'
import {useProjectFilter} from '../hooks/UseProjectFilter'
import {getAnimationClasses, getStaggerDelay, useScrollAnimation} from '../hooks/UseScrollAnimation'
import ProjectCard from './ProjectCard'
import ProjectFilter from './ProjectFilter'

interface ProjectGalleryProps {
  projects: Project[]
  showFilter?: boolean
  title?: string
  subtitle?: string
  maxProjects?: number
  onProjectPreview?: (project: Project) => void
}

const ProjectGallery: React.FC<ProjectGalleryProps> = ({
  projects,
  showFilter = false,
  title,
  subtitle,
  maxProjects,
  onProjectPreview,
}) => {
  // State for expandable "View More" functionality
  const [isExpanded, setIsExpanded] = useState(false)

  const {
    filteredProjects,
    activeFilters,
    availableFilters,
    setTechnologyFilter,
    setTypeFilter,
    setStatusFilter,
    clearAllFilters,
    clearFilterCategory,
    hasActiveFilters,
  } = useProjectFilter(projects)

  // Calculate projects to display based on maxProjects limit and expanded state
  const shouldLimitProjects = maxProjects && !isExpanded
  const displayProjects = shouldLimitProjects ? filteredProjects.slice(0, maxProjects) : filteredProjects

  // Additional projects shown when expanded (for animation purposes)
  const additionalProjects = maxProjects && isExpanded ? filteredProjects.slice(maxProjects) : []

  // Use scroll animation for the gallery grid
  const {ref: gridRef, animationState} = useScrollAnimation<HTMLDivElement>({
    threshold: 0.1,
    rootMargin: '0px 0px -100px 0px',
    triggerOnce: true,
  })

  // Use separate scroll animation for additional projects
  const {ref: additionalGridRef, animationState: additionalAnimationState} = useScrollAnimation<HTMLDivElement>({
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px',
    triggerOnce: true,
  })

  const handleExpandToggle = () => {
    setIsExpanded(!isExpanded)
  }

  return (
    <div className="project-gallery" data-testid="project-gallery">
      {/* Gallery Header */}
      {(title || subtitle) && (
        <header className="project-gallery__header">
          {title && <h2 className="project-gallery__title">{title}</h2>}
          {subtitle && <p className="project-gallery__subtitle">{subtitle}</p>}
        </header>
      )}

      {/* Project Filter */}
      {showFilter && (
        <div className="project-gallery__filter">
          <ProjectFilter
            availableFilters={availableFilters}
            activeFilters={activeFilters}
            onTechnologyFilter={setTechnologyFilter}
            onTypeFilter={setTypeFilter}
            onStatusFilter={setStatusFilter}
            onClearAll={clearAllFilters}
            onClearCategory={clearFilterCategory}
            hasActiveFilters={hasActiveFilters}
          />
        </div>
      )}

      {/* Results Summary */}
      {showFilter && (
        <div className="project-gallery__results">
          <span className="project-gallery__results-count">
            {displayProjects.length} of {projects.length} projects
            {hasActiveFilters && ' (filtered)'}
          </span>
        </div>
      )}

      {/* Project Grid */}
      <div ref={gridRef} className={`project-gallery__grid ${getAnimationClasses(animationState, 'project-grid')}`}>
        {displayProjects.length > 0 ? (
          displayProjects.map((project, index) => (
            <div
              key={project.id}
              className="project-gallery__item"
              style={{
                animationDelay: `${getStaggerDelay(index, 0, 150)}ms`,
              }}
            >
              <ProjectCard {...project} onPreview={onProjectPreview} />
            </div>
          ))
        ) : (
          <div className="project-gallery__empty">
            <div className="project-gallery__empty-content">
              <h3 className="project-gallery__empty-title">
                {hasActiveFilters ? 'No projects match your filters' : 'No projects found'}
              </h3>
              <p className="project-gallery__empty-description">
                {hasActiveFilters
                  ? 'Try adjusting your filters to see more results.'
                  : 'Check back later for new projects.'}
              </p>
              {hasActiveFilters && (
                <button type="button" className="project-gallery__empty-button" onClick={clearAllFilters}>
                  Clear All Filters
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Additional Projects Grid (expanded state) */}
      {maxProjects && isExpanded && additionalProjects.length > 0 && (
        <div
          ref={additionalGridRef}
          className={`project-gallery__grid project-gallery__grid--additional ${getAnimationClasses(additionalAnimationState, 'project-grid-additional')}`}
        >
          {additionalProjects.map((project, index) => (
            <div
              key={project.id}
              className="project-gallery__item project-gallery__item--additional"
              style={{
                animationDelay: `${getStaggerDelay(index, 100, 100)}ms`,
              }}
            >
              <ProjectCard {...project} onPreview={onProjectPreview} />
            </div>
          ))}
        </div>
      )}

      {/* View More/Less Button (if limited) */}
      {maxProjects && filteredProjects.length > maxProjects && (
        <div className="project-gallery__view-more">
          <button
            type="button"
            className={`project-gallery__view-more-button ${isExpanded ? 'project-gallery__view-more-button--expanded' : ''}`}
            onClick={handleExpandToggle}
            aria-expanded={isExpanded}
            aria-controls="additional-projects"
          >
            <span className="project-gallery__view-more-text">
              {isExpanded ? `Show Less Projects` : `View ${filteredProjects.length - maxProjects} More Projects`}
            </span>
            <span
              className={`project-gallery__view-more-icon ${isExpanded ? 'project-gallery__view-more-icon--expanded' : ''}`}
            >
              {isExpanded ? '↑' : '↓'}
            </span>
          </button>
        </div>
      )}
    </div>
  )
}

export default ProjectGallery
