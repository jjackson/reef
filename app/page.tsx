'use client'

import { useEffect } from 'react'
import { useDashboard } from './components/context/DashboardContext'
import { Sidebar } from './components/Sidebar'
import { AgentDetail } from './components/AgentDetail'

export default function DashboardPage() {
  const { instances, setInstances, viewMode, checkedAgents } = useDashboard()

  useEffect(() => {
    fetch('/api/instances')
      .then(res => res.ok ? res.json() : [])
      .then(data => setInstances(data.map((inst: any) => ({ ...inst, agents: [] }))))
      .catch(() => {})
  }, [setInstances])

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-hidden">
        {viewMode === 'detail' && <AgentDetail />}
        {viewMode === 'chat' && <div className="p-6 text-gray-400 text-sm">Chat — coming in Task 8</div>}
        {viewMode === 'file' && <div className="p-6 text-gray-400 text-sm">File viewer — coming in Task 7</div>}
        {viewMode === 'fleet' && <div className="p-6 text-gray-400 text-sm">Fleet — coming in Task 11</div>}
      </main>
    </div>
  )
}
