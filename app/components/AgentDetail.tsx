'use client'

import { useState } from 'react'
import { useDashboard } from './context/DashboardContext'
import { DirectoryNode } from './DirectoryNode'
import { MigrateDialog } from './MigrateDialog'

interface HealthResult {
  processRunning: boolean
  disk: string
  memory: string
  uptime: string
}

export function AgentDetail() {
  const { instances, activeInstanceId, activeAgentId, setViewMode, setActiveFile } = useDashboard()
  const [health, setHealth] = useState<HealthResult | null>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showMigrate, setShowMigrate] = useState(false)

  const instance = instances.find(i => i.id === activeInstanceId)
  const agent = instance?.agents.find(a => a.id === activeAgentId)

  if (!instance || !agent) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        Select an agent from the sidebar
      </div>
    )
  }

  const workspacePath = agent.workspace
    ? agent.workspace.replace(/.*?(\.openclaw\/)/, '~/.$1')
    : '~/.openclaw/workspace'

  async function runAction(action: string) {
    setLoading(action)
    setError(null)
    try {
      const res = await fetch(`/api/instances/${instance!.id}/agents/${agent!.id}/${action}`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      if (action === 'health') setHealth(data)
      if (action === 'backup') alert(`Backup saved: ${data.path}`)
      if (action === 'hygiene') alert(`Errors: ${data.errorCount}, Stale files: ${data.staleFileCount}, Size: ${data.dirSize}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {agent.identityEmoji && <span className="text-2xl">{agent.identityEmoji}</span>}
            <div>
              <h2 className="text-lg font-bold text-gray-900">{agent.identityName || agent.id}</h2>
              <p className="text-xs text-gray-500 font-mono">{instance.label} &middot; {instance.ip}</p>
            </div>
          </div>
          {agent.model && (
            <span className="text-xs text-gray-400 font-mono">{agent.model}</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="px-6 py-3 border-b border-gray-100 flex flex-wrap gap-2">
        <button
          onClick={() => runAction('health')}
          disabled={!!loading}
          className="text-xs px-3 py-1.5 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50 font-medium"
        >
          {loading === 'health' ? 'Checking...' : 'Health'}
        </button>
        <button
          onClick={() => runAction('hygiene')}
          disabled={!!loading}
          className="text-xs px-3 py-1.5 rounded bg-yellow-50 text-yellow-700 hover:bg-yellow-100 disabled:opacity-50 font-medium"
        >
          {loading === 'hygiene' ? 'Checking...' : 'Hygiene'}
        </button>
        <button
          onClick={() => runAction('backup')}
          disabled={!!loading}
          className="text-xs px-3 py-1.5 rounded bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50 font-medium"
        >
          {loading === 'backup' ? 'Backing up...' : 'Backup'}
        </button>
        <button
          onClick={() => setViewMode('chat')}
          className="text-xs px-3 py-1.5 rounded bg-purple-50 text-purple-700 hover:bg-purple-100 font-medium"
        >
          Chat
        </button>
        <button
          onClick={() => setShowMigrate(true)}
          className="text-xs px-3 py-1.5 rounded bg-gray-50 text-gray-700 hover:bg-gray-100 font-medium"
        >
          Migrate...
        </button>
      </div>

      {/* Health summary */}
      {health && (
        <div className="px-6 py-2 border-b border-gray-100 text-xs text-gray-600 font-mono space-y-0.5">
          <div>Process: {health.processRunning ? 'running' : 'stopped'}</div>
          <div>Disk: {health.disk}</div>
          <div>Memory: {health.memory}</div>
          <div>Uptime: {health.uptime}</div>
        </div>
      )}

      {error && (
        <div className="px-6 py-2 text-xs text-red-600">{error}</div>
      )}

      {/* Directory tree */}
      <div className="px-4 py-3">
        <p className="text-xs text-gray-400 px-2 pb-1 font-mono">{workspacePath}</p>
        <DirectoryNode
          instanceId={instance.id}
          path={workspacePath}
          name={workspacePath.split('/').pop() || 'workspace'}
          type="directory"
          depth={0}
          onFileClick={(path, name) => {
            setActiveFile({ path, name })
            setViewMode('file')
          }}
        />
      </div>

      {showMigrate && instance && agent && (
        <MigrateDialog
          instanceId={instance.id}
          agentId={agent.id}
          onClose={() => setShowMigrate(false)}
        />
      )}
    </div>
  )
}
