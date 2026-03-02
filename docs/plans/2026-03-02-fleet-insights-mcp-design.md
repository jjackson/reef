# Fleet Insights & MCP Server Design

## Overview

Two features that share a core library:
1. **`reef insights`** CLI command — query agent memories and skills across the fleet
2. **Reef MCP Server** — read-only fleet tools for conversational access from Claude Code

## Architecture

Shared library approach: `lib/insights.ts` provides the core logic. CLI command and MCP server both consume it.

```
lib/insights.ts          ← core: SSH into agents, read memories/ & skills/, aggregate
  ├── bin/reef.ts        ← CLI: `reef insights` command
  └── bin/reef-mcp.ts    ← MCP: stdio server with read-only fleet tools
```

## Data Model

```typescript
interface AgentKnowledge {
  instance: string
  agentId: string
  agentName: string
  agentEmoji: string
  memories: FileEntry[]
  skills: FileEntry[]
}

interface FileEntry {
  name: string
  content: string
  lastModified: string
}

interface FleetKnowledge {
  agents: AgentKnowledge[]
  skillIndex: Record<string, string[]>  // skill name → agent IDs
  totalMemories: number
  totalSkills: number
}
```

## Core Library (`lib/insights.ts`)

Functions:
- `getAgentKnowledge(instanceId, agentId)` — read one agent's memories/ and skills/
- `getFleetKnowledge(workspace?)` — parallelize across all agents, build skill index
- `findSkill(skillName)` — which agents have a given skill

Uses existing: `listInstances()`, `listAgents()`, `buildSshConfig()`, `runCommand()`.

## CLI Command

```
reef insights                           # fleet-wide knowledge inventory
reef insights <instance> <agent>        # specific agent's knowledge
reef insights --skill <name>            # find which agents have a skill
reef insights --workspace <id>          # filter by workspace
```

Output: `{ success: true, agents: [...], skillIndex: {...}, totalMemories: N, totalSkills: N }`

## MCP Server (`bin/reef-mcp.ts`)

Stdio transport. Read-only tools:

| Tool | Description |
|------|-------------|
| `list_instances` | All instances with agent counts |
| `list_agents` | Agents fleet-wide with identity info |
| `fleet_knowledge` | Aggregated memories & skills |
| `agent_knowledge` | One agent's memories and skills |
| `find_skill` | Which agents have a given skill |
| `instance_health` | Instance health check |
| `agent_health` | Agent health check |
| `browse_files` | List files in agent workspace |
| `read_file` | Read a file from agent workspace |

Registration:
```json
{
  "mcpServers": {
    "reef": {
      "command": "npx",
      "args": ["tsx", "bin/reef-mcp.ts"],
      "cwd": "/path/to/reef"
    }
  }
}
```

## Testing

- Unit tests for `lib/insights.ts` with mocked SSH
- MCP server tool schema validation tests
- No E2E for MCP (requires live instances)

## Decisions

- **Approach B chosen**: shared library consumed by both CLI and MCP (not CLI-wrapping or MCP-first)
- **MCP scope**: read-only fleet tools, no write/action operations
- **Insights focus**: agent knowledge (memories + skills), not performance metrics
