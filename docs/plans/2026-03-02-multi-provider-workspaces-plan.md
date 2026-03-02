# Multi-Provider & Workspaces Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Abstract the cloud provider layer behind a `CloudProvider` interface, move DO to an adapter, add cross-account workspace grouping, and update the UI/CLI to use workspaces instead of accounts.

**Architecture:** Provider adapter pattern — `CloudProvider` interface in `lib/providers/types.ts`, DO implementation in `lib/providers/digitalocean.ts`, factory in `lib/providers/index.ts`. Workspaces stored in `config/settings.json`, managed via `lib/workspaces.ts`. UI groups by workspace instead of account.

**Tech Stack:** TypeScript, Next.js 15 App Router, Vitest

---

### Task 1: Create CloudProvider interface and types

**Files:**
- Create: `lib/providers/types.ts`

**Step 1: Create the provider types file**

```typescript
// lib/providers/types.ts
export interface CloudInstance {
  providerId: string
  name: string
  ip: string
  region?: string
  status?: string
}

export interface CloudRegion {
  slug: string
  name: string
}

export interface CloudSize {
  slug: string
  label: string
  memory: number
  vcpus: number
  disk: number
  priceMonthly: number
  regions: string[]
}

export interface CloudSshKey {
  id: number | string
  name: string
  publicKey: string
  fingerprint: string
}

export interface CreateInstanceOptions {
  name: string
  region: string
  size: string
  image: string
  sshKeyIds: (number | string)[]
  tags?: string[]
}

export interface CloudProvider {
  readonly type: string

  listInstances(): Promise<CloudInstance[]>
  getInstance(providerId: string): Promise<CloudInstance | null>
  rebootInstance(providerId: string): Promise<{ success: boolean; error?: string }>
  listRegions(): Promise<CloudRegion[]>
  listSizes(): Promise<CloudSize[]>
  createInstance(opts: CreateInstanceOptions): Promise<CloudInstance>
  listSshKeys(): Promise<CloudSshKey[]>
  addSshKey(name: string, publicKey: string): Promise<CloudSshKey>
}
```

**Step 2: Verify file compiles**

Run: `npx tsc --noEmit`
Expected: No new errors from this file.

**Step 3: Commit**

```bash
git add lib/providers/types.ts
git commit -m "feat: add CloudProvider interface and types"
```

---

### Task 2: Create DigitalOceanProvider class

**Files:**
- Create: `lib/providers/digitalocean.ts`
- Modify: `lib/digitalocean.ts` (keep as re-export shim temporarily)

**Step 1: Write failing test for DigitalOceanProvider**

Update `lib/__tests__/digitalocean.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DigitalOceanProvider } from '../providers/digitalocean'

const mockDropletResponse = {
  droplets: [
    {
      id: 123,
      name: 'open-claw-hal',
      tags: [],
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
      tags: [],
      networks: {
        v4: [{ type: 'public', ip_address: '5.6.7.8' }],
      },
    },
    {
      id: 789,
      name: 'my-web-server',
      tags: [],
      networks: {
        v4: [{ type: 'public', ip_address: '9.9.9.9' }],
      },
    },
  ],
}

describe('DigitalOceanProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('listInstances returns only openclaw droplets', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockDropletResponse),
    }))

    const provider = new DigitalOceanProvider('test-token')
    const result = await provider.listInstances()

    expect(result).toEqual([
      { providerId: '123', name: 'open-claw-hal', ip: '1.2.3.4' },
      { providerId: '456', name: 'open-claw-marvin', ip: '5.6.7.8' },
    ])
  })

  it('listInstances throws on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    }))

    const provider = new DigitalOceanProvider('bad-token')
    await expect(provider.listInstances()).rejects.toThrow(
      'Digital Ocean API error: 401 Unauthorized'
    )
  })

  it('type is digitalocean', () => {
    const provider = new DigitalOceanProvider('token')
    expect(provider.type).toBe('digitalocean')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/digitalocean.test.ts`
