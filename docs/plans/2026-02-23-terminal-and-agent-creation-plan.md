# Terminal Integration & Agent Creation Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Embed an xterm.js SSH terminal in the Reef UI, replace the broken non-interactive Create Agent modal with the interactive OpenClaw wizard, add an Upgrade OpenClaw button, and provide general terminal access.

**Architecture:** A `next-ws` WebSocket route accepts connections, resolves the instance via existing `resolveInstance()`, opens an SSH PTY shell via `ssh2`'s `conn.shell()`, and relays data bidirectionally. The frontend uses xterm.js in a bottom panel (VS Code style). Create Agent and Upgrade buttons open the terminal with pre-filled commands.

**Tech Stack:** next-ws, ws, xterm, xterm-addon-fit, ssh2 (existing)

---

### Task 1: Install dependencies and configure Next.js

**Files:**
- Modify: `package.json`
- Modify: `next.config.ts`

**Step 1: Install packages**

Run:
```bash
cd "/mnt/c/Users/Jonathan Jackson/Projects/reef"
npm install next-ws ws xterm @xterm/addon-fit
npm install -D @types/ws
```

**Step 2: Add prepare script to package.json**

In `package.json`, add to the `"scripts"` object:
```json
"prepare": "next-ws patch"
```

The full scripts block becomes:
```json
"scripts": {
  "prepare": "next-ws patch",
  "dev": "bash bin/dev.sh",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "test": "vitest",
  "test:run": "vitest run"
}
```

**Step 3: Run prepare to patch Next.js**

Run:
```bash
npm run prepare
```
Expected: next-ws patches the Next.js installation to support WebSocket route handlers.

**Step 4: Add ws to serverExternalPackages in next.config.ts**

Change `next.config.ts` line 4 from:
```typescript
serverExternalPackages: ['ssh2', '@1password/sdk'],
```
to:
```typescript
serverExternalPackages: ['ssh2', '@1password/sdk', 'ws'],
```

**Step 5: Commit**

```bash
git add package.json package-lock.json next.config.ts
git commit -m "feat: add xterm.js and next-ws dependencies for terminal support"
```

---

### Task 2: Create the WebSocket PTY relay route

**Files:**
- Create: `app/api/instances/[id]/terminal/route.ts`

**Step 1: Create the route file**

Create `app/api/instances/[id]/terminal/route.ts` with:

```typescript
import { resolveInstance } from '@/lib/instances'
import { Client } from 'ssh2'

export function UPGRADE(
  client: import('ws').WebSocket,
  _server: import('ws').WebSocketServer,
  request: import('next/server').NextRequest
) {
  const url = new URL(request.url)
  const segments = url.pathname.split('/')
  // pathname: /api/instances/<id>/terminal
  const idIndex = segments.indexOf('instances') + 1
  const id = segments[idIndex]

  if (!id) {
    client.close(1008, 'Missing instance ID')
    return
  }

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
      sshConn!.shell(
        { cols: 80, rows: 24, term: 'xterm-256color' },
        (err, stream) => {
          if (err) {
            client.send(JSON.stringify({ type: 'error', data: err.message }))
            client.close(1011, 'SSH shell error')
            return
          }

          sshStream = stream

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
            sshConn?.end()
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
      )
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

  // Cleanup on WebSocket close
  client.on('close', () => {
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
```

**Step 2: Verify the route compiles**

Run:
```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: No errors related to the terminal route. (There may be pre-existing warnings.)

**Step 3: Commit**

```bash
git add app/api/instances/\[id\]/terminal/route.ts
git commit -m "feat: add WebSocket PTY relay route for SSH terminal"
```

---

### Task 3: Create the Terminal frontend component

**Files:**
- Create: `app/components/Terminal.tsx`

**Step 1: Create the component**

Create `app/components/Terminal.tsx`:

```typescript
'use client'

import { useEffect, useRef, useState } from 'react'

interface TerminalProps {
  instanceId: string
  onClose: () => void
  initialCommand?: string
}

