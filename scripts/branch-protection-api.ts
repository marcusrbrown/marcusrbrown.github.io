import type {BranchProtectionPayload, ScriptConfig} from './branch-protection-config'
import {assertSuccess, runGhCommand} from './branch-protection-gh'

type RepositoryCommandRunner = typeof runGhCommand

interface CurrentProtectionResponse {
  readonly required_status_checks?: {
    readonly contexts?: readonly string[]
  }
  readonly required_pull_request_reviews?: {
    readonly required_approving_review_count?: number
  }
  readonly enforce_admins?: {
    readonly enabled?: boolean
  }
}

interface WorkflowRunSummary {
  readonly name: string
  readonly status: string
  readonly conclusion: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function resolveRepository(config: ScriptConfig, runCommand: RepositoryCommandRunner = runGhCommand): string {
  const configuredRepository = `${config.owner}/${config.repo}`
  const result = runCommand(['api', `repos/${configuredRepository}`])
  if (result.status !== 0) {
    const stderr = result.stderr.trim()
    if (/\b404\b/.test(stderr)) {
      throw new Error(`Repository ${configuredRepository} was not found or not visible (GitHub returned 404).`)
    }
    if (/\b403\b/.test(stderr)) {
      throw new Error(`Access denied while resolving repository ${configuredRepository} (GitHub returned 403).`)
    }

    assertSuccess('gh api resolve repository', result)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(result.stdout) as unknown
  } catch {
    throw new Error(`gh api resolve repository returned invalid JSON for ${configuredRepository}.`)
  }

  const fullName = isRecord(parsed) && typeof parsed.full_name === 'string' ? parsed.full_name : undefined
  if (fullName === undefined || !/^[^/\s]+\/[^/\s]+$/.test(fullName)) {
    throw new Error(`gh api resolve repository returned no valid full_name for ${configuredRepository}.`)
  }

  return fullName
}

/**
 * Best-effort branch validation. A Contents-denied token may still be able to
 * read branch protection via Administration, so 403 is not itself fatal.
 * The caller must not interpret a protection 404 as unprotected unless this
 * check returns true.
 */
function verifyBranchExists(repository: string, config: ScriptConfig, runCommand: RepositoryCommandRunner): boolean {
  const result = runCommand(['api', `repos/${repository}/branches/${config.branch}`])
  if (result.status !== 0) {
    if (/\b404\b/.test(result.stderr)) {
      throw new Error(`Branch ${config.branch} does not exist in repository ${repository} (GitHub returned 404).`)
    }
    if (/\b403\b/.test(result.stderr)) {
      return false
    }

    assertSuccess('gh api resolve branch', result)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(result.stdout) as unknown
  } catch {
    throw new Error(`gh api resolve branch returned invalid JSON for ${repository}/${config.branch}.`)
  }

  if (!isRecord(parsed) || parsed.name !== config.branch) {
    throw new Error(`gh api resolve branch returned no matching branch for ${repository}/${config.branch}.`)
  }

  return true
}

function getCurrentProtection(
  config: ScriptConfig,
  runCommand: RepositoryCommandRunner = runGhCommand,
): CurrentProtectionResponse | null {
  const repository = resolveRepository(config, runCommand)
  const branchVerified = verifyBranchExists(repository, config, runCommand)
  const result = runCommand(['api', `repos/${repository}/branches/${config.branch}/protection`])
  if (result.status !== 0) {
    if (/\b404\b/.test(result.stderr)) {
      if (!branchVerified) {
        throw new Error(
          `Cannot determine whether branch ${config.branch} is protected: branch existence access was denied, and the protection endpoint returned 404.`,
        )
      }
      return null
    }

    assertSuccess('gh api get branch protection', result)
  }

  return JSON.parse(result.stdout) as CurrentProtectionResponse
}

function configureBranchProtection(config: ScriptConfig, payload: BranchProtectionPayload): void {
  const repository = resolveRepository(config)
  const result = runGhCommand(
    ['api', `repos/${repository}/branches/${config.branch}/protection`, '--method', 'PUT', '--input', '-'],
    JSON.stringify(payload),
  )
  assertSuccess('gh api put branch protection', result)
}

function removeBranchProtection(config: ScriptConfig): void {
  const repository = resolveRepository(config)
  const result = runGhCommand(['api', `repos/${repository}/branches/${config.branch}/protection`, '--method', 'DELETE'])
  assertSuccess('gh api delete branch protection', result)
}

function getRecentWorkflowRuns(config: ScriptConfig): readonly WorkflowRunSummary[] {
  const repository = resolveRepository(config)
  const endpoint = `repos/${repository}/actions/runs`
  const result = runGhCommand([
    'api',
    endpoint,
    '--jq',
    '.workflow_runs[:10] | map({name: .name, status: .status, conclusion: .conclusion})',
  ])
  assertSuccess('gh api list workflow runs', result)
  return JSON.parse(result.stdout) as readonly WorkflowRunSummary[]
}

export type {CurrentProtectionResponse, RepositoryCommandRunner, WorkflowRunSummary}
export {
  configureBranchProtection,
  getCurrentProtection,
  getRecentWorkflowRuns,
  removeBranchProtection,
  resolveRepository,
}
