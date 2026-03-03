# Reef — Product Context

## What It Is
A Next.js dashboard + CLI for managing a fleet of OpenClaw AI agent instances across cloud providers.

## Who Uses It
- **Primary user**: Solo developer (Jonathan) managing a fleet of OpenClaw instances for others
- **Usage pattern**: Daily interaction via dashboard and CLI, managing agent health, deploying, backing up, and coordinating across instances

## What Matters Most
1. **New capabilities for fleet learning** — the big vision is skill-sharing across the fleet: transferring skills between instances, querying the fleet for successes/wins (like `claude insights`), and extracting working agent patterns into reusable plugins
2. **Reliability of existing infrastructure** — health checks, SSH, backups, workspace management need to work solidly as the fleet grows
3. **Developer ergonomics** — CLI is the primary automation surface; MCP server complements it for qualitative/conversational queries

## Tech Stack
- Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4
- SSH2 for instance access, 1Password SDK for secrets
- Vitest (57 unit tests across 8 files), Playwright (33 E2E tests)
- CLI via `bin/reef.ts` (TSX runner)
- WebSocket support via next-ws (xterm terminal)

## Current State
Multi-provider architecture is in place (DO working, AWS planned). Workspaces group instances across accounts. Fleet insights (knowledge aggregation, skill index, HTML report) shipped. MCP server with 9 read-only tools is live. CLI has 30+ commands. Next frontier: skill transfer between instances and extracting working patterns into reusable plugins.

## Known Considerations
- All OpenClaw instances have the same on-disk structure
- Reusable skills should be extracted as plugins (not baked into Reef)
- MCP server (9 read-only tools) complements CLI for qualitative queries (exploration vs action)
- Turbopack doesn't detect file changes on WSL — always restart dev server after changes
- 1Password integration uses Secure Notes with `notesPlain` field for SSH keys
