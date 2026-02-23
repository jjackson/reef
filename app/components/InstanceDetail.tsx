'use client'

import { useState } from 'react'
import { useDashboard } from './context/DashboardContext'

interface InstanceHealth {
  processRunning: boolean
  disk: string
  memory: string
  uptime: string
}

export function InstanceDetail() {
  const { instances, activeInstanceId } = useDashboard()
  const [health, setHealth] = useState<InstanceHealth | null>(null)
  const [doctor, setDoctor] = useState<{ output: string } | null>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [restartMsg, setRestartMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [confirmRestart, setConfirmRestart] = useState(false)

  const instance = instances.find(i => i.id === activeInstanceId)

  if (!instance) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-4xl mb-3 opacity-20">&#x2190;</div>
          <p className="text-sm text-slate-400">Select an instance from the sidebar</p>
        </div>
      </div>
    )
  }

  async function runAction(action: string) {
    setLoading(action)
    setError(null)
    try {
      const res = await fetch(`/api/instances/${instance!.id}/${action}`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      if (action === 'health') setHealth(data)
      if (action === 'doctor') setDoctor(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(null)
    }
  }

  async function handleRestart() {
    if (!confirmRestart) {
      setConfirmRestart(true)
      return
    }
    setConfirmRestart(false)
    setLoading('restart')
    setRestartMsg(null)
    try {
      const res = await fetch(`/api/instances/${instance!.id}/restart`, { method: 'POST' })
      const data = await res.json()
      setRestartMsg({ text: data.output || (data.success ? 'Restarted successfully' : data.error || 'Restart failed'), ok: data.success })
    } catch (e) {
      setRestartMsg({ text: e instanceof Error ? e.message : 'Unknown error', ok: false })
    } finally {
      setLoading(null)
    }
  }

  const actions = [
    { key: 'health', label: 'Health', loadingLabel: 'Checking...', icon: '\u2764' },
    { key: 'doctor', label: 'Doctor', loadingLabel: 'Running doctor...', icon: '\u{1FA7A}' },
  ]

  return (
    <div className="h-full flex flex-col bg-slate-50/50">
      {/* Instance header */}
      <div className="bg-white border-b border-slate-200 shrink-0">
        <div className="px-6 py-5">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center text-2xl shadow-sm">
                &#x1F5A5;
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900 tracking-tight">
                  {instance.label}
                </h2>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-xs text-slate-400 font-mono">{instance.ip}</span>
                  <span className="text-slate-300">&middot;</span>
                  <span className="text-xs text-slate-500">{instance.agents.length} agent{instance.agents.length !== 1 ? 's' : ''}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Action toolbar */}
        <div className="px-6 pb-4 flex items-center gap-1.5">
          {actions.map(a => (
            <button
              key={a.key}
              onClick={() => runAction(a.key)}
              disabled={!!loading}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300 disabled:opacity-40 transition-colors font-medium"
            >
              <span className="opacity-60">{a.icon}</span>
              {loading === a.key ? a.loadingLabel : a.label}
            </button>
          ))}
          <div className="w-px h-5 bg-slate-200 mx-1" />
          {confirmRestart ? (
            <span className="flex items-center gap-1.5">
              <button
                onClick={handleRestart}
                disabled={!!loading}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 transition-colors font-medium"
              >
                Confirm Restart
              </button>
              <button
                onClick={() => setConfirmRestart(false)}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors font-medium"
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              onClick={handleRestart}
              disabled={!!loading}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100 hover:border-orange-300 disabled:opacity-40 transition-colors font-medium"
            >
              <span className="opacity-60">&#x21BA;</span>
              {loading === 'restart' ? 'Restarting...' : 'Restart'}
            </button>
          )}
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* Error banner */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Restart message */}
        {restartMsg && (
          <div className={`rounded-lg border px-4 py-3 text-sm ${restartMsg.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
            {restartMsg.text}
          </div>
        )}

        {/* Health card */}
        {health && (
          <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="px-4 py-2.5 border-b border-slate-100">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Health</h3>
            </div>
            <div className="px-4 py-3 grid grid-cols-2 gap-3">
              <div>
                <p className="text-[11px] text-slate-400 uppercase tracking-wider mb-0.5">Process</p>
                <p className={`text-sm font-mono font-medium ${health.processRunning ? 'text-emerald-600' : 'text-red-500'}`}>
                  {health.processRunning ? 'Running' : 'Stopped'}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-slate-400 uppercase tracking-wider mb-0.5">Uptime</p>
                <p className="text-sm font-mono text-slate-700">{health.uptime}</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-400 uppercase tracking-wider mb-0.5">Disk</p>
                <p className="text-sm font-mono text-slate-700">{health.disk}</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-400 uppercase tracking-wider mb-0.5">Memory</p>
                <p className="text-sm font-mono text-slate-700">{health.memory}</p>
              </div>
            </div>
          </div>
        )}

        {/* Doctor card */}
        {doctor && (
          <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="px-4 py-2.5 border-b border-slate-100">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Doctor</h3>
            </div>
            <div className="px-4 py-3">
              <pre className="text-xs font-mono text-slate-700 whitespace-pre-wrap overflow-x-auto max-h-96 overflow-y-auto">{doctor.output}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
