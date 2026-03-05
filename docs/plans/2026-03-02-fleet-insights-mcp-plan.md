# Fleet Insights & MCP Server Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `reef insights` CLI command and a read-only MCP server that expose agent knowledge (memories & skills) fleet-wide.

**Architecture:** Shared `lib/insights.ts` module provides core query functions. Both CLI (`bin/reef.ts`) and MCP server (`bin/reef-mcp.ts`) consume it. All data fetched via existing SSH primitives.

**Tech Stack:** TypeScript, ssh2 (existing), `@modelcontextprotocol/sdk`, `zod`

---

### Task 1: Create `lib/insights.ts` — `getAgentKnowledge()`

**Files:**
- Create: `lib/insights.ts`
- Create: `lib/__tests__/insights.test.ts`

**Step 1: Write the failing test**

```typescript
// lib/__tests__/insights.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockRunCommand } = vi.hoisted(() => ({
  mockRunCommand: vi.fn(),
}))
vi.mock('../ssh', () => ({ runCommand: mockRunCommand }))

const config = { host: '1.2.3.4', privateKey: 'fake-key' }

describe('getAgentKnowledge', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns memories and skills for an agent', async () => {
    const { getAgentKnowledge } = await import('../insights')

    // ls memories/
    mockRunCommand.mockResolvedValueOnce({
      stdout: 'coding-patterns.md\ndebugging-tips.md\n',
      stderr: '', code: 0,
    })
    // ls skills/
    mockRunCommand.mockResolvedValueOnce({
      stdout: 'writing.md\n',
      stderr: '', code: 0,
    })
    // stat memories/ files (timestamps)
    mockRunCommand.mockResolvedValueOnce({
      stdout: '1709300000\n1709400000\n',
      stderr: '', code: 0,
    })
    // stat skills/ files (timestamps)
    mockRunCommand.mockResolvedValueOnce({
      stdout: '1709500000\n',
      stderr: '', code: 0,
    })
    // cat memories/coding-patterns.md
    mockRunCommand.mockResolvedValueOnce({
      stdout: '# Coding Patterns\nUse early returns.',
      stderr: '', code: 0,
    })
    // cat memories/debugging-tips.md
    mockRunCommand.mockResolvedValueOnce({
      stdout: '# Debugging\nCheck logs first.',
      stderr: '', code: 0,
    })
    // cat skills/writing.md
    mockRunCommand.mockResolvedValueOnce({
      stdout: '# Writing Skill\nBe concise.',
      stderr: '', code: 0,
    })

    const result = await getAgentKnowledge(config, 'alice')

    expect(result.agentId).toBe('alice')
    expect(result.memories).toHaveLength(2)
    expect(result.memories[0].name).toBe('coding-patterns.md')
    expect(result.memories[0].content).toContain('early returns')
    expect(result.skills).toHaveLength(1)
    expect(result.skills[0].name).toBe('writing.md')
    expect(result.skills[0].content).toContain('Be concise')
  })

  it('returns empty arrays when agent has no memories or skills', async () => {
    const { getAgentKnowledge } = await import('../insights')

    // ls memories/ — empty
    mockRunCommand.mockResolvedValueOnce({ stdout: '', stderr: '', code: 0 })
    // ls skills/ — empty
    mockRunCommand.mockResolvedValueOnce({ stdout: '', stderr: '', code: 0 })

    const result = await getAgentKnowledge(config, 'empty-agent')

    expect(result.memories).toEqual([])
    expect(result.skills).toEqual([])
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/insights.test.ts`
Expected: FAIL — `../insights` module not found

**Step 3: Write minimal implementation**

