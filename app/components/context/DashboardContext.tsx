'use client'

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

export interface AgentInfo {
  id: string
  identityName: string
  identityEmoji: string
  workspace: string
  agentDir: string
  model: string
  isDefault: boolean
}

export interface InstanceWithAgents {
  id: string
  label: string
  ip: string
  agents: AgentInfo[]
}

export type ViewMode = 'detail' | 'chat' | 'file' | 'fleet'

interface FileViewState {
  path: string
  name: string
}

interface DashboardState {
  // Data
  instances: InstanceWithAgents[]
  setInstances: (instances: InstanceWithAgents[]) => void
  updateInstanceAgents: (instanceId: string, agents: AgentInfo[]) => void

  // Active selection (what's shown in main panel)
  activeInstanceId: string | null
  activeAgentId: string | null
  setActiveAgent: (instanceId: string, agentId: string) => void
  clearActive: () => void

  // View mode
  viewMode: ViewMode
  setViewMode: (mode: ViewMode) => void

  // File viewer state
  activeFile: FileViewState | null
  setActiveFile: (file: FileViewState | null) => void

  // Fleet checkboxes
  checkedAgents: Set<string> // "instanceId:agentId" format
  toggleAgentCheck: (instanceId: string, agentId: string) => void
  toggleInstanceCheck: (instanceId: string) => void
  toggleAll: () => void
  clearChecks: () => void
}

const DashboardContext = createContext<DashboardState | null>(null)

export function useDashboard() {
  const ctx = useContext(DashboardContext)
  if (!ctx) throw new Error('useDashboard must be used within DashboardProvider')
  return ctx
}

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [instances, setInstances] = useState<InstanceWithAgents[]>([])
  const [activeInstanceId, setActiveInstanceId] = useState<string | null>(null)
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('detail')
  const [activeFile, setActiveFile] = useState<FileViewState | null>(null)
  const [checkedAgents, setCheckedAgents] = useState<Set<string>>(new Set())

  const updateInstanceAgents = useCallback((instanceId: string, agents: AgentInfo[]) => {
    setInstances(prev => prev.map(inst =>
      inst.id === instanceId ? { ...inst, agents } : inst
    ))
  }, [])

  const setActiveAgent = useCallback((instanceId: string, agentId: string) => {
    setActiveInstanceId(instanceId)
    setActiveAgentId(agentId)
    setViewMode('detail')
    setActiveFile(null)
  }, [])

  const clearActive = useCallback(() => {
    setActiveInstanceId(null)
    setActiveAgentId(null)
    setViewMode('detail')
    setActiveFile(null)
  }, [])

  const toggleAgentCheck = useCallback((instanceId: string, agentId: string) => {
    const key = `${instanceId}:${agentId}`
    setCheckedAgents(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const toggleInstanceCheck = useCallback((instanceId: string) => {
    const inst = instances.find(i => i.id === instanceId)
    if (!inst) return
    setCheckedAgents(prev => {
      const next = new Set(prev)
      const keys = inst.agents.map(a => `${instanceId}:${a.id}`)
      const allChecked = keys.every(k => prev.has(k))
      keys.forEach(k => allChecked ? next.delete(k) : next.add(k))
      return next
    })
  }, [instances])

  const toggleAll = useCallback(() => {
    setCheckedAgents(prev => {
      const allKeys = instances.flatMap(i => i.agents.map(a => `${i.id}:${a.id}`))
      const allChecked = allKeys.length > 0 && allKeys.every(k => prev.has(k))
      return allChecked ? new Set() : new Set(allKeys)
    })
  }, [instances])

  const clearChecks = useCallback(() => {
    setCheckedAgents(new Set())
  }, [])

  return (
    <DashboardContext.Provider value={{
      instances, setInstances, updateInstanceAgents,
      activeInstanceId, activeAgentId, setActiveAgent, clearActive,
      viewMode, setViewMode,
      activeFile, setActiveFile,
      checkedAgents, toggleAgentCheck, toggleInstanceCheck, toggleAll, clearChecks,
    }}>
      {children}
    </DashboardContext.Provider>
  )
}