Expected: FAIL — `DigitalOceanProvider` not found.

**Step 3: Implement DigitalOceanProvider**

Create `lib/providers/digitalocean.ts`. Wrap existing `lib/digitalocean.ts` functions into a class implementing `CloudProvider`. Key mappings:

- `listOpenClawDroplets()` → `listInstances()` — returns `CloudInstance[]` with `providerId: string` (convert DO numeric id to string)
- `getDroplet()` → `getInstance()` — takes `providerId: string`, parses to number for DO API
- `rebootDroplet()` → `rebootInstance()` — same parse
- `listRegions()` → `listRegions()` — returns `CloudRegion[]`
- `listSizes()` → `listSizes()` — returns `CloudSize[]` with `label` field computed
- `listAccountSshKeys()` → `listSshKeys()` — returns `CloudSshKey[]` with `publicKey` (camelCase)
- `addAccountSshKey()` → `addSshKey()` — same camelCase
- `createDroplet()` → `createInstance()` — maps `CreateInstanceOptions` to DO-specific body

The class stores `apiToken` as a private field, passed in the constructor.

The `OPENCLAW_PATTERN` filter stays in `listInstances()` — it's a DO discovery convention.

**Step 4: Run test to verify it passes**

Run: `npx vitest run lib/__tests__/digitalocean.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/providers/digitalocean.ts lib/__tests__/digitalocean.test.ts
git commit -m "feat: implement DigitalOceanProvider class"
```

---

### Task 3: Create provider factory

**Files:**
- Create: `lib/providers/index.ts`

**Step 1: Create the factory module**

