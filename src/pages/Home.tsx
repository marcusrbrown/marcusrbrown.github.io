import React from 'react'
import BlogPost from '../components/BlogPost'
import ProjectCard from '../components/ProjectCard'
import {useGitHub} from '../hooks/UseGitHub'

const Home: React.FC = () => {
  const {projects, blogPosts} = useGitHub()

  return (
    <div>
      <section>
        <h1>Featured Projects</h1>
        <div className="project-list">
          {projects.map(project => (
            <ProjectCard key={project.id} {...project} />
          ))}
        </div>
      </section>
      <section>
        <h1>Latest Blog Posts</h1>
        <div className="blog-list">
          {blogPosts.map(post => (
            <BlogPost key={post.id} {...post} />
          ))}
        </div>
      </section>
    </div>
  )
}

export default Home
