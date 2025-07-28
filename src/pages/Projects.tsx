import React from 'react'
import ProjectCard from '../components/ProjectCard'
import {useGitHub} from '../hooks/UseGitHub'

const Projects: React.FC = () => {
  const {repos, loading, error} = useGitHub()

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
        {repos.map((repo: {id: number; name: string; description: string; html_url: string}) => (
          <ProjectCard key={repo.id} title={repo.name} description={repo.description} url={repo.html_url} />
        ))}
      </div>
    </div>
  )
}

export default Projects
