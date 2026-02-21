# Reef Management Console — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Next.js web dashboard that discovers OpenClaw instances via Digital Ocean, fetches SSH credentials from 1Password, and presents a drill-down tree (machine → agents → files) with the ability to check health, run hygiene checks, take backups, and chat with any agent.

**Architecture:** Next.js 15 App Router monolith. All business logic in framework-agnostic `lib/` modules. API routes are thin wrappers. Per-request SSH connections via `ssh2` — no persistent tunnels.

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS, `ssh2`, `@1password/sdk`, Digital Ocean v2 REST API, Vitest

---

## OpenClaw Directory Structure (on each machine)

```
~/.openclaw/
  agents/
    hal/
      memories/
        memory1.md
      skills/
        skill1.md
    marvin/
      memories/
      skills/
```

Each machine can host multiple agents. Agents are discovered by listing `~/.openclaw/agents/`. The UI drills down: machine → agents → memories/skills directories.

---

## Repository Structure

```
reef/
├── app/
│   ├── page.tsx                              # Dashboard — machine tree
│   ├── instances/[id]/agents/[agentId]/
│   │   └── chat/page.tsx                     # Chat with a specific agent
│   └── api/
│       ├── instances/route.ts                # GET — discover all instances
│       └── instances/[id]/
│           ├── health/route.ts               # POST — SSH health check
│           ├── check/route.ts                # POST — OpenClaw hygiene check
│           ├── backup/route.ts               # POST — SFTP backup
│           ├── agents/route.ts               # GET — list agents on machine
│           ├── browse/route.ts               # GET ?path=... — list directory
│           └── agents/[agentId]/
│               └── chat/route.ts             # POST — chat with specific agent
├── lib/
│   ├── mapping.ts
│   ├── 1password.ts
│   ├── digitalocean.ts
│   ├── ssh.ts
│   ├── openclaw.ts
│   └── instances.ts
├── config/
│   └── name-map.json
├── backups/
└── .env.local
```

---

## Task 1: Scaffold the project

**Files:**
- Modify: `package.json` (add test script)
- Create: `vitest.config.ts`
- Create: `.env.local.example`
- Create: `config/name-map.json`
- Create: `backups/.gitkeep`
- Modify: `.gitignore`

**Step 1: Run create-next-app into the existing directory**

```bash
npx create-next-app@latest . \
  --typescript \
  --tailwind \
  --app \
  --no-src-dir \
  --import-alias "@/*" \
  --no-git \
  --yes
```

If prompted about the directory not being empty, choose to continue.

**Step 2: Install runtime dependencies**

```bash
npm install ssh2 @1password/sdk
```

**Step 3: Install dev dependencies**

```bash
npm install -D @types/ssh2 vitest @vitejs/plugin-react jsdom
```

**Step 4: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
```

**Step 5: Add test script to `package.json`**

Find the `"scripts"` section and add:
```json
"test": "vitest",
"test:run": "vitest run"
```

**Step 6: Create `.env.local.example`**

```bash
# 1Password service account token (get from 1Password → Developer Tools → Service Accounts)
OP_SERVICE_ACCOUNT_TOKEN=

# op:// reference to your Digital Ocean API token in 1Password
# Example: op://AI-Agents/digital-ocean-api/credential
DO_API_TOKEN_OP_REF=op://AI-Agents/digital-ocean-api/credential
```

Copy to `.env.local` and fill in real values:
```bash
cp .env.local.example .env.local
```

**Step 7: Create `config/name-map.json`**

```json
{
  "__comment": "Maps DO droplet names to 1Password bot names. TODO: replace with DO tags or convention.",
  "open-claw-example": "example-bot"
}
```

**Step 8: Create `backups/.gitkeep` and update `.gitignore`**

```bash
mkdir -p backups && touch backups/.gitkeep
```

Add to `.gitignore`:
```
.env.local
backups/*
!backups/.gitkeep
```

**Step 9: Create `lib/` and `lib/__tests__/` directories**

```bash
mkdir -p lib/__tests__
```

**Step 10: Run dev server to verify scaffold**

```bash
npm run dev
```

Expected: Server starts at http://localhost:3000 with default Next.js page.

**Step 11: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js project with dependencies"
```

---

## Task 2: Name mapping module

**Files:**
- Create: `lib/mapping.ts`
- Create: `lib/__tests__/mapping.test.ts`

**Step 1: Write the failing test**

Create `lib/__tests__/mapping.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/config/name-map.json', () => ({
  default: {
    '__comment': 'ignored',
    'open-claw-hal': 'hal',
    'open-claw-marvin': 'marvin',
  }
}))

import { getBotName } from '../mapping'

describe('getBotName', () => {
  it('returns bot name for a known droplet', () => {
    expect(getBotName('open-claw-hal')).toBe('hal')
  })

  it('returns bot name for another known droplet', () => {
    expect(getBotName('open-claw-marvin')).toBe('marvin')
  })

  it('returns null for an unknown droplet', () => {
    expect(getBotName('open-claw-unknown')).toBeNull()
  })

  it('ignores __comment keys', () => {
    expect(getBotName('__comment')).toBeNull()
  })
})
```

**Step 2: Run test to verify it fails**

```bash
npm run test:run -- lib/__tests__/mapping.test.ts
```

Expected: FAIL — `Cannot find module '../mapping'`

**Step 3: Implement `lib/mapping.ts`**

```typescript
import nameMap from '@/config/name-map.json'

/**
 * Maps a Digital Ocean droplet name to a 1Password bot name.
 *
 * TODO: Replace this static JSON map with a smarter approach:
 *   - Store the bot name as a DO droplet tag (e.g. tag "reef-bot:hal")
 *   - Enforce a strict naming convention (droplet "open-claw-hal" → bot "hal")
 *   - Or ask each OpenClaw instance to self-report via a "reef reporter" skill
 *
 * For now, edit config/name-map.json to add new machines.
 */
