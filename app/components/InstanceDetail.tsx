'use client'

import { useState, useEffect } from 'react'
import { useDashboard } from './context/DashboardContext'

interface TabResult {
  output: string
  loading: boolean
}

export function InstanceDetail() {
  const { instances, activeInstanceId, updateInstanceAgents } = useDashboard()
  const [results, setResults] = useState<Record<string, TabResult>>({})
  const [activeTab, setActiveTab] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [restartMsg, setRestartMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [confirmRestart, setConfirmRestart] = useState(false)
  const [restartLoading, setRestartLoading] = useState(false)
  const [showCreateAgent, setShowCreateAgent] = useState(false)
  const [showAddChannel, setShowAddChannel] = useState(false)

  const instance = instances.find(i => i.id === activeInstanceId)

  useEffect(() => {
    if (!instance || instance.agents.length > 0) return
    fetch(`/api/instances/${instance.id}/agents`)
      .then(res => res.ok ? res.json() : [])
      .then(data => updateInstanceAgents(instance.id, data))
      .catch(() => {})
  }, [instance, updateInstanceAgents])

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
    setError(null)
    setResults(prev => ({ ...prev, [action]: { output: '', loading: true } }))
    setActiveTab(action)
    try {
      const res = await fetch(`/api/instances/${instance!.id}/${action}`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      const output = data.output ?? JSON.stringify(data, null, 2)
      setResults(prev => ({ ...prev, [action]: { output, loading: false } }))
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      setResults(prev => ({ ...prev, [action]: { output: `Error: ${msg}`, loading: false } }))
    }
  }

  async function handleRestart() {
    if (!confirmRestart) {
      setConfirmRestart(true)
      return
    }
    setConfirmRestart(false)
    setRestartLoading(true)
    setRestartMsg(null)
    try {
      const res = await fetch(`/api/instances/${instance!.id}/restart`, { method: 'POST' })
      const data = await res.json()
      setRestartMsg({ text: data.output || (data.success ? 'Restarted successfully' : data.error || 'Restart failed'), ok: data.success })
    } catch (e) {
      setRestartMsg({ text: e instanceof Error ? e.message : 'Unknown error', ok: false })
    } finally {
      setRestartLoading(false)
    }
  }

  const tabKeys = Object.keys(results)

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
                  <span className="text-xs text-slate-500">{instance.agents.length} agent{instance.agents.length !== 1 ? 's' : ''}</span>
                </div>
              </div>
            </div>
            {/* Restart button — small, top-right */}
            <div className="flex items-center gap-1.5">
              {confirmRestart ? (
                <>
                  <button
                    onClick={handleRestart}
                    disabled={restartLoading}
                    className="text-[11px] px-2 py-1 rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 transition-colors font-medium"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => setConfirmRestart(false)}
                    className="text-[11px] px-2 py-1 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors font-medium"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  onClick={handleRestart}
                  disabled={restartLoading}
                  className="text-[11px] px-2 py-1 rounded-md text-slate-400 hover:text-orange-600 hover:bg-orange-50 disabled:opacity-40 transition-colors font-medium"
                  title="Restart OpenClaw"
                >
                  &#x21BA; {restartLoading ? 'Restarting...' : 'Restart'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Action toolbar */}
        <div className="px-6 pb-4 flex items-center gap-1.5">
          <button
            onClick={() => runAction('health')}
            disabled={results['health']?.loading}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300 disabled:opacity-40 transition-colors font-medium"
          >
            <span className="opacity-60">{'\u2764'}</span>
            {results['health']?.loading ? 'Checking...' : 'Health'}
          </button>
          <button
            onClick={() => runAction('doctor')}
            disabled={results['doctor']?.loading}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300 disabled:opacity-40 transition-colors font-medium"
          >
            <span className="opacity-60">{'\u{1FA7A}'}</span>
            {results['doctor']?.loading ? 'Running doctor...' : 'Doctor'}
          </button>
          <div className="w-px h-5 bg-slate-200 mx-1" />
          <button
            onClick={() => setShowCreateAgent(true)}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300 transition-colors font-medium"
          >
            <span className="opacity-60">+</span>
            Create Agent
          </button>
          <button
            onClick={() => setShowAddChannel(true)}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300 transition-colors font-medium"
          >
            <span className="opacity-60">#</span>
            Add Channel
          </button>
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

        {/* Tab bar */}
        {tabKeys.length > 0 && (
          <div className="flex gap-1 border-b border-slate-200">
            {tabKeys.map(key => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`text-xs px-3 py-2 font-medium capitalize border-b-2 transition-colors ${
                  activeTab === key
                    ? 'border-slate-800 text-slate-900'
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                {key}
                {results[key]?.loading && (
                  <span className="ml-1.5 inline-block w-3 h-3 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin align-middle" />
                )}
              </button>
            ))}
          </div>
        )}

        {/* Active tab content */}
        {activeTab && results[activeTab] && (
          <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="px-4 py-2.5 border-b border-slate-100">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{activeTab}</h3>
            </div>
            <div className="px-4 py-3">
              {results[activeTab].loading ? (
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <span className="inline-block w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                  Loading...
                </div>
              ) : (
                <pre className="text-xs font-mono text-slate-700 whitespace-pre-wrap overflow-x-auto max-h-96 overflow-y-auto">{results[activeTab].output}</pre>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Create Agent Dialog */}
      {showCreateAgent && (
        <CreateAgentDialog
          instanceId={instance.id}
          onClose={() => setShowCreateAgent(false)}
          onCreated={() => {
            setShowCreateAgent(false)
            fetch(`/api/instances/${instance.id}/agents`)
              .then(res => res.ok ? res.json() : [])
              .then(data => updateInstanceAgents(instance.id, data))
              .catch(() => {})
          }}
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

function CreateAgentDialog({ instanceId, onClose, onCreated }: {
  instanceId: string
  onClose: () => void
  onCreated: () => void
}) {
  const [name, setName] = useState('')
  const [model, setModel] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const nameValid = /^[a-zA-Z0-9_-]+$/.test(name)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!nameValid) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/instances/${instanceId}/agents/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, model: model || undefined }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.output || data.error || 'Failed to create agent')
      onCreated()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <h3 className="text-base font-semibold text-slate-900 mb-4">Create Agent</h3>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Name *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="my-agent"
              className={`w-full text-sm px-3 py-2 rounded-lg border ${name && !nameValid ? 'border-red-300 focus:ring-red-400' : 'border-slate-200 focus:ring-slate-400'} focus:outline-none focus:ring-2 focus:border-transparent`}
              autoFocus
            />
            {name && !nameValid && (
              <p className="text-xs text-red-500 mt-1">Only letters, numbers, hyphens and underscores</p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Model (optional)</label>
            <input
              type="text"
              value={model}
              onChange={e => setModel(e.target.value)}
              placeholder="anthropic/claude-opus-4-6"
              className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent"
            />
          </div>
          {error && (
            <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 border border-red-200">{error}</div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="text-sm px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={!nameValid || submitting} className="text-sm px-4 py-2 rounded-lg bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-40 font-medium transition-colors">
              {submitting ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const CHANNEL_TYPES = ['telegram', 'discord', 'slack', 'whatsapp', 'signal']

function AddChannelDialog({ instanceId, onClose, onAdded }: {
  instanceId: string
  onClose: () => void
  onAdded: (output: string) => void
}) {
  const [channel, setChannel] = useState('telegram')
  const [token, setToken] = useState('')
  const [accountId, setAccountId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [existing, setExisting] = useState<Record<string, string[]>>({})
  const [loadingChannels, setLoadingChannels] = useState(true)

  // Fetch existing channels on mount
  useEffect(() => {
    fetch(`/api/instances/${instanceId}/channels/list`)
      .then(res => res.ok ? res.json() : { chat: {} })
      .then(data => setExisting(data.chat || {}))
      .catch(() => {})
      .finally(() => setLoadingChannels(false))
  }, [instanceId])

  const existingAccounts = existing[channel] || []
  const hasExisting = existingAccounts.length > 0
  const wouldOverwrite = accountId.trim() !== '' && existingAccounts.includes(accountId.trim())

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!token.trim() || !accountId.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/instances/${instanceId}/channels/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, token, accountId }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.output || data.error || 'Failed to add channel')
      onAdded(data.output)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <h3 className="text-base font-semibold text-slate-900 mb-4">Add Channel</h3>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Channel Type</label>
            <select
              value={channel}
              onChange={e => { setChannel(e.target.value); setAccountId('') }}
              className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent bg-white"
            >
              {CHANNEL_TYPES.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Name for Channel *</label>
            <input
              type="text"
              value={accountId}
              onChange={e => setAccountId(e.target.value)}
              placeholder="e.g. hal, ada, main"
              className={`w-full text-sm px-3 py-2 rounded-lg border ${wouldOverwrite ? 'border-red-300' : 'border-slate-200'} focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent`}
            />
            <p className="text-[11px] text-slate-400 mt-1">A unique name to identify this channel. Used when binding to agents.</p>
            {hasExisting && (
              <p className="text-[11px] text-slate-500 mt-1">
                Existing {channel} channels: <span className="font-mono">{existingAccounts.join(', ')}</span>
              </p>
            )}
            {wouldOverwrite && (
              <p className="text-[11px] text-red-500 mt-1 font-medium">
                This will overwrite the existing &quot;{accountId}&quot; channel!
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Token *</label>
            <input
              type="password"
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="Bot token"
              className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent"
            />
          </div>
          {error && (
            <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 border border-red-200">{error}</div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="text-sm px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={!token.trim() || !accountId.trim() || submitting} className="text-sm px-4 py-2 rounded-lg bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-40 font-medium transition-colors">
              {submitting ? 'Adding...' : 'Add Channel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
