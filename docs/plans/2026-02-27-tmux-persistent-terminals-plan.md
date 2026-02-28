# Tmux Persistent Terminals Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make terminal sessions persistent across navigation by running commands in tmux on remote droplets, with auto-reattach when returning to an instance.

**Architecture:** The terminal WebSocket route creates/attaches to named tmux sessions (`reef-<timestamp>`) on the remote droplet instead of raw SSH shells. Two new REST endpoints list and kill reef-owned sessions. DashboardContext tracks active session names per instance so InstanceDetail can auto-restore terminals.

**Tech Stack:** ssh2 (existing), tmux (on remote droplets), Next.js WebSocket via next-ws (existing), xterm.js (existing)

---

### Task 1: Sessions list endpoint

**Files:**
- Create: `app/api/instances/[id]/terminal/sessions/route.ts`

**Step 1: Create the sessions endpoint**

```typescript
// app/api/instances/[id]/terminal/sessions/route.ts
import { NextResponse } from 'next/server'
import { resolveInstance } from '@/lib/instances'
import { runCommand } from '@/lib/ssh'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const instance = await resolveInstance(id)
    if (!instance) return NextResponse.json({ error: 'Instance not found' }, { status: 404 })

    const config = { host: instance.ip, privateKey: instance.sshKey }
    const result = await runCommand(config, "tmux list-sessions -F '#{session_name}' 2>/dev/null || true")

    const sessions = result.stdout
      .split('\n')
      .map(s => s.trim())
      .filter(s => s.startsWith('reef-'))
      .map(name => ({ name }))

    return NextResponse.json({ sessions })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
```

**Step 2: Verify manually**

Start the dev server, then:
```bash
curl http://localhost:3002/api/instances/openclaw-hal/terminal/sessions
```
Expected: `{ "sessions": [] }` (no reef sessions yet)

**Step 3: Commit**

```bash
git add app/api/instances/\[id\]/terminal/sessions/route.ts
git commit -m "feat: add terminal sessions list endpoint"
```

---

### Task 2: Kill sessions endpoint

**Files:**
- Create: `app/api/instances/[id]/terminal/kill-sessions/route.ts`

**Step 1: Create the kill-sessions endpoint**

```typescript
// app/api/instances/[id]/terminal/kill-sessions/route.ts
import { NextResponse } from 'next/server'
import { resolveInstance } from '@/lib/instances'
import { runCommand } from '@/lib/ssh'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const instance = await resolveInstance(id)
    if (!instance) return NextResponse.json({ error: 'Instance not found' }, { status: 404 })

    const config = { host: instance.ip, privateKey: instance.sshKey }

    // List reef-owned sessions, then kill each one
    const listResult = await runCommand(config, "tmux list-sessions -F '#{session_name}' 2>/dev/null || true")
    const reefSessions = listResult.stdout
      .split('\n')
      .map(s => s.trim())
      .filter(s => s.startsWith('reef-'))

    for (const session of reefSessions) {
      await runCommand(config, `tmux kill-session -t ${session}`)
    }

    return NextResponse.json({ success: true, killed: reefSessions.length })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
```

**Step 2: Commit**

```bash
git add app/api/instances/\[id\]/terminal/kill-sessions/route.ts
git commit -m "feat: add kill-sessions endpoint for tmux cleanup"
```

---

### Task 3: Modify terminal WebSocket route for tmux

**Files:**
- Modify: `app/api/instances/[id]/terminal/route.ts` (full rewrite)

**Step 1: Rewrite the terminal route to use tmux**

The route now reads query params:
- No `?session=` → create a new tmux session, optionally run `initialCommand`
- `?session=reef-xxx` → reattach to existing session
- `?command=<cmd>` → initial command for new sessions (URL-encoded)

Replace the entire file:

