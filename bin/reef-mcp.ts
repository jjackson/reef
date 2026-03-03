#!/usr/bin/env tsx
/**
 * Reef MCP Server — read-only fleet access for Claude Code.
 *
 * Exposes 9 tools for conversational fleet introspection:
 *   list_instances, list_agents, fleet_knowledge, agent_knowledge,
 *   find_skill, instance_health, agent_health, browse_files, read_file
 *
 * Usage:
 *   npx tsx bin/reef-mcp.ts
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

import { listInstances, resolveInstance } from '../lib/instances'
import { listAgents, getHealth, getAgentHealth } from '../lib/openclaw'
import { getInstanceKnowledge, getFleetKnowledge, findSkill } from '../lib/insights'
import { runCommand } from '../lib/ssh'
import type { SshConfig } from '../lib/ssh'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonText(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
}

function errorResult(message: string) {
  return { content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }] }
}

async function resolveOrError(instanceId: string) {
  const resolved = await resolveInstance(instanceId)
  if (!resolved) return null
  return resolved
}

function toSshConfig(resolved: { ip: string; sshKey: string }): SshConfig {
  return { host: resolved.ip, privateKey: resolved.sshKey }
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'reef',
  version: '1.0.0',
})

// ---------------------------------------------------------------------------
// Tool 1: list_instances
// ---------------------------------------------------------------------------
server.registerTool(
  'list_instances',
  {
    title: 'List Instances',
    description: 'List all OpenClaw instances across configured cloud accounts. Optionally filter by workspace.',
    inputSchema: {
      workspace: z.string().optional().describe('Workspace ID to filter by'),
    },
  },
  async ({ workspace }) => {
    try {
      let instances = await listInstances()

      if (workspace) {
        const { loadSettings } = await import('../lib/settings')
        const settings = loadSettings()
        const ws = settings.workspaces[workspace]
        if (ws) {
          const wsInstances = new Set(ws.instances)
          instances = instances.filter((inst) => wsInstances.has(inst.id))
        }
      }

      const result = instances.map((inst) => ({
        id: inst.id,
        label: inst.label,
        ip: inst.ip,
        accountId: inst.accountId,
      }))

      return jsonText(result)
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err))
    }
  }
)

// ---------------------------------------------------------------------------
// Tool 2: list_agents
// ---------------------------------------------------------------------------
server.registerTool(
  'list_agents',
  {
    title: 'List Agents',
    description: 'List all agents across the fleet with identity info. Optionally filter to a single instance.',
    inputSchema: {
      instance: z.string().optional().describe('Instance ID to filter to (e.g. "openclaw-hal")'),
    },
  },
  async ({ instance: instanceFilter }) => {
    try {
      let instances = await listInstances()

      if (instanceFilter) {
        instances = instances.filter((inst) => inst.id === instanceFilter)
        if (instances.length === 0) {
          return errorResult(`Instance not found: ${instanceFilter}`)
        }
      }

      const results: Array<{
        instance: string
        agentId: string
        name: string
        emoji: string
        model: string
      }> = []

      for (const inst of instances) {
        try {
          const resolved = await resolveInstance(inst.id)
          if (!resolved) continue

          const config = toSshConfig(resolved)
          const agents = await listAgents(config)

          for (const agent of agents) {
            results.push({
              instance: inst.id,
              agentId: agent.id,
              name: agent.identityName,
              emoji: agent.identityEmoji,
              model: agent.model,
            })
          }
        } catch {
          // Skip instances we cannot reach
        }
      }

      return jsonText(results)
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err))
    }
  }
)

// ---------------------------------------------------------------------------
// Tool 3: fleet_knowledge
// ---------------------------------------------------------------------------
server.registerTool(
  'fleet_knowledge',
  {
    title: 'Fleet Knowledge',
    description: 'Get aggregated memories, skills, and identity files across all instances in the fleet. Optionally filter by workspace.',
    inputSchema: {
      workspace: z.string().optional().describe('Workspace ID to filter by'),
    },
  },
  async ({ workspace }) => {
    try {
      const knowledge = await getFleetKnowledge(workspace)
      return jsonText(knowledge)
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err))
    }
  }
)

// ---------------------------------------------------------------------------
// Tool 4: instance_knowledge
// ---------------------------------------------------------------------------
server.registerTool(
  'instance_knowledge',
  {
    title: 'Instance Knowledge',
    description: 'Get memories, skills, and identity files for an instance from ~/.openclaw/workspace/.',
    inputSchema: {
      instance: z.string().describe('Instance ID (e.g. "openclaw-hal")'),
    },
  },
  async ({ instance: instanceId }) => {
    try {
      const resolved = await resolveOrError(instanceId)
      if (!resolved) return errorResult(`Instance not found: ${instanceId}`)

      const config = toSshConfig(resolved)
      const knowledge = await getInstanceKnowledge(config, instanceId)
      return jsonText(knowledge)
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err))
    }
  }
)

// ---------------------------------------------------------------------------
// Tool 5: find_skill
// ---------------------------------------------------------------------------
server.registerTool(
  'find_skill',
  {
    title: 'Find Skill',
    description: 'Find which instances across the fleet have a specific skill directory.',
    inputSchema: {
      skillName: z.string().describe('Skill directory name to search for (e.g. "coding")'),
    },
  },
  async ({ skillName }) => {
    try {
      const matches = await findSkill(skillName)
      const result = matches.map((inst) => ({
        instance: inst.instance,
        skillContent: inst.skills.find((s) => s.name === skillName)?.content ?? '',
      }))
      return jsonText(result)
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err))
    }
  }
)

// ---------------------------------------------------------------------------
// Tool 6: instance_health
// ---------------------------------------------------------------------------
server.registerTool(
  'instance_health',
  {
    title: 'Instance Health',
    description: 'Get health info (process status, disk, memory, uptime, version) for an instance.',
    inputSchema: {
      instance: z.string().describe('Instance ID (e.g. "openclaw-hal")'),
    },
  },
  async ({ instance: instanceId }) => {
    try {
      const resolved = await resolveOrError(instanceId)
      if (!resolved) return errorResult(`Instance not found: ${instanceId}`)

      const config = toSshConfig(resolved)
      const health = await getHealth(config)
      return jsonText(health)
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err))
    }
  }
)

// ---------------------------------------------------------------------------
// Tool 7: agent_health
// ---------------------------------------------------------------------------
server.registerTool(
  'agent_health',
  {
    title: 'Agent Health',
    description: 'Get health info (directory size, last activity, process status) for a specific agent.',
    inputSchema: {
      instance: z.string().describe('Instance ID (e.g. "openclaw-hal")'),
      agent: z.string().describe('Agent ID (e.g. "main")'),
    },
  },
  async ({ instance: instanceId, agent: agentId }) => {
    try {
      const resolved = await resolveOrError(instanceId)
      if (!resolved) return errorResult(`Instance not found: ${instanceId}`)

      const config = toSshConfig(resolved)
      const health = await getAgentHealth(config, agentId)
      return jsonText(health)
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err))
    }
  }
)

// ---------------------------------------------------------------------------
// Tool 8: browse_files
// ---------------------------------------------------------------------------
server.registerTool(
  'browse_files',
  {
    title: 'Browse Files',
    description: 'List files in an agent workspace directory. Path must start with ~/.openclaw/ for security.',
    inputSchema: {
      instance: z.string().describe('Instance ID (e.g. "openclaw-hal")'),
      path: z.string().describe('Remote path starting with ~/.openclaw/ (e.g. "~/.openclaw/agents/main/")'),
    },
  },
  async ({ instance: instanceId, path: remotePath }) => {
    try {
      if (!remotePath.startsWith('~/.openclaw/')) {
        return errorResult('Path must start with ~/.openclaw/ for security')
      }
      if (remotePath.includes('..')) {
        return errorResult('Path traversal (..) is not allowed')
      }

      const resolved = await resolveOrError(instanceId)
      if (!resolved) return errorResult(`Instance not found: ${instanceId}`)

      const config = toSshConfig(resolved)
      const safePath = remotePath.replace(/^~/, '$HOME')
      const result = await runCommand(config, `ls -la "${safePath}"`)

      if (result.code !== 0) {
        return errorResult(`Failed to list directory: ${result.stderr || 'directory not found'}`)
      }

      return jsonText({ path: remotePath, listing: result.stdout.trim() })
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err))
    }
  }
)

// ---------------------------------------------------------------------------
// Tool 9: read_file
// ---------------------------------------------------------------------------
server.registerTool(
  'read_file',
  {
    title: 'Read File',
    description: 'Read a file from an agent workspace. Path must start with ~/.openclaw/ for security.',
    inputSchema: {
      instance: z.string().describe('Instance ID (e.g. "openclaw-hal")'),
      path: z.string().describe('Remote file path starting with ~/.openclaw/ (e.g. "~/.openclaw/agents/main/memories/core.md")'),
    },
  },
  async ({ instance: instanceId, path: remotePath }) => {
    try {
      if (!remotePath.startsWith('~/.openclaw/')) {
        return errorResult('Path must start with ~/.openclaw/ for security')
      }
      if (remotePath.includes('..')) {
        return errorResult('Path traversal (..) is not allowed')
      }

      const resolved = await resolveOrError(instanceId)
      if (!resolved) return errorResult(`Instance not found: ${instanceId}`)

      const config = toSshConfig(resolved)
      const safePath = remotePath.replace(/^~/, '$HOME')
      const result = await runCommand(config, `cat "${safePath}"`)

      if (result.code !== 0) {
        return errorResult(`Failed to read file: ${result.stderr || 'file not found'}`)
      }

      return jsonText({ path: remotePath, content: result.stdout })
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err))
    }
  }
)

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err) => {
  console.error('Reef MCP server failed to start:', err)
  process.exit(1)
})
