# Multi-Digital Ocean Account Support — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Support managing instances across multiple Digital Ocean accounts with a unified settings file, account-grouped sidebar, and cross-account CLI commands.

**Architecture:** Replace `config/name-map.json` with `config/settings.json` containing per-account DO token refs and name maps. `lib/settings.ts` loads and caches this config. `listInstances()` iterates all accounts in parallel, tagging each instance with its `accountId`. The sidebar renders collapsible account groups. CLI commands work cross-account by default.

**Tech Stack:** Next.js 15, React, TypeScript, Vitest

---

### Task 1: Create `lib/settings.ts` — settings loader

**Files:**
- Create: `lib/settings.ts`
- Test: `lib/__tests__/settings.test.ts`

**Step 1: Write the failing test**

```typescript
// lib/__tests__/settings.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync, existsSync } from 'fs'

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}))

const mockExistsSync = vi.mocked(existsSync)
const mockReadFileSync = vi.mocked(readFileSync)

// Must import AFTER mocks are set up
const { loadSettings, getAccounts, getNameMap, getGlobalNameMap, resetSettingsCache } = await import('../settings')

const sampleSettings = {
  accounts: {
    personal: {
      tokenRef: 'op://AI-Agents/Reef - Digital Ocean/credential',
      nameMap: {
        'openclaw-hal': 'Hal',
        'openclaw-eva': 'Eva',
      },
    },
    work: {
      tokenRef: 'op://Work/DO-Token/credential',
      nameMap: {
        'openclaw-alpha': 'Alpha',
      },
    },
  },
}

describe('settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetSettingsCache()
  })

  it('loads settings from config/settings.json', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(JSON.stringify(sampleSettings))
    const settings = loadSettings()
    expect(settings.accounts).toHaveProperty('personal')
    expect(settings.accounts).toHaveProperty('work')
  })

  it('returns empty accounts when file does not exist', () => {
    mockExistsSync.mockReturnValue(false)
    const settings = loadSettings()
    expect(settings.accounts).toEqual({})
  })

  it('getAccounts returns account list with ids', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(JSON.stringify(sampleSettings))
    const accounts = getAccounts()
    expect(accounts).toHaveLength(2)
    expect(accounts[0]).toMatchObject({ id: 'personal', tokenRef: 'op://AI-Agents/Reef - Digital Ocean/credential' })
  })

  it('getNameMap returns per-account name map', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(JSON.stringify(sampleSettings))
    expect(getNameMap('personal')).toEqual({ 'openclaw-hal': 'Hal', 'openclaw-eva': 'Eva' })
    expect(getNameMap('nonexistent')).toEqual({})
  })

  it('getGlobalNameMap merges all accounts', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(JSON.stringify(sampleSettings))
    const global = getGlobalNameMap()
    expect(global).toEqual({
      'openclaw-hal': 'Hal',
      'openclaw-eva': 'Eva',
      'openclaw-alpha': 'Alpha',
    })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/settings.test.ts`
Expected: FAIL — module `../settings` not found

**Step 3: Write minimal implementation**

```typescript
// lib/settings.ts
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

export interface AccountConfig {
  tokenRef: string
  nameMap: Record<string, string>
}

export interface Settings {
  accounts: Record<string, AccountConfig>
}

export interface Account {
  id: string
  label: string
  tokenRef: string
}

let cached: Settings | null = null

export function resetSettingsCache(): void {
  cached = null
}

export function loadSettings(): Settings {
  if (cached) return cached

  const settingsPath = join(process.cwd(), 'config', 'settings.json')
  if (!existsSync(settingsPath)) {
    cached = { accounts: {} }
    return cached
  }

  try {
    const raw = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    cached = { accounts: raw.accounts || {} }
  } catch {
    cached = { accounts: {} }
  }
  return cached
}

export function getAccounts(): Account[] {
  const settings = loadSettings()
  return Object.entries(settings.accounts).map(([id, config]) => ({
    id,
    label: id.charAt(0).toUpperCase() + id.slice(1),
    tokenRef: config.tokenRef,
  }))
}

export function getNameMap(accountId: string): Record<string, string> {
  const settings = loadSettings()
  return settings.accounts[accountId]?.nameMap ?? {}
}

export function getGlobalNameMap(): Record<string, string> {
  const settings = loadSettings()
  const merged: Record<string, string> = {}
  for (const config of Object.values(settings.accounts)) {
    Object.assign(merged, config.nameMap)
  }
  return merged
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run lib/__tests__/settings.test.ts`
Expected: PASS — all 5 tests green