```typescript
// app/api/instances/[id]/terminal/route.ts
import { resolveInstance } from '@/lib/instances'
import { Client } from 'ssh2'

export function GET() {
  return new Response('WebSocket endpoint', { status: 426, headers: { Upgrade: 'websocket' } })
}

export function UPGRADE(
  client: import('ws').WebSocket,
  _server: import('ws').WebSocketServer,
  request: import('next/server').NextRequest
) {
  const url = new URL(request.url)
  const segments = url.pathname.split('/')
  const idIndex = segments.indexOf('instances') + 1
  const id = segments[idIndex]

  if (!id) {
    client.close(1008, 'Missing instance ID')
    return
  }

  const existingSession = url.searchParams.get('session')
  const initialCommand = url.searchParams.get('command')

  let sshConn: Client | null = null
  let sshStream: import('ssh2').ClientChannel | null = null

  resolveInstance(id).then(instance => {
    if (!instance) {
      client.send(JSON.stringify({ type: 'error', data: 'Instance not found' }))
      client.close(1008, 'Instance not found')
      return
    }

    sshConn = new Client()

    sshConn.on('ready', () => {
      // Determine cols/rows — will be updated by first resize message
      const cols = 80
      const rows = 24

      if (existingSession) {
        // Reattach to existing tmux session
        sshConn!.shell(
          { cols, rows, term: 'xterm-256color' },
          (err, stream) => {
            if (err) {
              client.send(JSON.stringify({ type: 'error', data: err.message }))
              client.close(1011, 'SSH shell error')
              return
            }
            sshStream = stream
            wireStream(client, stream, sshConn!)

            // Send tmux attach command
            stream.write(`tmux attach -t ${existingSession}\n`)
            client.send(JSON.stringify({ type: 'session', name: existingSession }))
          }
        )
      } else {
        // Create new tmux session
        const sessionName = `reef-${Date.now()}`

        sshConn!.shell(
          { cols, rows, term: 'xterm-256color' },
          (err, stream) => {
            if (err) {
              client.send(JSON.stringify({ type: 'error', data: err.message }))
              client.close(1011, 'SSH shell error')
              return
            }
            sshStream = stream
            wireStream(client, stream, sshConn!)

            // Create detached tmux session, then attach
            const createCmd = `tmux new-session -d -s ${sessionName} -x ${cols} -y ${rows}`
            if (initialCommand) {
              // Send command into the tmux session, then attach
              const escaped = initialCommand.replace(/'/g, "'\\''")
              stream.write(`${createCmd} && tmux send-keys -t ${sessionName} '${escaped}' Enter && tmux attach -t ${sessionName}\n`)
            } else {
              stream.write(`${createCmd} && tmux attach -t ${sessionName}\n`)
            }
            client.send(JSON.stringify({ type: 'session', name: sessionName }))
          }
        )
      }
    })

    sshConn.on('error', (err) => {
      client.send(JSON.stringify({ type: 'error', data: err.message }))
      if (client.readyState === client.OPEN) {
        client.close(1011, 'SSH connection error')
      }
    })

    sshConn.connect({
      host: instance.ip,
      port: 22,
      username: 'root',
      privateKey: instance.sshKey,
    })
  }).catch(err => {
    client.send(JSON.stringify({ type: 'error', data: err.message }))
    client.close(1011, 'Failed to resolve instance')
  })

  client.on('close', () => {
    // Only close the SSH connection — the tmux session stays alive on the remote
    if (sshStream) {
      sshStream.close()
      sshStream = null
    }
    if (sshConn) {
      sshConn.end()
      sshConn = null
    }
  })
}

function wireStream(
  client: import('ws').WebSocket,
  stream: import('ssh2').ClientChannel,
  conn: Client
) {
  // SSH stdout → WebSocket
  stream.on('data', (data: Buffer) => {
    if (client.readyState === client.OPEN) {
      client.send(JSON.stringify({ type: 'data', data: data.toString('utf-8') }))
    }
  })

  // SSH stream close → close WebSocket
  stream.on('close', () => {
    if (client.readyState === client.OPEN) {
      client.close(1000, 'SSH session ended')
    }
    conn.end()
  })

  // WebSocket messages → SSH stdin or resize
  client.on('message', (raw: Buffer | string) => {
    try {
      const msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString())
      if (msg.type === 'data' && typeof msg.data === 'string') {
        stream.write(msg.data)
      } else if (msg.type === 'resize' && msg.cols && msg.rows) {
        stream.setWindow(msg.rows, msg.cols, 0, 0)
      }
    } catch {
      // ignore malformed messages
    }
  })
}
```

**Step 2: Restart dev server and test manually**

Run `bash bin/dev.sh`, open the UI, click an instance, open a terminal. Verify:
- Terminal opens and you see a tmux session
- Running `tmux list-sessions` on the remote shows a `reef-*` session
- Commands work normally inside the terminal

**Step 3: Commit**

```bash
git add app/api/instances/\[id\]/terminal/route.ts
git commit -m "feat: terminal route creates/attaches tmux sessions"
```

