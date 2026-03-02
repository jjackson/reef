import { runCommand } from './ssh'
import type { SshConfig } from './ssh'

export interface FileEntry {
  name: string
  content: string
  lastModified: string // ISO timestamp
}

export interface AgentKnowledge {
  instance: string
  agentId: string
  agentName: string
  agentEmoji: string
  memories: FileEntry[]
  skills: FileEntry[]
}

/**
 * Reads the contents and timestamps of files in a given directory on the remote machine.
 * Returns an empty array if the directory is empty or missing.
 */
async function readEntries(
  config: SshConfig,
  dirPath: string
): Promise<FileEntry[]> {
  const { stdout } = await runCommand(
    config,
    `ls -1 ${dirPath} 2>/dev/null || true`
  )

  const filenames = stdout
    .split('\n')
    .map((f) => f.trim())
    .filter(Boolean)

  if (filenames.length === 0) return []

  const entries = await Promise.all(
    filenames.map(async (name) => {
      const filePath = `${dirPath}/${name}`
      const [catResult, statResult] = await Promise.all([
        runCommand(config, `cat ${filePath}`),
        runCommand(config, `stat -c '%Y' ${filePath}`),
      ])
      const epochSeconds = parseInt(statResult.stdout.trim(), 10)
      const lastModified = isNaN(epochSeconds)
        ? new Date(0).toISOString()
        : new Date(epochSeconds * 1000).toISOString()
      return {
        name,
        content: catResult.stdout,
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
