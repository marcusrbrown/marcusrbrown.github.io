export interface CommandInput {
  command?: unknown
  bash?: unknown
  args?: unknown
  input?: unknown
  toolName?: unknown
  toolArgs?: unknown
  toolInput?: unknown
  tool_name?: unknown
  tool_input?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseInput(raw: string): CommandInput {
  if (raw.trim().length === 0) {
    throw new Error('Hook input is empty')
  }

  const parsed: unknown = JSON.parse(raw)
  if (!isRecord(parsed)) {
    throw new Error('Hook input must be a JSON object')
  }

  return parsed as CommandInput
}

type ForbiddenMatcher = RegExp | ((commandText: string) => boolean)

function commandSegments(commandText: string): string[][] {
  return commandText
    .split(/[|;&]/)
    .map(segment => segment.trim())
    .filter(segment => segment.length > 0)
    .map(segment => segment.split(/\s+/))
}

function isShortOption(token: string, option: string): boolean {
  return token.startsWith('-') && !token.startsWith('--') && token.slice(1).includes(option)
}

function findSubcommand(tokens: string[], command: string, subcommand: string): number {
  return tokens.findIndex((token, index) => token === command && tokens[index + 1] === subcommand)
}

function matchesGitCleanForce(commandText: string): boolean {
  return commandSegments(commandText).some(tokens => {
    const commandIndex = findSubcommand(tokens, 'git', 'clean')
    if (commandIndex === -1) {
      return false
    }

    const argumentsAfterCommand = tokens.slice(commandIndex + 2)
    const isDryRun = argumentsAfterCommand.some(token => token === '--dry-run' || isShortOption(token, 'n'))
    const usesForce = argumentsAfterCommand.some(token => token === '--force' || isShortOption(token, 'f'))

    return usesForce && !isDryRun
  })
}

function matchesDestructiveCheckout(commandText: string): boolean {
  return commandSegments(commandText).some(tokens => {
    const commandIndex = findSubcommand(tokens, 'git', 'checkout')
    if (commandIndex === -1) {
      return false
    }

    const argumentsAfterCommand = tokens.slice(commandIndex + 2)
    const separatorIndex = argumentsAfterCommand.indexOf('--')

    return (
      (separatorIndex !== -1 && separatorIndex < argumentsAfterCommand.length - 1) ||
      argumentsAfterCommand.some(
        argument =>
          argument === '.' || argument.startsWith('./') || argument.startsWith('../') || argument.startsWith('/'),
      )
    )
  })
}

function matchesDestructiveRestore(commandText: string): boolean {
  return commandSegments(commandText).some(tokens => {
    const commandIndex = findSubcommand(tokens, 'git', 'restore')
    if (commandIndex === -1) {
      return false
    }

    const argumentsAfterCommand = tokens.slice(commandIndex + 2)
    if (argumentsAfterCommand.some(argument => argument === '--staged' || argument.startsWith('--staged='))) {
      return false
    }

    let skipsSourceValue = false
    return argumentsAfterCommand.some(argument => {
      if (skipsSourceValue) {
        skipsSourceValue = false
        return false
      }

      if (argument === '--source') {
        skipsSourceValue = true
        return false
      }

      if (argument.startsWith('--source=')) {
        return false
      }

      return !argument.startsWith('-')
    })
  })
}

function matchesRootRemoval(commandText: string): boolean {
  return commandSegments(commandText).some(tokens => {
    const commandIndex = tokens.indexOf('rm')
    if (commandIndex === -1) {
      return false
    }

    const argumentsAfterCommand = tokens.slice(commandIndex + 1)
    const removesDirectories = argumentsAfterCommand.some(token => token === '--recursive' || isShortOption(token, 'r'))
    const forcesRemoval = argumentsAfterCommand.some(token => token === '--force' || isShortOption(token, 'f'))
    const targetsAbsolutePath = argumentsAfterCommand.some(argument => argument.startsWith('/'))

    return removesDirectories && forcesRemoval && targetsAbsolutePath
  })
}

function matchesHttpDownload(command: 'curl' | 'wget', commandText: string): boolean {
  return commandSegments(commandText).some(tokens => {
    const commandIndex = tokens.indexOf(command)
    return commandIndex !== -1 && tokens.slice(commandIndex + 1).some(argument => /^https?:\/\//.test(argument))
  })
}

const denyPatterns: {pattern: ForbiddenMatcher; label: string}[] = [
  {pattern: /git\s+push\b[^|;]*--force(?:-with-lease)?\b/, label: 'git push --force'},
  {pattern: /git\s+push\b[^|;]*\s-f\b/, label: 'git push -f'},
  {pattern: /git\s+reset\s+--hard\b/, label: 'git reset --hard'},
  {pattern: matchesGitCleanForce, label: 'git clean --force'},
  {pattern: matchesDestructiveCheckout, label: 'git checkout (discard working tree)'},
  {pattern: matchesDestructiveRestore, label: 'git restore (discard working tree)'},
  {pattern: matchesRootRemoval, label: 'rm -rf /'},
  {pattern: matchesHttpDownload.bind(null, 'curl'), label: 'curl http(s)'},
  {pattern: matchesHttpDownload.bind(null, 'wget'), label: 'wget http(s)'},
]

export function hasForbiddenPattern(commandText: string): string | undefined {
  const match = denyPatterns.find(entry =>
    entry.pattern instanceof RegExp ? entry.pattern.test(commandText) : entry.pattern(commandText),
  )
  return match?.label
}

function extractFromValue(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  if (Array.isArray(value)) {
    return value
      .map(item => extractFromValue(item))
      .filter(s => s.trim().length > 0)
      .join(' ')
  }

  if (typeof value !== 'object' || value == null) {
    return ''
  }

  const commandInput = value as CommandInput

  const objectCandidates: unknown[] = [
    commandInput.command,
    commandInput.bash,
    commandInput.args,
    commandInput.input,
    commandInput.toolInput,
    commandInput.tool_input,
  ]

  for (const candidate of objectCandidates) {
    const extracted = extractFromValue(candidate)
    if (extracted.trim().length > 0) {
      return extracted
    }
  }

  return ''
}

function extractToolArgsCommand(value: unknown): string {
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value) as unknown
    } catch {
      return ''
    }
  }

  return extractFromValue(value)
}

export function resolveCommandText(payload: CommandInput): string {
  const candidates = [
    extractToolArgsCommand(payload?.toolArgs),
    extractFromValue(payload?.toolInput),
    extractFromValue(payload?.tool_input),
    payload?.command,
    payload?.input,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate
    }

    const extracted = extractFromValue(candidate)
    if (extracted.trim().length > 0) {
      return extracted
    }
  }

  return ''
}

export function resolveToolName(payload: CommandInput): string {
  const candidates = [payload?.toolName, payload?.tool_name]

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim()
    }
  }

  return ''
}
