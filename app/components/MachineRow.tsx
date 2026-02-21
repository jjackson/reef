'use client'

import { useState } from 'react'
import { AgentRow } from './AgentRow'

interface Instance {
  id: string
  label: string
  ip: string
}

interface HealthResult {
  processRunning: boolean
  disk: string
  memory: string
  uptime: string
}

export function MachineRow({ instance }: { instance: Instance }) {
  const [expanded, setExpanded] = useState(false)
  const [agents, setAgents] = useState<string[] | null>(null)
  const [health, setHealth] = useState<HealthResult | null>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function expand() {
    if (expanded) { setExpanded(false); return }
    if (!agents) {
      setLoading('agents')
      try {
        const res = await fetch(`/api/instances/${instance.id}/agents`)
        const data = await res.json()
        setAgents(res.ok ? data : [])
      } finally {
        setLoading(null)
      }
    }
    setExpanded(true)
  }

  async function checkHealth() {
    setLoading('health')
    setError(null)
    try {
      const res = await fetch(`/api/instances/${instance.id}/health`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setHealth(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(null)
    }
  }

  async function runCheck() {
    setLoading('check')
    setError(null)
    try {
      const res = await fetch(`/api/instances/${instance.id}/check`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      alert(data.output) // simple output display for v1
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(null)
    }
  }

  async function backup() {
    setLoading('backup')
    setError(null)
    try {
      const res = await fetch(`/api/instances/${instance.id}/backup`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      alert(`Backup saved: ${data.path}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(null)
    }
  }

  const statusColor = health === null
    ? 'bg-gray-300'
    : health.processRunning
    ? 'bg-green-500'
    : 'bg-red-500'

  return (
    <div className="border border-gray-200 rounded-lg bg-white shadow-sm overflow-hidden">
      {/* Machine header */}
      <div className="flex items-center justify-between px-4 py-3">
        <button
          onClick={expand}
          className="flex items-center gap-3 text-left"
        >
          <span className="text-gray-400 text-xs w-3">
            {loading === 'agents' ? '...' : expanded ? '\u25BE' : '\u25B8'}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${statusColor}`} />
              <span className="font-semibold text-gray-900">{instance.label}</span>
            </div>
            <span className="text-xs text-gray-500 font-mono">{instance.ip}</span>
          </div>
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={checkHealth}
            disabled={!!loading}
            className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50"
          >
            {loading === 'health' ? '...' : 'Health'}
          </button>
          <button
            onClick={runCheck}
            disabled={!!loading}
            className="text-xs px-2 py-1 rounded bg-yellow-50 text-yellow-700 hover:bg-yellow-100 disabled:opacity-50"
          >
            {loading === 'check' ? '...' : 'Hygiene'}
          </button>
          <button
            onClick={backup}
            disabled={!!loading}
            className="text-xs px-2 py-1 rounded bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50"
          >
            {loading === 'backup' ? '...' : 'Backup'}
          </button>
        </div>
      </div>

      {/* Health summary (shown after check) */}
      {health && (
        <div className="px-4 pb-2 text-xs text-gray-500 font-mono flex gap-4">
          <span>disk: {health.disk}</span>
          <span>mem: {health.memory}</span>
          <span>{health.uptime}</span>
        </div>
      )}

      {error && (
        <div className="px-4 pb-2 text-xs text-red-600">{error}</div>
      )}

      {/* Agent tree */}
      {expanded && (
        <div className="border-t border-gray-100 py-2">
          {agents && agents.length === 0 && (
            <p className="text-xs text-gray-400 italic px-6 py-1">
              No agents found in ~/.openclaw/agents/
            </p>
          )}
          {agents?.map((agentId) => (
            <AgentRow key={agentId} instanceId={instance.id} agentId={agentId} />
          ))}
        </div>
      )}
    </div>
  )
}
