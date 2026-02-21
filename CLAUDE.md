# CLAUDE.md

## Project

Reef is a Next.js 15 dashboard for managing OpenClaw AI agent instances on Digital Ocean droplets.

## Key architecture decisions

- Droplets are discovered by name pattern (`openclaw` or `open-claw`), not DO tags
- `config/name-map.json` maps droplet names to 1Password item name prefixes (gitignored, copy from `.example`)
- SSH keys are stored as 1Password **Secure Notes** — resolved via `notesPlain` field, NOT `private key`
- Labels in the UI use the full droplet name (e.g. `dot-openclaw`), not shortened names
- SSH key resolution priority: `SSH_PRIVATE_KEY` env → `SSH_KEY_PATH` file → 1Password op:// reference
- DO token resolution: `DO_API_TOKEN` env → 1Password via `DO_API_TOKEN_OP_REF`

## File layout

- `lib/` — core modules: `mapping.ts`, `digitalocean.ts`, `instances.ts`, `1password.ts`, `ssh.ts`, `openclaw.ts`
- `app/` — Next.js App Router pages and components
- `app/api/instances/` — 7 API routes (list, health, check, backup, agents, browse, chat)
- `config/name-map.json` — gitignored, maps droplet names to 1Password names
- `.env.local` — gitignored, holds `DO_API_TOKEN` and `OP_SERVICE_ACCOUNT_TOKEN`

## Testing

- Vitest with 20 meaningful tests across 4 files
- Worktree paths excluded in `vitest.config.ts`
- Tests that only verify mocks return mock values were intentionally pruned

## Dev server

- Windows requires `node node_modules/next/dist/bin/next dev` (not `npm run dev`) in `.claude/launch.json`
- `next.config.ts` has `serverExternalPackages: ['ssh2', '@1password/sdk']` for native module compat

## Gotchas

- `.env.local` and `config/name-map.json` must exist in the working directory (not just the main repo if using worktrees)
- The 1Password vault is named `AI-Agents`
- 1Password items follow the pattern `<Name> - SSH Private Key` where Name is capitalized (e.g. "Dot", "Myri")
