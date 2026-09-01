import type {CommandInput} from './copilot-hook-utils.ts'

import process from 'node:process'

import {hasForbiddenPattern, parseInput, resolveCommandText, resolveToolName} from './copilot-hook-utils.ts'

function writeDecision(response: {permissionDecision: 'allow' | 'deny'; permissionDecisionReason?: string}): void {
  process.stdout.write(`${JSON.stringify(response)}\n`)
}

function deny(reason: string): void {
  writeDecision({permissionDecision: 'deny', permissionDecisionReason: reason})
}

function hasOwnProperty(payload: CommandInput, property: string): boolean {
  return Object.prototype.hasOwnProperty.call(payload, property)
}

async function readStdin(): Promise<string> {
  const chunks: string[] = []

  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'))
  }

  return chunks.join('')
}

async function main(): Promise<void> {
  try {
    const payload = parseInput(await readStdin())
    const toolName = resolveToolName(payload)

    if (toolName.length === 0) {
      deny('Blocked by Copilot guardrails: invalid hook input; tool name is required.')
      return
    }

    if (toolName.toLowerCase() !== 'bash') {
      // File and other tools legitimately have arguments without a command.
      writeDecision({permissionDecision: 'allow'})
      return
    }

    const usesCamelCase = typeof payload.toolName === 'string' && payload.toolName.trim().length > 0
    const commandPayload: CommandInput = usesCamelCase ? {toolArgs: payload.toolArgs} : {tool_input: payload.tool_input}

    if (
      (usesCamelCase && !hasOwnProperty(payload, 'toolArgs')) ||
      (!usesCamelCase && !hasOwnProperty(payload, 'tool_input'))
    ) {
      deny('Blocked by Copilot guardrails: bash tool arguments are required.')
      return
    }

    const commandText = resolveCommandText(commandPayload).toLowerCase()
    if (commandText.trim().length === 0) {
      deny('Blocked by Copilot guardrails: bash tool arguments could not be parsed.')
      return
    }

    const forbidden = hasForbiddenPattern(commandText)

    if (forbidden !== undefined) {
      deny(`Blocked by Copilot guardrails: '${forbidden}' is not allowed.`)
      return
    }

    writeDecision({permissionDecision: 'allow'})
  } catch {
    // Copilot treats malformed stdout as no output, so malformed input must be
    // converted into an explicit denial instead of escaping as an exception.
    deny('Blocked by Copilot guardrails: invalid hook input.')
  }
}

await main()
