# CLAUDE.md

## Project

Reef is a Next.js 16 dashboard for managing OpenClaw AI agent instances across cloud providers (currently Digital Ocean, with AWS planned).

## Key architecture decisions

- Cloud providers abstracted behind `CloudProvider` interface in `lib/providers/`; Digital Ocean is the default, AWS planned
- Instances discovered by name pattern (`openclaw` or `open-claw`), not DO tags
- Workspaces group instances across accounts; each instance belongs to exactly one workspace
- Settings auto-creates a "default" workspace for unassigned instances
- `config/settings.json` maps accounts to provider type, token refs, and per-account name maps (gitignored, copy from `.example`)
- SSH keys are stored as 1Password **Secure Notes** — resolved via `notesPlain` field, NOT `private key`
- Labels in the UI use the full droplet name (e.g. `dot-openclaw`), not shortened names
- SSH key resolution priority: `SSH_PRIVATE_KEY` env → `SSH_KEY_PATH` file → 1Password op:// reference
- DO token resolution: `DO_API_TOKEN` env → 1Password via `DO_API_TOKEN_OP_REF`

## File layout

- `lib/providers/` — cloud provider abstraction: `types.ts` (CloudProvider interface), `digitalocean.ts` (DO adapter), `index.ts` (factory)
- `lib/` — core modules: `mapping.ts`, `instances.ts`, `workspaces.ts`, `1password.ts`, `ssh.ts`, `openclaw.ts`, `settings.ts`, `insights.ts`
- `app/` — Next.js App Router pages and components
- `app/api/instances/` — instance list route + 16 per-instance routes under `[id]/` (agents, backup, browse, channels, check, doctor, email-setup, google-setup, health, info, install, pairing, reboot, restart, terminal, upgrade)
- `app/api/fleet/` — fleet overview and insights routes (including HTML report)
- `app/api/workspaces/` — workspace CRUD API routes
- `config/settings.json` — gitignored, maps accounts to provider/token refs, name maps, and workspaces
- `.env.local` — gitignored, holds `DO_API_TOKEN` and `OP_SERVICE_ACCOUNT_TOKEN`

## Testing

- Vitest with 57 meaningful tests across 8 files
- Worktree paths excluded in `vitest.config.ts`
- Tests that only verify mocks return mock values were intentionally pruned

## Dev server

- **Always restart after any code change** — Turbopack does NOT detect file changes on WSL (`/mnt/c/` has no inotify)
- Use `bash bin/dev_win.sh` on Windows native, `bash bin/dev_wsl.sh` on WSL — both kill the old server, clear `.next/` cache, bump patch version, and start fresh
- **Do NOT background the dev script** (no `&` or `run_in_background`) — the script uses `exec` to replace itself with the node process, which breaks when backgrounded with output redirection. Run it in a foreground shell or a dedicated background task without redirection.
- Never assume hot reload works. Every change requires a restart.
- `next.config.ts` has `serverExternalPackages: ['ssh2', '@1password/sdk', 'ws']` for native module compat

## Gotchas

- `.env.local` and `config/settings.json` must exist in the working directory (not just the main repo if using worktrees)
- The 1Password vault is named `AI-Agents`
- 1Password items follow the pattern `<Name> - SSH Private Key` where Name is capitalized (e.g. "Dot", "Myri")

## Multi-account configuration

Reef supports multiple cloud provider accounts and workspaces. Configure them in `config/settings.json`:

```json
{
  "accounts": {
    "personal": {
      "provider": "digitalocean",
      "tokenRef": "op://AI-Agents/Reef - Digital Ocean/credential",
      "nameMap": { "openclaw-hal": "Hal" }
    },
    "work": {
      "provider": "digitalocean",
      "tokenRef": "op://Work/DO-Token/credential",
      "nameMap": { "openclaw-alpha": "Alpha" }
    }
  },
  "workspaces": {
    "default": {
      "label": "Default",
      "instances": ["openclaw-hal", "openclaw-alpha"]
    }
  }
}
```