```typescript
// lib/providers/index.ts
export type { CloudProvider, CloudInstance, CloudRegion, CloudSize, CloudSshKey, CreateInstanceOptions } from './types'
import type { CloudProvider } from './types'
import { DigitalOceanProvider } from './digitalocean'

export function createProvider(provider: string | undefined, token: string): CloudProvider {
  switch (provider || 'digitalocean') {
    case 'digitalocean':
      return new DigitalOceanProvider(token)
    default:
      throw new Error(`Unknown cloud provider: ${provider}`)
  }
}
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No new errors.

**Step 3: Commit**

```bash
git add lib/providers/index.ts
git commit -m "feat: add provider factory with DO as default"
```

---

### Task 4: Update settings to support provider and workspaces

**Files:**
- Modify: `lib/settings.ts`
- Modify: `lib/__tests__/settings.test.ts`
- Modify: `config/settings.example.json`

**Step 1: Write failing test for workspace settings**

Add to `lib/__tests__/settings.test.ts`:

```typescript
describe('workspaces in settings', () => {
  it('loads workspaces from settings', () => {
    writeFileSync(settingsPath, JSON.stringify({
      accounts: { personal: { provider: 'digitalocean', tokenRef: 'tok', nameMap: {} } },
      workspaces: { prod: { label: 'Production', instances: ['openclaw-hal'] } },
    }))
    resetSettingsCache()
    const settings = loadSettings()
    expect(settings.workspaces).toEqual({
      prod: { label: 'Production', instances: ['openclaw-hal'] },
    })
  })

  it('returns empty workspaces when none configured', () => {
    writeFileSync(settingsPath, JSON.stringify({
      accounts: { personal: { tokenRef: 'tok', nameMap: {} } },
    }))
    resetSettingsCache()
    const settings = loadSettings()
    expect(settings.workspaces).toEqual({})
  })

  it('getAccounts includes provider field', () => {
    writeFileSync(settingsPath, JSON.stringify({
      accounts: { personal: { provider: 'digitalocean', tokenRef: 'tok', nameMap: {} } },
    }))
    resetSettingsCache()
    const accounts = getAccounts()
    expect(accounts[0].provider).toBe('digitalocean')
  })

  it('provider defaults to digitalocean when omitted', () => {
    writeFileSync(settingsPath, JSON.stringify({
      accounts: { personal: { tokenRef: 'tok', nameMap: {} } },
    }))
    resetSettingsCache()
    const accounts = getAccounts()
    expect(accounts[0].provider).toBe('digitalocean')
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/__tests__/settings.test.ts`
Expected: FAIL — `workspaces` not on Settings, `provider` not on Account.

**Step 3: Update settings.ts**

Changes to `lib/settings.ts`:

1. Add `provider?: string` to `AccountConfig` interface.
2. Add `WorkspaceConfig` interface: `{ label: string; instances: string[] }`.
3. Add `workspaces: Record<string, WorkspaceConfig>` to `Settings` interface.
4. Update `loadSettings()` to include `workspaces: raw.workspaces || {}` and all fallbacks.
5. Add `provider` field to the `Account` interface and `getAccounts()` return.
6. Add `writeSettings(settings: Settings)` function that writes to `config/settings.json` and resets cache.

**Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/__tests__/settings.test.ts`
Expected: PASS

**Step 5: Update settings.example.json**

```json
{
  "accounts": {
    "personal": {
      "provider": "digitalocean",
      "tokenRef": "op://AI-Agents/Reef - Digital Ocean/credential",
      "nameMap": {
        "openclaw-example": "Example"
      }
    }
  },
  "workspaces": {
    "default": {
      "label": "Default",
      "instances": ["openclaw-example"]
    }
  }
}
```

**Step 6: Commit**

```bash
git add lib/settings.ts lib/__tests__/settings.test.ts config/settings.example.json
git commit -m "feat: add provider and workspaces to settings schema"
```

---

### Task 5: Create workspaces module

**Files:**
- Create: `lib/workspaces.ts`
- Create: `lib/__tests__/workspaces.test.ts`

**Step 1: Write failing tests for workspaces**

```typescript
// lib/__tests__/workspaces.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'reef-ws-'))
  mkdirSync(join(tmpDir, 'config'), { recursive: true })
  vi.stubEnv('REEF_CWD', tmpDir) // or use vi.spyOn(process, 'cwd')
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

// Tests will import from '../workspaces' which reads settings via loadSettings()
// We'll need to mock loadSettings/writeSettings or use the real file system
```

Key test cases:
- `getWorkspaces()` returns workspaces from settings
- `getWorkspaceForInstance('openclaw-hal')` returns the workspace containing it
- `ensureDefaultWorkspace(['openclaw-hal', 'openclaw-eva'])` creates "default" workspace when none exist
- `ensureDefaultWorkspace()` adds unassigned instances to "default" when workspaces exist
- `moveInstance('openclaw-hal', 'dev')` removes from old workspace, adds to target
- `createWorkspace('dev', 'Development')` adds a new workspace to settings
- `deleteWorkspace('dev')` moves instances to "default" and removes workspace

**Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/__tests__/workspaces.test.ts`
Expected: FAIL — module doesn't exist.

**Step 3: Implement workspaces.ts**

```typescript
// lib/workspaces.ts
import { loadSettings, writeSettings } from './settings'

export interface Workspace {
  id: string
  label: string
  instances: string[]
}

export function getWorkspaces(): Workspace[] {
  const settings = loadSettings()
  return Object.entries(settings.workspaces).map(([id, config]) => ({
    id,
    label: config.label,
    instances: config.instances,
  }))
}

export function getWorkspaceForInstance(instanceName: string): Workspace | null {
  const workspaces = getWorkspaces()
  return workspaces.find(w => w.instances.includes(instanceName)) ?? null
}

export function ensureDefaultWorkspace(allInstanceNames: string[]): void {
  const settings = loadSettings()
  // Collect all instances already assigned to a workspace
  const assigned = new Set<string>()
  for (const ws of Object.values(settings.workspaces)) {
    for (const name of ws.instances) assigned.add(name)
  }
  // Find unassigned instances
  const unassigned = allInstanceNames.filter(n => !assigned.has(n))
  // Create or update "default" workspace
  if (!settings.workspaces.default) {
    settings.workspaces.default = { label: 'Default', instances: [] }
  }
  for (const name of unassigned) {
    if (!settings.workspaces.default.instances.includes(name)) {
      settings.workspaces.default.instances.push(name)
    }
  }
  writeSettings(settings)
}

export function moveInstance(instanceName: string, workspaceId: string): void {
  const settings = loadSettings()
  // Remove from current workspace
  for (const ws of Object.values(settings.workspaces)) {
    ws.instances = ws.instances.filter(n => n !== instanceName)
  }
  // Add to target
  if (!settings.workspaces[workspaceId]) {
    throw new Error(`Workspace "${workspaceId}" not found`)
  }
  settings.workspaces[workspaceId].instances.push(instanceName)
  writeSettings(settings)
}

export function createWorkspace(id: string, label: string): void {
  const settings = loadSettings()
  if (settings.workspaces[id]) {
    throw new Error(`Workspace "${id}" already exists`)
  }
  settings.workspaces[id] = { label, instances: [] }
  writeSettings(settings)
}

export function deleteWorkspace(id: string): void {
  if (id === 'default') throw new Error('Cannot delete the default workspace')
  const settings = loadSettings()
  const ws = settings.workspaces[id]
  if (!ws) throw new Error(`Workspace "${id}" not found`)
  // Move instances to default
  if (!settings.workspaces.default) {
    settings.workspaces.default = { label: 'Default', instances: [] }
  }
  settings.workspaces.default.instances.push(...ws.instances)
  delete settings.workspaces[id]
  writeSettings(settings)
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/__tests__/workspaces.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/workspaces.ts lib/__tests__/workspaces.test.ts
git commit -m "feat: add workspaces module with CRUD operations"
```

---

### Task 6: Update Instance model and listInstances to use provider factory

**Files:**
- Modify: `lib/instances.ts`
- Modify: `lib/__tests__/instances.test.ts`

**Step 1: Update instance tests**

Key changes to `lib/__tests__/instances.test.ts`:
- Replace `mockListDroplets` mock with a mock for `createProvider` that returns a mock `CloudProvider`
- The mock provider's `listInstances()` returns `CloudInstance[]` (with `providerId: string`)
- Update assertions: `dropletId` → `providerId`, add `provider` and `platform` fields
- Mock `loadSettings()` to return settings with `provider` field on accounts

```typescript
// Updated mock setup
const { mockGetSecret, mockCreateProvider, mockGetBotName, mockGetAccounts, mockLoadSettings } = vi.hoisted(() => ({
  mockGetSecret: vi.fn(),
  mockCreateProvider: vi.fn(),
  mockGetBotName: vi.fn(),
  mockGetAccounts: vi.fn(),
  mockLoadSettings: vi.fn(),
}))

vi.mock('../1password', () => ({ getSecret: mockGetSecret }))
vi.mock('../providers', () => ({ createProvider: mockCreateProvider }))
vi.mock('../mapping', () => ({ getBotName: mockGetBotName }))
vi.mock('../settings', () => ({
  getAccounts: mockGetAccounts,
  loadSettings: mockLoadSettings,
  getNameMap: vi.fn(),
  resetSettingsCache: vi.fn(),
}))
```

In each test, set up `mockCreateProvider` to return a mock provider:
```typescript
const mockProvider = { listInstances: vi.fn() }
mockCreateProvider.mockReturnValue(mockProvider)
mockProvider.listInstances.mockResolvedValue([
  { providerId: '123', name: 'openclaw-hal', ip: '1.2.3.4' },
])
mockLoadSettings.mockReturnValue({
  accounts: { personal: { provider: 'digitalocean', tokenRef: 'op://vault/token', nameMap: { 'openclaw-hal': 'Hal' } } },
  workspaces: {},
})
```

Update assertions:
```typescript
expect(result[0]).toMatchObject({
  id: 'openclaw-hal',
  providerId: '123',
  provider: 'digitalocean',
  platform: 'openclaw',
  accountId: 'personal',
})
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/__tests__/instances.test.ts`
Expected: FAIL — Instance doesn't have `providerId`/`provider`/`platform`.

**Step 3: Update lib/instances.ts**

Key changes:
1. Replace `import { listOpenClawDroplets } from './digitalocean'` with `import { createProvider } from './providers'`
2. Add `import { loadSettings } from './settings'` (already partially there via `getAccounts`)
3. Update `Instance` interface: `dropletId: number` → `providerId: string`, add `provider: string`, add `platform: string`
4. Update `listInstancesForAccount()`:
   - Accept `accountConfig: AccountConfig` parameter
   - Call `createProvider(accountConfig.provider, token)` to get provider
   - Call `provider.listInstances()` instead of `listOpenClawDroplets()`
   - Map `cloudInstance.providerId` instead of `droplet.id`
   - Set `provider: accountConfig.provider || 'digitalocean'`
   - Set `platform: 'openclaw'`
5. Update `listInstances()` to pass account config to `listInstancesForAccount()`
6. Add call to `ensureDefaultWorkspace()` at end of `listInstances()` with all instance names

**Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/__tests__/instances.test.ts`
Expected: PASS

**Step 5: Run all tests**

Run: `npx vitest run`
Expected: Some tests may fail in other files that reference `dropletId`. That's expected — we'll fix those in following tasks.

**Step 6: Commit**

```bash
git add lib/instances.ts lib/__tests__/instances.test.ts
git commit -m "feat: update Instance model to use provider factory"
```

---

### Task 7: Update reboot API route to use provider factory

**Files:**
- Modify: `app/api/instances/[id]/reboot/route.ts`

**Step 1: Update the route**

Replace `rebootDroplet` import with provider factory:

```typescript
import { NextResponse } from 'next/server'
import { getInstance, getAccountToken } from '@/lib/instances'
import { createProvider } from '@/lib/providers'
import { loadSettings } from '@/lib/settings'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const instance = await getInstance(id)
    if (!instance) return NextResponse.json({ error: 'Instance not found' }, { status: 404 })
    const token = await getAccountToken(instance.accountId)
    const settings = loadSettings()
    const accountConfig = settings.accounts[instance.accountId]
    const provider = createProvider(accountConfig?.provider, token)
    const result = await provider.rebootInstance(instance.providerId)
    return NextResponse.json(result, { status: result.success ? 200 : 500 })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors from this file.

**Step 3: Commit**

```bash
git add app/api/instances/[id]/reboot/route.ts
git commit -m "refactor: reboot route uses provider factory"
```

---

### Task 8: Update regions, sizes, and create-machine API routes

**Files:**
- Modify: `app/api/regions/route.ts`
- Modify: `app/api/sizes/route.ts`
- Modify: `app/api/create-machine/route.ts`

**Step 1: Update regions route**

Replace `import { listRegions } from '@/lib/digitalocean'` with provider factory pattern:
- Get account config from settings
- Create provider via factory
- Call `provider.listRegions()`

**Step 2: Update sizes route**

Same pattern. Replace `import { listSizes } from '@/lib/digitalocean'`. The filter `sizes.filter(s => s.regions.includes(region))` stays as-is since `CloudSize` has `regions`.

**Step 3: Update create-machine route**

This is the largest change. Replace all DO imports with provider factory:
- `listOpenClawDroplets` → `provider.listInstances()`
- `listAccountSshKeys` → `provider.listSshKeys()`
- `addAccountSshKey` → `provider.addSshKey()`
- `createDroplet` → `provider.createInstance()`
- `getDroplet` → `provider.getInstance()`
- Update `ensureSshKeyInDO` to accept `provider: CloudProvider` instead of `token`
- Update `waitForIp` to accept `provider: CloudProvider` instead of `token`
- Change return `dropletId` to `instanceId` (string)

**Step 4: Verify all compile**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 5: Commit**

```bash
git add app/api/regions/route.ts app/api/sizes/route.ts app/api/create-machine/route.ts
git commit -m "refactor: API routes use provider factory"
```

---

### Task 9: Update lib/create-machine.ts

**Files:**
- Modify: `lib/create-machine.ts`

**Step 1: Update imports and function signatures**

Replace all DO imports with:
```typescript
import { createProvider } from './providers'
import type { CloudProvider, CloudSize } from './providers/types'
```

Update functions:
- `ensureSshKeyInDO(token, name, pubkey)` → `ensureSshKeyInDO(provider, name, pubkey)` — uses `provider.listSshKeys()` and `provider.addSshKey()`
- `waitForIp(token, dropletId)` → `waitForIp(provider, providerId)` — uses `provider.getInstance()`
- `formatSize(s: Size)` → `formatSize(s: CloudSize)`
- `createMachine()` — create provider at the top, pass it through to helper functions
- `CreateMachineResult.dropletId: number` → `CreateMachineResult.instanceId: string` and add `provider: string`

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 3: Commit**

```bash
git add lib/create-machine.ts
git commit -m "refactor: create-machine uses provider factory"
```

---

### Task 10: Delete old lib/digitalocean.ts

**Files:**
- Delete: `lib/digitalocean.ts`
- Modify: Any remaining imports

**Step 1: Search for remaining imports of lib/digitalocean**

Run: `grep -r "from.*['\"].*digitalocean['\"]" --include="*.ts" --include="*.tsx" lib/ app/ bin/`

Fix any remaining imports to point to `lib/providers` or `lib/providers/digitalocean`.

**Step 2: Delete lib/digitalocean.ts**

```bash
rm lib/digitalocean.ts
```

**Step 3: Verify everything compiles and tests pass**

Run: `npx tsc --noEmit && npx vitest run`
Expected: All pass. Zero references to old file.

**Step 4: Commit**

```bash
git add -A
git commit -m "refactor: remove old lib/digitalocean.ts, all code uses providers/"
```

---

### Task 11: Add workspace API routes

**Files:**
- Create: `app/api/workspaces/route.ts`
- Create: `app/api/workspaces/[id]/route.ts`

**Step 1: Create GET/POST /api/workspaces**

```typescript
// app/api/workspaces/route.ts
import { NextResponse } from 'next/server'
import { getWorkspaces, createWorkspace } from '@/lib/workspaces'

export async function GET() {
  try {
    const workspaces = getWorkspaces()
    return NextResponse.json({ success: true, workspaces })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const { id, label } = await request.json()
    if (!id) return NextResponse.json({ error: 'Missing workspace id' }, { status: 400 })
    createWorkspace(id, label || id)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
```

**Step 2: Create PUT/DELETE /api/workspaces/[id]**

```typescript
// app/api/workspaces/[id]/route.ts
import { NextResponse } from 'next/server'
import { moveInstance, deleteWorkspace } from '@/lib/workspaces'
import { loadSettings, writeSettings } from '@/lib/settings'

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const body = await request.json()
    const settings = loadSettings()
    const ws = settings.workspaces[id]
    if (!ws) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
    if (body.label) ws.label = body.label
    if (body.addInstance) moveInstance(body.addInstance, id)
    writeSettings(settings)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    deleteWorkspace(id)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
```

**Step 3: Verify they compile**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 4: Commit**

```bash
git add app/api/workspaces/
git commit -m "feat: add workspace API routes"
```

---

### Task 12: Update DashboardContext for workspaces

**Files:**
- Modify: `app/components/context/DashboardContext.tsx`

**Step 1: Add workspace types and state**

Add to interfaces:
```typescript
export interface WorkspaceWithInstances {
  id: string
  label: string
  instances: InstanceWithAgents[]
}
```

Add `providerId`, `provider`, `platform` to `InstanceWithAgents`:
```typescript
export interface InstanceWithAgents {
  id: string
  label: string
  ip: string
  providerId: string
  provider: string
  platform: string
  accountId: string
  agents: AgentInfo[]
}
```

Add to `DashboardState`:
```typescript
workspaces: WorkspaceWithInstances[]
activeWorkspaceId: string | null
setActiveWorkspace: (workspaceId: string | null) => void
```

**Step 2: Add workspace state and grouping logic**

In `DashboardProvider`:
- Add `workspaces` and `activeWorkspaceId` state
- After instances are set, fetch workspaces from `/api/workspaces` and group instances into `WorkspaceWithInstances[]`
- `setInstances` also triggers workspace grouping
- Expose `setActiveWorkspace` to switch which workspace is shown in sidebar

**Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors (Sidebar may need updates but should still compile since old fields still exist).

**Step 4: Commit**

```bash
git add app/components/context/DashboardContext.tsx
git commit -m "feat: add workspace state to DashboardContext"
```

---

### Task 13: Update Sidebar to show workspaces

**Files:**
- Modify: `app/components/Sidebar.tsx`

**Step 1: Replace account grouping with workspace grouping**

The sidebar currently renders `AccountGroup` when multiple accounts exist. Replace with workspace-based rendering:

1. Add a workspace switcher above the instance tree — a dropdown or tab bar showing all workspaces.
2. When a workspace is selected, show only its instances (flat list of `MachineItem`s).
3. Keep the "Select all" checkbox and tree collapse behavior.
4. The `AccountGroup` component can be removed or kept as fallback — but per design, workspaces always exist, so account grouping is replaced entirely.

Key changes to `Sidebar()`:
```typescript
export function Sidebar() {
  const { workspaces, activeWorkspaceId, setActiveWorkspace, instances, checkedAgents, toggleAll, goHome } = useDashboard()
  // ...

  // Get instances for active workspace
  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId) || workspaces[0]
  const visibleInstances = activeWorkspace?.instances || instances

  return (
    <aside ...>
      {/* Header */}
      {/* Workspace switcher */}
      {workspaces.length > 1 && (
        <div className="px-2 py-1.5 border-b border-gray-100">
          <select
            value={activeWorkspaceId || ''}
            onChange={e => setActiveWorkspace(e.target.value)}
            className="w-full text-xs ..."
          >
            {workspaces.map(ws => (
              <option key={ws.id} value={ws.id}>{ws.label} ({ws.instances.length})</option>
            ))}
          </select>
        </div>
      )}
      {/* Instance list */}
      {visibleInstances.map(inst => <MachineItem key={inst.id} instance={inst} />)}
    </aside>
  )
}
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 3: Commit**

```bash
git add app/components/Sidebar.tsx
git commit -m "feat: sidebar groups instances by workspace"
```

---

### Task 14: Update CLI with workspace commands

**Files:**
- Modify: `bin/reef.ts`

**Step 1: Add workspace CLI commands**

Add after the existing `create-machine` case:

```typescript
case 'workspaces': {
  const { getWorkspaces } = await import('../lib/workspaces')
  const workspaces = getWorkspaces()
  console.log(JSON.stringify({ success: true, workspaces }))
  break
}

case 'workspace': {
  const [sub, ...subArgs] = args
  if (sub === 'create') {
    const id = subArgs[0]
    if (!id) fail('Usage: reef workspace create <id> [--label <label>]')
    const labelIdx = subArgs.indexOf('--label')
    const label = labelIdx >= 0 ? subArgs[labelIdx + 1] : id
    const { createWorkspace } = await import('../lib/workspaces')
    createWorkspace(id, label)
    console.log(JSON.stringify({ success: true, message: `Workspace "${id}" created` }))
  } else if (sub === 'move') {
    const [instanceId, workspaceId] = subArgs
    if (!workspaceId) fail('Usage: reef workspace move <instance> <workspace>')
    const { moveInstance } = await import('../lib/workspaces')
    moveInstance(instanceId, workspaceId)
    console.log(JSON.stringify({ success: true, message: `Moved "${instanceId}" to "${workspaceId}"` }))
  } else if (sub === 'delete') {
    const id = subArgs[0]
    if (!id) fail('Usage: reef workspace delete <id>')
    const { deleteWorkspace } = await import('../lib/workspaces')
    deleteWorkspace(id)
    console.log(JSON.stringify({ success: true, message: `Workspace "${id}" deleted` }))
  } else {
    fail(`Unknown workspace subcommand: ${sub}. Use: create, move, delete`)
  }
  break
}
```

Also add `--workspace` filter to `instances` command:
```typescript
case 'instances': {
  const instances = await listInstances()
  const wsIdx = args.indexOf('--workspace')
  const wsFilter = wsIdx >= 0 ? args[wsIdx + 1] : undefined
  let filtered = instances
  if (wsFilter) {
    const { getWorkspaces } = await import('../lib/workspaces')
    const ws = getWorkspaces().find(w => w.id === wsFilter)
    if (!ws) fail(`Workspace not found: ${wsFilter}`)
    filtered = instances.filter(i => ws!.instances.includes(i.id))
  }
  console.log(JSON.stringify({
    success: true,
    instances: filtered.map(i => ({ id: i.id, label: i.label, ip: i.ip, account: i.accountId, provider: i.provider })),
  }))
  break
}
```

Update help text to include workspace commands.

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 3: Commit**

```bash
git add bin/reef.ts
git commit -m "feat: add workspace CLI commands"
```

---

### Task 15: Update app/api/instances route for workspace filter

**Files:**
- Modify: `app/api/instances/route.ts`

**Step 1: Add optional workspace query param**

```typescript
import { NextResponse } from 'next/server'
import { listInstances } from '@/lib/instances'
import { getWorkspaces } from '@/lib/workspaces'

export async function GET(request: Request) {
  try {
    const instances = await listInstances()
    const { searchParams } = new URL(request.url)
    const workspaceId = searchParams.get('workspace')

    if (workspaceId) {
      const ws = getWorkspaces().find(w => w.id === workspaceId)
      if (!ws) return NextResponse.json({ error: `Workspace not found: ${workspaceId}` }, { status: 404 })
      return NextResponse.json(instances.filter(i => ws.instances.includes(i.id)))
    }

    return NextResponse.json(instances)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 3: Commit**

```bash
git add app/api/instances/route.ts
git commit -m "feat: instances API supports workspace filter"
```

---

### Task 16: Final verification and cleanup

**Files:**
- Modify: `CLAUDE.md` — update docs to reflect workspaces and providers
- Modify: `docs/agent-guide.md` — add workspace commands if this file exists

**Step 1: Run full test suite**

Run: `npx vitest run`
Expected: ALL PASS

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: Zero errors.

**Step 3: Search for any remaining references to old patterns**

Run these searches and fix anything found:
- `grep -r "dropletId" --include="*.ts" --include="*.tsx" lib/ app/ bin/` — should be zero
- `grep -r "from.*digitalocean" --include="*.ts" --include="*.tsx" lib/ app/ bin/` — should be zero (old file deleted)
- `grep -r "listOpenClawDroplets" --include="*.ts" --include="*.tsx"` — should be zero

**Step 4: Update CLAUDE.md**

Add to "Key architecture decisions":
- Providers abstracted behind `CloudProvider` interface in `lib/providers/`
- Digital Ocean is the default provider; AWS support planned
- Workspaces group instances across accounts; each instance belongs to exactly one workspace
- Settings auto-creates a "default" workspace for unassigned instances

Add workspace CLI commands to the CLI section.

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: final cleanup — update docs, remove stale references"
```
