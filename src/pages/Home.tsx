import type {Project} from '../types'
import React, {useState} from 'react'
import AboutSection from '../components/AboutSection'
import BlogPost from '../components/BlogPost'
import HeroSection from '../components/HeroSection'
import ProjectGallery from '../components/ProjectGallery'
import ProjectPreviewModal from '../components/ProjectPreviewModal'
import SmoothScrollNav from '../components/SmoothScrollNav'
import {useProjectTracking, useSectionTracking} from '../hooks/UseAnalytics'
import {useBlogPosts} from '../hooks/UseBlogPosts'
import {usePageTitle} from '../hooks/UsePageTitle'
import {useProjects} from '../hooks/UseProjects'
import '../styles/landing-page.css'

const HOME_BLOG_PREVIEW_COUNT = 3

const Home: React.FC = () => {
  usePageTitle('Home')
  const {projects} = useProjects()
  const {posts: blogPosts} = useBlogPosts()
  const blogPreview = blogPosts.slice(0, HOME_BLOG_PREVIEW_COUNT)
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Analytics tracking hooks
  const {trackProjectClick, trackProjectModal} = useProjectTracking()
  const heroRef = useSectionTracking<HTMLDivElement>('hero')
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

  return (
    <div className="home-page">
      {/* Hero Section */}
      <div ref={heroRef}>
        <HeroSection />
      </div>

      {/* About Section with Professional Story */}
      <div ref={aboutRef}>
        <AboutSection />
      </div>

      {/* Featured Projects Section */}
      <section id="projects" className="projects-section" ref={projectsRef}>
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
      {blogPreview.length > 0 && (
        <section id="blog" className="blog-section" ref={blogRef}>
          <div className="container">
            <header className="section-header">
              <h2 className="section-title">Latest Blog Posts</h2>
              <p className="section-subtitle">Thoughts on web development, best practices, and emerging technologies</p>
            </header>
            <div className="blog-list">
              {blogPreview.map(post => (
                <BlogPost key={post.slug} {...post} />
              ))}
            </div>
          </div>
        </section>
      )}

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
