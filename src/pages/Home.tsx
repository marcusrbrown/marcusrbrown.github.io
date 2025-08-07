import type {Project} from '../types'
import React, {useState} from 'react'
import AboutSection from '../components/AboutSection'
import BlogPost from '../components/BlogPost'
import ContactCta from '../components/ContactCta'
import HeroSection from '../components/HeroSection'
import LoadingState, {BlogPostSkeleton, ProjectCardSkeleton} from '../components/LoadingStates'
import ProjectGallery from '../components/ProjectGallery'
import ProjectPreviewModal from '../components/ProjectPreviewModal'
import SkillsShowcase from '../components/SkillsShowcase'
import SmoothScrollNav from '../components/SmoothScrollNav'
import {useErrorTracking, useProjectTracking, useSectionTracking} from '../hooks/UseAnalytics'
import {useGitHub} from '../hooks/UseGitHub'
import {usePageTitle} from '../hooks/UsePageTitle'
import '../styles/landing-page.css'

const Home: React.FC = () => {
  usePageTitle('Home')
  const {projects, blogPosts, loading, error} = useGitHub()
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Analytics tracking hooks
  const {trackError} = useErrorTracking()
  const {trackProjectClick, trackProjectModal} = useProjectTracking()
  const heroRef = useSectionTracking<HTMLDivElement>('hero')
  const skillsRef = useSectionTracking<HTMLDivElement>('skills')
  const aboutRef = useSectionTracking<HTMLDivElement>('about')
  const projectsRef = useSectionTracking<HTMLElement>('projects')
  const blogRef = useSectionTracking<HTMLElement>('blog')

  const handleProjectPreview = (project: Project) => {
    trackProjectClick(project.id, 'gallery')
    trackProjectModal('open', project.id)
    setSelectedProject(project)
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    if (selectedProject) {
      trackProjectModal('close', selectedProject.id)
    }
    setIsModalOpen(false)
    setSelectedProject(null)
  }

  const handleNavigateProject = (project: Project) => {
    if (selectedProject) {
      trackProjectModal('navigate', selectedProject.id)
    }
    trackProjectModal('view', project.id)
    setSelectedProject(project)
  }

  // Track errors from GitHub API
  if (error) {
    trackError(`GitHub API Error: ${error}`, 'useGitHub')
  }

  // Create skeleton components for loading states
  const projectsSkeleton = (
    <div className="project-list">
      {Array.from({length: 6}).map((_, index) => (
        <ProjectCardSkeleton key={index} />
      ))}
    </div>
  )

  const blogPostsSkeleton = (
    <div className="blog-list">
      {Array.from({length: 3}).map((_, index) => (
        <BlogPostSkeleton key={index} />
      ))}
    </div>
  )

  return (
    <div className="home-page">
      {/* Hero Section */}
      <div ref={heroRef}>
        <HeroSection />
      </div>

      {/* Skills & Expertise Showcase */}
      <div ref={skillsRef}>
        <SkillsShowcase />
      </div>

      {/* About Section with Professional Story */}
      <div ref={aboutRef}>
        <AboutSection />
      </div>

      {/* Featured Projects Section */}
      <section id="projects" className="projects-section" ref={projectsRef}>
        <div className="container">
          <LoadingState loading={loading} error={error} skeleton={projectsSkeleton}>
            <ProjectGallery
              projects={projects}
              title="Featured Projects"
              subtitle="A selection of my recent work showcasing modern web development practices"
              maxProjects={6}
              showFilter={false}
              onProjectPreview={handleProjectPreview}
            />
          </LoadingState>
        </div>
      </section>

      {/* Latest Blog Posts Section */}
      <section id="blog" className="blog-section" ref={blogRef}>
        <div className="container">
          <header className="section-header">
            <h2 className="section-title">Latest Blog Posts</h2>
            <p className="section-subtitle">Thoughts on web development, best practices, and emerging technologies</p>
          </header>
          <LoadingState loading={loading} error={error} skeleton={blogPostsSkeleton}>
            <div className="blog-list">
              {blogPosts.map(post => (
                <BlogPost key={post.id} {...post} />
              ))}
            </div>
          </LoadingState>
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

      {/* Smooth Scroll Navigation */}
      <SmoothScrollNav />
    </div>
  )
}

export default Home
