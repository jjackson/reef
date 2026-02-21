# Reef v2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the flat machine-card dashboard into a sidebar-driven management console with agent-level operations, file viewing/editing, streaming chat, agent migration, and fleet-wide bulk actions.

**Architecture:** Single-page app with React context for selection/view state. Sidebar (machine > agent tree) persists on the left. Main panel swaps between agent detail, file viewer, streaming chat, and fleet results. All new features build on existing lib/ modules.

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS, ssh2, @1password/sdk, react-markdown (new dep), Vitest

---

## Task 0: Commit uncommitted v1 improvements

There are uncommitted changes on main (AgentRow, MachineRow, openclaw.ts, tests, name-map.json) that must be committed before starting v2 work.

**Step 1: Commit the staged changes**

```bash
git add app/components/AgentRow.tsx app/components/MachineRow.tsx lib/openclaw.ts lib/__tests__/openclaw.test.ts config/name-map.json .claude/settings.local.json
git commit -m "feat: rich AgentInfo metadata, structured chat responses, real name mappings"
```

**Step 2: Verify tests pass**

```bash
npm run test:run
```

Expected: All tests pass.

---

## Task 1: Install new dependency

**Step 1: Install react-markdown**

```bash
npm install react-markdown
```

**Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add react-markdown for file viewer"
```

---

## Task 2: Dashboard context provider

**Files:**
- Create: `app/components/context/DashboardContext.tsx`

This context holds: active machine/agent selection, view mode, fleet checkbox state. Every component in the sidebar and main panel consumes this.

**Step 1: Create `app/components/context/DashboardContext.tsx`**

```tsx
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
```

**Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

**Step 3: Commit**

```bash
git add app/components/context/DashboardContext.tsx
git commit -m "feat: add DashboardContext for selection, view mode, and fleet state"
```

---

## Task 3: Sidebar component

**Files:**
- Create: `app/components/Sidebar.tsx`

The sidebar shows a machine > agent tree. Clicking an agent sets it as active. Checkboxes for fleet selection. Machines expand to load agents from the API.

**Step 1: Create `app/components/Sidebar.tsx`**

```tsx
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
```

**Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add app/components/Sidebar.tsx
git commit -m "feat: add sidebar with machine > agent tree and fleet checkboxes"
```

---

## Task 4: Agent detail panel

**Files:**
- Create: `app/components/AgentDetail.tsx`

Shows agent metadata, action buttons, and directory tree. Replaces the old inline AgentRow expansion.

