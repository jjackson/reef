'use client'

import { useEffect } from 'react'
import { useDashboard } from './components/context/DashboardContext'
import { Sidebar } from './components/Sidebar'
import { AgentDetail } from './components/AgentDetail'
import { FileViewer } from './components/FileViewer'
import { ChatPanel } from './components/ChatPanel'
import { FleetPanel } from './components/FleetPanel'

export default function DashboardPage() {
  const { instances, setInstances, viewMode, setViewMode, checkedAgents } = useDashboard()

  useEffect(() => {
    fetch('/api/instances')
      .then(res => res.ok ? res.json() : [])
      .then(data => setInstances(data.map((inst: any) => ({ ...inst, agents: [] }))))
      .catch(() => {})
  }, [setInstances])

  useEffect(() => {
    if (checkedAgents.size >= 2) setViewMode('fleet')
  }, [checkedAgents.size, setViewMode])

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-hidden">
        {viewMode === 'detail' && <AgentDetail />}
        {viewMode === 'chat' && <ChatPanel />}
        {viewMode === 'file' && <FileViewer />}
        {viewMode === 'fleet' && <FleetPanel />}
      </main>
    </div>
  )
}
