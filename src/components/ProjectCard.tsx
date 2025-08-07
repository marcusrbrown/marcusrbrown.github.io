import type {Project} from '../types'
import React from 'react'
import {useProgressiveImage} from '../hooks/UseProgressiveImage'

interface ProjectCardProps extends Project {
  onPreview?: (project: Project) => void
}

const ProjectCard: React.FC<ProjectCardProps> = ({
  id,
  title,
  description,
  url,
  language,
  stars,
  homepage,
  topics = [],
  lastUpdated,
  imageUrl,
  onPreview,
}) => {
  const {imgRef, isLoaded, isError} = useProgressiveImage(imageUrl)
  const handlePreviewClick = (e: React.MouseEvent) => {
    e.preventDefault()
    if (onPreview) {
      onPreview({id, title, description, url, language, stars, homepage, topics, lastUpdated, imageUrl})
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (onPreview) {
        onPreview({id, title, description, url, language, stars, homepage, topics, lastUpdated, imageUrl})
      }
    }
  }

  return (
    <div
      className="project-card"
      data-testid="project-card"
      tabIndex={0}
      role="button"
      aria-label={`View details for ${title}`}
      onClick={handlePreviewClick}
      onKeyDown={handleKeyDown}
    >
      {/* Project Image/Thumbnail Area */}
      <div className="project-card__image">
        <div className="project-card__image-placeholder">
          {imageUrl && (
            <img
              ref={imgRef}
              src={imageUrl}
              alt={`${title} project screenshot`}
              className={`project-card__image-img ${isLoaded ? 'project-card__image-img--loaded' : ''} ${isError ? 'project-card__image-img--error' : ''}`}
              loading="lazy"
            />
          )}
          <div className="project-card__language-badge">
            <span className={`language-badge language-badge--${language.toLowerCase().replaceAll(' ', '-')}`}>
              {language}
            </span>
          </div>
          <div className="project-card__stats">
            <span className="project-card__stars" aria-label={`${stars} stars`}>
              ⭐ {stars}
            </span>
          </div>
        </div>
        <div className="project-card__overlay">
          <div className="project-card__overlay-content">
            <button
              className="project-card__preview-btn"
              onClick={e => {
                e.stopPropagation()
                handlePreviewClick(e)
              }}
              aria-label={`Preview ${title}`}
            >
              👁️ Preview
            </button>
            <div className="project-card__links">
              <a
                href={url}
                className="project-card__link project-card__link--github"
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                aria-label={`View ${title} on GitHub`}
              >
                📂 Code
              </a>
              {homepage && (
                <a
                  href={homepage}
                  className="project-card__link project-card__link--demo"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  aria-label={`View live demo of ${title}`}
                >
                  🚀 Demo
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Project Content */}
      <div className="project-card__content">
        <header className="project-card__header">
          <h3 className="project-card__title">{title}</h3>
          {topics.length > 0 && (
            <div className="project-card__topics">
              {topics.slice(0, 3).map(topic => (
                <span key={topic} className="project-card__topic">
                  {topic}
                </span>
              ))}
              {topics.length > 3 && (
                <span className="project-card__topic project-card__topic--more">+{topics.length - 3}</span>
              )}
            </div>
          )}
        </header>

        <p className="project-card__description">{description}</p>

        {lastUpdated && (
          <time
            className="project-card__updated"
            dateTime={lastUpdated}
            title={`Last updated: ${new Date(lastUpdated).toLocaleDateString()}`}
          >
            Updated {new Date(lastUpdated).toLocaleDateString()}
          </time>
        )}
      </div>
    </div>
  )
}

export default ProjectCard
