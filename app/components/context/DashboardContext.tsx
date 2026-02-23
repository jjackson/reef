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

export type ViewMode = 'detail' | 'chat' | 'file' | 'fleet' | 'broadcast' | 'instance'

export interface BroadcastAgent {
  instanceId: string
  agentId: string
  agentName: string
  agentEmoji: string
  instanceLabel: string
}

interface FileViewState {
  path: string
  name: string
}

interface FileEntry {
  name: string
  type: 'file' | 'directory'
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
  setActiveInstance: (instanceId: string) => void
  clearActive: () => void

  // View mode
  viewMode: ViewMode
  setViewMode: (mode: ViewMode) => void

  // File viewer state
  activeFile: FileViewState | null
  setActiveFile: (file: FileViewState | null) => void

  // Directory cache (session-only, keyed by "instanceId:path")
  dirCache: Map<string, FileEntry[]>
  setDirCache: (instanceId: string, path: string, entries: FileEntry[]) => void
  getDirCache: (instanceId: string, path: string) => FileEntry[] | undefined

  // Fleet checkboxes
  checkedAgents: Set<string> // "instanceId:agentId" format
  toggleAgentCheck: (instanceId: string, agentId: string) => void
  toggleInstanceCheck: (instanceId: string) => void
  toggleAll: () => void
  clearChecks: () => void

  // Broadcast
  broadcastMessage: string | null
  broadcastAgents: BroadcastAgent[]
  startBroadcast: (message: string) => void
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
  const [broadcastMessage, setBroadcastMessage] = useState<string | null>(null)
  const [broadcastAgents, setBroadcastAgents] = useState<BroadcastAgent[]>([])
  const [dirCache] = useState<Map<string, FileEntry[]>>(new Map())

  const setDirCache = useCallback((instanceId: string, path: string, entries: FileEntry[]) => {
    dirCache.set(`${instanceId}:${path}`, entries)
  }, [dirCache])

  const getDirCache = useCallback((instanceId: string, path: string) => {
    return dirCache.get(`${instanceId}:${path}`)
  }, [dirCache])

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

  const setActiveInstance = useCallback((instanceId: string) => {
    setActiveInstanceId(instanceId)
    setActiveAgentId(null)
    setViewMode('instance')
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

  const startBroadcast = useCallback((message: string) => {
    const agents: BroadcastAgent[] = []
    for (const key of checkedAgents) {
      const [instanceId, agentId] = key.split(':')
      const inst = instances.find(i => i.id === instanceId)
      if (!inst) continue
      const agent = inst.agents.find(a => a.id === agentId)
      if (!agent) continue
      agents.push({
        instanceId,
        agentId,
        agentName: agent.identityName,
        agentEmoji: agent.identityEmoji,
        instanceLabel: inst.label,
      })
    }
    setBroadcastMessage(message)
    setBroadcastAgents(agents)
    setViewMode('broadcast')
  }, [checkedAgents, instances])

  return (
    <DashboardContext.Provider value={{
      instances, setInstances, updateInstanceAgents,
      activeInstanceId, activeAgentId, setActiveAgent, setActiveInstance, clearActive,
      viewMode, setViewMode,
      activeFile, setActiveFile,
      dirCache, setDirCache, getDirCache,
      checkedAgents, toggleAgentCheck, toggleInstanceCheck, toggleAll, clearChecks,
      broadcastMessage, broadcastAgents, startBroadcast,
    }}>
      {children}
    </DashboardContext.Provider>
  )
}