**Step 5: Commit**

```bash
git add lib/settings.ts lib/__tests__/settings.test.ts
git commit -m "feat: add lib/settings.ts for multi-account config"
```

---

### Task 2: Create `config/settings.json` and example file

**Files:**
- Create: `config/settings.json`
- Create: `config/settings.example.json`

**Step 1: Create settings.json from existing name-map.json**

Migrate the current `config/name-map.json` into the new format. The current content is:

```json
{
  "__comment": "Maps DO droplet names to 1Password bot names.",
  "openclaw-dot": "Dot",
  "openclaw-myri": "Myri",
  "openclaw-hal": "Hal",
  "openclaw-eva": "Eva",
  "openclaw-twix": "Twix",
  "openclaw-fizzy": "Fizzy",
  "openclaw-jarvis": "Jarvis",
  "openclaw-flurry": "Flurry",
  "openclaw-wiz": "Wiz"
}
```

Create `config/settings.json`:

```json
{
  "accounts": {
    "personal": {
      "tokenRef": "op://AI-Agents/Reef - Digital Ocean/credential",
      "nameMap": {
        "openclaw-dot": "Dot",
        "openclaw-myri": "Myri",
        "openclaw-hal": "Hal",
        "openclaw-eva": "Eva",
        "openclaw-twix": "Twix",
        "openclaw-fizzy": "Fizzy",
        "openclaw-jarvis": "Jarvis",
        "openclaw-flurry": "Flurry",
        "openclaw-wiz": "Wiz"
      }
    }
  }
}
```

**Step 2: Create example file**

Create `config/settings.example.json`:

```json
{
  "accounts": {
    "personal": {
      "tokenRef": "op://AI-Agents/Reef - Digital Ocean/credential",
      "nameMap": {
        "openclaw-example": "Example"
      }
    }
  }
}
```

**Step 3: Add `config/settings.json` to `.gitignore`**

Check if `.gitignore` already ignores it (like `name-map.json`). Add `config/settings.json` to `.gitignore` alongside the existing `config/name-map.json` entry.

**Step 4: Commit**

```bash
git add config/settings.example.json .gitignore
git commit -m "feat: add config/settings.json structure with example"
```

---

### Task 3: Update `lib/mapping.ts` to use settings

**Files:**
- Modify: `lib/mapping.ts`

**Step 1: Write the failing test**

Add a test in `lib/__tests__/settings.test.ts` (or update existing mapping tests if they exist) that verifies `getBotName` uses the global name map from settings:

No separate test needed — the existing `getBotName` tests mock `loadNameMap` directly. We'll update the implementation and verify existing tests still pass.

**Step 2: Update `lib/mapping.ts`**

Replace `loadNameMap()` to use settings:

```typescript
// lib/mapping.ts
import { getGlobalNameMap } from './settings'

/**
 * Maps a Digital Ocean droplet name to a 1Password item name prefix.
 *
 * Priority:
 *   1. Explicit mapping in config/settings.json (merged across all accounts)
 *   2. Auto-derive by stripping "open-claw-"/"openclaw-" prefix or suffix
 *   3. Fall back to the full droplet name
 */
export function getBotName(dropletName: string): string | null {
  if (dropletName.startsWith('__')) return null

  // Check explicit map first (from settings.json)
  const map = getGlobalNameMap()
  if (map[dropletName]) return map[dropletName]

  // Auto-derive from naming convention (prefix or suffix)
  const stripped = dropletName
    .replace(/^open-claw-/i, '')
    .replace(/^openclaw-/i, '')
    .replace(/-open-claw$/i, '')
    .replace(/-openclaw$/i, '')

  // If stripping changed nothing, the name doesn't follow convention
  if (stripped === dropletName) return dropletName

  return stripped
}
```

**Step 3: Run all tests**

Run: `npx vitest run`
Expected: All existing tests pass (the `getBotName` mock in `instances.test.ts` still works since it mocks the module)

**Step 4: Commit**

