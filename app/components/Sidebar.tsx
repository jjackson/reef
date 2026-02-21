'use client'

import { useState } from 'react'
import { useDashboard, AgentInfo } from './context/DashboardContext'

function AgentItem({ instanceId, agent }: { instanceId: string; agent: AgentInfo }) {
  const { activeInstanceId, activeAgentId, setActiveAgent, checkedAgents, toggleAgentCheck } = useDashboard()
  const isActive = activeInstanceId === instanceId && activeAgentId === agent.id
  const isChecked = checkedAgents.has(`${instanceId}:${agent.id}`)

  return (
    <div
      className={`flex items-center gap-2 py-1 px-2 ml-4 rounded text-sm cursor-pointer ${
        isActive ? 'bg-blue-100 text-blue-900' : 'hover:bg-gray-100 text-gray-700'
      }`}
    >
      <input
        type="checkbox"
        checked={isChecked}
        onChange={(e) => { e.stopPropagation(); toggleAgentCheck(instanceId, agent.id) }}
        className="h-3 w-3 rounded border-gray-300"
      />
      <div
        className="flex items-center gap-1.5 flex-1 min-w-0"
        onClick={() => setActiveAgent(instanceId, agent.id)}
      >
        <span className="text-xs">{agent.identityEmoji || '\u25CF'}</span>
        <span className="truncate font-medium">{agent.identityName || agent.id}</span>
      </div>
    </div>
  )
}

function MachineItem({ instance }: { instance: { id: string; label: string; ip: string } }) {
  const { instances, updateInstanceAgents, checkedAgents, toggleInstanceCheck } = useDashboard()
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)

  const stored = instances.find(i => i.id === instance.id)
  const agents = stored?.agents ?? []
  const hasAgents = agents.length > 0

  // Check if all agents on this machine are checked
  const allChecked = hasAgents && agents.every(a => checkedAgents.has(`${instance.id}:${a.id}`))
  const someChecked = !allChecked && agents.some(a => checkedAgents.has(`${instance.id}:${a.id}`))

  async function toggle() {
    if (expanded) { setExpanded(false); return }
    if (!hasAgents) {
      setLoading(true)
      try {
        const res = await fetch(`/api/instances/${instance.id}/agents`)
        if (res.ok) {
          const data = await res.json()
          updateInstanceAgents(instance.id, data)
        }
      } finally {
        setLoading(false)
      }
    }
    setExpanded(true)
  }

  return (
    <div>
      <div className="flex items-center gap-2 py-1.5 px-2 rounded text-sm hover:bg-gray-100">
        <input
          type="checkbox"
          checked={allChecked}
          ref={(el) => { if (el) el.indeterminate = someChecked }}
          onChange={() => toggleInstanceCheck(instance.id)}
          className="h-3 w-3 rounded border-gray-300"
        />
        <button
          onClick={toggle}
          className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
        >
          <span className="text-gray-400 text-xs w-3 text-center">
            {loading ? '\u22EF' : expanded ? '\u25BE' : '\u25B8'}
          </span>
          <span className="font-semibold text-gray-900 truncate">{instance.label}</span>
        </button>
      </div>
      {expanded && (
        <div className="pb-1">
          {agents.length === 0 && !loading && (
            <p className="text-xs text-gray-400 italic ml-8 py-1">No agents</p>
          )}
          {agents.map(agent => (
            <AgentItem key={agent.id} instanceId={instance.id} agent={agent} />
          ))}
        </div>
      )}
    </div>
  )
}

export function Sidebar() {
  const { instances, checkedAgents, toggleAll } = useDashboard()
  const allAgents = instances.flatMap(i => i.agents.map(a => `${i.id}:${a.id}`))
  const allChecked = allAgents.length > 0 && allAgents.every(k => checkedAgents.has(k))

  return (
    <aside className="w-64 border-r border-gray-200 bg-white flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-200">
        <h1 className="text-lg font-bold text-gray-900">reef</h1>
        <p className="text-xs text-gray-500">OpenClaw management</p>
      </div>
      <div className="px-2 py-1 border-b border-gray-100">
        <label className="flex items-center gap-2 text-xs text-gray-500 px-2 py-1 cursor-pointer">
          <input
            type="checkbox"
            checked={allChecked}
            onChange={toggleAll}
            className="h-3 w-3 rounded border-gray-300"
          />
          Select all
        </label>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {instances.map(inst => (
          <MachineItem key={inst.id} instance={inst} />
        ))}
        {instances.length === 0 && (
          <p className="text-xs text-gray-400 italic px-2 py-4">Loading...</p>
        )}
      </div>
    </aside>
  )
}
