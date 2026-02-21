'use client'

import { useState } from 'react'
import Link from 'next/link'
import { DirectoryNode } from './DirectoryNode'

interface AgentInfo {
  id: string
  identityName: string
  identityEmoji: string
  workspace: string
  agentDir: string
  model: string
  isDefault: boolean
}

interface Props {
  instanceId: string
  agent: AgentInfo
}

/**
 * Converts an absolute workspace path (e.g. /root/.openclaw/workspace)
 * to a tilde path (~/.openclaw/workspace) for the browse API safety check.
 */
function toTildePath(absPath: string): string {
  const match = absPath.match(/\.openclaw\/(.*)/)
  return match ? `~/.openclaw/${match[1]}` : absPath
}

export function AgentRow({ instanceId, agent }: Props) {
  const [expanded, setExpanded] = useState(false)

  // Show the workspace directory — this is where IDENTITY.md, SOUL.md,
  // skills/, and other user-facing agent content lives.
  //
  // Other browseable paths available from agent metadata if needed later:
  //   - agent.agentDir  (e.g. /root/.openclaw/agents/main/agent) — auth-profiles.json, auth.json
  //   - ~/.openclaw/agents/${agent.id}/sessions — session history (sessions.json, *.jsonl)
  const workspacePath = agent.workspace
    ? toTildePath(agent.workspace)
    : `~/.openclaw/workspace`

  const displayName = agent.identityName || agent.id
  const emoji = agent.identityEmoji

  return (
    <div className="border-l-2 border-gray-100 ml-4">
      <div className="flex items-center justify-between py-1.5 px-3 hover:bg-gray-50 rounded">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 text-sm font-medium text-gray-800"
        >
          <span className="text-gray-400 text-xs w-3 text-center">
            {expanded ? '\u25BE' : '\u25B8'}
          </span>
          {emoji && <span>{emoji}</span>}
          <span>{displayName}</span>
          {agent.model && (
            <span className="text-xs text-gray-400 font-normal">{agent.model}</span>
          )}
        </button>
        <Link
          href={`/instances/${instanceId}/agents/${agent.id}/chat`}
          className="text-xs px-2 py-1 rounded bg-purple-50 text-purple-700 hover:bg-purple-100 font-medium"
        >
          Chat
        </Link>
      </div>

      {expanded && (
        <div className="pb-1">
          <DirectoryNode
            instanceId={instanceId}
            path={workspacePath}
            name={workspacePath}
            type="directory"
            depth={0}
          />
        </div>
      )}
    </div>
  )
}
