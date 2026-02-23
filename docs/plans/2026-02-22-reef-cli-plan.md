# Reef CLI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a `reef` CLI tool that exposes instance management operations for AI agents and humans, with composable backup/deploy pipeline and OpenClaw native command integration.

**Architecture:** Single `bin/reef.ts` entry point with shebang, registered via package.json `"bin"` field. Each command resolves the instance via existing `lib/instances.ts`, calls existing lib functions, and outputs JSON to stdout. Three new lib functions (`getStatus`, `runDoctor`, `deployAgent`) added to `lib/openclaw.ts`. The existing `restartOpenClaw` updated to try `openclaw gateway restart` first.

**Tech Stack:** TypeScript, tsx (runtime), ssh2, @1password/sdk — all already in the project.

---

### Task 1: Add new lib functions to `lib/openclaw.ts`

**Files:**
- Modify: `lib/openclaw.ts` (append after `restartOpenClaw`, before `migrateAgent`)

**Step 1: Add `getStatus` function**

Add after `restartOpenClaw` (line ~369), before `migrateAgent`:

```typescript
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
```

**Step 2: Add `runDoctor` function**

```typescript
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
```

**Step 3: Add `deployAgent` function**

```typescript
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
  const remoteTmp = `/tmp/reef-deploy-${agentId}.tar.gz`

  // Push tarball
  const { sftpPush } = await import('./ssh')
  await sftpPush(config, localTarPath, remoteTmp)

  // Ensure agents dir exists and untar
  await runCommand(config, 'mkdir -p ~/.openclaw/agents')
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
```

**Step 4: Update `restartOpenClaw` to try gateway command first**

Replace the existing `restartOpenClaw` function. The new version tries `openclaw gateway restart` first (the proper way), falls back to `systemctl restart openclaw`, then falls back to process kill:

```typescript
export async function restartOpenClaw(config: SshConfig): Promise<RestartResult> {
  // Attempt 1: openclaw gateway restart (preferred)
  const gwResult = await runCommand(config, 'openclaw gateway restart 2>&1')
  if (gwResult.code === 0) {
    await new Promise((r) => setTimeout(r, 3000))
    const check = await runCommand(config, 'openclaw health --json 2>/dev/null')
    return {
      success: check.code === 0,
      method: 'gateway' as any,
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
```

Note: Update `RestartResult['method']` type to include `'gateway'`:

```typescript
export interface RestartResult {
  success: boolean
  method: 'gateway' | 'systemd' | 'process-kill'
  output: string
}
```

**Step 5: Run tests**

Run: `npx vitest run`
Expected: All 20 existing tests pass (new functions have no tests yet — lib functions are integration-level, tested via live CLI later).

**Step 6: Commit**

```bash
git add lib/openclaw.ts
git commit -m "feat: add getStatus, runDoctor, deployAgent and improve restartOpenClaw"
```

---

### Task 2: Create the CLI entry point `bin/reef.ts`

**Files:**
- Create: `bin/reef.ts`

**Step 1: Create `bin/reef.ts` with all commands**

