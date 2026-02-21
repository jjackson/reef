'use client'

import { useState } from 'react'
import { useDashboard } from './context/DashboardContext'

interface Props {
  instanceId: string
  agentId: string
  onClose: () => void
}

export function MigrateDialog({ instanceId, agentId, onClose }: Props) {
  const { instances } = useDashboard()
  const [destinationId, setDestinationId] = useState('')
  const [deleteSource, setDeleteSource] = useState(false)
  const [migrating, setMigrating] = useState(false)
  const [result, setResult] = useState<{ success: boolean; error?: string } | null>(null)

  const otherInstances = instances.filter(i => i.id !== instanceId)

  async function migrate() {
    if (!destinationId) return
    setMigrating(true)
    setResult(null)
    try {
      const res = await fetch(`/api/instances/${instanceId}/agents/${agentId}/migrate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destinationId, deleteSource }),
      })
      const data = await res.json()
      setResult({ success: res.ok, error: data.error })
    } catch (e) {
      setResult({ success: false, error: e instanceof Error ? e.message : 'Unknown error' })
    } finally {
      setMigrating(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Migrate {agentId}</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">From</label>
            <div className="text-sm font-mono text-gray-800 bg-gray-50 rounded px-3 py-2">
              {instanceId}
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">To</label>
            <select
              value={destinationId}
              onChange={(e) => setDestinationId(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select destination...</option>
              {otherInstances.map(inst => (
                <option key={inst.id} value={inst.id}>
                  {inst.label} ({inst.ip})
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={deleteSource}
              onChange={(e) => setDeleteSource(e.target.checked)}
              className="rounded border-gray-300"
            />
            Delete from source after successful migration
          </label>

          {result && (
            <div className={`text-sm rounded px-3 py-2 ${result.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {result.success ? 'Migration successful!' : `Failed: ${result.error}`}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="text-sm px-4 py-2 rounded bg-gray-100 text-gray-700 hover:bg-gray-200 font-medium"
          >
            {result?.success ? 'Done' : 'Cancel'}
          </button>
          {!result?.success && (
            <button
              onClick={migrate}
              disabled={!destinationId || migrating}
              className="text-sm px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 font-medium"
            >
              {migrating ? 'Migrating...' : 'Migrate'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
