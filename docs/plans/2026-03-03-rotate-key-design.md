# Anthropic Key Rotation — Design

## Problem

When rotating an Anthropic API key for an OpenClaw instance, the user currently has to:
1. Manually SSH in or use `reef set-key` per agent
2. Remember to restart the gateway
3. Manually save the key to 1Password

This is error-prone and tedious, especially for instances with multiple agents.

## Solution

`reef rotate-key <instance> <key>` — a single command that pushes a new Anthropic API key to **all agents** on an instance, restarts the gateway, and saves the key to 1Password.

## Components

### 1. `saveApiKey()` in `lib/1password.ts`

Creates/replaces a 1Password item `"<Name> - Anthropic API Key"` in the AI-Agents vault.

- Uses the instance's name-map display name (e.g. `openclaw-hal` → `Hal`)
- Item category: `ApiCredentials`
- Field: `credential` (concealed)
- Follows the same delete-then-create pattern as `saveChannelToken()`

### 2. `listAgentIds()` in `lib/openclaw.ts`

Single SSH command: `ls -1 ~/.openclaw/agents/` → returns string array of agent directory names.

### 3. `rotateKey()` in `lib/openclaw.ts`

Orchestrator function:

1. Call `listAgentIds()` to discover all agents on the instance
2. Call `setApiKey()` for each agent (reuses existing function, no restart flag)
3. Restart the gateway once (after all agents updated)
4. Call `saveApiKey()` to persist to 1Password

Returns:
```typescript
interface RotateKeyResult {
  success: boolean
  agents: string[]           // agents that were updated
  failedAgents: string[]     // agents that failed (if any)
  restarted: boolean
  savedTo1Password: boolean
  error?: string
}
```

### 4. CLI: `reef rotate-key <instance> <key>`

Wired in `bin/reef.ts`. Resolves the instance, calls `rotateKey()`, outputs JSON result.

### 5. API route: `app/api/instances/[id]/rotate-key/route.ts`

POST endpoint accepting `{ key: string }`. Calls `rotateKey()`, returns JSON.

## Error handling

- If any agent write fails, continue with remaining agents; report failures in output
- If 1Password save fails, the key is still on the instance — report failure but succeed overall
- Gateway restart failure is non-fatal (reported in output)

## 1Password naming

Uses name-map display name: `"<Name> - Anthropic API Key"` (e.g. `"Hal - Anthropic API Key"`).
Consistent with existing `"<Name> - SSH Key"` pattern.