**Step 1: Create `app/components/AgentDetail.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { useDashboard } from './context/DashboardContext'
import { DirectoryNode } from './DirectoryNode'

interface HealthResult {
  processRunning: boolean
  disk: string
  memory: string
  uptime: string
}

export function AgentDetail() {
  const { instances, activeInstanceId, activeAgentId, setViewMode, setActiveFile } = useDashboard()
  const [health, setHealth] = useState<HealthResult | null>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const instance = instances.find(i => i.id === activeInstanceId)
  const agent = instance?.agents.find(a => a.id === activeAgentId)

  if (!instance || !agent) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        Select an agent from the sidebar
      </div>
    )
  }

  const workspacePath = agent.workspace
    ? agent.workspace.replace(/.*?(\.openclaw\/)/, '~/.$1')
    : '~/.openclaw/workspace'

  async function runAction(action: string) {
    setLoading(action)
    setError(null)
    try {
      const res = await fetch(`/api/instances/${instance!.id}/agents/${agent!.id}/${action}`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      if (action === 'health') setHealth(data)
      if (action === 'backup') alert(`Backup saved: ${data.path}`)
      if (action === 'hygiene') alert(`Errors: ${data.errorCount}, Stale files: ${data.staleFileCount}, Size: ${data.dirSize}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {agent.identityEmoji && <span className="text-2xl">{agent.identityEmoji}</span>}
            <div>
              <h2 className="text-lg font-bold text-gray-900">{agent.identityName || agent.id}</h2>
              <p className="text-xs text-gray-500 font-mono">{instance.label} &middot; {instance.ip}</p>
            </div>
          </div>
          {agent.model && (
            <span className="text-xs text-gray-400 font-mono">{agent.model}</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="px-6 py-3 border-b border-gray-100 flex flex-wrap gap-2">
        <button
          onClick={() => runAction('health')}
          disabled={!!loading}
          className="text-xs px-3 py-1.5 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50 font-medium"
        >
          {loading === 'health' ? 'Checking...' : 'Health'}
        </button>
        <button
          onClick={() => runAction('hygiene')}
          disabled={!!loading}
          className="text-xs px-3 py-1.5 rounded bg-yellow-50 text-yellow-700 hover:bg-yellow-100 disabled:opacity-50 font-medium"
        >
          {loading === 'hygiene' ? 'Checking...' : 'Hygiene'}
        </button>
        <button
          onClick={() => runAction('backup')}
          disabled={!!loading}
          className="text-xs px-3 py-1.5 rounded bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50 font-medium"
        >
          {loading === 'backup' ? 'Backing up...' : 'Backup'}
        </button>
        <button
          onClick={() => setViewMode('chat')}
          className="text-xs px-3 py-1.5 rounded bg-purple-50 text-purple-700 hover:bg-purple-100 font-medium"
        >
          Chat
        </button>
        <button
          onClick={() => {/* migrate dialog — Task 10 */}}
          className="text-xs px-3 py-1.5 rounded bg-gray-50 text-gray-700 hover:bg-gray-100 font-medium"
        >
          Migrate...
        </button>
      </div>

      {/* Health summary */}
      {health && (
        <div className="px-6 py-2 border-b border-gray-100 text-xs text-gray-600 font-mono space-y-0.5">
          <div>Process: {health.processRunning ? 'running' : 'stopped'}</div>
          <div>Disk: {health.disk}</div>
          <div>Memory: {health.memory}</div>
          <div>Uptime: {health.uptime}</div>
        </div>
      )}

      {error && (
        <div className="px-6 py-2 text-xs text-red-600">{error}</div>
      )}

      {/* Directory tree */}
      <div className="px-4 py-3">
        <p className="text-xs text-gray-400 px-2 pb-1 font-mono">{workspacePath}</p>
        <DirectoryNode
          instanceId={instance.id}
          path={workspacePath}
          name={workspacePath.split('/').pop() || 'workspace'}
          type="directory"
          depth={0}
          onFileClick={(path, name) => {
            setActiveFile({ path, name })
            setViewMode('file')
          }}
        />
      </div>
    </div>
  )
}
```

**Step 2: Update DirectoryNode to accept an optional `onFileClick` callback**

In `app/components/DirectoryNode.tsx`, add the `onFileClick` prop so clicking a file can trigger the file viewer.

Change the `Props` interface:

```typescript
interface Props {
  instanceId: string
  path: string
  name: string
  type: 'file' | 'directory'
  depth?: number
  onFileClick?: (path: string, name: string) => void
}
```

Update the component signature:

```typescript
export function DirectoryNode({ instanceId, path, name, type, depth = 0, onFileClick }: Props) {
```

Update the `onClick` on the file row:

```typescript
        onClick={() => {
          if (type === 'directory') toggle()
          else if (onFileClick) onFileClick(path, name)
        }}
```

And pass `onFileClick` through to children:

```tsx
            <DirectoryNode
              key={child.name}
              instanceId={instanceId}
              path={`${path}/${child.name}`}
              name={child.name}
              type={child.type}
              depth={depth + 1}
              onFileClick={onFileClick}
            />
```

**Step 3: Verify it compiles**

```bash
npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add app/components/AgentDetail.tsx app/components/DirectoryNode.tsx
git commit -m "feat: add AgentDetail panel with actions and directory tree"
```

---

## Task 5: Rewire page.tsx to sidebar + main panel layout

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/layout.tsx`

Replace the current flat card list with the two-panel layout.

**Step 1: Update `app/layout.tsx`**

Update the metadata and wrap children with the dashboard provider:

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { DashboardProvider } from "./components/context/DashboardContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Reef",
  description: "OpenClaw instance management",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <DashboardProvider>
          {children}
        </DashboardProvider>
      </body>
    </html>
  );
}
```

**Step 2: Rewrite `app/page.tsx`**

```tsx
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
```

**Step 3: Start dev server and verify the layout**

```bash
node node_modules/next/dist/bin/next dev
```

Open http://localhost:3000. Verify: sidebar on the left with machines, clicking a machine loads agents, clicking an agent shows the detail panel on the right.

**Step 4: Commit**

```bash
git add app/page.tsx app/layout.tsx
git commit -m "feat: two-panel layout with sidebar and main panel"
```

---

## Task 6: Agent-level API routes and lib functions

**Files:**
- Modify: `lib/openclaw.ts` (add 3 functions)
- Create: `lib/__tests__/openclaw-agent-ops.test.ts`
- Create: `app/api/instances/[id]/agents/[agentId]/health/route.ts`
- Create: `app/api/instances/[id]/agents/[agentId]/hygiene/route.ts`
- Create: `app/api/instances/[id]/agents/[agentId]/backup/route.ts`

**Step 1: Write failing tests**

Create `lib/__tests__/openclaw-agent-ops.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockRunCommand } = vi.hoisted(() => ({
  mockRunCommand: vi.fn(),
}))
vi.mock('../ssh', () => ({ runCommand: mockRunCommand, sftpPull: vi.fn() }))

import { getAgentHealth, runAgentHygieneCheck, backupAgent } from '../openclaw'

const config = { host: '1.2.3.4', privateKey: 'fake-key' }

describe('getAgentHealth', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns health data for an existing agent', async () => {
    mockRunCommand
      .mockResolvedValueOnce({ stdout: 'exists\n', stderr: '', code: 0 })
      .mockResolvedValueOnce({ stdout: '1.2G\n', stderr: '', code: 0 })
      .mockResolvedValueOnce({ stdout: '1708000000.000\n', stderr: '', code: 0 })
      .mockResolvedValueOnce({ stdout: 'running\n', stderr: '', code: 0 })

    const result = await getAgentHealth(config, 'hal')
    expect(result.exists).toBe(true)
    expect(result.dirSize).toBe('1.2G')
    expect(result.processRunning).toBe(true)
  })

  it('returns exists: false for a missing agent', async () => {
    mockRunCommand
      .mockResolvedValueOnce({ stdout: 'missing\n', stderr: '', code: 0 })
      .mockResolvedValueOnce({ stdout: '0\n', stderr: '', code: 0 })
      .mockResolvedValueOnce({ stdout: '0\n', stderr: '', code: 0 })
      .mockResolvedValueOnce({ stdout: 'stopped\n', stderr: '', code: 0 })

    const result = await getAgentHealth(config, 'nonexistent')
    expect(result.exists).toBe(false)
    expect(result.processRunning).toBe(false)
  })
})

describe('runAgentHygieneCheck', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns hygiene metrics', async () => {
    mockRunCommand
      .mockResolvedValueOnce({ stdout: '5\n', stderr: '', code: 0 })
      .mockResolvedValueOnce({ stdout: '3\n', stderr: '', code: 0 })
      .mockResolvedValueOnce({ stdout: '1.2G\n', stderr: '', code: 0 })

    const result = await runAgentHygieneCheck(config, 'hal')
    expect(result.errorCount).toBe(5)
    expect(result.staleFileCount).toBe(3)
    expect(result.dirSize).toBe('1.2G')
  })
})