```bash
git add lib/mapping.ts
git commit -m "refactor: mapping.ts reads from settings.json instead of name-map.json"
```

---

### Task 4: Update `lib/instances.ts` for multi-account

**Files:**
- Modify: `lib/instances.ts`
- Modify: `lib/__tests__/instances.test.ts`

**Step 1: Write the failing test**

Update `lib/__tests__/instances.test.ts` to test multi-account instance listing:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetSecret, mockListDroplets, mockGetBotName, mockGetAccounts, mockResetSettingsCache } = vi.hoisted(() => ({
  mockGetSecret: vi.fn(),
  mockListDroplets: vi.fn(),
  mockGetBotName: vi.fn(),
  mockGetAccounts: vi.fn(),
  mockResetSettingsCache: vi.fn(),
}))

vi.mock('../1password', () => ({ getSecret: mockGetSecret }))
vi.mock('../digitalocean', () => ({ listOpenClawDroplets: mockListDroplets }))
vi.mock('../mapping', () => ({ getBotName: mockGetBotName }))
vi.mock('../settings', () => ({
  getAccounts: mockGetAccounts,
  getNameMap: vi.fn(),
  resetSettingsCache: mockResetSettingsCache,
}))

const { listInstances } = await import('../instances')

describe('listInstances (multi-account)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSecret.mockResolvedValue('do-api-token-value')
    mockGetBotName.mockImplementation((name: string) => {
      if (name === 'openclaw-hal') return 'Hal'
      if (name === 'openclaw-alpha') return 'Alpha'
      return null
    })
  })

  it('lists instances across multiple accounts', async () => {
    mockGetAccounts.mockReturnValue([
      { id: 'personal', label: 'Personal', tokenRef: 'op://vault/personal-token' },
      { id: 'work', label: 'Work', tokenRef: 'op://vault/work-token' },
    ])
    mockListDroplets
      .mockResolvedValueOnce([{ id: 123, name: 'openclaw-hal', ip: '1.2.3.4' }])
      .mockResolvedValueOnce([{ id: 456, name: 'openclaw-alpha', ip: '5.6.7.8' }])

    const result = await listInstances()
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ id: 'openclaw-hal', accountId: 'personal' })
    expect(result[1]).toMatchObject({ id: 'openclaw-alpha', accountId: 'work' })
  })

  it('resolves tokens via getSecret for op:// refs', async () => {
    mockGetAccounts.mockReturnValue([
      { id: 'personal', label: 'Personal', tokenRef: 'op://vault/token' },
    ])
    mockListDroplets.mockResolvedValue([{ id: 1, name: 'openclaw-hal', ip: '1.1.1.1' }])

    await listInstances()
    expect(mockGetSecret).toHaveBeenCalledWith('op://vault/token')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/instances.test.ts`
Expected: FAIL — `accountId` not in result / imports changed

**Step 3: Update `lib/instances.ts`**

```typescript
// lib/instances.ts
import { readFile } from 'fs/promises'
import { loadEnv } from './env'
import { getSecret } from './1password'
import { listOpenClawDroplets } from './digitalocean'
import { getBotName } from './mapping'
import { getAccounts } from './settings'

export interface Instance {
  id: string       // DO droplet name (used as stable ID)
  label: string    // Display name (full droplet name)
  ip: string
  dropletId: number
  sshKeyRef: string // op:// reference — not the key itself
  accountId: string // which DO account owns this instance
}

export interface ResolvedInstance extends Instance {
  sshKey: string   // Actual private key value
}

/**
 * Resolves the SSH private key from one of three sources (in priority order):
 *   1. SSH_PRIVATE_KEY env var (raw key contents)
 *   2. SSH_KEY_PATH env var (path to key file, e.g. ~/.ssh/id_rsa)
 *   3. 1Password op:// reference (requires OP_SERVICE_ACCOUNT_TOKEN)
 */
async function resolveSSHKey(opRef: string): Promise<string> {
  if (process.env.SSH_PRIVATE_KEY) {
    return process.env.SSH_PRIVATE_KEY
  }

  if (process.env.SSH_KEY_PATH) {
    const keyPath = process.env.SSH_KEY_PATH.replace(/^~/, process.env.HOME || process.env.USERPROFILE || '')
    return readFile(keyPath, 'utf-8')
  }

  return getSecret(opRef)
}

/** Resolve a token ref — if it starts with op://, resolve via 1Password; otherwise treat as raw token */
async function resolveToken(tokenRef: string): Promise<string> {
  if (tokenRef.startsWith('op://')) {
    return getSecret(tokenRef)
  }
  return tokenRef
}

export async function listInstances(): Promise<Instance[]> {
  loadEnv()

  const accounts = getAccounts()

  // If no accounts configured, fall back to legacy env var behavior
  if (accounts.length === 0) {
    const doToken = process.env.DO_API_TOKEN
      || await getSecret(process.env.DO_API_TOKEN_OP_REF!)
    return listInstancesForAccount('default', doToken)
  }

  // Fetch instances from all accounts in parallel
  const results = await Promise.all(
    accounts.map(async (account) => {
      try {
        const token = await resolveToken(account.tokenRef)
        return await listInstancesForAccount(account.id, token)
      } catch (err) {
        console.warn(`[reef] Failed to list instances for account "${account.id}": ${err instanceof Error ? err.message : err}`)
        return []
      }
    })
  )

  return results.flat()
}

async function listInstancesForAccount(accountId: string, doToken: string): Promise<Instance[]> {
  const droplets = await listOpenClawDroplets(doToken)

  return droplets
    .map((droplet): Instance | null => {
      const opName = getBotName(droplet.name)
      if (!opName) {
        console.warn(`[reef] Skipping droplet: ${droplet.name} (name starts with __)`)
        return null
      }
      return {
        id: droplet.name,
        label: droplet.name,
        ip: droplet.ip,
        dropletId: droplet.id,
        sshKeyRef: `op://AI-Agents/${opName} - SSH Key/private key`,
        accountId,
      }
    })
    .filter((i): i is Instance => i !== null)
}

export async function getInstance(id: string): Promise<Instance | null> {
  const instances = await listInstances()
  return instances.find((i) => i.id === id) ?? null
}

/**
 * Like getInstance, but also fetches the SSH private key.
 * Tries SSH_PRIVATE_KEY env, then SSH_KEY_PATH file, then 1Password.
 */
export async function resolveInstance(id: string): Promise<ResolvedInstance | null> {
  const instance = await getInstance(id)
  if (!instance) return null
  try {
    const sshKey = await resolveSSHKey(instance.sshKeyRef)
    return { ...instance, sshKey }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('secret reference') || msg.includes('no item matched')) {
      throw new Error(`No SSH key found for ${instance.label} in 1Password. Expected item: "${instance.sshKeyRef.split('/')[3]}" in the AI-Agents vault.`)
    }
    throw err
  }
}

/** Resolve the DO API token for a specific account (used by create-machine, regions, etc.) */
export async function getAccountToken(accountId: string): Promise<string> {
  loadEnv()
  const accounts = getAccounts()
  const account = accounts.find(a => a.id === accountId)
  if (account) {
    return resolveToken(account.tokenRef)
  }
  // Fallback for default/legacy
  return process.env.DO_API_TOKEN || await getSecret(process.env.DO_API_TOKEN_OP_REF!)
}
```

**Step 4: Run tests**

Run: `npx vitest run lib/__tests__/instances.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/instances.ts lib/__tests__/instances.test.ts
git commit -m "feat: listInstances fetches from all configured DO accounts"
```

---

### Task 5: Update API routes for multi-account

**Files:**
- Modify: `app/api/instances/route.ts`
- Modify: `app/api/regions/route.ts`
- Modify: `app/api/sizes/route.ts`
- Modify: `app/api/create-machine/route.ts`
- Create: `app/api/accounts/route.ts`

**Step 1: Create `/api/accounts` route**

```typescript
// app/api/accounts/route.ts
import { NextResponse } from 'next/server'
import { getAccounts } from '@/lib/settings'

export async function GET() {
  try {
    const accounts = getAccounts()
    return NextResponse.json({ accounts: accounts.map(a => ({ id: a.id, label: a.label })) })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
```

**Step 2: Update `/api/instances/route.ts`**

The response now includes `accountId` on each instance (already returned by `listInstances()`). No code change needed — the existing route just calls `listInstances()` and returns the result.

**Step 3: Update `/api/regions/route.ts` to accept account param**

```typescript
// app/api/regions/route.ts
import { NextResponse } from 'next/server'
import { listRegions } from '@/lib/digitalocean'
import { getAccountToken } from '@/lib/instances'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const accountId = searchParams.get('account') || 'default'
    const token = await getAccountToken(accountId)
    const regions = await listRegions(token)
    return NextResponse.json({ regions })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
```

**Step 4: Update `/api/sizes/route.ts` similarly**

```typescript
// app/api/sizes/route.ts
import { NextResponse } from 'next/server'
import { listSizes } from '@/lib/digitalocean'
import { getAccountToken } from '@/lib/instances'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const region = searchParams.get('region')
    const accountId = searchParams.get('account') || 'default'
    const token = await getAccountToken(accountId)
    let sizes = await listSizes(token)
    if (region) {
      sizes = sizes.filter(s => s.regions.includes(region))
    }
    return NextResponse.json({ sizes })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
```

**Step 5: Update `/api/create-machine/route.ts`**

Add `accountId` field to the request body. Use `getAccountToken(accountId)` instead of the inline `getDoToken()`. Also update the name-map write to update `config/settings.json` instead of `config/name-map.json`:

In the POST handler:
- Extract `accountId` from body (default to first account or 'default')
- Replace `getDoToken()` with `getAccountToken(accountId)`
- Replace the `name-map.json` update at the end with a `settings.json` update that adds the new droplet to the correct account's `nameMap`

Create a helper in `lib/settings.ts`:

```typescript
export function addToNameMap(accountId: string, dropletName: string, botName: string): void {
  const settingsPath = join(process.cwd(), 'config', 'settings.json')
  const settings = loadSettings()
  if (!settings.accounts[accountId]) return
  settings.accounts[accountId].nameMap[dropletName] = botName
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n')
  cached = settings // update cache
}
```

(Add `import { writeFileSync } from 'fs'` to settings.ts)

**Step 6: Commit**

```bash
git add app/api/accounts/route.ts app/api/regions/route.ts app/api/sizes/route.ts app/api/create-machine/route.ts lib/settings.ts
git commit -m "feat: API routes support multi-account via ?account= param"
```

---

### Task 6: Update DashboardContext for account-grouped data

**Files:**
- Modify: `app/components/context/DashboardContext.tsx`

**Step 1: Add account types and update state**

Add `AccountWithInstances` type. Change state from flat `instances` to include account grouping while keeping backward compatibility.

```typescript
// Add to DashboardContext.tsx types:
export interface AccountWithInstances {
  id: string
  label: string
  instances: InstanceWithAgents[]
  collapsed: boolean
}
```

Update `InstanceWithAgents` to include `accountId`:
```typescript
export interface InstanceWithAgents {
  id: string
  label: string
  ip: string
  accountId: string  // NEW
  agents: AgentInfo[]
}
```

Update the context state to add:
```typescript
accounts: AccountWithInstances[]
setAccountInstances: (accountId: string, label: string, instances: InstanceWithAgents[]) => void
toggleAccountCollapse: (accountId: string) => void
```

Keep `instances` as a computed getter that flattens all accounts' instances (backward compat for existing components).

**Step 2: Implement changes**

The `instances` field becomes a computed view: `accounts.flatMap(a => a.instances)`. The `setInstances` method is replaced by `setAccountInstances` which groups by account. Add `toggleAccountCollapse` for sidebar.

**Step 3: Run dev server, verify no crashes**

Run: `bash bin/dev.sh` (in a terminal)

**Step 4: Commit**

```bash
git add app/components/context/DashboardContext.tsx
git commit -m "feat: DashboardContext supports account-grouped instances"
```

---

### Task 7: Update `app/page.tsx` to load accounts

**Files:**
- Modify: `app/page.tsx`

**Step 1: Update the fetch logic**

The `/api/instances` response now includes `accountId` on each instance. Group them by account and call `setAccountInstances` for each:

```typescript
useEffect(() => {
  // Fetch accounts metadata
  const loadData = async () => {
    try {
      const [accountsRes, instancesRes] = await Promise.all([
        fetch('/api/accounts'),
        fetch('/api/instances'),
      ])
      const accountsData = accountsRes.ok ? await accountsRes.json() : { accounts: [] }
      const instancesData = instancesRes.ok ? await instancesRes.json() : []

      // Group instances by accountId
      const grouped = new Map<string, InstanceWithAgents[]>()
      for (const inst of instancesData) {
        const accountId = inst.accountId || 'default'
        if (!grouped.has(accountId)) grouped.set(accountId, [])
        grouped.get(accountId)!.push({ ...inst, agents: [] })
      }

      // Set each account's instances
      for (const acct of accountsData.accounts) {
        setAccountInstances(acct.id, acct.label, grouped.get(acct.id) || [])
      }

      // Handle instances with no matching account (legacy/default)
      const defaultInstances = grouped.get('default')
      if (defaultInstances?.length) {
        setAccountInstances('default', 'Default', defaultInstances)
      }
    } catch {}
  }
  loadData()
}, [setAccountInstances])
```

**Step 2: Commit**

```bash
git add app/page.tsx
git commit -m "feat: page.tsx loads instances grouped by account"
```

---

### Task 8: Update Sidebar for account groups

**Files:**
- Modify: `app/components/Sidebar.tsx`

**Step 1: Add AccountGroup component**

Add a new `AccountGroup` component that renders as a collapsible header with instances underneath:

```typescript
function AccountGroup({ account }: { account: AccountWithInstances }) {
  const { toggleAccountCollapse } = useDashboard()

  return (
    <div>
      <button
        onClick={() => toggleAccountCollapse(account.id)}
        className="w-full flex items-center gap-2 px-2 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide hover:bg-gray-50 rounded"
      >
        <span className="text-[10px]">{account.collapsed ? '▸' : '▾'}</span>
        <span className="truncate">{account.label}</span>
        <span className="ml-auto text-gray-300 font-normal normal-case">{account.instances.length}</span>
      </button>
      {!account.collapsed && (
        <div className="space-y-0.5">
          {account.instances.map(inst => (
            <MachineItem key={inst.id} instance={inst} />
          ))}
        </div>
      )}
    </div>
  )
}
```

**Step 2: Update Sidebar to render account groups**

Replace the flat `instances.map(...)` with `accounts.map(...)`:

```typescript
export function Sidebar() {
  const { accounts, instances, checkedAgents, toggleAll, goHome } = useDashboard()
  // ... existing code ...

  // In the render, replace the instances mapping:
  {!treeCollapsed && (
    <div className="flex-1 overflow-y-auto p-2 space-y-2">
      {accounts.length > 1 ? (
        // Multi-account: show grouped
        accounts.map(acct => (
          <AccountGroup key={acct.id} account={acct} />
        ))
      ) : (
        // Single account: flat list (no grouping header)
        instances.map(inst => (
          <MachineItem key={inst.id} instance={inst} />
        ))
      )}
      {instances.length === 0 && (
        <p className="text-xs text-gray-400 italic px-2 py-4">Loading...</p>
      )}
    </div>
  )}
```

When there's only one account, skip the group header — it's unnecessary visual noise.

**Step 3: Run dev server and visually verify**

Run: `bash bin/dev.sh`

**Step 4: Commit**

```bash
git add app/components/Sidebar.tsx
git commit -m "feat: sidebar renders collapsible account groups"
```

---

### Task 9: Update CreateMachineDialog for account selection

**Files:**
- Modify: `app/components/CreateMachineDialog.tsx`

**Step 1: Add account selector**

When more than one account is configured, show an account dropdown at the top of the form. Pass `accountId` in the create request body. Update the API calls for regions/sizes to include `?account=<id>`.

Add state:
```typescript
const [accountId, setAccountId] = useState('')
const [accounts, setAccounts] = useState<{id: string, label: string}[]>([])
```

On mount, fetch `/api/accounts`. If only one account, auto-select it.

Update region/size fetches to include `?account=${accountId}`.

Update the POST body to include `accountId`.

**Step 2: Commit**

```bash
git add app/components/CreateMachineDialog.tsx
git commit -m "feat: CreateMachineDialog includes account selector"
```

---

### Task 10: Update CLI `reef instances` for multi-account output

**Files:**
- Modify: `bin/reef.ts`

**Step 1: Update the `instances` command**

The `instances` command already calls `listInstances()` which now returns `accountId`. Just include it in the output:

```typescript
case 'instances': {
  const instances = await listInstances()
  console.log(JSON.stringify({
    success: true,
    instances: instances.map(i => ({ id: i.id, label: i.label, ip: i.ip, account: i.accountId })),
  }))
  break
}
```

**Step 2: Update `create-machine` command to accept `--account`**

```typescript
case 'create-machine': {
  const [name, ...rest] = args
  if (!name) fail('Usage: reef create-machine <droplet-name> [--account <name>] [--region <slug>] [--size <slug>] [--ssh-key new|<1pass-title>]')
  const regionIdx = rest.indexOf('--region')
  const sizeIdx = rest.indexOf('--size')
  const sshKeyIdx = rest.indexOf('--ssh-key')
  const accountIdx = rest.indexOf('--account')
  const accountId = accountIdx >= 0 ? rest[accountIdx + 1] : undefined

  const { getAccountToken } = await import('../lib/instances')
  const doToken = await getAccountToken(accountId || 'default')

  const result = await createMachine(name, doToken, {
    region: regionIdx >= 0 ? rest[regionIdx + 1] : undefined,
    size: sizeIdx >= 0 ? rest[sizeIdx + 1] : undefined,
    sshKey: sshKeyIdx >= 0 ? rest[sshKeyIdx + 1] : undefined,
  })
  console.log(JSON.stringify(result))
  break
}
```

**Step 3: Update help text**

Add `--account` to the `create-machine` help line and note that `instances` now includes account info.

**Step 4: Commit**

```bash
git add bin/reef.ts
git commit -m "feat: CLI supports multi-account (instances show account, create-machine accepts --account)"
```

---

### Task 11: Update `create-machine.ts` to write to settings.json

**Files:**
- Modify: `lib/create-machine.ts`

**Step 1: Replace name-map.json write with settings.json write**

At the end of `createMachine()`, replace the `name-map.json` update block with:

```typescript
// 7. Update settings.json name map
import { addToNameMap } from './settings'
// ... (move import to top of file)

const botName = getBotName(dropletName) || dropletName
const capitalized = botName.charAt(0).toUpperCase() + botName.slice(1)
addToNameMap(accountId || 'default', dropletName, capitalized)
```

Add `accountId` as an optional parameter to `CreateMachineOptions`:

```typescript
export interface CreateMachineOptions {
  region?: string
  size?: string
  sshKey?: 'new' | string
  accountId?: string  // NEW — which account to update in settings.json
}
```

**Step 2: Commit**

```bash
git add lib/create-machine.ts
git commit -m "refactor: create-machine writes to settings.json instead of name-map.json"
```

---

### Task 12: Update HomePanel for account context

**Files:**
- Modify: `app/components/HomePanel.tsx`

**Step 1: Update stats to show per-account breakdown**

When multiple accounts are configured, the stats section can show account count. The instance list at the bottom should group by account.

Update the stats grid to include an "Accounts" stat when >1:

```typescript
const { accounts, instances, setInstances } = useDashboard()

// In the stats grid, conditionally show account count:
{accounts.length > 1 && (
  <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
    <div className="text-2xl font-bold text-gray-900">{accounts.length}</div>
    <div className="text-xs text-gray-500 mt-0.5">Accounts</div>
  </div>
)}
```

**Step 2: Commit**

```bash
git add app/components/HomePanel.tsx
git commit -m "feat: HomePanel shows account count in stats"
```

---

### Task 13: Update CLAUDE.md and docs

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update file layout section**

Replace `config/name-map.json` references with `config/settings.json`. Add note about multi-account support.

**Step 2: Update config sections**

- Replace `config/name-map.json` mentions with `config/settings.json`
- Add a section about multi-account configuration
- Update the `.gitignore` references

**Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for multi-DO account support"
```

---

### Task 14: Run full test suite and verify

**Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

**Step 2: Start dev server and test UI**

Run: `bash bin/dev.sh`
- Verify sidebar shows instances (single account = no group headers)
- Verify Create Machine dialog works
- Verify fleet overview works

**Step 3: Test CLI**

Run: `npx tsx bin/reef.ts instances`
- Verify output includes `account` field

**Step 4: Final commit if any fixups needed**

```bash
git add -A
git commit -m "fix: address issues found during integration testing"
```