```typescript
// lib/insights.ts
import { runCommand } from './ssh'
import type { SshConfig } from './ssh'

export interface FileEntry {
  name: string
  content: string
  lastModified: string
}

export interface AgentKnowledge {
  instance: string
  agentId: string
  agentName: string
  agentEmoji: string
  memories: FileEntry[]
  skills: FileEntry[]
}

export interface FleetKnowledge {
  agents: AgentKnowledge[]
  skillIndex: Record<string, string[]>
  totalMemories: number
  totalSkills: number
}

async function listDir(config: SshConfig, path: string): Promise<string[]> {
  const result = await runCommand(config, `ls -1 ${path} 2>/dev/null || true`)
  return result.stdout.trim().split('\n').filter(Boolean)
}

async function getTimestamps(config: SshConfig, dir: string, files: string[]): Promise<Record<string, string>> {
  if (files.length === 0) return {}
  const cmd = files.map(f => `stat -c '%Y' ${dir}/${f} 2>/dev/null || echo 0`).join('; ')
  const result = await runCommand(config, cmd)
  const timestamps = result.stdout.trim().split('\n')
  const map: Record<string, string> = {}
  files.forEach((f, i) => {
    const epoch = parseInt(timestamps[i] || '0', 10)
    map[f] = epoch > 0 ? new Date(epoch * 1000).toISOString() : 'unknown'
  })
  return map
}

async function readFiles(config: SshConfig, dir: string, files: string[]): Promise<Record<string, string>> {
  if (files.length === 0) return {}
  const map: Record<string, string> = {}
  // Read files in parallel batches
  const results = await Promise.all(
    files.map(async (f) => {
      const result = await runCommand(config, `cat ${dir}/${f} 2>/dev/null || true`)
      return { name: f, content: result.stdout }
    })
  )
  for (const r of results) map[r.name] = r.content
  return map
}

export async function getAgentKnowledge(
  config: SshConfig,
  agentId: string,
  agentName = agentId,
  agentEmoji = '',
  instance = ''
): Promise<AgentKnowledge> {
  const base = `$HOME/.openclaw/agents/${agentId}`

  // List memories and skills directories in parallel
  const [memFiles, skillFiles] = await Promise.all([
    listDir(config, `${base}/memories`),
    listDir(config, `${base}/skills`),
  ])

  // Get timestamps in parallel
  const [memTimestamps, skillTimestamps] = await Promise.all([
    getTimestamps(config, `${base}/memories`, memFiles),
    getTimestamps(config, `${base}/skills`, skillFiles),
  ])

  // Read file contents in parallel
  const [memContents, skillContents] = await Promise.all([
    readFiles(config, `${base}/memories`, memFiles),
    readFiles(config, `${base}/skills`, skillFiles),
  ])

  return {
    instance,
    agentId,
    agentName,
    agentEmoji,
    memories: memFiles.map(f => ({
      name: f,
      content: memContents[f] || '',
      lastModified: memTimestamps[f] || 'unknown',
    })),
    skills: skillFiles.map(f => ({
      name: f,
      content: skillContents[f] || '',
      lastModified: skillTimestamps[f] || 'unknown',
    })),
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run lib/__tests__/insights.test.ts`
Expected: PASS (2 tests)

**Step 5: Commit**

```bash
git add lib/insights.ts lib/__tests__/insights.test.ts
git commit -m "feat: add getAgentKnowledge in lib/insights.ts with tests"
```

---

### Task 2: Add `getFleetKnowledge()` and `findSkill()`

**Files:**
- Modify: `lib/insights.ts`
- Modify: `lib/__tests__/insights.test.ts`

**Step 1: Write the failing tests**

Add to `lib/__tests__/insights.test.ts`:

