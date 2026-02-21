import { runCommand, SshConfig } from './ssh'

export interface HealthResult {
  processRunning: boolean
  disk: string
  memory: string
  uptime: string
}

export interface FileEntry {
  name: string
  type: 'file' | 'directory'
}

/**
 * Checks the health of an OpenClaw instance via SSH.
 * Runs four commands in parallel: process check, disk, memory, uptime.
 */
export async function getHealth(config: SshConfig): Promise<HealthResult> {
  const [processResult, diskResult, memResult, uptimeResult] = await Promise.all([
    runCommand(
      config,
      'systemctl is-active openclaw 2>/dev/null || (pgrep -x openclaw > /dev/null && echo active || echo inactive)'
    ),
    runCommand(config, 'df -h / | tail -1'),
    runCommand(config, 'free -h | grep Mem'),
    runCommand(config, 'uptime -p'),
  ])

  return {
    processRunning: processResult.stdout.trim() === 'active',
    disk: diskResult.stdout.trim(),
    memory: memResult.stdout.trim(),
    uptime: uptimeResult.stdout.trim(),
  }
}

/**
 * Lists the agents on this machine by reading ~/.openclaw/agents/.
 * Each subdirectory is an agent.
 */
export async function listAgents(config: SshConfig): Promise<string[]> {
  const result = await runCommand(
    config,
    'ls -1 ~/.openclaw/agents/ 2>/dev/null || true'
  )
  return result.stdout.trim().split('\n').filter(Boolean)
}

/**
 * Lists the contents of any path under ~/.openclaw/, distinguishing
 * files from directories. Uses `ls -1p` (trailing slash on directories).
 */
export async function listDirectory(
  config: SshConfig,
  remotePath: string
): Promise<FileEntry[]> {
  const result = await runCommand(
    config,
    `ls -1p "${remotePath}" 2>/dev/null || true`
  )
  return result.stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((name) => ({
      name: name.replace(/\/$/, ''),
      type: (name.endsWith('/') ? 'directory' : 'file') as 'file' | 'directory',
    }))
}

/**
 * Runs OpenClaw's built-in hygiene/security check via SSH CLI.
 *
 * TODO: Confirm the exact OpenClaw CLI command for hygiene/security checks.
 *       Current placeholder: `openclaw check`
 */
export async function runHygieneCheck(config: SshConfig): Promise<string> {
  const result = await runCommand(
    config,
    'openclaw check 2>&1 || echo "[reef] openclaw check command not found — update lib/openclaw.ts"'
  )
  return result.stdout + result.stderr
}

/**
 * Sends a message to a specific OpenClaw agent by SSH-ing in and
 * curl-ing the local OpenClaw HTTP API with the agent ID.
 *
 * TODO: Confirm OpenClaw's local HTTP API port and endpoint.
 *       Current placeholder: localhost:3000/api/chat with { message, agent } body.
 * TODO: Confirm how OpenClaw routes to a specific agent (agent param? separate port per agent?).
 */
export async function sendChatMessage(
  config: SshConfig,
  agentId: string,
  message: string
): Promise<string> {
  const OPENCLAW_PORT = 3000 // TODO: confirm actual port
  const escaped = message.replace(/\\/g, '\\\\').replace(/'/g, "'\\''")

  const result = await runCommand(
    config,
    `curl -s -X POST http://localhost:${OPENCLAW_PORT}/api/chat ` +
    `-H 'Content-Type: application/json' ` +
    `-d '{"message": "${escaped}", "agent": "${agentId}"}' 2>&1`
  )
  return result.stdout
}