```typescript
#!/usr/bin/env npx tsx
import { loadEnv } from '../lib/env'
import { listInstances, resolveInstance } from '../lib/instances'
import {
  getHealth,
  listAgents,
  getStatus,
  runDoctor,
  restartOpenClaw,
  backupAgent,
  deployAgent,
  sendChatMessage,
  getAgentHealth,
  runAgentHygieneCheck,
} from '../lib/openclaw'
import { existsSync } from 'fs'
import { resolve, join } from 'path'
import { execSync } from 'child_process'

loadEnv()

const [, , command, ...args] = process.argv

function fail(error: string): never {
  console.error(JSON.stringify({ success: false, error }))
  process.exit(1)
}

async function requireInstance(id: string) {
  const instance = await resolveInstance(id)
  if (!instance) fail(`Instance not found: ${id}`)
  return instance
}

function sshConfig(instance: { ip: string; sshKey: string }) {
  return { host: instance.ip, privateKey: instance.sshKey }
}

async function main() {
  switch (command) {
    case 'instances': {
      const instances = await listInstances()
      console.log(JSON.stringify({
        success: true,
        instances: instances.map(i => ({ id: i.id, label: i.label, ip: i.ip })),
      }))
      break
    }

    case 'health': {
      const instance = await requireInstance(args[0])
      const health = await getHealth(sshConfig(instance))
      console.log(JSON.stringify({ success: true, ...health }))
      break
    }

    case 'agents': {
      const instance = await requireInstance(args[0])
      const agents = await listAgents(sshConfig(instance))
      console.log(JSON.stringify({ success: true, agents }))
      break
    }

    case 'status': {
      const instance = await requireInstance(args[0])
      const status = await getStatus(sshConfig(instance))
      console.log(JSON.stringify({ success: true, ...status }))
      break
    }

    case 'doctor': {
      const instance = await requireInstance(args[0])
      const result = await runDoctor(sshConfig(instance))
      console.log(JSON.stringify({ success: true, ...result }))
      break
    }

    case 'restart': {
      const instance = await requireInstance(args[0])
      const result = await restartOpenClaw(sshConfig(instance))
      console.log(JSON.stringify(result))
      break
    }

    case 'backup': {
      const [instanceId, agentId] = args
      if (!agentId) fail('Usage: reef backup <instance> <agent>')
      const instance = await requireInstance(instanceId)
      const backupDir = resolve('backups')
      if (!existsSync(backupDir)) {
        const { mkdirSync } = await import('fs')
        mkdirSync(backupDir, { recursive: true })
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const tarPath = join(backupDir, `${instanceId}-${agentId}-${timestamp}.tar.gz`)
      await backupAgent(sshConfig(instance), agentId, tarPath)
      console.log(JSON.stringify({ success: true, path: tarPath }))
      break
    }

    case 'check-backup': {
      const tarPath = args[0]
      if (!tarPath || !existsSync(tarPath)) fail(`Tarball not found: ${tarPath}`)
      try {
        const listing = execSync(`tar -tzf "${tarPath}"`, { encoding: 'utf-8' })
        const files = listing.trim().split('\n').filter(Boolean)
        const { statSync } = await import('fs')
        const size = statSync(tarPath).size
        console.log(JSON.stringify({ success: true, files, fileCount: files.length, sizeBytes: size }))
      } catch (e) {
        fail(`Tarball corrupt or unreadable: ${e instanceof Error ? e.message : e}`)
      }
      break
    }

    case 'deploy': {
      const [instanceId, agentId, tarPath] = args
      if (!tarPath) fail('Usage: reef deploy <instance> <agent> <tarball>')
      if (!existsSync(tarPath)) fail(`Tarball not found: ${tarPath}`)
      const instance = await requireInstance(instanceId)
      const result = await deployAgent(sshConfig(instance), agentId, tarPath)
      console.log(JSON.stringify(result))
      break
    }

    case 'chat': {
      const [instanceId, agentId, ...messageParts] = args
      const message = messageParts.join(' ')
      if (!message) fail('Usage: reef chat <instance> <agent> <message>')
      const instance = await requireInstance(instanceId)
      const result = await sendChatMessage(sshConfig(instance), agentId, message)
      console.log(JSON.stringify({ success: true, ...result }))
      break
    }

    case 'agent-health': {
      const [instanceId, agentId] = args
      if (!agentId) fail('Usage: reef agent-health <instance> <agent>')
      const instance = await requireInstance(instanceId)
      const result = await getAgentHealth(sshConfig(instance), agentId)
      console.log(JSON.stringify({ success: true, ...result }))
      break
    }

    case 'agent-hygiene': {
      const [instanceId, agentId] = args
      if (!agentId) fail('Usage: reef agent-hygiene <instance> <agent>')
      const instance = await requireInstance(instanceId)
      const result = await runAgentHygieneCheck(sshConfig(instance), agentId)
      console.log(JSON.stringify({ success: true, ...result }))
      break
    }

    default:
      fail(`Unknown command: ${command ?? '(none)'}. Commands: instances, health, agents, status, doctor, restart, backup, check-backup, deploy, chat, agent-health, agent-hygiene`)
  }
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : String(err))
})
```

