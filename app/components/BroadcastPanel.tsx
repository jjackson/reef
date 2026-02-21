// app/components/BroadcastPanel.tsx
'use client'

import { useState } from 'react'
import { useDashboard } from './context/DashboardContext'
import { ChatWindow } from './ChatWindow'

export function BroadcastPanel() {
  const { broadcastAgents, broadcastMessage, setViewMode } = useDashboard()
  const [activeTabKey, setActiveTabKey] = useState<string>(
    broadcastAgents.length > 0 ? `${broadcastAgents[0].instanceId}:${broadcastAgents[0].agentId}` : ''
  )

  if (broadcastAgents.length === 0 || !broadcastMessage) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-slate-400">No broadcast session active</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-slate-50/50">
      {/* Header */}
      <div className="px-6 py-3 border-b border-slate-200 bg-white flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5 text-sm">
          <span className="font-semibold text-slate-900">Broadcast Chat</span>
          <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
            {broadcastAgents.length} agent{broadcastAgents.length !== 1 ? 's' : ''}
          </span>
        </div>
        <button
          onClick={() => setViewMode('fleet')}
          className="text-xs px-3 py-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium transition-colors"
        >
          Back
        </button>
      </div>

      {/* Tab strip */}
      <div className="flex border-b border-slate-200 bg-white px-4 gap-1 shrink-0 overflow-x-auto">
        {broadcastAgents.map(agent => {
          const key = `${agent.instanceId}:${agent.agentId}`
          const isActive = key === activeTabKey
          return (
            <button
              key={key}
              onClick={() => setActiveTabKey(key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                isActive
                  ? 'border-slate-800 text-slate-900'
                  : 'border-transparent text-slate-400 hover:text-slate-600 hover:border-slate-300'
              }`}
            >
              {agent.agentEmoji && <span className="text-xs">{agent.agentEmoji}</span>}
              <span>{agent.agentName}</span>
            </button>
          )
        })}
      </div>

      {/* Chat windows — all mounted, only active visible */}
      <div className="flex-1 overflow-hidden relative">
        {broadcastAgents.map(agent => {
          const key = `${agent.instanceId}:${agent.agentId}`
          const isActive = key === activeTabKey
          return (
            <div
              key={key}
              className={`absolute inset-0 ${isActive ? 'z-10' : 'z-0 pointer-events-none opacity-0'}`}
            >
              <ChatWindow
                instanceId={agent.instanceId}
                agentId={agent.agentId}
                agentName={agent.agentName}
                agentEmoji={agent.agentEmoji}
                initialMessage={broadcastMessage}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
