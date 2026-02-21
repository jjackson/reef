'use client'

import { useState } from 'react'
import Link from 'next/link'
import { DirectoryNode } from './DirectoryNode'
import { FileViewer } from './FileViewer'

interface Props {
  instanceId: string
  agentId: string
}

export function AgentRow({ instanceId, agentId }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [viewingFile, setViewingFile] = useState<string | null>(null)

  const agentPath = `~/.openclaw/agents/${agentId}`

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
          <span className="font-mono">{agentId}</span>
        </button>
        <Link
          href={`/instances/${instanceId}/agents/${agentId}/chat`}
          className="text-xs px-2 py-1 rounded bg-purple-50 text-purple-700 hover:bg-purple-100 font-medium"
        >
          Chat
        </Link>
      </div>

      {expanded && (
        <div className="pb-1">
          <DirectoryNode
            instanceId={instanceId}
            path={agentPath}
            name={agentId}
            type="directory"
            depth={0}
            onFileClick={(filePath) => setViewingFile(filePath)}
          />
        </div>
      )}

      {viewingFile && (
        <FileViewer
          instanceId={instanceId}
          path={viewingFile}
          onClose={() => setViewingFile(null)}
        />
      )}
    </div>
  )
}
