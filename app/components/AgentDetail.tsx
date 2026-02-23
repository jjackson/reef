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
  const { instances, activeInstanceId, activeAgentId, activeFile, setActiveFile, setViewMode } = useDashboard()
  const [health, setHealth] = useState<HealthResult | null>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showMigrate, setShowMigrate] = useState(false)

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
            {agent.model && (
              <span className="text-[11px] text-slate-400 font-mono bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
                {agent.model}
              </span>
            )}
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
    </div>
  )
}
