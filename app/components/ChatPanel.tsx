'use client'

import { useDashboard } from './context/DashboardContext'
import { ChatWindow } from './ChatWindow'

export function ChatPanel() {
  const { instances, activeInstanceId, activeAgentId, setViewMode } = useDashboard()

  const instance = instances.find(i => i.id === activeInstanceId)
  const agent = instance?.agents.find(a => a.id === activeAgentId)

  const displayName = agent?.identityName || activeAgentId || 'agent'

  if (!activeInstanceId || !activeAgentId) {
    return <div className="p-6 text-sm text-slate-400">No agent selected</div>
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-3 border-b border-slate-200 bg-white flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5 text-sm">
          {agent?.identityEmoji && (
            <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-sm">
              {agent.identityEmoji}
            </div>
          )}
          <div>
            <span className="font-semibold text-slate-900">{displayName}</span>
            <span className="text-slate-400 font-mono text-xs ml-2">@ {instance?.label}</span>
          </div>
        </div>
        <button
          onClick={() => setViewMode('detail')}
          className="text-xs px-3 py-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium transition-colors"
        >
          Back
        </button>
      </div>

      {/* Chat */}
      <div className="flex-1 min-h-0">
        <ChatWindow
          instanceId={activeInstanceId}
          agentId={activeAgentId}
          agentName={displayName}
          agentEmoji={agent?.identityEmoji || ''}
        />
      </div>
    </div>
  )
}
