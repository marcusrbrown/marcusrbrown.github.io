import type {Project} from '../types'
import React, {useState} from 'react'
import AboutSection from '../components/AboutSection'
import BlogPost from '../components/BlogPost'
import ContactCta from '../components/ContactCta'
import HeroSection from '../components/HeroSection'
import ProjectGallery from '../components/ProjectGallery'
import ProjectPreviewModal from '../components/ProjectPreviewModal'
import SkillsShowcase from '../components/SkillsShowcase'
import {useGitHub} from '../hooks/UseGitHub'
import '../styles/landing-page.css'

const Home: React.FC = () => {
  const {projects, blogPosts} = useGitHub()
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
    <div className="home-page">
      {/* Hero Section */}
      <HeroSection />

      {/* Skills & Expertise Showcase */}
      <SkillsShowcase />

      {/* About Section with Professional Story */}
      <AboutSection />

      {/* Featured Projects Section */}
      <section id="projects" className="projects-section">
        <div className="container">
          <ProjectGallery
            projects={projects}
            title="Featured Projects"
            subtitle="A selection of my recent work showcasing modern web development practices"
            maxProjects={6}
            showFilter={false}
            onProjectPreview={handleProjectPreview}
          />
        </div>
      </section>

      {/* Latest Blog Posts Section */}
      <section id="blog" className="blog-section">
        <div className="container">
          <header className="section-header">
            <h2 className="section-title">Latest Blog Posts</h2>
            <p className="section-subtitle">Thoughts on web development, best practices, and emerging technologies</p>
          </header>
          <div className="blog-list">
            {blogPosts.map(post => (
              <BlogPost key={post.id} {...post} />
            ))}
          </div>
        </div>
      </section>

      {/* Contact CTA Section */}
      <ContactCta />

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

export default Home
