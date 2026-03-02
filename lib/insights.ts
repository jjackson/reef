import { runCommand } from './ssh'
import type { SshConfig } from './ssh'
import { listInstances, resolveInstance } from './instances'
import { listAgents } from './openclaw'
import { loadSettings } from './settings'

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

export interface FleetKnowledge {
  agents: AgentKnowledge[]
  skillIndex: Record<string, string[]>  // skill name -> agent IDs that have it
  totalMemories: number
  totalSkills: number
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

/**
 * Gather knowledge across all agents on all instances in the fleet.
 * Optionally filter by workspace.
 */
export async function getFleetKnowledge(workspace?: string): Promise<FleetKnowledge> {
  let instances = await listInstances()

  // If workspace is specified, filter to instances in that workspace
  if (workspace) {
    const settings = loadSettings()
    const ws = settings.workspaces[workspace]
    if (ws) {
      const wsInstances = new Set(ws.instances)
      instances = instances.filter((inst) => wsInstances.has(inst.id))
    }
  }

  // Process all instances in parallel
  const results = await Promise.allSettled(
    instances.map(async (inst) => {
      const resolved = await resolveInstance(inst.id)
      if (!resolved) return []

      const sshConfig: SshConfig = {
        host: resolved.ip,
        privateKey: resolved.sshKey,
      }

      const agents = await listAgents(sshConfig)

      const agentKnowledge = await Promise.all(
        agents.map((agent) =>
          getAgentKnowledge(
            sshConfig,
            agent.id,
            agent.identityName,
            agent.identityEmoji,
            inst.id
          )
        )
      )

      return agentKnowledge
    })
  )

  // Collect all successful results
  const allAgents: AgentKnowledge[] = []
  for (const result of results) {
    if (result.status === 'fulfilled') {
      allAgents.push(...result.value)
    }
  }

  // Build skill index: skill filename -> list of agent IDs that have it
  const skillIndex: Record<string, string[]> = {}
  for (const agent of allAgents) {
    for (const skill of agent.skills) {
      if (!skillIndex[skill.name]) {
        skillIndex[skill.name] = []
      }
      skillIndex[skill.name].push(agent.agentId)
    }
  }

  return {
    agents: allAgents,
    skillIndex,
    totalMemories: allAgents.reduce((sum, a) => sum + a.memories.length, 0),
    totalSkills: allAgents.reduce((sum, a) => sum + a.skills.length, 0),
  }
}

/**
 * Find all agents that have a skill matching the given name.
 */
export async function findSkill(skillName: string): Promise<AgentKnowledge[]> {
  const fleet = await getFleetKnowledge()
  return fleet.agents.filter((agent) =>
    agent.skills.some((skill) => skill.name === skillName)
  )
}
