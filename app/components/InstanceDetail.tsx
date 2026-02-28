'use client'

import { useState, useEffect } from 'react'
import { useDashboard } from './context/DashboardContext'
import { TerminalPanel } from './Terminal'

export function InstanceDetail() {
  const { instances, activeInstanceId, updateInstanceAgents } = useDashboard()
  const [restartMsg, setRestartMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [confirmRestart, setConfirmRestart] = useState(false)
  const [restartLoading, setRestartLoading] = useState(false)
  const [showAddChannel, setShowAddChannel] = useState(false)
  const [googleSetupLoading, setGoogleSetupLoading] = useState(false)
  const [installLoading, setInstallLoading] = useState(false)
  const [showTerminal, setShowTerminal] = useState(false)
  const [terminalCommand, setTerminalCommand] = useState<string | undefined>()
  const [terminalKey, setTerminalKey] = useState(0)
  const [version, setVersion] = useState<string | null>(null)

  const instance = instances.find(i => i.id === activeInstanceId)

  useEffect(() => {
    if (!instance) return
    if (instance.agents.length === 0) {
      fetch(`/api/instances/${instance.id}/agents`)
        .then(res => res.ok ? res.json() : [])
        .then(data => updateInstanceAgents(instance.id, data))
        .catch(() => {})
    }
    // Fetch OpenClaw version
    setVersion(null)
    fetch(`/api/instances/${instance.id}/health`, { method: 'POST' })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.version) setVersion(data.version)
      })
      .catch(() => {})
  }, [instance?.id, updateInstanceAgents])

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

  function openTerminal(command?: string) {
    setTerminalCommand(command)
    setTerminalKey(k => k + 1)
    setShowTerminal(true)
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

  async function handleInstall() {
    setInstallLoading(true)
    try {
      const res = await fetch(`/api/instances/${instance!.id}/install`, { method: 'POST' })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Failed to upload install script')
      openTerminal('bash /tmp/reef-install-openclaw.sh')
    } catch (e) {
      setRestartMsg({ text: e instanceof Error ? e.message : 'Unknown error', ok: false })
    } finally {
      setInstallLoading(false)
    }
  }

  async function handleGoogleSetup() {
    setGoogleSetupLoading(true)
    try {
      const res = await fetch(`/api/instances/${instance!.id}/google-setup`, { method: 'POST' })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Failed to upload setup script')
      openTerminal('bash /tmp/reef-google-setup.sh')
    } catch (e) {
      setRestartMsg({ text: e instanceof Error ? e.message : 'Unknown error', ok: false })
    } finally {
      setGoogleSetupLoading(false)
    }
  }

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
                  {version && (
                    <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded font-mono">v{version}</span>
                  )}
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
        <div className="px-6 pb-4 flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => openTerminal('openclaw health')}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300 transition-colors font-medium"
          >
            <span className="opacity-60">{'\u2764'}</span>
            Health
          </button>
          <button
            onClick={() => openTerminal('openclaw doctor --non-interactive')}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300 transition-colors font-medium"
          >
            <span className="opacity-60">{'\u{1FA7A}'}</span>
            Doctor
          </button>
          <div className="w-px h-5 bg-slate-200 mx-1" />
          <button
            onClick={() => openTerminal('openclaw agents add')}
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
          <button
            onClick={handleGoogleSetup}
            disabled={googleSetupLoading}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300 disabled:opacity-40 transition-colors font-medium"
          >
            <span className="opacity-60">{'\u2709'}</span>
            {googleSetupLoading ? 'Uploading...' : 'Setup Google'}
          </button>
          <div className="w-px h-5 bg-slate-200 mx-1" />
          <button
            onClick={handleInstall}
            disabled={installLoading}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300 disabled:opacity-40 transition-colors font-medium"
          >
            <span className="opacity-60">{'\u{1F4E6}'}</span>
            {installLoading ? 'Uploading...' : 'Install OpenClaw'}
          </button>
          <button
            onClick={() => openTerminal('npm update -g openclaw && openclaw gateway restart')}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300 transition-colors font-medium"
          >
            <span className="opacity-60">{'\u2B06'}</span>
            Upgrade
          </button>
          <button
            onClick={() => openTerminal()}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300 transition-colors font-medium"
          >
            <span className="opacity-60 font-mono">&gt;_</span>
            Terminal
          </button>
        </div>
      </div>

      {/* Content area */}
      {showTerminal ? (
        <TerminalPanel
          key={terminalKey}
          instanceId={instance.id}
          initialCommand={terminalCommand}
          onClose={() => {
            setShowTerminal(false)
            fetch(`/api/instances/${instance.id}/agents`)
              .then(res => res.ok ? res.json() : [])
              .then(data => updateInstanceAgents(instance.id, data))
              .catch(() => {})
          }}
        />
      ) : (
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {restartMsg && (
            <div className={`rounded-lg border px-4 py-3 text-sm ${restartMsg.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
              {restartMsg.text}
            </div>
          )}
          <div className="text-center py-12">
            <p className="text-sm text-slate-400">Use the action buttons above or open a terminal</p>
          </div>
        </div>
      )}

      {/* Add Channel Dialog */}
      {showAddChannel && (
        <AddChannelDialog
          instanceId={instance.id}
          onClose={() => setShowAddChannel(false)}
          onAdded={() => {
            setShowAddChannel(false)
          }}
        />
      )}
    </div>
  )
}

const CHANNEL_TYPES = ['telegram', 'discord', 'slack', 'whatsapp', 'signal']

function AddChannelDialog({ instanceId, onClose, onAdded }: {
  instanceId: string
  onClose: () => void
  onAdded: () => void
}) {
  const [channel, setChannel] = useState('telegram')
  const [token, setToken] = useState('')
  const [accountId, setAccountId] = useState('')
  const [saveToOp, setSaveToOp] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [existing, setExisting] = useState<Record<string, string[]>>({})
  const [loadingChannels, setLoadingChannels] = useState(true)

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
        body: JSON.stringify({ channel, token, accountId, saveToOp }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.output || data.error || 'Failed to add channel')
      onAdded()
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
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={saveToOp}
              onChange={e => setSaveToOp(e.target.checked)}
              className="rounded border-slate-300 text-slate-800 focus:ring-slate-400"
            />
            <span className="text-xs text-slate-600">Save token to 1Password</span>
          </label>
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