describe('backupAgent', () => {
  beforeEach(() => vi.clearAllMocks())

  it('runs tar and cleanup commands', async () => {
    mockRunCommand.mockResolvedValue({ stdout: '', stderr: '', code: 0 })

    await backupAgent(config, 'hal', '/tmp/hal-backup.tar.gz')
    expect(mockRunCommand).toHaveBeenCalledWith(config, expect.stringContaining('tar'))
    expect(mockRunCommand).toHaveBeenCalledWith(config, expect.stringContaining('rm'))
  })
})
```

**Step 2: Run tests to verify they fail**

```bash
npm run test:run -- lib/__tests__/openclaw-agent-ops.test.ts
```

Expected: FAIL — functions not exported from `../openclaw`

**Step 3: Add functions to `lib/openclaw.ts`**

Append to the end of `lib/openclaw.ts`:

```typescript
export interface AgentHealthResult {
  exists: boolean
  dirSize: string
  lastActivity: string
  processRunning: boolean
}

export interface AgentHygieneResult {
  errorCount: number
  staleFileCount: number
  dirSize: string
}

/**
 * Checks the health of a specific agent by examining its directory,
 * size, last activity, and whether a process is running for it.
 */
export async function getAgentHealth(
  config: SshConfig,
  agentId: string
): Promise<AgentHealthResult> {
  const agentDir = `~/.openclaw/agents/${agentId}`
  const safeDir = agentDir.replace(/^~/, '$HOME')

  const [existsResult, sizeResult, activityResult, processResult] = await Promise.all([
    runCommand(config, `test -d ${safeDir} && echo "exists" || echo "missing"`),
    runCommand(config, `du -sh ${safeDir} 2>/dev/null | cut -f1 || echo "0"`),
    runCommand(config, `find ${safeDir} -type f -printf '%T@\\n' 2>/dev/null | sort -n | tail -1 || echo "0"`),
    runCommand(config, `pgrep -f "${agentId}" > /dev/null 2>&1 && echo "running" || echo "stopped"`),
  ])

  const lastEpoch = parseFloat(activityResult.stdout.trim()) || 0
  const lastActivity = lastEpoch > 0
    ? new Date(lastEpoch * 1000).toISOString()
    : 'never'

  return {
    exists: existsResult.stdout.trim() === 'exists',
    dirSize: sizeResult.stdout.trim(),
    lastActivity,
    processRunning: processResult.stdout.trim() === 'running',
  }
}

/**
 * Runs hygiene checks on a specific agent: error counts in logs,
 * stale files, and directory size.
 */
export async function runAgentHygieneCheck(
  config: SshConfig,
  agentId: string
): Promise<AgentHygieneResult> {
  const agentDir = `~/.openclaw/agents/${agentId}`
  const safeDir = agentDir.replace(/^~/, '$HOME')

  const [errorResult, staleResult, sizeResult] = await Promise.all([
    runCommand(config, `grep -rci 'error\\|exception' ${safeDir}/*.log 2>/dev/null | awk -F: '{s+=$2} END {print s+0}'`),
    runCommand(config, `find ${safeDir} -type f -mtime +30 2>/dev/null | wc -l`),
    runCommand(config, `du -sh ${safeDir} 2>/dev/null | cut -f1 || echo "0"`),
  ])

  return {
    errorCount: parseInt(errorResult.stdout.trim(), 10) || 0,
    staleFileCount: parseInt(staleResult.stdout.trim(), 10) || 0,
    dirSize: sizeResult.stdout.trim(),
  }
}

/**
 * Backs up a specific agent's directory (not the whole ~/.openclaw/).
 */
