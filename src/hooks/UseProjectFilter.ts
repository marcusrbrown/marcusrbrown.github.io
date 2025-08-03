import type {Project} from '../types'
import {useMemo, useState} from 'react'

export interface ProjectFilters {
  technologies: string[]
  types: string[]
  status: string[]
}

export interface ProjectFilterOptions {
  showAllTechnologies?: boolean
  showAllTypes?: boolean
  showAllStatus?: boolean
}

interface UseProjectFilterReturn {
  filteredProjects: Project[]
  activeFilters: ProjectFilters
  availableFilters: {
    technologies: string[]
    types: string[]
    status: string[]
  }
  setTechnologyFilter: (technology: string) => void
  setTypeFilter: (type: string) => void
  setStatusFilter: (status: string) => void
  clearAllFilters: () => void
  clearFilterCategory: (category: keyof ProjectFilters) => void
  hasActiveFilters: boolean
}

/**
 * Custom hook for filtering projects by technology, type, and status
 * Provides filtering logic and state management for project galleries
 */
export const useProjectFilter = (projects: Project[], _options: ProjectFilterOptions = {}): UseProjectFilterReturn => {
  const [activeFilters, setActiveFilters] = useState<ProjectFilters>({
    technologies: [],
    types: [],
    status: [],
  })

  // Extract available filter options from projects
  const availableFilters = useMemo(() => {
    const technologies = new Set<string>()
    const types = new Set<string>()
    const status = new Set<string>()

    projects.forEach(project => {
      // Add primary language
      if (project.language) {
        technologies.add(project.language)
      }

      // Add technologies from topics
      project.topics?.forEach(topic => {
        // Common technology topics
        if (isTechnologyTopic(topic)) {
          technologies.add(formatTechnologyName(topic))
        }
        // Project type topics
        if (isTypeTopic(topic)) {
          types.add(formatTypeName(topic))
        }
      })

      // Determine status based on last update
      const projectStatus = getProjectStatus(project.lastUpdated)
      status.add(projectStatus)
    })

    return {
      technologies: Array.from(technologies).sort(),
      types: Array.from(types).sort(),
      status: Array.from(status).sort(),
    }
  }, [projects])

  const hasActiveFilters = useMemo(() => {
    return activeFilters.technologies.length > 0 || activeFilters.types.length > 0 || activeFilters.status.length > 0
  }, [activeFilters])

  // Filter projects based on active filters
  const filteredProjects = useMemo(() => {
    if (!hasActiveFilters) {
      return projects
    }

    return projects.filter(project => {
      // Technology filter
      if (activeFilters.technologies.length > 0) {
        const projectTechnologies = new Set(
          [project.language, ...(project.topics?.filter(isTechnologyTopic).map(formatTechnologyName) || [])].filter(
            Boolean,
          ),
        )

        const matchesTechnology = activeFilters.technologies.some(tech => projectTechnologies.has(tech))
        if (!matchesTechnology) return false
      }

      // Type filter
      if (activeFilters.types.length > 0) {
        const projectTypes = project.topics?.filter(isTypeTopic).map(formatTypeName) || []
        const matchesType = activeFilters.types.some(type => projectTypes.includes(type))
        if (!matchesType) return false
      }

      // Status filter
      if (activeFilters.status.length > 0) {
        const projectStatus = getProjectStatus(project.lastUpdated)
        if (!activeFilters.status.includes(projectStatus)) return false
      }

      return true
    })
  }, [projects, activeFilters])

  const setTechnologyFilter = (technology: string) => {
    setActiveFilters(prev => ({
      ...prev,
      technologies: toggleArrayItem(prev.technologies, technology),
    }))
  }

  const setTypeFilter = (type: string) => {
    setActiveFilters(prev => ({
      ...prev,
      types: toggleArrayItem(prev.types, type),
    }))
  }

  const setStatusFilter = (status: string) => {
    setActiveFilters(prev => ({
      ...prev,
      status: toggleArrayItem(prev.status, status),
    }))
  }

  const clearAllFilters = () => {
    setActiveFilters({
      technologies: [],
      types: [],
      status: [],
    })
  }

  const clearFilterCategory = (category: keyof ProjectFilters) => {
    setActiveFilters(prev => ({
      ...prev,
      [category]: [],
    }))
  }

  return {
    filteredProjects,
    activeFilters,
    availableFilters,
    setTechnologyFilter,
    setTypeFilter,
    setStatusFilter,
    clearAllFilters,
    clearFilterCategory,
    hasActiveFilters,
  }
}

