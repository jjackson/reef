'use client'

import { useState, useEffect, useCallback } from 'react'

interface Props {
  instanceId: string
  path: string
  onClose: () => void
}

export function FileViewer({ instanceId, path, onClose }: Props) {
  const [content, setContent] = useState<string | null>(null)
  const [size, setSize] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [confirmSave, setConfirmSave] = useState(false)

  const fetchContent = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/instances/${instanceId}/browse/read?path=${encodeURIComponent(path)}`
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setContent(data.content)
      setSize(data.size)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load file')
    } finally {
      setLoading(false)
    }
  }, [instanceId, path])

  useEffect(() => {
    fetchContent()
  }, [fetchContent])

  function startEditing() {
    setEditContent(content ?? '')
    setEditing(true)
    setSaveError(null)
    setConfirmSave(false)
  }

  function cancelEditing() {
    setEditing(false)
    setConfirmSave(false)
    setSaveError(null)
  }

  async function handleSave() {
    if (!confirmSave) {
      setConfirmSave(true)
      return
    }

    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch(`/api/instances/${instanceId}/browse/write`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, content: editContent }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)

      // Update displayed content and exit edit mode
      setContent(editContent)
      setSize(new TextEncoder().encode(editContent).length)
      setEditing(false)
      setConfirmSave(false)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save file')
      setConfirmSave(false)
    } finally {
      setSaving(false)
    }
  }

  // Extract filename from path for display
  const fileName = path.split('/').pop() || path

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-gray-900 truncate">{fileName}</h2>
            <p className="text-xs text-gray-500 font-mono truncate">{path}</p>
            {size !== null && (
              <p className="text-xs text-gray-400">{size.toLocaleString()} bytes</p>
            )}
          </div>
          <div className="flex items-center gap-2 ml-4">
            {!editing && !loading && !error && (
              <button
                onClick={startEditing}
                className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium"
              >
                Edit
              </button>
            )}
            <button
              onClick={onClose}
              className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 font-medium"
            >
              Close
            </button>
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-auto p-4 bg-gray-50">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <span className="text-sm text-gray-500">Loading file...</span>
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center py-12">
              <span className="text-sm text-red-600">{error}</span>
            </div>
          )}

          {!loading && !error && !editing && (
            <pre className="text-sm text-gray-800 font-mono whitespace-pre-wrap break-words">
              {content}
            </pre>
          )}

          {editing && (
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full h-full min-h-[300px] text-sm font-mono text-gray-800 bg-white border border-gray-300 rounded p-3 resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              spellCheck={false}
            />
          )}
        </div>

        {/* Edit mode footer */}
        {editing && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-white">
            <div>
              {saveError && (
                <span className="text-xs text-red-600">{saveError}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={cancelEditing}
                disabled={saving}
                className="text-xs px-3 py-1.5 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 font-medium disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className={`text-xs px-3 py-1.5 rounded font-medium disabled:opacity-50 ${
                  confirmSave
                    ? 'bg-red-50 text-red-700 hover:bg-red-100'
                    : 'bg-green-50 text-green-700 hover:bg-green-100'
                }`}
              >
                {saving
                  ? 'Saving...'
                  : confirmSave
                  ? 'Confirm Save?'
                  : 'Save'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
