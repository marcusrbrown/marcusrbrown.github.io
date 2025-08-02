import React from 'react'
import ProjectCard from '../components/ProjectCard'
import {useGitHub} from '../hooks/UseGitHub'

const Projects: React.FC = () => {
  const {projects, loading, error} = useGitHub()

  if (loading) {
    return <div>Loading projects...</div>
  }

  if (error) {
    return <div>Error loading projects: {error}</div>
  }

  return (
    <div>
      <h1>My Projects</h1>
      <div className="project-list">
        {projects.map(project => (
          <ProjectCard key={project.id} {...project} />
        ))}
      </div>
    </div>
  )
}

export default Projects
