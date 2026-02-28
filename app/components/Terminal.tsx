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
