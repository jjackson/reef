'use client'

import { useState } from 'react'
import { useDashboard } from './context/DashboardContext'

type ActionType = 'health' | 'hygiene' | 'backup'
type ActionStatus = 'pending' | 'running' | 'success' | 'error'

interface ActionResult {
  key: string // "instanceId:agentId"
  instanceId: string
  agentId: string
  instanceLabel: string
  status: ActionStatus
  data?: any
  error?: string
}

export function FleetPanel() {
  const { instances, checkedAgents, setViewMode, startBroadcast } = useDashboard()
  const [results, setResults] = useState<ActionResult[]>([])
  const [running, setRunning] = useState(false)
  const [showBroadcastInput, setShowBroadcastInput] = useState(false)
  const [broadcastInput, setBroadcastInput] = useState('')

  const checkedList = Array.from(checkedAgents).map(key => {
    const [instanceId, agentId] = key.split(':')
    const inst = instances.find(i => i.id === instanceId)
    return { key, instanceId, agentId, instanceLabel: inst?.label ?? instanceId }
  })

  async function runAction(action: ActionType) {
    setRunning(true)
    const initial: ActionResult[] = checkedList.map(c => ({
      ...c,
      status: 'pending' as const,
    }))
    setResults(initial)

    // Run all in parallel
    const promises = checkedList.map(async ({ key, instanceId, agentId, instanceLabel }) => {
      setResults(prev => prev.map(r => r.key === key ? { ...r, status: 'running' } : r))

      try {
        const res = await fetch(`/api/instances/${instanceId}/agents/${agentId}/${action}`, {
          method: 'POST',
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        setResults(prev => prev.map(r =>
          r.key === key ? { ...r, status: 'success', data } : r
        ))
      } catch (e) {
        setResults(prev => prev.map(r =>
          r.key === key ? { ...r, status: 'error', error: e instanceof Error ? e.message : 'Unknown' } : r
        ))
      }
    })

    await Promise.allSettled(promises)
    setRunning(false)
  }

  const statusIcon: Record<ActionStatus, string> = {
    pending: '\u2022',
    running: '\u22EF',
    success: '\u2713',
    error: '\u2717',
  }

  const statusColor: Record<ActionStatus, string> = {
    pending: 'text-gray-400',
    running: 'text-blue-500',
    success: 'text-green-600',
    error: 'text-red-600',
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">
            {checkedList.length} agent{checkedList.length !== 1 ? 's' : ''} selected
          </h2>
          <button
            onClick={() => setViewMode('detail')}
            className="text-xs px-3 py-1.5 rounded bg-gray-100 text-gray-700 hover:bg-gray-200 font-medium"
          >
            Back
          </button>
        </div>
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => runAction('health')}
            disabled={running || checkedList.length === 0}
            className="text-xs px-3 py-1.5 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50 font-medium"
          >
            Health All
          </button>
          <button
            onClick={() => runAction('hygiene')}
            disabled={running || checkedList.length === 0}
            className="text-xs px-3 py-1.5 rounded bg-yellow-50 text-yellow-700 hover:bg-yellow-100 disabled:opacity-50 font-medium"
          >
            Hygiene All
          </button>
          <button
            onClick={() => runAction('backup')}
            disabled={running || checkedList.length === 0}
            className="text-xs px-3 py-1.5 rounded bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50 font-medium"
          >
            Backup All
          </button>
          <button
            onClick={() => setShowBroadcastInput(v => !v)}
            disabled={running || checkedList.length === 0}
            className="text-xs px-3 py-1.5 rounded bg-purple-50 text-purple-700 hover:bg-purple-100 disabled:opacity-50 font-medium"
          >
            Broadcast
          </button>
        </div>
      </div>

      {showBroadcastInput && (
        <div className="px-6 py-3 border-b border-gray-200 bg-purple-50/50">
          <div className="flex gap-2">
            <textarea
              value={broadcastInput}
              onChange={(e) => setBroadcastInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  if (broadcastInput.trim()) {
                    startBroadcast(broadcastInput.trim())
                    setBroadcastInput('')
                    setShowBroadcastInput(false)
                  }
                }
              }}
              placeholder="Enter a prompt to send to all selected agents..."
              rows={2}
              className="flex-1 resize-none rounded-lg border border-purple-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent bg-white placeholder:text-purple-300"
              autoFocus
            />
            <button
              onClick={() => {
                if (broadcastInput.trim()) {
                  startBroadcast(broadcastInput.trim())
                  setBroadcastInput('')
                  setShowBroadcastInput(false)
                }
              }}
              disabled={!broadcastInput.trim()}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-40 transition-colors"
            >
              Send
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {results.length === 0 && (
          <p className="text-sm text-gray-400 px-6 py-8 text-center">
            Select an action above to run on all checked agents
          </p>
        )}
        {results.map(r => (
          <div key={r.key} className="px-6 py-2 border-b border-gray-50 flex items-center gap-3">
            <span className={`font-mono text-sm ${statusColor[r.status]}`}>
              {statusIcon[r.status]}
            </span>
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium text-gray-900">{r.agentId}</span>
              <span className="text-xs text-gray-400 ml-2">{r.instanceLabel}</span>
            </div>
            <div className="text-xs text-gray-500 font-mono truncate max-w-xs">
              {r.status === 'success' && r.data && (
                typeof r.data === 'object' ? JSON.stringify(r.data) : String(r.data)
              )}
              {r.status === 'error' && (
                <span className="text-red-600">{r.error}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