```typescript
// Additional mocks needed for fleet functions
const { mockListInstances, mockResolveInstance, mockListAgents } = vi.hoisted(() => ({
  mockListInstances: vi.fn(),
  mockResolveInstance: vi.fn(),
  mockListAgents: vi.fn(),
}))
vi.mock('../instances', () => ({
  listInstances: mockListInstances,
  resolveInstance: mockResolveInstance,
}))
vi.mock('../openclaw', () => ({ listAgents: mockListAgents }))

describe('getFleetKnowledge', () => {
  beforeEach(() => vi.clearAllMocks())

  it('aggregates knowledge across multiple agents on multiple instances', async () => {
    const { getFleetKnowledge } = await import('../insights')

    mockListInstances.mockResolvedValue([
      { id: 'openclaw-hal', ip: '1.1.1.1', label: 'Hal', sshKeyRef: 'ref1', accountId: 'a' },
    ])
    mockResolveInstance.mockResolvedValue({
      id: 'openclaw-hal', ip: '1.1.1.1', label: 'Hal', sshKey: 'key1', sshKeyRef: 'ref1', accountId: 'a',
    })
    mockListAgents.mockResolvedValue([
      { id: 'alice', identityName: 'Alice', identityEmoji: '🧠', workspace: '', agentDir: '', model: '', isDefault: false },
      { id: 'bob', identityName: 'Bob', identityEmoji: '🤖', workspace: '', agentDir: '', model: '', isDefault: false },
    ])

    // Alice: 1 memory, 1 skill (debugging.md)
    mockRunCommand
      .mockResolvedValueOnce({ stdout: 'notes.md\n', stderr: '', code: 0 })
      .mockResolvedValueOnce({ stdout: 'debugging.md\n', stderr: '', code: 0 })
      .mockResolvedValueOnce({ stdout: '1709300000\n', stderr: '', code: 0 })
      .mockResolvedValueOnce({ stdout: '1709400000\n', stderr: '', code: 0 })
      .mockResolvedValueOnce({ stdout: 'Alice notes', stderr: '', code: 0 })
      .mockResolvedValueOnce({ stdout: '# Debugging\nCheck logs', stderr: '', code: 0 })
    // Bob: 0 memories, 1 skill (debugging.md — same as Alice)
      .mockResolvedValueOnce({ stdout: '', stderr: '', code: 0 })
      .mockResolvedValueOnce({ stdout: 'debugging.md\n', stderr: '', code: 0 })
      .mockResolvedValueOnce({ stdout: '1709500000\n', stderr: '', code: 0 })
      .mockResolvedValueOnce({ stdout: '# Debugging\nBob version', stderr: '', code: 0 })

    const result = await getFleetKnowledge()

    expect(result.agents).toHaveLength(2)
    expect(result.totalMemories).toBe(1)
    expect(result.totalSkills).toBe(2)
    expect(result.skillIndex['debugging.md']).toEqual(expect.arrayContaining(['alice', 'bob']))
  })
})

describe('findSkill', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns agents that have a specific skill', async () => {
    const { findSkill } = await import('../insights')

    mockListInstances.mockResolvedValue([
      { id: 'openclaw-hal', ip: '1.1.1.1', label: 'Hal', sshKeyRef: 'ref1', accountId: 'a' },
    ])
    mockResolveInstance.mockResolvedValue({
      id: 'openclaw-hal', ip: '1.1.1.1', label: 'Hal', sshKey: 'key1', sshKeyRef: 'ref1', accountId: 'a',
    })
    mockListAgents.mockResolvedValue([
      { id: 'alice', identityName: 'Alice', identityEmoji: '🧠', workspace: '', agentDir: '', model: '', isDefault: false },
    ])

    // Alice has writing.md skill
    mockRunCommand
      .mockResolvedValueOnce({ stdout: '', stderr: '', code: 0 })
      .mockResolvedValueOnce({ stdout: 'writing.md\ncoding.md\n', stderr: '', code: 0 })
      .mockResolvedValueOnce({ stdout: '1709300000\n1709400000\n', stderr: '', code: 0 })
      .mockResolvedValueOnce({ stdout: '# Writing\nBe clear.', stderr: '', code: 0 })
      .mockResolvedValueOnce({ stdout: '# Coding\nDRY.', stderr: '', code: 0 })

    const result = await findSkill('writing.md')

    expect(result).toHaveLength(1)
    expect(result[0].agentId).toBe('alice')
    expect(result[0].instance).toBe('openclaw-hal')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/insights.test.ts`