// Helper functions
function toggleArrayItem<T>(array: T[], item: T): T[] {
  const index = array.indexOf(item)
  if (index === -1) {
    return [...array, item]
  } else {
    return array.filter(i => i !== item)
  }
}

function isTechnologyTopic(topic: string): boolean {
  const techKeywords = [
    'react',
    'typescript',
    'javascript',
    'nodejs',
    'node-js',
    'vue',
    'angular',
    'python',
    'rust',
    'go',
    'java',
    'csharp',
    'c-sharp',
    'php',
    'ruby',
    'html',
    'css',
    'scss',
    'sass',
    'tailwind',
    'bootstrap',
    'nextjs',
    'next-js',
    'nuxtjs',
    'nuxt-js',
    'gatsby',
    'svelte',
    'express',
    'fastify',
    'nest',
    'nestjs',
    'django',
    'flask',
    'mongodb',
    'postgresql',
    'mysql',
    'redis',
    'sqlite',
    'docker',
    'kubernetes',
    'aws',
    'gcp',
    'azure',
    'vercel',
    'netlify',
    'webpack',
    'vite',
    'rollup',
    'esbuild',
    'babel',
    'jest',
    'vitest',
    'cypress',
    'playwright',
    'testing-library',
  ]

  return techKeywords.some(keyword => topic.toLowerCase().includes(keyword) || keyword.includes(topic.toLowerCase()))
}

function isTypeTopic(topic: string): boolean {
  const typeKeywords = [
    'portfolio',
    'client-work',
    'open-source',
    'personal',
    'commercial',
    'library',
    'framework',
    'tool',
    'utility',
    'demo',
    'example',
    'tutorial',
    'learning',
    'experiment',
    'prototype',
  ]

  return typeKeywords.some(keyword => topic.toLowerCase().includes(keyword) || keyword.includes(topic.toLowerCase()))
}

function formatTechnologyName(topic: string): string {
  const formatMap: Record<string, string> = {
    nodejs: 'Node.js',
    'node-js': 'Node.js',
    nextjs: 'Next.js',
    'next-js': 'Next.js',
    nuxtjs: 'Nuxt.js',
    'nuxt-js': 'Nuxt.js',
    nestjs: 'NestJS',
    csharp: 'C#',
    'c-sharp': 'C#',
    typescript: 'TypeScript',
    javascript: 'JavaScript',
    mongodb: 'MongoDB',
    postgresql: 'PostgreSQL',
    mysql: 'MySQL',
  }

  const normalized = topic.toLowerCase()
  return formatMap[normalized] || topic.charAt(0).toUpperCase() + topic.slice(1)
}

function formatTypeName(topic: string): string {
  const formatMap: Record<string, string> = {
    'open-source': 'Open Source',
    'client-work': 'Client Work',
    personal: 'Personal',
    commercial: 'Commercial',
  }

  const normalized = topic.toLowerCase()
  return formatMap[normalized] || topic.charAt(0).toUpperCase() + topic.slice(1).replaceAll('-', ' ')
}

function getProjectStatus(lastUpdated?: string): string {
  if (!lastUpdated) return 'Unknown'

  const lastUpdateDate = new Date(lastUpdated)
  const now = new Date()
  const monthsAgo = (now.getTime() - lastUpdateDate.getTime()) / (1000 * 60 * 60 * 24 * 30)

  if (monthsAgo <= 3) return 'Active'
  if (monthsAgo <= 12) return 'Recent'
  return 'Archived'
}