export function getBotName(dropletName: string): string | null {
  if (dropletName.startsWith('__')) return null
  const map = nameMap as Record<string, string>
  return map[dropletName] ?? null
}
```

**Step 4: Run test to verify it passes**

```bash
npm run test:run -- lib/__tests__/mapping.test.ts
```

Expected: PASS — 4 tests pass

**Step 5: Commit**

```bash
git add lib/mapping.ts lib/__tests__/mapping.test.ts
git commit -m "feat: add name mapping module with placeholder JSON map"
```

---

## Task 3: 1Password module

**Files:**
- Create: `lib/1password.ts`
- Create: `lib/__tests__/1password.test.ts`

**Step 1: Write the failing test**

Create `lib/__tests__/1password.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockResolve = vi.fn()

vi.mock('@1password/sdk', () => ({
  createClient: vi.fn().mockResolvedValue({
    secrets: { resolve: mockResolve },
  }),
}))

const { getSecret } = await import('../1password')

describe('getSecret', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.OP_SERVICE_ACCOUNT_TOKEN = 'test-token'
  })

  it('resolves a secret by op:// ref', async () => {
    mockResolve.mockResolvedValue('ssh-private-key-value')

    const result = await getSecret('op://AI-Agents/hal - SSH Private Key/private key')

    expect(result).toBe('ssh-private-key-value')
    expect(mockResolve).toHaveBeenCalledWith(
      'op://AI-Agents/hal - SSH Private Key/private key'
    )
  })

  it('propagates errors from the SDK', async () => {
    mockResolve.mockRejectedValue(new Error('item not found'))

    await expect(
      getSecret('op://AI-Agents/nonexistent/credential')
    ).rejects.toThrow('item not found')
  })
})
```

**Step 2: Run test to verify it fails**

```bash
npm run test:run -- lib/__tests__/1password.test.ts
```

Expected: FAIL — `Cannot find module '../1password'`

**Step 3: Implement `lib/1password.ts`**

```typescript
import { createClient } from '@1password/sdk'

// Module-level singleton — reused across requests in the same Node process.
// In Vercel serverless, each cold start creates a new client (acceptable).
let clientPromise: ReturnType<typeof createClient> | null = null

function getClient() {
  if (!clientPromise) {
    clientPromise = createClient({
      auth: process.env.OP_SERVICE_ACCOUNT_TOKEN!,
      integrationName: 'reef',
      integrationVersion: '1.0.0',
    })
  }
  return clientPromise
}

/**
 * Fetch a secret from 1Password by op:// reference.
 * Example ref: "op://AI-Agents/hal - SSH Private Key/private key"
 *
 * 1Password item naming convention: "<bot-name> - SSH Private Key"
 * The field name inside the item should be "private key".
 */
export async function getSecret(ref: string): Promise<string> {
  const client = await getClient()
  return client.secrets.resolve(ref)
}
```

**Step 4: Run test to verify it passes**

```bash
npm run test:run -- lib/__tests__/1password.test.ts
```

Expected: PASS — 2 tests pass

**Step 5: Commit**

```bash
git add lib/1password.ts lib/__tests__/1password.test.ts
git commit -m "feat: add 1Password SDK wrapper"
```

---

## Task 4: Digital Ocean module

**Files:**
- Create: `lib/digitalocean.ts`
- Create: `lib/__tests__/digitalocean.test.ts`

**Step 1: Write the failing test**

Create `lib/__tests__/digitalocean.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { listOpenClawDroplets } from '../digitalocean'

const mockDropletResponse = {
  droplets: [
    {
      id: 123,
      name: 'open-claw-hal',
      networks: {
        v4: [
          { type: 'private', ip_address: '10.0.0.1' },
          { type: 'public', ip_address: '1.2.3.4' },
        ],
      },
    },
    {
      id: 456,
      name: 'open-claw-marvin',
      networks: {
        v4: [{ type: 'public', ip_address: '5.6.7.8' }],
      },
    },
  ],
}

describe('listOpenClawDroplets', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns mapped droplets from the DO API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockDropletResponse),
    }))

    const result = await listOpenClawDroplets('test-token')

    expect(result).toEqual([
      { id: 123, name: 'open-claw-hal', ip: '1.2.3.4' },
      { id: 456, name: 'open-claw-marvin', ip: '5.6.7.8' },
    ])
  })

  it('uses the correct DO API URL and auth header', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ droplets: [] }),
    })
    vi.stubGlobal('fetch', mockFetch)

    await listOpenClawDroplets('my-do-token')

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('tag_name=openclaw'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer my-do-token',
        }),
      })
    )
  })

  it('throws on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    }))

    await expect(listOpenClawDroplets('bad-token')).rejects.toThrow(
      'Digital Ocean API error: 401 Unauthorized'
    )
  })
})
```

**Step 2: Run test to verify it fails**

```bash
npm run test:run -- lib/__tests__/digitalocean.test.ts
```

Expected: FAIL — `Cannot find module '../digitalocean'`

**Step 3: Implement `lib/digitalocean.ts`**

```typescript
export interface Droplet {
  id: number
  name: string
  ip: string
}

