'use client'

import { useEffect } from 'react'
import { useDashboard, InstanceWithAgents } from './components/context/DashboardContext'
import { Sidebar } from './components/Sidebar'
import { AgentDetail } from './components/AgentDetail'
import { InstanceDetail } from './components/InstanceDetail'
import { ChatPanel } from './components/ChatPanel'
import { FleetPanel } from './components/FleetPanel'
import { BroadcastPanel } from './components/BroadcastPanel'
import { HomePanel } from './components/HomePanel'

export default function DashboardPage() {
  const { instances, setAccountInstances, viewMode, setViewMode, checkedAgents } = useDashboard()

  useEffect(() => {
    const loadData = async () => {
      try {
        const [accountsRes, instancesRes] = await Promise.all([
          fetch('/api/accounts'),
          fetch('/api/instances'),
        ])
        const accountsData = accountsRes.ok ? await accountsRes.json() : { accounts: [] }
        const instancesData = instancesRes.ok ? await instancesRes.json() : []

        // Group instances by accountId
        const grouped = new Map<string, InstanceWithAgents[]>()
        for (const inst of instancesData) {
          const accountId = inst.accountId || 'default'
          if (!grouped.has(accountId)) grouped.set(accountId, [])
          grouped.get(accountId)!.push({ ...inst, agents: [] })
        }

        // Set each account's instances
        for (const acct of accountsData.accounts) {
          setAccountInstances(acct.id, acct.label, grouped.get(acct.id) || [])
        }

        // Handle instances with no matching account (legacy/default)
        const defaultInstances = grouped.get('default')
        if (defaultInstances?.length) {
          setAccountInstances('default', 'Default', defaultInstances)
        }
      } catch {}
    }
    loadData()
  }, [setAccountInstances])

  useEffect(() => {
    if (checkedAgents.size >= 2 && viewMode !== 'broadcast') setViewMode('fleet')
  }, [checkedAgents.size, setViewMode, viewMode])

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-hidden">
        {viewMode === 'home' && <HomePanel />}
        {viewMode === 'instance' && <InstanceDetail />}
        {(viewMode === 'detail' || viewMode === 'file') && <AgentDetail />}
        {viewMode === 'chat' && <ChatPanel />}
        {viewMode === 'fleet' && <FleetPanel />}
        {viewMode === 'broadcast' && <BroadcastPanel />}
      </main>
    </div>
  )
}
