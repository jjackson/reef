# Multi-Digital Ocean Account Support

## Overview

Add support for managing multiple Digital Ocean accounts in Reef. Instances from all accounts appear in a unified view with account-level grouping in the sidebar and cross-account fleet commands in the CLI.

## Config: `config/settings.json`

Replaces `config/name-map.json`. Single file for all account configuration:

```json
{
  "accounts": {
    "personal": {
      "tokenRef": "op://AI-Agents/Reef - Digital Ocean/credential",
      "nameMap": {
        "openclaw-hal": "Hal",
        "openclaw-eva": "Eva"
      }
    },
    "work": {
      "tokenRef": "op://Work/DO-Token/credential",
      "nameMap": {
        "openclaw-alpha": "Alpha"
      }
    }
  }
}
```

- `tokenRef`: 1Password `op://` reference or raw token
- Backward compat: if `DO_API_TOKEN` env + old `name-map.json` exist, auto-migrate on first load
- Ship `config/settings.example.json`

## Data Model

```typescript
interface Account {
  id: string          // key from settings.json
  label: string       // display name (capitalized id)
  tokenRef: string    // op:// ref or raw token
}

interface Instance {
  id: string          // droplet name (globally unique)
  label: string       // display name
  ip: string
  accountId: string   // owning DO account
}

interface AccountWithInstances {
  id: string
  label: string
  instances: InstanceWithAgents[]
  collapsed: boolean
}
```

## Core Library Changes

### New: `lib/settings.ts`
- `loadSettings()` — reads and caches `config/settings.json`
- `getAccounts()` — returns `Account[]` with resolved tokens
- `getNameMap(accountId)` — per-account name map
- `getGlobalNameMap()` — merged name map (backward compat)

### Modified: `lib/instances.ts`
- `listInstances()` iterates all accounts, calls `listOpenClawDroplets(token)` per account, tags each instance with `accountId`
- `resolveInstance(id)` searches across all accounts, uses correct account's token + nameMap

### Modified: `lib/create-machine.ts`
- `createMachine` takes `accountId` parameter
- CLI `create-machine` gets `--account` flag (required if >1 account)

### Unchanged: `lib/digitalocean.ts`
- Functions already accept `apiToken` as parameter — no changes needed

## API Changes

### Modified: `/api/instances` (GET)
- Returns `{ accounts: [{ id, label, instances }] }`

### New: `/api/accounts` (GET)
- Returns configured accounts (id + label, no tokens)

### Modified: `/api/regions`, `/api/sizes`, `/api/ssh-keys`
- Accept `?account=<id>` query param (per-DO-account resources)

## UI Changes

### DashboardContext
- State: `accounts: AccountWithInstances[]` replaces `instances: InstanceWithAgents[]`

### Sidebar
- Top-level: collapsible account groups (account name as header)
- Under each account: expandable instances (existing behavior)

### CreateMachineDialog
- Account selector dropdown when >1 account configured

## CLI Changes

- `reef instances` — lists all instances across all accounts, output includes `account` field
- `reef create-machine` — add `--account <name>` flag
- Instance resolution unchanged — droplet names unique, search across all accounts
