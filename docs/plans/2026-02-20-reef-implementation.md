# Reef Management Console — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Next.js web dashboard that discovers OpenClaw instances via Digital Ocean, fetches SSH credentials from 1Password, and lets you check health, run hygiene checks, take backups, and chat with each agent.

**Architecture:** Next.js 15 App Router monolith. All business logic in framework-agnostic `lib/` modules. API routes are thin wrappers. Per-request SSH connections via `ssh2` — no persistent tunnels.

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS, `ssh2`, `@1password/sdk`, Digital Ocean v2 REST API, Vitest

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

// Import after mocking
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

The `ssh2` library is callback-based and hard to unit test without a real server. We test the module shape and mock the happy path.

Create `lib/__tests__/ssh.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'

// Mock ssh2 before importing the module under test
vi.mock('ssh2', () => {
  const makeStream = (stdout: string, exitCode: number) => {
    const handlers: Record<string, Function> = {}
    const stderrHandlers: Record<string, Function> = {}

    const stream = {
      on: vi.fn((event: string, handler: Function) => {
        handlers[event] = handler
        // Simulate async data + close
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
      .on('error', (err) => {
        reject(err)
      })
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
 * The remote .tar.gz is written to /tmp/reef-backup.tar.gz then deleted.
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

**Files:**
- Create: `lib/openclaw.ts`
- Create: `lib/__tests__/openclaw.test.ts`

**Step 1: Write the failing test**

Create `lib/__tests__/openclaw.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'

const mockRunCommand = vi.fn()
vi.mock('../ssh', () => ({ runCommand: mockRunCommand }))

import { getHealth, runHygieneCheck, sendChatMessage } from '../openclaw'

const config = { host: '1.2.3.4', privateKey: 'fake-key' }