/**
 * Lists all Digital Ocean droplets tagged "openclaw".
 * Tag your droplets in DO with "openclaw" to include them in reef.
 */
export async function listOpenClawDroplets(apiToken: string): Promise<Droplet[]> {
  const res = await fetch(
    'https://api.digitalocean.com/v2/droplets?tag_name=openclaw&per_page=100',
    {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
    }
  )

  if (!res.ok) {
    throw new Error(`Digital Ocean API error: ${res.status} ${res.statusText}`)
  }

  const data = await res.json()

  return data.droplets.map((d: any) => ({
    id: d.id,
    name: d.name,
    ip: d.networks.v4.find((n: any) => n.type === 'public')?.ip_address ?? '',
  }))
}
```

**Step 4: Run test to verify it passes**

```bash
npm run test:run -- lib/__tests__/digitalocean.test.ts
```

Expected: PASS — 3 tests pass

**Step 5: Commit**

```bash
git add lib/digitalocean.ts lib/__tests__/digitalocean.test.ts
git commit -m "feat: add Digital Ocean droplet discovery module"
```

---

## Task 5: SSH module

**Files:**
- Create: `lib/ssh.ts`
- Create: `lib/__tests__/ssh.test.ts`

**Step 1: Write the failing test**

Create `lib/__tests__/ssh.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'

vi.mock('ssh2', () => {
  const makeStream = (stdout: string, exitCode: number) => {
    const handlers: Record<string, Function> = {}
    const stderrHandlers: Record<string, Function> = {}

    const stream = {
      on: vi.fn((event: string, handler: Function) => {
        handlers[event] = handler
        if (event === 'close') {
          Promise.resolve().then(() => {
            stderrHandlers['data']?.(Buffer.from(''))
            handlers['data']?.(Buffer.from(stdout))
            handlers['close']?.(exitCode)
          })
        }
        return stream
      }),
      stderr: {
        on: vi.fn((event: string, handler: Function) => {
          stderrHandlers[event] = handler
          return stream.stderr
        }),
      },
    }
    return stream
  }

  const Client = vi.fn().mockImplementation(() => {
    const client = {
      on: vi.fn((event: string, handler: Function) => {
        if (event === 'ready') Promise.resolve().then(() => handler())
        return client
      }),
      exec: vi.fn((_cmd: string, cb: Function) => {
        cb(null, makeStream('command output\n', 0))
      }),
      connect: vi.fn(),
      end: vi.fn(),
    }
    return client
  })

  return { Client }
})

import { runCommand } from '../ssh'

describe('runCommand', () => {
  it('resolves with stdout and exit code 0', async () => {
    const result = await runCommand(
      { host: '1.2.3.4', privateKey: 'fake-key' },
      'echo hello'
    )
    expect(result.stdout).toBe('command output\n')
    expect(result.code).toBe(0)
  })
})
```

**Step 2: Run test to verify it fails**

```bash
npm run test:run -- lib/__tests__/ssh.test.ts
```

Expected: FAIL — `Cannot find module '../ssh'`

**Step 3: Implement `lib/ssh.ts`**

```typescript
import { Client } from 'ssh2'

export interface SshConfig {
  host: string
  privateKey: string
  username?: string
  port?: number
}

export interface CommandResult {
  stdout: string
  stderr: string
  code: number
}

/**
 * Opens an SSH connection, runs a single command, closes the connection.
 * Per-request — no connection pooling needed at 0-10 instance scale.
 */
export async function runCommand(
  config: SshConfig,
  command: string
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const conn = new Client()

    conn
      .on('ready', () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            conn.end()
            return reject(err)
          }

          let stdout = ''
          let stderr = ''

          stream
            .on('close', (code: number) => {
              conn.end()
              resolve({ stdout, stderr, code })
            })
            .on('data', (data: Buffer) => {
              stdout += data.toString()
            })
            .stderr.on('data', (data: Buffer) => {
              stderr += data.toString()
            })
        })
      })
      .on('error', reject)
      .connect({
        host: config.host,
        port: config.port ?? 22,
        username: config.username ?? 'root',
        privateKey: config.privateKey,
      })
  })
}

/**
 * SFTP-pulls a single file from the remote machine to a local path.
 */
export async function sftpPull(
  config: SshConfig,
  remotePath: string,
  localPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const conn = new Client()

    conn
      .on('ready', () => {
        conn.sftp((err, sftp) => {
          if (err) {
            conn.end()
            return reject(err)
          }
          sftp.fastGet(remotePath, localPath, (err) => {
            conn.end()
            if (err) reject(err)
            else resolve()
          })
        })
      })
      .on('error', reject)
      .connect({
        host: config.host,
        port: config.port ?? 22,
        username: config.username ?? 'root',
        privateKey: config.privateKey,
      })
  })
}

/**
 * Tars a remote directory and SFTP-pulls the archive to localTarPath.
 */