export function TerminalPanel({ instanceId, onClose, initialCommand }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const xtermRef = useRef<any>(null)
  const fitRef = useRef<any>(null)
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')

  useEffect(() => {
    let xterm: any
    let fitAddon: any
    let ws: WebSocket
    let disposed = false

    async function init() {
      // Dynamic import to avoid SSR issues
      const { Terminal } = await import('xterm')
      const { FitAddon } = await import('@xterm/addon-fit')
      await import('xterm/css/xterm.css')

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

      // Connect WebSocket
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      ws = new WebSocket(`${protocol}//${window.location.host}/api/instances/${instanceId}/terminal`)
      wsRef.current = ws

      ws.onopen = () => {
        if (disposed) return
        setStatus('connected')
        // Send initial resize
        ws.send(JSON.stringify({ type: 'resize', cols: xterm.cols, rows: xterm.rows }))
        // Send initial command if provided
        if (initialCommand) {
          setTimeout(() => {
            ws.send(JSON.stringify({ type: 'data', data: initialCommand + '\n' }))
          }, 500)
        }
      }

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.type === 'data') {
            xterm.write(msg.data)
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
        xterm.write('\r\n\x1b[90m--- Session ended ---\x1b[0m\r\n')
      }

      ws.onerror = () => {
        if (disposed) return
        setStatus('disconnected')
      }

      // Keystrokes → WebSocket
      xterm.onData((data: string) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'data', data }))
        }
      })

      // Resize handling
      const observer = new ResizeObserver(() => {
        if (fitAddon && xterm.element) {
          fitAddon.fit()
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'resize', cols: xterm.cols, rows: xterm.rows }))
          }
        }
      })
      if (containerRef.current) observer.observe(containerRef.current)

      return () => observer.disconnect()
    }

    const cleanup = init()

    return () => {
      disposed = true
      cleanup?.then(fn => fn?.())
      wsRef.current?.close()
      xtermRef.current?.dispose()
    }
  }, [instanceId, initialCommand])

  return (
    <div className="border-t border-slate-300 bg-slate-800 flex flex-col" style={{ height: '320px' }}>
      {/* Terminal header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-700 border-b border-slate-600 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-slate-300">Terminal</span>
          <span className={`inline-block w-2 h-2 rounded-full ${
            status === 'connected' ? 'bg-green-400' :
            status === 'connecting' ? 'bg-yellow-400 animate-pulse' :
            'bg-red-400'
          }`} />
          <span className="text-[10px] text-slate-400">{status}</span>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-200 text-xs px-1.5 py-0.5 rounded hover:bg-slate-600 transition-colors"
          title="Close terminal"
        >
          &#x2715;
        </button>
      </div>
      {/* Terminal content */}
      <div ref={containerRef} className="flex-1 min-h-0" />
    </div>
  )
}
```

**Step 2: Verify no import errors**

Run:
```bash
npx tsc --noEmit 2>&1 | grep -i terminal
```
Expected: No errors. (xterm types may need `// @ts-ignore` for dynamic imports — adjust if needed.)

**Step 3: Commit**

```bash
git add app/components/Terminal.tsx
git commit -m "feat: add xterm.js Terminal component with WebSocket connection"
```

---

### Task 4: Integrate terminal into InstanceDetail

**Files:**
- Modify: `app/components/InstanceDetail.tsx:1-254`

**Step 1: Add import and state**

At line 3 of `InstanceDetail.tsx`, add import:
```typescript
import { TerminalPanel } from './Terminal'
```

After line 20 (`const [showAddChannel, setShowAddChannel] = useState(false)`), add:
```typescript
const [showTerminal, setShowTerminal] = useState(false)
const [terminalCommand, setTerminalCommand] = useState<string | undefined>()
```

**Step 2: Replace Create Agent button behavior**

Replace lines 151-157 (the Create Agent button) with:
```typescript
          <button
            onClick={() => {
              setTerminalCommand('openclaw agents add')
              setShowTerminal(true)
            }}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300 transition-colors font-medium"
          >
            <span className="opacity-60">+</span>
            Create Agent
          </button>
```

**Step 3: Add Upgrade and Terminal buttons**

After the Add Channel button (after line 164), add before the closing `</div>` of the toolbar:
```typescript
          <div className="w-px h-5 bg-slate-200 mx-1" />
          <button
            onClick={() => {
              setTerminalCommand('npm update -g openclaw && openclaw gateway restart')
              setShowTerminal(true)
            }}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300 transition-colors font-medium"
          >
            <span className="opacity-60">&#x2191;</span>
            Upgrade
          </button>
          <button
            onClick={() => {
              setTerminalCommand(undefined)
              setShowTerminal(true)
            }}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300 transition-colors font-medium"
          >
            <span className="opacity-60 font-mono">&gt;_</span>
            Terminal
          </button>
```

