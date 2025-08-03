import React from 'react'
import BlogPost from '../components/BlogPost'
import HeroSection from '../components/HeroSection'
import ProjectGallery from '../components/ProjectGallery'
import SkillsShowcase from '../components/SkillsShowcase'
import {useGitHub} from '../hooks/UseGitHub'
import '../styles/landing-page.css'

const Home: React.FC = () => {
  const {projects, blogPosts} = useGitHub()

  return (
    <div className="home-page">
      {/* Hero Section */}
      <HeroSection />

      {/* Skills & Expertise Showcase */}
      <SkillsShowcase />

      {/* Featured Projects Section */}
      <section id="projects" className="projects-section">
        <div className="container">
          <ProjectGallery
            projects={projects}
            title="Featured Projects"
            subtitle="A selection of my recent work showcasing modern web development practices"
            maxProjects={6}
            showFilter={false}
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
    </div>
  )
}

export default Home
