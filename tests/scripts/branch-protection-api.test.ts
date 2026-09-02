import type {CommandResult} from '../../scripts/branch-protection-gh'
import {describe, expect, it} from 'vitest'
import {
  getCurrentProtection,
  resolveRepository,
  type RepositoryCommandRunner,
} from '../../scripts/branch-protection-api'
import {SCRIPT_CONFIG} from '../../scripts/branch-protection-config'

const canonicalRepository = 'marcusrbrown/marcusrbrown.github.io'

function result(stdout: string, status = 0, stderr = ''): CommandResult {
  return {stdout, stderr, status}
}

describe('branch protection repository resolution', () => {
  it('treats a confirmed repository with an unprotected branch as no protection', () => {
    const calls: string[][] = []
    const responses = [
      result(JSON.stringify({full_name: canonicalRepository})),
      result(JSON.stringify({name: 'main'})),
      result('', 1, 'HTTP 404: Branch protection not enabled'),
    ]
    const runCommand: RepositoryCommandRunner = args => {
      calls.push([...args])
      return responses.shift() ?? result('', 1, 'unexpected command')
    }

    expect(getCurrentProtection(SCRIPT_CONFIG, runCommand)).toBeNull()
    expect(calls).toEqual([
      ['api', 'repos/marcusrbrown/mrbro.dev'],
      ['api', `repos/${canonicalRepository}/branches/main`],
      ['api', `repos/${canonicalRepository}/branches/main/protection`],
    ])
  })

  it('throws when the configured branch does not exist', () => {
    const responses = [result(JSON.stringify({full_name: canonicalRepository})), result('', 1, 'HTTP 404: Not Found')]
    const runCommand: RepositoryCommandRunner = () => responses.shift() ?? result('', 1, 'unexpected command')

    expect(() => getCurrentProtection(SCRIPT_CONFIG, runCommand)).toThrow(/branch .*does not exist/i)
  })

  it('fails distinctly when the configured repository is not found or not visible', () => {
    const runCommand: RepositoryCommandRunner = () => result('', 1, 'HTTP 404: Not Found')

    expect(() => resolveRepository(SCRIPT_CONFIG, runCommand)).toThrow(/repository .*not found or not visible/i)
  })

  it('fails distinctly when repository access is denied', () => {
    const runCommand: RepositoryCommandRunner = () =>
      result('', 1, 'HTTP 403: Resource not accessible by personal access token')

    expect(() => resolveRepository(SCRIPT_CONFIG, runCommand)).toThrow(/access denied/i)
  })
})
