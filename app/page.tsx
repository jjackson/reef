'use client'

import { useEffect } from 'react'
import { useDashboard } from './components/context/DashboardContext'
import { Sidebar } from './components/Sidebar'
import { AgentDetail } from './components/AgentDetail'
import { InstanceDetail } from './components/InstanceDetail'
import { ChatPanel } from './components/ChatPanel'
import { FleetPanel } from './components/FleetPanel'
import { BroadcastPanel } from './components/BroadcastPanel'

export default function DashboardPage() {
  const { instances, setInstances, viewMode, setViewMode, checkedAgents } = useDashboard()

  useEffect(() => {
    fetch('/api/instances')
      .then(res => res.ok ? res.json() : [])
      .then(data => setInstances(data.map((inst: any) => ({ ...inst, agents: [] }))))
      .catch(() => {})
  }, [setInstances])

  useEffect(() => {
    if (checkedAgents.size >= 2 && viewMode !== 'broadcast') setViewMode('fleet')
  }, [checkedAgents.size, setViewMode, viewMode])

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-hidden">
        {viewMode === 'instance' && <InstanceDetail />}
        {(viewMode === 'detail' || viewMode === 'file') && <AgentDetail />}
        {viewMode === 'chat' && <ChatPanel />}
        {viewMode === 'fleet' && <FleetPanel />}
        {viewMode === 'broadcast' && <BroadcastPanel />}
      </main>
    </div>
  )
}