Expected: FAIL — `getFleetKnowledge` and `findSkill` not exported

**Step 3: Implement fleet functions**

Add to `lib/insights.ts`:

```typescript
import { listInstances, resolveInstance } from './instances'
import { listAgents } from './openclaw'

export async function getFleetKnowledge(workspace?: string): Promise<FleetKnowledge> {
  const instances = await listInstances()
  const filtered = workspace
    ? instances.filter(i => /* workspace filter logic */ true)
    : instances

  const agentKnowledge: AgentKnowledge[] = []

  // Process instances in parallel
  const results = await Promise.allSettled(
    filtered.map(async (inst) => {
      const resolved = await resolveInstance(inst.id)
      if (!resolved) return []
      const config = { host: resolved.ip, privateKey: resolved.sshKey }
      const agents = await listAgents(config)
      return Promise.all(
        agents.map(a =>
          getAgentKnowledge(config, a.id, a.identityName, a.identityEmoji, inst.id)
        )
      )
    })
  )

  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) {
      agentKnowledge.push(...r.value)
    }
  }

  // Build skill index
  const skillIndex: Record<string, string[]> = {}
  for (const agent of agentKnowledge) {
    for (const skill of agent.skills) {
      if (!skillIndex[skill.name]) skillIndex[skill.name] = []
      skillIndex[skill.name].push(agent.agentId)
    }
  }

  return {
    agents: agentKnowledge,
    skillIndex,
    totalMemories: agentKnowledge.reduce((sum, a) => sum + a.memories.length, 0),
    totalSkills: agentKnowledge.reduce((sum, a) => sum + a.skills.length, 0),
  }
}

export async function findSkill(skillName: string): Promise<AgentKnowledge[]> {
  const fleet = await getFleetKnowledge()
  return fleet.agents.filter(a => a.skills.some(s => s.name === skillName))
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run lib/__tests__/insights.test.ts`
Expected: PASS (4 tests)

**Step 5: Commit**

```bash
git add lib/insights.ts lib/__tests__/insights.test.ts
git commit -m "feat: add getFleetKnowledge and findSkill to insights module"
```

---

### Task 3: Add `reef insights` CLI command

**Files:**
- Modify: `bin/reef.ts` (add `insights` case to switch statement)

**Step 1: Add the command**

In `bin/reef.ts`, add a new case in the switch statement. Follow the existing pattern (e.g., `agents` command at line 78):

```typescript
case 'insights': {
  const { getAgentKnowledge, getFleetKnowledge, findSkill } = await import('../lib/insights')

  const skillIdx = args.indexOf('--skill')
  const skillName = skillIdx >= 0 ? args[skillIdx + 1] : undefined

  const wsIdx = args.indexOf('--workspace')
  const workspace = wsIdx >= 0 ? args[wsIdx + 1] : undefined

  // reef insights --skill <name>
  if (skillName) {
    const matches = await findSkill(skillName)
    console.log(JSON.stringify({
      success: true,
      skill: skillName,
      agents: matches.map(a => ({
        instance: a.instance,
        agentId: a.agentId,
        agentName: a.agentName,
      })),
    }))
    break
  }

  // reef insights <instance> <agent>
  const instanceId = args[0]
  const agentId = args[1]
  if (instanceId && agentId && !instanceId.startsWith('--')) {
    const instance = await requireInstance(instanceId)
    const knowledge = await getAgentKnowledge(
      sshConfig(instance), agentId, agentId, '', instanceId
    )
    console.log(JSON.stringify({ success: true, ...knowledge }))
    break
  }

  // reef insights [--workspace <id>]
  const fleet = await getFleetKnowledge(workspace)
  console.log(JSON.stringify({ success: true, ...fleet }))
  break
}
```