- `provider` specifies the cloud provider (defaults to `"digitalocean"` if omitted)
- `tokenRef` can be a 1Password `op://` reference or a raw API token
- Each account has its own `nameMap` mapping instance names to 1Password item prefixes
- Workspaces group instances across accounts; each instance belongs to exactly one workspace
- The sidebar groups instances by workspace with a workspace switcher when multiple workspaces exist
- CLI commands work across all accounts by default; `create-machine` accepts `--account`
- Legacy `DO_API_TOKEN` / `DO_API_TOKEN_OP_REF` env vars still work when no accounts are configured

## CLI

Reef includes a CLI tool for managing OpenClaw instances from the terminal. All commands output JSON to stdout. See `docs/agent-guide.md` for comprehensive reference with examples and troubleshooting workflows.

**Setup:** Run `npm link` in the project root to make `reef` available globally (requires sudo on Linux). Alternatively use `npx reef` from the project directory. Run `reef help` for full command list.

**Instance commands** (use droplet name as instance ID, e.g. `openclaw-hal`):
- `reef instances [--workspace <id>]` — list all discovered instances (optionally filtered by workspace)
- `reef health <instance>` — process status, disk, memory, uptime
- `reef agents <instance>` — list agents on an instance
- `reef status <instance>` — deep diagnostics via `openclaw status --all --deep`
- `reef doctor <instance>` — run `openclaw doctor` to auto-fix issues
- `reef restart <instance>` — restart OpenClaw (tries gateway, systemd, then kill)
- `reef channels <instance>` — list configured channels
- `reef logs <instance> [--lines N] [--agent <agent>]` — view service logs

**Agent commands** (instance + agent ID):
- `reef agent-health <instance> <agent>` — agent directory, size, last activity, process status
- `reef chat <instance> <agent> <message>` — send a message, get JSON response
- `reef create-agent <instance> <name> [--model <model>]` — create new agent
- `reef delete-agent <instance> <agent>` — delete an agent

**Channel commands:**
- `reef add-channel <instance> <type> <token> [account-id]` — add a channel (e.g. telegram)
- `reef bind-channel <instance> <agent> <channel> [account-id]` — bind channel to agent
- `reef approve-pairing <instance> <channel> <code>` — approve a user's pairing code
- `reef pairing-requests <instance> <channel>` — list pending pairing requests

**Workspace commands:**
- `reef workspaces` — list all workspaces
- `reef workspace create <id> [--label <label>]` — create a new workspace
- `reef workspace move <instance> <workspace>` — move instance to workspace
- `reef workspace delete <id>` — delete workspace (moves instances to default)

**Config commands:**
- `reef set-key <instance> <key> [--agent <agent>] [--provider <provider>] [--restart]` — set API key

**Insights commands:**
- `reef insights [--workspace <id>]` — fleet-wide knowledge inventory (memories, skills, identity across all instances)
- `reef insights <instance>` — specific instance's memories, skills, and identity files
- `reef insights --skill <name>` — find which instances have a specific skill
- `reef report [path] [--workspace <id>]` — generate HTML fleet report and open in browser

**Backup & deploy:**
- `reef extract <instance>` — extract all agents + config for rebuild
- `reef backup <instance> <agent>` — download agent tarball to `./backups/`
- `reef check-backup <tarball>` — verify tarball integrity
- `reef deploy <instance> <agent> <tarball>` — push, untar, run doctor

**Remote access:**
- `reef ssh <instance> <command>` — run arbitrary SSH command
- `reef ls <instance> <path>` — list remote directory contents
- `reef cat <instance> <path>` — read remote file contents

**Output contract:** Every command returns `{ "success": true|false, ... }`. Errors include an `"error"` field.

## MCP Server

Reef includes a read-only MCP server for conversational fleet access from Claude Code.

**Setup:** Add to your Claude Code MCP config (`.claude/settings.json` or `claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "reef": {
      "command": "npx",
      "args": ["tsx", "bin/reef-mcp.ts"],
      "cwd": "/path/to/reef"
    }
  }
}
```

**Available tools:** `list_instances`, `list_agents`, `fleet_knowledge`, `instance_knowledge`, `find_skill`, `instance_health`, `agent_health`, `browse_files`, `read_file`

All tools are read-only. Path-based tools (`browse_files`, `read_file`) are restricted to `~/.openclaw/` for security.