export async function backupDirectory(
  config: SshConfig,
  remoteDir: string,
  localTarPath: string
): Promise<void> {
  const tmpPath = '/tmp/reef-backup.tar.gz'
  await runCommand(
    config,
    `tar -czf ${tmpPath} -C $(dirname ${remoteDir}) $(basename ${remoteDir})`
  )
  await sftpPull(config, tmpPath, localTarPath)
  await runCommand(config, `rm ${tmpPath}`)
}
```

**Step 4: Run test to verify it passes**

```bash
npm run test:run -- lib/__tests__/ssh.test.ts
```

Expected: PASS — 1 test passes

**Step 5: Commit**

```bash
git add lib/ssh.ts lib/__tests__/ssh.test.ts
git commit -m "feat: add SSH module for per-request connections and SFTP backup"
```

---

## Task 6: OpenClaw module

This module handles everything OpenClaw-specific: health checks, hygiene, directory browsing, and agent-scoped chat.

**Files:**
- Create: `lib/openclaw.ts`
- Create: `lib/__tests__/openclaw.test.ts`

**Step 1: Write the failing test**

Create `lib/__tests__/openclaw.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockRunCommand = vi.fn()
vi.mock('../ssh', () => ({ runCommand: mockRunCommand }))

import { getHealth, listAgents, listDirectory, runHygieneCheck, sendChatMessage } from '../openclaw'

const config = { host: '1.2.3.4', privateKey: 'fake-key' }

describe('getHealth', () => {
  it('returns processRunning: true when systemctl says active', async () => {
    mockRunCommand
      .mockResolvedValueOnce({ stdout: 'active\n', stderr: '', code: 0 })
      .mockResolvedValueOnce({ stdout: '/ 20G 8G 12G 40%', stderr: '', code: 0 })
      .mockResolvedValueOnce({ stdout: 'Mem: 2G 1G 1G', stderr: '', code: 0 })
      .mockResolvedValueOnce({ stdout: 'up 3 days', stderr: '', code: 0 })

    const result = await getHealth(config)
    expect(result.processRunning).toBe(true)
    expect(result.uptime).toBe('up 3 days')
  })

  it('returns processRunning: false when process is not running', async () => {
    mockRunCommand
      .mockResolvedValueOnce({ stdout: 'inactive\n', stderr: '', code: 1 })
      .mockResolvedValueOnce({ stdout: '', stderr: '', code: 0 })
      .mockResolvedValueOnce({ stdout: '', stderr: '', code: 0 })
      .mockResolvedValueOnce({ stdout: '', stderr: '', code: 0 })

    const result = await getHealth(config)
    expect(result.processRunning).toBe(false)
  })
})

describe('listAgents', () => {
  it('returns agent names from ~/.openclaw/agents/', async () => {
    mockRunCommand.mockResolvedValue({ stdout: 'hal\nmarvin\n', stderr: '', code: 0 })
    const result = await listAgents(config)
    expect(result).toEqual(['hal', 'marvin'])
  })

  it('returns empty array when agents directory is empty', async () => {
    mockRunCommand.mockResolvedValue({ stdout: '', stderr: '', code: 0 })
    const result = await listAgents(config)
    expect(result).toEqual([])
  })
})

describe('listDirectory', () => {
  it('distinguishes files from directories using trailing slash', async () => {
    mockRunCommand.mockResolvedValue({
      stdout: 'memories/\nskills/\nconfig.json\n',
      stderr: '',
      code: 0,
    })
    const result = await listDirectory(config, '~/.openclaw/agents/hal')
    expect(result).toEqual([
      { name: 'memories', type: 'directory' },
      { name: 'skills', type: 'directory' },
      { name: 'config.json', type: 'file' },
    ])
  })

  it('returns empty array when directory is empty or missing', async () => {
    mockRunCommand.mockResolvedValue({ stdout: '', stderr: '', code: 0 })
    const result = await listDirectory(config, '~/.openclaw/agents/hal/memories')
    expect(result).toEqual([])
  })
})

describe('runHygieneCheck', () => {
  it('returns stdout from the openclaw check command', async () => {
    mockRunCommand.mockResolvedValue({ stdout: 'All checks passed\n', stderr: '', code: 0 })
    const result = await runHygieneCheck(config)
    expect(result).toContain('All checks passed')
  })
})

describe('sendChatMessage', () => {
  it('returns the response from the OpenClaw agent', async () => {
    mockRunCommand.mockResolvedValue({
      stdout: '{"reply": "Hello from hal"}',
      stderr: '',
      code: 0,
    })
    const result = await sendChatMessage(config, 'hal', 'Hello')
    expect(result).toContain('Hello from hal')
  })
})
```

**Step 2: Run test to verify it fails**

```bash
npm run test:run -- lib/__tests__/openclaw.test.ts
```

Expected: FAIL — `Cannot find module '../openclaw'`

**Step 3: Implement `lib/openclaw.ts`**

```typescript
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
```

**Step 4: Run test to verify it passes**

```bash
npm run test:run -- lib/__tests__/openclaw.test.ts
```

Expected: PASS — 7 tests pass

**Step 5: Commit**

```bash
git add lib/openclaw.ts lib/__tests__/openclaw.test.ts
git commit -m "feat: add OpenClaw module with agent listing, directory browsing, and chat"
```

---

## Task 7: Instances module

**Files:**
- Create: `lib/instances.ts`
- Create: `lib/__tests__/instances.test.ts`

**Step 1: Write the failing test**

Create `lib/__tests__/instances.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetSecret = vi.fn()
const mockListDroplets = vi.fn()
const mockGetBotName = vi.fn()

vi.mock('../1password', () => ({ getSecret: mockGetSecret }))
vi.mock('../digitalocean', () => ({ listOpenClawDroplets: mockListDroplets }))
vi.mock('../mapping', () => ({ getBotName: mockGetBotName }))

const { listInstances, getInstance, resolveInstance } = await import('../instances')

