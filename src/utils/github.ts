// Utility functions for interacting with the GitHub API
import type {GitHubIssue, GitHubRepository} from '../types'

const GITHUB_API_URL = 'https://api.github.com'

// Fetch repositories for the specified user
export const fetchRepositories = async (username: string): Promise<GitHubRepository[]> => {
  try {
    const response = await fetch(`${GITHUB_API_URL}/users/${username}/repos`)
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    return await response.json()
  } catch (error) {
    console.error('Error fetching repositories:', error)
    throw error
  }
}

// Fetch blog posts from the specified GitHub repository
export const fetchBlogPosts = async (repo: string): Promise<GitHubIssue[]> => {
  try {
    const response = await fetch(`${GITHUB_API_URL}/repos/${repo}/issues`)
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    const data: GitHubIssue[] = await response.json()
    return data.filter(post => {
      // Handle malformed issue data - ensure labels exists and is an array
      if (!post.labels || !Array.isArray(post.labels)) {
        return false
      }
      return post.labels.some(label => label && label.name === 'blog')
    })
  } catch (error) {
    console.error('Error fetching blog posts:', error)
    throw error
  }
}