export async function backupAgent(
  config: SshConfig,
  agentId: string,
  localTarPath: string
): Promise<void> {
  const tmpPath = `/tmp/reef-agent-backup-${agentId}.tar.gz`
  await runCommand(
    config,
    `tar -czf ${tmpPath} -C $HOME/.openclaw/agents ${agentId}`
  )
  const { sftpPull } = await import('./ssh')
  await sftpPull(config, tmpPath, localTarPath)
  await runCommand(config, `rm ${tmpPath}`)
}
```

**Step 4: Run tests to verify they pass**

```bash
npm run test:run -- lib/__tests__/openclaw-agent-ops.test.ts
```

Expected: PASS — 4 tests pass.

**Step 5: Create API routes**

Create `app/api/instances/[id]/agents/[agentId]/health/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { resolveInstance } from '@/lib/instances'
import { getAgentHealth } from '@/lib/openclaw'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; agentId: string }> }
) {
  const { id, agentId } = await params
  try {
    const instance = await resolveInstance(id)
    if (!instance) return NextResponse.json({ error: 'Instance not found' }, { status: 404 })
    const health = await getAgentHealth({ host: instance.ip, privateKey: instance.sshKey }, agentId)
    return NextResponse.json(health)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
```

Create `app/api/instances/[id]/agents/[agentId]/hygiene/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { resolveInstance } from '@/lib/instances'
import { runAgentHygieneCheck } from '@/lib/openclaw'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; agentId: string }> }
) {
  const { id, agentId } = await params
  try {
    const instance = await resolveInstance(id)
    if (!instance) return NextResponse.json({ error: 'Instance not found' }, { status: 404 })
    const result = await runAgentHygieneCheck({ host: instance.ip, privateKey: instance.sshKey }, agentId)
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
```

Create `app/api/instances/[id]/agents/[agentId]/backup/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { resolveInstance } from '@/lib/instances'
import { backupAgent } from '@/lib/openclaw'
import { mkdir } from 'fs/promises'
import path from 'path'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; agentId: string }> }
) {
  const { id, agentId } = await params
  try {
    const instance = await resolveInstance(id)
    if (!instance) return NextResponse.json({ error: 'Instance not found' }, { status: 404 })

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupDir = path.join(process.cwd(), 'backups', id, agentId)
    await mkdir(backupDir, { recursive: true })
    const localPath = path.join(backupDir, `${timestamp}.tar.gz`)

    await backupAgent(
      { host: instance.ip, privateKey: instance.sshKey },
      agentId,
      localPath
    )
    return NextResponse.json({ path: localPath, timestamp })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
```

**Step 6: Run all tests**

```bash
npm run test:run
```

Expected: All tests pass.

**Step 7: Commit**

```bash
git add lib/openclaw.ts lib/__tests__/openclaw-agent-ops.test.ts app/api/instances/\[id\]/agents/\[agentId\]/health/ app/api/instances/\[id\]/agents/\[agentId\]/hygiene/ app/api/instances/\[id\]/agents/\[agentId\]/backup/
git commit -m "feat: agent-level health, hygiene, and backup API routes"
```

---

## Task 7: File viewer/editor

**Files:**
- Create: `app/components/FileViewer.tsx`
- Create: `app/api/instances/[id]/browse/read/route.ts`
- Create: `app/api/instances/[id]/browse/write/route.ts`
- Modify: `lib/openclaw.ts` (add readFile, writeFile)
- Modify: `app/page.tsx` (wire up file view mode)

**Step 1: Add readFile and writeFile to `lib/openclaw.ts`**

Append to `lib/openclaw.ts`:

```typescript
/**
 * Reads the contents of a remote file via SSH cat.
 * Path must be within ~/.openclaw/.
 */
export async function readRemoteFile(
  config: SshConfig,
  remotePath: string
): Promise<string> {
  const safePath = remotePath.replace(/^~/, '$HOME')
  const result = await runCommand(config, `cat "${safePath}"`)
  if (result.code !== 0) {
    throw new Error(`Failed to read ${remotePath}: ${result.stderr}`)
  }
  return result.stdout
}

/**
 * Writes content to a remote file via SSH.
 * Path must be within ~/.openclaw/.
 */
export async function writeRemoteFile(
  config: SshConfig,
  remotePath: string,
  content: string
): Promise<void> {
  const safePath = remotePath.replace(/^~/, '$HOME')
  // Use heredoc to avoid escaping issues
  const escaped = content.replace(/\\/g, '\\\\').replace(/'/g, "'\\''")
  const result = await runCommand(
    config,
    `cat > "${safePath}" << 'REEF_EOF'\n${content}\nREEF_EOF`
  )
  if (result.code !== 0) {
    throw new Error(`Failed to write ${remotePath}: ${result.stderr}`)
  }
}
```

**Step 2: Create read API route**

Create `app/api/instances/[id]/browse/read/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { resolveInstance } from '@/lib/instances'
import { readRemoteFile } from '@/lib/openclaw'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { searchParams } = new URL(req.url)
  const remotePath = searchParams.get('path')

  if (!remotePath) {
    return NextResponse.json({ error: 'path query param required' }, { status: 400 })
  }

  if (!remotePath.startsWith('~/.openclaw/') && remotePath !== '~/.openclaw') {
    return NextResponse.json({ error: 'path must be within ~/.openclaw/' }, { status: 400 })
  }

  try {
    const instance = await resolveInstance(id)
    if (!instance) return NextResponse.json({ error: 'Instance not found' }, { status: 404 })
    const content = await readRemoteFile({ host: instance.ip, privateKey: instance.sshKey }, remotePath)
    return NextResponse.json({ content })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
```

**Step 3: Create write API route**

Create `app/api/instances/[id]/browse/write/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { resolveInstance } from '@/lib/instances'
import { writeRemoteFile } from '@/lib/openclaw'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const { path: remotePath, content } = await req.json()

    if (!remotePath || typeof remotePath !== 'string') {
      return NextResponse.json({ error: 'path is required' }, { status: 400 })
    }
    if (typeof content !== 'string') {
      return NextResponse.json({ error: 'content is required' }, { status: 400 })
    }
    if (!remotePath.startsWith('~/.openclaw/')) {
      return NextResponse.json({ error: 'path must be within ~/.openclaw/' }, { status: 400 })
    }
    if (remotePath.includes('..')) {
      return NextResponse.json({ error: 'path must not contain ..' }, { status: 400 })
    }

    const instance = await resolveInstance(id)
    if (!instance) return NextResponse.json({ error: 'Instance not found' }, { status: 404 })
    await writeRemoteFile({ host: instance.ip, privateKey: instance.sshKey }, remotePath, content)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
```

**Step 4: Create `app/components/FileViewer.tsx`**

```tsx
'use client'

import { useState, useEffect } from 'react'
import Markdown from 'react-markdown'
import { useDashboard } from './context/DashboardContext'

type Mode = 'rendered' | 'raw' | 'edit'

export function FileViewer() {
  const { activeInstanceId, activeFile, setViewMode } = useDashboard()
  const [content, setContent] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [mode, setMode] = useState<Mode>('rendered')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isMarkdown = activeFile?.name.endsWith('.md') ?? false

  useEffect(() => {
    if (!activeInstanceId || !activeFile) return
    setLoading(true)
    setError(null)
    setMode(isMarkdown ? 'rendered' : 'raw')
    fetch(`/api/instances/${activeInstanceId}/browse/read?path=${encodeURIComponent(activeFile.path)}`)
      .then(res => res.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        setContent(data.content)
        setEditContent(data.content)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [activeInstanceId, activeFile, isMarkdown])

  if (!activeFile) return null

  async function save() {
    if (!activeInstanceId || !activeFile) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/instances/${activeInstanceId}/browse/write`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: activeFile.path, content: editContent }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setContent(editContent)
      setMode(isMarkdown ? 'rendered' : 'raw')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  function cancelEdit() {
    setEditContent(content ?? '')
    setMode(isMarkdown ? 'rendered' : 'raw')
  }

  const pathParts = activeFile.path.split('/')
  const breadcrumb = pathParts.slice(-3).join(' / ')

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-3 border-b border-gray-200 flex items-center justify-between">
        <div className="text-sm text-gray-600 font-mono truncate">{breadcrumb}</div>
        <div className="flex items-center gap-2">
          {mode === 'edit' ? (
            <>
              <button
                onClick={save}
                disabled={saving}
                className="text-xs px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 font-medium"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={cancelEdit}
                className="text-xs px-3 py-1.5 rounded bg-gray-100 text-gray-700 hover:bg-gray-200 font-medium"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              {isMarkdown && (
                <button
                  onClick={() => setMode(mode === 'rendered' ? 'raw' : 'rendered')}
                  className="text-xs px-3 py-1.5 rounded bg-gray-100 text-gray-700 hover:bg-gray-200 font-medium"
                >
                  {mode === 'rendered' ? 'Raw' : 'Rendered'}
                </button>
              )}
              <button
                onClick={() => { setEditContent(content ?? ''); setMode('edit') }}
                className="text-xs px-3 py-1.5 rounded bg-gray-100 text-gray-700 hover:bg-gray-200 font-medium"
              >
                Edit
              </button>
            </>
          )}
          <button
            onClick={() => setViewMode('detail')}
            className="text-xs px-3 py-1.5 rounded bg-gray-100 text-gray-700 hover:bg-gray-200 font-medium"
          >
            Back
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading && <p className="text-sm text-gray-400">Loading...</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!loading && !error && content !== null && (
          <>
            {mode === 'rendered' && (
              <div className="prose prose-sm max-w-none">
                <Markdown>{content}</Markdown>
              </div>
            )}
            {mode === 'raw' && (
              <pre className="text-sm font-mono text-gray-800 whitespace-pre-wrap">{content}</pre>
            )}
            {mode === 'edit' && (
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full h-full min-h-[400px] font-mono text-sm border border-gray-200 rounded-lg p-4 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}
```

**Step 5: Wire FileViewer into `app/page.tsx`**

In `app/page.tsx`, import FileViewer and replace the placeholder:

```tsx
import { FileViewer } from './components/FileViewer'
```

Replace the file placeholder line:

```tsx
        {viewMode === 'file' && <FileViewer />}
```

**Step 6: Verify in browser**

Start the dev server. Navigate to an agent, expand its directory tree, click a `.md` file. Verify: rendered markdown shows, Raw toggle works, Edit opens textarea, Save/Cancel work.

**Step 7: Commit**

```bash
git add app/components/FileViewer.tsx app/api/instances/\[id\]/browse/read/ app/api/instances/\[id\]/browse/write/ lib/openclaw.ts app/page.tsx
git commit -m "feat: file viewer with markdown rendering, raw toggle, and edit/save"
```

---

## Task 8: Streaming chat

**Files:**
- Create: `app/components/ChatPanel.tsx`
- Modify: `app/api/instances/[id]/agents/[agentId]/chat/route.ts` (SSE streaming)
- Modify: `lib/ssh.ts` (add streaming exec)
- Modify: `lib/openclaw.ts` (add streaming chat)
- Modify: `app/page.tsx` (wire up chat view mode)

**Step 1: Add `execStream` to `lib/ssh.ts`**

Append to `lib/ssh.ts`:

```typescript
import { Readable } from 'stream'

/**
 * Opens an SSH connection and runs a command, returning a readable stream
 * of stdout data. The connection closes when the command finishes.
 * Used for streaming chat responses.
 */
export function execStream(
  config: SshConfig,
  command: string
): { stream: Readable; done: Promise<number> } {
  const output = new Readable({ read() {} })
  const conn = new Client()

  const done = new Promise<number>((resolve, reject) => {
    conn
      .on('ready', () => {
        conn.exec(command, (err, sshStream) => {
          if (err) {
            conn.end()
            output.destroy(err)
            return reject(err)
          }

          sshStream
            .on('data', (data: Buffer) => {
              output.push(data)
            })
            .on('close', (code: number) => {
              output.push(null) // signal end
              conn.end()
              resolve(code)
            })
            .stderr.on('data', (data: Buffer) => {
              output.push(data) // include stderr in stream
            })
        })
      })
      .on('error', (err) => {
        output.destroy(err)
        reject(err)
      })
      .connect({
        host: config.host,
        port: config.port ?? 22,
        username: config.username ?? 'root',
        privateKey: config.privateKey,
      })
  })

  return { stream: output, done }
}
```

**Step 2: Add streaming chat to `lib/openclaw.ts`**

Append to `lib/openclaw.ts`:

```typescript
import { Readable } from 'stream'
import { execStream } from './ssh'

/**
 * Sends a message to an OpenClaw agent and returns a readable stream
 * of the response. Used for SSE streaming to the browser.
 */
export function streamChatMessage(
  config: SshConfig,
  agentId: string,
  message: string
): { stream: Readable; done: Promise<number> } {
  const escaped = message.replace(/\\/g, '\\\\').replace(/'/g, "'\\''")
  return execStream(
    config,
    `openclaw agent --agent '${agentId}' -m '${escaped}' 2>&1`
  )
}
```

**Step 3: Modify chat route for SSE streaming**

Replace `app/api/instances/[id]/agents/[agentId]/chat/route.ts`:

```typescript
import { resolveInstance } from '@/lib/instances'
import { streamChatMessage } from '@/lib/openclaw'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; agentId: string }> }
) {
  const { id, agentId } = await params
  try {
    const { message } = await req.json()
    if (!message || typeof message !== 'string') {
      return new Response(JSON.stringify({ error: 'message is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const instance = await resolveInstance(id)
    if (!instance) {
      return new Response(JSON.stringify({ error: 'Instance not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const { stream, done } = streamChatMessage(
      { host: instance.ip, privateKey: instance.sshKey },
      agentId,
      message
    )

    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        stream.on('data', (chunk: Buffer) => {
          const text = chunk.toString()
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ chunk: text })}\n\n`))
        })

        stream.on('end', () => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`))
          controller.close()
        })

        stream.on('error', (err) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: err.message })}\n\n`))
          controller.close()
        })

        // Ensure we clean up if the client disconnects
        done.catch(() => {})
      },
    })

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
```

**Step 4: Create `app/components/ChatPanel.tsx`**

```tsx
'use client'