const fakeDroplets = [
  { id: 123, name: 'open-claw-hal', ip: '1.2.3.4' },
  { id: 456, name: 'open-claw-marvin', ip: '5.6.7.8' },
]

describe('listInstances', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.DO_API_TOKEN_OP_REF = 'op://AI-Agents/do-token/credential'
    mockGetSecret.mockResolvedValue('do-api-token-value')
    mockListDroplets.mockResolvedValue(fakeDroplets)
    mockGetBotName.mockImplementation((name: string) =>
      name === 'open-claw-hal' ? 'hal' : name === 'open-claw-marvin' ? 'marvin' : null
    )
  })

  it('returns resolved instances for all mapped droplets', async () => {
    const result = await listInstances()
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({
      id: 'open-claw-hal',
      label: 'hal',
      ip: '1.2.3.4',
      sshKeyRef: 'op://AI-Agents/hal - SSH Private Key/private key',
    })
  })

  it('skips droplets with no name mapping', async () => {
    mockGetBotName.mockReturnValue(null)
    const result = await listInstances()
    expect(result).toHaveLength(0)
  })
})

describe('getInstance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.DO_API_TOKEN_OP_REF = 'op://AI-Agents/do-token/credential'
    mockGetSecret.mockResolvedValue('do-api-token-value')
    mockListDroplets.mockResolvedValue(fakeDroplets)
    mockGetBotName.mockImplementation((name: string) =>
      name === 'open-claw-hal' ? 'hal' : null
    )
  })

  it('returns instance by id', async () => {
    const result = await getInstance('open-claw-hal')
    expect(result?.label).toBe('hal')
  })

  it('returns null for unknown id', async () => {
    const result = await getInstance('nonexistent')
    expect(result).toBeNull()
  })
})
```

**Step 2: Run test to verify it fails**

```bash
npm run test:run -- lib/__tests__/instances.test.ts
```

Expected: FAIL — `Cannot find module '../instances'`

**Step 3: Implement `lib/instances.ts`**

```typescript
import { getSecret } from './1password'
import { listOpenClawDroplets } from './digitalocean'
import { getBotName } from './mapping'

export interface Instance {
  id: string       // DO droplet name (used as stable ID)
  label: string    // Bot name from 1Password mapping
  ip: string
  dropletId: number
  sshKeyRef: string // op:// reference — not the key itself
}

export interface ResolvedInstance extends Instance {
  sshKey: string   // Actual private key value, fetched from 1Password
}

export async function listInstances(): Promise<Instance[]> {
  const doToken = await getSecret(process.env.DO_API_TOKEN_OP_REF!)
  const droplets = await listOpenClawDroplets(doToken)

  return droplets
    .map((droplet): Instance | null => {
      const botName = getBotName(droplet.name)
      if (!botName) {
        console.warn(`[reef] No name mapping for droplet: ${droplet.name} — add it to config/name-map.json`)
        return null
      }
      return {
        id: droplet.name,
        label: botName,
        ip: droplet.ip,
        dropletId: droplet.id,
        sshKeyRef: `op://AI-Agents/${botName} - SSH Private Key/private key`,
      }
    })
    .filter((i): i is Instance => i !== null)
}

export async function getInstance(id: string): Promise<Instance | null> {
  const instances = await listInstances()
  return instances.find((i) => i.id === id) ?? null
}

/**
 * Like getInstance, but also fetches the SSH private key from 1Password.
 * Call this in API routes that need to SSH into the machine.
 */
export async function resolveInstance(id: string): Promise<ResolvedInstance | null> {
  const instance = await getInstance(id)
  if (!instance) return null
  const sshKey = await getSecret(instance.sshKeyRef)
  return { ...instance, sshKey }
}
```

**Step 4: Run all tests**

```bash
npm run test:run
```

Expected: All tests passing.

**Step 5: Commit**

```bash
git add lib/instances.ts lib/__tests__/instances.test.ts
git commit -m "feat: add instances module composing DO + 1Password + name mapping"
```

---

## Task 8: API routes

**Files:**
- Create: `app/api/instances/route.ts`
- Create: `app/api/instances/[id]/health/route.ts`
- Create: `app/api/instances/[id]/check/route.ts`
- Create: `app/api/instances/[id]/backup/route.ts`
- Create: `app/api/instances/[id]/agents/route.ts`
- Create: `app/api/instances/[id]/browse/route.ts`
- Create: `app/api/instances/[id]/agents/[agentId]/chat/route.ts`

All routes follow the same pattern: resolve instance → fetch credentials → do the operation → return JSON.

**Step 1: Create `app/api/instances/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { listInstances } from '@/lib/instances'

