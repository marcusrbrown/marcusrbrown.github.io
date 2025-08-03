import type {ProjectFilters} from '../hooks/UseProjectFilter'
import React from 'react'

interface ProjectFilterProps {
  availableFilters: {
    technologies: string[]
    types: string[]
    status: string[]
  }
  activeFilters: ProjectFilters
  onTechnologyFilter: (technology: string) => void
  onTypeFilter: (type: string) => void
  onStatusFilter: (status: string) => void
  onClearAll: () => void
  onClearCategory: (category: keyof ProjectFilters) => void
  hasActiveFilters: boolean
}

const ProjectFilter: React.FC<ProjectFilterProps> = ({
  availableFilters,
  activeFilters,
  onTechnologyFilter,
  onTypeFilter,
  onStatusFilter,
  onClearAll,
  onClearCategory,
  hasActiveFilters,
}) => {
  return (
    <div className="project-filter">
      <div className="project-filter__header">
        <h3 className="project-filter__title">Filter Projects</h3>
        {hasActiveFilters && (
          <button className="project-filter__clear-all" onClick={onClearAll} aria-label="Clear all filters">
            Clear All
          </button>
        )}
      </div>

      {/* Technology Filters */}
      {availableFilters.technologies.length > 0 && (
        <div className="project-filter__category">
          <div className="project-filter__category-header">
            <h4 className="project-filter__category-title">Technologies</h4>
            {activeFilters.technologies.length > 0 && (
              <button
                className="project-filter__clear-category"
                onClick={() => onClearCategory('technologies')}
                aria-label="Clear technology filters"
              >
                Clear
              </button>
            )}
          </div>
          <div className="project-filter__chips">
            {availableFilters.technologies.map(tech => (
              <button
                key={tech}
                className={`project-filter__chip ${
                  activeFilters.technologies.includes(tech) ? 'project-filter__chip--active' : ''
                }`}
                onClick={() => onTechnologyFilter(tech)}
                aria-pressed={activeFilters.technologies.includes(tech)}
              >
                {tech}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Type Filters */}
      {availableFilters.types.length > 0 && (
        <div className="project-filter__category">
          <div className="project-filter__category-header">
            <h4 className="project-filter__category-title">Project Type</h4>
            {activeFilters.types.length > 0 && (
              <button
                className="project-filter__clear-category"
                onClick={() => onClearCategory('types')}
                aria-label="Clear type filters"
              >
                Clear
              </button>
            )}
          </div>
          <div className="project-filter__chips">
            {availableFilters.types.map(type => (
              <button
                key={type}
                className={`project-filter__chip ${
                  activeFilters.types.includes(type) ? 'project-filter__chip--active' : ''
                }`}
                onClick={() => onTypeFilter(type)}
                aria-pressed={activeFilters.types.includes(type)}
              >
                {type}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Status Filters */}
      {availableFilters.status.length > 0 && (
        <div className="project-filter__category">
          <div className="project-filter__category-header">
            <h4 className="project-filter__category-title">Status</h4>
            {activeFilters.status.length > 0 && (
              <button
                className="project-filter__clear-category"
                onClick={() => onClearCategory('status')}
                aria-label="Clear status filters"
              >
                Clear
              </button>
            )}
          </div>
          <div className="project-filter__chips">
            {availableFilters.status.map(status => (
              <button
                key={status}
                className={`project-filter__chip ${
                  activeFilters.status.includes(status) ? 'project-filter__chip--active' : ''
                }`}
                onClick={() => onStatusFilter(status)}
                aria-pressed={activeFilters.status.includes(status)}
              >
                {status}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Active Filters Summary */}
      {hasActiveFilters && (
        <div className="project-filter__summary">
          <span className="project-filter__summary-text">
            {getActiveCounts(activeFilters)} filter{getTotalActiveFilters(activeFilters) === 1 ? '' : 's'} active
          </span>
        </div>
      )}
    </div>
  )
}

// Helper functions
function getActiveCounts(filters: ProjectFilters): number {
  return filters.technologies.length + filters.types.length + filters.status.length
}

function getTotalActiveFilters(filters: ProjectFilters): number {
  return getActiveCounts(filters)
}

export default ProjectFilter