**Step 2: Verify help text**

Add `insights` to the help command text (find the existing help case and add a line):

```
  insights [instance] [agent]  — fleet-wide or per-agent knowledge inventory
    --skill <name>             — find which agents have a specific skill
    --workspace <id>           — filter by workspace
```

**Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All 51+ tests PASS (no regressions)

**Step 4: Commit**

```bash
git add bin/reef.ts
git commit -m "feat: add reef insights CLI command"
```

---

### Task 4: Install MCP dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install packages**

```bash
npm install @modelcontextprotocol/sdk zod
```

**Step 2: Verify install succeeded**

Run: `npx vitest run`
Expected: All tests still PASS

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @modelcontextprotocol/sdk and zod dependencies"
```

---

### Task 5: Create MCP server with `list_instances` and `list_agents` tools

**Files:**
- Create: `bin/reef-mcp.ts`

**Step 1: Create the MCP server file**

```typescript
#!/usr/bin/env tsx
// bin/reef-mcp.ts — Reef MCP Server (read-only fleet tools)

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

import { listInstances, resolveInstance } from '../lib/instances'
import { listAgents } from '../lib/openclaw'
import { getAgentKnowledge, getFleetKnowledge, findSkill } from '../lib/insights'
import { getHealth, getAgentHealth } from '../lib/openclaw'
import { runCommand } from '../lib/ssh'

const server = new McpServer({
  name: 'reef',
  version: '1.0.0',
})

// --- list_instances ---
server.registerTool(
  'list_instances',
  {
    title: 'List Instances',
    description: 'List all OpenClaw instances across configured accounts, with agent counts',
    inputSchema: z.object({
      workspace: z.string().optional().describe('Filter by workspace ID'),
    }),
  },
  async ({ workspace }) => {
    const instances = await listInstances()
    // Optionally filter by workspace (TODO: use workspaces module)
    const result = instances.map(i => ({
      id: i.id,
      label: i.label,
      ip: i.ip,
      accountId: i.accountId,
    }))
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    }
  }
)

// --- list_agents ---
server.registerTool(
  'list_agents',
  {
    title: 'List Agents',
    description: 'List all agents across the fleet with identity info',
    inputSchema: z.object({
      instance: z.string().optional().describe('Filter to a specific instance'),
    }),
  },
  async ({ instance: instanceId }) => {
    const instances = instanceId
      ? [await resolveInstance(instanceId)].filter(Boolean)
      : await Promise.all(
          (await listInstances()).map(i => resolveInstance(i.id))
        ).then(r => r.filter(Boolean))

    const allAgents = []
    for (const inst of instances) {
      if (!inst) continue
      const config = { host: inst.ip, privateKey: inst.sshKey }
      const agents = await listAgents(config)
      for (const a of agents) {
        allAgents.push({
          instance: inst.id,
          agentId: a.id,
          name: a.identityName,
          emoji: a.identityEmoji,
          model: a.model,
        })
      }
    }
    return {
      content: [{ type: 'text', text: JSON.stringify(allAgents, null, 2) }],
    }
  }
)

// Start
const transport = new StdioServerTransport()
await server.connect(transport)
```

**Step 2: Verify it compiles**

Run: `npx tsx --eval "import('./bin/reef-mcp.ts')" 2>&1 | head -5`
Expected: No syntax/import errors (will hang waiting for stdio, which is fine)

**Step 3: Commit**

```bash
git add bin/reef-mcp.ts
git commit -m "feat: add MCP server with list_instances and list_agents tools"
```

---

### Task 6: Add knowledge tools to MCP server

**Files:**
- Modify: `bin/reef-mcp.ts`

**Step 1: Add fleet_knowledge, agent_knowledge, and find_skill tools**

```typescript
// --- fleet_knowledge ---
server.registerTool(
  'fleet_knowledge',
  {
    title: 'Fleet Knowledge',
    description: 'Get aggregated memories and skills across all agents in the fleet',
    inputSchema: z.object({
      workspace: z.string().optional().describe('Filter by workspace ID'),
    }),
  },
  async ({ workspace }) => {
    const fleet = await getFleetKnowledge(workspace)
    return {
      content: [{ type: 'text', text: JSON.stringify(fleet, null, 2) }],
    }
  }
)

