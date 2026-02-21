'use client'

import { useEffect, useState } from 'react'
import { MachineRow } from './components/MachineRow'

interface Instance {
  id: string
  label: string
  ip: string
}

export default function DashboardPage() {
  const [instances, setInstances] = useState<Instance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/instances')
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Failed to fetch instances')
        }
        return res.json()
      })
      .then(setInstances)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">reef</h1>
          <p className="text-sm text-gray-500">OpenClaw instance management</p>
        </div>

        {loading && (
          <div className="text-sm text-gray-500 bg-white border border-gray-200 rounded-lg p-6">
            Loading instances...
          </div>
        )}

        {error && (
          <div className="text-sm text-red-600 bg-white border border-red-200 rounded-lg p-6">
            {error}
          </div>
        )}

        {!loading && !error && instances.length === 0 && (
          <div className="text-sm text-gray-500 bg-white border border-gray-200 rounded-lg p-6">
            No instances found. Check that:
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li><code>.env.local</code> has <code>OP_SERVICE_ACCOUNT_TOKEN</code> and <code>DO_API_TOKEN_OP_REF</code></li>
              <li>Your Digital Ocean droplets are tagged <code>openclaw</code></li>
              <li>Droplet names are mapped in <code>config/name-map.json</code></li>
            </ul>
          </div>
        )}

        {instances.length > 0 && (
          <div className="space-y-3">
            {instances.map((instance) => (
              <MachineRow key={instance.id} instance={instance} />
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
