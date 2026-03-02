import { runCommand } from './ssh'
import type { SshConfig } from './ssh'

const SAFE_NAME_RE = /^[a-zA-Z0-9_-]+$/

export interface KnowledgeFile {
  name: string
  content: string
  lastModified: string // ISO timestamp
}

export interface AgentKnowledge {
  instance: string
  agentId: string
  agentName: string
  agentEmoji: string
  memories: KnowledgeFile[]
  skills: KnowledgeFile[]
}

/**
 * Reads the contents and timestamps of files in a given directory on the remote machine.
 * Returns an empty array if the directory is empty or missing.
 */
async function readEntries(
  config: SshConfig,
  dirPath: string
): Promise<KnowledgeFile[]> {
  const { stdout } = await runCommand(
    config,
    `ls -1 "${dirPath}" 2>/dev/null || true`
  )

  const filenames = stdout
    .split('\n')
    .map((f) => f.trim())
    .filter(Boolean)

  if (filenames.length === 0) return []

  const entries = await Promise.all(
    filenames.map(async (name) => {
      const filePath = `${dirPath}/${name}`
      const result = await runCommand(
        config,
        `cat "${filePath}" && echo "___REEF_SEP___" && stat -c '%Y' "${filePath}"`
      )
      const sepIdx = result.stdout.lastIndexOf('___REEF_SEP___\n')
      const content = sepIdx >= 0 ? result.stdout.slice(0, sepIdx) : result.stdout
      const timestamp = sepIdx >= 0 ? result.stdout.slice(sepIdx + '___REEF_SEP___\n'.length).trim() : '0'
      const epochSeconds = parseInt(timestamp, 10)
      const lastModified = isNaN(epochSeconds)
        ? new Date(0).toISOString()
        : new Date(epochSeconds * 1000).toISOString()
      return {
        name,
        content,
        lastModified,
      }
    })
  )

  return entries
}

/**
 * SSH into an instance and retrieve all memory and skill files for a given agent.
 */
export async function getAgentKnowledge(
  config: SshConfig,
  agentId: string,
  agentName?: string,
  agentEmoji?: string,
  instance?: string
): Promise<AgentKnowledge> {
  if (!SAFE_NAME_RE.test(agentId)) {
    throw new Error(`Invalid agent ID: ${agentId}`)
  }

  const basePath = `$HOME/.openclaw/agents/${agentId}`

  const [memories, skills] = await Promise.all([
    readEntries(config, `${basePath}/memories`),
    readEntries(config, `${basePath}/skills`),
  ])

  return {
    instance: instance ?? '',
    agentId,
    agentName: agentName ?? agentId,
    agentEmoji: agentEmoji ?? '',
    memories,
    skills,
  }
}
