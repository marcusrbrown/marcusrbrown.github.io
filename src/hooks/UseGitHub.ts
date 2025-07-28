import type {BlogPost, Project} from '../types'
import {useEffect, useState} from 'react'

export const useGitHub = (username = 'marcusrbrown') => {
  const [repos, setRepos] = useState([])
  const [blogPosts, setBlogPosts] = useState<BlogPost[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const reposResponse = await fetch(`https://api.github.com/users/${username}/repos`)
        const reposData = await reposResponse.json()
        setRepos(reposData)

        const blogResponse = await fetch(`https://api.github.com/users/${username}/gists`)
        const blogData = await blogResponse.json()
        setBlogPosts(blogData)
      } catch {
        setError('Failed to fetch data from GitHub')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [username])

  return {repos, blogPosts, projects: [] as Project[], loading, error}
}