import { useState, useRef, useEffect } from 'react'
import { useDashboard } from './context/DashboardContext'

interface Message {
  role: 'user' | 'agent'
  content: string
  timestamp: string
}

export function ChatPanel() {
  const { instances, activeInstanceId, activeAgentId, setViewMode } = useDashboard()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const instance = instances.find(i => i.id === activeInstanceId)
  const agent = instance?.agents.find(a => a.id === activeAgentId)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send() {
    if (!input.trim() || sending || !activeInstanceId || !activeAgentId) return

    const userMsg: Message = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toLocaleTimeString(),
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setSending(true)

    // Add a placeholder agent message that we'll stream into
    const agentMsg: Message = {
      role: 'agent',
      content: '',
      timestamp: new Date().toLocaleTimeString(),
    }
    setMessages(prev => [...prev, agentMsg])

    try {
      const res = await fetch(`/api/instances/${activeInstanceId}/agents/${activeAgentId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg.content }),
      })

      if (!res.ok) {
        const data = await res.json()
        setMessages(prev => {
          const updated = [...prev]
          updated[updated.length - 1] = { ...agentMsg, content: `Error: ${data.error}` }
          return updated
        })
        return
      }

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) throw new Error('No response body')

      let accumulated = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const text = decoder.decode(value, { stream: true })
        const lines = text.split('\n')

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const data = JSON.parse(line.slice(6))
            if (data.chunk) {
              accumulated += data.chunk
              setMessages(prev => {
                const updated = [...prev]
                updated[updated.length - 1] = { ...agentMsg, content: accumulated }
                return updated
              })
            }
            if (data.error) {
              accumulated += `\nError: ${data.error}`
              setMessages(prev => {
                const updated = [...prev]
                updated[updated.length - 1] = { ...agentMsg, content: accumulated }
                return updated
              })
            }
          } catch {
            // skip malformed SSE lines
          }
        }
      }
    } catch (e) {
      setMessages(prev => {
        const updated = [...prev]
        updated[updated.length - 1] = {
          ...agentMsg,
          content: `Error: ${e instanceof Error ? e.message : 'Unknown error'}`,
        }
        return updated
      })
    } finally {
      setSending(false)
    }
  }

  const displayName = agent?.identityName || activeAgentId || 'agent'

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-3 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          {agent?.identityEmoji && <span>{agent.identityEmoji}</span>}
          <span className="font-medium text-gray-900">{displayName}</span>
          <span className="text-gray-400 font-mono">@ {instance?.label}</span>
        </div>
        <button
          onClick={() => setViewMode('detail')}
          className="text-xs px-3 py-1.5 rounded bg-gray-100 text-gray-700 hover:bg-gray-200 font-medium"
        >
          Back
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-sm text-gray-400 text-center pt-8">
            Chat with {displayName}
          </p>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-lg rounded-lg px-4 py-2 text-sm ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-900'
              }`}
            >
              <pre className="whitespace-pre-wrap font-sans">{msg.content}</pre>
              {msg.content && (
                <p className={`text-xs mt-1 ${msg.role === 'user' ? 'text-blue-200' : 'text-gray-400'}`}>
                  {msg.timestamp}
                </p>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 px-6 py-4">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
            }}
            placeholder={`Message ${displayName}... (Enter to send)`}
            rows={2}
            className="flex-1 resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={send}
            disabled={sending || !input.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {sending ? '...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

**Step 5: Wire ChatPanel into `app/page.tsx`**

Import and replace the chat placeholder:

```tsx
import { ChatPanel } from './components/ChatPanel'
```

```tsx
        {viewMode === 'chat' && <ChatPanel />}
```

**Step 6: Run all tests**

```bash
npm run test:run
```

**Step 7: Verify in browser**

Start dev server. Select an agent, click Chat. Send a message. Verify response streams in token by token.

**Step 8: Commit**

```bash
git add lib/ssh.ts lib/openclaw.ts app/components/ChatPanel.tsx app/api/instances/\[id\]/agents/\[agentId\]/chat/ app/page.tsx
git commit -m "feat: streaming chat via SSE with token-by-token display"
```

---

## Task 9: Research agent migration patterns

Before implementing migration, research how other tools handle moving agent/bot configurations between machines.

**Step 1: Web research**

Search for:
- "openclaw agent export import CLI"
- "move AI agent between servers"
- "tar rsync migrate agent directory linux"
- "ansible playbook copy agent config between hosts"

Document findings in a comment at the top of the migration implementation.

**Step 2: Decide approach based on findings**

If OpenClaw has CLI export/import: use it.
If not: implement the tar+SFTP+untar fallback described in the design.

---

## Task 10: Agent migration

**Files:**
- Create: `app/components/MigrateDialog.tsx`
- Modify: `lib/openclaw.ts` (add migrateAgent)
- Create: `app/api/instances/[id]/agents/[agentId]/migrate/route.ts`
- Modify: `app/components/AgentDetail.tsx` (wire migrate button)

**Step 1: Add `migrateAgent` to `lib/openclaw.ts`**

Append to `lib/openclaw.ts`:

```typescript
/**
 * Migrates an agent from one machine to another.
 *
 * Strategy:
 * 1. Try `openclaw agent export <agentId>` on source (if CLI supports it)
 * 2. Fallback: tar the agent directory, SFTP via reef server, untar on destination
 *
 * TODO: Update with findings from Task 9 web research
 */
export async function migrateAgent(
  sourceConfig: SshConfig,
  destConfig: SshConfig,
  agentId: string,
  deleteSource: boolean
): Promise<{ success: boolean; method: string; error?: string }> {
  const agentDir = agentId
  const tmpPath = `/tmp/reef-migrate-${agentId}.tar.gz`
  const localTmpPath = `/tmp/reef-migrate-${agentId}-${Date.now()}.tar.gz`

  try {
    // Pack on source
    await runCommand(
      sourceConfig,
      `tar -czf ${tmpPath} -C $HOME/.openclaw/agents ${agentDir}`
    )

    // Pull to reef server
    const { sftpPull: pull } = await import('./ssh')
    await pull(sourceConfig, tmpPath, localTmpPath)

    // Push to destination
    // We need to use a fresh SSH connection to push
    const pushResult = await runCommand(
      destConfig,
      `mkdir -p ~/.openclaw/agents`
    )
    if (pushResult.code !== 0) {
      throw new Error('Failed to create agents directory on destination')
    }

    // SFTP push the tar to destination
    const { sftpPush } = await import('./ssh')
    await sftpPush(destConfig, localTmpPath, tmpPath)

    // Untar on destination
    await runCommand(
      destConfig,
      `tar -xzf ${tmpPath} -C $HOME/.openclaw/agents && rm ${tmpPath}`
    )

    // Clean up local tmp
    const fs = await import('fs/promises')
    await fs.unlink(localTmpPath).catch(() => {})

    // Clean up source tmp
    await runCommand(sourceConfig, `rm ${tmpPath}`)

    // Optionally delete from source
    if (deleteSource) {
      await runCommand(
        sourceConfig,
        `rm -rf $HOME/.openclaw/agents/${agentDir}`
      )
    }

    return { success: true, method: 'tar-sftp' }
  } catch (err) {
    return {
      success: false,
      method: 'tar-sftp',
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}
```

**Step 2: Add `sftpPush` to `lib/ssh.ts`**

Append to `lib/ssh.ts`:

```typescript
/**
 * SFTP-pushes a local file to a remote machine.
 */
export async function sftpPush(
  config: SshConfig,
  localPath: string,
  remotePath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const conn = new Client()

    conn
      .on('ready', () => {
        conn.sftp((err, sftp) => {
          if (err) {
            conn.end()
            return reject(err)
          }
          sftp.fastPut(localPath, remotePath, (err) => {
            conn.end()
            if (err) reject(err)
            else resolve()
          })
        })
      })
      .on('error', reject)
      .connect({
        host: config.host,
        port: config.port ?? 22,
        username: config.username ?? 'root',
        privateKey: config.privateKey,
      })
  })
}
```

**Step 3: Create migrate API route**

Create `app/api/instances/[id]/agents/[agentId]/migrate/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { resolveInstance } from '@/lib/instances'
import { migrateAgent } from '@/lib/openclaw'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; agentId: string }> }
) {
  const { id, agentId } = await params
  try {
    const { destinationId, deleteSource } = await req.json()
    if (!destinationId) {
      return NextResponse.json({ error: 'destinationId is required' }, { status: 400 })
    }

    const source = await resolveInstance(id)
    if (!source) return NextResponse.json({ error: 'Source instance not found' }, { status: 404 })

    const dest = await resolveInstance(destinationId)
    if (!dest) return NextResponse.json({ error: 'Destination instance not found' }, { status: 404 })

    const result = await migrateAgent(
      { host: source.ip, privateKey: source.sshKey },
      { host: dest.ip, privateKey: dest.sshKey },
      agentId,
      deleteSource ?? false
    )

    if (!result.success) {
      return NextResponse.json({ error: result.error, method: result.method }, { status: 500 })
    }
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
```

**Step 4: Create `app/components/MigrateDialog.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { useDashboard } from './context/DashboardContext'

interface Props {
  instanceId: string
  agentId: string
  onClose: () => void
}

export function MigrateDialog({ instanceId, agentId, onClose }: Props) {
  const { instances } = useDashboard()
  const [destinationId, setDestinationId] = useState('')
  const [deleteSource, setDeleteSource] = useState(false)
  const [migrating, setMigrating] = useState(false)
  const [result, setResult] = useState<{ success: boolean; error?: string } | null>(null)

  const otherInstances = instances.filter(i => i.id !== instanceId)

  async function migrate() {
    if (!destinationId) return
    setMigrating(true)
    setResult(null)
    try {
      const res = await fetch(`/api/instances/${instanceId}/agents/${agentId}/migrate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destinationId, deleteSource }),
      })
      const data = await res.json()
      setResult({ success: res.ok, error: data.error })
    } catch (e) {
      setResult({ success: false, error: e instanceof Error ? e.message : 'Unknown error' })
    } finally {
      setMigrating(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Migrate {agentId}</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">From</label>
            <div className="text-sm font-mono text-gray-800 bg-gray-50 rounded px-3 py-2">
              {instanceId}
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">To</label>
            <select
              value={destinationId}
              onChange={(e) => setDestinationId(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select destination...</option>
              {otherInstances.map(inst => (
                <option key={inst.id} value={inst.id}>
                  {inst.label} ({inst.ip})
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={deleteSource}
              onChange={(e) => setDeleteSource(e.target.checked)}
              className="rounded border-gray-300"
            />
            Delete from source after successful migration
          </label>

          {result && (
            <div className={`text-sm rounded px-3 py-2 ${result.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {result.success ? 'Migration successful!' : `Failed: ${result.error}`}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="text-sm px-4 py-2 rounded bg-gray-100 text-gray-700 hover:bg-gray-200 font-medium"
          >
            {result?.success ? 'Done' : 'Cancel'}
          </button>
          {!result?.success && (
            <button
              onClick={migrate}
              disabled={!destinationId || migrating}
              className="text-sm px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 font-medium"
            >
              {migrating ? 'Migrating...' : 'Migrate'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
```

**Step 5: Wire migrate button in `app/components/AgentDetail.tsx`**

Add state and import at the top of AgentDetail:

```tsx
import { MigrateDialog } from './MigrateDialog'
```

Add state inside the component:

```tsx
const [showMigrate, setShowMigrate] = useState(false)
```

Replace the migrate button placeholder:

```tsx
        <button
          onClick={() => setShowMigrate(true)}
          className="text-xs px-3 py-1.5 rounded bg-gray-50 text-gray-700 hover:bg-gray-100 font-medium"
        >
          Migrate...
        </button>
```

Add the dialog at the bottom of the component's return, before the closing `</div>`:

```tsx
      {showMigrate && instance && agent && (
        <MigrateDialog
          instanceId={instance.id}
          agentId={agent.id}
          onClose={() => setShowMigrate(false)}
        />
      )}
```

**Step 6: Run all tests**

```bash
npm run test:run
```

**Step 7: Commit**

```bash
git add lib/openclaw.ts lib/ssh.ts app/components/MigrateDialog.tsx app/components/AgentDetail.tsx app/api/instances/\[id\]/agents/\[agentId\]/migrate/
git commit -m "feat: agent migration between machines with tar+SFTP"
```

---

## Task 11: Fleet actions panel

**Files:**
- Create: `app/components/FleetPanel.tsx`
- Modify: `app/page.tsx` (wire up fleet view mode, auto-switch when checks selected)

**Step 1: Create `app/components/FleetPanel.tsx`**

```tsx
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
  const { instances, checkedAgents, setViewMode } = useDashboard()
  const [results, setResults] = useState<ActionResult[]>([])
  const [running, setRunning] = useState(false)

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
        </div>
      </div>

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
```

**Step 2: Wire FleetPanel into `app/page.tsx`**

Import and replace the fleet placeholder:

```tsx
import { FleetPanel } from './components/FleetPanel'
```

```tsx
        {viewMode === 'fleet' && <FleetPanel />}
```

Also add logic to auto-switch to fleet mode when 2+ agents are checked. Add this effect inside DashboardPage:

```tsx
  useEffect(() => {
    if (checkedAgents.size >= 2) setViewMode('fleet')
  }, [checkedAgents.size, setViewMode])
```

And pull `setViewMode` from the context:

```tsx
  const { instances, setInstances, viewMode, setViewMode, checkedAgents } = useDashboard()
```

**Step 3: Run all tests**

```bash
npm run test:run
```

**Step 4: Verify in browser**

Expand two machines, check agents from both, verify fleet panel appears with action buttons. Run Health All, verify results stream in per-agent.

**Step 5: Commit**

```bash
git add app/components/FleetPanel.tsx app/page.tsx
git commit -m "feat: fleet actions panel with bulk health/hygiene/backup"
```

---

## Task 12: Clean up old components and chat page

**Files:**
- Delete: `app/instances/[id]/agents/[agentId]/chat/page.tsx` (replaced by ChatPanel in main panel)
- Delete: `app/components/MachineRow.tsx` (replaced by Sidebar)
- Delete: `app/components/AgentRow.tsx` (replaced by Sidebar + AgentDetail)
- Update: `app/layout.tsx` metadata

The old separate chat page route and the flat card components are no longer used.

**Step 1: Remove old files**

```bash
rm -rf "app/instances/[id]/agents/[agentId]/chat/page.tsx"
rm app/components/MachineRow.tsx
rm app/components/AgentRow.tsx
```

**Step 2: Verify the app still works**

```bash
npx tsc --noEmit
node node_modules/next/dist/bin/next dev
```

**Step 3: Run all tests**

```bash
npm run test:run
```

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove old flat card components and standalone chat page"
```

---

## Task 13: Final smoke test

**Step 1: Run all tests**

```bash
npm run test:run
```

Expected: All tests pass.

**Step 2: Full browser walkthrough**

With real credentials in `.env.local`:

1. Dashboard loads with sidebar showing machines
2. Expanding a machine loads agents with emoji/name/model
3. Clicking an agent shows detail panel with health/hygiene/backup/chat/migrate buttons
4. Health button returns agent-specific health data
5. Clicking a file in the directory tree opens the file viewer with rendered markdown
6. Raw toggle shows source, Edit opens textarea, Save writes back
7. Chat button opens streaming chat, responses appear token by token
8. Migrate opens dialog, can pick destination machine
9. Checking 2+ agents auto-switches to fleet panel
10. Fleet Health All runs checks in parallel with per-agent progress
