# Reef v2 — Design

**Date:** 2026-02-21
**Status:** Approved

## Overview

Reef v2 transforms the flat machine-card dashboard into a sidebar-driven management console with agent-level operations, file viewing/editing, streaming chat, agent migration between machines, and fleet-wide bulk actions.

## Current State

The v1 codebase has:
- 7 API routes (instances, health, check, backup, agents, browse, chat)
- 3 components (MachineRow, AgentRow, DirectoryNode)
- 6 lib modules (mapping, digitalocean, instances, 1password, ssh, openclaw)
- Rich AgentInfo metadata from `openclaw agents list --json` with ls fallback
- Structured ChatResponse from `openclaw agent --agent <id> -m 'msg' --json`
- Working 1Password SSH key resolution and DO droplet discovery by name pattern

## Architecture

Six layers, each independently testable and shippable:

| Layer | Feature | Depends on |
|---|---|---|
| 1 | Layout shell (sidebar + main panel) | Nothing |
| 2 | Agent-level health/hygiene/backup | Layer 1 |
| 3 | File viewer/editor | Layer 1 |
| 4 | Streaming chat | Layer 1 |
| 5 | Agent migration | Layer 2 |
| 6 | Fleet actions (bulk operations) | Layer 2 |

---

## Layer 1: Layout Shell

Two-panel layout with persistent sidebar.

```
┌──────────────────────────────────────────────────┐
│ reef                          [Select All] [Run▾]│
├─────────────┬────────────────────────────────────┤
│             │                                    │
│ ☐ ▾ dot-oc  │   (main panel content changes      │
│   ☐ ● hal   │    based on what's selected)       │
│   ☐ ○ marvin│                                    │
│             │   Views: detail | chat | file |    │
│ ☐ ▸ myri-oc │          fleet                     │
│             │                                    │
└─────────────┴────────────────────────────────────┘
```

