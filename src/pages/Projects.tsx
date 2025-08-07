import type {Project} from '../types'
import React, {useState} from 'react'
import ProjectGallery from '../components/ProjectGallery'
import ProjectPreviewModal from '../components/ProjectPreviewModal'
import {useGitHub} from '../hooks/UseGitHub'
import {usePageTitle} from '../hooks/UsePageTitle'

const Projects: React.FC = () => {
  usePageTitle('Projects')
  const {projects, loading, error} = useGitHub()
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const handleProjectPreview = (project: Project) => {
    setSelectedProject(project)
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setSelectedProject(null)
  }

  const handleNavigateProject = (project: Project) => {
    setSelectedProject(project)
  }

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
          onProjectPreview={handleProjectPreview}
        />
      </div>

      {/* Project Preview Modal */}
      <ProjectPreviewModal
        project={selectedProject}
        projects={projects}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onNavigate={handleNavigateProject}
      />
    </div>
  )
}

export default Projects