export async function GET() {
  try {
    const instances = await listInstances()
    return NextResponse.json(instances)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
```

**Step 2: Create `app/api/instances/[id]/health/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { resolveInstance } from '@/lib/instances'
import { getHealth } from '@/lib/openclaw'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const instance = await resolveInstance(id)
    if (!instance) return NextResponse.json({ error: 'Instance not found' }, { status: 404 })
    const health = await getHealth({ host: instance.ip, privateKey: instance.sshKey })
    return NextResponse.json(health)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
```

**Step 3: Create `app/api/instances/[id]/check/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { resolveInstance } from '@/lib/instances'
import { runHygieneCheck } from '@/lib/openclaw'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const instance = await resolveInstance(id)
    if (!instance) return NextResponse.json({ error: 'Instance not found' }, { status: 404 })
    const output = await runHygieneCheck({ host: instance.ip, privateKey: instance.sshKey })
    return NextResponse.json({ output })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
```

**Step 4: Create `app/api/instances/[id]/backup/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { resolveInstance } from '@/lib/instances'
import { backupDirectory } from '@/lib/ssh'
import { mkdir } from 'fs/promises'
import path from 'path'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const instance = await resolveInstance(id)
    if (!instance) return NextResponse.json({ error: 'Instance not found' }, { status: 404 })

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupDir = path.join(process.cwd(), 'backups', id)
    await mkdir(backupDir, { recursive: true })
    const localPath = path.join(backupDir, `${timestamp}.tar.gz`)

    await backupDirectory(
      { host: instance.ip, privateKey: instance.sshKey },
      '~/.openclaw',
      localPath
    )
    return NextResponse.json({ path: localPath, timestamp })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
```

**Step 5: Create `app/api/instances/[id]/agents/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { resolveInstance } from '@/lib/instances'
import { listAgents } from '@/lib/openclaw'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const instance = await resolveInstance(id)
    if (!instance) return NextResponse.json({ error: 'Instance not found' }, { status: 404 })
    const agents = await listAgents({ host: instance.ip, privateKey: instance.sshKey })
    return NextResponse.json(agents)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
```

**Step 6: Create `app/api/instances/[id]/browse/route.ts`**

Accepts `?path=~/.openclaw/agents/hal/memories` and returns the directory listing.

```typescript
import { NextResponse } from 'next/server'
import { resolveInstance } from '@/lib/instances'
import { listDirectory } from '@/lib/openclaw'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { searchParams } = new URL(req.url)
  const remotePath = searchParams.get('path')

  if (!remotePath) {
    return NextResponse.json({ error: 'path query param required' }, { status: 400 })
  }

  // Safety: only allow paths within ~/.openclaw/
  if (!remotePath.startsWith('~/.openclaw/') && remotePath !== '~/.openclaw') {
    return NextResponse.json({ error: 'path must be within ~/.openclaw/' }, { status: 400 })
  }

  try {
    const instance = await resolveInstance(id)
    if (!instance) return NextResponse.json({ error: 'Instance not found' }, { status: 404 })
    const entries = await listDirectory({ host: instance.ip, privateKey: instance.sshKey }, remotePath)
    return NextResponse.json(entries)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
```

**Step 7: Create `app/api/instances/[id]/agents/[agentId]/chat/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { resolveInstance } from '@/lib/instances'
import { sendChatMessage } from '@/lib/openclaw'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; agentId: string }> }
) {
  const { id, agentId } = await params
  try {
    const { message } = await req.json()
    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'message is required' }, { status: 400 })
    }
    const instance = await resolveInstance(id)
    if (!instance) return NextResponse.json({ error: 'Instance not found' }, { status: 404 })
    const response = await sendChatMessage(
      { host: instance.ip, privateKey: instance.sshKey },
      agentId,
      message
    )
    return NextResponse.json({ response })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
```

**Step 8: Smoke test the API**

```bash
npm run dev
curl http://localhost:3000/api/instances
```

Expected: JSON array (or error message about missing credentials).

**Step 9: Commit**

```bash
git add app/api/
git commit -m "feat: add all API routes including agent listing, directory browse, and agent chat"
```

---

## Task 9: Dashboard — machine + agent tree UI

The dashboard shows machines as expandable rows. Expanding a machine loads its agents. Expanding an agent shows its directory tree.

**Files:**
- Modify: `app/page.tsx`
- Create: `app/components/MachineRow.tsx`
- Create: `app/components/AgentRow.tsx`
- Create: `app/components/DirectoryNode.tsx`

**Step 1: Create `app/components/DirectoryNode.tsx`**

Recursive component: renders a file/directory entry. Directories can be expanded to load their children.

```tsx
'use client'

import { useState } from 'react'

interface FileEntry {
  name: string
  type: 'file' | 'directory'
}

interface Props {
  instanceId: string
  path: string          // full remote path of this node
  name: string
  type: 'file' | 'directory'
  depth?: number
}

