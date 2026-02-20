# Reef Management Console — Design

**Date:** 2026-02-20
**Status:** Approved

## Overview

Reef is a web-based management console for a small fleet (0–10) of OpenClaw agentic AI instances running on Digital Ocean droplets. It provides a single pane of glass for health monitoring, hygiene/security checks, backups, and direct chat with any OpenClaw agent.

---

## Architecture

**Stack:** Next.js 15 (App Router), TypeScript, Tailwind CSS
**Deployment:** Local (`npm run dev`) or Vercel
**SSH:** Per-request connections via `ssh2` npm package — no persistent tunnels
**Credentials:** `@1password/sdk` fetches secrets at request time from the `AI-Agents` 1Password vault
**Instance discovery:** Digital Ocean Droplets API (filtered by tag `openclaw`)

All business logic lives in `lib/` as framework-agnostic TypeScript modules. Next.js API routes are thin wrappers. This keeps an A→B (Next.js→Express) migration mechanical if ever needed.

---

## Repository Structure

```
reef/
├── app/
│   ├── page.tsx                    # Dashboard — instance card grid
│   ├── instances/[id]/
│   │   ├── page.tsx                # Instance detail + actions
│   │   └── chat/page.tsx           # Chat with OpenClaw agent
│   └── api/
│       ├── instances/route.ts      # GET — discover & resolve all instances
│       └── instances/[id]/
│           ├── health/route.ts     # POST — SSH health check
│           ├── check/route.ts      # POST — OpenClaw hygiene/security check
│           ├── backup/route.ts     # POST — SFTP pull of .openclaw/
│           └── chat/route.ts       # POST — proxy message to OpenClaw agent
├── lib/
│   ├── mapping.ts                  # Droplet name → 1Password item name (placeholder)
│   ├── 1password.ts                # Fetch any secret by op:// ref
│   ├── digitalocean.ts             # List droplets tagged "openclaw"
│   ├── ssh.ts                      # Open connection, run command, SFTP pull
│   ├── openclaw.ts                 # OpenClaw CLI commands + HTTP proxy via SSH tunnel
│   └── instances.ts                # Compose: DO list + mapping + 1P → resolved instances
├── config/
│   └── name-map.json               # Placeholder: { "open-claw-hal": "hal", ... }
├── backups/                        # Local SFTP pulls (gitignored)
└── .env.local                      # OP_SERVICE_ACCOUNT_TOKEN, DO_API_TOKEN_OP_REF
```

---

## Data Model

### Instance (resolved at runtime)
```typescript
interface Instance {
  id: string;          // DO droplet slug
  label: string;       // DO droplet name
  ip: string;          // DO droplet public IP
  sshKey: string;      // SSH private key (fetched from 1Password at request time)
}
```

### 1Password vault: `AI-Agents`
- One item per machine
- Naming convention: `<bot-name> - SSH Private Key` (e.g. `hal - SSH Private Key`)
- Additional item: DO API token

### `.env.local`
```
OP_SERVICE_ACCOUNT_TOKEN=...
DO_API_TOKEN_OP_REF=op://AI-Agents/digital-ocean-api/credential
```

### `config/name-map.json` (v1 placeholder)
```json
{
  "open-claw-hal": "hal",
  "open-claw-marvin": "marvin"
}
```
Maps DO droplet names to 1Password bot names. Marked with TODO for future improvement (DO tags, naming convention, or OpenClaw self-discovery).

---

## Discovery Flow

```
DO API (tag: openclaw)
  → list of { droplet name, IP }
    → name-map.json → bot name
      → 1Password: "AI-Agents/<bot-name> - SSH Private Key"
        → resolved Instance list
```

---

## Pages

| Route | Purpose |
|---|---|
| `/` | Dashboard: card grid, one card per instance. Status indicator, quick action buttons. |
| `/instances/[id]` | Detail view: last health check results, action log for the session. |
| `/instances/[id]/chat` | Full-page chat interface proxied to the OpenClaw agent on that machine. |

---

## API Routes

| Route | Method | What it does |
|---|---|---|
| `/api/instances` | GET | Discover droplets via DO API, resolve credentials, return instance list |
| `/api/instances/[id]/health` | POST | SSH in, check: process running, disk, memory, uptime |
| `/api/instances/[id]/check` | POST | SSH in, run OpenClaw hygiene/security CLI command, return output |
| `/api/instances/[id]/backup` | POST | SSH/SFTP pull of remote `.openclaw/` into `backups/<id>/<timestamp>/` |
| `/api/instances/[id]/chat` | POST | SSH tunnel to OpenClaw local HTTP port, proxy message, return response |

All routes: load instance → fetch SSH key from 1Password → open SSH connection → operate → close → return JSON.

---

## OpenClaw Integration

Two modes:

**CLI via SSH**
Used for health checks and hygiene/security checks. SSH in, run `openclaw <command>`, capture stdout/stderr, return as structured text.

**Agent chat via SSH tunnel**
OpenClaw exposes an HTTP server locally on the droplet. Per-request: open SSH tunnel to `localhost:<openclaw-port>`, POST the message, read response, close tunnel.
> **TODO:** Confirm exact OpenClaw local HTTP port and endpoint format when building `lib/openclaw.ts`.

---

## Future Extension Points

- **DO → 1P name mapping:** Replace `config/name-map.json` with DO droplet tags, a strict naming convention, or OpenClaw self-reporting.
- **OpenClaw "reef reporter" skill:** A skill installed on each instance that returns a structured JSON self-report (config, health, hygiene) in one call.
- **Digital Ocean deeper integration:** Droplet metrics, firewall rules, resize/rebuild actions.
- **Backup destination:** Vercel deployment streams backup as a zip download; local deployment writes to `backups/`.
- **Scale beyond 10:** Connection pooling, bulk operations, pagination.