describe('getHealth', () => {
  it('returns processRunning: true when systemctl says active', async () => {
    mockRunCommand
      .mockResolvedValueOnce({ stdout: 'active\n', stderr: '', code: 0 })  // process check
      .mockResolvedValueOnce({ stdout: '/ 20G 8G 12G 40%', stderr: '', code: 0 }) // disk
      .mockResolvedValueOnce({ stdout: 'Mem: 2G 1G 1G', stderr: '', code: 0 })    // mem
      .mockResolvedValueOnce({ stdout: 'up 3 days', stderr: '', code: 0 })         // uptime

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

describe('runHygieneCheck', () => {
  it('returns combined stdout from the openclaw check command', async () => {
    mockRunCommand.mockResolvedValue({ stdout: 'All checks passed\n', stderr: '', code: 0 })
    const result = await runHygieneCheck(config)
    expect(result).toContain('All checks passed')
  })
})

describe('sendChatMessage', () => {
  it('returns the response from the OpenClaw agent', async () => {
    mockRunCommand.mockResolvedValue({
      stdout: '{"reply": "Hello from agent"}',
      stderr: '',
      code: 0,
    })
    const result = await sendChatMessage(config, 'Hello')
    expect(result).toContain('Hello from agent')
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

/**
 * Checks the health of an OpenClaw instance via SSH.
 * Runs four commands in parallel: process check, disk, memory, uptime.
 */
export async function getHealth(config: SshConfig): Promise<HealthResult> {
  const [processResult, diskResult, memResult, uptimeResult] = await Promise.all([
    runCommand(
      config,
      // Try systemctl first, fall back to pgrep
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
 * Runs OpenClaw's built-in hygiene/security check via SSH CLI.
 *
 * TODO: Confirm the exact OpenClaw CLI command for hygiene/security checks.
 *       Current placeholder: `openclaw check`
 */
export async function runHygieneCheck(config: SshConfig): Promise<string> {
  const result = await runCommand(
    config,
    // TODO: replace with actual OpenClaw hygiene command
    'openclaw check 2>&1 || echo "[reef] openclaw check command not found — update lib/openclaw.ts"'
  )
  return result.stdout + result.stderr
}

/**
 * Sends a message to the OpenClaw agent by SSH-ing in and curl-ing
 * the local OpenClaw HTTP API.
 *
 * TODO: Confirm OpenClaw's local HTTP API port and endpoint.
 *       Current placeholder: localhost:3000/api/chat
 * TODO: Consider switching to a proper SSH tunnel + fetch for streaming.
 */
export async function sendChatMessage(
  config: SshConfig,
  message: string
): Promise<string> {
  const OPENCLAW_PORT = 3000 // TODO: confirm actual port
  const escaped = message.replace(/\\/g, '\\\\').replace(/'/g, "'\\''")

  const result = await runCommand(
    config,
    `curl -s -X POST http://localhost:${OPENCLAW_PORT}/api/chat ` +
    `-H 'Content-Type: application/json' ` +
    `-d '{"message": "${escaped}"}' 2>&1`
  )
  return result.stdout
}
```

**Step 4: Run test to verify it passes**

```bash
npm run test:run -- lib/__tests__/openclaw.test.ts
```

Expected: PASS — 4 tests pass

**Step 5: Commit**

```bash
git add lib/openclaw.ts lib/__tests__/openclaw.test.ts
git commit -m "feat: add OpenClaw module for health, hygiene checks, and chat"
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

**Step 4: Run test to verify it passes**

```bash
npm run test:run -- lib/__tests__/instances.test.ts
```

Expected: PASS — 4 tests pass

**Step 5: Run all tests**

```bash
npm run test:run
```

Expected: All tests passing.

**Step 6: Commit**

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
- Create: `app/api/instances/[id]/chat/route.ts`

All routes follow the same pattern: resolve instance → fetch credentials → do the operation → return JSON. No tests for these (they're thin wrappers over tested lib modules).

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
    if (!instance) {
      return NextResponse.json({ error: 'Instance not found' }, { status: 404 })
    }
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
    if (!instance) {
      return NextResponse.json({ error: 'Instance not found' }, { status: 404 })
    }
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
    if (!instance) {
      return NextResponse.json({ error: 'Instance not found' }, { status: 404 })
    }

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

**Step 5: Create `app/api/instances/[id]/chat/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { resolveInstance } from '@/lib/instances'
import { sendChatMessage } from '@/lib/openclaw'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const { message } = await req.json()
    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'message is required' }, { status: 400 })
    }

    const instance = await resolveInstance(id)
    if (!instance) {
      return NextResponse.json({ error: 'Instance not found' }, { status: 404 })
    }

    const response = await sendChatMessage(
      { host: instance.ip, privateKey: instance.sshKey },
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

**Step 6: Start dev server and smoke test the instances endpoint**

```bash
npm run dev
# In another terminal:
curl http://localhost:3000/api/instances
```

Expected: JSON array (may be empty if `.env.local` isn't configured yet, or an error message explaining why).

**Step 7: Commit**

```bash
git add app/api/
git commit -m "feat: add API routes for instances, health, check, backup, and chat"
```

---

## Task 9: Dashboard page

**Files:**
- Modify: `app/page.tsx` (replace default Next.js page)
- Create: `app/components/InstanceCard.tsx`

**Step 1: Create `app/components/InstanceCard.tsx`**

```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'

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

export function InstanceCard({ instance }: { instance: Instance }) {
  const [health, setHealth] = useState<HealthResult | null>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function callAction(action: string) {
    setLoading(action)
    setError(null)
    try {
      const res = await fetch(`/api/instances/${instance.id}/${action}`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      if (action === 'health') setHealth(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-gray-900">{instance.label}</h2>
          <p className="text-sm text-gray-500 font-mono">{instance.ip}</p>
        </div>
        <span
          className={`h-2.5 w-2.5 rounded-full ${
            health?.processRunning === true
              ? 'bg-green-500'
              : health?.processRunning === false
              ? 'bg-red-500'
              : 'bg-gray-300'
          }`}
        />
      </div>

      {health && (
        <div className="text-xs text-gray-600 space-y-1 bg-gray-50 rounded p-2 font-mono">
          <div>disk: {health.disk}</div>
          <div>mem: {health.memory}</div>
          <div>up: {health.uptime}</div>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-600 bg-red-50 rounded p-2">{error}</p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => callAction('health')}
          disabled={loading === 'health'}
          className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50"
        >
          {loading === 'health' ? '…' : 'Health'}
        </button>
        <button
          onClick={() => callAction('check')}
          disabled={loading === 'check'}
          className="text-xs px-2 py-1 rounded bg-yellow-50 text-yellow-700 hover:bg-yellow-100 disabled:opacity-50"
        >
          {loading === 'check' ? '…' : 'Hygiene Check'}
        </button>
        <button
          onClick={() => callAction('backup')}
          disabled={loading === 'backup'}
          className="text-xs px-2 py-1 rounded bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50"
        >
          {loading === 'backup' ? '…' : 'Backup'}
        </button>
        <Link
          href={`/instances/${instance.id}/chat`}
          className="text-xs px-2 py-1 rounded bg-purple-50 text-purple-700 hover:bg-purple-100"
        >
          Chat
        </Link>
      </div>
    </div>
  )
}
```

**Step 2: Replace `app/page.tsx`**

```tsx
import { InstanceCard } from './components/InstanceCard'

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
      <div className="max-w-5xl mx-auto space-y-6">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {instances.map((instance) => (
              <InstanceCard key={instance.id} instance={instance} />
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
```

**Step 3: Verify in browser**

```bash
npm run dev
```

Open http://localhost:3000 — should show the dashboard (empty state if not configured, cards if credentials are set up).

**Step 4: Commit**

```bash
git add app/page.tsx app/components/InstanceCard.tsx
git commit -m "feat: add dashboard with instance cards and action buttons"
```

---

## Task 10: Chat page

**Files:**
- Create: `app/instances/[id]/chat/page.tsx`

**Step 1: Create `app/instances/[id]/chat/page.tsx`**

```tsx
'use client'

import { useState, useRef, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

interface Message {
  role: 'user' | 'agent'
  content: string
  timestamp: string
}

export default function ChatPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send() {
    if (!input.trim() || sending) return

    const userMessage: Message = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toLocaleTimeString(),
    }
    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setSending(true)

    try {
      const res = await fetch(`/api/instances/${id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage.content }),
      })
      const data = await res.json()
      const agentMessage: Message = {
        role: 'agent',
        content: res.ok ? data.response : `Error: ${data.error}`,
        timestamp: new Date().toLocaleTimeString(),
      }
      setMessages((prev) => [...prev, agentMessage])
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
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3">
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-900">
          ← reef
        </Link>
        <span className="text-gray-300">/</span>
        <span className="text-sm font-medium text-gray-900 font-mono">{id}</span>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-sm text-gray-400 text-center pt-8">
            Send a message to the OpenClaw agent on this instance.
          </p>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
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
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
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

**Step 2: Verify in browser**

Navigate to http://localhost:3000/instances/open-claw-hal/chat (use a real instance ID). The chat UI should render. Sending a message will attempt to SSH and curl the OpenClaw agent.

**Step 3: Commit**

```bash
git add app/instances/
git commit -m "feat: add chat page for messaging OpenClaw agents"
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

Configure `.env.local` with real credentials. Verify:
- Dashboard loads and shows instances from Digital Ocean
- Health check button SSHs in and returns results
- Chat page renders and attempts to reach the OpenClaw agent

**Step 3: Create `README.md`**

```markdown
# reef

Management console for OpenClaw instances running on Digital Ocean.

## Setup

1. Copy `.env.local.example` to `.env.local` and fill in:
   - `OP_SERVICE_ACCOUNT_TOKEN` — 1Password service account token
   - `DO_API_TOKEN_OP_REF` — op:// reference to your DO API token in 1Password

2. Tag your Digital Ocean droplets with `openclaw`

3. Add droplet → bot name mappings to `config/name-map.json`:
   ```json
   { "open-claw-hal": "hal" }
   ```

4. In 1Password (`AI-Agents` vault), ensure each bot has an item named `<bot-name> - SSH Private Key` with a `private key` field.

5. Run:
   ```bash
   npm install
   npm run dev
   ```

Open http://localhost:3000.

## Known TODOs

- `lib/mapping.ts` — replace static JSON map with DO tags or naming convention
- `lib/openclaw.ts` — confirm OpenClaw hygiene check CLI command
- `lib/openclaw.ts` — confirm OpenClaw local HTTP API port and endpoint for chat
```

**Step 4: Final commit**

```bash
git add README.md
git commit -m "docs: add README with setup instructions"
```