**Step 4: Add terminal panel to layout**

The terminal should appear at the bottom of the instance detail, below the content area. Change the outer container (line 81) and add the terminal after the content area.

Replace the closing section (lines 224-253) with:
```typescript
      </div>

      {/* Terminal Panel */}
      {showTerminal && (
        <TerminalPanel
          key={`${instance.id}-${terminalCommand}`}
          instanceId={instance.id}
          onClose={() => {
            setShowTerminal(false)
            // Refresh agents list in case Create Agent was used
            fetch(`/api/instances/${instance.id}/agents`)
              .then(res => res.ok ? res.json() : [])
              .then(data => updateInstanceAgents(instance.id, data))
              .catch(() => {})
          }}
          initialCommand={terminalCommand}
        />
      )}

      {/* Add Channel Dialog */}
      {showAddChannel && (
        <AddChannelDialog
          instanceId={instance.id}
          onClose={() => setShowAddChannel(false)}
          onAdded={(output) => {
            setShowAddChannel(false)
            setResults(prev => ({ ...prev, 'add-channel': { output, loading: false } }))
            setActiveTab('add-channel')
          }}
        />
      )}
    </div>
  )
}
```

**Step 5: Remove CreateAgentDialog render and showCreateAgent state**

- Remove line 19: `const [showCreateAgent, setShowCreateAgent] = useState(false)`
- Remove lines 226-239 (the `{showCreateAgent && ...}` block)
- Keep the `CreateAgentDialog` function definition (lines 257-334) — it's still used by the CLI tool. Add a comment: `// Kept for CLI reference — UI now uses embedded terminal`

**Step 6: Verify the app compiles**

Run:
```bash
npx tsc --noEmit 2>&1 | head -20
```

**Step 7: Commit**

```bash
git add app/components/InstanceDetail.tsx
git commit -m "feat: replace Create Agent modal with terminal, add Upgrade and Terminal buttons"
```

---

### Task 5: Update dev server and test end-to-end

**Files:**
- Modify: `bin/dev.sh` (may need changes for next-ws)

**Step 1: Delete .next cache and reinstall**

The `next-ws` patch needs a clean state:
```bash
cd "/mnt/c/Users/Jonathan Jackson/Projects/reef"
rm -rf .next node_modules/.cache
npm run prepare
```

**Step 2: Start the dev server**

```bash
bash bin/dev.sh
```
Expected: Server starts on port 3000 with no errors.

**Step 3: Test terminal connection**

1. Open `http://localhost:3000`
2. Click on an instance (e.g., `openclaw-hal`)
3. Click the **Terminal** button in the action bar
4. Expected: Terminal panel opens at the bottom with a bash prompt
5. Type `whoami` and press Enter
6. Expected: `root`

**Step 4: Test Create Agent**

1. Click **Create Agent** button
2. Expected: Terminal opens and runs `openclaw agents add` interactively
3. The wizard should prompt for agent name, workspace, etc.
4. Complete the wizard or Ctrl+C to cancel
5. Close the terminal — agent list should refresh

**Step 5: Test Upgrade**

1. Click **Upgrade** button
2. Expected: Terminal opens and runs `npm update -g openclaw && openclaw gateway restart`
3. See live update output

**Step 6: Test resize**

1. With terminal open, resize the browser window
2. Expected: Terminal content reflows correctly

**Step 7: Test cleanup**

1. Close the terminal panel via the X button
2. Expected: No lingering SSH connections (check with `ss -tn` on the instance)

**Step 8: Run existing tests**

```bash
npx vitest run
```
Expected: All 29 existing tests pass (terminal feature doesn't affect them).

**Step 9: Commit any fixes**

```bash
git add -A
git commit -m "fix: dev server and terminal integration adjustments"
```

---

### Task 6: Cleanup and documentation

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update CLAUDE.md**

Add to the "Key architecture decisions" section:
```markdown
- SSH terminal uses `next-ws` for WebSocket + `ssh2` PTY shell, relayed via xterm.js
- Create Agent uses the interactive `openclaw agents add` wizard (not `--non-interactive`)
- `next-ws` requires `npm run prepare` after installing dependencies (patches Next.js)
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add terminal architecture notes to CLAUDE.md"
```
