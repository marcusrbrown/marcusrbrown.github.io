import type {ProjectsSnapshot} from '../../src/types'
import {renderHook} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'

const buildProject = (overrides: Partial<ProjectsSnapshot['projects'][number]> = {}) => ({
  id: overrides.id ?? 'repo-1',
  title: overrides.title ?? 'My Repo',
  description: overrides.description ?? 'A great project',
  url: overrides.url ?? 'https://github.com/user/my-repo',
  language: overrides.language ?? 'TypeScript',
  stars: overrides.stars ?? 10,
  topics: overrides.topics ?? ['portfolio'],
  lastUpdated: overrides.lastUpdated ?? '2024-01-01T00:00:00Z',
  imageUrl: overrides.imageUrl ?? '/project-previews/repo-1.png',
})

describe('useProjects', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns the snapshot projects in order', async () => {
    const p1 = buildProject({id: 'proj-1', title: 'Alpha', stars: 20})
    const p2 = buildProject({id: 'proj-2', title: 'Beta', stars: 5})

    vi.doMock('../../src/data/projects-snapshot.json', () => ({
      default: {
        projects: [p1, p2],
        generatedAt: '2024-01-01T00:00:00.000Z',
        generator: 'projects-refresh',
      },
    }))

    const {useProjects} = await import('../../src/hooks/UseProjects')
    const {result} = renderHook(() => useProjects())

    expect(result.current.projects).toStrictEqual([p1, p2])
  })

  it('returns projects from a multi-project fixture (mock module)', async () => {
    const projects = [
      buildProject({id: 'fixture-1', title: 'Fixture One', stars: 42}),
      buildProject({id: 'fixture-2', title: 'Fixture Two', stars: 7}),
    ]

    vi.doMock('../../src/data/projects-snapshot.json', () => ({
      default: {
        projects,
        generatedAt: '2025-01-01T00:00:00.000Z',
        generator: 'projects-refresh',
      },
    }))

    const {useProjects} = await import('../../src/hooks/UseProjects')
    const {result} = renderHook(() => useProjects())

    expect(result.current.projects).toHaveLength(2)
    expect(result.current.projects[0]?.id).toBe('fixture-1')
    expect(result.current.projects[1]?.id).toBe('fixture-2')
  })

  it('returns empty array for an empty snapshot', async () => {
    vi.doMock('../../src/data/projects-snapshot.json', () => ({
      default: {
        projects: [],
        generatedAt: '2024-01-01T00:00:00.000Z',
        generator: 'projects-refresh',
      },
    }))

    const {useProjects} = await import('../../src/hooks/UseProjects')
    const {result} = renderHook(() => useProjects())

    expect(result.current.projects).toStrictEqual([])
  })

  it('is synchronous — no loading or error state in the return value', async () => {
    vi.doMock('../../src/data/projects-snapshot.json', () => ({
      default: {
        projects: [buildProject()],
        generatedAt: '2024-01-01T00:00:00.000Z',
        generator: 'projects-refresh',
      },
    }))

    const {useProjects} = await import('../../src/hooks/UseProjects')
    const {result} = renderHook(() => useProjects())

    // Should have projects but no loading/error properties
    expect(result.current).toHaveProperty('projects')
    expect(result.current).not.toHaveProperty('loading')
    expect(result.current).not.toHaveProperty('error')
    expect(result.current).not.toHaveProperty('projectsLoading')
    expect(result.current).not.toHaveProperty('projectsError')
    expect(result.current).not.toHaveProperty('retry')
    expect(result.current).not.toHaveProperty('rateLimitReset')
  })
})
