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

const denyPatterns: {pattern: RegExp; label: string}[] = [
  {pattern: /git\s+push\b[^|;]*--force(?:-with-lease)?\b/, label: 'git push --force'},
  {pattern: /git\s+push\b[^|;]*\s-f\b/, label: 'git push -f'},
  {pattern: /git\s+reset\s+--hard\b/, label: 'git reset --hard'},
  {pattern: /\brm\s+-[rf]+\s+\//, label: 'rm -rf /'},
  {pattern: /\bcurl\s+https?:\/\//, label: 'curl http(s)'},
  {pattern: /\bwget\s+https?:\/\//, label: 'wget http(s)'},
]

export function hasForbiddenPattern(commandText: string): string | undefined {
  const match = denyPatterns.find(entry => entry.pattern.test(commandText))
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
