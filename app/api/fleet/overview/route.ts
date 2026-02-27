import { NextResponse } from 'next/server'
import { listInstances, resolveInstance } from '@/lib/instances'
import { listAgents, listChannels, getAgentHealth } from '@/lib/openclaw'
import { runCommand, SshConfig } from '@/lib/ssh'

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

interface FleetOverviewResponse {
  agents: FleetAgentRow[]
  instances: FleetInstanceInfo[]
}

interface Binding {
  match: { channel?: string; accountId?: string }
  agentId: string
}

async function getBindings(config: SshConfig): Promise<Binding[]> {
  const result = await runCommand(config, 'openclaw config get bindings --json 2>/dev/null || echo "[]"')
  try {
    return JSON.parse(result.stdout.trim())
  } catch {
    return []
  }
}

async function getInstanceDiagnostics(config: SshConfig): Promise<{
  gogAccounts: string[]
  pubsubEndpoint: string
  tailscaleFunnel: string
  gcpProject: string
  activeGmailWatches: string[]
}> {
  const [gogResult, pubsubResult, funnelResult, projectResult, watchResult, versionResult] = await Promise.all([
    runCommand(config, 'GOG_KEYRING_PASSWORD=openclaw gog auth list 2>/dev/null || true'),
    runCommand(config, "gcloud pubsub subscriptions list --format='value(pushConfig.pushEndpoint)' 2>/dev/null || true"),
    runCommand(config, "tailscale funnel status 2>&1 | grep 'https://' | head -1 || true"),
    runCommand(config, 'cat /root/.config/gogcli/gcp-project 2>/dev/null || gcloud config get-value project 2>/dev/null || echo "none"'),
    runCommand(config, "journalctl --user -u openclaw-gateway --no-pager -n 200 2>/dev/null | grep 'gmail-watcher.*watch started for' | awk '{print $NF}' | sort -u || true"),
    runCommand(config, 'openclaw --version 2>/dev/null || echo "unknown"'),
  ])

  const gogAccounts = gogResult.stdout.trim().split('\n')
    .filter(Boolean)
    .map(line => line.split('\t')[0])

  const pubsubEndpoint = pubsubResult.stdout.trim() || 'none'

  // Extract the tailscale hostname from funnel status
  const funnelMatch = funnelResult.stdout.match(/https:\/\/([^\s/]+)/)
  const tailscaleFunnel = funnelMatch ? funnelMatch[1] : 'none'

  const gcpProject = projectResult.stdout.trim() || 'none'

  const activeGmailWatches = watchResult.stdout.trim().split('\n').filter(Boolean)

  const openclawVersion = versionResult.stdout.trim() || 'unknown'

  return { gogAccounts, pubsubEndpoint, tailscaleFunnel, gcpProject, activeGmailWatches, openclawVersion }
}

export async function GET() {
  try {
    const instances = await listInstances()

    const allAgentRows: FleetAgentRow[] = []
    const allInstanceInfo: FleetInstanceInfo[] = []

    const instanceResults = await Promise.allSettled(
      instances.map(async (inst) => {
        const resolved = await resolveInstance(inst.id)
        if (!resolved) return { agents: [] as FleetAgentRow[], info: null }

        const config: SshConfig = { host: resolved.ip, privateKey: resolved.sshKey }

        const [agents, channels, bindings, diagnostics] = await Promise.all([
          listAgents(config),
          listChannels(config),
          getBindings(config),
          getInstanceDiagnostics(config),
        ])

        // Get workspace sizes and auth-profile checks for all agents in parallel
        const [healthResults, apiKeyResults] = await Promise.all([
          Promise.allSettled(
            agents.map((agent) => getAgentHealth(config, agent.id))
          ),
          Promise.allSettled(
            agents.map((agent) =>
              runCommand(config, `cat ~/.openclaw/agents/${agent.id}/agent/auth-profiles.json 2>/dev/null || echo "MISSING"`)
                .then((r) => {
                  const out = r.stdout.trim()
                  if (out === 'MISSING') return false
                  try {
                    const parsed = JSON.parse(out)
                    return !!(parsed.profiles && Object.keys(parsed.profiles).length > 0)
                  } catch {
                    return false
                  }
                })
            )
          ),
        ])

        // Build reverse map: agentId → channels from bindings
        const agentChannels = new Map<string, string[]>()
        for (const binding of bindings) {
          const ch = binding.match?.channel
          const acct = binding.match?.accountId
          const agentId = binding.agentId
          if (!ch || !agentId) continue

          const label = acct ? `${ch}:${acct}` : ch
          const existing = agentChannels.get(agentId) || []
          existing.push(label)
          agentChannels.set(agentId, existing)
        }

        // For agents with no bindings, check if there are unbound channels
        if (agents.length > 0) {
          const boundChannelKeys = new Set(
            bindings.map((b) => `${b.match?.channel}:${b.match?.accountId || ''}`)
          )
          for (const [chType, accounts] of Object.entries(channels.chat)) {
            for (const acct of accounts) {
              const key = `${chType}:${acct}`
              if (!boundChannelKeys.has(key)) {
                const defaultAgent = agents.find((a) => a.isDefault) || agents[0]
                const label = `${chType}:${acct}`
                const existing = agentChannels.get(defaultAgent.id) || []
                if (!existing.includes(label)) {
                  existing.push(label)
                  agentChannels.set(defaultAgent.id, existing)
                }
              }
            }
          }
        }

        const agentRows = agents.map((agent, i): FleetAgentRow => {
          const health = healthResults[i]
          const size = health.status === 'fulfilled' ? health.value.dirSize : '?'
          const apiKey = apiKeyResults[i]
          const hasApiKey = apiKey.status === 'fulfilled' ? apiKey.value : false
          const chs = agentChannels.get(agent.id) || []
          // Check if the gmail account in this agent's binding has an active watcher
          const gmailChannel = chs.find(c => c.startsWith('gmail:'))
          const gmailAccount = gmailChannel?.split(':').slice(1).join(':') || ''
          return {
            instance: inst.id,
            agentId: agent.id,
            agentName: agent.identityName || (agent as any).name || agent.id,
            agentEmoji: agent.identityEmoji || '',
            channels: chs,
            workspaceSize: size,
            hasApiKey,
            hasGmailBinding: !!gmailChannel,
            gmailWatchActive: !!gmailAccount && diagnostics.activeGmailWatches.includes(gmailAccount),
            hasTelegramBinding: chs.some(c => c.startsWith('telegram:')),
          }
        })

        const info: FleetInstanceInfo = {
          instance: inst.id,
          openclawVersion: diagnostics.openclawVersion,
          gogAccounts: diagnostics.gogAccounts,
          pubsubEndpoint: diagnostics.pubsubEndpoint,
          tailscaleFunnel: diagnostics.tailscaleFunnel,
          gcpProject: diagnostics.gcpProject,
          activeGmailWatches: diagnostics.activeGmailWatches,
        }

        return { agents: agentRows, info }
      })
    )

    for (const result of instanceResults) {
      if (result.status === 'fulfilled' && result.value) {
        allAgentRows.push(...result.value.agents)
        if (result.value.info) {
          allInstanceInfo.push(result.value.info)
        }
      }
    }

    const response: FleetOverviewResponse = {
      agents: allAgentRows,
      instances: allInstanceInfo,
    }

    return NextResponse.json(response)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
