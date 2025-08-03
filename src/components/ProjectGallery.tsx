import type {Project} from '../types'
import React from 'react'
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

  // Apply maxProjects limit if specified
  const displayProjects = maxProjects ? filteredProjects.slice(0, maxProjects) : filteredProjects

  // Use scroll animation for the gallery grid
  const {ref: gridRef, animationState} = useScrollAnimation<HTMLDivElement>({
    threshold: 0.1,
    rootMargin: '0px 0px -100px 0px',
    triggerOnce: true,
  })

  return (
    <div className="project-gallery">
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
                <button className="project-gallery__empty-button" onClick={clearAllFilters}>
                  Clear All Filters
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* View More Link (if limited) */}
      {maxProjects && filteredProjects.length > maxProjects && (
        <div className="project-gallery__view-more">
          <a href="/projects" className="project-gallery__view-more-link">
            View All {filteredProjects.length} Projects →
          </a>
        </div>
      )}
    </div>
  )
}

export default ProjectGallery