**Step 2: Make it executable**

Run: `chmod +x bin/reef.ts`

**Step 3: Verify it parses without errors**

Run: `npx tsx bin/reef.ts`
Expected: JSON error output with "Unknown command: (none)" — confirms the file loads and runs.

**Step 4: Commit**

```bash
git add bin/reef.ts
git commit -m "feat: add reef CLI entry point with all commands"
```

---

### Task 3: Register CLI in package.json and link globally

**Files:**
- Modify: `package.json`

**Step 1: Add `"bin"` field to package.json**

Add after `"private": true,`:

```json
"bin": {
  "reef": "./bin/reef.ts"
},
```

**Step 2: Install tsx as a dependency (needed for shebang)**

Run: `npm install --save tsx`

**Step 3: Link globally**

Run: `npm link`

**Step 4: Verify `reef` command works**

Run: `reef instances`
Expected: JSON output with `{ success: true, instances: [...] }` listing your droplets.

**Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: register reef CLI in package.json and add tsx dependency"
```

---

### Task 4: Add `backups/` to `.gitignore`

**Files:**
- Modify: `.gitignore`

**Step 1: Add backups directory to gitignore**

Append to `.gitignore`:

```
# CLI backups
backups/
```

**Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: gitignore backups directory"
```

---

### Task 5: Add CLI reference to CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Add CLI section to CLAUDE.md**

Append after the `## Gotchas` section:

```markdown

## CLI

Reef includes a CLI tool for managing instances from the terminal. All commands output JSON to stdout.

**Setup:** Run `npm link` in the project root to make `reef` available globally.

**Instance commands** (use droplet name as instance ID, e.g. `openclaw-dot`):
- `reef instances` — list all discovered instances
- `reef health <instance>` — process status, disk, memory, uptime
- `reef agents <instance>` — list agents on an instance
- `reef status <instance>` — deep diagnostics via `openclaw status --all --deep`
- `reef doctor <instance>` — run `openclaw doctor --deep --yes` to auto-fix issues
- `reef restart <instance>` — restart OpenClaw (tries gateway, systemd, then kill)

**Agent commands** (instance + agent ID):
- `reef agent-health <instance> <agent>` — agent directory, size, last activity, process status
- `reef agent-hygiene <instance> <agent>` — error counts, stale files, directory size
- `reef chat <instance> <agent> <message>` — send a message, get JSON response
- `reef backup <instance> <agent>` — download agent tarball to `./backups/`

**Migration pipeline** (composable steps):
1. `reef backup <source-instance> <agent>` — creates `./backups/<instance>-<agent>-<timestamp>.tar.gz`
2. `reef check-backup <path-to-tarball>` — verify integrity, list contents
3. `reef deploy <dest-instance> <agent> <path-to-tarball>` — push, untar, run doctor

**Output contract:** Every command returns `{ "success": true|false, ... }`. Errors include an `"error"` field.
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add CLI reference to CLAUDE.md for agent discoverability"
```

---

### Task 6: End-to-end validation on live stuck agent

**Step 1: List instances**

Run: `reef instances`
Expected: JSON with your droplets (openclaw-dot, openclaw-myri, etc.)

**Step 2: Check health of each instance to find the stuck one**

Run: `reef health openclaw-dot` (and other instances)
Expected: JSON health output — look for `processRunning: false` or concerning values.

**Step 3: Check agents on the troubled instance**

Run: `reef agents <instance>`

**Step 4: Run agent-health on the troubled agent**

Run: `reef agent-health <instance> <agent>`

**Step 5: Try doctor first**

Run: `reef doctor <instance>`

**Step 6: If needed, restart**

Run: `reef restart <instance>`

**Step 7: Verify recovery**

Run: `reef health <instance>`

**Step 8: Commit any fixes discovered during testing**

Adjust commands or lib code based on what the live test reveals.
