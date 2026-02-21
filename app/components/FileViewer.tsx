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
