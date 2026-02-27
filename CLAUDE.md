# CLAUDE.md

## Project

Reef is a Next.js 15 dashboard for managing OpenClaw AI agent instances on Digital Ocean droplets.

## Key architecture decisions

- Droplets are discovered by name pattern (`openclaw` or `open-claw`), not DO tags
- `config/settings.json` maps DO account names to token refs and per-account droplet name maps (gitignored, copy from `.example`)
- SSH keys are stored as 1Password **Secure Notes** — resolved via `notesPlain` field, NOT `private key`
- Labels in the UI use the full droplet name (e.g. `dot-openclaw`), not shortened names
- SSH key resolution priority: `SSH_PRIVATE_KEY` env → `SSH_KEY_PATH` file → 1Password op:// reference
- DO token resolution: `DO_API_TOKEN` env → 1Password via `DO_API_TOKEN_OP_REF`

## File layout

- `lib/` — core modules: `mapping.ts`, `digitalocean.ts`, `instances.ts`, `1password.ts`, `ssh.ts`, `openclaw.ts`
- `app/` — Next.js App Router pages and components
- `app/api/instances/` — 7 API routes (list, health, check, backup, agents, browse, chat)
- `config/settings.json` — gitignored, maps DO accounts to token refs and droplet-to-1Password name maps
- `.env.local` — gitignored, holds `DO_API_TOKEN` and `OP_SERVICE_ACCOUNT_TOKEN`

## Testing

- Vitest with 20 meaningful tests across 4 files
- Worktree paths excluded in `vitest.config.ts`
- Tests that only verify mocks return mock values were intentionally pruned

## Dev server

- **Always restart after any code change** — Turbopack does NOT detect file changes on WSL (`/mnt/c/` has no inotify)
- Use `bash bin/dev.sh` to restart — it kills the old server, clears `.next/` cache, bumps patch version, and starts fresh
- **Do NOT background `dev.sh`** (no `&` or `run_in_background`) — the script uses `exec` to replace itself with the node process, which breaks when backgrounded with output redirection. Run it in a foreground shell or a dedicated background task without redirection.
- Never assume hot reload works. Every change requires a restart.
- `next.config.ts` has `serverExternalPackages: ['ssh2', '@1password/sdk']` for native module compat

## Gotchas

- `.env.local` and `config/settings.json` must exist in the working directory (not just the main repo if using worktrees)
- The 1Password vault is named `AI-Agents`
- 1Password items follow the pattern `<Name> - SSH Private Key` where Name is capitalized (e.g. "Dot", "Myri")

## Multi-account configuration

Reef supports multiple Digital Ocean accounts. Configure them in `config/settings.json`:

```json
{
  "accounts": {
    "personal": {
      "tokenRef": "op://AI-Agents/Reef - Digital Ocean/credential",
      "nameMap": { "openclaw-hal": "Hal" }
    },
    "work": {
      "tokenRef": "op://Work/DO-Token/credential",
      "nameMap": { "openclaw-alpha": "Alpha" }
    }
  }
}
```

- `tokenRef` can be a 1Password `op://` reference or a raw DO API token
- Each account has its own `nameMap` mapping droplet names to 1Password item prefixes
- The sidebar groups instances by account when multiple accounts are configured
- CLI commands work across all accounts by default; `create-machine` accepts `--account`
- Legacy `DO_API_TOKEN` / `DO_API_TOKEN_OP_REF` env vars still work when no accounts are configured

## CLI

Reef includes a CLI tool for managing OpenClaw instances from the terminal. All commands output JSON to stdout. See `docs/agent-guide.md` for comprehensive reference with examples and troubleshooting workflows.

**Setup:** Run `npm link` in the project root to make `reef` available globally (requires sudo on Linux). Alternatively use `npx reef` from the project directory. Run `reef help` for full command list.

**Instance commands** (use droplet name as instance ID, e.g. `openclaw-hal`):
- `reef instances` — list all discovered instances
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

**Backup & deploy:**
- `reef backup <instance> <agent>` — download agent tarball to `./backups/`
- `reef check-backup <tarball>` — verify tarball integrity
- `reef deploy <instance> <agent> <tarball>` — push, untar, run doctor

**Remote access:**
- `reef ssh <instance> <command>` — run arbitrary SSH command
- `reef ls <instance> <path>` — list remote directory contents
- `reef cat <instance> <path>` — read remote file contents

**Output contract:** Every command returns `{ "success": true|false, ... }`. Errors include an `"error"` field.
