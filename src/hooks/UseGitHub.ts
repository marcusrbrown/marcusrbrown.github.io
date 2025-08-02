import type {BlogPost, Project} from '../types'
import {useEffect, useState} from 'react'

interface GitHubRepo {
  id: number
  name: string
  description: string | null
  html_url: string
  language: string | null
  stargazers_count: number
  fork: boolean
  archived: boolean
  created_at: string
  updated_at: string
  homepage: string | null
  topics: string[]
}

export const useGitHub = (username = 'marcusrbrown') => {
  const [repos, setRepos] = useState<GitHubRepo[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [blogPosts, setBlogPosts] = useState<BlogPost[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const reposResponse = await fetch(`https://api.github.com/users/${username}/repos?sort=updated&per_page=100`)
        const reposData: GitHubRepo[] = await reposResponse.json()

        // Filter out forks and archived repos, then transform to Project objects
        const filteredRepos = reposData
          .filter(repo => !repo.fork && !repo.archived && repo.description)
          .sort((a, b) => b.stargazers_count - a.stargazers_count)
          .slice(0, 12) // Show top 12 projects

        const projectsData: Project[] = filteredRepos.map(repo => ({
          id: repo.id.toString(),
          title: repo.name
            .replaceAll('-', ' ')
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' '),
          description: repo.description || 'No description available',
          url: repo.html_url,
          language: repo.language || 'Unknown',
          stars: repo.stargazers_count,
          homepage: repo.homepage,
          topics: repo.topics || [],
          lastUpdated: repo.updated_at,
        }))

        setRepos(reposData)
        setProjects(projectsData)

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

  return {repos, blogPosts, projects, loading, error}
}
