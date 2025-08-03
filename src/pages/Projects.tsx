import React from 'react'
import ProjectGallery from '../components/ProjectGallery'
import {useGitHub} from '../hooks/UseGitHub'

const Projects: React.FC = () => {
  const {projects, loading, error} = useGitHub()

  if (loading) {
    return (
      <div className="projects-page-loading">
        <div className="container">
          <h1>Loading Projects...</h1>
          <p>Fetching the latest projects from GitHub...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="projects-page-error">
        <div className="container">
          <h1>Error Loading Projects</h1>
          <p>Unable to load projects: {error}</p>
          <button onClick={() => window.location.reload()}>Try Again</button>
        </div>
      </div>
    )
  }

  return (
    <div className="projects-page">
      <div className="container">
        <ProjectGallery
          projects={projects}
          title="All Projects"
          subtitle="A comprehensive collection of my development work, open source contributions, and personal projects"
          showFilter={true}
        />
      </div>
    </div>
  )
}

export default Projects
