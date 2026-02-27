'use client'

import { useState } from 'react'
import { useDashboard } from './context/DashboardContext'
import { CreateMachineDialog } from './CreateMachineDialog'

interface FleetAgentRow {
  instance: string
  agentId: string
  agentName: string
  agentEmoji: string
  channels: string[]
  workspaceSize: string
  hasApiKey: boolean
  hasGmailBinding: boolean
  gmailWatchActive: boolean
  hasTelegramBinding: boolean
}

interface FleetInstanceInfo {
  instance: string
  openclawVersion: string
  gogAccounts: string[]
  pubsubEndpoint: string
  tailscaleFunnel: string
  gcpProject: string
  activeGmailWatches: string[]
}

interface FleetData {
  agents: FleetAgentRow[]
  instances: FleetInstanceInfo[]
}

function StatusDot({ status, title }: { status: 'ok' | 'warn' | 'error' | 'off'; title: string }) {
  const colors = {
    ok: 'bg-green-400',
    warn: 'bg-yellow-400',
    error: 'bg-red-400',
    off: 'bg-gray-300',
  }
  return (
    <span
      title={title}
      className={`inline-block w-2 h-2 rounded-full ${colors[status]}`}
    />
  )
}

export function HomePanel() {
  const { accounts, instances, setInstances } = useDashboard()
  const [showCreate, setShowCreate] = useState(false)
  const [fleetData, setFleetData] = useState<FleetData | null>(null)
  const [fleetLoading, setFleetLoading] = useState(false)
  const [fleetError, setFleetError] = useState<string | null>(null)

  async function refreshInstances() {
    try {
      const res = await fetch('/api/instances')
      if (res.ok) {
        const data = await res.json()
        setInstances(data.map((inst: any) => ({
          ...inst,
          agents: instances.find(i => i.id === inst.id)?.agents || [],
        })))
      }
    } catch {}
  }

  async function fetchFleetOverview() {
    setFleetLoading(true)
    setFleetError(null)
    try {
      const res = await fetch('/api/fleet/overview')
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      setFleetData(await res.json())
    } catch (err) {
      setFleetError(err instanceof Error ? err.message : 'Failed to fetch fleet overview')
    } finally {
      setFleetLoading(false)
    }
  }

  // Check if a pubsub endpoint matches the instance's tailscale funnel
  function pubsubMatchesFunnel(info: FleetInstanceInfo): boolean {
    if (!info.pubsubEndpoint || info.pubsubEndpoint === 'none') return false
    if (!info.tailscaleFunnel || info.tailscaleFunnel === 'none') return false
    return info.pubsubEndpoint.includes(info.tailscaleFunnel)
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">reef</h1>
          <p className="text-sm text-gray-500 mt-1">OpenClaw Fleet Management</p>
        </div>

        {/* Stats */}
        <div className={`grid ${accounts.length > 1 ? 'grid-cols-3' : 'grid-cols-2'} gap-4 mb-8`}>
          {accounts.length > 1 && (
            <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
              <div className="text-2xl font-bold text-gray-900">{accounts.length}</div>
              <div className="text-xs text-gray-500 mt-0.5">Accounts</div>
            </div>
          )}
          <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
            <div className="text-2xl font-bold text-gray-900">{instances.length}</div>
            <div className="text-xs text-gray-500 mt-0.5">Machines</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
            <div className="text-2xl font-bold text-blue-600">{instances.filter(i => i.ip).length}</div>
            <div className="text-xs text-gray-500 mt-0.5">Online</div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 mb-8">
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <span className="text-lg leading-none">+</span>
            Create Machine
          </button>
          <button
            onClick={fetchFleetOverview}
            disabled={fleetLoading}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-slate-700 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-50 transition-colors"
          >
            {fleetLoading ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Loading...
              </>
            ) : (
              'Fleet Overview'
            )}
          </button>
        </div>

        {/* Fleet Overview */}
        {fleetError && (
          <div className="mb-8 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {fleetError}
          </div>
        )}

        {fleetData && (
          <>
            {/* Instance Health */}
            <div className="mb-6">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Instance Health</h2>
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Instance</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Version</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">GCP Project</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">GOG Accounts</th>
                      <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Funnel</th>
                      <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Pub/Sub</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {fleetData.instances.map((info) => {
                      const funnelOk = info.tailscaleFunnel !== 'none'
                      const pubsubOk = pubsubMatchesFunnel(info)
                      return (
                        <tr key={info.instance} className="hover:bg-gray-50">
                          <td className="px-4 py-2.5 font-mono text-xs text-gray-600">{info.instance}</td>
                          <td className="px-4 py-2.5 font-mono text-xs text-gray-600">{info.openclawVersion}</td>
                          <td className="px-4 py-2.5 font-mono text-xs text-gray-600">{info.gcpProject}</td>
                          <td className="px-4 py-2.5">
                            <div className="flex flex-wrap gap-1">
                              {info.gogAccounts.map((acct) => (
                                <span key={acct} className="inline-block px-2 py-0.5 rounded-full bg-blue-50 text-xs text-blue-700 font-mono">
                                  {acct}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <StatusDot status={funnelOk ? 'ok' : 'error'} title={funnelOk ? info.tailscaleFunnel : 'No Tailscale Funnel detected'} />
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <StatusDot
                              status={pubsubOk ? 'ok' : 'error'}
                              title={pubsubOk
                                ? `Pub/Sub pushes to ${info.tailscaleFunnel}`
                                : info.pubsubEndpoint === 'none'
                                  ? 'No Pub/Sub subscription found'
                                  : `Pub/Sub points to ${info.pubsubEndpoint} but Funnel is ${info.tailscaleFunnel}`
                              }
                            />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Agent Table */}
            <div className="mb-8">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Agents</h2>
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Instance</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Agent</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Channels</th>
                      <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">API Key</th>
                      <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Gmail</th>
                      <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Telegram</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Workspace</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {fleetData.agents.map((row) => (
                      <tr key={`${row.instance}:${row.agentId}`} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-600">{row.instance}</td>
                        <td className="px-4 py-2.5">
                          {row.agentEmoji && <span className="mr-1.5">{row.agentEmoji}</span>}
                          <span className="text-gray-900">{row.agentName}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          {row.channels.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {row.channels.map((ch) => (
                                <span
                                  key={ch}
                                  className="inline-block px-2 py-0.5 rounded-full bg-slate-100 text-xs text-slate-600 font-mono"
                                >
                                  {ch}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-gray-300">&mdash;</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <StatusDot
                            status={row.hasApiKey ? 'ok' : 'error'}
                            title={row.hasApiKey ? 'API key configured' : 'Missing auth-profiles.json — agent cannot call LLM'}
                          />
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <StatusDot
                            status={
                              row.hasGmailBinding && row.gmailWatchActive ? 'ok' :
                              row.hasGmailBinding ? 'warn' :
                              'off'
                            }
                            title={
                              row.hasGmailBinding && row.gmailWatchActive ? 'Gmail bound + watcher active' :
                              row.hasGmailBinding ? 'Gmail binding exists but no active watcher — run Setup Email' :
                              'No Gmail binding'
                            }
                          />
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <StatusDot status={row.hasTelegramBinding ? 'ok' : 'off'} title={row.hasTelegramBinding ? 'Telegram binding configured' : 'No Telegram binding'} />
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs text-gray-600">{row.workspaceSize}</td>
                      </tr>
                    ))}
                    {fleetData.agents.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-6 text-center text-gray-400 text-sm">
                          No agents found across instances
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* Instance list */}
        {instances.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Instances</h2>
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              {instances.map(inst => (
                <div key={inst.id} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-gray-900">{inst.label}</div>
                    <div className="text-xs text-gray-400 font-mono mt-0.5">{inst.ip}</div>
                  </div>
                  <div className="text-xs text-gray-500">
                    {inst.agents.length > 0 ? `${inst.agents.length} agent${inst.agents.length !== 1 ? 's' : ''}` : '—'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showCreate && (
        <CreateMachineDialog
          onClose={() => setShowCreate(false)}
          onCreated={refreshInstances}
        />
      )}
    </div>
  )
}
