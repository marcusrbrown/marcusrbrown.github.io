import React from 'react'
import BlogPost from '../components/BlogPost'
import {useGitHub} from '../hooks/UseGitHub'

const Blog: React.FC = () => {
  const {blogPosts, loading, error} = useGitHub()

  if (loading) {
    return <div>Loading...</div>
  }

  if (error) {
    return <div>Error loading blog posts.</div>
  }

  return (
    <div>
      <h1>Blog</h1>
      {blogPosts.length === 0 ? (
        <p>No blog posts available.</p>
      ) : (
        blogPosts.map(post => <BlogPost key={post.id} {...post} />)
      )}
    </div>
  )
}

export default Blog
