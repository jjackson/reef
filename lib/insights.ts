import { runCommand } from './ssh'
import type { SshConfig } from './ssh'
import { listInstances, resolveSSHKey } from './instances'
import type { Instance } from './instances'
import { loadSettings } from './settings'

export interface KnowledgeFile {
  name: string
  content: string
  lastModified: string // ISO timestamp
}

export interface InstanceKnowledge {
  instance: string
  memories: KnowledgeFile[]
  skills: KnowledgeFile[]
  identity: KnowledgeFile[]  // SOUL.md, IDENTITY.md, USER.md, AGENTS.md only
  config: KnowledgeFile[]    // TOOLS.md, HEARTBEAT.md, MEMORY.md, BOOTSTRAP.md
  docs: KnowledgeFile[]      // everything else from workspace root
}

export interface FleetKnowledge {
  instances: InstanceKnowledge[]
  skillIndex: Record<string, string[]>  // skill dir name -> instance IDs that have it
  totalMemories: number
  totalSkills: number
}

const IDENTITY_FILES = new Set(['SOUL.md', 'USER.md', 'AGENTS.md', 'IDENTITY.md'])
const CONFIG_FILES = new Set(['TOOLS.md', 'HEARTBEAT.md', 'MEMORY.md', 'BOOTSTRAP.md'])

export function classifyWorkspaceFiles(files: KnowledgeFile[]): {
  identity: KnowledgeFile[]
  config: KnowledgeFile[]
  docs: KnowledgeFile[]
} {
  const identity: KnowledgeFile[] = []
  const config: KnowledgeFile[] = []
  const docs: KnowledgeFile[] = []

  for (const f of files) {
    if (IDENTITY_FILES.has(f.name)) identity.push(f)
    else if (CONFIG_FILES.has(f.name)) config.push(f)
    else docs.push(f)
  }

  return { identity, config, docs }
}

/**
 * Parse the batched output format: ___FILE___<name>\n<content>___REEF_SEP___\n<timestamp>\n___END___
 */
function parseBatchOutput(stdout: string): KnowledgeFile[] {
  const entries: KnowledgeFile[] = []
  const blocks = stdout.split('___END___')

  for (const block of blocks) {
    const fileMarker = block.indexOf('___FILE___')
    if (fileMarker < 0) continue

    const nameStart = fileMarker + '___FILE___'.length
    const nameEnd = block.indexOf('\n', nameStart)
    if (nameEnd < 0) continue

    const name = block.slice(nameStart, nameEnd).trim()
    if (!name) continue

    const rest = block.slice(nameEnd + 1)
    const sepIdx = rest.lastIndexOf('___REEF_SEP___')
    if (sepIdx < 0) continue

    const content = rest.slice(0, sepIdx)
    const timestamp = rest.slice(sepIdx + '___REEF_SEP___'.length).trim()
    const epochSeconds = parseInt(timestamp, 10)
    const lastModified = isNaN(epochSeconds)
      ? new Date(0).toISOString()
      : new Date(epochSeconds * 1000).toISOString()

    entries.push({ name, content, lastModified })
  }

  return entries
}

/**
 * SSH into an instance and retrieve all knowledge in a single SSH command.
 * Reads memory, skills, and workspace root .md files in one session
 * using section markers to separate the three categories.
 */
export async function getInstanceKnowledge(
  config: SshConfig,
  instanceId: string
): Promise<InstanceKnowledge> {
  const ws = '$HOME/.openclaw/workspace'

  // Single batched SSH command: reads all three directories with section separators
  const { stdout } = await runCommand(
    config,
    [
      'echo "___SECTION___MEMORY"',
      `for f in "${ws}/memory"/*.md; do [ -f "$f" ] || continue; echo "___FILE___$(basename "$f")"; cat "$f"; echo "___REEF_SEP___"; stat -c '%Y' "$f"; echo "___END___"; done`,
      'echo "___SECTION___SKILLS"',
      `for d in "${ws}/skills"/*/; do [ -d "$d" ] || continue; name=$(basename "$d"); f="$d/SKILL.md"; [ -f "$f" ] || continue; echo "___FILE___$name"; cat "$f"; echo "___REEF_SEP___"; stat -c '%Y' "$f"; echo "___END___"; done`,
      'echo "___SECTION___WORKSPACE"',
      `for f in "${ws}"/*.md; do [ -f "$f" ] || continue; echo "___FILE___$(basename "$f")"; cat "$f"; echo "___REEF_SEP___"; stat -c '%Y' "$f"; echo "___END___"; done`,
    ].join('; ')
  )

  // Split output by section markers
  const sections = stdout.split('___SECTION___')
  let memoryOut = '', skillsOut = '', workspaceOut = ''
  for (const section of sections) {
    if (section.startsWith('MEMORY')) memoryOut = section.slice('MEMORY'.length)
    else if (section.startsWith('SKILLS')) skillsOut = section.slice('SKILLS'.length)
    else if (section.startsWith('WORKSPACE')) workspaceOut = section.slice('WORKSPACE'.length)
  }

  const memories = parseBatchOutput(memoryOut)
  const skills = parseBatchOutput(skillsOut)
  const wsFiles = parseBatchOutput(workspaceOut)
  const { identity, config: configFiles, docs } = classifyWorkspaceFiles(wsFiles)

  return {
    instance: instanceId,
    memories,
    skills,
    identity,
    config: configFiles,
    docs,
  }
}

/**
 * Gather knowledge across all instances in the fleet.
 * Uses a single listInstances() call and caches SSH key resolution
 * to avoid redundant DO API and 1Password round-trips.
 */
export async function getFleetKnowledge(workspace?: string): Promise<FleetKnowledge> {
  let allInstances = await listInstances()

  if (workspace) {
    const settings = loadSettings()
    const ws = settings.workspaces[workspace]
    if (!ws) {
      throw new Error(`Workspace not found: ${workspace}`)
    }
    const wsInstances = new Set(ws.instances)
    allInstances = allInstances.filter((inst) => wsInstances.has(inst.id))
  }

  // Resolve SSH keys once per unique ref, then share across instances
  const keyCache = new Map<string, Promise<string>>()
  function getCachedKey(ref: string): Promise<string> {
    let p = keyCache.get(ref)
    if (!p) {
      p = resolveSSHKey(ref)
      keyCache.set(ref, p)
    }
    return p
  }

  const results = await Promise.allSettled(
    allInstances.map(async (inst) => {
      const sshKey = await getCachedKey(inst.sshKeyRef)
      const sshConfig: SshConfig = { host: inst.ip, privateKey: sshKey }
      return getInstanceKnowledge(sshConfig, inst.id)
    })
  )

  const instances: InstanceKnowledge[] = []
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      instances.push(result.value)
    }
  }

  // Build skill index: skill name -> list of instance IDs that have it
  const skillIndex: Record<string, string[]> = {}
  for (const inst of instances) {
    for (const skill of inst.skills) {
      if (!skillIndex[skill.name]) {
        skillIndex[skill.name] = []
      }
      skillIndex[skill.name].push(inst.instance)
    }
  }

  return {
    instances,
    skillIndex,
    totalMemories: instances.reduce((sum, i) => sum + i.memories.length, 0),
    totalSkills: instances.reduce((sum, i) => sum + i.skills.length, 0),
  }
}

/**
 * Find all instances that have a skill matching the given name.
 */
export async function findSkill(skillName: string): Promise<InstanceKnowledge[]> {
  const fleet = await getFleetKnowledge()
  return fleet.instances.filter((inst) =>
    inst.skills.some((skill) => skill.name === skillName)
  )
}
