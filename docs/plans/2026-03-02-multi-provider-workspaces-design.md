# Multi-Provider & Workspaces Design

## Problem

Reef is hardcoded to Digital Ocean. We need to support multiple cloud providers (AWS next) and group instances into workspaces that span across provider accounts.

## Constraints

- Workspaces always exist — no codepath without them. If settings.json has none, auto-generate a "Default" workspace containing everything.
- Each instance belongs to exactly one workspace. This means instance names remain globally unique identifiers and CLI commands don't need a `--workspace` flag.
- Only implement the DO provider now. AWS comes later, but the abstraction must accommodate it.
- OpenClaw is the only agent platform for now, but add a `platform` field to instances so future platforms (Magnus, etc.) slot in without restructuring.

## Settings Schema

```json
{
  "accounts": {
    "personal-do": {
      "provider": "digitalocean",
      "tokenRef": "op://AI-Agents/Reef - Digital Ocean/credential",
      "nameMap": { "openclaw-hal": "Hal", "openclaw-eva": "Eva" }
    },
    "work-aws": {
      "provider": "aws",
      "tokenRef": "op://Work/AWS-Key/credential",
      "nameMap": { "openclaw-alpha": "Alpha" }
    }
  },
  "workspaces": {
    "production": {
      "label": "Production Bots",
      "instances": ["openclaw-hal", "openclaw-alpha"]
    },
    "dev": {
      "label": "Development",
      "instances": ["openclaw-eva"]
    }
  }
}
```

Key rules:
- `provider` defaults to `"digitalocean"` if omitted (backward compat).
- `workspaces` maps workspace IDs to `{ label, instances[] }`.
- On startup, if no workspaces are defined, create a "Default" workspace containing all discovered instances and persist it.
- An instance name can appear in at most one workspace. Unassigned instances go into "Default".
- The UI can create/edit workspaces via API, persisting back to settings.json.

## Provider Interface

```typescript
// lib/providers/types.ts

interface CloudInstance {
  providerId: string    // provider-specific ID (string to handle DO numbers + AWS i-xxxx)
  name: string          // human-readable name
  ip: string            // public IPv4
  region?: string       // provider region slug
  status?: string       // running, stopped, etc.
}

interface CloudRegion {
  slug: string
  name: string
}

interface CloudSize {
  slug: string
  label: string
  regions: string[]
}

interface CloudSshKey {
  id: number | string
  name: string
  public_key: string
  fingerprint: string
}

interface CreateInstanceOptions {
  name: string
  region: string
  size: string
  image: string
  sshKeyIds: (number | string)[]
  tags?: string[]
}

interface CloudProvider {
  readonly type: string

  // Discovery
  listInstances(): Promise<CloudInstance[]>
  getInstance(providerId: string): Promise<CloudInstance | null>

  // Actions
  rebootInstance(providerId: string): Promise<{ success: boolean; error?: string }>

  // Provisioning
  listRegions(): Promise<CloudRegion[]>
  listSizes(): Promise<CloudSize[]>
  createInstance(opts: CreateInstanceOptions): Promise<CloudInstance>

  // SSH key management
  listSshKeys(): Promise<CloudSshKey[]>
  addSshKey(name: string, publicKey: string): Promise<CloudSshKey>
}
```

## Provider Factory

```typescript
// lib/providers/index.ts
function createProvider(accountConfig: AccountConfig, token: string): CloudProvider {
  switch (accountConfig.provider || 'digitalocean') {
    case 'digitalocean': return new DigitalOceanProvider(token)
    default: throw new Error(`Unknown provider: ${accountConfig.provider}`)
  }
}
```

## Instance Model Changes

```typescript
// lib/instances.ts — updated interface
interface Instance {
  id: string            // instance name (globally unique, used as stable ID)
  label: string         // display name
  ip: string
  providerId: string    // was dropletId: number
  provider: string      // "digitalocean", "aws", etc.
  sshKeyRef: string
  accountId: string
  platform: string      // "openclaw" for now, future: "magnus", etc.
}
```

`listInstances()` changes:
1. Iterate accounts from settings.
2. For each account, `createProvider(account, token)` and call `provider.listInstances()`.
3. Map `CloudInstance` to `Instance`, setting `provider` and `platform` fields.
4. Return flat list (workspace assignment happens at the UI/settings layer, not here).

## Workspace Resolution

```typescript
// lib/workspaces.ts
interface Workspace {
  id: string
  label: string
  instances: string[]   // instance name allow-list
}

function getWorkspaces(): Workspace[]
function getWorkspaceForInstance(instanceName: string): Workspace | null
function ensureDefaultWorkspace(allInstanceNames: string[]): void  // creates/updates Default
function moveInstance(instanceName: string, workspaceId: string): void
function createWorkspace(id: string, label: string): void
```

`ensureDefaultWorkspace()` runs on instance list fetch. Any discovered instance not assigned to a workspace gets added to "Default".

## UI Changes

Sidebar hierarchy:
```
Workspace (tabs or collapsible groups)
  Instance (provider icon badge)
    Agent
```

DashboardContext adds:
- `workspaces: WorkspaceWithInstances[]` replaces `accounts: AccountWithInstances[]`
- `activeWorkspaceId: string | null` for filtering
- `WorkspaceWithInstances { id, label, instances: InstanceWithAgents[] }`

Workspace management UI:
- Workspace switcher at top of sidebar (dropdown or tabs)
- Right-click or drag to move instance between workspaces
- Settings dialog to create/rename/delete workspaces

## API Routes

New:
- `GET /api/workspaces` — list workspaces with instance counts
- `POST /api/workspaces` — create workspace `{ id, label }`
- `PUT /api/workspaces/[id]` — update workspace (rename, move instances)
- `DELETE /api/workspaces/[id]` — delete workspace (instances move to Default)

Modified:
- `GET /api/instances` — accepts optional `?workspace=` to filter
- `POST /api/instances/[id]/reboot` — uses provider factory instead of direct DO call

## CLI Changes

New commands:
- `reef workspaces` — list workspaces
- `reef workspace create <id> [--label <label>]` — create workspace
- `reef workspace move <instance> <workspace>` — move instance to workspace

Modified:
- `reef instances [--workspace <name>]` — filter by workspace
- All other commands unchanged — instance names are globally unique

## File Layout

```
lib/
  providers/
    types.ts              — CloudProvider interface and related types
    index.ts              — createProvider() factory
    digitalocean.ts       — DigitalOceanProvider class (moved from lib/digitalocean.ts)
  workspaces.ts           — workspace CRUD + resolution
  instances.ts            — updated to use provider factory
  create-machine.ts       — updated to use provider factory
```

## Migration

Existing `settings.json` files work without changes:
- Missing `provider` field defaults to `"digitalocean"`
- Missing `workspaces` triggers auto-generation of "Default" workspace
- `dropletId` references in code change to `providerId` (internal only, no user-facing impact)

## Out of Scope

- AWS provider implementation (deferred)
- Agent platform abstraction beyond a `platform` field (deferred)
- Provider-specific features in UI (e.g. DO snapshots, AWS AMIs)
