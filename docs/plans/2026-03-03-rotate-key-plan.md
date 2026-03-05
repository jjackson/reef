# Rotate Key Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `reef rotate-key <instance> <key>` — pushes a new Anthropic API key to all agents on an instance, restarts the gateway, and saves the key to 1Password.

**Architecture:** Adds `saveApiKey()` to `lib/1password.ts` (follows existing `saveChannelToken` pattern), adds `rotateKey()` to `lib/openclaw.ts` (orchestrates: list agents → set key per agent → restart → save to 1Password), wires CLI command and API route.

**Tech Stack:** TypeScript, SSH via `lib/ssh.ts`, 1Password SDK, Next.js API routes, Vitest

---

### Task 1: Add `saveApiKey()` to 1Password module

**Files:**
- Modify: `lib/1password.ts` (add function after `saveChannelToken` ~line 78)
- Test: `lib/__tests__/openclaw.test.ts` (we'll test via integration in Task 3)

**Step 1: Write the failing test**

Add to `lib/__tests__/1password.test.ts` (create file):

```typescript
import { describe, it, expect, vi } from 'vitest'

const mockClient = {
  vaults: { list: vi.fn() },
  items: { list: vi.fn(), create: vi.fn(), delete: vi.fn() },
}

vi.mock('@1password/sdk', () => ({
  createClient: vi.fn().mockResolvedValue(mockClient),
  ItemCategory: { ApiCredentials: 'API_CREDENTIAL' },
  ItemFieldType: { Concealed: 'CONCEALED' },
}))

// Must set env before importing
process.env.OP_SERVICE_ACCOUNT_TOKEN = 'test-token'

import { saveApiKey } from '../1password'

describe('saveApiKey', () => {
  it('creates a 1Password item with the correct title and credential field', async () => {
    mockClient.vaults.list.mockResolvedValue([{ id: 'vault-1', title: 'AI-Agents' }])
    mockClient.items.list.mockResolvedValue([])
    mockClient.items.create.mockResolvedValue({ id: 'item-1', title: 'Hal - Anthropic API Key' })

    const result = await saveApiKey('Hal', 'sk-ant-test-key')

    expect(result.title).toBe('Hal - Anthropic API Key')
    expect(mockClient.items.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Hal - Anthropic API Key',
        fields: [expect.objectContaining({ id: 'credential', value: 'sk-ant-test-key' })],
      })
    )
  })

  it('deletes existing item with same title before creating', async () => {
    mockClient.vaults.list.mockResolvedValue([{ id: 'vault-1', title: 'AI-Agents' }])
    mockClient.items.list.mockResolvedValue([{ id: 'old-item', title: 'Hal - Anthropic API Key' }])
    mockClient.items.create.mockResolvedValue({ id: 'item-2', title: 'Hal - Anthropic API Key' })

    await saveApiKey('Hal', 'sk-ant-new-key')

    expect(mockClient.items.delete).toHaveBeenCalledWith('vault-1', 'old-item')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/1password.test.ts`
Expected: FAIL — `saveApiKey` is not exported from `../1password`

**Step 3: Write the implementation**

Add to `lib/1password.ts` after `saveChannelToken` (after line 78):

```typescript
export async function saveApiKey(
  displayName: string,
  apiKey: string
): Promise<{ id: string; title: string }> {
  const client = await getClient()
  const vaultId = await getVaultId()
  const title = `${displayName} - Anthropic API Key`

  // Delete existing items with the same title to avoid duplicates
  const existing = await client.items.list(vaultId)
  for (const item of existing) {
    if (item.title === title) {
      await client.items.delete(vaultId, item.id)
    }
  }

  const item = await client.items.create({
    category: ItemCategory.ApiCredentials,
    vaultId,
    title,
    fields: [{
      id: 'credential',
      title: 'credential',
      value: apiKey,
      fieldType: ItemFieldType.Concealed,
    }],
  })
  return { id: item.id, title: item.title }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run lib/__tests__/1password.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/1password.ts lib/__tests__/1password.test.ts
git commit -m "feat: add saveApiKey to 1Password module"
```

---

### Task 2: Add `rotateKey()` to openclaw module

**Files:**
- Modify: `lib/openclaw.ts` (add interface + function after `setApiKey` ~line 709)
- Test: `lib/__tests__/openclaw.test.ts` (add describe block)

**Step 1: Write the failing test**

Add to `lib/__tests__/openclaw.test.ts`:

```typescript
// At top of file, add to the hoisted mocks:
const { mockRunCommand, mockSaveApiKey } = vi.hoisted(() => ({
  mockRunCommand: vi.fn(),
  mockSaveApiKey: vi.fn(),
}))
vi.mock('../ssh', () => ({ runCommand: mockRunCommand }))
vi.mock('../1password', () => ({ saveApiKey: mockSaveApiKey }))

// Add to imports:
import { rotateKey } from '../openclaw'
```

Then the test block:

```typescript
describe('rotateKey', () => {
  beforeEach(() => {
    mockRunCommand.mockReset()
    mockSaveApiKey.mockReset()
  })

  it('sets key on all discovered agents, restarts, and saves to 1Password', async () => {
    // listAgents: openclaw agents list --json
    mockRunCommand.mockResolvedValueOnce({
      stdout: JSON.stringify([
        { id: 'main', identityName: 'Hal', identityEmoji: '', workspace: '', agentDir: '', model: '', isDefault: true },
        { id: 'scout', identityName: 'Scout', identityEmoji: '', workspace: '', agentDir: '', model: '', isDefault: false },
      ]),
      stderr: '', code: 0,
    })
    // setApiKey for 'main': read existing + write
    mockRunCommand.mockResolvedValueOnce({ stdout: '{}', stderr: '', code: 0 })  // cat existing
    mockRunCommand.mockResolvedValueOnce({ stdout: '', stderr: '', code: 0 })     // mkdir
    mockRunCommand.mockResolvedValueOnce({ stdout: '', stderr: '', code: 0 })     // write
    // setApiKey for 'scout': read existing + write
    mockRunCommand.mockResolvedValueOnce({ stdout: '{}', stderr: '', code: 0 })  // cat existing
    mockRunCommand.mockResolvedValueOnce({ stdout: '', stderr: '', code: 0 })     // mkdir
    mockRunCommand.mockResolvedValueOnce({ stdout: '', stderr: '', code: 0 })     // write
    // restart gateway
    mockRunCommand.mockResolvedValueOnce({ stdout: '', stderr: '', code: 0 })

    mockSaveApiKey.mockResolvedValue({ id: 'item-1', title: 'Hal - Anthropic API Key' })

    const result = await rotateKey(config, 'sk-ant-key-123', 'Hal')

    expect(result.success).toBe(true)
    expect(result.agents).toEqual(['main', 'scout'])
    expect(result.failedAgents).toEqual([])
    expect(result.restarted).toBe(true)
    expect(result.savedTo1Password).toBe(true)
    expect(mockSaveApiKey).toHaveBeenCalledWith('Hal', 'sk-ant-key-123')
  })

  it('reports partial failure when one agent fails', async () => {
    mockRunCommand.mockResolvedValueOnce({
      stdout: JSON.stringify([
        { id: 'main', identityName: 'Hal', identityEmoji: '', workspace: '', agentDir: '', model: '', isDefault: true },
        { id: 'broken', identityName: 'Broken', identityEmoji: '', workspace: '', agentDir: '', model: '', isDefault: false },
      ]),
      stderr: '', code: 0,
    })
    // main: success
    mockRunCommand.mockResolvedValueOnce({ stdout: '{}', stderr: '', code: 0 })
    mockRunCommand.mockResolvedValueOnce({ stdout: '', stderr: '', code: 0 })
    mockRunCommand.mockResolvedValueOnce({ stdout: '', stderr: '', code: 0 })
    // broken: write fails
    mockRunCommand.mockResolvedValueOnce({ stdout: '{}', stderr: '', code: 0 })
    mockRunCommand.mockResolvedValueOnce({ stdout: '', stderr: '', code: 0 })
    mockRunCommand.mockResolvedValueOnce({ stdout: '', stderr: 'Permission denied', code: 1 })
    // restart gateway
    mockRunCommand.mockResolvedValueOnce({ stdout: '', stderr: '', code: 0 })

    mockSaveApiKey.mockResolvedValue({ id: 'item-1', title: 'Hal - Anthropic API Key' })

    const result = await rotateKey(config, 'sk-ant-key-123', 'Hal')

    expect(result.success).toBe(true)
    expect(result.agents).toEqual(['main'])
    expect(result.failedAgents).toEqual(['broken'])
  })

  it('reports 1Password failure without failing overall', async () => {
    mockRunCommand.mockResolvedValueOnce({
      stdout: JSON.stringify([
        { id: 'main', identityName: 'Hal', identityEmoji: '', workspace: '', agentDir: '', model: '', isDefault: true },
      ]),
      stderr: '', code: 0,
    })
    mockRunCommand.mockResolvedValueOnce({ stdout: '{}', stderr: '', code: 0 })
    mockRunCommand.mockResolvedValueOnce({ stdout: '', stderr: '', code: 0 })
    mockRunCommand.mockResolvedValueOnce({ stdout: '', stderr: '', code: 0 })
    mockRunCommand.mockResolvedValueOnce({ stdout: '', stderr: '', code: 0 })

    mockSaveApiKey.mockRejectedValue(new Error('1Password unavailable'))

    const result = await rotateKey(config, 'sk-ant-key-123', 'Hal')

    expect(result.success).toBe(true)
    expect(result.agents).toEqual(['main'])
    expect(result.savedTo1Password).toBe(false)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/openclaw.test.ts`
Expected: FAIL — `rotateKey` is not exported from `../openclaw`

**Step 3: Write the implementation**

Add to `lib/openclaw.ts` after `setApiKey` (~line 709):

```typescript
import { saveApiKey } from './1password'

export interface RotateKeyResult {
  success: boolean
  agents: string[]
  failedAgents: string[]
  restarted: boolean
  savedTo1Password: boolean
  error?: string
}

export async function rotateKey(
  config: SshConfig,
  apiKey: string,
  displayName: string
): Promise<RotateKeyResult> {
  // 1. Discover all agents
  const agentList = await listAgents(config)
  const agentIds = agentList.map(a => a.id)

  // 2. Set key on each agent
  const agents: string[] = []
  const failedAgents: string[] = []
  for (const id of agentIds) {
    const result = await setApiKey(config, id, apiKey)
    if (result.success) {
      agents.push(id)
    } else {
      failedAgents.push(id)
    }
  }

  // 3. Restart gateway
  let restarted = false
  if (agents.length > 0) {
    const restartResult = await runCommand(
      config,
      'systemctl --user restart openclaw-gateway 2>/dev/null || openclaw gateway restart 2>/dev/null || true'
    )
    restarted = restartResult.code === 0
  }

  // 4. Save to 1Password
  let savedTo1Password = false
  try {
    await saveApiKey(displayName, apiKey)
    savedTo1Password = true
  } catch {
    // Non-fatal — key is already on the instance
  }

  return {
    success: agents.length > 0,
    agents,
    failedAgents,
    restarted,
    savedTo1Password,
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run lib/__tests__/openclaw.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/openclaw.ts lib/__tests__/openclaw.test.ts
git commit -m "feat: add rotateKey orchestrator function"
```

---

### Task 3: Wire CLI command

**Files:**
- Modify: `bin/reef.ts` (add case after `set-key` ~line 288)

**Step 1: Add the CLI case**

Add to `bin/reef.ts` after the `set-key` case:

```typescript
case 'rotate-key': {
  const [instanceId, key] = args
  if (!key) fail('Usage: reef rotate-key <instance> <api-key>')
  const instance = await requireInstance(instanceId)
  const result = await rotateKey(sshConfig(instance), key, instance.opName)
  console.log(JSON.stringify({ success: result.success, ...result }))
  break
}
```

Update the import at the top of `bin/reef.ts` to include `rotateKey`:

```typescript
import {
  // ...existing imports...
  rotateKey,
} from '../lib/openclaw'
```

**Step 2: Verify the help text / usage message compiles**

Run: `npx tsx bin/reef.ts rotate-key`
Expected: Error JSON with usage message

**Step 3: Commit**

```bash
git add bin/reef.ts
git commit -m "feat: wire rotate-key CLI command"
```

---

### Task 4: Add API route

**Files:**
- Create: `app/api/instances/[id]/rotate-key/route.ts`

**Step 1: Write the route**

```typescript
import { NextResponse } from 'next/server'
import { resolveInstance } from '@/lib/instances'
import { rotateKey } from '@/lib/openclaw'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const instance = await resolveInstance(id)
    if (!instance) return NextResponse.json({ error: 'Instance not found' }, { status: 404 })

    const body = await req.json()
    const { key } = body
    if (!key || typeof key !== 'string') {
      return NextResponse.json({ error: 'Missing required field: key' }, { status: 400 })
    }

    const result = await rotateKey(
      { host: instance.ip, privateKey: instance.sshKey },
      key,
      instance.opName
    )
    return NextResponse.json(result, { status: result.success ? 200 : 500 })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
```

**Step 2: Commit**

```bash
git add app/api/instances/\[id\]/rotate-key/route.ts
git commit -m "feat: add rotate-key API route"
```

---

### Task 5: Run all tests and verify

**Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass (57 existing + new 1password + rotateKey tests)

**Step 2: Verify CLI smoke test**

Run: `npx tsx bin/reef.ts rotate-key`
Expected: `{"success":false,"error":"Usage: reef rotate-key <instance> <api-key>"}`

**Step 3: Update CLAUDE.md CLI docs**

Add `rotate-key` to the CLI section in `CLAUDE.md` under **Instance commands**:

```
- `reef rotate-key <instance> <key>` — push Anthropic key to all agents, restart gateway, save to 1Password
```

**Step 4: Final commit**

```bash
git add CLAUDE.md
git commit -m "docs: add rotate-key to CLI reference"
```