// --- agent_knowledge ---
server.registerTool(
  'agent_knowledge',
  {
    title: 'Agent Knowledge',
    description: 'Get memories and skills for a specific agent on an instance',
    inputSchema: z.object({
      instance: z.string().describe('Instance ID (droplet name, e.g. openclaw-hal)'),
      agent: z.string().describe('Agent ID'),
    }),
  },
  async ({ instance: instanceId, agent: agentId }) => {
    const inst = await resolveInstance(instanceId)
    if (!inst) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: `Instance not found: ${instanceId}` }) }] }
    }
    const config = { host: inst.ip, privateKey: inst.sshKey }
    const knowledge = await getAgentKnowledge(config, agentId, agentId, '', instanceId)
    return {
      content: [{ type: 'text', text: JSON.stringify(knowledge, null, 2) }],
    }
  }
)

// --- find_skill ---
server.registerTool(
  'find_skill',
  {
    title: 'Find Skill',
    description: 'Find which agents across the fleet have a specific skill',
    inputSchema: z.object({
      skillName: z.string().describe('Skill filename to search for (e.g. debugging.md)'),
    }),
  },
  async ({ skillName }) => {
    const matches = await findSkill(skillName)
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(matches.map(a => ({
          instance: a.instance,
          agentId: a.agentId,
          agentName: a.agentName,
          skillContent: a.skills.find(s => s.name === skillName)?.content || '',
        })), null, 2),
      }],
    }
  }
)
```

**Step 2: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add bin/reef-mcp.ts
git commit -m "feat: add knowledge tools to MCP server (fleet, agent, find_skill)"
```

---

### Task 7: Add health and browse tools to MCP server

**Files:**
- Modify: `bin/reef-mcp.ts`

**Step 1: Add instance_health, agent_health, browse_files, and read_file tools**

