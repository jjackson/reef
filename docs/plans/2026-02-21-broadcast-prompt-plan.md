# Broadcast Prompt Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a broadcast prompt feature that sends a message to all checked agents in parallel, creating a tabbed chat interface for independent follow-up conversations.

**Architecture:** Extract a shared `ChatWindow` component from the existing `ChatPanel`, then build a `BroadcastPanel` that mounts one `ChatWindow` per checked agent with an auto-sent initial message. Add a broadcast entry point to `FleetPanel` and a `'broadcast'` view mode. Make the sidebar tree collapsible.

**Tech Stack:** React 19, Next.js 15 App Router, Tailwind CSS 4, SSE streaming (existing chat API)

---

### Task 1: Extract ChatWindow from ChatPanel

**Files:**
- Create: `app/components/ChatWindow.tsx`
- Modify: `app/components/ChatPanel.tsx` (lines 1-219, full rewrite to thin wrapper)

**Step 1: Create ChatWindow component**

Extract the `Message` interface, `ThinkingIndicator`, and all chat logic from `ChatPanel.tsx` into a new `ChatWindow.tsx`. The component takes explicit props instead of reading from context.

```tsx
// app/components/ChatWindow.tsx
'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

interface Message {
  role: 'user' | 'agent'
  content: string
  timestamp: string
}

function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-1 py-1 px-1">
      <span className="thinking-dot w-1.5 h-1.5 rounded-full bg-slate-400" style={{ animationDelay: '0ms' }} />
      <span className="thinking-dot w-1.5 h-1.5 rounded-full bg-slate-400" style={{ animationDelay: '150ms' }} />
      <span className="thinking-dot w-1.5 h-1.5 rounded-full bg-slate-400" style={{ animationDelay: '300ms' }} />
    </div>
  )
}

interface ChatWindowProps {
  instanceId: string
  agentId: string
  agentName: string
  agentEmoji: string
  initialMessage?: string
}

export function ChatWindow({ instanceId, agentId, agentName, agentEmoji, initialMessage }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const initialSent = useRef(false)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || sending) return

    const userMsg: Message = {
      role: 'user',
      content: text.trim(),
      timestamp: new Date().toLocaleTimeString(),
    }
    setMessages(prev => [...prev, userMsg])
    setSending(true)

    const agentMsg: Message = {
      role: 'agent',
      content: '',
      timestamp: new Date().toLocaleTimeString(),
    }
    setMessages(prev => [...prev, agentMsg])

    try {
      const res = await fetch(`/api/instances/${instanceId}/agents/${agentId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text.trim() }),
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
  }, [instanceId, agentId, sending])

  // Auto-send initial message on mount
  useEffect(() => {
    if (initialMessage && !initialSent.current) {
      initialSent.current = true
      sendMessage(initialMessage)
    }
  }, [initialMessage, sendMessage])

  function handleSend() {
    if (!input.trim() || sending) return
    sendMessage(input.trim())
    setInput('')
  }

  const displayName = agentName || agentId

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {messages.length === 0 && !initialMessage && (
          <div className="text-center pt-12">
            <div className="text-3xl mb-2 opacity-30">{agentEmoji || '\u2709'}</div>
            <p className="text-sm text-slate-400">Chat with {displayName}</p>
            <p className="text-xs text-slate-300 mt-1">Messages are sent via SSH to the OpenClaw agent</p>
          </div>
        )}
        {messages.map((msg, i) => {
          const isUser = msg.role === 'user'
          const isThinking = !isUser && msg.content === '' && sending

          return (
            <div key={i} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
              {!isUser && agentEmoji && (
                <div className="w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center text-xs mr-2 mt-0.5 shrink-0">
                  {agentEmoji}
                </div>
              )}
              <div
                className={`max-w-lg rounded-xl px-4 py-2.5 text-sm ${
                  isUser
                    ? 'bg-slate-800 text-white'
                    : 'bg-white border border-slate-200 text-slate-800 shadow-sm'
                }`}
              >
                {isThinking ? (
                  <ThinkingIndicator />
                ) : (
                  <>
                    <pre className="whitespace-pre-wrap font-sans leading-relaxed">{msg.content}</pre>
                    {msg.content && (
                      <p className={`text-[11px] mt-1.5 ${isUser ? 'text-slate-400' : 'text-slate-300'}`}>
                        {msg.timestamp}
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-slate-200 bg-white px-6 py-4 shrink-0">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
            }}
            placeholder={`Message ${displayName}... (Enter to send)`}
            rows={2}
            className="flex-1 resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent bg-slate-50 placeholder:text-slate-400"
          />
          <button
            onClick={handleSend}
            disabled={sending || !input.trim()}
            className="px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-700 disabled:opacity-40 transition-colors"
          >
            {sending ? <span className="spinner-sm" /> : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

**Step 2: Rewrite ChatPanel as thin wrapper**

```tsx
// app/components/ChatPanel.tsx
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
    <div className="flex flex-col h-full bg-slate-50/50">
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

      {/* Chat body */}
      <ChatWindow
        instanceId={activeInstanceId}
        agentId={activeAgentId}
        agentName={agent?.identityName || ''}
        agentEmoji={agent?.identityEmoji || ''}
      />
    </div>
  )
}
```

**Step 3: Verify existing chat still works**

Run: `node node_modules/next/dist/bin/next build` (or verify in dev server — navigate to an agent, click Chat, send a message)
Expected: Chat works exactly as before.

**Step 4: Commit**

```bash
git add app/components/ChatWindow.tsx app/components/ChatPanel.tsx
git commit -m "refactor: extract ChatWindow from ChatPanel for reuse"
```

---

### Task 2: Add 'broadcast' view mode to DashboardContext

**Files:**
- Modify: `app/components/context/DashboardContext.tsx:22` (ViewMode type)
- Modify: `app/components/context/DashboardContext.tsx:34-65` (DashboardState — add broadcastMessage)
- Modify: `app/components/context/DashboardContext.tsx:75-158` (provider — add state + setter)

**Step 1: Update ViewMode type and add broadcast state**

In `DashboardContext.tsx`, line 22, change:
```tsx
export type ViewMode = 'detail' | 'chat' | 'file' | 'fleet'
```
to:
```tsx
export type ViewMode = 'detail' | 'chat' | 'file' | 'fleet' | 'broadcast'
```

Add to the `DashboardState` interface (after line 48, the `setViewMode` line):
```tsx
  // Broadcast
  broadcastMessage: string | null
  broadcastAgents: Array<{ instanceId: string; agentId: string; agentName: string; agentEmoji: string; instanceLabel: string }>
  startBroadcast: (message: string) => void
```

**Step 2: Add state and callback in provider**

In `DashboardProvider`, add state:
```tsx
const [broadcastMessage, setBroadcastMessage] = useState<string | null>(null)
const [broadcastAgents, setBroadcastAgents] = useState<Array<{ instanceId: string; agentId: string; agentName: string; agentEmoji: string; instanceLabel: string }>>([])
```

Add callback:
```tsx
const startBroadcast = useCallback((message: string) => {
  const agents = Array.from(checkedAgents).map(key => {
    const [instanceId, agentId] = key.split(':')
    const inst = instances.find(i => i.id === instanceId)
    const agent = inst?.agents.find(a => a.id === agentId)
    return {
      instanceId,
      agentId,
      agentName: agent?.identityName || agentId,
      agentEmoji: agent?.identityEmoji || '',
      instanceLabel: inst?.label || instanceId,
    }
  })
  setBroadcastAgents(agents)
  setBroadcastMessage(message)
  setViewMode('broadcast')
}, [checkedAgents, instances, setViewMode])
```

Add `broadcastMessage, broadcastAgents, startBroadcast` to the Provider `value` prop.

**Step 3: Commit**

```bash
git add app/components/context/DashboardContext.tsx
git commit -m "feat: add broadcast view mode and state to DashboardContext"
```

---

### Task 3: Add Broadcast button and prompt input to FleetPanel

**Files:**
- Modify: `app/components/FleetPanel.tsx:19-143`

**Step 1: Add broadcast UI to FleetPanel**

Add state for the broadcast prompt input:
```tsx
const [showBroadcastInput, setShowBroadcastInput] = useState(false)
const [broadcastInput, setBroadcastInput] = useState('')
```

Pull `startBroadcast` from context:
```tsx
const { instances, checkedAgents, setViewMode, startBroadcast } = useDashboard()
```

Add a "Broadcast" button in the toolbar `div` (line 90, after the Backup All button):
```tsx
<button
  onClick={() => setShowBroadcastInput(v => !v)}
  disabled={running || checkedList.length === 0}
  className="text-xs px-3 py-1.5 rounded bg-purple-50 text-purple-700 hover:bg-purple-100 disabled:opacity-50 font-medium"
>
  Broadcast
</button>
```

Add the broadcast prompt input area right after the toolbar `div` closes (after line 112), shown conditionally:
```tsx
{showBroadcastInput && (
  <div className="px-6 py-3 border-b border-gray-200 bg-purple-50/50">
    <div className="flex gap-2">
      <textarea
        value={broadcastInput}
        onChange={(e) => setBroadcastInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            if (broadcastInput.trim()) {
              startBroadcast(broadcastInput.trim())
              setBroadcastInput('')
              setShowBroadcastInput(false)
            }
          }
        }}
        placeholder="Enter a prompt to send to all selected agents..."
        rows={2}
        className="flex-1 resize-none rounded-lg border border-purple-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent bg-white placeholder:text-purple-300"
        autoFocus
      />
      <button
        onClick={() => {
          if (broadcastInput.trim()) {
            startBroadcast(broadcastInput.trim())
            setBroadcastInput('')
            setShowBroadcastInput(false)
          }
        }}
        disabled={!broadcastInput.trim()}
        className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-40 transition-colors"
      >
        Send
      </button>
    </div>
  </div>
)}
```

**Step 2: Commit**

```bash
git add app/components/FleetPanel.tsx
git commit -m "feat: add Broadcast button and prompt input to FleetPanel"
```

---

### Task 4: Create BroadcastPanel component

**Files:**
- Create: `app/components/BroadcastPanel.tsx`

**Step 1: Build the BroadcastPanel**

```tsx
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

      {/* Chat windows — all mounted, only active one visible */}
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
```

Key details:
- All `ChatWindow` instances mount simultaneously (parallel SSE streams)
- Only the active tab is visible (`z-10`), others are hidden (`opacity-0 pointer-events-none`) but still mounted and streaming
- Tab strip is a horizontal `flex` row with `overflow-x-auto` — data-driven from `broadcastAgents` array, trivial to later render vertically

**Step 2: Commit**

```bash
git add app/components/BroadcastPanel.tsx
git commit -m "feat: create BroadcastPanel with tabbed chat windows"
```

---

### Task 5: Wire BroadcastPanel into the page

**Files:**
- Modify: `app/page.tsx:1-34`

**Step 1: Add broadcast view to page**

Add import at the top:
```tsx
import { BroadcastPanel } from './components/BroadcastPanel'
```

In the `<main>` section (line 28-31), add the broadcast view:
```tsx
{viewMode === 'broadcast' && <BroadcastPanel />}
```

Also update the auto-fleet-switch `useEffect` (line 20-22) so it doesn't override broadcast mode:
```tsx
useEffect(() => {
  if (checkedAgents.size >= 2 && viewMode !== 'broadcast') setViewMode('fleet')
}, [checkedAgents.size, setViewMode, viewMode])
```

**Step 2: Commit**

```bash
git add app/page.tsx
git commit -m "feat: wire BroadcastPanel into page routing"
```

---

### Task 6: Make sidebar tree collapsible

**Files:**
- Modify: `app/components/Sidebar.tsx:108-143`

**Step 1: Add collapse state and toggle**

In the `Sidebar` component, add state:
```tsx
const [treeCollapsed, setTreeCollapsed] = useState(false)
```

Replace the "Select all" section and tree area with a collapsible wrapper. Change lines 119-136 to:

```tsx
<div className="px-2 py-1 border-b border-gray-100 flex items-center justify-between">
  <label className="flex items-center gap-2 text-xs text-gray-500 px-2 py-1 cursor-pointer">
    <input
      type="checkbox"
      checked={allChecked}
      onChange={toggleAll}
      className="h-3 w-3 rounded border-gray-300"
    />
    Select all
  </label>
  <button
    onClick={() => setTreeCollapsed(v => !v)}
    className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1"
    title={treeCollapsed ? 'Expand tree' : 'Collapse tree'}
  >
    {treeCollapsed ? '\u25B8' : '\u25BE'}
  </button>
</div>
{!treeCollapsed && (
  <div className="flex-1 overflow-y-auto p-2 space-y-1">
    {instances.map(inst => (
      <MachineItem key={inst.id} instance={inst} />
    ))}
    {instances.length === 0 && (
      <p className="text-xs text-gray-400 italic px-2 py-4">Loading...</p>
    )}
  </div>
)}
{treeCollapsed && (
  <div className="flex-1" />
)}
```

**Step 2: Commit**

```bash
git add app/components/Sidebar.tsx
git commit -m "feat: add collapsible tree toggle to sidebar"
```

---

### Task 7: End-to-end manual test

**Step 1: Verify the full flow in the dev server**

1. Open http://localhost:3000
2. Expand 2+ machines, check 2+ agents
3. FleetPanel appears — verify "Broadcast" button shows alongside existing buttons
4. Click "Broadcast" — verify prompt input appears
5. Type a message, press Enter
6. Verify: switches to BroadcastPanel with tabs for each checked agent
7. Verify: all agents start streaming responses in parallel
8. Switch between tabs — verify each conversation is independent and streams weren't interrupted
9. Type a follow-up in one tab — verify it only goes to that agent
10. Click "Back" — verify returns to FleetPanel
11. Click an agent name in sidebar — verify single-agent detail/chat still works as before
12. Collapse/expand sidebar tree — verify toggle works

**Step 2: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: any adjustments from manual testing"
```
