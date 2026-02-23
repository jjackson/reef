'use client'

import { useState, useEffect } from 'react'
import Markdown from 'react-markdown'
import { useDashboard } from './context/DashboardContext'
import { DirectoryNode } from './DirectoryNode'
import { MigrateDialog } from './MigrateDialog'

interface HealthResult {
  exists: boolean
  dirSize: string
  lastActivity: string
  processRunning: boolean
}

type FileMode = 'rendered' | 'raw' | 'edit'

function InlineFileViewer({ instanceId, path, name, onClose }: {
  instanceId: string
  path: string
  name: string
  onClose: () => void
}) {
  const [content, setContent] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [mode, setMode] = useState<FileMode>('rendered')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isMarkdown = name.endsWith('.md')

  useEffect(() => {
    setLoading(true)
    setError(null)
    setMode(isMarkdown ? 'rendered' : 'raw')
    fetch(`/api/instances/${instanceId}/browse/read?path=${encodeURIComponent(path)}`)
      .then(res => res.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        setContent(data.content)
        setEditContent(data.content)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [instanceId, path, isMarkdown])

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/instances/${instanceId}/browse/write`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, content: editContent }),
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

  return (
    <div className="flex flex-col h-full">
      {/* File header */}
      <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-slate-400 shrink-0">
            <path d="M3 1h7l4 4v10H3V1z" stroke="currentColor" strokeWidth="1.5" fill="none"/>
            <path d="M10 1v4h4" stroke="currentColor" strokeWidth="1.5"/>
          </svg>
          <span className="text-sm font-medium text-slate-700 truncate">{name}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {mode === 'edit' ? (
            <>
              <button
                onClick={save}
                disabled={saving}
                className="text-xs px-2.5 py-1 rounded-md bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-50 font-medium transition-colors"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={() => { setEditContent(content ?? ''); setMode(isMarkdown ? 'rendered' : 'raw') }}
                className="text-xs px-2.5 py-1 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium transition-colors"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              {isMarkdown && (
                <button
                  onClick={() => setMode(mode === 'rendered' ? 'raw' : 'rendered')}
                  className="text-xs px-2.5 py-1 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700 font-medium transition-colors"
                >
                  {mode === 'rendered' ? 'Raw' : 'Rendered'}
                </button>
              )}
              <button
                onClick={() => { setEditContent(content ?? ''); setMode('edit') }}
                className="text-xs px-2.5 py-1 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700 font-medium transition-colors"
              >
                Edit
              </button>
            </>
          )}
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 ml-1 transition-colors"
            title="Close file"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      </div>

      {/* File content */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading && <div className="flex items-center gap-2 text-sm text-slate-400"><span className="spinner" /> Loading...</div>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!loading && !error && content !== null && (
          <>
            {mode === 'rendered' && (
              <div className="prose prose-sm prose-slate max-w-none">
                <Markdown>{content}</Markdown>
              </div>
            )}
            {mode === 'raw' && (
              <pre className="text-[13px] font-mono text-slate-700 whitespace-pre-wrap leading-relaxed">{content}</pre>
            )}
            {mode === 'edit' && (
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full h-full min-h-[300px] font-mono text-[13px] border border-slate-200 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent resize-none bg-slate-50"
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}

export function AgentDetail() {
  const { instances, activeInstanceId, activeAgentId, activeFile, setActiveFile, setViewMode, setActiveInstance, updateInstanceAgents } = useDashboard()
  const [health, setHealth] = useState<HealthResult | null>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showMigrate, setShowMigrate] = useState(false)
  const [showBindChannel, setShowBindChannel] = useState(false)
  const [showApproveUser, setShowApproveUser] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const instance = instances.find(i => i.id === activeInstanceId)
  const agent = instance?.agents.find(a => a.id === activeAgentId)

  if (!instance || !agent) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-4xl mb-3 opacity-20">&#x2190;</div>
          <p className="text-sm text-slate-400">Select an agent from the sidebar</p>
        </div>
      </div>
    )
  }

  const workspacePath = agent.workspace
    ? agent.workspace.replace(/.*?(\.openclaw\/)/, '~/$1')
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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(null)
    }
  }

  const actions = [
    { key: 'health', label: 'Health', loadingLabel: 'Checking...', icon: '\u2764' },
    { key: 'backup', label: 'Backup', loadingLabel: 'Backing up...', icon: '\u2913' },
  ]

  return (
    <div className="h-full flex flex-col bg-slate-50/50">
      {/* Agent header */}
      <div className="bg-white border-b border-slate-200 shrink-0">
        <div className="px-6 py-5">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              {agent.identityEmoji && (
                <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center text-2xl shadow-sm">
                  {agent.identityEmoji}
                </div>
              )}
              <div>
                <h2 className="text-lg font-semibold text-slate-900 tracking-tight">
                  {agent.identityName || agent.id}
                </h2>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-xs text-slate-500 font-mono">{instance.label}</span>
                  <span className="text-slate-300">&middot;</span>
                  <span className="text-xs text-slate-400 font-mono">{instance.ip}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {agent.model && (
                <span className="text-[11px] text-slate-400 font-mono bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
                  {agent.model}
                </span>
              )}
              <button
                onClick={() => setConfirmDelete(true)}
                disabled={deleteLoading}
                className="text-[11px] px-2 py-1 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40 transition-colors font-medium"
                title="Delete agent"
              >
                {deleteLoading ? 'Deleting...' : 'Delete'}
              </button>
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
          <button
            onClick={() => setViewMode('chat')}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300 transition-colors font-medium"
          >
            <span className="opacity-60">&#x2709;</span>
            Chat
          </button>
          <button
            onClick={() => setShowMigrate(true)}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300 transition-colors font-medium"
          >
            <span className="opacity-60">&#x21C4;</span>
            Migrate
          </button>
          <button
            onClick={() => setShowBindChannel(true)}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300 transition-colors font-medium"
          >
            <span className="opacity-60">#</span>
            Bind Channel
          </button>
          <button
            onClick={() => setShowApproveUser(true)}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300 transition-colors font-medium"
          >
            <span className="opacity-60">&#x2713;</span>
            Approve User
          </button>
        </div>
      </div>

      {/* Content area — split layout when file is open */}
      <div className="flex-1 flex min-h-0">
        {/* Left: workspace tree + health + errors */}
        <div className={`${activeFile ? 'w-72 border-r border-slate-200' : 'flex-1'} overflow-y-auto p-5 space-y-4 shrink-0 transition-all`}>
          {/* Error banner */}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Health card */}
          {health && (
            <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="px-4 py-2.5 border-b border-slate-100">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Health</h3>
              </div>
              <div className={`px-4 py-3 grid ${activeFile ? 'grid-cols-1' : 'grid-cols-2'} gap-3`}>
                <div>
                  <p className="text-[11px] text-slate-400 uppercase tracking-wider mb-0.5">Process</p>
                  <p className={`text-sm font-mono font-medium ${health.processRunning ? 'text-emerald-600' : 'text-red-500'}`}>
                    {health.processRunning ? 'Running' : 'Stopped'}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-400 uppercase tracking-wider mb-0.5">Agent Dir</p>
                  <p className={`text-sm font-mono ${health.exists ? 'text-slate-700' : 'text-red-500'}`}>
                    {health.exists ? 'Exists' : 'Missing'}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-400 uppercase tracking-wider mb-0.5">Dir Size</p>
                  <p className="text-sm font-mono text-slate-700">{health.dirSize}</p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-400 uppercase tracking-wider mb-0.5">Last Activity</p>
                  <p className="text-sm font-mono text-slate-700">
                    {health.lastActivity === 'never' ? 'Never' : new Date(health.lastActivity).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Workspace card */}
          <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Workspace</h3>
              {!activeFile && (
                <span className="text-[11px] text-slate-400 font-mono">{workspacePath}</span>
              )}
            </div>
            <div className="py-1.5 px-1">
              <DirectoryNode
                instanceId={instance.id}
                path={workspacePath}
                name={workspacePath.split('/').pop() || 'workspace'}
                type="directory"
                depth={0}
                onFileClick={(path, name) => {
                  setActiveFile({ path, name })
                }}
              />
            </div>
          </div>
        </div>

        {/* Right: file viewer (only when a file is selected) */}
        {activeFile && activeInstanceId && (
          <div className="flex-1 bg-white min-w-0">
            <InlineFileViewer
              key={activeFile.path}
              instanceId={activeInstanceId}
              path={activeFile.path}
              name={activeFile.name}
              onClose={() => setActiveFile(null)}
            />
          </div>
        )}
      </div>

      {showMigrate && instance && agent && (
        <MigrateDialog
          instanceId={instance.id}
          agentId={agent.id}
          onClose={() => setShowMigrate(false)}
        />
      )}

      {showBindChannel && instance && agent && (
        <BindChannelDialog
          instanceId={instance.id}
          agentId={agent.id}
          agentName={agent.identityName || agent.id}
          onClose={() => setShowBindChannel(false)}
        />
      )}

      {showApproveUser && instance && (
        <ApproveUserDialog
          instanceId={instance.id}
          onClose={() => setShowApproveUser(false)}
        />
      )}

      {confirmDelete && instance && agent && (
        <DeleteAgentDialog
          instanceId={instance.id}
          agentId={agent.id}
          onClose={() => setConfirmDelete(false)}
          onDeleted={async () => {
            setConfirmDelete(false)
            setDeleteLoading(true)
            try {
              const listRes = await fetch(`/api/instances/${instance.id}/agents`)
              const agents = listRes.ok ? await listRes.json() : []
              updateInstanceAgents(instance.id, agents)
              setActiveInstance(instance.id)
            } finally {
              setDeleteLoading(false)
            }
          }}
        />
      )}
    </div>
  )
}

function BindChannelDialog({ instanceId, agentId, agentName, onClose }: {
  instanceId: string
  agentId: string
  agentName: string
  onClose: () => void
}) {
  const [channels, setChannels] = useState<Record<string, string[]>>({})
  const [selected, setSelected] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Fetch available channels on mount
  useEffect(() => {
    fetch(`/api/instances/${instanceId}/channels/list`)
      .then(res => res.ok ? res.json() : { chat: {} })
      .then(data => {
        setChannels(data.chat || {})
        // Auto-select first available option
        const opts = buildOptions(data.chat || {})
        if (opts.length > 0) setSelected(opts[0].value)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [instanceId])

  // Build flat list of bindable options with separate channel + accountId
  function buildOptions(chat: Record<string, string[]>) {
    const opts: { value: string; label: string; channel: string; accountId?: string }[] = []
    for (const [type, accounts] of Object.entries(chat)) {
      for (const acct of accounts) {
        opts.push({
          value: acct === 'default' ? `${type}:default` : `${type}:${acct}`,
          label: acct === 'default' ? `${type} (default)` : `${type}: ${acct}`,
          channel: type,
          accountId: acct === 'default' ? undefined : acct,
        })
      }
    }
    return opts
  }

  const options = buildOptions(channels)
  const selectedOption = options.find(o => o.value === selected)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedOption) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/instances/${instanceId}/agents/${agentId}/bind-channel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: selectedOption.channel,
          accountId: selectedOption.accountId,
        }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.output || data.error || 'Failed to bind channel')
      setSuccess(true)
      setTimeout(onClose, 1200)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <h3 className="text-base font-semibold text-slate-900 mb-4">Bind Channel to {agentName}</h3>
        {success ? (
          <div className="text-sm text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2 border border-emerald-200">Channel bound successfully</div>
        ) : loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-400 py-4">
            <span className="inline-block w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
            Loading channels...
          </div>
        ) : options.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">No channels configured on this instance. Add a channel first from the instance view.</p>
            <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium transition-colors">
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Channel</label>
              <select
                value={selected}
                onChange={e => setSelected(e.target.value)}
                className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent bg-white"
              >
                {options.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <p className="text-[11px] text-slate-400 mt-1">Messages from this channel will be routed to {agentName}</p>
            </div>
            {error && (
              <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 border border-red-200">{error}</div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="text-sm px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={!selected || submitting} className="text-sm px-4 py-2 rounded-lg bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-40 font-medium transition-colors">
                {submitting ? 'Binding...' : 'Bind'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

function ApproveUserDialog({ instanceId, onClose }: {
  instanceId: string
  onClose: () => void
}) {
  const [channel, setChannel] = useState('telegram')
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/instances/${instanceId}/pairing/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, code: code.trim() }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.output || data.error || 'Failed to approve')
      setSuccess(true)
      setTimeout(onClose, 1500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <h3 className="text-base font-semibold text-slate-900 mb-2">Approve User</h3>
        <p className="text-xs text-slate-500 mb-4 leading-relaxed">
          To authorize a user, they must first message the bot on Telegram. OpenClaw will reply with a
          <strong> pairing code</strong>. Enter that code below to approve them.
        </p>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Channel</label>
            <select
              value={channel}
              onChange={e => setChannel(e.target.value)}
              className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
            >
              <option value="telegram">Telegram</option>
              <option value="discord">Discord</option>
              <option value="slack">Slack</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="signal">Signal</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Pairing Code</label>
            <input
              type="text"
              value={code}
              onChange={e => setCode(e.target.value)}
              placeholder="e.g. abc-123"
              className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
              autoFocus
            />
            <p className="text-xs text-slate-400 mt-1">
              The user receives this code when they message the bot for the first time.
            </p>
          </div>
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          {success && <p className="text-xs text-green-600 bg-green-50 border border-green-200 rounded-lg px-3 py-2">User approved successfully!</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="text-sm px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={!code.trim() || submitting} className="text-sm px-4 py-2 rounded-lg bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-40 font-medium transition-colors">
              {submitting ? 'Approving...' : 'Approve'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function DeleteAgentDialog({ instanceId, agentId, onClose, onDeleted }: {
  instanceId: string
  agentId: string
  onClose: () => void
  onDeleted: () => void
}) {
  const [typed, setTyped] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const matches = typed === agentId

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!matches) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/instances/${instanceId}/agents/${agentId}/delete`, { method: 'POST' })
      const data = await res.json()
      if (!data.success) throw new Error(data.output || data.error || 'Delete failed')
      onDeleted()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <h3 className="text-base font-semibold text-slate-900 mb-2">Delete Agent</h3>
        <p className="text-sm text-slate-600 mb-4">
          This will permanently delete <span className="font-mono font-semibold text-red-600">{agentId}</span> and prune its workspace. Type the agent name to confirm.
        </p>
        <form onSubmit={submit} className="space-y-4">
          <input
            type="text"
            value={typed}
            onChange={e => setTyped(e.target.value)}
            placeholder={agentId}
            className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent font-mono"
            autoFocus
          />
          {error && (
            <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 border border-red-200">{error}</div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="text-sm px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={!matches || submitting} className="text-sm px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 font-medium transition-colors">
              {submitting ? 'Deleting...' : 'Delete Agent'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