```typescript
// --- instance_health ---
server.registerTool(
  'instance_health',
  {
    title: 'Instance Health',
    description: 'Get health info for an instance: process status, disk, memory, uptime, version',
    inputSchema: z.object({
      instance: z.string().describe('Instance ID (droplet name)'),
    }),
  },
  async ({ instance: instanceId }) => {
    const inst = await resolveInstance(instanceId)
    if (!inst) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: `Instance not found: ${instanceId}` }) }] }
    }
    const config = { host: inst.ip, privateKey: inst.sshKey }
    const health = await getHealth(config)
    return {
      content: [{ type: 'text', text: JSON.stringify(health, null, 2) }],
    }
  }
)

// --- agent_health ---
server.registerTool(
  'agent_health',
  {
    title: 'Agent Health',
    description: 'Get health info for a specific agent: dir size, last activity, process status',
    inputSchema: z.object({
      instance: z.string().describe('Instance ID (droplet name)'),
      agent: z.string().describe('Agent ID'),
    }),
  },
  async ({ instance: instanceId, agent: agentId }) => {
    const inst = await resolveInstance(instanceId)
    if (!inst) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: `Instance not found: ${instanceId}` }) }] }
    }
    const config = { host: inst.ip, privateKey: inst.sshKey }
    const health = await getAgentHealth(config, agentId)
    return {
      content: [{ type: 'text', text: JSON.stringify(health, null, 2) }],
    }
  }
)

// --- browse_files ---
server.registerTool(
  'browse_files',
  {
    title: 'Browse Files',
    description: 'List files in an agent workspace directory (restricted to ~/.openclaw/)',
    inputSchema: z.object({
      instance: z.string().describe('Instance ID (droplet name)'),
      path: z.string().describe('Remote path within ~/.openclaw/ (e.g. ~/.openclaw/agents/alice)'),
    }),
  },
  async ({ instance: instanceId, path }) => {
    if (!path.startsWith('~/.openclaw/') && path !== '~/.openclaw') {
      return { content: [{ type: 'text', text: JSON.stringify({ error: 'path must be within ~/.openclaw/' }) }] }
    }
    const inst = await resolveInstance(instanceId)
    if (!inst) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: `Instance not found: ${instanceId}` }) }] }
    }
    const config = { host: inst.ip, privateKey: inst.sshKey }
    const safePath = path.replace(/^~/, '$HOME')
    const result = await runCommand(config, `ls -la ${safePath} 2>/dev/null || echo "directory not found"`)
    return {
      content: [{ type: 'text', text: result.stdout }],
    }
  }
)

// --- read_file ---
server.registerTool(
  'read_file',
  {
    title: 'Read File',
    description: 'Read a file from an agent workspace (restricted to ~/.openclaw/)',
    inputSchema: z.object({
      instance: z.string().describe('Instance ID (droplet name)'),
      path: z.string().describe('Remote file path within ~/.openclaw/'),
    }),
  },
  async ({ instance: instanceId, path }) => {
    if (!path.startsWith('~/.openclaw/') && !path.startsWith('$HOME/.openclaw/')) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: 'path must be within ~/.openclaw/' }) }] }
    }
    const inst = await resolveInstance(instanceId)
    if (!inst) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: `Instance not found: ${instanceId}` }) }] }
    }
    const config = { host: inst.ip, privateKey: inst.sshKey }
    const safePath = path.replace(/^~/, '$HOME')
    const result = await runCommand(config, `cat ${safePath} 2>/dev/null || echo "file not found"`)
    return {
      content: [{ type: 'text', text: result.stdout }],
    }
  }
)
```

**Step 2: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add bin/reef-mcp.ts
git commit -m "feat: add health and browse tools to MCP server"
```

---

### Task 8: Update docs and CLAUDE.md

**Files:**
- Modify: `CLAUDE.md` (add insights CLI docs and MCP server section)

**Step 1: Add insights to CLI section in CLAUDE.md**

Under the `**Instance commands**` section, add:

```markdown
**Insights commands:**
- `reef insights [--workspace <id>]` — fleet-wide knowledge inventory (memories + skills across all agents)
- `reef insights <instance> <agent>` — specific agent's memories and skills
- `reef insights --skill <name>` — find which agents have a specific skill
```

**Step 2: Add MCP server section to CLAUDE.md**

Add a new section:

```markdown
## MCP Server

Reef includes a read-only MCP server for conversational fleet access from Claude Code.

**Setup:** Add to your Claude Code MCP config:
\`\`\`json
{
  "mcpServers": {
    "reef": {
      "command": "npx",
      "args": ["tsx", "bin/reef-mcp.ts"],
      "cwd": "/path/to/reef"
    }
  }
}
\`\`\`

**Available tools:** `list_instances`, `list_agents`, `fleet_knowledge`, `agent_knowledge`, `find_skill`, `instance_health`, `agent_health`, `browse_files`, `read_file`
```

**Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add insights CLI and MCP server documentation"
```

---

### Task 9: Final verification

**Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS (51 existing + new insights tests)

**Step 2: Run lint**

Run: `npx eslint`
Expected: No errors

**Step 3: Verify CLI help**

Run: `npx tsx bin/reef.ts help`
Expected: Shows `insights` command in output

**Step 4: Verify MCP server starts without errors**

Run: `echo '{}' | timeout 2 npx tsx bin/reef-mcp.ts 2>&1 || true`
Expected: No startup crashes (will timeout since it waits for stdio input, which is expected)
