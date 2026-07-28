import type {Project} from '../types'
import React, {useState} from 'react'
import ProjectGallery from '../components/ProjectGallery'
import ProjectPreviewModal from '../components/ProjectPreviewModal'
import {usePageTitle} from '../hooks/UsePageTitle'
import {useProjects} from '../hooks/UseProjects'

const Projects: React.FC = () => {
  usePageTitle('Projects')
  const {projects} = useProjects()
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
