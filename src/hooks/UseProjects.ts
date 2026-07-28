// mrbro.dev/src/hooks/UseProjects.ts

import type {Project, ProjectsSnapshot} from '../types'
import projectsSnapshot from '../data/projects-snapshot.json'

const snapshot: ProjectsSnapshot = projectsSnapshot

export interface UseProjectsReturn {
  /** All portfolio projects, in snapshot order (sorted by stars desc at generation time). */
  projects: Project[]
}

/**
 * Snapshot-backed projects hook. Reads statically from the committed
 * `src/data/projects-snapshot.json` — synchronous, no loading/error states.
 */
export const useProjects = (): UseProjectsReturn => {
  return {
    projects: snapshot.projects,
  }
}