**Decisions:**
- Sidebar always visible (no collapse — 0-10 machines doesn't need it)
- Machine > Agent collapsible tree in sidebar
- Clicking an agent sets it as "active" and loads its detail in the main panel
- Checkboxes on each machine/agent for fleet selection (independent from active selection)
- Status dots: green (healthy), red (unhealthy), gray (unchecked)
- Main panel swaps content via conditional rendering based on `view` state
- URL updates via query params (`?agent=hal&machine=dot-openclaw`) for shareability
- Selection + view state in React context — no external state library needed

---

## Layer 2: Agent-Level Operations

Health, hygiene, and backup move from machine level to individual agents.

**New API routes:**

| Route | Method | Purpose |
|---|---|---|
| `/api/instances/[id]/agents/[agentId]/health` | POST | Agent dir exists, size, last activity, process status |
| `/api/instances/[id]/agents/[agentId]/hygiene` | POST | Error count, stale files, dir size |
| `/api/instances/[id]/agents/[agentId]/backup` | POST | Tar agent dir, SFTP pull |

Existing machine-level routes remain as "all agents on this machine" shortcuts.

**Agent detail panel:**

```
┌────────────────────────────────────────┐
│ 🐙 hal                    dot-openclaw │
│ model: claude-sonnet-4-6    ● healthy  │
├────────────────────────────────────────┤
│ [Health] [Hygiene] [Backup] [Chat]     │
│ [Migrate...]                           │
├────────────────────────────────────────┤
│ Last health check: 2 min ago           │
│ Process: running  Disk: 1.2G           │
│ Last activity: 2026-02-21T14:30:00Z    │
├────────────────────────────────────────┤
│ ▾ memories/                            │
│     memory1.md                         │
│ ▾ skills/                              │
│     skill1.md                          │
│   IDENTITY.md                          │
│   SOUL.md                              │
└────────────────────────────────────────┘
```

**lib/openclaw.ts additions:**
- `getAgentHealth(config, agentId)` → `{ exists, dirSize, lastActivity, processRunning }`
- `runAgentHygieneCheck(config, agentId)` → `{ errorCount, staleFileCount, dirSize }`
- `backupAgent(config, agentId, localPath)` → tars just that agent's dir

---

## Layer 3: File Viewer/Editor

Click a file in the directory tree to view it. Edit is a separate explicit action.

**Flow:** Click file → read-only (markdown rendered) → [Raw] toggle → [Edit] button → textarea → [Save] or [Cancel]

**New API routes:**

| Route | Method | Purpose |
|---|---|---|
| `/api/instances/[id]/browse/read` | GET `?path=...` | Read file contents via SSH cat |
| `/api/instances/[id]/browse/write` | POST `{ path, content }` | Write file via SSH |

Both enforce `~/.openclaw/` path prefix. Write additionally rejects `..` traversal.

**Read-only view:** Markdown files rendered with `react-markdown`, with toggle to raw source. Non-markdown files show syntax-highlighted source.

**Edit view:** Plain textarea (no code editor component needed at this scale). Save writes back via SSH, cancel discards.

**Component:** `FileViewer.tsx` handles view/raw/edit states internally.

---

## Layer 4: Streaming Chat

Chat moves from a separate page into the main panel. Responses stream via SSE.

**Architecture:**

```
Browser                    Next.js API              Droplet
  │  POST /chat (SSE)         │  SSH exec             │
  │ ─────────────────────►    │  openclaw agent -m    │
  │  data: {"chunk":"Hi"}     │  ◄──── stdout chunk   │
  │ ◄─────────────────────    │                       │
  │  data: {"done":true}      │  ◄──── stream close   │
  │ ◄─────────────────────    │                       │
```

**Key details:**
- Existing chat route changes from JSON response to SSE stream
- SSH exec stream's `data` events forwarded as SSE chunks
- Conversation history kept client-side in state
- Each message is a separate SSH command — OpenClaw CLI manages its own context
- `lib/openclaw.ts` gets a streaming variant that returns the SSH stream
- Browser consumes via `fetch` with readable stream

---

## Layer 5: Agent Migration

Move agents between machines. Research web for best patterns during implementation.

**UI:** Modal dialog from [Migrate...] button on agent detail:
- Dropdown to select destination machine
- Checkbox: "Delete from source after successful migration"
- Progress indicator while running

**New API route:**

| Route | Method | Purpose |
|---|---|---|
| `/api/instances/[id]/agents/[agentId]/migrate` | POST `{ destinationId, deleteSource }` | Export agent from source, import on destination |

**Implementation strategy:**
1. **Try OpenClaw CLI first:** `openclaw agent export/import` (discover exact commands)
2. **Fallback:** Tar agent dir on source → SFTP pull to reef → SFTP push to destination → untar
3. **Web research** during implementation for established patterns

**lib/openclaw.ts addition:**
- `migrateAgent(sourceConfig, destConfig, agentId, deleteSource)`

---

## Layer 6: Fleet Actions

Checkbox selection + bulk operations with per-agent progress.

**Selection model:**
- Agent checkbox in sidebar
- Machine checkbox selects/deselects all its agents
- "Select All" in header
- Independent from "active" agent selection

**Fleet action bar** (appears when 2+ agents selected):

```
┌────────────────────────────────────────┐
│ 4 agents selected                      │
│ [Health All] [Hygiene All] [Backup All]│
├────────────────────────────────────────┤
│ ● hal (dot-oc)        Health: ✓ OK     │
│ ● marvin (dot-oc)     Health: ⋯        │
│ ○ scout (myri-oc)     Health: ✗ Error  │
│ ● aria (myri-oc)      Health: ✓ OK     │
└────────────────────────────────────────┘
```

**Execution:**
- All agents run concurrently
- Results stream in as each completes
- Per-agent status: pending → running → success/error
- Errors on one agent don't block others
- No new API routes — fires multiple calls to per-agent endpoints from the client

---

## New File Layout

```
app/
├── page.tsx                              # Sidebar + main panel layout
├── components/
│   ├── Sidebar.tsx                       # Machine > Agent tree with checkboxes
│   ├── AgentDetail.tsx                   # Agent info + actions + directory tree
│   ├── FileViewer.tsx                    # View/raw/edit/save
│   ├── ChatPanel.tsx                     # Streaming chat in main panel
│   ├── FleetPanel.tsx                    # Bulk action results
│   ├── MigrateDialog.tsx                 # Migration modal
│   ├── DirectoryNode.tsx                 # (existing, reused)
│   └── context/
│       └── DashboardContext.tsx          # Selection, view state, fleet checks
├── api/instances/[id]/
│   ├── agents/[agentId]/
│   │   ├── health/route.ts              # NEW
│   │   ├── hygiene/route.ts             # NEW
│   │   ├── backup/route.ts              # NEW
│   │   ├── migrate/route.ts             # NEW
│   │   └── chat/route.ts                # MODIFIED (SSE streaming)
│   ├── browse/
│   │   ├── read/route.ts                # NEW
│   │   └── write/route.ts               # NEW
│   └── (existing routes unchanged)
lib/
├── openclaw.ts                           # MODIFIED (agent-level ops, streaming chat, migrate)
└── (other modules unchanged)
```