---

### Task 4: Add terminal session tracking to DashboardContext

**Files:**
- Modify: `app/components/context/DashboardContext.tsx`

**Step 1: Add terminal session state to the context**

Add to the `DashboardState` interface (after the broadcast section, around line 90):

```typescript
  // Terminal sessions (tmux)
  terminalSessions: Map<string, string> // instanceId → tmux session name
  setTerminalSession: (instanceId: string, sessionName: string) => void
  clearTerminalSession: (instanceId: string) => void
```

Add state in `DashboardProvider` (after `dirCache`, around line 110):

```typescript
  const [terminalSessions, setTerminalSessions] = useState<Map<string, string>>(new Map())
```

Add the mutation callbacks (after `getDirCache`):

```typescript
  const setTerminalSession = useCallback((instanceId: string, sessionName: string) => {
    setTerminalSessions(prev => {
      const next = new Map(prev)
      next.set(instanceId, sessionName)
      return next
    })
  }, [])

  const clearTerminalSession = useCallback((instanceId: string) => {
    setTerminalSessions(prev => {
      const next = new Map(prev)
      next.delete(instanceId)
      return next
    })
  }, [])
```

Add to the Provider value object:

```typescript
      terminalSessions, setTerminalSession, clearTerminalSession,
```

**Step 2: Verify types compile**

```bash
npx tsc --noEmit 2>&1 | grep -i "DashboardContext\|Terminal\|InstanceDetail"
```
Expected: No errors from these files (pre-existing errors from other files are fine).

**Step 3: Commit**

```bash
git add app/components/context/DashboardContext.tsx
git commit -m "feat: add terminal session tracking to DashboardContext"
```

---

### Task 5: Update Terminal component for tmux support

**Files:**
- Modify: `app/components/Terminal.tsx`

**Step 1: Update TerminalPanel props and WebSocket connection**

Replace the entire file:

