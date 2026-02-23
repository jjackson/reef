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

export interface AgentInfo {
  id: string
  identityName: string
  identityEmoji: string
  workspace: string
  agentDir: string
  model: string
  isDefault: boolean
}

export interface ChatResponse {
  reply: string
  agentId: string
  model: string
  sessionId: string
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
 * Lists agents via `openclaw agents list --json`.
 * Falls back to directory listing if the CLI command isn't available.
 */
export async function listAgents(config: SshConfig): Promise<AgentInfo[]> {
  const result = await runCommand(
    config,
    'openclaw agents list --json 2>/dev/null'
  )

  const output = result.stdout.trim()
  if (output.startsWith('[')) {
    try {
      return JSON.parse(output) as AgentInfo[]
    } catch {
      // fall through to fallback
    }
  }

  // Fallback: ls-based discovery (no identity info available)
  const fallback = await runCommand(
    config,
    'ls -1 ~/.openclaw/agents/ 2>/dev/null || true'
  )
  return fallback.stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((id) => ({
      id,
      identityName: id,
      identityEmoji: '',
      workspace: '',
      agentDir: `~/.openclaw/agents/${id}`,
      model: '',
      isDefault: false,
    }))
}

/**
 * Lists the contents of any path under ~/.openclaw/, distinguishing
 * files from directories. Uses `ls -1p` (trailing slash on directories).
 */
export async function listDirectory(
  config: SshConfig,
  remotePath: string
): Promise<FileEntry[]> {
  // Expand ~ to $HOME so tilde works inside quotes (bash doesn't expand ~ in quotes)
  const safePath = remotePath.replace(/^~/, '$HOME')
  const result = await runCommand(
    config,
    `ls -1p "${safePath}" 2>/dev/null || true`
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
 * Sends a message to a specific OpenClaw agent via the CLI over SSH.
 *
 * Uses `openclaw agent --agent <id> -m "message" --json` which works
 * regardless of whether the Gateway HTTP API is enabled. The CLI falls
 * back to the embedded local runtime if the Gateway is unreachable.
 *
 * Alternative approach (requires gateway config):
 *   POST http://127.0.0.1:18789/v1/chat/completions
 *   with model: "openclaw:<agentId>" and Authorization: Bearer <token>
 */
export async function sendChatMessage(
  config: SshConfig,
  agentId: string,
  message: string
): Promise<ChatResponse> {
  const escaped = message.replace(/\\/g, '\\\\').replace(/'/g, "'\\''")

  const result = await runCommand(
    config,
    `openclaw agent --agent '${agentId}' -m '${escaped}' --json 2>&1`
  )

  const output = result.stdout.trim()

  // Try to parse structured JSON response
  if (output.startsWith('{')) {
    try {
      const parsed = JSON.parse(output)
      return {
        reply: parsed.reply ?? parsed.content ?? parsed.message ?? '',
        agentId: parsed.agentId ?? agentId,
        model: parsed.model ?? '',
        sessionId: parsed.sessionId ?? '',
      }
    } catch {
      // fall through to plain text
    }
  }

  // Fallback: treat entire output as plain text reply
  return {
    reply: output || result.stderr || '(no response)',
    agentId,
    model: '',
    sessionId: '',
  }
}

export interface AgentHealthResult {
  exists: boolean
  dirSize: string
  lastActivity: string
  processRunning: boolean
}

export interface AgentHygieneResult {
  errorCount: number
  staleFileCount: number
  dirSize: string
}

/**
 * Checks the health of a specific agent by examining its directory,
 * size, last activity, and whether a process is running for it.
 */
export async function getAgentHealth(
  config: SshConfig,
  agentId: string
): Promise<AgentHealthResult> {
  const agentDir = `~/.openclaw/agents/${agentId}`
  const safeDir = agentDir.replace(/^~/, '$HOME')

  const [existsResult, sizeResult, activityResult, processResult] = await Promise.all([
    runCommand(config, `test -d ${safeDir} && echo "exists" || echo "missing"`),
    runCommand(config, `du -sh ${safeDir} 2>/dev/null | cut -f1 || echo "0"`),
    runCommand(config, `find ${safeDir} -type f -printf '%T@\\n' 2>/dev/null | sort -n | tail -1 || echo "0"`),
    runCommand(config, `pgrep -f "${agentId}" > /dev/null 2>&1 && echo "running" || echo "stopped"`),
  ])

  const lastEpoch = parseFloat(activityResult.stdout.trim()) || 0
  const lastActivity = lastEpoch > 0
    ? new Date(lastEpoch * 1000).toISOString()
    : 'never'

  return {
    exists: existsResult.stdout.trim() === 'exists',
    dirSize: sizeResult.stdout.trim(),
    lastActivity,
    processRunning: processResult.stdout.trim() === 'running',
  }
}

/**
 * Runs hygiene checks on a specific agent: error counts in logs,
 * stale files, and directory size.
 */
export async function runAgentHygieneCheck(
  config: SshConfig,
  agentId: string
): Promise<AgentHygieneResult> {
  const agentDir = `~/.openclaw/agents/${agentId}`
  const safeDir = agentDir.replace(/^~/, '$HOME')

  const [errorResult, staleResult, sizeResult] = await Promise.all([
    runCommand(config, `grep -rci 'error\\|exception' ${safeDir}/*.log 2>/dev/null | awk -F: '{s+=$2} END {print s+0}'`),
    runCommand(config, `find ${safeDir} -type f -mtime +30 2>/dev/null | wc -l`),
    runCommand(config, `du -sh ${safeDir} 2>/dev/null | cut -f1 || echo "0"`),
  ])

  return {
    errorCount: parseInt(errorResult.stdout.trim(), 10) || 0,
    staleFileCount: parseInt(staleResult.stdout.trim(), 10) || 0,
    dirSize: sizeResult.stdout.trim(),
  }
}

/**
 * Backs up a specific agent's directory (not the whole ~/.openclaw/).
 */
export async function backupAgent(
  config: SshConfig,
  agentId: string,
  localTarPath: string
): Promise<void> {
  const tmpPath = `/tmp/reef-agent-backup-${agentId}.tar.gz`
  await runCommand(
    config,
    `tar -czf ${tmpPath} -C $HOME/.openclaw/agents ${agentId}`
  )
  const { sftpPull } = await import('./ssh')
  await sftpPull(config, tmpPath, localTarPath)
  await runCommand(config, `rm ${tmpPath}`)
}

/**
 * Reads the contents of a remote file via SSH cat.
 * Path must be within ~/.openclaw/.
 */
export async function readRemoteFile(
  config: SshConfig,
  remotePath: string
): Promise<string> {
  const safePath = remotePath.replace(/^~/, '$HOME')
  const result = await runCommand(config, `cat "${safePath}"`)
  if (result.code !== 0) {
    throw new Error(`Failed to read ${remotePath}: ${result.stderr}`)
  }
  return result.stdout
}

/**
 * Writes content to a remote file via SSH.
 * Path must be within ~/.openclaw/.
 */
export async function writeRemoteFile(
  config: SshConfig,
  remotePath: string,
  content: string
): Promise<void> {
  const safePath = remotePath.replace(/^~/, '$HOME')
  // Use heredoc to avoid escaping issues
  const escaped = content.replace(/\\/g, '\\\\').replace(/'/g, "'\\''")
  const result = await runCommand(
    config,
    `cat > "${safePath}" << 'REEF_EOF'\n${content}\nREEF_EOF`
  )
  if (result.code !== 0) {
    throw new Error(`Failed to write ${remotePath}: ${result.stderr}`)
  }
}

import { Readable } from 'stream'
import { execStream } from './ssh'

/**
 * Sends a message to an OpenClaw agent and returns a readable stream
 * of the response. Used for SSE streaming to the browser.
 */
export function streamChatMessage(
  config: SshConfig,
  agentId: string,
  message: string
): { stream: Readable; done: Promise<number> } {
  const escaped = message.replace(/\\/g, '\\\\').replace(/'/g, "'\\''")
  return execStream(
    config,
    `openclaw agent --agent '${agentId}' -m '${escaped}' 2>/dev/null`
  )
}

export interface RestartResult {
  success: boolean
  method: 'gateway' | 'systemd' | 'process-kill'
  output: string
}

/**
 * Restarts the OpenClaw system service on the remote instance.
 *
 * Strategy:
 * 1. Try `openclaw gateway restart` (preferred, works with gateway-managed installs)
 * 2. Fallback: `systemctl restart openclaw` (works for systemd-managed installs)
 * 3. Fallback: kill any running openclaw processes with SIGKILL to unblock
 *    a stuck long-running task (the operator must manually restart after)
 *
 * After each restart attempt, waits 3s and re-checks service health.
 */
export async function restartOpenClaw(config: SshConfig): Promise<RestartResult> {
  // Attempt 1: openclaw gateway restart (preferred)
  const gwResult = await runCommand(config, 'openclaw gateway restart 2>&1')
  if (gwResult.code === 0) {
    await new Promise((r) => setTimeout(r, 3000))
    const check = await runCommand(config, 'openclaw health --json 2>/dev/null')
    return {
      success: check.code === 0,
      method: 'gateway',
      output: gwResult.stdout.trim() || 'restarted via openclaw gateway restart',
    }
  }

  // Attempt 2: systemd
  const systemdResult = await runCommand(config, 'systemctl restart openclaw 2>&1')
  if (systemdResult.code === 0) {
    await new Promise((r) => setTimeout(r, 3000))
    const checkResult = await runCommand(config, 'systemctl is-active openclaw 2>/dev/null')
    return {
      success: checkResult.stdout.trim() === 'active',
      method: 'systemd',
      output: (systemdResult.stdout + systemdResult.stderr).trim() || 'restarted via systemd',
    }
  }

  // Attempt 3: forceful kill
  const killResult = await runCommand(
    config,
    'pkill -KILL -x openclaw 2>&1; sleep 1; pgrep -x openclaw > /dev/null 2>&1 && echo "still_running" || echo "killed"'
  )
  const killed = killResult.stdout.includes('killed')
  return {
    success: killed,
    method: 'process-kill',
    output: killed
      ? 'OpenClaw process killed — service will need to be restarted manually'
      : 'Could not kill OpenClaw process — check manually',
  }
}

export interface StatusResult {
  output: string
  exitCode: number
}

/**
 * Runs `openclaw status --all --deep` for comprehensive diagnostics.
 */
export async function getStatus(config: SshConfig): Promise<StatusResult> {
  const result = await runCommand(config, 'openclaw status --all --deep 2>&1')
  return { output: result.stdout + result.stderr, exitCode: result.code }
}

export interface DoctorResult {
  output: string
  exitCode: number
}

/**
 * Runs `openclaw doctor --deep --yes` to auto-diagnose and fix issues.
 */
export async function runDoctor(config: SshConfig): Promise<DoctorResult> {
  const result = await runCommand(config, 'openclaw doctor --deep --yes 2>&1')
  return { output: result.stdout + result.stderr, exitCode: result.code }
}

export interface DeployResult {
  success: boolean
  doctorOutput: string
}

/**
 * Deploys an agent tarball to a remote instance:
 * 1. SFTP push tarball
 * 2. Untar to ~/.openclaw/agents/
 * 3. Run openclaw doctor --deep --yes
 */
export async function deployAgent(
  config: SshConfig,
  agentId: string,
  localTarPath: string
): Promise<DeployResult> {
  if (!/^[a-zA-Z0-9_-]+$/.test(agentId)) {
    return { success: false, doctorOutput: `Invalid agentId: ${agentId}` }
  }
  const remoteTmp = `/tmp/reef-deploy-${agentId}.tar.gz`

  // Push tarball
  const { sftpPush } = await import('./ssh')
  await sftpPush(config, localTarPath, remoteTmp)

  // Ensure agents dir exists and untar
  await runCommand(config, 'mkdir -p $HOME/.openclaw/agents')
  const untar = await runCommand(
    config,
    `tar -xzf ${remoteTmp} -C $HOME/.openclaw/agents && rm ${remoteTmp}`
  )
  if (untar.code !== 0) {
    return { success: false, doctorOutput: `Untar failed: ${untar.stderr}` }
  }

  // Run doctor to apply any state migrations
  const doctor = await runDoctor(config)
  return { success: true, doctorOutput: doctor.output }
}

/**
 * Migrates an agent from one machine to another.
 *
 * Strategy:
 * 1. Try `openclaw agent export <agentId>` on source (if CLI supports it)
 * 2. Fallback: tar the agent directory, SFTP via reef server, untar on destination
 *
 * TODO: Update with findings from Task 9 web research
 */
export async function migrateAgent(
  sourceConfig: SshConfig,
  destConfig: SshConfig,
  agentId: string,
  deleteSource: boolean
): Promise<{ success: boolean; method: string; error?: string }> {
  const agentDir = agentId
  const tmpPath = `/tmp/reef-migrate-${agentId}.tar.gz`
  const localTmpPath = `/tmp/reef-migrate-${agentId}-${Date.now()}.tar.gz`

  try {
    // Pack on source
    await runCommand(
      sourceConfig,
      `tar -czf ${tmpPath} -C $HOME/.openclaw/agents ${agentDir}`
    )

    // Pull to reef server
    const { sftpPull: pull } = await import('./ssh')
    await pull(sourceConfig, tmpPath, localTmpPath)

    // Push to destination
    // We need to use a fresh SSH connection to push
    const pushResult = await runCommand(
      destConfig,
      `mkdir -p ~/.openclaw/agents`
    )
    if (pushResult.code !== 0) {
      throw new Error('Failed to create agents directory on destination')
    }

    // SFTP push the tar to destination
    const { sftpPush } = await import('./ssh')
    await sftpPush(destConfig, localTmpPath, tmpPath)

    // Untar on destination
    await runCommand(
      destConfig,
      `tar -xzf ${tmpPath} -C $HOME/.openclaw/agents && rm ${tmpPath}`
    )

    // Clean up local tmp
    const fs = await import('fs/promises')
    await fs.unlink(localTmpPath).catch(() => {})

    // Clean up source tmp
    await runCommand(sourceConfig, `rm ${tmpPath}`)

    // Optionally delete from source
    if (deleteSource) {
      await runCommand(
        sourceConfig,
        `rm -rf $HOME/.openclaw/agents/${agentDir}`
      )
    }

    return { success: true, method: 'tar-sftp' }
  } catch (err) {
    return {
      success: false,
      method: 'tar-sftp',
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}
