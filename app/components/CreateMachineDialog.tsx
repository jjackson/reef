'use client'

import { useState, useEffect } from 'react'

interface Region {
  slug: string
  name: string
}

interface Size {
  slug: string
  memory: number
  vcpus: number
  disk: number
  price_monthly: number
}

interface SshKeyItem {
  id: string
  title: string
}

interface CreateResult {
  success: boolean
  dropletName?: string
  dropletId?: number
  ip?: string
  error?: string
}

function formatSize(s: Size): string {
  const ram = s.memory >= 1024 ? `${s.memory / 1024}GB` : `${s.memory}MB`
  return `${s.vcpus} vCPU, ${ram} RAM, ${s.disk}GB SSD — $${s.price_monthly}/mo`
}

export function CreateMachineDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [region, setRegion] = useState('')
  const [size, setSize] = useState('')
  const [sshMode, setSshMode] = useState<'existing' | 'generate'>('existing')
  const [sshKeyTitle, setSshKeyTitle] = useState('')
  const [accountId, setAccountId] = useState('')
  const [accounts, setAccounts] = useState<{id: string, label: string}[]>([])

  const [regions, setRegions] = useState<Region[]>([])
  const [sizes, setSizes] = useState<Size[]>([])
  const [sshKeys, setSshKeys] = useState<SshKeyItem[]>([])

  const [loadingRegions, setLoadingRegions] = useState(true)
  const [loadingSizes, setLoadingSizes] = useState(false)
  const [loadingKeys, setLoadingKeys] = useState(true)

  const [creating, setCreating] = useState(false)
  const [result, setResult] = useState<CreateResult | null>(null)

  const nameValid = /openclaw|open-claw/i.test(name)

  // Load accounts + SSH keys on mount
  useEffect(() => {
    setLoadingRegions(false)

    fetch('/api/accounts')
      .then(r => r.json())
      .then(data => {
        const accts = data.accounts || []
        setAccounts(accts)
        if (accts.length === 1) setAccountId(accts[0].id)
      })
      .catch(() => {})

    fetch('/api/ssh-keys')
      .then(r => r.json())
      .then(data => setSshKeys(data.keys || []))
      .catch(() => {})
      .finally(() => setLoadingKeys(false))
  }, [])

  // Reload regions when account changes
  useEffect(() => {
    if (!accountId) { setRegions([]); return }
    setLoadingRegions(true)
    setRegion('')
    fetch(`/api/regions?account=${accountId}`)
      .then(r => r.json())
      .then(data => setRegions(data.regions || []))
      .catch(() => {})
      .finally(() => setLoadingRegions(false))
  }, [accountId])

  // Reload sizes when region changes
  useEffect(() => {
    if (!region || !accountId) { setSizes([]); return }
    setLoadingSizes(true)
    setSize('')
    fetch(`/api/sizes?region=${region}&account=${accountId}`)
      .then(r => r.json())
      .then(data => setSizes(data.sizes || []))
      .catch(() => {})
      .finally(() => setLoadingSizes(false))
  }, [region, accountId])

  async function handleCreate() {
    setCreating(true)
    setResult(null)
    try {
      const res = await fetch('/api/create-machine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          region,
          size,
          accountId,
          ...(sshMode === 'existing' ? { sshKeyTitle } : { generateKey: true }),
        }),
      })
      const data = await res.json()
      setResult(data)
      if (data.success) onCreated()
    } catch (e) {
      setResult({ success: false, error: e instanceof Error ? e.message : 'Unknown error' })
    } finally {
      setCreating(false)
    }
  }

  const canSubmit = name && nameValid && region && size && accountId &&
    (sshMode === 'generate' || sshKeyTitle) && !creating

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-900">Create Machine</h3>
          <p className="text-sm text-gray-500 mt-0.5">Provision a new OpenClaw droplet</p>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Account */}
          {accounts.length > 1 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Account</label>
              <select
                value={accountId}
                onChange={e => setAccountId(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select account...</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>{a.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Droplet Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="openclaw-mybot"
              className={`w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                name && !nameValid ? 'border-red-300 bg-red-50' : 'border-gray-200'
              }`}
            />
            {name && !nameValid && (
              <p className="text-xs text-red-500 mt-1">Name must contain &quot;openclaw&quot; or &quot;open-claw&quot;</p>
            )}
          </div>

          {/* Region */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Region</label>
            {loadingRegions ? (
              <div className="text-sm text-gray-400 py-2">Loading regions...</div>
            ) : (
              <select
                value={region}
                onChange={e => setRegion(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select region...</option>
                {regions.map(r => (
                  <option key={r.slug} value={r.slug}>{r.slug} — {r.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Size */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Size</label>
            {!region ? (
              <div className="text-sm text-gray-400 py-2">Select a region first</div>
            ) : loadingSizes ? (
              <div className="text-sm text-gray-400 py-2">Loading sizes...</div>
            ) : (
              <select
                value={size}
                onChange={e => setSize(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select size...</option>
                {sizes.map(s => (
                  <option key={s.slug} value={s.slug}>{s.slug} — {formatSize(s)}</option>
                ))}
              </select>
            )}
          </div>

          {/* SSH Key */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">SSH Key</label>
            <div className="flex gap-4 mb-2">
              <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                <input
                  type="radio"
                  name="sshMode"
                  checked={sshMode === 'existing'}
                  onChange={() => setSshMode('existing')}
                  className="text-blue-600"
                />
                Use existing
              </label>
              <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                <input
                  type="radio"
                  name="sshMode"
                  checked={sshMode === 'generate'}
                  onChange={() => setSshMode('generate')}
                  className="text-blue-600"
                />
                Generate new
              </label>
            </div>
            {sshMode === 'existing' && (
              loadingKeys ? (
                <div className="text-sm text-gray-400 py-2">Loading keys...</div>
              ) : (
                <select
                  value={sshKeyTitle}
                  onChange={e => setSshKeyTitle(e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select key...</option>
                  {sshKeys.map(k => (
                    <option key={k.id} value={k.title}>{k.title}</option>
                  ))}
                </select>
              )
            )}
            {sshMode === 'generate' && (
              <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                A new ed25519 keypair will be generated and stored in 1Password.
              </p>
            )}
          </div>

          {/* Result */}
          {result && (
            <div className={`text-sm rounded-lg px-4 py-3 ${
              result.success
                ? 'bg-green-50 text-green-800 border border-green-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {result.success ? (
                <div>
                  <p className="font-medium">Droplet created successfully!</p>
                  <p className="mt-1 font-mono text-xs">
                    {result.dropletName} — {result.ip}
                  </p>
                </div>
              ) : (
                <p>Failed: {result.error}</p>
              )}
            </div>
          )}

          {/* Creating spinner */}
          {creating && (
            <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 rounded-lg px-4 py-3 border border-blue-200">
              <span className="spinner" />
              Creating droplet and waiting for IP... This may take up to 2 minutes.
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="text-sm px-4 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 font-medium"
          >
            {result?.success ? 'Done' : 'Cancel'}
          </button>
          {!result?.success && (
            <button
              onClick={handleCreate}
              disabled={!canSubmit}
              className="text-sm px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 font-medium"
            >
              {creating ? 'Creating...' : 'Create Droplet'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
