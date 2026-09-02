import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {analyzeBuildOutput, hasCssBudgetViolation} from '../../scripts/analyze-build'

const temporaryDirectories: string[] = []

class ProcessExit extends Error {
  readonly code: number

  constructor(code: number) {
    super(`Process exited with code ${code}`)
    this.code = code
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, {force: true, recursive: true})
})

describe('build CSS budget', () => {
  it('passes at or below the hard budget', () => {
    expect(hasCssBudgetViolation(102_400)).toBe(false)
    expect(hasCssBudgetViolation(102_399)).toBe(false)
  })

  it('fails above the hard budget', () => {
    expect(hasCssBudgetViolation(102_401)).toBe(true)
  })

  it('rejects an existing build directory without the required build evidence', () => {
    const directory = mkdtempSync(join(tmpdir(), 'analyze-build-test-'))
    temporaryDirectories.push(directory)
    mkdirSync(join(directory, 'dist'))
    const originalCwd = process.cwd()
    process.chdir(directory)
    vi.spyOn(process, 'exit').mockImplementation((code): never => {
      throw new ProcessExit(typeof code === 'number' ? code : 0)
    })

    try {
      expect(() => analyzeBuildOutput(true)).toThrowError(/empty|unreadable|index\.html|JavaScript entry/i)
    } finally {
      process.chdir(originalCwd)
    }
  })

  it.each([
    ['the index entry', ['main.js']],
    ['a JavaScript entry', ['index.html']],
  ])('rejects a build missing %s', (_missingEvidence, files) => {
    const directory = mkdtempSync(join(tmpdir(), 'analyze-build-test-'))
    temporaryDirectories.push(directory)
    mkdirSync(join(directory, 'dist'))
    for (const file of files) writeFileSync(join(directory, 'dist', file), '')
    const originalCwd = process.cwd()
    process.chdir(directory)
    vi.spyOn(process, 'exit').mockImplementation((code): never => {
      throw new ProcessExit(typeof code === 'number' ? code : 0)
    })

    try {
      expect(() => analyzeBuildOutput(true)).toThrowError(/index\.html|JavaScript entry/i)
    } finally {
      process.chdir(originalCwd)
    }
  })
})