```typescript
// app/components/Terminal.tsx
'use client'

import { useEffect, useRef, useState } from 'react'

interface TerminalProps {
  instanceId: string
  onClose: () => void
  onSessionCreated?: (sessionName: string) => void
  sessionName?: string
  initialCommand?: string
}

export function TerminalPanel({ instanceId, onClose, onSessionCreated, sessionName, initialCommand }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const xtermRef = useRef<any>(null)
  const fitRef = useRef<any>(null)
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  const [currentSession, setCurrentSession] = useState<string | null>(sessionName || null)

  useEffect(() => {
    let xterm: any
    let fitAddon: any
    let ws: WebSocket
    let disposed = false
    let observer: ResizeObserver | null = null

    async function init() {
      const { Terminal } = await import('@xterm/xterm')
      const { FitAddon } = await import('@xterm/addon-fit')
      await import('@xterm/xterm/css/xterm.css')

      if (disposed || !containerRef.current) return

      xterm = new Terminal({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
        theme: {
          background: '#1e293b',
          foreground: '#e2e8f0',
          cursor: '#e2e8f0',
          selectionBackground: '#475569',
        },
      })
      xtermRef.current = xterm

      fitAddon = new FitAddon()
      fitRef.current = fitAddon
      xterm.loadAddon(fitAddon)
      xterm.open(containerRef.current)
      fitAddon.fit()

      // Build WebSocket URL with tmux params
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = new URL(`${protocol}//${window.location.host}/api/instances/${instanceId}/terminal`)
      if (sessionName) {
        wsUrl.searchParams.set('session', sessionName)
      }
      if (initialCommand && !sessionName) {
        wsUrl.searchParams.set('command', initialCommand)
      }

      ws = new WebSocket(wsUrl.toString())
      wsRef.current = ws

      ws.onopen = () => {
        if (disposed) return
        setStatus('connected')
        ws.send(JSON.stringify({ type: 'resize', cols: xterm.cols, rows: xterm.rows }))
      }

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.type === 'data') {
            xterm.write(msg.data)
          } else if (msg.type === 'session') {
            setCurrentSession(msg.name)
            onSessionCreated?.(msg.name)
          } else if (msg.type === 'error') {
            xterm.write(`\r\n\x1b[31mError: ${msg.data}\x1b[0m\r\n`)
          }
        } catch {
          // ignore
        }
      }

      ws.onclose = () => {
        if (disposed) return
        setStatus('disconnected')
        xterm.write('\r\n\x1b[90m--- Disconnected (session still running on remote) ---\x1b[0m\r\n')
      }

      ws.onerror = () => {
        if (disposed) return
        setStatus('disconnected')
      }

      xterm.onData((data: string) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'data', data }))
        }
      })

      observer = new ResizeObserver(() => {
        if (fitAddon && xterm.element) {
          fitAddon.fit()
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'resize', cols: xterm.cols, rows: xterm.rows }))
          }
        }
      })
      if (containerRef.current) observer.observe(containerRef.current)
    }

    init()

    return () => {
      disposed = true
      observer?.disconnect()
      wsRef.current?.close()
      xtermRef.current?.dispose()
    }
  }, [instanceId, sessionName, initialCommand, onSessionCreated])

  return (
    <div className="bg-slate-800 flex flex-col flex-1 min-h-0">
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-700 border-b border-slate-600 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-slate-300">Terminal</span>
          <span className={`inline-block w-2 h-2 rounded-full ${
            status === 'connected' ? 'bg-green-400' :
            status === 'connecting' ? 'bg-yellow-400 animate-pulse' :
            'bg-red-400'
          }`} />
          <span className="text-[10px] text-slate-400">{status}</span>
          {currentSession && (
            <span className="text-[10px] text-slate-500 font-mono">{currentSession}</span>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-200 text-xs px-1.5 py-0.5 rounded hover:bg-slate-600 transition-colors"
          title="Close terminal (session keeps running)"
        >
          &#x2715;
        </button>
      </div>
      <div ref={containerRef} className="flex-1 min-h-0" />
    </div>
  )
}
```

Key changes from the original:
- New props: `sessionName` (for reattach), `onSessionCreated` (callback to store session name)
- WebSocket URL includes `?session=` or `?command=` query params
- Handles `{ type: 'session' }` messages from the server
- Disconnect message says "session still running on remote" instead of "session ended"
- Shows session name in terminal header
- Removed the `initialCommand` typing hack (command is now sent server-side via tmux send-keys)

**Step 2: Verify types compile**

```bash
npx tsc --noEmit 2>&1 | grep -i "Terminal"
```

**Step 3: Commit**

```bash
git add app/components/Terminal.tsx
git commit -m "feat: Terminal component supports tmux create/reattach"
```

---

### Task 6: Update InstanceDetail for auto-restore and kill sessions

**Files:**
- Modify: `app/components/InstanceDetail.tsx`

**Step 1: Wire up terminal session tracking and auto-restore**

Changes to `InstanceDetail`:

1. Import `clearTerminalSession` and `setTerminalSession` and `terminalSessions` from DashboardContext
2. Replace the `terminalKey` / `terminalCommand` state with `terminalSession` tracking
3. Add auto-restore logic in the `useEffect` that fires on `instance.id` change
4. Add "Kill Sessions" button to toolbar
5. Pass `sessionName` and `onSessionCreated` to `TerminalPanel`

Replace the component (keep AddChannelDialog unchanged). Here are the specific edits:

**At the top of the component** (line 8), destructure new context values:

```typescript
  const { instances, activeInstanceId, updateInstanceAgents, terminalSessions, setTerminalSession, clearTerminalSession } = useDashboard()
```

**Replace terminal state variables** (lines 15-17):

Remove:
```typescript
  const [showTerminal, setShowTerminal] = useState(false)
  const [terminalCommand, setTerminalCommand] = useState<string | undefined>()
  const [terminalKey, setTerminalKey] = useState(0)
```

Add:
```typescript
  const [showTerminal, setShowTerminal] = useState(false)
  const [terminalCommand, setTerminalCommand] = useState<string | undefined>()
  const [killSessionsLoading, setKillSessionsLoading] = useState(false)
```

**Add auto-restore effect** after the existing `useEffect` (after line 38):

```typescript
  // Auto-restore terminal if there's an active tmux session for this instance
  useEffect(() => {
    if (!instance) return
    const existingSession = terminalSessions.get(instance.id)
    if (existingSession) {
      setShowTerminal(true)
      setTerminalCommand(undefined)
      return
    }

    // Check remote for sessions we don't know about (e.g. after Reef restart)
    fetch(`/api/instances/${instance.id}/terminal/sessions`)
      .then(res => res.ok ? res.json() : { sessions: [] })
      .then(data => {
        if (data.sessions.length > 0) {
          // Attach to most recent session
          const latest = data.sessions[data.sessions.length - 1]
          setTerminalSession(instance.id, latest.name)
          setShowTerminal(true)
          setTerminalCommand(undefined)
        }
      })
      .catch(() => {})
  }, [instance?.id])
```

**Update `openTerminal` function** (line 51-55):

```typescript
  function openTerminal(command?: string) {
    // Clear the current session so Terminal creates a new tmux session
    if (instance) clearTerminalSession(instance.id)
    setTerminalCommand(command)
    setShowTerminal(true)
  }
```

**Add `handleKillSessions` function** (after `handleGoogleSetup`):

```typescript
  async function handleKillSessions() {
    if (!instance) return
    setKillSessionsLoading(true)
    try {
      const res = await fetch(`/api/instances/${instance.id}/terminal/kill-sessions`, { method: 'POST' })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Failed to kill sessions')
      clearTerminalSession(instance.id)
      setShowTerminal(false)
      setRestartMsg({ text: `Killed ${data.killed} tmux session${data.killed !== 1 ? 's' : ''}`, ok: true })
    } catch (e) {
      setRestartMsg({ text: e instanceof Error ? e.message : 'Unknown error', ok: false })
    } finally {
      setKillSessionsLoading(false)
    }
  }
```

**Add "Kill Sessions" button** in the toolbar (after the Terminal button, before the closing `</div>` of the toolbar):

```tsx
          <button
            onClick={handleKillSessions}
            disabled={killSessionsLoading}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-red-200 bg-white text-red-500 hover:bg-red-50 hover:text-red-700 hover:border-red-300 disabled:opacity-40 transition-colors font-medium"
          >
            <span className="opacity-60">{'\u{1F5D1}'}</span>
            {killSessionsLoading ? 'Killing...' : 'Kill Sessions'}
          </button>
```

**Update the TerminalPanel rendering** (around line 225-238):

```tsx
      {showTerminal ? (
        <TerminalPanel
          instanceId={instance.id}
          sessionName={terminalSessions.get(instance.id)}
          initialCommand={terminalCommand}
          onSessionCreated={(name) => setTerminalSession(instance.id, name)}
          onClose={() => {
            setShowTerminal(false)
            // Refresh agents list in case Create Agent was used
            fetch(`/api/instances/${instance.id}/agents`)
              .then(res => res.ok ? res.json() : [])
              .then(data => updateInstanceAgents(instance.id, data))
              .catch(() => {})
          }}
        />
      ) : (
```

Note: The `key` prop is removed — we no longer remount the component to reset it. New sessions are triggered by changing `sessionName`/`initialCommand` props after clearing the old session.

**Step 2: Verify types compile**

```bash
npx tsc --noEmit 2>&1 | grep -i "InstanceDetail\|Terminal\|DashboardContext"
```
Expected: No errors from these files.

**Step 3: Restart dev server and test the full flow**

```bash
bash bin/dev.sh
```

Test sequence:
1. Open UI, click an instance, click "Health" → terminal opens, runs `openclaw health` in tmux
2. Click a different instance in sidebar → navigate away
3. Click back to the first instance → terminal should auto-restore with the health output still visible
4. Click "Kill Sessions" → terminal closes, tmux session cleaned up
5. SSH into the droplet and run `tmux list-sessions` → no `reef-*` sessions

**Step 4: Commit**

```bash
git add app/components/InstanceDetail.tsx
git commit -m "feat: auto-restore terminals and kill sessions button"
```

---

### Task 7: End-to-end verification

**Step 1: Full flow test**

1. Open reef UI at `http://localhost:3002`
2. Click an instance → InstanceDetail loads
3. Click "Terminal" → opens a bare terminal in tmux (verify session name shows in header)
4. Run a long command: `for i in $(seq 1 100); do echo $i; sleep 1; done`
5. While it's running, click a different instance in sidebar
6. Click back to the first instance → terminal auto-restores, counter is still going
7. Click "Doctor" → old session detaches, new tmux session opens with `openclaw doctor`
8. Navigate away and back → doctor session restored
9. Click "Kill Sessions" → both sessions killed, terminal closes
10. SSH into droplet: `tmux list-sessions` shows no `reef-*` sessions

**Step 2: Commit all remaining changes**

If any small fixes were needed during testing, commit them.

```bash
git add -A
git commit -m "feat: tmux persistent terminals - complete"
```