export function DirectoryNode({ instanceId, path, name, type, depth = 0 }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [children, setChildren] = useState<FileEntry[] | null>(null)
  const [loading, setLoading] = useState(false)

  async function toggle() {
    if (type !== 'directory') return
    if (expanded) { setExpanded(false); return }
    if (!children) {
      setLoading(true)
      try {
        const res = await fetch(
          `/api/instances/${instanceId}/browse?path=${encodeURIComponent(path)}`
        )
        const data = await res.json()
        setChildren(data)
      } finally {
        setLoading(false)
      }
    }
    setExpanded(true)
  }

  const indent = depth * 16

  return (
    <div>
      <div
        className={`flex items-center gap-1.5 py-0.5 px-2 rounded text-sm hover:bg-gray-100 ${type === 'directory' ? 'cursor-pointer' : 'cursor-default text-gray-600'}`}
        style={{ paddingLeft: `${8 + indent}px` }}
        onClick={toggle}
      >
        <span className="text-gray-400 w-3 text-center text-xs">
          {type === 'directory' ? (loading ? '⋯' : expanded ? '▾' : '▸') : '·'}
        </span>
        <span className={type === 'directory' ? 'text-blue-700 font-medium' : 'text-gray-700'}>
          {name}
          {type === 'directory' ? '/' : ''}
        </span>
      </div>
      {expanded && children && (
        <div>
          {children.length === 0 && (
            <div className="text-xs text-gray-400 italic" style={{ paddingLeft: `${24 + indent}px` }}>
              empty
            </div>
          )}
          {children.map((child) => (
            <DirectoryNode
              key={child.name}
              instanceId={instanceId}
              path={`${path}/${child.name}`}
              name={child.name}
              type={child.type}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}
```

**Step 2: Create `app/components/AgentRow.tsx`**

```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { DirectoryNode } from './DirectoryNode'

interface Props {
  instanceId: string
  agentId: string
}

export function AgentRow({ instanceId, agentId }: Props) {
  const [expanded, setExpanded] = useState(false)

  const agentPath = `~/.openclaw/agents/${agentId}`

  return (
    <div className="border-l-2 border-gray-100 ml-4">
      <div className="flex items-center justify-between py-1.5 px-3 hover:bg-gray-50 rounded">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 text-sm font-medium text-gray-800"
        >
          <span className="text-gray-400 text-xs w-3 text-center">
            {expanded ? '▾' : '▸'}
          </span>
          <span className="font-mono">{agentId}</span>
        </button>
        <Link
          href={`/instances/${instanceId}/agents/${agentId}/chat`}
          className="text-xs px-2 py-1 rounded bg-purple-50 text-purple-700 hover:bg-purple-100 font-medium"
        >
          Chat
        </Link>
      </div>

      {expanded && (
        <div className="pb-1">
          <DirectoryNode
            instanceId={instanceId}
            path={agentPath}
            name={agentId}
            type="directory"
            depth={0}
          />
        </div>
      )}
    </div>
  )
}
```

**Step 3: Create `app/components/MachineRow.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { AgentRow } from './AgentRow'

interface Instance {
  id: string
  label: string
  ip: string
}

interface HealthResult {
  processRunning: boolean
  disk: string
  memory: string
  uptime: string
}

export function MachineRow({ instance }: { instance: Instance }) {
  const [expanded, setExpanded] = useState(false)
  const [agents, setAgents] = useState<string[] | null>(null)
  const [health, setHealth] = useState<HealthResult | null>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function expand() {
    if (expanded) { setExpanded(false); return }
    if (!agents) {
      setLoading('agents')
      try {
        const res = await fetch(`/api/instances/${instance.id}/agents`)
        const data = await res.json()
        setAgents(res.ok ? data : [])
      } finally {
        setLoading(null)
      }
    }
    setExpanded(true)
  }

  async function checkHealth() {
    setLoading('health')
    setError(null)
    try {
      const res = await fetch(`/api/instances/${instance.id}/health`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setHealth(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(null)
    }
  }

  async function runCheck() {
    setLoading('check')
    setError(null)
    try {
      const res = await fetch(`/api/instances/${instance.id}/check`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      alert(data.output) // simple output display for v1
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(null)
    }
  }

  async function backup() {
    setLoading('backup')
    setError(null)
    try {
      const res = await fetch(`/api/instances/${instance.id}/backup`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      alert(`Backup saved: ${data.path}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(null)
    }
  }

  const statusColor = health === null
    ? 'bg-gray-300'
    : health.processRunning
    ? 'bg-green-500'
    : 'bg-red-500'

  return (
    <div className="border border-gray-200 rounded-lg bg-white shadow-sm overflow-hidden">
      {/* Machine header */}
      <div className="flex items-center justify-between px-4 py-3">
        <button
          onClick={expand}
          className="flex items-center gap-3 text-left"
        >
          <span className="text-gray-400 text-xs w-3">
            {loading === 'agents' ? '⋯' : expanded ? '▾' : '▸'}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${statusColor}`} />
              <span className="font-semibold text-gray-900">{instance.label}</span>
            </div>
            <span className="text-xs text-gray-500 font-mono">{instance.ip}</span>
          </div>
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={checkHealth}
            disabled={!!loading}
            className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50"
          >
            {loading === 'health' ? '…' : 'Health'}
          </button>
          <button
            onClick={runCheck}
            disabled={!!loading}
            className="text-xs px-2 py-1 rounded bg-yellow-50 text-yellow-700 hover:bg-yellow-100 disabled:opacity-50"
          >
            {loading === 'check' ? '…' : 'Hygiene'}
          </button>
          <button
            onClick={backup}
            disabled={!!loading}
            className="text-xs px-2 py-1 rounded bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50"
          >
            {loading === 'backup' ? '…' : 'Backup'}
          </button>
        </div>
      </div>

      {/* Health summary (shown after check) */}
      {health && (
        <div className="px-4 pb-2 text-xs text-gray-500 font-mono flex gap-4">
          <span>disk: {health.disk}</span>
          <span>mem: {health.memory}</span>
          <span>{health.uptime}</span>
        </div>
      )}

      {error && (
        <div className="px-4 pb-2 text-xs text-red-600">{error}</div>
      )}

      {/* Agent tree */}
      {expanded && (
        <div className="border-t border-gray-100 py-2">
          {agents && agents.length === 0 && (
            <p className="text-xs text-gray-400 italic px-6 py-1">
              No agents found in ~/.openclaw/agents/
            </p>
          )}
          {agents?.map((agentId) => (
            <AgentRow key={agentId} instanceId={instance.id} agentId={agentId} />
          ))}
        </div>
      )}
    </div>
  )
}
```

**Step 4: Replace `app/page.tsx`**

```tsx
import { MachineRow } from './components/MachineRow'

interface Instance {
  id: string
  label: string
  ip: string
}

async function getInstances(): Promise<Instance[]> {
  try {
    const res = await fetch('http://localhost:3000/api/instances', {
      cache: 'no-store',
    })
    if (!res.ok) return []
    return res.json()
  } catch {
    return []
  }
}

export default async function DashboardPage() {
  const instances = await getInstances()

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">reef</h1>
          <p className="text-sm text-gray-500">OpenClaw instance management</p>
        </div>

        {instances.length === 0 ? (
          <div className="text-sm text-gray-500 bg-white border border-gray-200 rounded-lg p-6">
            No instances found. Check that:
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li><code>.env.local</code> has <code>OP_SERVICE_ACCOUNT_TOKEN</code> and <code>DO_API_TOKEN_OP_REF</code></li>
              <li>Your Digital Ocean droplets are tagged <code>openclaw</code></li>
              <li>Droplet names are mapped in <code>config/name-map.json</code></li>
            </ul>
          </div>
        ) : (
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
```

**Step 5: Verify in browser**

```bash
npm run dev
```

Open http://localhost:3000. Each machine should appear as a collapsible row. Clicking it loads agents. Expanding an agent shows the directory tree.

**Step 6: Commit**

```bash
git add app/page.tsx app/components/
git commit -m "feat: add expandable machine/agent/directory tree dashboard"
```

---

## Task 10: Chat page (agent-scoped)

**Files:**
- Create: `app/instances/[id]/agents/[agentId]/chat/page.tsx`

**Step 1: Create the directory**

```bash
mkdir -p "app/instances/[id]/agents/[agentId]/chat"
```

**Step 2: Create `app/instances/[id]/agents/[agentId]/chat/page.tsx`**

```tsx
'use client'

import { useState, useRef, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

interface Message {
  role: 'user' | 'agent'
  content: string
  timestamp: string
}

export default function ChatPage() {
  const { id, agentId } = useParams<{ id: string; agentId: string }>()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send() {
    if (!input.trim() || sending) return

    const userMsg: Message = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toLocaleTimeString(),
    }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setSending(true)

    try {
      const res = await fetch(`/api/instances/${id}/agents/${agentId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg.content }),
      })
      const data = await res.json()
      setMessages((prev) => [
        ...prev,
        {
          role: 'agent',
          content: res.ok ? data.response : `Error: ${data.error}`,
          timestamp: new Date().toLocaleTimeString(),
        },
      ])
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'agent',
          content: `Error: ${e instanceof Error ? e.message : 'Unknown error'}`,
          timestamp: new Date().toLocaleTimeString(),
        },
      ])
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-2 text-sm">
        <Link href="/" className="text-gray-400 hover:text-gray-900">reef</Link>
        <span className="text-gray-300">/</span>
        <span className="text-gray-500 font-mono">{id}</span>
        <span className="text-gray-300">/</span>
        <span className="font-medium text-gray-900 font-mono">{agentId}</span>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-sm text-gray-400 text-center pt-8">
            Chatting with <span className="font-mono font-medium">{agentId}</span> on <span className="font-mono">{id}</span>
          </p>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-lg rounded-lg px-4 py-2 text-sm ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-900'
              }`}
            >
              <pre className="whitespace-pre-wrap font-sans">{msg.content}</pre>
              <p className={`text-xs mt-1 ${msg.role === 'user' ? 'text-blue-200' : 'text-gray-400'}`}>
                {msg.timestamp}
              </p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="bg-white border-t border-gray-200 px-6 py-4">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
            }}
            placeholder="Message the agent… (Enter to send, Shift+Enter for newline)"
            rows={2}
            className="flex-1 resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={send}
            disabled={sending || !input.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {sending ? '…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

**Step 3: Verify in browser**

Navigate to http://localhost:3000, expand a machine, expand an agent, click Chat. Should navigate to the chat page pre-scoped to that agent.

**Step 4: Commit**

```bash
git add "app/instances/"
git commit -m "feat: add agent-scoped chat page"
```

---

## Task 11: Final smoke test and README

**Step 1: Run all tests**

```bash
npm run test:run
```

Expected: All tests pass.

**Step 2: Run the dev server end to end**

```bash
npm run dev
```

With real credentials in `.env.local`:
- Dashboard loads and shows machines from Digital Ocean
- Expanding a machine loads its agents from `~/.openclaw/agents/`
- Expanding an agent shows the directory tree (memories/, skills/)
- Health/Hygiene/Backup buttons work on each machine
- Chat button navigates to the agent chat page

**Step 3: Create `README.md`**

```markdown
# reef

Management console for OpenClaw instances running on Digital Ocean.

## Setup

1. Copy `.env.local.example` to `.env.local` and fill in values.

2. Tag your Digital Ocean droplets with `openclaw`.

3. Add droplet → bot name mappings to `config/name-map.json`.

4. In 1Password (`AI-Agents` vault), ensure each bot has an item named
   `<bot-name> - SSH Private Key` with a `private key` field.

5. `npm install && npm run dev` → http://localhost:3000

## Known TODOs

- `lib/mapping.ts` — replace JSON map with DO tags or naming convention
- `lib/openclaw.ts` — confirm OpenClaw hygiene check CLI command name
- `lib/openclaw.ts` — confirm OpenClaw HTTP API port + agent routing for chat
```

**Step 4: Final commit**

```bash
git add README.md
git commit -m "docs: add README with setup instructions"
```
