// Utility functions for interacting with the GitHub API

const GITHUB_API_URL = 'https://api.github.com'

// Fetch repositories for the specified user
export const fetchRepositories = async (username: string) => {
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
export const fetchBlogPosts = async (repo: string) => {
  try {
    const response = await fetch(`${GITHUB_API_URL}/repos/${repo}/issues`)
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    const data = await response.json()
    return data.filter((post: any) => {
      // Handle malformed issue data - ensure labels exists and is an array
      if (!post.labels || !Array.isArray(post.labels)) {
        return false
      }
      return post.labels.some((label: any) => label && label.name === 'blog')
    })
  } catch (error) {
    console.error('Error fetching blog posts:', error)
    throw error
  }
}
